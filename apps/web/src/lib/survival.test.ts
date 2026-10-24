import { describe, expect, it } from 'vitest';
import type { SurvivalStatePayload } from '@lbq/shared';
import { hostReducer, initialHostState, isLastQuestion } from '../host/hostReducer';
import { initialPlayerState, mySurvival, playerReducer } from '../player/playerState';
import { announcement } from './jokers';
import { eliminatedAt, heartsText, survivalLabel, survivors } from './survival';

const member = (id: string) => ({ id, nickname: id, avatar: 'batman' as const });
const state: SurvivalStatePayload = {
  hearts: 3,
  players: [
    { ...member('alice'), hearts: 2, lastLoss: 1 },
    { ...member('bob'), hearts: 0, eliminatedAt: 1, lastLoss: 1, haunts: 1 },
    { ...member('chloe'), hearts: 0, eliminatedAt: 0, lastLoss: 0 },
  ],
};

describe('« Survie » helpers', () => {
  it('draws hearts left / lost, and a ghost', () => {
    expect(heartsText(2, 3)).toBe('❤️❤️🖤');
    expect(heartsText(3, 3)).toBe('❤️❤️❤️');
    expect(heartsText(0, 3)).toBe('👻');
  });

  it('finds who was eliminated on a question and who is alive', () => {
    expect(eliminatedAt(state, 1).map((p) => p.id)).toEqual(['bob']);
    expect(eliminatedAt(state, 2)).toEqual([]);
    expect(eliminatedAt(null, 0)).toEqual([]);
    expect(survivors(state).map((p) => p.id)).toEqual(['alice']);
  });

  it('labels the leaderboard / report lines (questions numbered from 1)', () => {
    expect(survivalLabel({ hearts: 2 })).toBe('❤️ 2');
    expect(survivalLabel({ hearts: 0, eliminatedAt: 1 })).toBe('👻 éliminé à la question 2');
  });

  it('announces haunts on the TV and the phones', () => {
    const p = {
      questionIndex: 1,
      by: member('bob'),
      target: member('alice'),
      haunt: true as const,
    };
    expect(announcement({ ...p, joker: 'freeze' }).title).toBe('👻 bob hante alice : Gel !');
    expect(announcement({ ...p, joker: 'scramble' }).title).toBe(
      '👻 bob hante alice : Brouilleur !',
    );
    expect(announcement({ ...p, joker: 'freeze', blocked: true }).title).toMatch(/^🛡️/);
  });

  it('the host screen keeps the hearts and goes to the podium once the game is over', () => {
    let host = hostReducer(initialHostState, {
      type: 'state',
      payload: { phase: 'LEADERBOARD', mode: 'survival', questionIndex: 1, totalQuestions: 5 },
      now: 0,
    });
    host = hostReducer(host, { type: 'survival', payload: state });
    expect(host.survival).toBe(state);
    expect(isLastQuestion(host)).toBe(false);
    host = hostReducer(host, { type: 'survival', payload: { ...state, finished: true } });
    expect(isLastQuestion(host)).toBe(true);
  });

  it('the phone finds its own hearts', () => {
    let phone = playerReducer(initialPlayerState, {
      type: 'session',
      playerId: 'bob',
      nickname: 'bob',
      totalScore: 0,
    });
    expect(mySurvival(phone)).toBeNull();
    phone = playerReducer(phone, { type: 'survival', payload: state });
    expect(mySurvival(phone)).toMatchObject({ hearts: 0, haunts: 1 });
  });
});
