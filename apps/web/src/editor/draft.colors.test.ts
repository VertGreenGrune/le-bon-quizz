import { describe, expect, it } from 'vitest';
import {
  addColorZone,
  newQuestion,
  removeColorZone,
  setQuestionType,
  toDraftQuestion,
  updateColorZone,
  validateDraft,
  type DraftQuestion,
  type QuizDraft,
} from './draft';

const quiz = (q: DraftQuestion): QuizDraft => ({
  title: 'Couleurs',
  visibility: 'PRIVATE',
  theme: 'classic',
  questions: [q],
});

const IMAGE = 'https://example.com/uploads/tableau.png';

describe('« Couleurs perdues » in the editor', () => {
  it('switching to COLORS gives it 30 s to answer, a generated board by default', () => {
    const q = setQuestionType(newQuestion(), 'COLORS');
    expect(q).toMatchObject({
      timeLimitSec: 30,
      colorSource: 'generated',
      colorCells: 6,
      memoSec: 20,
    });
  });

  it('a generated board drops the picture and the zones', () => {
    const q: DraftQuestion = {
      ...setQuestionType({ ...newQuestion(), text: 'Formes' }, 'COLORS'),
      imageUrl: IMAGE,
      imageEffect: 'blur',
      colorCells: 9,
      colorZones: [{ x: 0.5, y: 0.5, radius: 0.1, color: 2 }],
    };
    const res = validateDraft(quiz(q));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const sent = res.data.questions[0]!;
    expect(sent).toMatchObject({ type: 'COLORS', cells: 9, zones: [], memoSec: 20 });
    expect(sent.imageUrl).toBeUndefined();
    expect(sent.imageEffect).toBeUndefined();
  });

  it('zones on a picture: added, recolored, removed, round-trip', () => {
    let q: DraftQuestion = {
      ...setQuestionType({ ...newQuestion(), text: 'Tableau' }, 'COLORS'),
      colorSource: 'picture',
      imageUrl: IMAGE,
    };
    q = addColorZone(q, 0.2, 0.3);
    q = updateColorZone(q, 0, { color: 4, radius: 0.1 });
    q = addColorZone(q, 0.7, 0.6); // takes the last color and size
    q = addColorZone(q, 0.9, 0.9);
    q = removeColorZone(q, 2);
    expect(q.colorZones).toEqual([
      { x: 0.2, y: 0.3, radius: 0.1, color: 4 },
      { x: 0.7, y: 0.6, radius: 0.1, color: 4 },
    ]);
    const res = validateDraft(quiz(q));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const back = toDraftQuestion(res.data.questions[0]!);
    expect(back).toMatchObject({
      colorSource: 'picture',
      colorZones: q.colorZones,
      imageUrl: IMAGE,
    });
  });

  it('a picture board needs the picture and two zones', () => {
    const q: DraftQuestion = {
      ...setQuestionType({ ...newQuestion(), text: 'Tableau' }, 'COLORS'),
      colorSource: 'picture',
      imageUrl: IMAGE,
    };
    const one = validateDraft(quiz(addColorZone(q, 0.5, 0.5)));
    expect(one.ok).toBe(false);
    if (!one.ok) expect(one.errors['questions.0.zones']).toBeDefined();
    const noPicture = validateDraft(
      quiz({ ...addColorZone(addColorZone(q, 0.2, 0.2), 0.8, 0.8), imageUrl: undefined }),
    );
    expect(noPicture.ok).toBe(false);
  });
});
