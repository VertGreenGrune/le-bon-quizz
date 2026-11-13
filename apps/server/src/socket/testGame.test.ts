import { describe, expect, it } from 'vitest';
import { CLASSIC_DEMO_QUIZ, HostCreatePayload } from '@lbq/shared';
import { Game, type GameTransport } from '../game/Game.js';
import { GameError } from '../game/errors.js';
import { pickQuestions } from './index.js';

const transport: GameTransport = {
  toAll: () => {},
  toHost: () => {},
  toSocket: () => {},
  detachSocket: () => {},
};

describe('« 🧪 Tester » (T66)', () => {
  it('keeps only the chosen questions, in that order', () => {
    const quiz = pickQuestions(CLASSIC_DEMO_QUIZ, [2, 0]);
    expect(quiz.questions).toEqual([
      CLASSIC_DEMO_QUIZ.questions[2],
      CLASSIC_DEMO_QUIZ.questions[0],
    ]);
    expect(pickQuestions(CLASSIC_DEMO_QUIZ, undefined)).toBe(CLASSIC_DEMO_QUIZ);
    expect(() => pickQuestions(CLASSIC_DEMO_QUIZ, [99])).toThrow(GameError);
  });

  it('host:create takes `test` and `questions`', () => {
    expect(HostCreatePayload.parse({ quizId: 'q', test: true, questions: [3] })).toEqual({
      quizId: 'q',
      test: true,
      questions: [3],
    });
    expect(HostCreatePayload.safeParse({ quizId: 'q', questions: [] }).success).toBe(false);
    expect(HostCreatePayload.safeParse({ quizId: 'q', test: false }).success).toBe(false);
  });

  it('the clients are told it is a test game', () => {
    const quiz = pickQuestions(CLASSIC_DEMO_QUIZ, [1]);
    const game = new Game('123456', quiz, transport, {}, { mode: 'solo', test: true });
    expect(game.statePayload()).toMatchObject({ test: true, totalQuestions: 1 });
    const real = new Game('654321', CLASSIC_DEMO_QUIZ, transport, {}, { mode: 'solo' });
    expect(real.statePayload()).not.toHaveProperty('test');
  });
});
