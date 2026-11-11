import { describe, expect, it } from 'vitest';
import type { Question } from '@lbq/shared';
import { newQuestion, setQuestionType, toDraftQuestion, validateDraft } from './draft';
import {
  addSub,
  addSubChoice,
  removeSub,
  removeSubChoice,
  setFuse,
  setSubChoice,
  updateSub,
} from './potatoDraft';

const potato: Question = {
  text: 'Patate chaude !',
  type: 'HOT_POTATO',
  timeLimitSec: 20,
  basePoints: 1000,
  potato: {
    questions: [
      { text: '1 + 1 ?', choices: ['1', '2'], correct: 1 },
      { text: '2 + 2 ?', choices: ['4', '5', '6'], correct: 0 },
      { text: '3 + 3 ?', choices: ['5', '6', '7', '8'], correct: 1 },
    ],
    fuseMinSec: 20,
    fuseMaxSec: 45,
  },
};

const quiz = (q: ReturnType<typeof newQuestion>) => ({
  title: 'Quiz',
  description: '',
  visibility: 'PRIVATE' as const,
  theme: 'classic' as const,
  questions: [q],
});

describe('« Patate chaude » in the editor', () => {
  it('round trip: a saved question comes back the same', () => {
    const result = validateDraft(quiz(toDraftQuestion(potato)));
    expect(result.ok && result.data.questions[0]).toEqual(potato);
  });

  it('a new question: 3 empty sub-questions, errors until they are filled', () => {
    const q = setQuestionType({ ...newQuestion(), text: 'Patate' }, 'HOT_POTATO');
    expect(q.potatoQuestions).toHaveLength(3);
    const result = validateDraft(quiz(q));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors['questions.0.potato.questions.0.text']).toBeDefined();
  });

  it('sub-question helpers keep the right answer on its choice', () => {
    let q = toDraftQuestion(potato);
    q = addSubChoice(q, 2); // already 4: unchanged
    expect(q.potatoQuestions[2]!.choices).toHaveLength(4);
    q = removeSubChoice(q, 2, 0); // the right one (index 1) moves to 0
    expect(q.potatoQuestions[2]).toEqual({ text: '3 + 3 ?', choices: ['6', '7', '8'], correct: 0 });
    q = removeSubChoice(q, 2, 0); // the right one removed → first choice
    expect(q.potatoQuestions[2]!.correct).toBe(0);
    q = removeSubChoice(q, 2, 0); // only 2 left: unchanged
    expect(q.potatoQuestions[2]!.choices).toHaveLength(2);
    q = setSubChoice(updateSub(q, 0, { text: 'Un plus un ?' }), 0, 0, 'zéro');
    expect(q.potatoQuestions[0]).toEqual({
      text: 'Un plus un ?',
      choices: ['zéro', '2'],
      correct: 1,
    });
    q = removeSub(q, 0); // 3 is the minimum
    expect(q.potatoQuestions).toHaveLength(3);
    q = removeSub(addSub(q), 0);
    expect(q.potatoQuestions[0]!.text).toBe('2 + 2 ?');
    expect(setFuse(q, 'min', 60)).toMatchObject({ fuseMinSec: 60, fuseMaxSec: 60 });
    expect(setFuse(q, 'max', 10)).toMatchObject({ fuseMinSec: 10, fuseMaxSec: 10 });
  });

  it('no picture nor effect is sent (the TV shows the bomb)', () => {
    const q = {
      ...toDraftQuestion(potato),
      imageUrl: 'https://x.test/a.png',
      imageEffect: 'blur' as const,
    };
    const result = validateDraft(quiz(q));
    expect(result.ok && result.data.questions[0]).toEqual(potato);
  });
});
