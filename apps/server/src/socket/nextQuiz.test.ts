import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Server } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import {
  DEMO_QUIZ,
  type Ack,
  type ClientToServerEvents,
  type GameStatePayload,
  type ServerToClientEvents,
} from '@lbq/shared';
import { registerSocketHandlers, type IoServer } from './index.js';
import { GameError } from '../game/errors.js';
import type { GamePersistence, GameRecord } from '../game/persistence.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
type Received = { event: string; payload: unknown };

const PRIVATE = { ...DEMO_QUIZ, id: 'mine', title: 'Mon quiz privé' };
const saved: GameRecord[] = [];

/** Host « tok » = user host-1, who owns quiz « mine »; `demo` for everyone. */
const persistence: GamePersistence = {
  authenticate: async (token) => (token === 'tok' ? 'host-1' : null),
  loadQuiz: async (quizId, hostId) => {
    if (quizId === 'demo') return { quiz: DEMO_QUIZ, dbQuizId: null };
    if (quizId === 'mine' && hostId === 'host-1') return { quiz: PRIVATE, dbQuizId: 'mine' };
    throw new GameError('QUIZ_NOT_FOUND', 'Quiz introuvable');
  },
  saveGame: async (r) => void saved.push(r),
};

let http: HttpServer;
let ioServer: IoServer;
let url: string;
const clients: Client[] = [];

