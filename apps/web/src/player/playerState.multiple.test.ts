import { describe, expect, it } from 'vitest';
import type { GameStatePayload } from '@lbq/shared';
import {
  initialPlayerState,
  playerReducer,
  playerScreen,
  selectedChoices,
  type PlayerState,
} from './playerState';

const state = (extra: Partial<GameStatePayload> = {}): GameStatePayload => ({
  phase: 'ANSWERING',
  mode: 'solo',
  questionIndex: 0,
  totalQuestions: 2,
  remainingMs: 15_000,
  ...extra,
});

function inMultipleQuestion(index = 0): PlayerState {
  let s: PlayerState = { ...initialPlayerState, playerId: 'me' };
  s = playerReducer(s, { type: 'state', payload: state({ questionIndex: index }), now: 0 });
  return playerReducer(s, {
    type: 'prompt',
    payload: { index, type: 'MCQ', timeLimitSec: 20, choiceCount: 4, multiple: true },
    now: 0,
  });
}

const toggle = (s: PlayerState, choiceIndex: number) =>
  playerReducer(s, { type: 'toggleChoice', questionIndex: s.questionIndex, choiceIndex });

describe('phone, « select all » questions (T37)', () => {
  it('toggles the shapes (sorted), stays on the answer screen until « Valider »', () => {
    let s = inMultipleQuestion();
    expect(selectedChoices(s)).toEqual([]);
    s = toggle(s, 2);
    s = toggle(s, 0);
    s = toggle(s, 3);
    expect(selectedChoices(s)).toEqual([0, 2, 3]);
    s = toggle(s, 3); // untick
    expect(selectedChoices(s)).toEqual([0, 2]);
    expect(playerScreen(s)).toBe('answer');

    // « Valider » sends them all.
    s = playerReducer(s, {
      type: 'answer',
      questionIndex: 0,
      answer: { choiceIndexes: selectedChoices(s) },
    });
    expect(s.myAnswer).toEqual({ questionIndex: 0, choiceIndexes: [0, 2] });
    expect(playerScreen(s)).toBe('answered');
    // Nothing changes once sent.
    expect(selectedChoices(toggle(s, 1))).toEqual([0, 2]);
  });

  it('a refused answer keeps the ticks; a new question starts empty', () => {
    let s = toggle(toggle(inMultipleQuestion(), 1), 2);
    s = playerReducer(s, { type: 'answer', questionIndex: 0, answer: { choiceIndexes: [1, 2] } });
    s = playerReducer(s, { type: 'answerRejected', questionIndex: 0 });
    expect(playerScreen(s)).toBe('answer');
    expect(selectedChoices(s)).toEqual([1, 2]);

    s = playerReducer(s, { type: 'state', payload: state({ questionIndex: 1 }), now: 1 });
    expect(selectedChoices(s)).toEqual([]);
  });

  it('keeps the result fields (right shapes, explanation)', () => {
    let s = inMultipleQuestion();
    s = playerReducer(s, { type: 'state', payload: state({ phase: 'REVEAL' }), now: 2 });
    s = playerReducer(s, {
      type: 'result',
      payload: {
        correct: false,
        pointsEarned: 0,
        streak: 0,
        streakBonus: 0,
        totalScore: 0,
        rank: 1,
        multiple: { correctIndexes: [0, 2] },
        explanation: 'Bleu et rouge.',
      },
    });
    expect(playerScreen(s)).toBe('result');
    expect(s.result).toMatchObject({
      multiple: { correctIndexes: [0, 2] },
      explanation: 'Bleu et rouge.',
    });
  });
});
