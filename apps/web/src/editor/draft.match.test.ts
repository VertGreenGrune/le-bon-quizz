import { describe, expect, it } from 'vitest';
import { QuestionSchema, type MatchQuestion } from '@lbq/shared';
import { emptyQuiz, fromDetail, newQuestion, setQuestionType, validateDraft } from './draft';

const PIC = 'http://localhost:3001/uploads/drapeau.png';

describe('« Associer » in the editor (T67)', () => {
  it('a new MATCH question has 3 empty pairs and 45 s', () => {
    const q = setQuestionType(newQuestion(), 'MATCH');
    expect(q.matchPairs).toHaveLength(3);
    expect(q.timeLimitSec).toBe(45);
  });

  it('sends texts and pictures, and reads them back', () => {
    const q = {
      ...setQuestionType({ ...newQuestion(), text: 'Associe' }, 'MATCH'),
      matchPairs: [
        { left: { text: ' France ' }, right: { text: 'Paris' } },
        { left: { text: 'Italie' }, right: { text: '', imageUrl: PIC } },
        { left: { text: 'Espagne' }, right: { text: 'Madrid' } },
      ],
    };
    const result = validateDraft({ ...emptyQuiz(), title: 'Q', questions: [q] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sent = result.data.questions[0] as MatchQuestion;
    expect(sent.pairs).toEqual([
      { left: { text: 'France' }, right: { text: 'Paris' } },
      { left: { text: 'Italie' }, right: { imageUrl: PIC } },
      { left: { text: 'Espagne' }, right: { text: 'Madrid' } },
    ]);
    const back = fromDetail({
      ...result.data,
      id: 'x',
      createdAt: '',
      updatedAt: '',
      access: 'owner',
      ownerName: 'A',
      visibility: 'PRIVATE',
      theme: 'classic',
      questions: [QuestionSchema.parse(sent)],
    });
    expect(back.questions[0]!.matchPairs[1]).toEqual({
      left: { text: 'Italie' },
      right: { text: '', imageUrl: PIC },
    });
  });

  it('an empty side is an error', () => {
    const q = setQuestionType({ ...newQuestion(), text: 'Associe' }, 'MATCH');
    const result = validateDraft({ ...emptyQuiz(), title: 'Q', questions: [q] });
    expect(result.ok).toBe(false);
  });
});
