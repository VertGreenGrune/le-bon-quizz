import { describe, expect, it } from 'vitest';
import type { PlayerResultPayload } from '@lbq/shared';
import { isOuterSlot, linePositions, parseGuess, slotLabel, wagerResultTitle } from './wager';

describe('« Paris sur les réponses » helpers', () => {
  it('parses typed numbers (French comma, spaces, sign)', () => {
    expect(parseGuess('1789')).toBe(1789);
    expect(parseGuess(' 2,5 ')).toBe(2.5);
    expect(parseGuess('1 000 000')).toBe(1_000_000);
    expect(parseGuess('1 000')).toBe(1000);
    expect(parseGuess('-3.25')).toBe(-3.25);
    expect(parseGuess('−7')).toBe(-7);
    expect(parseGuess('.5')).toBe(0.5);
    for (const bad of ['', 'abc', '1,2,3', '12e5', '-', '1e13', '9'.repeat(14)])
      expect(parseGuess(bad)).toBeNull();
  });

  it('labels slots, outer slots', () => {
    expect(slotLabel(null)).toBe('Plus petit que tout');
    expect(slotLabel(2.5, 'km')).toBe('2,5 km');
    expect([0, 1, 2, 3].map((i) => isOuterSlot(i, 4))).toEqual([true, false, false, true]);
    expect(isOuterSlot(0, 1)).toBe(true);
  });

  it('places values on the number line (5 %–95 %)', () => {
    const pos = linePositions([10, 20, 110]);
    expect(pos(10)).toBeCloseTo(0.05);
    expect(pos(110)).toBeCloseTo(0.95);
    expect(pos(60)).toBeCloseTo(0.5);
    expect(linePositions([7, 7])(7)).toBe(0.5);
  });

  it('result titles', () => {
    const r = (correct: boolean, wager: Partial<NonNullable<PlayerResultPayload['wager']>>) =>
      ({
        correct,
        wager: { correct: 1, winning: 1, won: correct, author: false, authorPoints: 0, ...wager },
      }) as PlayerResultPayload;
    expect(wagerResultTitle(r(true, { bet: 1 }))).toBe('Pari gagné !');
    expect(wagerResultTitle(r(false, { author: true }))).toBe('Bien estimé !');
    expect(wagerResultTitle(r(false, { bet: null }))).toBe('Pari perdu !');
    expect(wagerResultTitle(r(false, {}))).toBe('Temps écoulé !');
  });
});
