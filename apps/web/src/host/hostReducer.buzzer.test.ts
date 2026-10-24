import { describe, expect, it } from 'vitest';
import type { GameStatePayload, LobbyMember } from '@lbq/shared';
import { hostReducer, initialHostState, remainingMsAt } from './hostReducer';
import { shouldBuzz } from './sounds';

const alice: LobbyMember = { id: 'a', nickname: 'Alice', avatar: 'batman' };
const answering = (extra: Partial<GameStatePayload> = {}): GameStatePayload => ({
  phase: 'ANSWERING',
  mode: 'solo',
  questionIndex: 1,
  totalQuestions: 3,
  remainingMs: 12_000,
  ...extra,
});

describe('host screen, « Buzzer » questions', () => {
  it('freezes the clock while someone has the hand, then it runs again', () => {
    let s = hostReducer(initialHostState, { type: 'state', payload: answering(), now: 0 });
    expect(remainingMsAt(s, 2_000)).toBe(10_000);
    s = hostReducer(s, {
      type: 'state',
      payload: answering({ remainingMs: 10_000, buzzer: { holder: alice, wrong: [] } }),
      now: 2_000,
    });
    expect(s.buzzer?.holder).toEqual(alice);
    expect(remainingMsAt(s, 60_000)).toBe(10_000);
    s = hostReducer(s, {
      type: 'state',
      payload: answering({ remainingMs: 10_000, buzzer: { wrong: [alice] } }),
      now: 60_000,
    });
    expect(remainingMsAt(s, 61_000)).toBe(9_000);
    expect(s.buzzer).toEqual({ wrong: [alice] });
  });

  it('plays the buzz when a player takes the hand, not on the first state after a reload', () => {
    expect(shouldBuzz(undefined, 'a')).toBe(false);
    expect(shouldBuzz(null, 'a')).toBe(true);
    expect(shouldBuzz('a', 'a')).toBe(false);
    expect(shouldBuzz('a', 'b')).toBe(true);
    expect(shouldBuzz('a', null)).toBe(false);
  });
});
