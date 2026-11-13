import type { Server, Socket } from 'socket.io';
import {
  HostAcceptPayload,
  HostCastPayload,
  HostChainPayload,
  HostActionPayload,
  HostCreatePayload,
  HostJudgePayload,
  HostKickPayload,
  HostMovePlayerPayload,
  HostRemotePayload,
  HostTokenPayload,
  PlayerAnswerPayload,
  PlayerAvatarsPayload,
  PlayerBidPayload,
  PlayerBuzzPayload,
  PlayerUnanswerPayload,
  PlayerDrawPayload,
  PlayerHauntPayload,
  PlayerJoinPayload,
  PlayerJokerPayload,
  PlayerRejoinPayload,
  PlayerTeamPayload,
  RemoteJoinPayload,
  RemoteTvPayload,
  TvRegisterPayload,
  roomAll,
  roomHost,
  type Ack,
  type ClientToServerEvents,
  type ErrorPayload,
  type JokerType,
  type PlayerJoinAck,
  type Quiz,
  type ServerToClientEvents,
} from '@lbq/shared';
import { GameError } from '../game/errors.js';
import type { Game, GameTransport } from '../game/Game.js';
import { GameManager } from '../game/GameManager.js';
import { SESSION_COOKIE } from '../auth/session.js';
import { TvPairing } from './tvPairing.js';
import { demoOnlyPersistence, gameRecord, type GamePersistence } from '../game/persistence.js';

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents>;
type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const SWEEP_INTERVAL_MS = 60_000;

/** Minimal structural view of a zod schema (avoids a direct zod dependency here). */
interface Schema<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false };
}

/** Who this socket is, within one game. */
type Session =
  { pin: string; role: 'host' | 'remote' } | { pin: string; role: 'player'; playerId: string };

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
  /** Games with jokers start with this hand instead of a random one (e2e tests only). */
  jokerHand?: JokerType[];
}

