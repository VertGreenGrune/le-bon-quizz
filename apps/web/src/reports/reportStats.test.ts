import { describe, expect, it } from 'vitest';
import type { GameQuestionReport } from '@lbq/shared';
import {
  averagePercentCorrect,
  formatDuration,
  hardestFirst,
  noAnswerCount,
  percentCorrect,
} from './reportStats';

const q = (
  index: number,
  correctCount: number,
  playerCount: number,
  distribution = [0, 0],
  extra: Partial<GameQuestionReport> = {},
): GameQuestionReport => ({
  index,
  type: 'MCQ',
  text: `Q${index + 1}`,
  choices: distribution.map((_, i) => `c${i}`),
  correctIndexes: [0],
  distribution,
  playerCount,
  correctCount,
  answerCount: distribution.reduce((a, b) => a + b, 0),
  details: {},
  ...extra,
});
const poll = (index: number) =>
  q(index, 0, 4, [3, 1], { type: 'POLL', correctIndexes: [], answerCount: 4 });

describe('reportStats', () => {
  it('computes percent correct over all players, 0 without players', () => {
    expect(percentCorrect(q(0, 1, 3))).toBe(33);
    expect(percentCorrect(q(0, 3, 3))).toBe(100);
    expect(percentCorrect(q(0, 0, 0))).toBe(0);
  });

  it('counts players without an answer', () => {
    expect(noAnswerCount(q(0, 1, 5, [1, 2]))).toBe(2);
    expect(noAnswerCount(q(0, 0, 0, [0, 0]))).toBe(0);
    // Typed / slider answers have no distribution.
    expect(noAnswerCount(q(0, 1, 5, [], { type: 'TYPE_ANSWER', answerCount: 4 }))).toBe(1);
  });

  it('sorts hardest questions first, quiz order on ties', () => {
    const sorted = hardestFirst([q(0, 3, 4), q(1, 1, 4), q(2, 3, 4), q(3, 0, 4)]);
    expect(sorted.map((x) => x.index)).toEqual([3, 1, 0, 2]);
    // Polls (0 correct, but no right answer) go last.
    expect(hardestFirst([poll(0), q(1, 4, 4)]).map((x) => x.index)).toEqual([1, 0]);
  });

  it('averages success rates', () => {
    expect(averagePercentCorrect([])).toBeNull();
    expect(averagePercentCorrect([q(0, 1, 2), q(1, 2, 2)])).toBe(75);
    expect(averagePercentCorrect([q(0, 1, 2), poll(1), q(2, 2, 2)])).toBe(75);
    expect(averagePercentCorrect([poll(0)])).toBeNull();
  });

  it('formats durations', () => {
    const at = (m: number) => new Date(Date.UTC(2026, 9, 20, 10, m)).toISOString();
    expect(formatDuration({ startedAt: at(0), endedAt: null })).toBeNull();
    expect(formatDuration({ startedAt: at(0), endedAt: at(0) })).toBe('< 1 min');
    expect(formatDuration({ startedAt: at(0), endedAt: at(12) })).toBe('12 min');
    expect(formatDuration({ startedAt: at(0), endedAt: at(65) })).toBe('1 h 05');
  });
});
