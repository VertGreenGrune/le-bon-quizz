import { describe, expect, it } from 'vitest';
import {
  currentQuestion,
  hostReducer,
  initialHostState,
  isLastQuestion,
  type HostAction,
  type HostGameState,
} from './hostReducer';

const run = (actions: HostAction[], from: HostGameState = initialHostState) =>
  actions.reduce(hostReducer, from);

const question = (index: number) => ({
  index,
  text: `Q${index}`,
  choices: ['a', 'b', 'c', 'd'],
  timeLimitSec: 20,
});

describe('hostReducer', () => {
  it('turns remainingMs into a local deadline, and clears it for untimed phases', () => {
    const s1 = run([
      {
        type: 'state',
        payload: { phase: 'ANSWERING', questionIndex: 0, totalQuestions: 3, remainingMs: 5000 },
        now: 1000,
      },
    ]);
    expect(s1.deadline).toBe(6000);
    const s2 = hostReducer(s1, {
      type: 'state',
      payload: { phase: 'REVEAL', questionIndex: 0, totalQuestions: 3 },
      now: 7000,
    });
    expect(s2.deadline).toBeNull();
  });

  it('resets answer count and reveal when the question changes, not within a question', () => {
    const s = run([
      { type: 'players', payload: { players: [{ id: 'a', nickname: 'A' }] } },
      {
        type: 'state',
        payload: { phase: 'ANSWERING', questionIndex: 0, totalQuestions: 2 },
        now: 0,
      },
      { type: 'count', answered: 1, total: 1 },
      { type: 'reveal', payload: { correctIndexes: [1], distribution: [0, 1, 0, 0] } },
      { type: 'state', payload: { phase: 'REVEAL', questionIndex: 0, totalQuestions: 2 }, now: 0 },
    ]);
    expect(s.answered).toBe(1);
    expect(s.reveal).not.toBeNull();

    const next = hostReducer(s, {
      type: 'state',
      payload: { phase: 'QUESTION_INTRO', questionIndex: 1, totalQuestions: 2 },
      now: 0,
    });
    expect(next.answered).toBe(0);
    expect(next.answerTotal).toBe(1);
    expect(next.reveal).toBeNull();
  });

  it('accepts question:show before or after the matching game:state', () => {
    const before = run([
      { type: 'question', payload: question(1) },
      {
        type: 'state',
        payload: { phase: 'QUESTION_INTRO', questionIndex: 1, totalQuestions: 2 },
        now: 0,
      },
    ]);
    expect(currentQuestion(before)?.text).toBe('Q1');

    const stale = run([
      { type: 'question', payload: question(0) },
      {
        type: 'state',
        payload: { phase: 'QUESTION_INTRO', questionIndex: 1, totalQuestions: 2 },
        now: 0,
      },
    ]);
    expect(currentQuestion(stale)).toBeNull();
  });

  it('detects the last question', () => {
    const s = run([
      {
        type: 'state',
        payload: { phase: 'LEADERBOARD', questionIndex: 1, totalQuestions: 2 },
        now: 0,
      },
    ]);
    expect(isLastQuestion(s)).toBe(true);
  });
});
