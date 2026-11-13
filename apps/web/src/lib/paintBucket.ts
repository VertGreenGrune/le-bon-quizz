import { hexToRgb, isBucketZone, rgbToHex, type ColorZone } from '@lbq/shared';

/**
 * « Couleurs perdues » paint bucket (T65): pure pixel helpers of the editor. The picture is an
 * RGBA pixel array (`ImageData.data`); a region is a mask (1 = in the region) of the same size.
 */
export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Longest side of the copy the editor works on (and of the blank picture). */
export const BUCKET_MAX_SIDE = 1600;

/** Size of the working copy of a `width` × `height` picture (never bigger). */
export function workingSize(width: number, height: number, max = BUCKET_MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height, 1));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Largest channel difference a pixel may have with the tapped one: 0–100 → 0–255. */
export const toleranceLimit = (tolerance: number) =>
  Math.round((Math.min(100, Math.max(0, tolerance)) / 100) * 255);

/**
 * Flood fill from the pixel under (x, y) (picture fractions): every pixel connected to it (4
 * neighbours) whose color is within the tolerance of the tapped color. `blocked` pixels (other
 * regions) are never filled, so regions never overlap. Transparent pixels count as white.
 */
export function floodFill(
  px: Pixels,
  x: number,
  y: number,
  tolerance: number,
  blocked?: Uint8Array,
): Uint8Array {
  const { data, width, height } = px;
  const mask = new Uint8Array(width * height);
  const sx = Math.min(width - 1, Math.max(0, Math.floor(x * width)));
  const sy = Math.min(height - 1, Math.max(0, Math.floor(y * height)));
  const start = sy * width + sx;
  if (blocked?.[start]) return mask;
  const [r0, g0, b0] = rgbAt(data, start);
  const limit = toleranceLimit(tolerance);
  const near = (i: number) => {
    const [r, g, b] = rgbAt(data, i);
    return Math.abs(r - r0) <= limit && Math.abs(g - g0) <= limit && Math.abs(b - b0) <= limit;
  };
  const stack = new Int32Array(width * height);
  let top = 0;
  stack[top++] = start;
  mask[start] = 1;
  while (top > 0) {
    const i = stack[--top]!;
    const cx = i % width;
    const visit = (j: number) => {
      if (!mask[j] && !blocked?.[j] && near(j)) {
        mask[j] = 1;
        stack[top++] = j;
      }
    };
    if (cx > 0) visit(i - 1);
    if (cx < width - 1) visit(i + 1);
    if (i >= width) visit(i - width);
    if (i < width * (height - 1)) visit(i + width);
  }
  return mask;
}

function rgbAt(data: Uint8ClampedArray, i: number): [number, number, number] {
  const o = i * 4;
  const a = data[o + 3]! / 255;
  // Over white: a transparent pixel is white.
  return [
    data[o]! * a + 255 * (1 - a),
    data[o + 1]! * a + 255 * (1 - a),
    data[o + 2]! * a + 255 * (1 - a),
  ];
}

/** Average color of a region (`#rrggbb`); white for an empty one. */
export function averageColor(px: Pixels, mask: Uint8Array): string {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const [pr, pg, pb] = rgbAt(px.data, i);
    r += pr;
    g += pg;
    b += pb;
    n++;
  }
  return n ? rgbToHex(r / n, g / n, b / n) : '#ffffff';
}

/** Share of the picture a region covers (0–1). */
export function regionShare(mask: Uint8Array): number {
  let n = 0;
  for (const v of mask) n += v;
  return mask.length ? n / mask.length : 0;
}

/** Largest channel difference between two colors (0–255). */
export function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.max(Math.abs(r1 - r2), Math.abs(g1 - g2), Math.abs(b1 - b2));
}

/**
 * Two regions of the same paint never average to the exact same color: a new color this close
 * to one already used is that color (so the players get one swatch, not two look-alikes).
 */
