import { describe, expect, it } from 'vitest';
import {
  QUESTION_TYPES,
  newQuestion,
  setQuestionType,
  toDraftQuestion,
  validateDraft,
  type QuizDraft,
} from './draft';

const quiz = (q: ReturnType<typeof newQuestion>): QuizDraft => ({
  title: 'Onde',
  visibility: 'PRIVATE',
  theme: 'classic',
  questions: [q],
});

describe('« Sur la même longueur d’onde » in the editor', () => {
  it('is listed, and switching to WAVELENGTH gives it 30 s', () => {
    expect(QUESTION_TYPES.find((t) => t.type === 'WAVELENGTH')?.label).toBe(
      'Sur la même longueur d’onde',
    );
    expect(setQuestionType(newQuestion(), 'WAVELENGTH').timeLimitSec).toBe(30);
  });

  it('sends the scales (blank lines dropped) and the clue time, and round-trips', () => {
    const q = {
      ...setQuestionType({ ...newQuestion(), text: 'Sur la même longueur d’onde !' }, 'WAVELENGTH'),
      spectraLines: [' Froid / Chaud ', '', 'Film nul / Chef-d’œuvre'],
      clueTimeSec: 45,
    };
    const res = validateDraft(quiz(q));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const saved = res.data.questions[0]!;
    expect(saved).toMatchObject({
      type: 'WAVELENGTH',
      spectra: [
        { left: 'Froid', right: 'Chaud' },
        { left: 'Film nul', right: 'Chef-d’œuvre' },
      ],
      clueTimeSec: 45,
    });
    expect(toDraftQuestion(saved)).toMatchObject({
      spectraLines: ['Froid / Chaud', 'Film nul / Chef-d’œuvre'],
      clueTimeSec: 45,
    });
  });

  it('no scale = the built-in list; a line without « / » is an error on that line', () => {
    const q = setQuestionType({ ...newQuestion(), text: 'Q' }, 'WAVELENGTH');
    const empty = validateDraft(quiz(q));
    expect(empty.ok && empty.data.questions[0]).toMatchObject({ spectra: [] });
    const bad = validateDraft(quiz({ ...q, spectraLines: ['', 'Froid'] }));
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(Object.keys(bad.errors)).toEqual(['questions.0.spectraLines.1.right']);
  });
});
