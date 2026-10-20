import { describe, expect, it } from 'vitest';
import { DEMO_QUIZ, PlayerJoinPayload, QuizSchema } from './index.js';

describe('shared schemas', () => {
  it('demo quiz is valid', () => {
    expect(QuizSchema.safeParse(DEMO_QUIZ).success).toBe(true);
  });

  it('rejects a question without a correct choice', () => {
    const bad = {
      ...DEMO_QUIZ,
      questions: [
        {
          text: 'Q',
          choices: [
            { text: 'a', isCorrect: false },
            { text: 'b', isCorrect: false },
          ],
        },
      ],
    };
    expect(QuizSchema.safeParse(bad).success).toBe(false);
  });

  it('validates join payloads', () => {
    expect(PlayerJoinPayload.safeParse({ pin: '123456', nickname: 'Loïc' }).success).toBe(true);
    expect(PlayerJoinPayload.safeParse({ pin: '12a456', nickname: 'x' }).success).toBe(false);
    expect(PlayerJoinPayload.safeParse({ pin: '123456', nickname: '   ' }).success).toBe(false);
  });
});
