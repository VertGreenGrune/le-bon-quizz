import { describe, expect, it } from 'vitest';
import type { GameStatePayload, PlayerJokersPayload, QuestionPromptPayload } from '@lbq/shared';
import {
  copyingTarget,
  initialPlayerState,
  playerReducer,
  playerScreen,
  wagerGuessed,
  wagerStage,
  type PlayerState,
} from './playerState';

const state = (extra: Partial<GameStatePayload> = {}): GameStatePayload => ({
  phase: 'ANSWERING',
  mode: 'solo',
  questionIndex: 0,
  totalQuestions: 2,
  remainingMs: 15_000,
  ...extra,
});

const prompt = (wager: QuestionPromptPayload['wager']): QuestionPromptPayload => ({
  index: 0,
  type: 'WAGER',
  timeLimitSec: wager?.stage === 'bet' ? 20 : 30,
  wager,
});

function withPrompt(wager: QuestionPromptPayload['wager']): PlayerState {
  let s: PlayerState = { ...initialPlayerState, playerId: 'me' };
  s = playerReducer(s, { type: 'state', payload: state(), now: 0 });
  return playerReducer(s, { type: 'prompt', payload: prompt(wager), now: 0 });
}

describe('phone, « Paris sur les réponses » (T61)', () => {
  it('guess stage: « answered » once a guess is sent, « Changer » goes back', () => {
    let s = withPrompt({ stage: 'guess', unit: 'm' });
    expect(wagerStage(s)).toBe('guess');
    expect(playerScreen(s)).toBe('answer');
    s = playerReducer(s, { type: 'wagerGuess', questionIndex: 0, value: 300 });
    expect(wagerGuessed(s)).toBe(300);
    expect(playerScreen(s)).toBe('answered');
    s = playerReducer(s, { type: 'wagerGuess', questionIndex: 0, value: null });
    expect(wagerGuessed(s)).toBeNull();
    expect(playerScreen(s)).toBe('answer');
  });

  it('a rejoin brings the guess back; the bet prompt replaces it', () => {
    let s = withPrompt({ stage: 'guess', guess: 12.5 });
    expect(playerScreen(s)).toBe('answered');
    s = playerReducer(s, {
      type: 'prompt',
      payload: prompt({ stage: 'bet', slots: [null, 12.5], own: 1 }),
      now: 1000,
    });
    expect(wagerStage(s)).toBe('bet');
    expect(playerScreen(s)).toBe('answer');
    s = playerReducer(s, { type: 'answer', questionIndex: 0, answer: { choiceIndex: 1 } });
    expect(playerScreen(s)).toBe('answered');
  });

  it('a Copieur still guesses, then waits for its target', () => {
    const jokers: PlayerJokersPayload = {
      questionIndex: 0,
      hand: [],
      played: { joker: 'copy', target: { id: 't', nickname: 'Bob', avatar: 'batman' } },
      others: [],
      attacked: [],
      effects: {},
    };
    let s = withPrompt({ stage: 'guess' });
    s = playerReducer(s, { type: 'jokers', payload: jokers });
    expect(copyingTarget(s)).toBeNull();
    s = playerReducer(s, {
      type: 'prompt',
      payload: prompt({ stage: 'bet', slots: [null] }),
      now: 0,
    });
    expect(copyingTarget(s)?.nickname).toBe('Bob');
  });
});
