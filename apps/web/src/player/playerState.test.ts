import { describe, expect, it } from 'vitest';
import type { GameStatePayload } from '@lbq/shared';
import {
  errorMessage,
  formatRank,
  initialPlayerState,
  normalizePin,
  playerReducer,
  playerScreen,
  type PlayerAction,
  type PlayerState,
} from './playerState';

const state = (payload: Partial<GameStatePayload> & Pick<GameStatePayload, 'phase'>, now = 0) =>
  ({
    type: 'state',
    payload: { mode: 'solo', questionIndex: 0, totalQuestions: 3, ...payload },
    now,
  }) satisfies PlayerAction;

const run = (...actions: PlayerAction[]): PlayerState =>
  actions.reduce(playerReducer, { ...initialPlayerState, connected: true });

describe('playerScreen', () => {
  it('connecting until the first game:state', () => {
    expect(playerScreen(run())).toBe('connecting');
  });

  it('follows the game phases of one question', () => {
    const lobby = run(state({ phase: 'LOBBY', questionIndex: -1 }));
    expect(playerScreen(lobby)).toBe('lobby');

    const intro = playerReducer(lobby, state({ phase: 'QUESTION_INTRO' }));
    expect(playerScreen(intro)).toBe('getReady');

    // ANSWERING without the prompt yet → still "get ready"
    const answering = playerReducer(intro, state({ phase: 'ANSWERING', remainingMs: 20000 }, 1000));
    expect(playerScreen(answering)).toBe('getReady');

    const prompted = playerReducer(answering, {
      type: 'prompt',
      payload: { index: 0, type: 'MCQ', choiceCount: 4, timeLimitSec: 20 },
      now: 1100,
    });
    expect(playerScreen(prompted)).toBe('answer');
    // remainingMs from game:state wins over the prompt's full time limit
    expect(prompted.answeringEndsAt).toBe(21000);

    const answered = playerReducer(prompted, {
      type: 'answer',
      questionIndex: 0,
      answer: { choiceIndex: 2 },
    });
    expect(playerScreen(answered)).toBe('answered');

    const reveal = playerReducer(answered, state({ phase: 'REVEAL' }));
    expect(playerScreen(reveal)).toBe('waitingResult');

    const result = playerReducer(reveal, {
      type: 'result',
      payload: {
        correct: true,
        pointsEarned: 800,
        streak: 1,
        streakBonus: 0,
        totalScore: 800,
        rank: 1,
      },
    });
    expect(playerScreen(result)).toBe('result');
    expect(result.totalScore).toBe(800);

    const board = playerReducer(result, state({ phase: 'LEADERBOARD' }));
    expect(playerScreen(board)).toBe('standings');
    expect(board.result?.rank).toBe(1);
  });

  it('kicked and lost override the phase', () => {
    expect(playerScreen(run(state({ phase: 'ANSWERING' }), { type: 'kicked' }))).toBe('kicked');
    expect(
      playerScreen(run(state({ phase: 'LOBBY' }), { type: 'lost', code: 'GAME_NOT_FOUND' })),
    ).toBe('lost');
  });
});

describe('playerReducer', () => {
  const prompt = (index: number, now = 0): PlayerAction => ({
    type: 'prompt',
    payload: { index, type: 'MCQ', choiceCount: 4, timeLimitSec: 10 },
    now,
  });

  it('accepts only one answer per question', () => {
    const s = run(
      state({ phase: 'ANSWERING' }),
      prompt(0),
      { type: 'answer', questionIndex: 0, answer: { choiceIndex: 1 } },
      { type: 'answer', questionIndex: 0, answer: { choiceIndex: 3 } },
    );
    expect(s.myAnswer).toEqual({ questionIndex: 0, choiceIndex: 1 });
  });

  it('keeps a typed text or a slider value as the answer', () => {
    const typed = run(state({ phase: 'ANSWERING' }), prompt(0), {
      type: 'answer',
      questionIndex: 0,
      answer: { text: 'Pacifique' },
    });
    expect(typed.myAnswer).toEqual({ questionIndex: 0, text: 'Pacifique' });
    expect(playerScreen(typed)).toBe('answered');
    const slid = run(state({ phase: 'ANSWERING' }), prompt(0), {
      type: 'answer',
      questionIndex: 0,
      answer: { value: 1789 },
    });
    expect(slid.myAnswer).toEqual({ questionIndex: 0, value: 1789 });
  });

  it('a rejected answer lets the player tap again', () => {
    const s = run(
      state({ phase: 'ANSWERING' }),
      prompt(0),
      { type: 'answer', questionIndex: 0, answer: { choiceIndex: 1 } },
      { type: 'answerRejected', questionIndex: 0 },
    );
    expect(s.myAnswer).toBeNull();
    expect(playerScreen(s)).toBe('answer');
  });

  it('clears answer, prompt and result when the next question starts', () => {
    const s = run(
      state({ phase: 'ANSWERING' }),
      prompt(0),
      { type: 'answer', questionIndex: 0, answer: { choiceIndex: 1 } },
      state({ phase: 'REVEAL' }),
      {
        type: 'result',
        payload: {
          correct: false,
          pointsEarned: 0,
          streak: 0,
          streakBonus: 0,
          totalScore: 0,
          rank: 2,
        },
      },
      state({ phase: 'QUESTION_INTRO', questionIndex: 1 }),
    );
    expect(s.myAnswer).toBeNull();
    expect(s.prompt).toBeNull();
    expect(s.result).toBeNull();
    expect(playerScreen(s)).toBe('getReady');
  });

  it('keeps the last result for the podium', () => {
    const s = run(
      state({ phase: 'REVEAL', questionIndex: 2 }),
      {
        type: 'result',
        payload: {
          correct: true,
          pointsEarned: 900,
          streak: 3,
          streakBonus: 200,
          totalScore: 2500,
          rank: 4,
        },
      },
      state({ phase: 'PODIUM', questionIndex: 2 }),
      { type: 'podium', top: [{ nickname: 'A', score: 3000 }] },
    );
    expect(playerScreen(s)).toBe('podium');
    expect(s.result?.rank).toBe(4);
    expect(s.podium).toHaveLength(1);
  });

  it('after a rejoin, the prompt alone restores the answer screen with the full timer', () => {
    // Server re-sends game:state then question:prompt; remainingMs may be missing.
    const s = run(state({ phase: 'ANSWERING', questionIndex: 1 }), prompt(1, 5000));
    expect(playerScreen(s)).toBe('answer');
    expect(s.answeringEndsAt).toBe(15000);
  });
});

describe('helpers', () => {
  it('normalizePin keeps digits only', () => {
    expect(normalizePin(' 12a34-5678', 6)).toBe('123456');
  });

  it('formatRank', () => {
    expect(formatRank(1)).toBe('1er');
    expect(formatRank(3)).toBe('3e');
  });

  it('errorMessage has a French message and a fallback', () => {
    expect(errorMessage('NICKNAME_TAKEN')).toMatch(/pseudo/);
    expect(errorMessage('UNAUTHORIZED')).toBe('Une erreur est survenue.');
    expect(errorMessage('TIMEOUT')).toMatch(/serveur/);
  });
});
