import { describe, expect, it } from 'vitest';
import { COLOR_NONE_HEX, COLOR_PALETTE, COLOR_SHAPES, generatedBoard } from '@lbq/shared';
import {
  boardAspect,
  colorHex,
  firstZone,
  fitBox,
  initialColors,
  nextZone,
  paintZone,
  shapePath,
  zoneShare,
} from './colors';

describe('« Couleurs perdues » helpers', () => {
  it('colors and aspect ratios', () => {
    expect(colorHex(0)).toBe(COLOR_PALETTE[0].hex);
    expect(colorHex(-1)).toBe(COLOR_NONE_HEX);
    expect(colorHex(undefined)).toBe(COLOR_NONE_HEX);
    expect(boardAspect(generatedBoard(COLOR_SHAPES.slice(0, 6)))).toBeCloseTo(1.5);
    expect(boardAspect({ imageUrl: 'x', spots: [] })).toBeCloseTo(4 / 3);
    expect(boardAspect({ imageUrl: 'x', spots: [] }, 2)).toBe(2);
  });

  it('fits the board in its box', () => {
    expect(fitBox(300, 400, 1.5)).toEqual({ width: 300, height: 200 });
    expect(fitBox(600, 200, 1.5)).toEqual({ width: 300, height: 200 });
    expect(fitBox(0, 200, 1.5)).toEqual({ width: 0, height: 0 });
  });

  it('every shape has a path', () => {
    for (const shape of COLOR_SHAPES) expect(shapePath(shape)).toMatch(/^M .* Z$/);
  });

  it('phone: hints in place, painting, next empty zone', () => {
    const colors = initialColors(4, [{ zone: 1, color: 3 }]);
    expect(colors).toEqual([-1, 3, -1, -1]);
    const locked = new Set([1]);
    expect(firstZone(colors, locked)).toBe(0);
    const painted = paintZone(colors, 0, 5);
    expect(painted).toEqual([5, 3, -1, -1]);
    expect(nextZone(painted, 0, locked)).toBe(2);
    expect(paintZone(painted, 0, 5)).toEqual([-1, 3, -1, -1]); // same color again: empty
    expect(nextZone([1, 2, 3, 4], 2)).toBe(2); // all colored: stays
    expect(nextZone([-1, 2, 3, 4], 2)).toBe(0); // wraps around
    expect(initialColors(3, [], [2, -1, 4])).toEqual([2, -1, 4]);
  });

  it('reveal: share per zone of the players who answered', () => {
    const reveal = {
      board: { spots: [] },
      colors: [1, 2],
      zones: [2, 0],
      answers: [
        { nickname: 'A', avatar: 'batman' as const, colors: [1, 2], right: 2, points: 1 },
        { nickname: 'B', avatar: 'batman' as const, colors: [1, 0], right: 1, points: 1 },
        { nickname: 'C', avatar: 'batman' as const, colors: null, right: 0, points: 0 },
      ],
    };
    expect(zoneShare(reveal, 0)).toBe('2 / 2');
    expect(zoneShare(reveal, 1)).toBe('0 / 2');
  });
});
