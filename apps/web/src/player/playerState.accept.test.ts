import { describe, expect, it } from 'vitest';
import type { PlayerResultPayload } from '@lbq/shared';
import { initialPlayerState, playerReducer, playerScreen, type PlayerState } from './playerState';

const result = (extra: Partial<PlayerResultPayload> = {}): PlayerResultPayload => ({
  correct: false,
  pointsEarned: 0,
  streak: 0,
  streakBonus: 0,
  totalScore: 0,
  rank: 2,
  ...extra,
});

describe('phone, answer accepted by the host (T44)', () => {
  it('a second result during the reveal replaces the first one', () => {
    let s: PlayerState = { ...initialPlayerState, playerId: 'me' };
    s = playerReducer(s, {
      type: 'state',
      payload: { phase: 'REVEAL', mode: 'solo', questionIndex: 0, totalQuestions: 2 },
      now: 0,
    });
    s = playerReducer(s, { type: 'result', payload: result() });
    expect(playerScreen(s)).toBe('result');
    s = playerReducer(s, {
      type: 'result',
      payload: result({
        correct: true,
        pointsEarned: 875,
        totalScore: 875,
        rank: 1,
        accepted: true,
      }),
    });
    expect(playerScreen(s)).toBe('result');
    expect(s.result).toMatchObject({ correct: true, pointsEarned: 875, accepted: true });
    expect(s.totalScore).toBe(875);
  });
});
