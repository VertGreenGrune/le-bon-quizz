import { describe, expect, it } from 'vitest';
import {
  POTATO_TICK_FAST_MS,
  POTATO_TICK_SLOW_MS,
  passesLabel,
  potatoDanger,
  potatoResultTitle,
  potatoTickMs,
} from './potato';

describe('« Patate chaude » helpers', () => {
  it('the ticking speeds up until the shortest fuse, then stays at its fastest', () => {
    expect(potatoTickMs(0, 30)).toBe(POTATO_TICK_SLOW_MS);
    const mid = potatoTickMs(15_000, 30);
    expect(mid).toBeLessThan(POTATO_TICK_SLOW_MS);
    expect(mid).toBeGreaterThan(POTATO_TICK_FAST_MS);
    expect(potatoTickMs(30_000, 30)).toBe(POTATO_TICK_FAST_MS);
    expect(potatoTickMs(90_000, 30)).toBe(POTATO_TICK_FAST_MS);
    expect(potatoTickMs(-5, 30)).toBe(POTATO_TICK_SLOW_MS);
    expect(potatoDanger(0, 30)).toBe(0);
    expect(potatoDanger(60_000, 30)).toBe(1);
  });

  it('result title and passes label', () => {
    const loser = { id: 'b', nickname: 'Bob', avatar: 'batman' as const };
    const base = { passes: 0, passPoints: 0, survivorPoints: 0 };
    expect(potatoResultTitle({ potato: { ...base, exploded: true, loser } })).toContain('Boum');
    expect(potatoResultTitle({ potato: { ...base, exploded: false, loser } })).toBe('Sauvé !');
    expect(potatoResultTitle({ potato: { ...base, exploded: false } })).toBe(
      'Pas de partie de patate…',
    );
    expect([0, 1, 3].map(passesLabel)).toEqual(['aucune passe', '1 passe', '3 passes']);
  });
});
