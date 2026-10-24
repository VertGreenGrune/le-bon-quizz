import { describe, expect, it } from 'vitest';
import {
  DRAW_COLORS,
  DRAW_ERASER_SIZE,
  DRAW_WORDS,
  DrawStrokeSchema,
  mergeStrokes,
  strokeStyle,
  wordHint,
} from './draw.js';
import { PlayerDrawPayload } from './events.js';
import { jokerAvailability } from './jokers.js';
import { DRAW_DEFAULT_SEC, QuestionSchema, buzzerAllowed, hasRightAnswer } from './quiz.js';

describe('« Dessine-moi » question schema', () => {
  it('defaults: no word (built-in list), 90 s', () => {
    const q = QuestionSchema.parse({ type: 'DRAW', text: 'Dessine-moi…' });
    expect(q).toMatchObject({ type: 'DRAW', words: [], timeLimitSec: DRAW_DEFAULT_SEC });
  });

  it('refuses a picture, the buzzer, too many or too long words', () => {
    const base = { type: 'DRAW', text: 'Dessine', words: ['chat'] };
    expect(QuestionSchema.safeParse(base).success).toBe(true);
    expect(QuestionSchema.safeParse({ ...base, imageUrl: 'https://x.test/a.png' }).success).toBe(
      false,
    );
    expect(QuestionSchema.safeParse({ ...base, buzzer: true }).success).toBe(false);
    expect(QuestionSchema.safeParse({ ...base, words: Array(31).fill('chat') }).success).toBe(
      false,
    );
    expect(QuestionSchema.safeParse({ ...base, words: ['x'.repeat(31)] }).success).toBe(false);
    expect(QuestionSchema.safeParse({ ...base, words: ['  '] }).success).toBe(false);
  });

  it('has a right answer, takes no joker nor buzzer', () => {
    expect(hasRightAnswer('DRAW')).toBe(true);
    expect(buzzerAllowed('DRAW')).toBe(false);
    expect(jokerAvailability('DRAW').jokers).toBe(false);
  });
});

describe('drawing helpers', () => {
  it('hint: one blank per letter, separators kept', () => {
    expect(wordHint('chat')).toBe('____');
    expect(wordHint('arc-en-ciel')).toBe('___-__-____');
    expect(wordHint('œuf à la coque')).toBe('___ _ __ _____');
  });

  it('merges chunks into their stroke, new ids become new strokes', () => {
    const a = { id: 1, color: 0, size: 0, points: [1, 2] };
    const merged = mergeStrokes(
      [a],
      [
        { ...a, points: [3, 4] },
        { id: 2, color: 1, size: 2, erase: true as const, points: [5, 6] },
      ],
    );
    expect(merged).toEqual([
      { ...a, points: [1, 2, 3, 4] },
      { id: 2, color: 1, size: 2, erase: true, points: [5, 6] },
    ]);
    expect(a.points).toEqual([1, 2]); // not mutated
  });

  it('style: palette color and width, the eraser paints the background', () => {
    expect(strokeStyle({ color: 1, size: 0 })).toEqual({ color: DRAW_COLORS[1], width: 6 });
    expect(strokeStyle({ color: 1, size: 0, erase: true }).width).toBe(DRAW_ERASER_SIZE);
  });

  it('validates the vector messages', () => {
    const ok = { id: 0, color: 0, size: 1, points: [0, 0, 1000, 750] };
    expect(DrawStrokeSchema.safeParse(ok).success).toBe(true);
    expect(DrawStrokeSchema.safeParse({ ...ok, points: [1, 2, 3] }).success).toBe(false);
    expect(DrawStrokeSchema.safeParse({ ...ok, points: [1.5, 2] }).success).toBe(false);
    expect(DrawStrokeSchema.safeParse({ ...ok, color: DRAW_COLORS.length }).success).toBe(false);
    expect(DrawStrokeSchema.safeParse({ ...ok, points: Array(402).fill(1) }).success).toBe(false);
    const msg = { pin: '123456', questionIndex: 0, strokes: [ok] };
    expect(PlayerDrawPayload.safeParse(msg).success).toBe(true);
    expect(PlayerDrawPayload.safeParse({ ...msg, strokes: Array(21).fill(ok) }).success).toBe(
      false,
    );
  });

  it('built-in list: unique, short words', () => {
    expect(new Set(DRAW_WORDS).size).toBe(DRAW_WORDS.length);
    expect(DRAW_WORDS.every((w) => w.length <= 30)).toBe(true);
  });
});
