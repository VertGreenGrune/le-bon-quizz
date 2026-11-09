import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Server } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import type { Ack, ClientToServerEvents, ServerToClientEvents } from '@lbq/shared';
import { registerSocketHandlers, type IoServer } from './index.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
type Received = { event: string; payload: unknown };

let http: HttpServer;
let ioServer: IoServer;
let url: string;
const clients: Client[] = [];

beforeAll(async () => {
  http = createServer();
  ioServer = new Server(http);
  registerSocketHandlers(ioServer);
  await new Promise<void>((resolve) => http.listen(0, resolve));
  url = `http://localhost:${(http.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const c of clients) c.disconnect();
  await new Promise<void>((resolve) => ioServer.close(() => resolve()));
});

/** A connected client that records every event it receives. */
async function client(): Promise<{ socket: Client; received: Received[] }> {
  const socket: Client = connect(url, { transports: ['websocket'], forceNew: true });
  clients.push(socket);
  const received: Received[] = [];
  socket.onAny((event: string, payload: unknown) => received.push({ event, payload }));
  await new Promise<void>((resolve) => socket.on('connect', resolve));
  return { socket, received };
}

/** Emits with an ack and resolves with the ack (any event, loosely typed for the test). */
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

describe('« Télécommande » over sockets (T39)', () => {
  it('pairs a remote and accepts every host action with its token', async () => {
    const tv = await client();
    const created = await call<{ pin: string; hostToken: string }>(tv.socket, 'host:create', {
      quizId: 'demo',
    });
    if (!created.ok) throw new Error(created.error.message);
    const { pin, hostToken } = created;

    const paired = await call<{ remoteToken: string }>(tv.socket, 'host:remote', {
      pin,
      hostToken,
    });
    if (!paired.ok) throw new Error(paired.error.message);
    const { remoteToken } = paired;
    expect((await call(tv.socket, 'host:remote', { pin, hostToken })).ok).toBe(true);

    const remote = await client();
    const wrong = await call(remote.socket, 'remote:join', { pin, remoteToken: 'nope' });
    expect(wrong).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
    // The TV token isn't a remote token, and TV-only events refuse a remote token.
    expect(await call(remote.socket, 'remote:join', { pin, remoteToken: hostToken })).toMatchObject(
      {
        ok: false,
        error: { code: 'UNAUTHORIZED' },
      },
    );
    expect(await call(remote.socket, 'host:remote', { pin, remoteToken })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD' },
    });
    expect(await call(remote.socket, 'host:rejoin', { pin, remoteToken })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD' },
    });

    expect((await call(remote.socket, 'remote:join', { pin, remoteToken })).ok).toBe(true);
    await settle();
    expect(remote.received.map((r) => r.event)).toEqual(
      expect.arrayContaining(['game:state', 'lobby:players', 'remote:status']),
    );
    expect(tv.received.filter((r) => r.event === 'remote:status').at(-1)?.payload).toEqual({
      remotes: 1,
    });

    const phone = await client();
    const joined = await call<{ playerId: string }>(phone.socket, 'player:join', {
      pin,
      nickname: 'Alice',
    });
    if (!joined.ok) throw new Error(joined.error.message);
    const bob = await client();
    const bobJoined = await call<{ playerId: string }>(bob.socket, 'player:join', {
      pin,
      nickname: 'Bob',
    });
    if (!bobJoined.ok) throw new Error(bobJoined.error.message);

    const auth = { pin, remoteToken };
    expect((await call(remote.socket, 'host:start', auth)).ok).toBe(true);
    await settle();
    expect(remote.received.some((r) => r.event === 'remote:answer')).toBe(true);
    expect(remote.received.some((r) => r.event === 'question:show')).toBe(true);
    expect((await call(remote.socket, 'host:pause', auth)).ok).toBe(true);
    await settle();
    const paused = phone.received.filter((r) => r.event === 'game:state').at(-1)?.payload;
    expect(paused).toMatchObject({ paused: { byHost: true } });
    expect((await call(remote.socket, 'host:resume', auth)).ok).toBe(true);
    // Judge without a buzzer question: authorized, refused for the game reason.
    expect(await call(remote.socket, 'host:judge', { ...auth, correct: true })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD' },
    });
    // « ✅ Accepter » (T44): authorized, refused outside the reveal; one field only; never a player.
    const acceptOne = { ...auth, questionIndex: 0, choiceIndex: 1 };
    expect(await call(remote.socket, 'host:accept', acceptOne)).toMatchObject({
      ok: false,
      error: { code: 'NOT_REVEALING' },
    });
    expect(await call(remote.socket, 'host:accept', { ...acceptOne, text: 'B' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD' },
    });
    expect(
      await call(phone.socket, 'host:accept', { pin, questionIndex: 0, choiceIndex: 1 }),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });
    expect(
      await call(phone.socket, 'host:accept', { ...acceptOne, remoteToken: 'nope' }),
    ).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
    expect((await call(remote.socket, 'host:next', auth)).ok).toBe(true);
    expect(
      (await call(remote.socket, 'host:kick', { ...auth, playerId: bobJoined.playerId })).ok,
    ).toBe(true);

    // TV controls: to the TV only.
    expect((await call(remote.socket, 'remote:tv', { ...auth, action: 'mute' })).ok).toBe(true);
    await settle();
    expect(tv.received.filter((r) => r.event === 'tv:control').map((r) => r.payload)).toEqual([
      { action: 'mute' },
    ]);
    expect(remote.received.some((r) => r.event === 'tv:control')).toBe(false);

    // Neither the TV nor the phones ever get the remote's answer.
    for (const c of [tv, phone, bob])
      expect(c.received.some((r) => r.event === 'remote:answer')).toBe(false);

    // The remote disconnecting doesn't pause the game (it's not the TV).
    remote.socket.disconnect();
    await settle();
    expect(tv.received.filter((r) => r.event === 'remote:status').at(-1)?.payload).toEqual({
      remotes: 0,
    });

    // Revoked: a new token, the old one is refused.
    const remote2 = await client();
    expect((await call(remote2.socket, 'remote:join', auth)).ok).toBe(true);
    const revoked = await call<{ remoteToken: string }>(tv.socket, 'host:remote', {
      pin,
      hostToken,
      revoke: true,
    });
    if (!revoked.ok) throw new Error(revoked.error.message);
    expect(revoked.remoteToken).not.toBe(remoteToken);
    await settle();
    expect(remote2.received.some((r) => r.event === 'remote:revoked')).toBe(true);
    expect(await call(remote2.socket, 'host:next', auth)).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHORIZED' },
    });
    // No more host events for a revoked remote.
    const before = remote2.received.length;
    expect((await call(tv.socket, 'host:next', { pin, hostToken })).ok).toBe(true);
    await settle();
    expect(remote2.received.length).toBe(before);
    // The new token works (re-scanned QR code), on the same socket.
    expect(
      (await call(remote2.socket, 'remote:join', { pin, remoteToken: revoked.remoteToken })).ok,
    ).toBe(true);

    expect(
      (await call(remote2.socket, 'host:end', { pin, remoteToken: revoked.remoteToken })).ok,
    ).toBe(true);
  });

  it('team lobby actions with a remote token', async () => {
    const tv = await client();
    const created = await call<{ pin: string; hostToken: string }>(tv.socket, 'host:create', {
      quizId: 'demo',
      mode: 'teams',
    });
    if (!created.ok) throw new Error(created.error.message);
    const { pin, hostToken } = created;
    const paired = await call<{ remoteToken: string }>(tv.socket, 'host:remote', {
      pin,
      hostToken,
    });
    if (!paired.ok) throw new Error(paired.error.message);
    const remote = await client();
    const auth = { pin, remoteToken: paired.remoteToken };
    expect((await call(remote.socket, 'remote:join', auth)).ok).toBe(true);
    const phone = await client();
    const joined = await call<{ playerId: string }>(phone.socket, 'player:join', {
      pin,
      nickname: 'Alice',
    });
    if (!joined.ok) throw new Error(joined.error.message);
    expect((await call(remote.socket, 'host:shuffle', auth)).ok).toBe(true);
    expect(
      (
        await call(remote.socket, 'host:moveplayer', {
          ...auth,
          playerId: joined.playerId,
          teamId: 1,
        })
      ).ok,
    ).toBe(true);
    await settle();
    const players = remote.received.filter((r) => r.event === 'lobby:players').at(-1)?.payload;
    expect(players).toMatchObject({ players: [{ nickname: 'Alice', teamId: 1 }] });
  });
});

describe('« 📺 Afficher sur la TV » over sockets (T47)', () => {
  it('hands the host screen over to the /tv page showing the code', async () => {
    const pc = await client();
    const created = await call<{ pin: string; hostToken: string }>(pc.socket, 'host:create', {
      quizId: 'demo',
    });
    if (!created.ok) throw new Error(created.error.message);
    const { pin, hostToken } = created;

    const tv = await client();
    const reg = await call<{ code: string }>(tv.socket, 'tv:register', {});
    if (!reg.ok) throw new Error(reg.error.message);
    expect(reg.code).toMatch(/^\d{4}$/);
    // Same socket, same code (e.g. the page re-registers).
    expect(await call(tv.socket, 'tv:register', {})).toMatchObject({ ok: true, code: reg.code });

    const wrongCode = reg.code === '0000' ? '0001' : '0000';
    expect(await call(pc.socket, 'host:cast', { pin, hostToken, code: wrongCode })).toMatchObject({
      ok: false,
      error: { code: 'TV_NOT_FOUND' },
    });
    expect(
      await call(pc.socket, 'host:cast', { pin, hostToken: 'nope', code: reg.code }),
    ).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });

    expect(await call(pc.socket, 'host:cast', { pin, hostToken, code: reg.code })).toEqual({
      ok: true,
    });
    await settle();
    expect(tv.received).toContainEqual({ event: 'tv:paired', payload: { pin, hostToken } });
    // The code is used up.
    expect(await call(pc.socket, 'host:cast', { pin, hostToken, code: reg.code })).toMatchObject({
      ok: false,
      error: { code: 'TV_NOT_FOUND' },
    });
    // The TV then attaches as the host screen.
    expect(await call(tv.socket, 'host:rejoin', { pin, hostToken })).toEqual({ ok: true });
    await settle();
    expect(tv.received.some((r) => r.event === 'game:state')).toBe(true);
  });
});
