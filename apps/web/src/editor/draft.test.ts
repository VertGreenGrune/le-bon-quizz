import { describe, expect, it } from 'vitest';
import type { Question } from '@lbq/shared';
import {
  addChoice,
  addQuestion,
  emptyQuiz,
  moveQuestion,
  newQuestion,
  questionErrorCount,
  removeChoice,
  removeQuestion,
  setQuestionType,
  toggleCorrect,
  validateDraft,
  type QuizDraft,
} from './draft';
import { checkImageFile } from './imageFile';

const q = (
  text: string,
  choices: [string, boolean][],
  extra: Partial<Question> = {},
): Question => ({
  ...newQuestion(),
  text,
  choices: choices.map(([t, isCorrect]) => ({ text: t, isCorrect })),
  ...extra,
});

const validDraft = (): QuizDraft => ({
  title: 'Capitales',
  description: '',
  questions: [
    q('Capitale de la France ?', [
      ['Paris', true],
      ['Lyon', false],
      ['', false],
      ['', false],
    ]),
  ],
});

describe('validateDraft', () => {
  it('accepts a valid quiz, dropping empty extra choices and empty description', () => {
    const res = validateDraft(validDraft());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.description).toBeUndefined();
    expect(res.data.questions[0]!.choices).toEqual([
      { text: 'Paris', isCorrect: true },
      { text: 'Lyon', isCorrect: false },
    ]);
  });

  it('reports French errors on the draft field paths', () => {
    const draft = emptyQuiz();
    const res = validateDraft(draft);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.title).toBe('Champ obligatoire');
    expect(res.errors['questions.0.text']).toBe('Champ obligatoire');
    // All 4 empty: none dropped (fewer than 2 would remain), so the first two are flagged.
    expect(res.errors['questions.0.choices.0.text']).toBe('Champ obligatoire');
    expect(questionErrorCount(res.errors, 0)).toBeGreaterThan(0);
    expect(questionErrorCount(res.errors, 1)).toBe(0);
  });

  it('requires a correct answer', () => {
    const draft = validDraft();
    draft.questions[0] = q('?', [
      ['a', false],
      ['b', false],
    ]);
    const res = validateDraft(draft);
    expect(!res.ok && res.errors['questions.0.choices']).toBe('Coche au moins une bonne réponse');
  });

  it('maps choice errors back to the original index when empty choices are dropped', () => {
    const draft = validDraft();
    // Choice 1 is empty (dropped), choice 3 is empty but correct (kept, invalid).
    draft.questions[0] = q('?', [
      ['a', true],
      ['', false],
      ['c', false],
      ['', true],
    ]);
    const res = validateDraft(draft);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(Object.keys(res.errors)).toEqual(['questions.0.choices.3.text']);
  });
});

describe('question helpers', () => {
  it('true/false keeps one correct answer and fixed texts', () => {
    const tf = setQuestionType(
      q('?', [
        ['x', false],
        ['y', true],
        ['z', false],
      ]),
      'TRUE_FALSE',
    );
    expect(tf.choices).toEqual([
      { text: 'Vrai', isCorrect: false },
      { text: 'Faux', isCorrect: true },
    ]);
    expect(toggleCorrect(tf, 0).choices.map((c) => c.isCorrect)).toEqual([true, false]);
    expect(addChoice(tf)).toBe(tf);
    expect(removeChoice(tf, 0)).toBe(tf);
  });

  it('MCQ allows several correct answers and 2–4 choices', () => {
    let m = q('?', [
      ['a', true],
      ['b', false],
    ]);
    m = toggleCorrect(m, 1);
    expect(m.choices.every((c) => c.isCorrect)).toBe(true);
    expect(removeChoice(m, 0)).toBe(m);
    m = addChoice(addChoice(m));
    expect(m.choices).toHaveLength(4);
    expect(addChoice(m)).toBe(m);
  });

  it('adds, moves and removes questions, never leaving the quiz empty', () => {
    let d = validDraft();
    d = addQuestion(d);
    expect(d.questions).toHaveLength(2);
    d = moveQuestion(d, 1, 0);
    expect(d.questions[0]!.text).toBe('');
    expect(moveQuestion(d, 0, -1)).toBe(d);
    d = removeQuestion(removeQuestion(d, 0), 0);
    expect(d.questions).toHaveLength(1);
    expect(d.questions[0]!.text).toBe('');
  });
});

describe('checkImageFile', () => {
  it('accepts supported images up to 5 MB', () => {
    expect(checkImageFile({ type: 'image/png', size: 1000 })).toBeNull();
    expect(checkImageFile({ type: 'image/svg+xml', size: 1000 })).toMatch(/Formats/);
    expect(checkImageFile({ type: 'image/jpeg', size: 6 * 1024 * 1024 })).toMatch(/trop lourde/);
  });
});
