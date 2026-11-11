import { describe, expect, it } from 'vitest';
import {
  newQuestion,
  setQuestionType,
  toDraftQuestion,
  validateDraft,
  type QuizDraft,
} from './draft';

const quiz = (q: ReturnType<typeof newQuestion>): QuizDraft => ({
  title: 'Liste',
  visibility: 'PRIVATE',
  theme: 'classic',
  questions: [q],
});

describe('« Liste chrono » in the editor', () => {
  it('switching to LIST gives it 60 s', () => {
    expect(setQuestionType(newQuestion(), 'LIST').timeLimitSec).toBe(60);
  });

  it('sends the non-empty lines as items and round-trips', () => {
    const q = {
      ...setQuestionType({ ...newQuestion(), text: 'Citez les nains' }, 'LIST'),
      listItems: ['Prof | Professeur', '', 'Grincheux', '  '],
      typoTolerance: false,
    };
    const res = validateDraft(quiz(q));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const saved = res.data.questions[0]!;
    expect(saved).toMatchObject({
      type: 'LIST',
      items: ['Prof | Professeur', 'Grincheux'],
      typoTolerance: false,
    });
    expect(toDraftQuestion(saved)).toMatchObject({
      listItems: ['Prof | Professeur', 'Grincheux'],
      typoTolerance: false,
    });
  });

  it('errors point at the draft lines (listItems), not ORDER items', () => {
    const q = {
      ...setQuestionType({ ...newQuestion(), text: 'x' }, 'LIST'),
      listItems: ['Seul'],
    };
    const res = validateDraft(quiz(q));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(Object.keys(res.errors)).toContain('questions.0.listItems');
  });
});
