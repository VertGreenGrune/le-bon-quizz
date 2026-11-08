import { describe, expect, it } from 'vitest';
import type { GameStatePayload } from '@lbq/shared';
import { hostReducer, initialHostState } from './hostReducer';
import { initialPlayerState, playerReducer } from '../player/playerState';

const payload = (extra: Partial<GameStatePayload> = {}): GameStatePayload => ({
  phase: 'LOBBY',
  mode: 'solo',
  questionIndex: -1,
  totalQuestions: 3,
  ...extra,
});

describe('quiz title in the reducers (T47)', () => {
  it('TV and phone keep game:state.quizTitle', () => {
    const tv = hostReducer(initialHostState, {
      type: 'state',
      payload: payload({ quizTitle: 'Harry Potter' }),
      now: 0,
    });
    expect(tv.quizTitle).toBe('Harry Potter');
    const phone = playerReducer(initialPlayerState, {
      type: 'state',
      payload: payload({ quizTitle: 'Harry Potter' }),
      now: 0,
    });
    expect(phone.quizTitle).toBe('Harry Potter');
  });

  it('is empty until known and kept when a payload has none', () => {
    expect(initialHostState.quizTitle).toBe('');
    const tv = hostReducer(initialHostState, {
      type: 'state',
      payload: payload({ quizTitle: 'Batman' }),
      now: 0,
    });
    expect(hostReducer(tv, { type: 'state', payload: payload(), now: 0 }).quizTitle).toBe('Batman');
  });
});
