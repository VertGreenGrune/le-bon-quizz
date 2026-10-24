import { describe, expect, it } from 'vitest';
import type { GameStatePayload, PlayerJokersPayload, QuestionPromptPayload } from '@lbq/shared';
import {
  bluffStage,
  copyingTarget,
  initialPlayerState,
  playerReducer,
  playerScreen,
  type PlayerState,
} from './playerState';

const answering: GameStatePayload = {
  phase: 'ANSWERING',
  mode: 'solo',
  questionIndex: 0,
  totalQuestions: 2,
  remainingMs: 45_000,
};
const write: QuestionPromptPayload = {
  index: 0,
  type: 'BLUFF',
  timeLimitSec: 45,
  bluff: { stage: 'write', maxLength: 40 },
};
const vote: QuestionPromptPayload = {
  index: 0,
  type: 'BLUFF',
  timeLimitSec: 20,
  bluff: { stage: 'vote', options: ['Frankenweenie', 'Vincent'], own: 0 },
};

const start = (): PlayerState => {
  let s = playerReducer(initialPlayerState, { type: 'state', payload: answering, now: 0 });
  s = playerReducer(s, { type: 'prompt', payload: write, now: 0 });
  return s;
};

describe('phone « Mytho ! »', () => {
  it('writing, lie sent (can be changed), then the vote', () => {
    let s = start();
    expect(bluffStage(s)).toBe('write');
    expect(playerScreen(s)).toBe('answer');
    s = playerReducer(s, { type: 'lie', questionIndex: 0, text: 'Frankenweenie' });
    expect(playerScreen(s)).toBe('answered');
    s = playerReducer(s, { type: 'lie', questionIndex: 0, text: null }); // « Changer mon mytho »
    expect(playerScreen(s)).toBe('answer');
    s = playerReducer(s, { type: 'lie', questionIndex: 0, text: 'Frankenweenie' });

    // The vote starts: new timer, the voting buttons, the lie is kept for the result.
    s = playerReducer(s, {
      type: 'state',
      payload: { ...answering, remainingMs: 20_000 },
      now: 50,
    });
    s = playerReducer(s, { type: 'prompt', payload: vote, now: 50 });
    expect(bluffStage(s)).toBe('vote');
    expect(s.answeringEndsAt).toBe(20_050);
    expect(playerScreen(s)).toBe('answer');
    expect(s.lie?.text).toBe('Frankenweenie');
    s = playerReducer(s, { type: 'answer', questionIndex: 0, answer: { choiceIndex: 1 } });
    expect(playerScreen(s)).toBe('answered');
  });

  it('after a rejoin the server tells which lie it already has', () => {
    const s = playerReducer(start(), {
      type: 'prompt',
      payload: { ...write, bluff: { stage: 'write', maxLength: 40, lie: 'Batman 3' } },
      now: 0,
    });
    expect(s.lie).toEqual({ questionIndex: 0, text: 'Batman 3' });
    expect(playerScreen(s)).toBe('answered');
  });

  it('a Copieur still writes its own lie, and waits for its target only to vote', () => {
    const jokers: PlayerJokersPayload = {
      questionIndex: 0,
      hand: [],
      played: { joker: 'copy', target: { id: 'b', nickname: 'Bob', avatar: 'robin' } },
      others: [],
      attacked: [],
      effects: {},
    };
    let s = playerReducer(start(), { type: 'jokers', payload: jokers });
    expect(copyingTarget(s)).toBeNull();
    s = playerReducer(s, { type: 'prompt', payload: vote, now: 0 });
    expect(copyingTarget(s)?.nickname).toBe('Bob');
  });
});
