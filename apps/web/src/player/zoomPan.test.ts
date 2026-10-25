import { describe, expect, it } from 'vitest';
import { IDENTITY, MAX_SCALE, clampView, zoomAt } from './zoomPan';

describe('zoom / pan of the PIN picture', () => {
  it('zooms around a point: the picture point under the fingers stays there', () => {
    const v = zoomAt(IDENTITY, 2, 100, 50, 400, 300);
    expect(v).toEqual({ scale: 2, x: -100, y: -50 });
    // The picture point (100, 50) is still under (100, 50): 100 * 2 - 100 = 100.
    expect(100 * v.scale + v.x).toBe(100);
  });

  it('never zooms out below 1 nor in above the maximum', () => {
    expect(zoomAt(IDENTITY, 0.5, 0, 0, 400, 300).scale).toBe(1);
    expect(zoomAt(IDENTITY, 10, 0, 0, 400, 300).scale).toBe(MAX_SCALE);
  });

  it('keeps the picture covering the viewport (no empty border when panning)', () => {
    expect(clampView({ scale: 2, x: 50, y: 20 }, 400, 300)).toEqual({ scale: 2, x: 0, y: 0 });
    expect(clampView({ scale: 2, x: -999, y: -999 }, 400, 300)).toEqual({
      scale: 2,
      x: -400,
      y: -300,
    });
    expect(clampView({ scale: 1, x: -30, y: 10 }, 400, 300)).toEqual(IDENTITY);
  });
});
