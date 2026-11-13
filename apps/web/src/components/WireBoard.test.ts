import { describe, expect, it } from 'vitest';
import type { MatchColumns } from '@lbq/shared';
import { wirePath } from './WireBoard';
import { answerChips, rightLinks } from '../host/matchScreens';

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

  it("shows a player's answer in the board's labels", () => {
    const pairs = [
      { left: { text: 'France' }, right: { text: 'Paris' } },
      { left: { text: 'Italie' }, right: { text: 'Rome' } },
      { left: { text: 'Espagne' }, right: { text: 'Madrid' } },
    ];
    const columns: MatchColumns = {
      left: [pairs[2]!.left, pairs[0]!.left, pairs[1]!.left],
      right: [pairs[1]!.right, pairs[2]!.right, pairs[0]!.right],
    };
    // France ↔ Rome, Italie ↔ Paris (swapped), Espagne ↔ Madrid (right).
    expect(answerChips(columns, pairs, [1, 0, 2])).toEqual([
      { left: '1', right: 'B', ok: true },
      { left: '2', right: 'A', ok: false },
      { left: '3', right: 'C', ok: false },
    ]);
    expect(answerChips(columns, pairs, [-1, -1, 2])[1]).toEqual({
      left: '2',
      right: '—',
      ok: false,
    });
  });
});
