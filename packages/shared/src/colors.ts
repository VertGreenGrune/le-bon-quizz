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

/** `#rrggbb` (stored in lower case). */
export const HEX_COLOR = /^#[0-9a-f]{6}$/i;
export const HexColor = z
  .string()
  .regex(HEX_COLOR)
  .transform((s) => s.toLowerCase());

/** Paint bucket (T65): how far from the tapped color a pixel can be and still be filled (0–100). */
export const COLORS_MIN_TOLERANCE = 0;
export const COLORS_MAX_TOLERANCE = 100;
export const COLORS_DEFAULT_TOLERANCE = 30;

const zonePlace = { x: z.number().min(0).max(1), y: z.number().min(0).max(1) };
/**
 * A paint-bucket zone (T65): the tap point (picture fractions), the bucket's tolerance and the
 * region's color (its average color on the picture). The region itself is computed again from
 * the picture by the editor; in the game the blank picture (`blankImageUrl`) has it in white.
 */
const BucketZoneSchema = z.object({
  ...zonePlace,
  tolerance: z.number().int().min(COLORS_MIN_TOLERANCE).max(COLORS_MAX_TOLERANCE),
  color: HexColor,
});
/** A round zone (T58, `radius` in picture widths): older questions. */
const RoundZoneSchema = z.object({
  ...zonePlace,
  radius: z.number().min(COLORS_MIN_RADIUS).max(COLORS_MAX_RADIUS),
  color: HexColor,
});
export type BucketZone = z.infer<typeof BucketZoneSchema>;
export type RoundZone = z.infer<typeof RoundZoneSchema>;

/** T58 zones stored a palette index as their color: read it as that color's hex. */
function legacyZone(v: unknown): unknown {
  if (v && typeof v === 'object' && typeof (v as { color?: unknown }).color === 'number') {
    const color = COLOR_PALETTE[(v as { color: number }).color]?.hex;
    return color ? { ...v, color } : v;
  }
  return v;
}

/** A zone of a picture board: a paint-bucket region (T65) or a round zone (T58). */
export const ColorZoneSchema = z.preprocess(
  legacyZone,
  z.union([BucketZoneSchema, RoundZoneSchema]),
);
export type ColorZone = BucketZone | RoundZone;
export const isBucketZone = (zone: ColorZone): zone is BucketZone => 'tolerance' in zone;

/** A zone as everyone sees it before the reveal: its place (and shape), never its color. */
export interface ColorSpot {
  x: number;
  y: number;
  /** In board widths; absent for a paint-bucket zone (a numbered marker at its tap point). */
  radius?: number;
  /** Generated board: the shape drawn there. */
  shape?: ColorShape;
}

/**
 * The board without its colors (TV grey board, phones in stage 2, reveal). Picture board:
 * `imageUrl` (the colored picture: never sent to the phones before the reveal once there is a
 * `blankImageUrl`) and / or `blankImageUrl` (T65: the picture with the zones in white);
 * generated board: `cols` × `rows` grid (its aspect ratio is cols / rows).
 */
export interface ColorBoard {
  imageUrl?: string;
  blankImageUrl?: string;
  cols?: number;
  rows?: number;
  spots: ColorSpot[];
}

/** A color the players can pick (T65: only the board's own colors). `name`: built-in palette. */
export interface OfferedColor {
  hex: string;
  name?: string;
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

/** Zones colored right (an answer slot null / missing = no color). */
export function colorsRight(
  answer: readonly (string | null | undefined)[],
  colors: readonly string[],
): number {
  return colors.reduce((n, c, i) => n + (answer[i] === c ? 1 : 0), 0);
}

/** Time points × the share of the zones right. */
export function colorsPoints(timePoints: number, right: number, total: number): number {
  return total > 0 ? Math.round((timePoints * Math.min(right, total)) / total) : 0;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const part = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Hue 0–360, saturation and lightness 0–1. */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

/** Below this saturation (or very dark / light) a color counts as a grey: sorted after the hues. */
const isGrey = ({ s, l }: { s: number; l: number }) => s < 0.12 || l < 0.08 || l > 0.95;

/**
 * T65: the colors offered to the players — the distinct colors of the board, sorted by hue
 * (greys last, dark to light), never in zone order. Built-in colors keep their name.
 */
export function offeredPalette(colors: readonly string[]): OfferedColor[] {
  const distinct = [...new Set(colors.map((c) => c.toLowerCase()))];
  const key = (hex: string) => {
    const hsl = hexToHsl(hex);
    return isGrey(hsl) ? [1, hsl.l, 0] : [0, hsl.h, hsl.l];
  };
  distinct.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return ka[0]! - kb[0]! || ka[1]! - kb[1]! || ka[2]! - kb[2]! || (a < b ? -1 : 1);
  });
  return distinct.map((hex) => {
    const name = COLOR_PALETTE.find((c) => c.hex === hex)?.name;
    return name ? { hex, name } : { hex };
  });
}

/** A French name for any color: the built-in palette's name, else a rough one from its hue. */
export function colorLabel(hex: string): string {
  const lower = hex.toLowerCase();
  const named = COLOR_PALETTE.find((c) => c.hex === lower)?.name;
  if (named) return named;
  if (!HEX_COLOR.test(hex)) return '—';
  const { h, s, l } = hexToHsl(lower);
  if (l < 0.12) return 'Noir';
  if (l > 0.93) return 'Blanc';
  if (s < 0.12) return 'Gris';
  if (h < 15 || h >= 345) return l > 0.75 ? 'Rose' : 'Rouge';
  if (h < 40) return l < 0.35 ? 'Marron' : 'Orange';
  if (h < 65) return 'Jaune';
  if (h < 160) return 'Vert';
  if (h < 195) return 'Turquoise';
  if (h < 255) return 'Bleu';
  if (h < 290) return 'Violet';
  return 'Rose';
}

/** `colorLabel` + the hex code when it isn't a built-in color (« Vert (#4a8f3c) »). */
export function colorDescription(hex: string): string {
  const lower = hex.toLowerCase();
  return COLOR_PALETTE.some((c) => c.hex === lower)
    ? colorLabel(lower)
    : `${colorLabel(lower)} (${lower})`;
}
