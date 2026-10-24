import { describe, expect, it } from 'vitest';
import type { GameStatePayload, LobbyMember } from '@lbq/shared';
import { buzzerView, initialPlayerState, playerReducer, type PlayerState } from './playerState';

const me: LobbyMember = { id: 'me', nickname: 'Moi', avatar: 'batman' };
const bob: LobbyMember = { id: 'bob', nickname: 'Bob', avatar: 'robin' };
const state = (extra: Partial<GameStatePayload> = {}): GameStatePayload => ({
  phase: 'ANSWERING',
  mode: 'solo',
  questionIndex: 0,
  totalQuestions: 2,
  remainingMs: 15_000,
  ...extra,
});

function inBuzzerQuestion(): PlayerState {
  let s: PlayerState = { ...initialPlayerState, playerId: 'me' };
  s = playerReducer(s, { type: 'state', payload: state({ buzzer: { wrong: [] } }), now: 0 });
  return playerReducer(s, {
    type: 'prompt',
    payload: { index: 0, type: 'MCQ', timeLimitSec: 20, buzzer: true },
    now: 0,
  });
}

describe('phone, « Buzzer » questions', () => {
  it('BUZZ, then mine / taken / out from game:state.buzzer', () => {
    let s = inBuzzerQuestion();
    expect(buzzerView(s)).toBe('open');
    s = playerReducer(s, {
      type: 'state',
      payload: state({ buzzer: { holder: me, wrong: [] } }),
      now: 1,
    });
    expect(buzzerView(s)).toBe('mine');
    s = playerReducer(s, {
      type: 'state',
      payload: state({ buzzer: { holder: bob, wrong: [me] } }),
      now: 2,
    });
    expect(buzzerView(s)).toBe('out');
    s = playerReducer(s, {
      type: 'state',
      payload: state({ buzzer: { holder: bob, wrong: [] } }),
      now: 3,
    });
    expect(buzzerView(s)).toBe('taken');
  });

  it('the timer is frozen while someone has the hand', () => {
    let s = inBuzzerQuestion();
    expect(s.frozenMs).toBeNull();
    s = playerReducer(s, {
      type: 'state',
      payload: state({ remainingMs: 9_000, buzzer: { holder: bob, wrong: [] } }),
      now: 6_000,
    });
    expect(s.frozenMs).toBe(9_000);
    s = playerReducer(s, {
      type: 'state',
      payload: state({ remainingMs: 9_000, buzzer: { wrong: [bob] } }),
      now: 30_000,
    });
    expect(s.frozenMs).toBeNull();
    expect(s.answeringEndsAt).toBe(39_000);
  });

  it('not a buzzer question: no buzzer view', () => {
    expect(buzzerView(initialPlayerState)).toBeNull();
  });
});
