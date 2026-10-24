import { describe, expect, it } from 'vitest';
import type { QuizDetail } from '@lbq/shared';
import { fromDetail, newQuestion, setQuestionType, validateDraft, type QuizDraft } from './draft';

const draftWith = (...questions: QuizDraft['questions']): QuizDraft => ({
  title: 'Mytho',
  description: '',
  questions,
});

describe('editor model of a « Mytho ! » question', () => {
  it('switching to it gives 45 s to write (a chosen time is kept)', () => {
    const q = setQuestionType({ ...newQuestion(), text: 'Question ?' }, 'BLUFF');
    expect(q).toMatchObject({ type: 'BLUFF', timeLimitSec: 45, voteTimeSec: 20, basePoints: 1000 });
    const custom = setQuestionType({ ...newQuestion(), timeLimitSec: 60 }, 'BLUFF');
    expect(custom.timeLimitSec).toBe(60);
  });

  it('sends only the truth and the vote time; the truth is required', () => {
    const q = {
      ...setQuestionType({ ...newQuestion(), text: 'Le premier film ?' }, 'BLUFF'),
      truth: '  Vincent ',
      voteTimeSec: 30,
    };
    const res = validateDraft(draftWith(q));
    expect(res.ok && res.data.questions[0]).toEqual({
      text: 'Le premier film ?',
      type: 'BLUFF',
      timeLimitSec: 45,
      basePoints: 1000,
      truth: 'Vincent',
      voteTimeSec: 30,
    });
    const empty = validateDraft(draftWith({ ...q, truth: ' ' }));
    expect(!empty.ok && Object.keys(empty.errors)).toContain('questions.0.truth');
  });

  it('round trip with a saved quiz', () => {
    const detail = {
      id: 'q1',
      title: 'Mytho',
      visibility: 'PRIVATE',
      createdAt: '',
      updatedAt: '',
      questions: [
        {
          text: 'Le vrai prénom de Beetlejuice ?',
          type: 'BLUFF',
          truth: 'Betelgeuse',
          timeLimitSec: 60,
          voteTimeSec: 15,
          basePoints: 2000,
        },
      ],
    } as QuizDetail;
    const draft = fromDetail(detail);
    expect(draft.questions[0]).toMatchObject({ truth: 'Betelgeuse', voteTimeSec: 15 });
    const res = validateDraft(draft);
    expect(res.ok && res.data.questions).toEqual(detail.questions);
  });
});
