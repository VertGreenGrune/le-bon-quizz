import { describe, expect, it } from 'vitest';
import { DEMO_QUIZ, LoginBody, QuizInput, RegisterBody } from './index.js';

describe('REST API schemas', () => {
  it('normalizes emails', () => {
    const body = RegisterBody.parse({ email: ' Host@Ex.FR ', name: 'H', password: '12345678' });
    expect(body.email).toBe('host@ex.fr');
    expect(LoginBody.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false);
  });

  it('QuizInput accepts the demo quiz without its id', () => {
    const { id: _id, ...input } = DEMO_QUIZ;
    expect(QuizInput.safeParse(input).success).toBe(true);
  });
});
