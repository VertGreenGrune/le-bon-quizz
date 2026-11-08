import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The part of a quiz.json these checks read (type absent = MCQ). */
interface RawQuestion {
  type?: string;
  choices?: { isCorrect?: boolean }[];
  slider?: { min: number; max: number; correct: number; margin: number };
}

/**
 * T48: the bundled quizzes (content/quizzes) don't give the answer away by its position —
 * the right MCQ answer is spread over the 4 slots and slider answers stay away from the middle
 * of their range (where a slider used to start).
 */
const ROOT = join(import.meta.dirname, '../../../content/quizzes');

/** Sliders whose range is natural and can't move (e.g. a month: 1–12). */
const FIXED_RANGE = new Set(['halloween#5']);

const quizzes = readdirSync(ROOT)
  .filter((dir) => existsSync(join(ROOT, dir, 'quiz.json')))
  .map((dir) => ({
    dir,
    quiz: JSON.parse(readFileSync(join(ROOT, dir, 'quiz.json'), 'utf8')) as {
      questions: RawQuestion[];
    },
  }));

describe('bundled quizzes (T48)', () => {
  it('finds the quizzes', () => {
    expect(quizzes.length).toBeGreaterThan(0);
  });

  describe.each(quizzes)('$dir', ({ dir, quiz }) => {
    const mcq = quiz.questions
      .filter((q) => (q.type ?? 'MCQ') === 'MCQ')
      .map((q) => ({ choices: q.choices ?? [] }));

    it('spreads the right MCQ answers over the slots', () => {
      const slots = mcq.flatMap((q) => q.choices.flatMap((c, i) => (c.isCorrect ? [i] : [])));
      if (mcq.length < 5) return;
      for (let slot = 0; slot < 4; slot++) {
        const share = slots.filter((s) => s === slot).length / slots.length;
        expect(
          share,
          `slot ${slot + 1} has ${Math.round(share * 100)} % of the answers`,
        ).toBeLessThanOrEqual(0.4);
      }
    });

    it('never puts a single right answer in the same slot 3 times in a row', () => {
      const single = mcq
        .filter((q) => q.choices.filter((c) => c.isCorrect).length === 1)
        .map((q) => q.choices.findIndex((c) => c.isCorrect));
      for (let i = 2; i < single.length; i++)
        expect(single[i] === single[i - 1] && single[i] === single[i - 2], `MCQ ${i + 1}`).toBe(
          false,
        );
    });

    it('keeps slider answers away from the middle of their range', () => {
      quiz.questions.forEach((q, i) => {
        if (!q.slider || FIXED_RANGE.has(`${dir}#${i + 1}`)) return;
        const { min, max, correct, margin } = q.slider;
        const position = (correct - min) / (max - min);
        const where = `question ${i + 1}: ${correct} in ${min}–${max}`;
        expect(position < 0.35 || position > 0.65, where).toBe(true);
        expect(
          Math.abs((min + max) / 2 - correct) > margin,
          `${where}, margin over the middle`,
        ).toBe(true);
      });
    });
  });
});
