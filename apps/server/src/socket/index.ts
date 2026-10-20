import type { Server, Socket } from 'socket.io';
import {
  HostActionPayload,
  HostCreatePayload,
  HostKickPayload,
  PlayerAnswerPayload,
  PlayerJoinPayload,
  PlayerRejoinPayload,
  roomAll,
  roomHost,
  type Ack,
  type ClientToServerEvents,
  type ErrorPayload,
  type ServerToClientEvents,
} from '@lbq/shared';
import { GameError } from '../game/errors.js';
import type { Game, GameTransport } from '../game/Game.js';
import { GameManager } from '../game/GameManager.js';
import { loadQuiz } from '../game/quizzes.js';

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents>;
type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const SWEEP_INTERVAL_MS = 60_000;

/** Minimal structural view of a zod schema (avoids a direct zod dependency here). */
interface Schema<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false };
}

/** Who this socket is, within one game. */
type Session = { pin: string; role: 'host' } | { pin: string; role: 'player'; playerId: string };

function toErrorPayload(err: unknown): ErrorPayload {
  if (err instanceof GameError) return err.toPayload();
  console.error(err);
  return { code: 'INVALID_PAYLOAD', message: 'Unexpected server error' };
}

/**
 * Wraps a client → server handler: validates the payload with its zod schema, runs `fn`, and
 * answers through the ack (`Ack<T>`). Errors go to the ack, or to an `error` event when the
 * client sent no ack. `after` runs once the ack is sent (e.g. to push follow-up events).
 */
function handler<P, T extends object>(
  socket: IoSocket,
  schema: Schema<P>,
  fn: (payload: P) => T | Promise<T>,
  after?: (result: T) => void,
) {
  return async (payload: unknown, ack?: unknown): Promise<void> => {
    const reply = (r: Ack<T>) => {
      if (typeof ack === 'function') (ack as (r: Ack<T>) => void)(r);
      else if (!r.ok) socket.emit('error', r.error);
    };
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      reply({ ok: false, error: { code: 'INVALID_PAYLOAD', message: 'Invalid payload' } });
      return;
    }
    let result: T;
    try {
      result = await fn(parsed.data);
    } catch (err) {
      reply({ ok: false, error: toErrorPayload(err) });
      return;
    }
    reply({ ok: true, ...result });
    after?.(result);
  };
}

function makeTransport(io: IoServer, pin: string): GameTransport {
  // socket.io's typed emit doesn't accept a generic event name; the GameTransport signature
  // already guarantees event/payload consistency.
  type AnyEmit = (event: string, ...args: unknown[]) => boolean;
  return {
    toAll: (event, ...args) => void (io.to(roomAll(pin)).emit as AnyEmit)(event, ...args),
    toHost: (event, ...args) => void (io.to(roomHost(pin)).emit as AnyEmit)(event, ...args),
    toSocket: (sid, event, ...args) => void (io.to(sid).emit as AnyEmit)(event, ...args),
    detachSocket: (sid) => io.in(sid).socketsLeave([roomAll(pin), roomHost(pin)]),
  };
}

/** Entry point for all socket handlers (T1). Returns the game registry. */
export function registerSocketHandlers(io: IoServer, games = new GameManager()): GameManager {
  setInterval(() => games.sweep(), SWEEP_INTERVAL_MS).unref();

  io.on('connection', (socket) => {
    let session: Session | null = null;

    /** Checks the host token; (re)attaches this socket as host so a host can reconnect. */
    const asHost = (pin: string, hostToken: string): Game => {
      const game = games.get(pin);
      game.assertHost(hostToken);
      if (session?.pin !== pin || session.role !== 'host') {
        session = { pin, role: 'host' };
        void socket.join([roomAll(pin), roomHost(pin)]);
      }
      return game;
    };

    const asPlayer = (pin: string): { game: Game; playerId: string } => {
      if (!session || session.role !== 'player' || session.pin !== pin)
        throw new GameError('SESSION_NOT_FOUND', 'Rejoins la partie d’abord');
      return { game: games.get(pin), playerId: session.playerId };
    };

    const resyncPlayer = (playerId: string): void => {
      if (!session) return;
      const game = games.find(session.pin);
      const player = game?.players.get(playerId);
      if (game && player) game.resync(player);
    };

    // ---------- Host ----------

    socket.on(
      'host:create',
      handler(
        socket,
        HostCreatePayload,
        async ({ quizId }) => {
          const quiz = await loadQuiz(quizId);
          const game = games.create(quiz, (pin) => makeTransport(io, pin));
          session = { pin: game.pin, role: 'host' };
          await socket.join([roomAll(game.pin), roomHost(game.pin)]);
          return { pin: game.pin, hostToken: game.hostToken };
        },
        ({ pin }) => {
          const game = games.find(pin);
          if (!game) return;
          socket.emit('game:state', game.statePayload());
          socket.emit('lobby:players', { players: [] });
        },
      ),
    );

    socket.on(
      'host:start',
      handler(socket, HostActionPayload, ({ pin, hostToken }) => {
        asHost(pin, hostToken).start();
        return {};
      }),
    );

    socket.on(
      'host:next',
      handler(socket, HostActionPayload, ({ pin, hostToken }) => {
        asHost(pin, hostToken).next();
        return {};
      }),
    );

    socket.on(
      'host:kick',
      handler(socket, HostKickPayload, ({ pin, hostToken, playerId }) => {
        asHost(pin, hostToken).kick(playerId);
        return {};
      }),
    );

    socket.on(
      'host:end',
      handler(socket, HostActionPayload, ({ pin, hostToken }) => {
        asHost(pin, hostToken).end();
        return {};
      }),
    );

    // ---------- Player ----------

    socket.on(
      'player:join',
      handler(
        socket,
        PlayerJoinPayload,
        async ({ pin, nickname }) => {
          const player = games.get(pin).join(nickname, socket.id);
          session = { pin, role: 'player', playerId: player.id };
          await socket.join(roomAll(pin));
          return { playerId: player.id, sessionToken: player.sessionToken };
        },
        ({ playerId }) => resyncPlayer(playerId),
      ),
    );

    socket.on(
      'player:rejoin',
      handler(
        socket,
        PlayerRejoinPayload,
        async ({ pin, sessionToken }) => {
          const player = games.get(pin).rejoin(sessionToken, socket.id);
          session = { pin, role: 'player', playerId: player.id };
          await socket.join(roomAll(pin));
          return { playerId: player.id, nickname: player.nickname, totalScore: player.totalScore };
        },
        ({ playerId }) => resyncPlayer(playerId),
      ),
    );

    socket.on(
      'player:answer',
      handler(socket, PlayerAnswerPayload, ({ pin, questionIndex, choiceIndex }) => {
        const { game, playerId } = asPlayer(pin);
        game.answer(playerId, questionIndex, choiceIndex);
        return {};
      }),
    );

    socket.on('disconnect', () => {
      if (session?.role === 'player') games.find(session.pin)?.disconnect(socket.id);
    });
  });

  return games;
}
