import { describe, expect, it } from 'vitest';
import {
  averageColor,
  blankKey,
  computeRegions,
  floodFill,
  regionAt,
  regionShare,
  snapColor,
  toleranceLimit,
  whiten,
  workingSize,
  type Pixels,
} from './paintBucket';

/** A picture from rows of letters: R red, P pink (a bit darker in `p`), G green, K black. */
const COLORS: Record<string, [number, number, number]> = {
  R: [220, 30, 40],
  P: [244, 166, 192],
  p: [236, 158, 184],
  G: [60, 143, 74],
  K: [0, 0, 0],
  W: [255, 255, 255],
};
function picture(rows: string[]): Pixels {
  const width = rows[0]!.length;
  const height = rows.length;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      const o = (y * width + x) * 4;
      data.set([...COLORS[c]!, 255], o);
    }),
  );
  return { data, width, height };
}
const count = (mask: Uint8Array) => mask.reduce((n, v) => n + v, 0);

//              0123456789
const ROWS = [
  'RRRRKPPPPP', // 0
  'RRRRKPpPPP', // 1
  'RRRRKPPPPP', // 2
  'KKKKKKKKKK', // 3
  'GGGGKRRRRR', // 4
  'GGGGKRRRRR', // 5
];
const at = (x: number, y: number) => ({ x: (x + 0.5) / 10, y: (y + 0.5) / 6 });

describe('paint bucket (T65)', () => {
  it('fills the connected area of similar color, never past a border', () => {
    const px = picture(ROWS);
    const red = floodFill(px, at(0, 0).x, at(0, 0).y, 30);
    expect(count(red)).toBe(12); // the top-left red block only, not the other red one
    expect(red[0]).toBe(1);
    expect(red[5 * 10 + 5]).toBe(0);
    // The darker pink pixel is in the pink area with a tolerance, not without.
    expect(count(floodFill(px, at(5, 0).x, at(5, 0).y, 10))).toBe(15);
    expect(count(floodFill(px, at(5, 0).x, at(5, 0).y, 0))).toBe(14);
    // Tolerance 100: everything connected.
    expect(count(floodFill(px, 0, 0, 100))).toBe(60);
    expect(toleranceLimit(30)).toBe(77);
  });

  it('average color, share, regions in order without overlap', () => {
    const px = picture(ROWS);
    const pink = floodFill(px, at(6, 1).x, at(6, 1).y, 10);
    // 14 × (244,166,192) + (236,158,184), averaged and rounded.
    expect(averageColor(px, pink)).toBe('#f3a5bf');
    expect(regionShare(pink)).toBeCloseTo(15 / 60);
    expect(averageColor(px, new Uint8Array(60))).toBe('#ffffff');

    const { masks, colors } = computeRegions(px, [
      { ...at(0, 0), tolerance: 30, color: '#000000' },
      { ...at(6, 4), tolerance: 30, color: '#000000' },
      { ...at(1, 4), tolerance: 30, color: '#000000' },
      // A disc (T58 round zone) keeps its own color and skips taken pixels.
      { x: 0.05, y: 0.08, radius: 0.15, color: '#2563eb' },
    ]);
    // The second red block: the same paint as the first → the same color (one swatch).
    expect(colors).toEqual(['#dc1e28', '#dc1e28', '#3c8f4a', '#2563eb']);
    expect(count(masks[3]!)).toBe(0);
    expect(regionAt(px, masks, at(7, 5).x, at(7, 5).y)).toBe(1);
    expect(regionAt(px, masks, at(4, 3).x, at(4, 3).y)).toBe(-1);
  });

  it('snaps look-alike colors, keeps different ones', () => {
    expect(snapColor('#dd1f2a', ['#3c8f4a', '#dc1e28'])).toBe('#dc1e28');
    expect(snapColor('#f4a6c0', ['#dc1e28'])).toBe('#f4a6c0');
  });

  it('whitens the regions and their 1-pixel rim', () => {
    const px = picture(['GGGKW', 'GGGKW']);
    const green = floodFill(px, 0, 0, 20);
    const out = whiten(px, [green]);
    const pixel = (x: number, y: number) => [...out.slice((y * 5 + x) * 4, (y * 5 + x) * 4 + 3)];
    expect(pixel(0, 0)).toEqual([255, 255, 255]);
    expect(pixel(3, 0)).toEqual([255, 255, 255]); // the rim
    expect(pixel(4, 0)).toEqual([255, 255, 255]); // was white
    // The source is untouched.
    expect([...px.data.slice(0, 3)]).toEqual([60, 143, 74]);
    const px2 = picture(['GGKKR']);
    const out2 = whiten(px2, [floodFill(px2, 0, 0, 20)]);
    expect([...out2.slice(12, 15)]).toEqual([0, 0, 0]); // two pixels away: kept
  });

  it('working size and the blank picture key', () => {
    expect(workingSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(workingSize(800, 600)).toEqual({ width: 800, height: 600 });
    const zones = [{ x: 0.1, y: 0.2, tolerance: 30, color: '#ffffff' }];
    expect(blankKey('a.png', zones)).toBe(blankKey('a.png', [{ ...zones[0]!, color: '#000000' }]));
    expect(blankKey('a.png', zones)).not.toBe(blankKey('b.png', zones));
    expect(blankKey('a.png', zones)).not.toBe(blankKey('a.png', [{ ...zones[0]!, tolerance: 31 }]));
  });
});
