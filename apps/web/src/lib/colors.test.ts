import { describe, expect, it } from 'vitest';
import { COLOR_NONE_HEX, COLOR_PALETTE, COLOR_SHAPES, generatedBoard } from '@lbq/shared';
import {
  boardAspect,
  boardPicture,
  colorHex,
  nearestSpot,
  paletteColors,
  sameColor,
  textOn,
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
    const palette = [
      { hex: '#16a34a' },
      { hex: '#2563eb' },
      { hex: '#9333ea' },
      { hex: '#e11d48' },
    ];
    const colors = initialColors(4, [{ zone: 1, color: '#e11d48' }], palette);
    expect(colors).toEqual([-1, 3, -1, -1]);
    // A hint of a color that isn't offered (can't happen) is ignored.
    expect(initialColors(2, [{ zone: 0, color: '#000000' }], palette)).toEqual([-1, -1]);
    const locked = new Set([1]);
    expect(firstZone(colors, locked)).toBe(0);
    const painted = paintZone(colors, 0, 2);
    expect(painted).toEqual([2, 3, -1, -1]);
    expect(paletteColors(painted, palette)).toEqual(['#9333ea', '#e11d48', null, null]);
    expect(nextZone(painted, 0, locked)).toBe(2);
    expect(paintZone(painted, 0, 2)).toEqual([-1, 3, -1, -1]); // same color again: empty
    expect(nextZone([1, 2, 3, 4], 2)).toBe(2); // all colored: stays
    expect(nextZone([-1, 2, 3, 4], 2)).toBe(0); // wraps around
    expect(initialColors(3, [], palette, [2, -1, 4])).toEqual([2, -1, 4]);
  });

  it('hex colors, legacy palette indexes, the nearest marker', () => {
    expect(colorHex('#3c8f4a')).toBe('#3c8f4a');
    expect(colorHex(null)).toBe(COLOR_NONE_HEX);
    expect(sameColor('#E11D48', 0)).toBe(true); // a report saved before T65
    expect(sameColor(null, '#e11d48')).toBe(false);
    expect(sameColor(-1, -1)).toBe(false);
    expect(textOn('#f9a8d4')).toBe('#000000');
    expect(textOn('#111111')).toBe('#ffffff');
    const board = { imageUrl: 'a.png', blankImageUrl: 'b.png', spots: [] };
    expect(boardPicture(board, true)).toBe('a.png');
    expect(boardPicture(board, false)).toBe('b.png');
    expect(boardPicture({ imageUrl: 'a.png', spots: [] }, false)).toBe('a.png');
    expect(boardAspect({ blankImageUrl: 'b.png', spots: [] }, 2)).toBe(2);
    const spots = [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.5, y: 0.9 },
    ];
    expect(nearestSpot(spots, 0.2, 0.2, 1)).toBe(0);
    expect(nearestSpot(spots, 0.6, 0.6, 1)).toBe(2);
    // A wide board: across counts more than down.
    expect(nearestSpot(spots, 0.75, 0.6, 4)).toBe(1);
  });

  it('reveal: share per zone of the players who answered', () => {
    const reveal = {
      board: { spots: [] },
      colors: ['#f97316', '#facc15'],
      zones: [2, 0],
      answers: [
        {
          nickname: 'A',
          avatar: 'batman' as const,
          colors: ['#f97316', '#facc15'],
          right: 2,
          points: 1,
        },
        {
          nickname: 'B',
          avatar: 'batman' as const,
          colors: ['#f97316', null],
          right: 1,
          points: 1,
        },
        { nickname: 'C', avatar: 'batman' as const, colors: null, right: 0, points: 0 },
      ],
    };
    expect(zoneShare(reveal, 0)).toBe('2 / 2');
    expect(zoneShare(reveal, 1)).toBe('0 / 2');
  });
});
