import { describe, expect, it } from 'vitest';
import type { GameStatePayload } from '@lbq/shared';
import { hostReducer, initialHostState } from '../host/hostReducer';
import { followsTheme, initialPlayerState, playerReducer } from '../player/playerState';

const payload = (extra: Partial<GameStatePayload> = {}): GameStatePayload => ({
  phase: 'LOBBY',
  mode: 'solo',
  questionIndex: -1,
  totalQuestions: 3,
  ...extra,
});

describe('theme in the reducers (T40)', () => {
  it('TV: follows game:state.theme, classic when absent', () => {
    const s = hostReducer(initialHostState, {
      type: 'state',
      payload: payload({ theme: 'halloween' }),
      now: 0,
    });
    expect(s.theme).toBe('halloween');
    expect(hostReducer(s, { type: 'state', payload: payload(), now: 0 }).theme).toBe('classic');
  });

  it('phone: follows game:state.theme, classic when absent', () => {
    const s = playerReducer(initialPlayerState, {
      type: 'state',
      payload: payload({ theme: 'christmas' }),
      now: 0,
    });
    expect(s.theme).toBe('christmas');
    expect(playerReducer(s, { type: 'state', payload: payload(), now: 0 }).theme).toBe('classic');
  });

  it('phone: only the waiting screens follow the theme', () => {
    for (const screen of ['lobby', 'getReady', 'answered', 'standings', 'podium'] as const)
      expect(followsTheme(screen)).toBe(true);
    for (const screen of ['answer', 'result', 'kicked', 'lost'] as const)
      expect(followsTheme(screen)).toBe(false);
  });
});
