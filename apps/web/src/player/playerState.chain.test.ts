import { describe, expect, it } from 'vitest';
import type { GameStatePayload, RemoteAnswerPayload } from '@lbq/shared';
import { initialPlayerState, playerReducer, playerScreen, type PlayerAction } from './playerState';
import { hostReducer, initialHostState, type HostAction } from '../host/hostReducer';
import { initialRemoteState, remoteReducer } from '../remote/remoteState';

const payload = (p: Partial<GameStatePayload> & Pick<GameStatePayload, 'phase'>) =>
  ({ mode: 'solo', questionIndex: -1, totalQuestions: 3, ...p }) as GameStatePayload;

describe('« 🔁 Enchaîner un quiz » (T48)', () => {
  it('phone: a new round goes back to the lobby, keeping who the player is', () => {
    const actions: PlayerAction[] = [
      { type: 'session', playerId: 'p1', nickname: 'Alice', avatar: 'joker', totalScore: 0 },
      { type: 'state', payload: payload({ phase: 'ENDED', questionIndex: 2 }), now: 0 },
      { type: 'podium', top: [{ nickname: 'Alice', avatar: 'joker', score: 900 }] },
    ];
    let s = actions.reduce(playerReducer, { ...initialPlayerState, connected: true });
    s = { ...s, totalScore: 900 };
    expect(playerScreen(s)).toBe('ended');

    s = playerReducer(s, {
      type: 'state',
      payload: payload({ phase: 'LOBBY', round: 2, totalQuestions: 5 }),
      now: 1,
    });
    expect(playerScreen(s)).toBe('lobby');
    expect(s).toMatchObject({
      round: 2,
      playerId: 'p1',
      nickname: 'Alice',
      avatar: 'joker',
      connected: true,
      totalScore: 0,
      podium: null,
      totalQuestions: 5,
    });
  });

  it('TV + remote: a new round starts from a fresh state, without the old answer', () => {
    const old: HostAction[] = [
      { type: 'state', payload: payload({ phase: 'PODIUM', questionIndex: 0 }), now: 0 },
      { type: 'podium', top: [{ nickname: 'Alice', avatar: 'joker', score: 900 }] },
    ];
    let remote = old.reduce(remoteReducer, initialRemoteState);
    remote = remoteReducer(remote, {
      type: 'answer',
      payload: { index: 0, answer: ['Oui'] } as RemoteAnswerPayload,
    });
    const host = old.reduce(hostReducer, initialHostState);
    expect(host.podium).toHaveLength(1);

    const next: HostAction = {
      type: 'state',
      payload: payload({ phase: 'LOBBY', round: 2 }),
      now: 1,
    };
    expect(hostReducer(host, next)).toMatchObject({ round: 2, phase: 'LOBBY', podium: [] });
    remote = remoteReducer(remote, next);
    expect(remote.answer).toBeNull();
    expect(remote.host.round).toBe(2);
  });

  it('the first game:state of a game never resets anything', () => {
    const s = playerReducer(
      { ...initialPlayerState, playerId: 'p1', nickname: 'Bob' },
      { type: 'state', payload: payload({ phase: 'LOBBY', round: 3 }), now: 0 },
    );
    expect(s).toMatchObject({ round: 3, playerId: 'p1', nickname: 'Bob' });
  });
});
