import { describe, expect, it } from 'vitest';
import type { PlayerJokersPayload } from '@lbq/shared';
import {
  announcement,
  answeredNow,
  eligibleTargets,
  jokerBlocked,
  jokerPlayable,
  noJokersHere,
  resultLine,
} from './jokers';

const red = { id: 'r', nickname: 'Red', avatar: 'batman' as const };
const batou = { id: 'b', nickname: 'Batou', avatar: 'robin' as const };

const state = (over: Partial<PlayerJokersPayload> = {}): PlayerJokersPayload => ({
  questionIndex: 0,
  hand: ['freeze', 'copy'],
  others: [
    { ...red, teamId: 0 },
    { ...batou, teamId: 1 },
    { id: 'c', nickname: 'Chloé', avatar: 'alfred', teamId: 1 },
  ],
  attacked: [],
  effects: {},
  ...over,
});

describe('joker texts', () => {
  it('announces attacks, blocked attacks and keeps Copieur secret', () => {
    expect(announcement({ questionIndex: 0, joker: 'freeze', by: red, target: batou })).toEqual({
      title: '🥶 Red a gelé Batou !',
      detail: 'Bloqué 5 s sur cette question',
    });
    expect(
      announcement({ questionIndex: 0, joker: 'freeze', by: red, target: batou, blocked: true })
        .title,
    ).toBe('🛡️ Batou bloque le Gel de Red !');
    expect(announcement({ questionIndex: 0, joker: 'copy', by: red }).title).toBe(
      "🦜 Red copie quelqu'un…",
    );
  });

  it('describes the result of each joker', () => {
    expect(resultLine({ kind: 'doubleLost', points: 300 })).toBe('✖️2 Double ou rien : − 300 pts');
    expect(resultLine({ kind: 'stole', points: 120, player: batou })).toBe(
      '🦹 Tu as volé 120 pts à Batou !',
    );
    expect(resultLine({ kind: 'earned', joker: 'shield' })).toBe('🎁 Nouveau joker : 🛡️ Bouclier');
  });
});

describe('joker rules on the phone', () => {
  it('greys out what the question type does not take', () => {
    expect(jokerPlayable(state({ questionType: 'TRUE_FALSE' }), 'fifty')).toBe(false);
    expect(jokerPlayable(state({ questionType: 'MCQ' }), 'fifty')).toBe(true);
    expect(jokerPlayable(state(), 'fifty')).toBe(true);
    expect(noJokersHere(state({ questionType: 'POLL' }))).toBe(true);
    expect(noJokersHere(state({ questionType: 'SLIDER' }))).toBe(false);
  });

  it('solo: everyone but the already attacked players for an attack', () => {
    const solo = state({ attacked: ['b'] });
    solo.others = solo.others.map(({ teamId: _t, ...p }) => p);
    expect(eligibleTargets(solo, 'freeze', null).map((p) => p.id)).toEqual(['r', 'c']);
    expect(eligibleTargets(solo, 'copy', null).map((p) => p.id)).toEqual(['r', 'b', 'c']);
    expect(eligibleTargets(solo, 'double', null)).toEqual([]);
  });

  it('teams: attacks on the other teams, Copieur in your own team', () => {
    expect(eligibleTargets(state(), 'freeze', 0).map((p) => p.id)).toEqual(['b', 'c']);
    expect(eligibleTargets(state(), 'copy', 1).map((p) => p.id)).toEqual(['b', 'c']);
    expect(eligibleTargets(state(), 'thief', 1)).toEqual([]); // T51: the wheel, no target
  });

  it('after answering (T42): 50/50 and Copieur greyed with the reason, the others playable', () => {
    const j = state({ questionType: 'MCQ', answered: ['me', 'b'] });
    expect(answeredNow(j, 'me')).toBe(true);
    expect(answeredNow(j, 'r')).toBe(false);
    expect(answeredNow(j, null)).toBe(false);
    expect(jokerBlocked(j, 'copy', true)).toBe('Seulement avant de répondre');
    expect(jokerBlocked(j, 'fifty', true)).toBe('Seulement avant de répondre');
    expect(jokerPlayable(j, 'double', true)).toBe(true);
    expect(jokerPlayable(j, 'copy')).toBe(true);
    expect(jokerBlocked(state({ questionType: 'SLIDER' }), 'scramble')).toMatch(/Brouilleur/);
  });

  it('Gel / Brouilleur only on players who have not answered yet (T42)', () => {
    const j = state({ answered: ['b'] });
    expect(eligibleTargets(j, 'freeze', 0).map((p) => p.id)).toEqual(['c']);
    expect(eligibleTargets(j, 'scramble', 0).map((p) => p.id)).toEqual(['c']);
    expect(eligibleTargets(j, 'thief', 0)).toEqual([]);
  });
});
