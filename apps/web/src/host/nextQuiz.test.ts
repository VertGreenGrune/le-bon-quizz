import { describe, expect, it } from 'vitest';
import type { GameStatePayload, RankedPlayer } from '@lbq/shared';
import { hostReducer, initialHostState, type HostGameState } from './hostReducer';
import { currentOptions } from './nextQuiz';
import { initialRemoteState, remoteReducer } from '../remote/remoteState';
import { initialPlayerState, playerReducer, playerScreen } from '../player/playerState';

const state = (p: Partial<GameStatePayload>): GameStatePayload => ({
  phase: 'LOBBY',
  mode: 'solo',
  questionIndex: -1,
  totalQuestions: 3,
  ...p,
});
const alice: RankedPlayer = { nickname: 'Alice', avatar: 'batman', score: 1200 };
const member = { id: 'a', nickname: 'Alice', avatar: 'batman' as const };

describe('« Quiz suivant » on the TV and the remote (T47)', () => {
  it('drops everything from the previous quiz when the round changes', () => {
    let s: HostGameState = hostReducer(initialHostState, {
      type: 'state',
      payload: state({ phase: 'PODIUM', questionIndex: 2, jokers: true }),
      now: 0,
    });
    s = hostReducer(s, { type: 'podium', top: [alice] });
    s = hostReducer(s, { type: 'leaderboard', top: [alice] });
    s = hostReducer(s, { type: 'players', payload: { players: [member] }, now: 0 });
    expect(s.podium).toHaveLength(1);

    s = hostReducer(s, {
      type: 'state',
      payload: state({ round: 2, quizTitle: 'Deuxième quiz' }),
      now: 0,
    });
    expect(s).toMatchObject({
      round: 2,
      quizTitle: 'Deuxième quiz',
      phase: 'LOBBY',
      jokers: false,
      podium: [],
      leaderboard: [],
      players: [member], // re-sent right after anyway
    });
  });

  it('a host reload in a later round keeps working (resync from scratch)', () => {
    const s = hostReducer(initialHostState, {
      type: 'state',
      payload: state({ phase: 'ANSWERING', questionIndex: 0, round: 3, quizTitle: 'Q' }),
      now: 0,
    });
    expect(s).toMatchObject({ round: 3, phase: 'ANSWERING', questionIndex: 0 });
  });

  it('the remote forgets the previous answer', () => {
    let r = remoteReducer(initialRemoteState, {
      type: 'state',
      payload: state({ phase: 'QUESTION_INTRO', questionIndex: 0 }),
      now: 0,
    });
    r = remoteReducer(r, { type: 'answer', payload: { index: 0, answer: ['Paris'] } });
    expect(r.answer).not.toBeNull();
    r = remoteReducer(r, { type: 'state', payload: state({ round: 2 }), now: 0 });
    expect(r.answer).toBeNull();
  });

  it('preselects the current game options', () => {
    const base = { ...initialHostState, jokers: true };
    expect(currentOptions(base)).toEqual({ mode: 'solo', jokers: true });
    expect(
      currentOptions({
        ...initialHostState,
        mode: 'teams',
        teams: [
          { id: 0, name: 'Rouge', members: [] },
          { id: 1, name: 'Bleue', members: [] },
          { id: 2, name: 'Jaune', members: [] },
        ],
      }),
    ).toEqual({ mode: 'teams', teamCount: 3 });
    expect(
      currentOptions({
        ...initialHostState,
        mode: 'survival',
        survival: { hearts: 2, players: [] },
      }),
    ).toEqual({ mode: 'survival', hearts: 2 });
  });
});

describe('« Quiz suivant » on the phone (T47)', () => {
  it('keeps the player, resets the game and shows the new lobby', () => {
    let s = playerReducer(initialPlayerState, {
      type: 'session',
      playerId: 'a',
      nickname: 'Alice',
      avatar: 'batman',
      totalScore: 0,
    });
    s = playerReducer(s, {
      type: 'state',
      payload: state({ phase: 'ENDED', questionIndex: 2 }),
      now: 0,
    });
    s = playerReducer(s, { type: 'podium', top: [alice] });
    s = { ...s, totalScore: 1200 };
    expect(playerScreen(s)).toBe('ended');

    s = playerReducer(s, {
      type: 'state',
      payload: state({ mode: 'teams', round: 2, quizTitle: 'Deuxième quiz' }),
      now: 0,
    });
    expect(playerScreen(s)).toBe('lobby');
    expect(s).toMatchObject({
      round: 2,
      quizTitle: 'Deuxième quiz',
      mode: 'teams',
      playerId: 'a',
      nickname: 'Alice',
      avatar: 'batman',
      totalScore: 0,
      podium: null,
      result: null,
    });
  });
});
