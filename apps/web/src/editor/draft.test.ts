import { describe, expect, it } from 'vitest';
import { DEMO_QUIZ } from '@lbq/shared';
import {
  addAcceptedAnswer,
  addChoice,
  addQuestion,
  emptyQuiz,
  fromDetail,
  moveQuestion,
  newQuestion,
  questionErrorCount,
  removeChoice,
  removeQuestion,
  setQuestionType,
  toggleCorrect,
  updateAcceptedAnswer,
  updateSlider,
  validateDraft,
  type DraftQuestion,
  type QuizDraft,
} from './draft';
import { checkImageFile } from './imageFile';

const q = (
  text: string,
  choices: [string, boolean][],
  extra: Partial<DraftQuestion> = {},
): DraftQuestion => ({
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
    const sent = res.data.questions[0]!;
    expect(sent.type === 'MCQ' && sent.choices).toEqual([
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

describe('new question types', () => {
  const draftWith = (question: DraftQuestion): QuizDraft => ({
    ...validDraft(),
    questions: [question],
  });

  it('typed answer: sends only its fields, drops empty variants, maps errors back', () => {
    let typed = setQuestionType(q('Plus grand océan ?', [['x', true]]), 'TYPE_ANSWER');
    typed = updateAcceptedAnswer(addAcceptedAnswer(addAcceptedAnswer(typed)), 2, 'Pacifique');
    const ok = validateDraft(draftWith(typed));
    expect(ok.ok && ok.data.questions[0]).toEqual({
      text: 'Plus grand océan ?',
      type: 'TYPE_ANSWER',
      timeLimitSec: 20,
      basePoints: 1000,
      acceptedAnswers: ['Pacifique'],
      typoTolerance: true,
    });
    expect(addAcceptedAnswer(typed)).toBe(typed); // 3 at most

    const tooLong = updateAcceptedAnswer(typed, 2, 'x'.repeat(41));
    const res = validateDraft(draftWith(tooLong));
    expect(!res.ok && res.errors).toEqual({
      'questions.0.acceptedAnswers.2': '40 caractères maximum',
    });
    const empty = validateDraft(draftWith(setQuestionType(q('?', []), 'TYPE_ANSWER')));
    expect(!empty.ok && empty.errors['questions.0.acceptedAnswers.0']).toBe('Champ obligatoire');
  });

  it('slider: French errors on its fields, unit optional', () => {
    const slider = setQuestionType(q('Année ?', []), 'SLIDER');
    const ok = validateDraft(draftWith(updateSlider(slider, { correct: 40, margin: 5 })));
    expect(ok.ok && ok.data.questions[0]).toMatchObject({
      type: 'SLIDER',
      slider: { min: 0, max: 100, step: 1, correct: 40, margin: 5 },
    });
    expect(ok.ok && ok.data.questions[0]).not.toHaveProperty('choices');
    const errors = (patch: Partial<DraftQuestion['slider']>) => {
      const res = validateDraft(draftWith(updateSlider(slider, patch)));
      return res.ok ? {} : res.errors;
    };
    expect(errors({ min: 100 })['questions.0.slider.max']).toBe(
      'Le maximum doit être supérieur au minimum',
    );
    expect(errors({ correct: 150 })['questions.0.slider.correct']).toBe(
      'La bonne réponse doit être entre le minimum et le maximum',
    );
    expect(errors({ step: 3, correct: 50 })['questions.0.slider.correct']).toBe(
      'La bonne réponse doit tomber sur un cran du curseur',
    );
    expect(errors({ margin: -1 })['questions.0.slider.margin']).toBeDefined();
    expect(errors({ max: NaN })['questions.0.slider.max']).toBe('Valeur invalide');
  });

  it('poll: no points, choices without a correct answer; switching back keeps the input', () => {
    const mcq = q('Dessert ?', [
      ['Tarte', true],
      ['Glace', false],
      ['', false],
    ]);
    const poll = setQuestionType(mcq, 'POLL');
    expect(poll.basePoints).toBe(0);
    const res = validateDraft(draftWith(poll));
    expect(res.ok && res.data.questions[0]).toMatchObject({
      type: 'POLL',
      basePoints: 0,
      choices: [{ text: 'Tarte' }, { text: 'Glace' }],
    });
    const back = setQuestionType(setQuestionType(poll, 'SLIDER'), 'MCQ');
    expect(back.choices).toEqual(mcq.choices);
    expect(back.basePoints).toBe(1000);
  });

  it('loads every type of a saved quiz into the editor and saves it unchanged', () => {
    const draft = fromDetail({ ...DEMO_QUIZ, visibility: 'PRIVATE', createdAt: '', updatedAt: '' });
    const res = validateDraft(draft);
    expect(res.ok && res.data.questions).toEqual(DEMO_QUIZ.questions);
  });

  it('keeps the visibility: private for a new quiz, as saved otherwise', () => {
    expect(emptyQuiz().visibility).toBe('PRIVATE');
    const draft = fromDetail({ ...DEMO_QUIZ, visibility: 'PUBLIC', createdAt: '', updatedAt: '' });
    const res = validateDraft(draft);
    expect(res.ok && res.data.visibility).toBe('PUBLIC');
  });
});

describe('checkImageFile', () => {
  it('accepts supported images up to 5 MB', () => {
    expect(checkImageFile({ type: 'image/png', size: 1000 })).toBeNull();
    expect(checkImageFile({ type: 'image/svg+xml', size: 1000 })).toMatch(/Formats/);
    expect(checkImageFile({ type: 'image/jpeg', size: 6 * 1024 * 1024 })).toMatch(/trop lourde/);
  });
});
