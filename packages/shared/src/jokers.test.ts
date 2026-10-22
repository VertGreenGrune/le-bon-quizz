import { describe, expect, it } from 'vitest';
import { jokerAllowed, jokerAvailability } from './index.js';

describe('jokerAvailability (Wave 6: T27 question types)', () => {
  it('ordre / point: every joker except 50/50, no Brouilleur', () => {
    for (const type of ['ORDER', 'PIN'] as const) {
      expect(jokerAllowed(type, 'fifty')).toBe(false);
      expect(jokerAllowed(type, 'copy')).toBe(true);
      expect(jokerAllowed(type, 'double')).toBe(true);
      expect(jokerAvailability(type).scramble).toBe(false);
    }
  });

  it('« Qui de nous ? » / nuage de mots: no right answer, so no jokers (like a poll)', () => {
    for (const type of ['WHO_OF_US', 'WORD_CLOUD', 'POLL'] as const) {
      expect(jokerAvailability(type).jokers).toBe(false);
      expect(jokerAllowed(type, 'double')).toBe(false);
    }
  });
});
