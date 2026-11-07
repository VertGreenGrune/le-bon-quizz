import { describe, expect, it } from 'vitest';
import { MAX_WRONG_CODES, TvPairing, WRONG_CODES_WINDOW_MS } from './tvPairing.js';

describe('TvPairing (T47)', () => {
  it('gives 4-digit codes, keeps a socket’s code and reuses a wanted free code', () => {
    const tvs = new TvPairing();
    const a = tvs.register('a');
    expect(a).toMatch(/^\d{4}$/);
    expect(tvs.register('a')).toBe(a);
    expect(tvs.register('b', '0042')).toBe('0042');
    // Taken by b: c gets another one.
    expect(tvs.register('c', '0042')).not.toBe('0042');
  });

  it('never gives the same code twice', () => {
    const draws = [0.1234, 0.1234, 0.5678];
    const tvs = new TvPairing(() => draws.shift() ?? 0.9);
    expect(tvs.register('a')).toBe('1234');
    expect(tvs.register('b')).toBe('5678');
  });

  it('claims a code once, and frees it when the TV leaves', () => {
    const tvs = new TvPairing();
    const code = tvs.register('tv');
    expect(tvs.claim(code, 'host')).toBe('tv');
    expect(() => tvs.claim(code, 'host')).toThrow(/Aucune TV/);
    const again = tvs.register('tv2', '0007');
    tvs.disconnected('tv2');
    expect(() => tvs.claim(again, 'host')).toThrow(/Aucune TV/);
  });

  it('refuses for a minute after too many wrong codes', () => {
    let now = 0;
    const tvs = new TvPairing(Math.random, () => now);
    const code = tvs.register('tv', '1111');
    for (let i = 0; i < MAX_WRONG_CODES; i++) expect(() => tvs.claim('2222', 'host')).toThrow();
    expect(() => tvs.claim(code, 'host')).toThrow(/Trop de codes/);
    now += WRONG_CODES_WINDOW_MS;
    expect(tvs.claim(code, 'host')).toBe('tv');
  });
});
