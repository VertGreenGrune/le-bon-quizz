import { describe, expect, it } from 'vitest';
import { isPermutation, orderPoints, placedCount, shuffleOrder } from './order.js';
import { PIN_FALLOFF, pinPoints } from './pin.js';
import { mostVoted, tallyVotes, voteCounts } from './whoOfUs.js';
import { wordCloud } from './wordCloud.js';

/** Deterministic pseudo-random numbers in [0, 1). */
function seeded(seed: number): () => number {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

describe('ORDER', () => {
  it('shuffles without leaving any item in its place', () => {
    for (let n = 3; n <= 6; n++) {
      for (let seed = 1; seed <= 50; seed++) {
        const display = shuffleOrder(n, seeded(seed));
        expect(isPermutation(display, n)).toBe(true);
        display.forEach((v, i) => expect(v).not.toBe(i));
      }
    }
  });

  it('counts the items in place and gives a share of the points', () => {
    const display = [2, 0, 3, 1]; // shown 0 is the 3rd item, shown 1 the 1st…
    const right = [1, 3, 0, 2];
    expect(placedCount(right, display)).toBe(4);
    expect(placedCount([0, 1, 2, 3], display)).toBe(0); // untouched
    expect(placedCount([1, 3, 2, 0], display)).toBe(2);
    expect(orderPoints(1000, 4, 4)).toEqual({ correct: true, points: 1000 });
    expect(orderPoints(1000, 3, 4)).toEqual({ correct: false, points: 750 });
    expect(orderPoints(900, 1, 3)).toEqual({ correct: false, points: 300 });
    expect(orderPoints(1000, 0, 4)).toEqual({ correct: false, points: 0 });
  });

  it('checks the answer is a permutation of the shown indexes', () => {
    expect(isPermutation([2, 0, 1], 3)).toBe(true);
    expect(isPermutation([0, 1], 3)).toBe(false);
    expect(isPermutation([0, 0, 1], 3)).toBe(false);
    expect(isPermutation([0, 1, 3], 3)).toBe(false);
  });
});

describe('PIN', () => {
  const zone = { x: 0.5, y: 0.5, radius: 0.1 };

  it('full points inside the zone (edge included)', () => {
    expect(pinPoints(1000, { x: 0.5, y: 0.5 }, zone)).toEqual({ correct: true, points: 1000 });
    expect(pinPoints(800, { x: 0.6, y: 0.5 }, zone)).toEqual({ correct: true, points: 800 });
  });

  it('outside: wrong, half the points just past the edge down to 0 at the falloff', () => {
    expect(pinPoints(1000, { x: 0.6001, y: 0.5 }, zone).correct).toBe(false);
    expect(pinPoints(1000, { x: 0.6001, y: 0.5 }, zone).points).toBe(500);
    expect(pinPoints(1000, { x: 0.5, y: 0.6 + PIN_FALLOFF / 2 }, zone).points).toBe(250);
    expect(pinPoints(1000, { x: 0.5, y: 0.6 + PIN_FALLOFF }, zone)).toEqual({
      correct: false,
      points: 0,
    });
    expect(pinPoints(1000, { x: 0, y: 0 }, zone).points).toBe(0);
  });
});

describe('WHO_OF_US', () => {
  const players = [
    { id: 'a', nickname: 'Alice', avatar: 'batman' as const },
    { id: 'b', nickname: 'Bob', avatar: 'robin' as const },
    { id: 'c', nickname: 'Chloé', avatar: 'joker' as const },
  ];

  it('finds the most voted players, ties included', () => {
    expect([...mostVoted(tallyVotes(['b', 'b', 'c']))]).toEqual(['b']);
    expect([...mostVoted(tallyVotes(['b', 'c', 'a', 'c', 'b']))].sort()).toEqual(['b', 'c']);
    expect(mostVoted(tallyVotes([])).size).toBe(0);
  });

  it('lists the players with votes, most voted first then by nickname', () => {
    expect(voteCounts(tallyVotes(['c', 'b', 'c', 'b', 'a', 'gone']), players)).toEqual([
      { nickname: 'Bob', avatar: 'robin', count: 2 },
      { nickname: 'Chloé', avatar: 'joker', count: 2 },
      { nickname: 'Alice', avatar: 'batman', count: 1 },
    ]);
  });
});

describe('WORD_CLOUD', () => {
  it('groups after normalization, first typing shown, most frequent first', () => {
    expect(wordCloud(['Génial', 'genial!', 'Les chats', 'chats', 'GÉNIAL', '???'])).toEqual([
      { text: 'Génial', count: 3 },
      { text: 'Les chats', count: 2 },
    ]);
  });

  it('keeps the 40 most typed words', () => {
    const words = Array.from({ length: 50 }, (_, i) => `mot${i}`);
    expect(wordCloud([...words, 'mot49'])).toHaveLength(40);
    expect(wordCloud([...words, 'mot49'])[0]).toEqual({ text: 'mot49', count: 2 });
  });
});
