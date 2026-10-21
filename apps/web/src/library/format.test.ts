import { describe, expect, it } from 'vitest';
import { playedLabel } from './format';

describe('playedLabel', () => {
  it('says how many games were played', () => {
    expect(playedLabel(0)).toBe('jamais joué');
    expect(playedLabel(1)).toBe('joué 1 fois');
    expect(playedLabel(12)).toBe('joué 12 fois');
  });
});
