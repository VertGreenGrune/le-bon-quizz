import { describe, expect, it } from 'vitest';
import type { GamePause, GameStatePayload } from '@lbq/shared';
import {
  initialPlayerState,
  pauseWaitingText,
  playerReducer,
  reclaimErrorMessage,
  type PlayerAction,
  type PlayerState,
} from './playerState';

const state = (payload: Partial<GameStatePayload>, now = 0) =>
  ({
    type: 'state',
    payload: {
      phase: 'ANSWERING',
      mode: 'solo',
      questionIndex: 0,
      totalQuestions: 3,
      ...payload,
    },
    now,
  }) satisfies PlayerAction;

const run = (...actions: PlayerAction[]): PlayerState =>
  actions.reduce(playerReducer, { ...initialPlayerState, connected: true });

const bob = { id: 'b', nickname: 'Bob', avatar: 'robin' as const };
const pause = (p: Partial<GamePause> = {}): GamePause => ({
  waitingFor: [bob],
  hostMissing: false,
  sinceMs: 0,
  ...p,
});

describe('player pause', () => {
  it('freezes the timer while paused, then resumes from the frozen value', () => {
    const paused = run(
      state({ remainingMs: 20_000 }, 0),
      state({ remainingMs: 15_000, paused: pause() }, 7_000),
    );
    expect(paused.paused?.waitingFor).toEqual([bob]);
    expect(paused.frozenMs).toBe(15_000);
    expect(paused.resumeAt).toBeNull();

    const counting = run(
      state({ remainingMs: 15_000, paused: pause() }, 7_000),
      state({ remainingMs: 15_000, paused: pause({ waitingFor: [] }) }, 40_000),
      { type: 'resuming', inMs: 3_000, now: 40_000 },
    );
    expect(counting.resumeAt).toBe(43_000);

    const resumed = playerReducer(counting, state({ remainingMs: 15_000 }, 43_000));
    expect(resumed.paused).toBeNull();
    expect(resumed.frozenMs).toBeNull();
    expect(resumed.resumeAt).toBeNull();
    expect(resumed.answeringEndsAt).toBe(58_000);
  });

  it('cancels the countdown if someone drops again', () => {
    const s = run(
      state({ remainingMs: 15_000, paused: pause({ waitingFor: [] }) }),
      { type: 'resuming', inMs: 3_000, now: 0 },
      state({ remainingMs: 15_000, paused: pause() }, 1_000),
    );
    expect(s.resumeAt).toBeNull();
  });

  it('ignores a countdown when not paused', () => {
    expect(run(state({ remainingMs: 1 }), { type: 'resuming', inMs: 3_000, now: 0 }).resumeAt).toBe(
      null,
    );
  });

  it('a prompt received while paused keeps the timer frozen', () => {
    const s = run(state({ remainingMs: 15_000, paused: pause() }, 0), {
      type: 'prompt',
      payload: { index: 0, type: 'MCQ', timeLimitSec: 20, choiceCount: 4 },
      now: 10,
    });
    expect(s.answeringEndsAt).toBeNull();
    expect(s.frozenMs).toBe(15_000);
  });

  it('says who the game is waiting for', () => {
    expect(pauseWaitingText(pause())).toBe('On attend Bob…');
    expect(
      pauseWaitingText(
        pause({ waitingFor: [bob, { ...bob, nickname: 'Zoé' }], hostMissing: true }),
      ),
    ).toBe("On attend Bob, Zoé et l'écran de l'animateur…");
    expect(pauseWaitingText(pause({ waitingFor: [] }))).toBe('Tout le monde est là !');
  });

  it('explains why a takeover was refused', () => {
    expect(reclaimErrorMessage('NICKNAME_TAKEN')).toMatch(/encore connecté/);
    expect(reclaimErrorMessage('GAME_ALREADY_STARTED')).toMatch(/Aucun joueur déconnecté/);
  });
});
