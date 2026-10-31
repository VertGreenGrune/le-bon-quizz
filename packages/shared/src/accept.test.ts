import { describe, expect, it } from 'vitest';
import { acceptKind, acceptedChoiceIndexes } from './accept.js';
import { HostAcceptPayload } from './events.js';
import type { Question } from './quiz.js';

const base = { text: 'Q', timeLimitSec: 20, basePoints: 1000 } as const;
const mcq: Question = {
  ...base,
  type: 'MCQ',
  choices: [
    { text: 'A', isCorrect: true },
    { text: 'B', isCorrect: false },
    { text: 'C', isCorrect: false },
  ],
};

describe('« ✅ Accepter » (T44)', () => {
  it('only the types with an answer to fix, never au buzzer', () => {
    expect(acceptKind(mcq)).toBe('choice');
    expect(acceptKind({ type: 'TRUE_FALSE' })).toBe('choice');
    expect(acceptKind({ type: 'TYPE_ANSWER' })).toBe('text');
    expect(acceptKind({ type: 'SLIDER' })).toBe('margin');
    for (const type of ['POLL', 'ORDER', 'PIN', 'BLUFF', 'DRAW', 'WHO_OF_US'] as const)
      expect(acceptKind({ type })).toBeNull();
    expect(acceptKind({ ...mcq, buzzer: true })).toBeNull();
  });

  it('adds the accepted choices to the right ones', () => {
    expect(acceptedChoiceIndexes(mcq)).toEqual([0]);
    expect(acceptedChoiceIndexes(mcq, { choiceIndexes: [2, 0] })).toEqual([0, 2]);
  });

  it('payload: exactly one of choiceIndex, text, margin, with a host or remote token', () => {
    const p = { pin: '123456', hostToken: 't', questionIndex: 0 };
    expect(HostAcceptPayload.safeParse({ ...p, choiceIndex: 1 }).success).toBe(true);
    expect(HostAcceptPayload.safeParse({ ...p, text: ' Atlantique ' }).data).toMatchObject({
      text: 'Atlantique',
    });
    expect(
      HostAcceptPayload.safeParse({ pin: '123456', remoteToken: 'r', questionIndex: 0, margin: 5 })
        .success,
    ).toBe(true);
    expect(HostAcceptPayload.safeParse(p).success).toBe(false);
    expect(HostAcceptPayload.safeParse({ ...p, choiceIndex: 1, text: 'B' }).success).toBe(false);
    expect(HostAcceptPayload.safeParse({ ...p, margin: 0 }).success).toBe(false);
    expect(HostAcceptPayload.safeParse({ ...p, choiceIndex: 4 }).success).toBe(false);
    expect(
      HostAcceptPayload.safeParse({ pin: '123456', questionIndex: 0, choiceIndex: 1 }).success,
    ).toBe(false);
  });
});
