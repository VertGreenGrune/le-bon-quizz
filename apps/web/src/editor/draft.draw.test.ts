import { describe, expect, it } from 'vitest';
import type { QuizDetail } from '@lbq/shared';
import {
  fromDetail,
  hasMedia,
  newQuestion,
  setQuestionType,
  validateDraft,
  type QuizDraft,
} from './draft';

const draftWith = (...questions: QuizDraft['questions']): QuizDraft => ({
  title: 'Dessin',
  description: '',
  questions,
});

describe('editor model of a « Dessine-moi » question', () => {
  it('switching to it gives 90 s to draw (a chosen time is kept)', () => {
    const q = setQuestionType({ ...newQuestion(), text: 'Dessine !' }, 'DRAW');
    expect(q).toMatchObject({ type: 'DRAW', timeLimitSec: 90, basePoints: 1000, words: [] });
    expect(setQuestionType({ ...newQuestion(), timeLimitSec: 60 }, 'DRAW').timeLimitSec).toBe(60);
  });

  it('sends the words without empty lines, never a picture', () => {
    const q = {
      ...setQuestionType({ ...newQuestion(), text: 'Dessine-moi…' }, 'DRAW'),
      words: [' licorne', '', 'tour Eiffel ', '  '],
      imageUrl: 'https://x.test/a.png',
      imageEffect: 'blur' as const,
    };
    const res = validateDraft(draftWith(q));
    expect(res.ok && res.data.questions[0]).toEqual({
      text: 'Dessine-moi…',
      type: 'DRAW',
      timeLimitSec: 90,
      basePoints: 1000,
      words: ['licorne', 'tour Eiffel'],
    });
    expect(hasMedia(draftWith(q))).toBe(false);
    // No word at all: the built-in list.
    const none = validateDraft(draftWith({ ...q, words: [''] }));
    expect(none.ok && none.data.questions[0]).toMatchObject({ words: [] });
  });

  it('a word too long is reported on its own line', () => {
    const q = {
      ...setQuestionType({ ...newQuestion(), text: 'Dessine' }, 'DRAW'),
      words: ['', 'x'.repeat(31)],
    };
    const res = validateDraft(draftWith(q));
    expect(!res.ok && Object.keys(res.errors)).toContain('questions.0.words.1');
  });

  it('round trip with a saved quiz', () => {
    const detail = {
      id: 'q1',
      title: 'Dessin',
      visibility: 'PRIVATE',
      theme: 'classic',
      createdAt: '',
      updatedAt: '',
      access: 'owner',
      ownerName: 'Moi',
      questions: [
        { type: 'DRAW', text: 'Dessine', words: ['chat'], timeLimitSec: 60, basePoints: 2000 },
      ],
    } satisfies QuizDetail;
    const draft = fromDetail(detail);
    expect(draft.questions[0]).toMatchObject({ type: 'DRAW', words: ['chat'], timeLimitSec: 60 });
    const res = validateDraft(draft);
    expect(res.ok && res.data.questions[0]).toEqual(detail.questions[0]);
  });
});
