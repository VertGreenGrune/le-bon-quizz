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
  type: 'MCQ' as const,
  text: `Q${index}`,
  choices: ['a', 'b', 'c', 'd'],
  timeLimitSec: 20,
});

describe('hostReducer', () => {
  it('turns remainingMs into a local deadline, and clears it for untimed phases', () => {
    const s1 = run([
      {
        type: 'state',
        payload: {
          phase: 'ANSWERING',
          mode: 'solo',
          questionIndex: 0,
          totalQuestions: 3,
          remainingMs: 5000,
        },
        now: 1000,
      },
    ]);
    expect(s1.deadline).toBe(6000);
    const s2 = hostReducer(s1, {
      type: 'state',
      payload: { phase: 'REVEAL', mode: 'solo', questionIndex: 0, totalQuestions: 3 },
      now: 7000,
    });
    expect(s2.deadline).toBeNull();
  });

  it('resets answer count and reveal when the question changes, not within a question', () => {
    const s = run([
      { type: 'players', payload: { players: [{ id: 'a', nickname: 'A' }] } },
      {
        type: 'state',
        payload: { phase: 'ANSWERING', mode: 'solo', questionIndex: 0, totalQuestions: 2 },
        now: 0,
      },
      { type: 'count', answered: 1, total: 1 },
      { type: 'reveal', payload: { type: 'MCQ', correctIndexes: [1], distribution: [0, 1, 0, 0] } },
      {
        type: 'state',
        payload: { phase: 'REVEAL', mode: 'solo', questionIndex: 0, totalQuestions: 2 },
        now: 0,
      },
    ]);
    expect(s.answered).toBe(1);
    expect(s.reveal).not.toBeNull();

    const next = hostReducer(s, {
      type: 'state',
      payload: { phase: 'QUESTION_INTRO', mode: 'solo', questionIndex: 1, totalQuestions: 2 },
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
        payload: { phase: 'QUESTION_INTRO', mode: 'solo', questionIndex: 1, totalQuestions: 2 },
        now: 0,
      },
    ]);
    expect(currentQuestion(before)?.text).toBe('Q1');

    const stale = run([
      { type: 'question', payload: question(0) },
      {
        type: 'state',
        payload: { phase: 'QUESTION_INTRO', mode: 'solo', questionIndex: 1, totalQuestions: 2 },
        now: 0,
      },
    ]);
    expect(currentQuestion(stale)).toBeNull();
  });

  it('rebuilds a REVEAL screen from a host:rejoin resync on a fresh page', () => {
    const s = run([
      {
        type: 'state',
        payload: { phase: 'REVEAL', mode: 'solo', questionIndex: 1, totalQuestions: 2 },
        now: 0,
      },
      { type: 'players', payload: { players: [{ id: 'a', nickname: 'Alice' }] } },
      { type: 'question', payload: question(1) },
      { type: 'count', answered: 1, total: 1 },
      { type: 'reveal', payload: { type: 'MCQ', correctIndexes: [0], distribution: [1, 0] } },
    ]);
    expect(currentQuestion(s)?.text).toBe('Q1');
    expect(s).toMatchObject({ phase: 'REVEAL', answered: 1, answerTotal: 1 });
    expect(s.reveal?.distribution).toEqual([1, 0]);
  });

  it('detects the last question', () => {
    const s = run([
      {
        type: 'state',
        payload: { phase: 'LEADERBOARD', mode: 'solo', questionIndex: 1, totalQuestions: 2 },
        now: 0,
      },
    ]);
    expect(isLastQuestion(s)).toBe(true);
  });

  it('keeps the previous leaderboard for the re-ordering animation, not on a resync', () => {
    const at = (questionIndex: number): HostAction => ({
      type: 'state',
      payload: { phase: 'LEADERBOARD', mode: 'solo', questionIndex, totalQuestions: 3 },
      now: 0,
    });
    const first = [{ nickname: 'A', score: 900 }];
    const second = [
      { nickname: 'B', score: 1800 },
      { nickname: 'A', score: 900 },
    ];
    const s1 = run([at(0), { type: 'leaderboard', top: first }]);
    expect(s1.previousLeaderboard).toEqual([]);
    const s2 = run([at(1), { type: 'leaderboard', top: second }], s1);
    expect(s2.previousLeaderboard).toEqual(first);
    expect(s2.leaderboard).toEqual(second);
    // host:rejoin re-sends the same question's leaderboard
    const s3 = hostReducer(s2, { type: 'leaderboard', top: second });
    expect(s3.previousLeaderboard).toEqual(first);
  });
});
