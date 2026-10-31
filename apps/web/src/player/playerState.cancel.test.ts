import { describe, expect, it } from 'vitest';
import { MAX_ANSWER_CANCELS, type QuestionPromptPayload } from '@lbq/shared';
import {
  canCancelAnswer,
  initialPlayerState,
  playerReducer,
  playerScreen,
  selectedChoices,
  type PlayerAction,
  type PlayerState,
} from './playerState';

const prompt = (extra: Partial<QuestionPromptPayload> = {}): QuestionPromptPayload => ({
  index: 0,
  type: 'MCQ',
  timeLimitSec: 20,
  choiceCount: 4,
  ...extra,
});

function answering(p = prompt()): PlayerState {
  const actions: PlayerAction[] = [
    {
      type: 'state',
      payload: { phase: 'ANSWERING', mode: 'solo', questionIndex: 0, totalQuestions: 3 },
      now: 0,
    },
    { type: 'prompt', payload: p, now: 0 },
  ];
  return actions.reduce(playerReducer, initialPlayerState);
}

describe('« Annuler ma réponse » (T43)', () => {
  it('offered after answering; a cancel goes back to the answer screen', () => {
    let s = answering();
    expect(canCancelAnswer(s)).toBe(false);
    s = playerReducer(s, { type: 'answer', questionIndex: 0, answer: { choiceIndex: 2 } });
    expect(playerScreen(s)).toBe('answered');
    expect(canCancelAnswer(s)).toBe(true);
    s = playerReducer(s, { type: 'answerCancelled', questionIndex: 0, cancelsLeft: 2 });
    expect(s.myAnswer).toBeNull();
    expect(playerScreen(s)).toBe('answer');
    // A new answer is accepted (one answer at a time).
    s = playerReducer(s, { type: 'answer', questionIndex: 0, answer: { choiceIndex: 1 } });
    expect(s.myAnswer).toMatchObject({ choiceIndex: 1 });
  });

  it('no more cancels once the server says none is left; reset on the next question', () => {
    let s = playerReducer(answering(), {
      type: 'answerCancelled',
      questionIndex: 0,
      cancelsLeft: 0,
    });
    s = playerReducer(s, { type: 'answer', questionIndex: 0, answer: { choiceIndex: 0 } });
    expect(canCancelAnswer(s)).toBe(false);
    s = playerReducer(s, { type: 'prompt', payload: prompt({ index: 1 }), now: 0 });
    s = playerReducer(s, { type: 'answer', questionIndex: 1, answer: { choiceIndex: 0 } });
    expect(canCancelAnswer(s)).toBe(true);
    expect(MAX_ANSWER_CANCELS).toBe(3);
  });

  it('not on « Buzzer » / « Dessine-moi » / « Mytho ! » questions, nor while paused', () => {
    for (const p of [
      prompt({ buzzer: true }),
      prompt({ type: 'DRAW', choiceCount: undefined }),
      prompt({ type: 'BLUFF', choiceCount: undefined }),
    ]) {
      const s = playerReducer(answering(p), {
        type: 'answer',
        questionIndex: 0,
        answer: { text: 'x' },
      });
      expect(canCancelAnswer(s)).toBe(false);
    }
    const paused = playerReducer(
      playerReducer(answering(), { type: 'answer', questionIndex: 0, answer: { choiceIndex: 0 } }),
      {
        type: 'state',
        payload: {
          phase: 'ANSWERING',
          mode: 'solo',
          questionIndex: 0,
          totalQuestions: 3,
          paused: { waitingFor: [], hostMissing: true, sinceMs: 0 },
        },
        now: 0,
      },
    );
    expect(canCancelAnswer(paused)).toBe(false);
  });

  it('« select all »: the ticks stay after a cancel, to adjust them', () => {
    let s = answering(prompt({ multiple: true }));
    s = playerReducer(s, { type: 'toggleChoice', questionIndex: 0, choiceIndex: 1 });
    s = playerReducer(s, { type: 'answer', questionIndex: 0, answer: { choiceIndexes: [1] } });
    s = playerReducer(s, { type: 'answerCancelled', questionIndex: 0, cancelsLeft: 2 });
    expect(selectedChoices(s)).toEqual([1]);
    s = playerReducer(s, { type: 'toggleChoice', questionIndex: 0, choiceIndex: 3 });
    expect(selectedChoices(s)).toEqual([1, 3]);
  });
});
