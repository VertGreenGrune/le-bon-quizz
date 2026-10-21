import { describe, expect, it } from 'vitest';
import { effectFrame, zoomOrigin } from './imageEffect';

describe('effectFrame', () => {
  it('blur: 30 px → 0', () => {
    expect(effectFrame('blur', 0).blurPx).toBe(30);
    expect(effectFrame('blur', 0.5).blurPx).toBe(15);
    expect(effectFrame('blur', 1)).toEqual({ blurPx: 0, scale: 1, blocks: null });
  });

  it('zoom: ×6 → ×1', () => {
    expect(effectFrame('zoom', 0).scale).toBe(6);
    expect(effectFrame('zoom', 0.8).scale).toBeCloseTo(2);
    expect(effectFrame('zoom', 1).scale).toBe(1);
  });

  it('pixelate: 8 blocks, then twice as many at a steady pace, full resolution at the end', () => {
    expect(effectFrame('pixelate', 0, 1024).blocks).toBe(8);
    const blocks = [0.1, 0.2, 0.3, 0.45, 0.6, 0.75, 0.9].map(
      (p) => effectFrame('pixelate', p, 1024).blocks,
    );
    expect(blocks).toEqual([8, 16, 32, 64, 128, 256, 512]);
    expect(effectFrame('pixelate', 1, 1024).blocks).toBeNull();
    expect(effectFrame('pixelate', 0.9, 20).blocks).toBe(16); // small picture
  });

  it('no effect / out-of-range progress', () => {
    expect(effectFrame(undefined, 0)).toEqual({ blurPx: 0, scale: 1, blocks: null });
    expect(effectFrame('none', 0)).toEqual({ blurPx: 0, scale: 1, blocks: null });
    expect(effectFrame('blur', -2).blurPx).toBe(30);
    expect(effectFrame('blur', 3).blurPx).toBe(0);
    expect(effectFrame('blur', NaN).blurPx).toBe(30);
  });
});

describe('zoomOrigin', () => {
  it('is stable for a seed and away from the edges', () => {
    expect(zoomOrigin('a')).toEqual(zoomOrigin('a'));
    expect(zoomOrigin('a')).not.toEqual(zoomOrigin('b'));
    for (const seed of ['x', 'http://h/uploads/1.png#3', '']) {
      const { x, y } = zoomOrigin(seed);
      for (const v of [x, y]) {
        expect(v).toBeGreaterThanOrEqual(25);
        expect(v).toBeLessThanOrEqual(75);
      }
    }
  });
});
