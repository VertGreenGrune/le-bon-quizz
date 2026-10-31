import { describe, expect, it } from 'vitest';
import { PlayerUnanswerPayload } from './events.js';
import { QuestionType, answerCancellable } from './quiz.js';

const QUESTION_TYPES = QuestionType.options;

describe('« Annuler ma réponse » (T43)', () => {
  it('every type can be cancelled but « Dessine-moi », « Mytho ! » and « Buzzer » questions', () => {
    const cancellable = QUESTION_TYPES.filter((t) => answerCancellable(t));
    expect(cancellable).not.toContain('DRAW');
    expect(cancellable).not.toContain('BLUFF');
    expect(cancellable).toEqual(expect.arrayContaining(['MCQ', 'TYPE_ANSWER', 'WHO_OF_US', 'PIN']));
    expect(answerCancellable('MCQ', true)).toBe(false);
  });

  it('the payload is a PIN and a question index', () => {
    expect(PlayerUnanswerPayload.safeParse({ pin: '123456', questionIndex: 2 }).success).toBe(true);
    expect(PlayerUnanswerPayload.safeParse({ pin: '123456', questionIndex: -1 }).success).toBe(
      false,
    );
  });
});
