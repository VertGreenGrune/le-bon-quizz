import { describe, expect, it } from 'vitest';
import { itemLetter, orderCells } from './orderItems';

describe('ORDER helpers', () => {
  it('labels the shown items A, B, C…', () => {
    expect([0, 1, 2].map(itemLetter)).toEqual(['A', 'B', 'C']);
  });

  it('colours a player list position by position (T50)', () => {
    expect(orderCells([1, 0, 2])).toEqual([
      { rank: 2, right: false },
      { rank: 1, right: false },
      { rank: 3, right: true },
    ]);
    expect(orderCells([])).toEqual([]);
  });
});
