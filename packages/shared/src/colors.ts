import { z } from 'zod';

/**
 * « Couleurs perdues » (T58): a colored board (generated shapes, or zones on a picture) shown on
 * the TV for `memoSec`; then it turns grey and every player puts the colors back with this
 * palette. Index in the palette = the color of an answer (`player:answer { colors }`).
 */
export const COLOR_PALETTE = [
  { name: 'Rouge', hex: '#e11d48' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Jaune', hex: '#facc15' },
  { name: 'Vert', hex: '#16a34a' },
  { name: 'Bleu', hex: '#2563eb' },
  { name: 'Violet', hex: '#9333ea' },
  { name: 'Rose', hex: '#f9a8d4' },
  { name: 'Noir', hex: '#111111' },
] as const;
export const COLOR_COUNT = COLOR_PALETTE.length;
/** Grey of a zone before / without a color. */
export const COLOR_NONE_HEX = '#9ca3af';

/** Generated board: number of shapes. */
export const COLORS_MIN_CELLS = 4;
export const COLORS_MAX_CELLS = 12;
export const COLORS_DEFAULT_CELLS = 6;
/** Picture board: number of zones. */
export const COLORS_MIN_ZONES = 2;
export const COLORS_MAX_ZONES = 12;
export const COLORS_MIN_RADIUS = 0.02;
export const COLORS_MAX_RADIUS = 0.25;
/** Memorizing time (stage 1) and answering time (stage 2, `timeLimitSec`). */
export const COLORS_MIN_MEMO_SEC = 5;
export const COLORS_MAX_MEMO_SEC = 60;
export const COLORS_DEFAULT_MEMO_SEC = 20;
export const COLORS_DEFAULT_SEC = 30;

/** Shapes of a generated board. */
export const COLOR_SHAPES = [
  'circle',
  'square',
  'triangle',
  'star',
  'heart',
  'diamond',
  'hexagon',
  'cross',
] as const;
export type ColorShape = (typeof COLOR_SHAPES)[number];

export const ColorIndex = z
  .number()
  .int()
  .min(0)
  .max(COLOR_COUNT - 1);

/** A zone of a picture board (picture fractions like PIN; `radius` in picture widths). */
export const ColorZoneSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  radius: z.number().min(COLORS_MIN_RADIUS).max(COLORS_MAX_RADIUS),
  color: ColorIndex,
});
export type ColorZone = z.infer<typeof ColorZoneSchema>;

/** A zone as everyone sees it before the reveal: its place (and shape), never its color. */
export interface ColorSpot {
  x: number;
  y: number;
  /** In board widths. */
  radius: number;
  /** Generated board: the shape drawn there. */
  shape?: ColorShape;
}

/**
 * The board without its colors (TV grey board, phones in stage 2, reveal). Picture board:
 * `imageUrl`; generated board: `cols` × `rows` grid (its aspect ratio is cols / rows).
 */
export interface ColorBoard {
  imageUrl?: string;
  cols?: number;
  rows?: number;
  spots: ColorSpot[];
}

/** Grid of a generated board: 4 → 2 × 2, 6 → 3 × 2, 8 → 4 × 2, 9 → 3 × 3, 12 → 4 × 3. */
export function colorGrid(cells: number): { cols: number; rows: number } {
  if (cells <= 4) return { cols: 2, rows: 2 };
  if (cells <= 6) return { cols: 3, rows: 2 };
  if (cells <= 8) return { cols: 4, rows: 2 };
  if (cells <= 9) return { cols: 3, rows: 3 };
  return { cols: 4, rows: 3 };
}

/** Generated board: one shape per cell, row by row, the last row centred. */
export function generatedBoard(shapes: readonly ColorShape[]): ColorBoard {
  const { cols, rows } = colorGrid(shapes.length);
  const spots = shapes.map((shape, i) => {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, shapes.length - row * cols);
    const col = i % cols;
    const offset = (cols - inRow) / 2;
    return {
      x: round4((col + 0.5 + offset) / cols),
      y: round4((row + 0.5) / rows),
      radius: round4(0.42 / cols),
      shape,
    };
  });
  return { cols, rows, spots };
}

const round4 = (v: number) => Math.round(v * 10_000) / 10_000;

/** Zones colored right (an answer slot -1 = no color). */
export function colorsRight(answer: readonly number[], colors: readonly number[]): number {
  return colors.reduce((n, c, i) => n + (answer[i] === c ? 1 : 0), 0);
}

/** Time points × the share of the zones right. */
export function colorsPoints(timePoints: number, right: number, total: number): number {
  return total > 0 ? Math.round((timePoints * Math.min(right, total)) / total) : 0;
}

export const colorName = (index: number): string => COLOR_PALETTE[index]?.name ?? '—';