export const SAME_COLOR_DISTANCE = 12;
export function snapColor(color: string, used: readonly string[]): string {
  return used.find((u) => colorDistance(u, color) <= SAME_COLOR_DISTANCE) ?? color;
}

/**
 * Every zone's region, in zone order (a region never takes the pixels of an earlier one), and
 * its color: the region's average color, snapped to an earlier zone's color when they look the
 * same. Round zones (T58) are discs (`radius` in picture widths) with their own color.
 */
export function computeRegions(
  px: Pixels,
  zones: readonly ColorZone[],
): { masks: Uint8Array[]; colors: string[] } {
  const taken = new Uint8Array(px.width * px.height);
  const masks: Uint8Array[] = [];
  const colors: string[] = [];
  for (const zone of zones) {
    const mask = isBucketZone(zone)
      ? floodFill(px, zone.x, zone.y, zone.tolerance, taken)
      : disc(px, zone.x, zone.y, zone.radius, taken);
    for (let i = 0; i < mask.length; i++) if (mask[i]) taken[i] = 1;
    masks.push(mask);
    colors.push(isBucketZone(zone) ? snapColor(averageColor(px, mask), colors) : zone.color);
  }
  return { masks, colors };
}

function disc(px: Pixels, x: number, y: number, radius: number, blocked: Uint8Array) {
  const { width, height } = px;
  const mask = new Uint8Array(width * height);
  const cx = x * width;
  const cy = y * height;
  const r = radius * width;
  for (let py = Math.max(0, Math.floor(cy - r)); py < Math.min(height, cy + r + 1); py++)
    for (let pxl = Math.max(0, Math.floor(cx - r)); pxl < Math.min(width, cx + r + 1); pxl++) {
      const i = py * width + pxl;
      if (!blocked[i] && Math.hypot(pxl + 0.5 - cx, py + 0.5 - cy) <= r) mask[i] = 1;
    }
  return mask;
}

/** Index of the region a pixel (picture fractions) belongs to, or -1. */
export function regionAt(px: Pixels, masks: readonly Uint8Array[], x: number, y: number): number {
  const sx = Math.min(px.width - 1, Math.max(0, Math.floor(x * px.width)));
  const sy = Math.min(px.height - 1, Math.max(0, Math.floor(y * px.height)));
  const i = sy * px.width + sx;
  return masks.findIndex((m) => m[i] === 1);
}

/**
 * The blank picture: a copy with every region painted white — grown by one pixel into pixels of
 * no region, so the anti-aliased edge of a region doesn't keep a rim of its color.
 */
export function whiten(px: Pixels, masks: readonly Uint8Array[]): Uint8ClampedArray<ArrayBuffer> {
  const { width, height } = px;
  const out = new Uint8ClampedArray(px.data);
  const all = new Uint8Array(width * height);
  for (const m of masks) for (let i = 0; i < m.length; i++) if (m[i]) all[i] = 1;
  const paint = new Uint8Array(all);
  for (let i = 0; i < all.length; i++) {
    if (all[i]) continue;
    const x = i % width;
    if (
      (x > 0 && all[i - 1]) ||
      (x < width - 1 && all[i + 1]) ||
      (i >= width && all[i - width]) ||
      (i < width * (height - 1) && all[i + width])
    )
      paint[i] = 1;
  }
  for (let i = 0; i < paint.length; i++) {
    if (!paint[i]) continue;
    out[i * 4] = 255;
    out[i * 4 + 1] = 255;
    out[i * 4 + 2] = 255;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** What the blank picture depends on: the picture and the zones' places and settings. */
export function blankKey(imageUrl: string | undefined, zones: readonly ColorZone[]): string {
  return JSON.stringify([
    imageUrl ?? '',
    zones.map((z) => (isBucketZone(z) ? [z.x, z.y, z.tolerance] : [z.x, z.y, z.radius])),
  ]);
}
