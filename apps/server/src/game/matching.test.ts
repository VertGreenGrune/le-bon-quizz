import { describe, expect, it } from 'vitest';
import { allowedTypos, levenshtein, matchesAnswer, normalizeAnswer } from './matching.js';

describe('normalizeAnswer', () => {
  it.each([
    ['  Léonard   de Vinci ', 'leonard de vinci'],
    ['PACIFIQUE', 'pacifique'],
    ['Océan Pacifique !', 'ocean pacifique'],
    ["l'Océan", 'ocean'],
    ['L’Atlantique', 'atlantique'],
    ['Le Pacifique', 'pacifique'],
    ['les Alpes', 'alpes'],
    ['une pomme', 'pomme'],
    ['Des œufs', 'oeufs'],
    ['Jean-Paul', 'jean paul'],
    ['Les', 'les'], // an article alone is kept
    ['Lena', 'lena'], // only a whole word is an article
  ])('%j → %j', (input, expected) => {
    expect(normalizeAnswer(input)).toBe(expected);
  });
});

describe('levenshtein / allowedTypos', () => {
  it('counts edits', () => {
    expect(levenshtein('pacifique', 'pacifique')).toBe(0);
    expect(levenshtein('pacifique', 'pacifiqe')).toBe(1);
    expect(levenshtein('pacifique', 'pasifiqeu')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
  });

  it('allows 0 typos under 5 characters, 1 for 5–9, 2 from 10', () => {
    expect([1, 4, 5, 9, 10, 30].map(allowedTypos)).toEqual([0, 0, 1, 1, 2, 2]);
  });
});

describe('matchesAnswer', () => {
  const vinci = ['Léonard de Vinci', 'De Vinci'];

  it('ignores accents, case, punctuation, extra spaces and a leading article', () => {
    expect(matchesAnswer('leonard DE vinci', vinci, false)).toBe(true);
    expect(matchesAnswer('  De-Vinci. ', vinci, false)).toBe(true);
    expect(matchesAnswer("l'océan Pacifique", ['Océan Pacifique'], false)).toBe(true);
    expect(matchesAnswer('Le Pacifique', ['Pacifique'], false)).toBe(true);
  });

  it('rejects empty and different answers', () => {
    expect(matchesAnswer('   ', vinci, true)).toBe(false);
    expect(matchesAnswer('Michel-Ange', vinci, true)).toBe(false);
  });

  it('short answers (< 5 characters) must be exact, even with tolerance', () => {
    expect(matchesAnswer('Rome', ['Rome'], true)).toBe(true);
    expect(matchesAnswer('Rone', ['Rome'], true)).toBe(false);
  });

  it('5–9 characters: one typo with tolerance, not two', () => {
    expect(matchesAnswer('Pacifiqe', ['Pacifique'], true)).toBe(true); // missing letter
    expect(matchesAnswer('Pacifiquee', ['Pacifique'], true)).toBe(true); // extra letter
    expect(matchesAnswer('Pacifiqeu', ['Pacifique'], true)).toBe(false); // 2 edits
    expect(matchesAnswer('Paris', ['Paris'], true)).toBe(true);
    expect(matchesAnswer('Parus', ['Paris'], true)).toBe(true); // 5 characters
  });

  it('10+ characters: two typos with tolerance, not three', () => {
    expect(matchesAnswer('Leonar de Vinsi', vinci, true)).toBe(true);
    expect(matchesAnswer('Leonar de Vinsy', ['Léonard de Vinci'], true)).toBe(false);
  });

  it('without tolerance, a typo is wrong', () => {
    expect(matchesAnswer('Pacifiqe', ['Pacifique'], false)).toBe(false);
    expect(matchesAnswer('Leonar de Vinci', ['Léonard de Vinci'], false)).toBe(false);
  });

  it('numbers must match exactly', () => {
    expect(matchesAnswer('8', ['8'], true)).toBe(true);
    expect(matchesAnswer('9', ['8'], true)).toBe(false);
    expect(matchesAnswer('1789', ['1789'], true)).toBe(true);
    expect(matchesAnswer('1788', ['1789'], true)).toBe(false);
    expect(matchesAnswer('Louis 14', ['Louis 16'], true)).toBe(false);
    expect(matchesAnswer('Apollo 11', ['Apollo 11'], true)).toBe(true);
  });
});
