import { describe, expect, it } from 'vitest';
import { computePoints, rankPlayers, topPlayers } from './scoring.js';

describe('computePoints', () => {
  it('gives full points for an instant answer', () => {
    expect(computePoints(1000, 0, 20_000)).toBe(1000);
  });

  it('gives half points at the deadline', () => {
    expect(computePoints(1000, 20_000, 20_000)).toBe(500);
    expect(computePoints(2000, 20_000, 20_000)).toBe(1000);
  });

  it('decreases linearly and rounds', () => {
    expect(computePoints(1000, 10_000, 20_000)).toBe(750);
    expect(computePoints(1000, 1_234, 20_000)).toBe(Math.round(1000 * (1 - 1234 / 20_000 / 2)));
  });

  it('clamps out-of-range response times', () => {
    expect(computePoints(1000, -50, 20_000)).toBe(1000);
    expect(computePoints(1000, 25_000, 20_000)).toBe(500);
  });

  it('gives 0 for a 0-point question', () => {
    expect(computePoints(0, 1000, 20_000)).toBe(0);
  });
});

describe('ranking', () => {
  const players = [
    { id: 'a', nickname: 'Alice', totalScore: 800 },
    { id: 'b', nickname: 'Bob', totalScore: 1500 },
    { id: 'c', nickname: 'Chloé', totalScore: 800 },
    { id: 'd', nickname: 'Dan', totalScore: 0 },
  ];

  it('sorts by score and shares ranks on ties', () => {
    const ranked = rankPlayers(players).map(({ player, rank }) => [player.id, rank]);
    expect(ranked).toEqual([
      ['b', 1],
      ['a', 2],
      ['c', 2],
      ['d', 4],
    ]);
  });

  it('returns the top N as { nickname, score }', () => {
    expect(topPlayers(players, 2)).toEqual([
      { nickname: 'Bob', score: 1500 },
      { nickname: 'Alice', score: 800 },
    ]);
  });
});
