import { describe, expect, it } from 'vitest';
import { computePoints, rankPlayers, sliderPoints, streakBonus, topPlayers } from './scoring.js';

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

describe('streakBonus', () => {
  it('is +100 per correct answer after the first, capped at +500', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 20].map(streakBonus)).toEqual([
      0, 0, 100, 200, 300, 400, 500, 500, 500,
    ]);
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

describe('sliderPoints', () => {
  it('exact guess: full time-based points', () => {
    expect(sliderPoints(800, 1789, 1789, 5)).toEqual({ correct: true, points: 800 });
  });

  it('inside the margin: points decrease linearly to half at the edge', () => {
    expect(sliderPoints(1000, 1791, 1789, 4)).toEqual({ correct: true, points: 750 });
    expect(sliderPoints(1000, 1787, 1789, 4)).toEqual({ correct: true, points: 750 });
    expect(sliderPoints(1000, 1794, 1789, 5)).toEqual({ correct: true, points: 500 });
  });

  it('outside the margin: wrong, 0 points', () => {
    expect(sliderPoints(1000, 1795, 1789, 5)).toEqual({ correct: false, points: 0 });
  });

  it('margin 0: only the exact value, with full points', () => {
    expect(sliderPoints(1000, 42, 42, 0)).toEqual({ correct: true, points: 1000 });
    expect(sliderPoints(1000, 43, 42, 0)).toEqual({ correct: false, points: 0 });
  });

  it('tolerates float steps', () => {
    expect(sliderPoints(1000, 0.1 + 0.2, 0.3, 0).correct).toBe(true);
  });
});
