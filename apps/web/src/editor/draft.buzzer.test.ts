import { describe, expect, it } from 'vitest';
import {
  newQuestion,
  setQuestionType,
  toDraftQuestion,
  validateDraft,
  type QuizDraft,
} from './draft';

const draftWith = (...questions: QuizDraft['questions']): QuizDraft => ({
  title: 'Buzzer',
  description: '',
  questions,
});

const mcq = () => ({
  ...newQuestion(),
  text: 'Qui a réalisé Beetlejuice ?',
  choices: [
    { text: 'Tim Burton', isCorrect: true },
    { text: 'Sam Raimi', isCorrect: false },
  ],
});

describe('editor model of the « Buzzer » option', () => {
  it('is off by default and saved when on', () => {
    expect(newQuestion().buzzer).toBe(false);
    const res = validateDraft(draftWith({ ...mcq(), buzzer: true }));
    expect(res.ok && res.data.questions[0]).toMatchObject({ type: 'MCQ', buzzer: true });
    const off = validateDraft(draftWith(mcq()));
    expect(off.ok && off.data.questions[0]!.buzzer).toBeUndefined();
  });

  it('is kept in the draft but not saved on a type without buzzer', () => {
    const poll = setQuestionType({ ...mcq(), buzzer: true }, 'POLL');
    expect(poll.buzzer).toBe(true);
    const res = validateDraft(draftWith(poll));
    expect(res.ok && res.data.questions[0]!.buzzer).toBeUndefined();
  });

  it('round trip with a saved question', () => {
    const q = toDraftQuestion({
      type: 'TYPE_ANSWER',
      text: 'Le plus grand océan ?',
      timeLimitSec: 20,
      basePoints: 1000,
      acceptedAnswers: ['Pacifique'],
      typoTolerance: true,
      buzzer: true,
    });
    expect(q.buzzer).toBe(true);
  });
});
