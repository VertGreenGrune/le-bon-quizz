import { describe, expect, it } from 'vitest';
import {
  DEMO_QUIZ,
  PlayerAnswerPayload,
  PlayerJoinPayload,
  QuestionSchema,
  QuizSchema,
} from './index.js';

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

  it('defaults a question without type to MCQ', () => {
    const q = QuestionSchema.parse({
      text: 'Q',
      choices: [
        { text: 'a', isCorrect: true },
        { text: 'b', isCorrect: false },
      ],
    });
    expect(q.type).toBe('MCQ');
  });

  it('validates typed answers: 1–3 accepted answers of 40 characters max, tolerance on by default', () => {
    const typed = (acceptedAnswers: string[]) =>
      QuestionSchema.safeParse({ text: 'Q', type: 'TYPE_ANSWER', acceptedAnswers });
    const ok = typed(['Pacifique']);
    expect(ok.success && ok.data.type === 'TYPE_ANSWER' && ok.data.typoTolerance).toBe(true);
    expect(typed([]).success).toBe(false);
    expect(typed(['a', 'b', 'c', 'd']).success).toBe(false);
    expect(typed(['  ']).success).toBe(false);
    expect(typed(['x'.repeat(41)]).success).toBe(false);
  });

  it('polls have no correct answer (isCorrect is dropped)', () => {
    const q = QuestionSchema.parse({
      text: 'Q',
      type: 'POLL',
      choices: [{ text: 'a', isCorrect: true }, { text: 'b' }],
    });
    expect(q.type === 'POLL' && q.choices).toEqual([{ text: 'a' }, { text: 'b' }]);
  });

  it('validates sliders: min < max, correct value in range and on a step, margin ≥ 0', () => {
    const slider = (s: object) =>
      QuestionSchema.safeParse({
        text: 'Q',
        type: 'SLIDER',
        slider: { min: 0, max: 10, correct: 5, ...s },
      });
    const issuePath = (s: object) => {
      const r = slider(s);
      return r.success ? null : r.error.issues[0]!.path.join('.');
    };
    const ok = slider({});
    expect(ok.success && ok.data.type === 'SLIDER' && ok.data.slider).toEqual({
      min: 0,
      max: 10,
      correct: 5,
      step: 1,
      margin: 0,
    });
    expect(slider({ min: 0, max: 1, step: 0.1, correct: 0.3 }).success).toBe(true);
    expect(issuePath({ min: 10, max: 10 })).toBe('slider.max');
    expect(issuePath({ correct: 11 })).toBe('slider.correct');
    expect(issuePath({ step: 2, correct: 5 })).toBe('slider.correct');
    expect(issuePath({ margin: -1 })).toBe('slider.margin');
    expect(issuePath({ step: 0 })).toBe('slider.step');
  });

  it('player:answer takes exactly one of choiceIndex, text or value', () => {
    const answer = (a: object) =>
      PlayerAnswerPayload.safeParse({ pin: '123456', questionIndex: 0, ...a }).success;
    expect(answer({ choiceIndex: 2 })).toBe(true);
    expect(answer({ text: ' Pacifique ' })).toBe(true);
    expect(answer({ value: 1789.5 })).toBe(true);
    expect(answer({})).toBe(false);
    expect(answer({ choiceIndex: 1, text: 'a' })).toBe(false);
    expect(answer({ text: '   ' })).toBe(false);
    expect(answer({ text: 'x'.repeat(41) })).toBe(false);
    expect(answer({ value: Infinity })).toBe(false);
  });
});
