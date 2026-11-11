import { describe, expect, it } from 'vitest';
import {
  QUESTION_TYPES,
  newQuestion,
  setQuestionType,
  toDraftQuestion,
  validateDraft,
  type QuizDraft,
} from './draft';

const quiz = (q: ReturnType<typeof newQuestion>): QuizDraft => ({
  title: 'Paris',
  visibility: 'PRIVATE',
  theme: 'classic',
  questions: [q],
});

describe('« Paris sur les réponses » in the editor', () => {
  it('is listed, and switching to WAGER gives it 30 s', () => {
    expect(QUESTION_TYPES.find((t) => t.type === 'WAGER')?.label).toBe('Paris sur les réponses');
    expect(setQuestionType(newQuestion(), 'WAGER').timeLimitSec).toBe(30);
  });

  it('sends the number, the unit and the bet time, and round-trips', () => {
    const q = {
      ...setQuestionType({ ...newQuestion(), text: 'Hauteur de la tour Eiffel ?' }, 'WAGER'),
      wagerCorrect: 330.5,
      wagerUnit: ' m ',
      betTimeSec: 15,
    };
    const res = validateDraft(quiz(q));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const saved = res.data.questions[0]!;
    expect(saved).toMatchObject({
      type: 'WAGER',
      wager: { correct: 330.5, unit: 'm' },
      betTimeSec: 15,
    });
    expect(toDraftQuestion(saved)).toMatchObject({
      wagerCorrect: 330.5,
      wagerUnit: 'm',
      betTimeSec: 15,
    });
  });

  it('an empty answer is an error on its field', () => {
    const q = setQuestionType({ ...newQuestion(), text: 'Combien ?' }, 'WAGER');
    const res = validateDraft(quiz(q));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(Object.keys(res.errors)).toContain('questions.0.wager.correct');
  });
});
