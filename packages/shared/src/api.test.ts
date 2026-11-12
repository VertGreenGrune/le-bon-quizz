import { describe, expect, it } from 'vitest';
import { CLASSIC_DEMO_QUIZ, LibraryQuery, LoginBody, QuizInput, RegisterBody } from './index.js';

describe('REST API schemas', () => {
  it('normalizes emails', () => {
    const body = RegisterBody.parse({ email: ' Host@Ex.FR ', name: 'H', password: '12345678' });
    expect(body.email).toBe('host@ex.fr');
    expect(LoginBody.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false);
  });

  it('QuizInput accepts the demo quiz without its id', () => {
    const { id: _id, ...input } = CLASSIC_DEMO_QUIZ;
    expect(QuizInput.safeParse(input).success).toBe(true);
  });

  it('QuizInput: visibility is optional, PRIVATE or PUBLIC', () => {
    const { id: _id, ...input } = CLASSIC_DEMO_QUIZ;
    expect(QuizInput.parse(input).visibility).toBeUndefined();
    expect(QuizInput.parse({ ...input, visibility: 'PUBLIC' }).visibility).toBe('PUBLIC');
    expect(QuizInput.safeParse({ ...input, visibility: 'SHARED' }).success).toBe(false);
  });

  it('LibraryQuery defaults to the most played', () => {
    expect(LibraryQuery.parse({})).toEqual({ sort: 'popular' });
    expect(LibraryQuery.parse({ search: ' bastille ', sort: 'newest' })).toEqual({
      search: 'bastille',
      sort: 'newest',
    });
    expect(LibraryQuery.safeParse({ sort: 'random' }).success).toBe(false);
  });
});
