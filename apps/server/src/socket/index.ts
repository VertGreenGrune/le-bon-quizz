import type { Server, Socket } from 'socket.io';
import {
  HostActionPayload,
  HostCreatePayload,
  HostKickPayload,
  HostMovePlayerPayload,
  PlayerAnswerPayload,
  PlayerJoinPayload,
  PlayerRejoinPayload,
  PlayerTeamPayload,
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
import { SESSION_COOKIE } from '../auth/session.js';
import { demoOnlyPersistence, gameRecord, type GamePersistence } from '../game/persistence.js';

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

/** Value of one cookie in a `Cookie` header, or null. */
export function readCookie(header: string | undefined, name: string): string | null {
  for (const part of header?.split(';') ?? []) {
    const eq = part.indexOf('=');
    if (eq < 0 || part.slice(0, eq).trim() !== name) continue;
    const value = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(value) || null;
    } catch {
      return value || null;
    }
  }
  return null;
}

/**
 * Host session token of a socket: the `lbq_session` cookie sent with the handshake (web app,
 * `withCredentials`), or `auth.token` (non-browser clients, tests).
 */
export function handshakeToken(socket: Pick<IoSocket, 'handshake'>): string | null {
  const auth = socket.handshake.auth as { token?: unknown } | undefined;
  if (typeof auth?.token === 'string' && auth.token) return auth.token;
  return readCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
}

export interface SocketDeps {
  games?: GameManager;
  /** Defaults to the demo quiz only, nothing saved (no DB). */
  persistence?: GamePersistence;
}

/** Entry point for all socket handlers (T1). Returns the game registry. */
export function registerSocketHandlers(
  io: IoServer,
  { games = new GameManager(), persistence = demoOnlyPersistence }: SocketDeps = {},
): GameManager {
  const saveOnEnd = (hostId: string | null, dbQuizId: string | null) => (game: Game) => {
    const record = gameRecord(game, hostId, dbQuizId);
    if (!record) return;
    persistence.saveGame(record).catch((err: unknown) => {
      console.error(`Could not save the results of game ${game.pin}`, err);
    });
  };

  setInterval(() => games.sweep(), SWEEP_INTERVAL_MS).unref();

  io.on('connection', (socket) => {
    let session: Session | null = null;

    /** Leaves the game this socket was hosting/playing, if any. */
    const leaveSession = (): void => {
      if (!session) return;
      const game = games.find(session.pin);
      if (session.role === 'host') game?.hostDisconnected(socket.id);
      else game?.disconnect(socket.id);
    };

    const attachHost = (game: Game): void => {
      leaveSession();
      session = { pin: game.pin, role: 'host' };
      void socket.join([roomAll(game.pin), roomHost(game.pin)]);
      game.hostConnected(socket.id);
    };

    /** Checks the host token; (re)attaches this socket as host so a host can reconnect. */
    const asHost = (pin: string, hostToken: string): Game => {
      const game = games.get(pin);
      game.assertHost(hostToken);
      if (session?.pin !== pin || session.role !== 'host') attachHost(game);
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
        async ({ quizId, mode = 'solo', teamCount }) => {
          const token = handshakeToken(socket);
          const hostId = token ? await persistence.authenticate(token) : null;
          const { quiz, dbQuizId } = await persistence.loadQuiz(quizId, hostId);
          const game = games.create(
            quiz,
            (pin) => makeTransport(io, pin),
            { onEnded: saveOnEnd(hostId, dbQuizId) },
            { mode, teamCount },
          );
          attachHost(game);
          return { pin: game.pin, hostToken: game.hostToken };
        },
        // game:state + empty lobby (+ the empty teams in team mode).
        ({ pin }) => games.find(pin)?.resyncHost(socket.id),
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
      'host:moveplayer',
      handler(socket, HostMovePlayerPayload, ({ pin, hostToken, playerId, teamId }) => {
        asHost(pin, hostToken).setTeam(playerId, teamId);
        return {};
      }),
    );

    socket.on(
      'host:shuffle',
      handler(socket, HostActionPayload, ({ pin, hostToken }) => {
        asHost(pin, hostToken).shuffleTeams();
        return {};
      }),
    );

    socket.on(
      'host:rejoin',
      handler(
        socket,
        HostActionPayload,
        ({ pin, hostToken }) => {
          asHost(pin, hostToken);
          return {};
        },
        // After the ack: re-send the current phase to this socket only.
        () => {
          if (session?.role === 'host') games.find(session.pin)?.resyncHost(socket.id);
        },
      ),
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
      'player:team',
      handler(socket, PlayerTeamPayload, ({ pin, teamId }) => {
        const { game, playerId } = asPlayer(pin);
        game.setTeam(playerId, teamId);
        return {};
      }),
    );

    socket.on(
      'player:answer',
      handler(socket, PlayerAnswerPayload, ({ pin, questionIndex, choiceIndex }) => {
        const { game, playerId } = asPlayer(pin);
        game.answer(playerId, questionIndex, choiceIndex);
        return {};
      }),
    );

    socket.on('disconnect', leaveSession);
  });

  return games;
}