beforeAll(async () => {
  http = createServer();
  ioServer = new Server(http);
  registerSocketHandlers(ioServer, { persistence });
  await new Promise<void>((resolve) => http.listen(0, resolve));
  url = `http://localhost:${(http.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const c of clients) c.disconnect();
  await new Promise<void>((resolve) => ioServer.close(() => resolve()));
});

async function client(token?: string): Promise<{ socket: Client; received: Received[] }> {
  const socket: Client = connect(url, {
    transports: ['websocket'],
    forceNew: true,
    ...(token && { auth: { token } }),
  });
  clients.push(socket);
  const received: Received[] = [];
  socket.onAny((event: string, payload: unknown) => received.push({ event, payload }));
  await new Promise<void>((resolve) => socket.on('connect', resolve));
  return { socket, received };
}

function call<T extends object = object>(socket: Client, event: string, payload: unknown) {
  return new Promise<Ack<T>>((resolve) =>
    (socket.emit as (e: string, p: unknown, ack: (r: Ack<T>) => void) => void)(
      event,
      payload,
      resolve,
    ),
  );
}

const settle = () => new Promise((r) => setTimeout(r, 60));
const states = (r: Received[]) =>
  r.filter((e) => e.event === 'game:state').map((e) => e.payload as GameStatePayload);

describe('« Quiz suivant » over sockets (T47)', () => {
  it('starts the next quiz in the same room, from the TV or the remote', async () => {
    const tv = await client('tok');
    const created = await call<{ pin: string; hostToken: string }>(tv.socket, 'host:create', {
      quizId: 'demo',
    });
    if (!created.ok) throw new Error(created.error.message);
    const { pin, hostToken } = created;

    const phone = await client();
    const joined = await call<{ playerId: string; sessionToken: string }>(
      phone.socket,
      'player:join',
      { pin, nickname: 'Alice' },
    );
    if (!joined.ok) throw new Error(joined.error.message);

    // Not while the quiz is being played.
    expect(await call(tv.socket, 'host:start', { pin, hostToken })).toEqual({ ok: true });
    expect(
      await call(tv.socket, 'host:nextquiz', { pin, hostToken, quizId: 'mine' }),
    ).toMatchObject({ ok: false, error: { code: 'GAME_ALREADY_STARTED' } });
    expect(await call(tv.socket, 'host:end', { pin, hostToken })).toEqual({ ok: true });

    // Another host's quiz (or an unknown one) is refused, the room stays as it was.
    expect(
      await call(tv.socket, 'host:nextquiz', { pin, hostToken, quizId: 'other' }),
    ).toMatchObject({ ok: false, error: { code: 'QUIZ_NOT_FOUND' } });

    // A player can't do it.
    expect(
      await call(phone.socket, 'host:nextquiz', { pin, hostToken: 'nope', quizId: 'demo' }),
    ).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });

    // The remote (no session cookie) can: the room's host decides what may be played.
    const paired = await call<{ remoteToken: string }>(tv.socket, 'host:remote', {
      pin,
      hostToken,
    });
    if (!paired.ok) throw new Error(paired.error.message);
    const remote = await client();
    expect(
      await call(remote.socket, 'remote:join', { pin, remoteToken: paired.remoteToken }),
    ).toEqual({ ok: true });
    phone.received.length = 0;
    expect(
      await call(remote.socket, 'host:nextquiz', {
        pin,
        remoteToken: paired.remoteToken,
        quizId: 'mine',
        mode: 'teams',
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(states(phone.received).at(-1)).toMatchObject({
      phase: 'LOBBY',
      mode: 'teams',
      round: 2,
      quizTitle: 'Mon quiz privé',
    });
    expect(phone.received.some((e) => e.event === 'lobby:teams')).toBe(true);

    // The phone, the TV and the remote still act in the new quiz.
    expect(await call(phone.socket, 'player:team', { pin, teamId: 1 })).toEqual({ ok: true });
    expect(
      await call(remote.socket, 'host:shuffle', { pin, remoteToken: paired.remoteToken }),
    ).toEqual({ ok: true });
    const second = await client();
    expect((await call(second.socket, 'player:join', { pin, nickname: 'Bob' })).ok).toBe(true);
    expect(
      await call(remote.socket, 'host:shuffle', { pin, remoteToken: paired.remoteToken }),
    ).toEqual({ ok: true });
    expect(
      await call(remote.socket, 'host:start', { pin, remoteToken: paired.remoteToken }),
    ).toEqual({ ok: true });
    expect(await call(tv.socket, 'host:end', { pin, hostToken })).toEqual({ ok: true });
    await settle();
    // A reloaded phone comes back with its first session token.
    const again = await client();
    expect(
      await call(again.socket, 'player:rejoin', { pin, sessionToken: joined.sessionToken }),
    ).toMatchObject({ ok: true, playerId: joined.playerId });

    // Each quiz played was saved as its own game.
    expect(saved.map((r) => r.quizTitle)).toEqual([DEMO_QUIZ.title, 'Mon quiz privé']);
    expect(saved[1]).toMatchObject({ hostId: 'host-1', quizId: 'mine', mode: 'teams' });
  });

  it('an anonymous host only gets the demo', async () => {
    const tv = await client();
    const created = await call<{ pin: string; hostToken: string }>(tv.socket, 'host:create', {
      quizId: 'demo',
    });
    if (!created.ok) throw new Error(created.error.message);
    const { pin, hostToken } = created;
    expect(await call(tv.socket, 'host:end', { pin, hostToken })).toEqual({ ok: true });
    expect(
      await call(tv.socket, 'host:nextquiz', { pin, hostToken, quizId: 'mine' }),
    ).toMatchObject({ ok: false, error: { code: 'QUIZ_NOT_FOUND' } });
    expect(await call(tv.socket, 'host:nextquiz', { pin, hostToken, quizId: 'demo' })).toEqual({
      ok: true,
    });
  });
});

describe('« ↻ Rejouer ce quiz » (T47)', () => {
  it('replays the same quiz with the same options when no quiz is given', async () => {
    const tv = await client('tok');
    const created = await call<{ pin: string; hostToken: string }>(tv.socket, 'host:create', {
      quizId: 'mine',
      mode: 'survival',
      hearts: 2,
      jokers: true,
      theme: 'retro',
    });
    if (!created.ok) throw new Error(created.error.message);
    const { pin, hostToken } = created;
    expect(await call(tv.socket, 'host:end', { pin, hostToken })).toEqual({ ok: true });
    tv.received.length = 0;
    expect(await call(tv.socket, 'host:nextquiz', { pin, hostToken })).toEqual({ ok: true });
    await settle();
    expect(states(tv.received).at(-1)).toMatchObject({
      phase: 'LOBBY',
      mode: 'survival',
      jokers: true,
      theme: 'retro',
      round: 2,
      quizTitle: 'Mon quiz privé',
    });
    const survival = tv.received.filter((e) => e.event === 'survival:state').at(-1);
    expect(survival?.payload).toMatchObject({ hearts: 2 });
  });
});
