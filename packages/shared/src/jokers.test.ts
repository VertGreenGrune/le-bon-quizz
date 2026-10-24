import { describe, expect, it } from 'vitest';
import { jokerAllowed, jokerAvailability } from './index.js';

describe('jokerAvailability (T28 « Buzzer »)', () => {
  it('no joker on a buzzer question, whatever its type; a pending Gel still lands', () => {
    for (const type of ['MCQ', 'TYPE_ANSWER', 'SLIDER', 'ORDER'] as const) {
      expect(jokerAvailability(type, true)).toEqual({
        jokers: false,
        unavailable: [],
        scramble: false,
        freeze: true,
      });
      expect(jokerAllowed(type, 'freeze', true)).toBe(false);
      expect(jokerAllowed(type, 'freeze')).toBe(true);
    }
  });
});

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

describe('jokerAvailability (T26 « Mytho ! »)', () => {
  it('Copieur, 50/50, Double ou rien… but no Brouilleur nor Sablier', () => {
    expect(jokerAvailability('BLUFF')).toEqual({
      jokers: true,
      unavailable: ['scramble', 'hourglass'],
      scramble: false,
    });
    for (const joker of ['copy', 'fifty', 'double', 'freeze', 'shield', 'thief'] as const)
      expect(jokerAllowed('BLUFF', joker)).toBe(true);
  });
});
