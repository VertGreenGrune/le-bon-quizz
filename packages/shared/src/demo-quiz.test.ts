import { describe, expect, it } from 'vitest';
import { CLASSIC_DEMO_QUIZ, DEMO_QUIZ } from './demo-quiz.js';
import { QuestionType, QuizSchema, isMultipleAnswer } from './quiz.js';

describe('DEMO_QUIZ', () => {
  it('is a valid quiz with the id `demo`', () => {
    expect(QuizSchema.parse(DEMO_QUIZ)).toEqual(DEMO_QUIZ);
    expect(DEMO_QUIZ.id).toBe('demo');
    expect(QuizSchema.parse(CLASSIC_DEMO_QUIZ).questions).toHaveLength(7);
  });

  it('has a question of every type', () => {
    const types = new Set(DEMO_QUIZ.questions.map((q) => q.type));
    expect([...QuestionType.options].filter((t) => !types.has(t))).toEqual([]);
  });

  it('shows the options too: select all, picture effect, buzzer, auction, explanation', () => {
    const qs = DEMO_QUIZ.questions;
    expect(qs.some(isMultipleAnswer)).toBe(true);
    expect(qs.some((q) => q.imageEffect && q.imageEffect !== 'none')).toBe(true);
    expect(qs.some((q) => q.buzzer)).toBe(true);
    expect(qs.some((q) => q.auction)).toBe(true);
    expect(qs.some((q) => q.explanation)).toBe(true);
  });
});
