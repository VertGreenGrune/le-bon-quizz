import {
  COLOR_NONE_HEX,
  COLOR_PALETTE,
  type ColorBoard,
  type ColorShape,
  type ColorsReveal,
  type ColorSpot,
  type OfferedColor,
  hexToHsl,
} from '@lbq/shared';

/**
 * « Couleurs perdues » (T58): pure helpers shared by the TV, the phone, the editor and the
 * report (board geometry, shapes, the phone's color picking).
 */

/** A color of a board: `#rrggbb` (T65), or a built-in palette index (reports saved before T65). */
export type BoardColor = string | number | null | undefined;

/** Hex of a board color (null / -1 / unknown = the grey of an empty zone). */
export function colorHex(color: BoardColor): string {
  if (typeof color === 'string') return /^#[0-9a-f]{6}$/i.test(color) ? color : COLOR_NONE_HEX;
  return (color !== undefined && color !== null && COLOR_PALETTE[color]?.hex) || COLOR_NONE_HEX;
}

/** Two board colors are the same color (hex or a legacy palette index). */
export const sameColor = (a: BoardColor, b: BoardColor): boolean =>
  a !== null &&
  a !== undefined &&
  a !== -1 &&
  colorHex(a).toLowerCase() === colorHex(b).toLowerCase();

/** Black text on light colors, white on the others. */
export function textOn(hex: string): string {
  const { l } = hexToHsl(hex);
  return l > 0.62 ? '#000000' : '#ffffff';
}

/** The picture of a picture board: the colored one when colors are shown, else the blank one. */
export function boardPicture(board: ColorBoard, colored: boolean): string | undefined {
  return colored
    ? (board.imageUrl ?? board.blankImageUrl)
    : (board.blankImageUrl ?? board.imageUrl);
}

/** Generated board aspect ratio (width / height), or the picture's (4:3 until it is loaded). */
export function boardAspect(board: ColorBoard, pictureAspect?: number): number {
  if (board.imageUrl || board.blankImageUrl)
    return pictureAspect && pictureAspect > 0 ? pictureAspect : 4 / 3;
  return (board.cols ?? 1) / (board.rows ?? 1);
}

/** The biggest box of this aspect ratio that fits in `width` × `height`. */
export function fitBox(width: number, height: number, aspect: number) {
  if (width <= 0 || height <= 0 || aspect <= 0) return { width: 0, height: 0 };
  const w = Math.min(width, height * aspect);
  return { width: Math.floor(w), height: Math.floor(w / aspect) };
}

/** SVG path of a shape centred on 0,0, inside the -1…1 square. */
export function shapePath(shape: ColorShape): string {
  switch (shape) {
    case 'circle':
      return 'M -1 0 A 1 1 0 1 0 1 0 A 1 1 0 1 0 -1 0 Z';
    case 'square':
      return 'M -0.85 -0.85 H 0.85 V 0.85 H -0.85 Z';
    case 'triangle':
      return 'M 0 -1 L 1 0.85 L -1 0.85 Z';
    case 'diamond':
      return 'M 0 -1 L 0.8 0 L 0 1 L -0.8 0 Z';
    case 'star':
      return polygon(10, (i) => (i % 2 === 0 ? 1 : 0.45));
    case 'hexagon':
      return polygon(6, () => 1, 0);
    case 'cross':
      return 'M -0.32 -1 H 0.32 V -0.32 H 1 V 0.32 H 0.32 V 1 H -0.32 V 0.32 H -1 V -0.32 H -0.32 Z';
    case 'heart':
      return 'M 0 1 C -0.2 0.75 -1 0.25 -1 -0.3 C -1 -0.85 -0.4 -1.05 0 -0.55 C 0.4 -1.05 1 -0.85 1 -0.3 C 1 0.25 0.2 0.75 0 1 Z';
  }
}

function polygon(points: number, radius: (i: number) => number, start = -Math.PI / 2): string {
  const step = (2 * Math.PI) / points;
  return (
    Array.from({ length: points }, (_, i) => {
      const r = radius(i);
      const a = start + i * step;
      return `${i === 0 ? 'M' : 'L'} ${(r * Math.cos(a)).toFixed(3)} ${(r * Math.sin(a)).toFixed(3)}`;
    }).join(' ') + ' Z'
  );
}

/**
 * Phone: the colors to start from (indexes in the offered palette) — the 50/50 hints (hex)
 * already in place, the rest empty.
 */
export function initialColors(
  zones: number,
  hints: readonly { zone: number; color: string }[] = [],
  palette: readonly OfferedColor[] = [],
  previous?: readonly number[],
): number[] {
  const colors = Array.from({ length: zones }, (_, i) => previous?.[i] ?? -1);
  for (const h of hints) {
    const index = palette.findIndex((c) => c.hex === h.color);
    if (h.zone >= 0 && h.zone < zones && index >= 0) colors[h.zone] = index;
  }
  return colors;
}

/** Phone: the hex of each zone from its palette index (-1 = none → null). */
export const paletteColors = (
  colors: readonly number[],
  palette: readonly OfferedColor[],
): (string | null)[] => colors.map((c) => palette[c]?.hex ?? null);

/**
 * The spot nearest to a tap (board fractions; `aspect` = width / height, so distances are measured
 * the same way across and down).
 */
export function nearestSpot(
  spots: readonly ColorSpot[],
  x: number,
  y: number,
  aspect: number,
): number {
  let best = -1;
  let bestDistance = Infinity;
  spots.forEach((s, i) => {
    const d = Math.hypot((s.x - x) * aspect, s.y - y);
    if (d < bestDistance) {
      best = i;
      bestDistance = d;
    }
  });
  return best;
}

/**
 * Phone: after a color is put on `from`, the next zone to select — the next empty one (wrapping
 * around), else stays on `from`. Locked zones (50/50) are skipped.
 */
export function nextZone(
  colors: readonly number[],
  from: number,
  locked: ReadonlySet<number> = new Set(),
): number {
  for (let step = 1; step <= colors.length; step++) {
    const i = (from + step) % colors.length;
    if (colors[i] === -1 && !locked.has(i)) return i;
  }
  return from;
}

/** First zone to select: the first empty unlocked one (0 when all are colored). */
export function firstZone(colors: readonly number[], locked: ReadonlySet<number> = new Set()) {
  const i = colors.findIndex((c, z) => c === -1 && !locked.has(z));
  return i >= 0 ? i : 0;
}

/** Phone: puts `color` on `zone` (the same color again empties it). */
export function paintZone(colors: readonly number[], zone: number, color: number): number[] {
  return colors.map((c, i) => (i === zone ? (c === color ? -1 : color) : c));
}

/** Reveal (TV / report): « 3 / 4 » share right of the players who answered, per zone. */
export function zoneShare(reveal: ColorsReveal, zone: number): string {
  const answered = reveal.answers.filter((a) => a.colors).length;
  return `${reveal.zones[zone] ?? 0} / ${answered}`;
}
