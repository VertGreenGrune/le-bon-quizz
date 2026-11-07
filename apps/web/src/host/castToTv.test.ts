import { describe, expect, it } from 'vitest';
import { cleanTvCode, tvUrl } from './castToTv';

describe('« 📺 Afficher sur la TV » (T47)', () => {
  it('keeps at most 4 digits of the typed code', () => {
    expect(cleanTvCode('12 3a45')).toBe('1234');
    expect(cleanTvCode('abc')).toBe('');
  });

  it('points the TV to /tv', () => {
    expect(tvUrl('http://192.168.1.45:5173')).toBe('http://192.168.1.45:5173/tv');
  });
});
