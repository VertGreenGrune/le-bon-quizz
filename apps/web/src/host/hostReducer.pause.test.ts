import { describe, expect, it } from 'vitest';
import type { GameStatePayload, LobbyPlayersPayload } from '@lbq/shared';
import {
  COMEBACK_MS,
  hostReducer,
  initialHostState,
  offlinePlayers,
  remainingMsAt,
  type HostAction,
  type HostGameState,
} from './hostReducer';
import { nicknameList } from './pauseScreens';

const run = (...actions: HostAction[]): HostGameState =>
  actions.reduce(hostReducer, initialHostState);
const state = (payload: Partial<GameStatePayload>, now = 0): HostAction => ({
  type: 'state',
  payload: { phase: 'ANSWERING', mode: 'solo', questionIndex: 0, totalQuestions: 3, ...payload },
  now,
});
const players = (list: LobbyPlayersPayload['players'], now = 0): HostAction => ({
  type: 'players',
  payload: { players: list },
  now,
});
const alice = { id: 'a', nickname: 'Alice', avatar: 'batman' as const };
const bob = { id: 'b', nickname: 'Bob', avatar: 'robin' as const };

describe('host pause', () => {
  it('freezes the clock while paused and remembers since when', () => {
    const s = run(
      state({ remainingMs: 20_000 }, 0),
      state(
        { remainingMs: 12_000, paused: { waitingFor: [bob], hostMissing: false, sinceMs: 500 } },
        10_000,
      ),
    );
    expect(s.deadline).toBeNull();
    expect(remainingMsAt(s, 99_000)).toBe(12_000);
    expect(s.pausedSince).toBe(9_500);

    const counting = hostReducer(
      hostReducer(
        s,
        state(
          { remainingMs: 12_000, paused: { waitingFor: [], hostMissing: false, sinceMs: 5_000 } },
          14_500,
        ),
      ),
      { type: 'resuming', inMs: 3_000, now: 14_500 },
    );
    expect(counting.resumeAt).toBe(17_500);

    const resumed = hostReducer(counting, state({ remainingMs: 12_000 }, 17_500));
    expect(resumed.paused).toBeNull();
    expect(resumed.resumeAt).toBeNull();
    expect(remainingMsAt(resumed, 18_500)).toBe(11_000);
  });

  it('lists offline players and flashes the ones who come back', () => {
    const s = run(players([alice, bob]), players([alice, { ...bob, offline: true }], 1_000));
    expect(offlinePlayers(s).map((p) => p.nickname)).toEqual(['Bob']);
    expect(s.comebacks).toEqual([]);

    const back = hostReducer(s, players([alice, bob], 5_000));
    expect(offlinePlayers(back)).toEqual([]);
    expect(back.comebacks).toEqual([{ ...bob, at: 5_000 }]);

    // Old flashes are dropped on the next update.
    const later = hostReducer(back, players([alice, bob], 5_000 + COMEBACK_MS));
    expect(later.comebacks).toEqual([]);
  });

  it('formats the list of missing players', () => {
    expect(nicknameList([bob])).toBe('Bob');
    expect(nicknameList([alice, bob])).toBe('Alice et Bob');
    expect(nicknameList([alice, bob, { nickname: 'Zoé' }])).toBe('Alice, Bob et Zoé');
  });
});
