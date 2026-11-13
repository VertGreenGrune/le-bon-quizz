import { describe, expect, it } from 'vitest';
import type { EveningStanding } from '@lbq/shared';
import { eveningLine } from './evening';
import { eveningSubtitle } from '../host/eveningScreens';

const evening: EveningStanding[] = [
  { nickname: 'Alice', avatar: 'joker', score: 5400, quizzes: 2 },
  { nickname: 'Bob', avatar: 'robin', score: 3000, quizzes: 2 },
  { nickname: 'Chloé', avatar: 'batman', score: 3000, quizzes: 1 },
];

describe('« 🌙 Classement de la soirée » (T66)', () => {
  it('tells the phone its place, ties sharing a rank', () => {
    expect(eveningLine(evening, 'Alice')).toBe('🌙 Soirée : 1er sur 3 · 5400 pts');
    expect(eveningLine(evening, 'Chloé')).toBe('🌙 Soirée : 2e sur 3 · 3000 pts');
    expect(eveningLine(evening, 'Dan')).toBeNull();
    expect(eveningLine(null, 'Alice')).toBeNull();
  });

  it('counts the quizzes of the evening', () => {
    expect(eveningSubtitle(evening)).toBe('après 2 quiz');
    expect(eveningSubtitle([])).toBe('');
  });
});
