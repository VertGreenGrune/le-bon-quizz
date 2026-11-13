import { describe, expect, it } from 'vitest';
import {
  addColorZone,
  newQuestion,
  removeColorZone,
  setColorZoneColors,
  setQuestionType,
  toDraftQuestion,
  updateColorZone,
  validateDraft,
  type DraftQuestion,
  type QuizDraft,
} from './draft';
import { blankKey } from '../lib/paintBucket';

const quiz = (q: DraftQuestion): QuizDraft => ({
  title: 'Couleurs',
  visibility: 'PRIVATE',
  theme: 'classic',
  questions: [q],
});

const IMAGE = 'https://example.com/uploads/tableau.png';
const BLANK = 'https://example.com/uploads/tableau-blanc.png';

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
      colorZones: [{ x: 0.5, y: 0.5, radius: 0.1, color: '#facc15' }],
    };
    const res = validateDraft(quiz(q));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const sent = res.data.questions[0]!;
    expect(sent).toMatchObject({ type: 'COLORS', cells: 9, zones: [], memoSec: 20 });
    expect(sent.imageUrl).toBeUndefined();
    expect(sent.imageEffect).toBeUndefined();
  });

  it('paint-bucket zones: added, tolerance, colors measured, removed, round-trip', () => {
    let q: DraftQuestion = {
      ...setQuestionType({ ...newQuestion(), text: 'Tableau' }, 'COLORS'),
      colorSource: 'picture',
      imageUrl: IMAGE,
    };
    q = addColorZone(q, 0.2, 0.3);
    q = updateColorZone(q, 0, { tolerance: 45 });
    q = addColorZone(q, 0.7, 0.6); // takes the last tolerance
    q = addColorZone(q, 0.9, 0.9);
    q = removeColorZone(q, 2);
    q = setColorZoneColors(q, ['#F4A6C0', '#3c8f4a']);
    expect(q.colorZones).toEqual([
      { x: 0.2, y: 0.3, tolerance: 45, color: '#F4A6C0' },
      { x: 0.7, y: 0.6, tolerance: 45, color: '#3c8f4a' },
    ]);
    // No blank picture yet (or one made for other zones): not saved.
    const stale = validateDraft(
      quiz({ ...q, colorBlankImageUrl: BLANK, colorBlankKey: blankKey(IMAGE, []) }),
    );
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.errors['questions.0.blankImageUrl']).toMatch(/blanches/);
    q = { ...q, colorBlankImageUrl: BLANK, colorBlankKey: blankKey(IMAGE, q.colorZones) };
    const res = validateDraft(quiz(q));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.questions[0]).toMatchObject({ blankImageUrl: BLANK });
    const back = toDraftQuestion(res.data.questions[0]!);
    expect(back).toMatchObject({
      colorSource: 'picture',
      colorZones: [
        { x: 0.2, y: 0.3, tolerance: 45, color: '#f4a6c0' },
        { x: 0.7, y: 0.6, tolerance: 45, color: '#3c8f4a' },
      ],
      imageUrl: IMAGE,
      colorBlankImageUrl: BLANK,
    });
    // Loaded with its blank picture: fresh until a zone moves.
    expect(back.colorBlankKey).toBe(blankKey(IMAGE, back.colorZones));
    expect(blankKey(IMAGE, updateColorZone(back, 1, { tolerance: 10 }).colorZones)).not.toBe(
      back.colorBlankKey,
    );
  });

  it('T58 round zones still load and save, without a blank picture', () => {
    const q: DraftQuestion = {
      ...setQuestionType({ ...newQuestion(), text: 'Tableau' }, 'COLORS'),
      colorSource: 'picture',
      imageUrl: IMAGE,
      colorZones: [
        { x: 0.2, y: 0.3, radius: 0.1, color: '#e11d48' },
        { x: 0.7, y: 0.6, radius: 0.1, color: '#2563eb' },
      ],
    };
    const res = validateDraft(quiz(q));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.questions[0]).toMatchObject({ blankImageUrl: undefined });
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
