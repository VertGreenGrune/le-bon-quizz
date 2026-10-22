import { describe, expect, it } from 'vitest';
import type { GameStatePayload, PlayerJokersPayload } from '@lbq/shared';
import { nextAnnouncements } from '../lib/jokers';
import { hostReducer, initialHostState } from '../host/hostReducer';
import { copyingTarget, initialPlayerState, jokerEffects, playerReducer } from './playerState';

const bob = { id: 'b', nickname: 'Bob', avatar: 'robin' as const };
const answering: GameStatePayload = {
  phase: 'ANSWERING',
  mode: 'solo',
  questionIndex: 1,
  totalQuestions: 4,
  remainingMs: 20_000,
  jokers: true,
};
const jokers = (over: Partial<PlayerJokersPayload> = {}): PlayerJokersPayload => ({
  questionIndex: 1,
  questionType: 'MCQ',
  hand: ['double'],
  others: [bob],
  attacked: [],
  effects: {},
  ...over,
});

const withState = (payload = answering) =>
  playerReducer(initialPlayerState, { type: 'state', payload, now: 0 });

describe('phone joker state', () => {
  it('knows the game has jokers and keeps the effects of the current question only', () => {
    let s = withState();
    expect(s.jokerGame).toBe(true);
    s = playerReducer(s, {
      type: 'jokers',
      payload: jokers({ effects: { hiddenChoices: [2, 3] } }),
    });
    expect(jokerEffects(s)).toEqual({ hiddenChoices: [2, 3] });
    s = playerReducer(s, {
      type: 'state',
      payload: { ...answering, phase: 'QUESTION_INTRO', questionIndex: 2 },
      now: 0,
    });
    expect(jokerEffects(s)).toEqual({}); // stale effects of question 1
  });

  it('Copieur: waiting for the target until the copy happened', () => {
    let s = playerReducer(withState(), {
      type: 'jokers',
      payload: jokers({ played: { joker: 'copy', target: bob } }),
    });
    expect(copyingTarget(s)).toEqual(bob);
    s = playerReducer(s, {
      type: 'jokers',
      payload: jokers({ played: { joker: 'copy', target: bob }, effects: { copied: true } }),
    });
    expect(copyingTarget(s)).toBeNull();
  });

  it('keeps the last announcement with its arrival time', () => {
    const s = playerReducer(withState(), {
      type: 'jokerUsed',
      payload: { questionIndex: 1, joker: 'freeze', by: bob, target: bob },
      now: 42,
    });
    expect(s.jokerNews).toMatchObject({ joker: 'freeze', at: 42 });
  });
});

describe('host joker state', () => {
  it('reads the jokers flag from game:state', () => {
    expect(
      hostReducer(initialHostState, { type: 'state', payload: answering, now: 0 }).jokers,
    ).toBe(true);
  });

  it('queues the announcements one after the other', () => {
    let q = nextAnnouncements<number>([], 1);
    q = nextAnnouncements(q, 2);
    expect(q).toEqual([1, 2]);
    expect(nextAnnouncements(q, null)).toEqual([2]);
  });
});
