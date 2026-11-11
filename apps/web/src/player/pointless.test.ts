import { describe, expect, it } from 'vitest';
import type { PlayerResultPayload } from '@lbq/shared';
import { pointlessResultLine, pointlessResultTitle } from './pointless';

const result = (correct: boolean, sharedBy: number, yours?: string): PlayerResultPayload => ({
  correct,
  pointsEarned: correct ? Math.round(1000 / sharedBy) : 0,
  streak: 0,
  streakBonus: 0,
  totalScore: 0,
  rank: 1,
  pointless: { sharedBy, ...(yours && { yours }) },
});

describe('« Pas évident ! » phone result', () => {
  it('titles: unique, shared, wrong, no answer', () => {
    expect(pointlessResultTitle(result(true, 1, 'Djibouti'), true)).toBe('💎 Pas évident !');
    expect(pointlessResultTitle(result(true, 3, 'Maroc'), true)).toBe('Bien vu !');
    expect(pointlessResultTitle(result(false, 0, 'Paris'), true)).toBe('Raté !');
    expect(pointlessResultTitle(result(false, 0), false)).toBe('Temps écoulé !');
  });

  it('lines: nobody else / « 3 joueurs ont dit Maroc » / nothing when wrong', () => {
    expect(pointlessResultLine({ sharedBy: 1, yours: 'Djibouti' })).toBe(
      'Personne d’autre n’y a pensé !',
    );
    expect(pointlessResultLine({ sharedBy: 3, yours: 'Maroc' })).toContain(
      '3 joueurs ont dit Maroc',
    );
    expect(pointlessResultLine({ sharedBy: 0, yours: 'Paris' })).toBeNull();
  });
});