/** Entry point for all socket handlers (T1). Returns the game registry. */
export function registerSocketHandlers(
  io: IoServer,
  { games = new GameManager(), persistence = demoOnlyPersistence, jokerHand }: SocketDeps = {},
): GameManager {
  const saveOnEnd = (hostId: string | null, dbQuizId: string | null) => (game: Game) => {
    const record = gameRecord(game, hostId, dbQuizId);
    if (!record) return;
    persistence.saveGame(record).catch((err: unknown) => {
      console.error(`Could not save the results of game ${game.pin}`, err);
    });
  };

  setInterval(() => games.sweep(), SWEEP_INTERVAL_MS).unref();
  const tvs = new TvPairing();

  io.on('connection', (socket) => {
    let session: Session | null = null;

    /** Leaves the game this socket was hosting/playing, if any. */
    const leaveSession = (): void => {
      if (!session) return;
      const game = games.find(session.pin);
      if (session.role === 'host') game?.hostDisconnected(socket.id);
      else if (session.role === 'remote') game?.remoteDisconnected(socket.id);
      else game?.disconnect(socket.id);
    };

    /** « Télécommande »: the host rooms (host events), but never counted as the TV. */
    const attachRemote = (game: Game): void => {
      leaveSession();
      session = { pin: game.pin, role: 'remote' };
      void socket.join([roomAll(game.pin), roomHost(game.pin)]);
      game.remoteConnected(socket.id);
    };

    const asRemote = (pin: string, remoteToken: string, { attach = false } = {}): Game => {
      const game = games.get(pin);
      game.assertRemote(remoteToken);
      if (attach || session?.pin !== pin || session.role !== 'remote') attachRemote(game);
      return game;
    };

    /** A host action: the TV's `hostToken` or a paired remote's `remoteToken`. */
    const asController = (
      p: { pin: string } & ({ hostToken: string } | { remoteToken: string }),
    ): Game => ('hostToken' in p ? asHost(p.pin, p.hostToken) : asRemote(p.pin, p.remoteToken));

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
        async ({ quizId, mode = 'solo', teamCount, jokers, hearts, theme, test, questions }) => {
          const token = handshakeToken(socket);
          const hostId = token ? await persistence.authenticate(token) : null;
          const loaded = await persistence.loadQuiz(quizId, hostId);
          const quiz = pickQuestions(loaded.quiz, questions);
          const game = games.create(
            quiz,
            (pin) => makeTransport(io, pin),
            // « 🧪 Tester » (T66): a test game is never saved (so never counted as played).
            { onEnded: test ? undefined : saveOnEnd(hostId, loaded.dbQuizId) },
            { mode, teamCount, jokers, jokerHand, hearts, theme, ownerId: hostId, test },
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
      handler(socket, HostActionPayload, (p) => {
        asController(p).start();
        return {};
      }),
    );

    socket.on(
      'host:next',
      handler(socket, HostActionPayload, (p) => {
        asController(p).next();
        return {};
      }),
    );

    socket.on(
      'host:kick',
      handler(socket, HostKickPayload, (p) => {
        asController(p).kick(p.playerId);
        return {};
      }),
    );

    socket.on(
      'host:moveplayer',
      handler(socket, HostMovePlayerPayload, (p) => {
        asController(p).setTeam(p.playerId, p.teamId);
        return {};
      }),
    );

    socket.on(
      'host:shuffle',
      handler(socket, HostActionPayload, (p) => {
        asController(p).shuffleTeams();
        return {};
      }),
    );

    socket.on(
      'host:rejoin',
      handler(
        socket,
        HostTokenPayload,
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
      'host:pause',
      handler(socket, HostActionPayload, (p) => {
        asController(p).pauseByHost();
        return {};
      }),
    );

    socket.on(
      'host:resume',
      handler(socket, HostActionPayload, (p) => {
        asController(p).resume();
        return {};
      }),
    );

    socket.on(
      'host:judge',
      handler(socket, HostJudgePayload, (p) => {
        asController(p).judge(p.correct);
        return {};
      }),
    );

    socket.on(
      'host:accept',
      handler(socket, HostAcceptPayload, (p) => {
        const { choiceIndex, text, margin } = p;
        asController(p).accept(p.questionIndex, { choiceIndex, text, margin });
        return {};
      }),
    );

    socket.on(
      'host:end',
      handler(socket, HostActionPayload, (p) => {
        asController(p).end();
        return {};
      }),
    );

    socket.on(
      'host:remote',
      handler(socket, HostRemotePayload, ({ pin, hostToken, revoke }) => ({
        remoteToken: asHost(pin, hostToken).remoteTokenFor(!!revoke),
      })),
    );

    socket.on(
      'host:cast',
      handler(socket, HostCastPayload, ({ pin, hostToken, code }) => {
        asHost(pin, hostToken);
        const tv = tvs.claim(code, socket.id);
        io.to(tv).emit('tv:paired', { pin, hostToken });
        return {};
      }),
    );

    // ---------- « 🔁 Enchaîner un quiz » (T48) ----------

    socket.on(
      'host:quizzes',
      handler(socket, HostActionPayload, async (p) => ({
        quizzes: await persistence.listQuizzes(asController(p).ownerId),
      })),
    );

    socket.on(
      'host:chain',
      handler(socket, HostChainPayload, async (p) => {
        const game = asController(p);
        if (game.phase !== 'PODIUM' && game.phase !== 'ENDED')
          throw new GameError('GAME_ALREADY_STARTED', 'Termine d’abord ce quiz');
        const { quizId, mode = 'solo', teamCount, jokers, hearts, theme } = p;
        const { quiz, dbQuizId } = await persistence.loadQuiz(quizId, game.ownerId);
        games.chain(
          game.pin,
          quiz,
          (pin) => makeTransport(io, pin),
          { onEnded: saveOnEnd(game.ownerId, dbQuizId) },
          { mode, teamCount, jokers, jokerHand, hearts, theme, ownerId: game.ownerId },
        );
        return {};
      }),
    );

    // ---------- « 📺 Afficher sur la TV » (T47) ----------

    socket.on(
      'tv:register',
      handler(socket, TvRegisterPayload, ({ code }) => ({ code: tvs.register(socket.id, code) })),
    );

    // ---------- « Télécommande » (T39) ----------

    socket.on(
      'remote:join',
      handler(
        socket,
        RemoteJoinPayload,
        ({ pin, remoteToken }) => {
          asRemote(pin, remoteToken, { attach: true });
          return {};
        },
        () => {
          if (session?.role === 'remote') games.find(session.pin)?.resyncRemote(socket.id);
        },
      ),
    );

    socket.on(
      'remote:tv',
      handler(socket, RemoteTvPayload, ({ pin, remoteToken, action }) => {
        asRemote(pin, remoteToken).tvControl(action);
        return {};
      }),
    );

    // ---------- Player ----------

    socket.on(
      'player:join',
      handler(
        socket,
        PlayerJoinPayload,
        async ({ pin, nickname, avatar }): Promise<PlayerJoinAck> => {
          const game = games.get(pin);
          // Started game: only takes the place of a disconnected player with that nickname.
          const reclaimed = game.phase !== 'LOBBY';
          const player = reclaimed
            ? game.reclaim(nickname, socket.id)
            : game.join(nickname, socket.id, avatar);
          leaveSession();
          session = { pin, role: 'player', playerId: player.id };
          await socket.join(roomAll(pin));
          const ack = {
            playerId: player.id,
            sessionToken: player.sessionToken,
            avatar: player.avatar,
          };
          return reclaimed
            ? {
                ...ack,
                reclaimed: true,
                nickname: player.nickname,
                totalScore: player.totalScore,
              }
            : ack;
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
          return {
            playerId: player.id,
            nickname: player.nickname,
            avatar: player.avatar,
            totalScore: player.totalScore,
          };
        },
        ({ playerId }) => resyncPlayer(playerId),
      ),
    );

    socket.on(
      'player:avatars',
      handler(socket, PlayerAvatarsPayload, ({ pin }) => {
        const game = games.get(pin);
        return { taken: game.takenAvatars(), started: game.phase !== 'LOBBY' };
      }),
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
      handler(socket, PlayerAnswerPayload, ({ pin, questionIndex, ...answer }) => {
        const { game, playerId } = asPlayer(pin);
        return game.answer(playerId, questionIndex, answer);
      }),
    );

    socket.on(
      'player:unanswer',
      handler(socket, PlayerUnanswerPayload, ({ pin, questionIndex }) => {
        const { game, playerId } = asPlayer(pin);
        return game.unanswer(playerId, questionIndex);
      }),
    );

    socket.on(
      'player:draw',
      handler(socket, PlayerDrawPayload, ({ pin, questionIndex, strokes, clear }) => {
        const { game, playerId } = asPlayer(pin);
        game.draw(playerId, questionIndex, strokes, !!clear);
        return {};
      }),
    );

    socket.on(
      'player:buzz',
      handler(socket, PlayerBuzzPayload, ({ pin, questionIndex }) => {
        const { game, playerId } = asPlayer(pin);
        game.buzz(playerId, questionIndex);
        return {};
      }),
    );

    socket.on(
      'player:bid',
      handler(socket, PlayerBidPayload, ({ pin, questionIndex, amount }) => {
        const { game, playerId } = asPlayer(pin);
        return game.bid(playerId, questionIndex, amount);
      }),
    );

    socket.on(
      'player:joker',
      handler(socket, PlayerJokerPayload, ({ pin, questionIndex, joker, targetId }) => {
        const { game, playerId } = asPlayer(pin);
        game.useJoker(playerId, questionIndex, joker, targetId);
        return {};
      }),
    );

    socket.on(
      'player:haunt',
      handler(socket, PlayerHauntPayload, ({ pin, haunt, targetId }) => {
        const { game, playerId } = asPlayer(pin);
        game.haunt(playerId, haunt, targetId);
        return {};
      }),
    );

    socket.on('disconnect', () => {
      leaveSession();
      tvs.disconnected(socket.id);
    });
  });

  return games;
}

/** « 🧪 Tester » (T66): only the chosen questions, in that order (unknown indexes refused). */
export function pickQuestions(quiz: Quiz, indexes: number[] | undefined): Quiz {
  if (!indexes) return quiz;
  const questions = indexes.map((i) => quiz.questions[i]);
  if (questions.some((q) => !q))
    throw new GameError('INVALID_PAYLOAD', 'Cette question n’existe pas (enregistre le quiz)');
  return { ...quiz, questions: questions as Quiz['questions'] };
}
