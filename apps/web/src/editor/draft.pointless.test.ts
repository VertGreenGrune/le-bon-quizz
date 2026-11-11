import { describe, expect, it } from 'vitest';
import {
  newQuestion,
  setQuestionType,
  toDraftQuestion,
  validateDraft,
  type QuizDraft,
} from './draft';

const quiz = (q: ReturnType<typeof newQuestion>): QuizDraft => ({
  title: 'Pas évident',
  visibility: 'PRIVATE',
  theme: 'classic',
  questions: [q],
});

describe('« Pas évident ! » in the editor', () => {
  it('switching to POINTLESS gives it 30 s', () => {
    expect(setQuestionType(newQuestion(), 'POINTLESS').timeLimitSec).toBe(30);
  });

  it('sends the non-empty lines as items and round-trips', () => {
    const q = {
      ...setQuestionType({ ...newQuestion(), text: 'Citez un pays d’Afrique' }, 'POINTLESS'),
      listItems: ['Maroc', '', 'Égypte | Egypte', '  '],
      typoTolerance: false,
    };
    const res = validateDraft(quiz(q));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const saved = res.data.questions[0]!;
    expect(saved).toMatchObject({
      type: 'POINTLESS',
      items: ['Maroc', 'Égypte | Egypte'],
      typoTolerance: false,
    });
    expect(toDraftQuestion(saved)).toMatchObject({
      type: 'POINTLESS',
      listItems: ['Maroc', 'Égypte | Egypte'],
    });
  });

  it('keeps the lines when switching from « Liste chrono »', () => {
    const list = { ...setQuestionType(newQuestion(), 'LIST'), listItems: ['A', 'B'] };
    expect(setQuestionType(list, 'POINTLESS').listItems).toEqual(['A', 'B']);
  });

  it('errors point at the draft lines (listItems)', () => {
    const q = {
      ...setQuestionType({ ...newQuestion(), text: 'x' }, 'POINTLESS'),
      listItems: ['Seul'],
    };
    const res = validateDraft(quiz(q));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(Object.keys(res.errors)).toContain('questions.0.listItems');
  });
});
