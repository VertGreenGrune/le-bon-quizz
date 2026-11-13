import { describe, expect, it } from 'vitest';
import type { MatchColumns } from '@lbq/shared';
import { wirePath } from './WireBoard';
import { rightLinks } from '../host/matchScreens';

describe('« Associer » wires (T67)', () => {
  it('a cable leaves each plug horizontally', () => {
    expect(wirePath({ x: 0, y: 10 }, { x: 100, y: 50 })).toBe('M 0 10 C 45 25, 55 65, 100 50');
  });

  it('finds the right cables in the shown order', () => {
    const pairs = [
      { left: { text: 'France' }, right: { text: 'Paris' } },
      { left: { text: 'Italie' }, right: { text: 'Rome' } },
      { left: { text: 'Espagne' }, right: { text: 'Madrid' } },
    ];
    const columns: MatchColumns = {
      left: [pairs[2]!.left, pairs[0]!.left, pairs[1]!.left],
      right: [pairs[1]!.right, pairs[2]!.right, pairs[0]!.right],
    };
    expect(rightLinks(columns, pairs)).toEqual({ links: [1, 2, 0], pairOf: [2, 0, 1] });
  });
});
