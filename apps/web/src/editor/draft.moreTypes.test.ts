import { describe, expect, it } from 'vitest';
import type { Question } from '@lbq/shared';
import {
  addItem,
  fromDetail,
  moveItem,
  newQuestion,
  removeItem,
  setQuestionType,
  updateItem,
  validateDraft,
  type DraftQuestion,
  type QuizDraft,
} from './draft';

const draftWith = (...questions: DraftQuestion[]): QuizDraft => ({
  title: 'Nouveaux types',
  description: '',
  questions,
});
const typed = (type: DraftQuestion['type'], extra: Partial<DraftQuestion> = {}) => ({
  ...setQuestionType({ ...newQuestion(), text: 'Question ?' }, type),
  ...extra,
});
const IMAGE = 'https://example.com/carte.png';

describe('editor model of the ORDER / PIN / WHO_OF_US / WORD_CLOUD questions', () => {
  it('order: 3 to 6 items, empty extra ones dropped, errors on the draft indexes', () => {
    let q = typed('ORDER');
    expect(q.items).toEqual(['', '', '']);
    expect(removeItem(q, 0).items).toHaveLength(3); // minimum 3
    q = addItem(addItem(addItem(q)));
    expect(addItem(q).items).toHaveLength(6); // maximum 6
    q = ['1789', '', '1848', '1871', '', '1914'].reduce(
      (acc, item, i) => updateItem(acc, i, item),
      q,
    );
    q = moveItem(q, 3, 0);
    expect(q.items).toEqual(['1871', '1789', '', '1848', '', '1914']);
    const res = validateDraft(draftWith(q));
    expect(res.ok && res.data.questions[0]).toMatchObject({
      type: 'ORDER',
      items: ['1871', '1789', '1848', '1914'],
    });
    expect(res.ok && res.data.questions[0]).not.toHaveProperty('choices');

    // Duplicates: the error is on the list; too few items: the empty draft ones are flagged.
    const dup = validateDraft(draftWith({ ...q, items: ['a', 'b', 'A'] }));
    expect(!dup.ok && dup.errors['questions.0.items']).toBe(
      'Les éléments doivent être tous différents',
    );
    const short = validateDraft(draftWith({ ...q, items: ['a', '', 'c'] }));
    expect(!short.ok && short.errors['questions.0.items.1']).toBe('Champ obligatoire');
  });

  it('pin: needs a picture, sends the zone, never an image effect', () => {
    const q = typed('PIN', { zone: { x: 0.2, y: 0.8, radius: 0.05 }, imageEffect: 'blur' });
    const missing = validateDraft(draftWith(q));
    expect(!missing.ok && missing.errors['questions.0.imageUrl']).toBe(
      'Ajoute une image : les joueurs vont la toucher',
    );
    const res = validateDraft(draftWith({ ...q, imageUrl: IMAGE }));
    expect(res.ok && res.data.questions[0]).toEqual({
      text: 'Question ?',
      type: 'PIN',
      imageUrl: IMAGE,
      timeLimitSec: 20,
      basePoints: 1000,
      zone: { x: 0.2, y: 0.8, radius: 0.05 },
    });
  });

  it('who of us / word cloud: no points; switching back to a scored type restores them', () => {
    const who = typed('WHO_OF_US', { majorityBonus: true });
    expect(who.basePoints).toBe(0);
    const res = validateDraft(draftWith(who, typed('WORD_CLOUD')));
    expect(res.ok && res.data.questions).toMatchObject([
      { type: 'WHO_OF_US', basePoints: 0, majorityBonus: true },
      { type: 'WORD_CLOUD', basePoints: 0 },
    ]);
    expect(setQuestionType(who, 'ORDER').basePoints).toBe(1000);
    expect(setQuestionType(who, 'POLL').basePoints).toBe(0);
  });

  it('loads saved questions of these types and saves them unchanged', () => {
    const base = { timeLimitSec: 30, basePoints: 1000 as const };
    const questions: Question[] = [
      { ...base, text: 'Ordre', type: 'ORDER', items: ['a', 'b', 'c', 'd'] },
      {
        ...base,
        text: 'Point',
        type: 'PIN',
        imageUrl: IMAGE,
        zone: { x: 0.1, y: 0.2, radius: 0.3 },
      },
      { ...base, basePoints: 0, text: 'Qui ?', type: 'WHO_OF_US', majorityBonus: false },
      { ...base, basePoints: 0, text: 'Mot', type: 'WORD_CLOUD' },
    ];
    const draft = fromDetail({
      id: 'x',
      title: 'T',
      visibility: 'PRIVATE',
      createdAt: '',
      updatedAt: '',
      questions,
    });
    const res = validateDraft(draft);
    expect(res.ok && res.data.questions).toEqual(questions);
  });
});
