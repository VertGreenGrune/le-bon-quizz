import { describe, expect, it } from 'vitest';
import {
  isMultipleAnswerDraft,
  newQuestion,
  setQuestionType,
  toDraftQuestion,
  toggleCorrect,
  validateDraft,
  type QuizDraft,
} from './draft';

const draftWith = (...questions: QuizDraft['questions']): QuizDraft => ({
  title: 'T37',
  description: '',
  questions,
});

const mcq = () => ({
  ...newQuestion(),
  text: 'Couleurs du drapeau ?',
  choices: [
    { text: 'Bleu', isCorrect: true },
    { text: 'Vert', isCorrect: false },
    { text: 'Rouge', isCorrect: false },
  ],
});

describe('editor model of the explanation (T37)', () => {
  it('is empty by default and not sent then', () => {
    expect(newQuestion().explanation).toBe('');
    const res = validateDraft(draftWith({ ...mcq(), explanation: '   ' }));
    expect(res.ok && res.data.questions[0]!.explanation).toBeUndefined();
  });

  it('round trip: saved trimmed, read back, kept when switching type', () => {
    const res = validateDraft(draftWith({ ...mcq(), explanation: ' Bleu, blanc, rouge. ' }));
    expect(res.ok).toBe(true);
    const saved = res.ok ? res.data.questions[0]! : null;
    expect(saved).toMatchObject({ explanation: 'Bleu, blanc, rouge.' });
    const draft = toDraftQuestion(saved!);
    expect(draft.explanation).toBe('Bleu, blanc, rouge.');
    expect(setQuestionType(draft, 'SLIDER').explanation).toBe('Bleu, blanc, rouge.');
    const back = validateDraft(draftWith(draft));
    expect(back.ok && back.data.questions[0]).toEqual(saved);
  });

  it('is refused over 300 characters', () => {
    const res = validateDraft(draftWith({ ...mcq(), explanation: 'x'.repeat(301) }));
    expect(res.ok).toBe(false);
  });
});

describe('« select all » hint (T37)', () => {
  it('shows for an MCQ with 2+ right answers, not au buzzer nor for vrai / faux', () => {
    const one = mcq();
    expect(isMultipleAnswerDraft(one)).toBe(false);
    const two = toggleCorrect(one, 2);
    expect(isMultipleAnswerDraft(two)).toBe(true);
    expect(isMultipleAnswerDraft({ ...two, buzzer: true })).toBe(false);
    expect(isMultipleAnswerDraft({ ...two, type: 'POLL' })).toBe(false);
  });
});
