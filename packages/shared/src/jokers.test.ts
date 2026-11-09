import { describe, expect, it } from 'vitest';
import {
  introDurationMs,
  jokerAllowed,
  jokerAvailability,
  jokerRefusal,
  JOKER_INTRO_MS,
  MAX_INTRO_MS,
  QUESTION_INTRO_MS,
} from './index.js';

describe('jokerAvailability (T28 « Buzzer »)', () => {
  it('no joker on a buzzer question, whatever its type; a pending Gel still lands', () => {
    for (const type of ['MCQ', 'TYPE_ANSWER', 'SLIDER', 'ORDER'] as const) {
      expect(jokerAvailability(type, true)).toEqual({
        jokers: false,
        unavailable: [],
        scramble: false,
        freeze: true,
        afterAnswer: [],
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
      afterAnswer: ['freeze', 'double', 'shield', 'thief'],
    });
    for (const joker of ['copy', 'fifty', 'double', 'freeze', 'shield', 'thief'] as const)
      expect(jokerAllowed('BLUFF', joker)).toBe(true);
  });
});

describe('T42: jokers on the current question, after answering, intro length', () => {
  it('Brouilleur only on choix multiple, refused with a reason elsewhere', () => {
    expect(jokerAllowed('MCQ', 'scramble')).toBe(true);
    for (const type of ['TRUE_FALSE', 'TYPE_ANSWER', 'SLIDER', 'ORDER', 'PIN', 'BLUFF'] as const) {
      expect(jokerAllowed(type, 'scramble')).toBe(false);
      expect(jokerRefusal(type, 'scramble')).toMatch(/Brouilleur/);
    }
  });

  it('after answering: Gel, Brouilleur, Voleur, Double, Bouclier, Sablier — not 50/50 nor Copieur', () => {
    expect(jokerAvailability('MCQ').afterAnswer).toEqual([
      'freeze',
      'scramble',
      'double',
      'shield',
      'thief',
      'hourglass',
    ]);
    expect(jokerAvailability('SLIDER').afterAnswer).not.toContain('scramble');
    for (const joker of ['fifty', 'copy'] as const) {
      expect(jokerAllowed('MCQ', joker, false, true)).toBe(false);
      expect(jokerRefusal('MCQ', joker, { answered: true })).toBe('Seulement avant de répondre');
      expect(jokerAllowed('MCQ', joker)).toBe(true);
    }
    expect(jokerAllowed('MCQ', 'double', false, true)).toBe(true);
    expect(jokerRefusal('POLL', 'double')).toBe('Pas de joker sur cette question');
    expect(jokerRefusal('MCQ', 'double', { buzzer: true })).toMatch(/buzzer/);
  });

  it('intro: 3 s, 8 s with jokers, + 1 s per 40 characters beyond 80, at most 12 s', () => {
    expect(introDurationMs('Court ?', false)).toBe(QUESTION_INTRO_MS);
    expect(introDurationMs('Court ?', true)).toBe(JOKER_INTRO_MS);
    expect(introDurationMs('x'.repeat(80), false)).toBe(3000);
    expect(introDurationMs('x'.repeat(81), false)).toBe(4000);
    expect(introDurationMs('x'.repeat(120), false)).toBe(4000);
    expect(introDurationMs('x'.repeat(121), true)).toBe(10_000);
    expect(introDurationMs('x'.repeat(1000), true)).toBe(MAX_INTRO_MS);
    expect(introDurationMs('x'.repeat(1000), false)).toBe(MAX_INTRO_MS);
  });
});
