import { describe, expect, it } from 'vitest';
import type { LobbyMember, ThiefWheel } from '@lbq/shared';
import { drawnIndex, sliceCenter, slicePath, wheelResult, wheelRotation } from './wheel';

const m = (id: string): LobbyMember => ({ id, nickname: id, avatar: 'batman' });
const wheel = (drawn: string, extra: Partial<ThiefWheel> = {}): ThiefWheel => ({
  thief: m('Alice'),
  candidates: ['Alice', 'Bob', 'Chloé', 'Dan'].map(m),
  drawn: m(drawn),
  points: 120,
  ...extra,
});

describe('Voleur wheel (T51)', () => {
  it('stops with the drawn slice under the top pointer', () => {
    for (const count of [2, 3, 4, 7, 15])
      for (let i = 0; i < count; i++) {
        const turned = (sliceCenter(i, count) + wheelRotation(i, count)) % 360;
        expect(Math.min(turned, 360 - turned)).toBeCloseTo(0, 6);
        expect(wheelRotation(i, count)).toBeGreaterThanOrEqual(5 * 360);
      }
  });

  it('finds the drawn player and writes the result line', () => {
    expect(drawnIndex(wheel('Chloé'))).toBe(2);
    expect(wheelResult(wheel('Bob'))).toBe('🦹 Alice vole 120 pts à Bob !');
    expect(wheelResult(wheel('Alice'))).toBe(
      '🦹 Pas de chance, Alice se vole lui-même : − 120 pts !',
    );
    expect(wheelResult(wheel('Bob', { blocked: true, points: 0 }))).toBe(
      '🛡️ Bob était protégé par son Bouclier !',
    );
  });

  it('draws slice paths (a full circle for one player)', () => {
    expect(slicePath(0, 4, 100)).toMatch(
      /^M 100 100 L 100\.00 0\.00 A 100 100 0 0 1 200\.00 100\.00 Z$/,
    );
    expect(slicePath(0, 1, 100)).toMatch(/^M 100 0 A/);
  });
});
