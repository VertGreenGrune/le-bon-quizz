import { describe, expect, it } from 'vitest';
import {
  DEMO_QUIZ,
  PlayerAnswerPayload,
  PlayerJoinPayload,
  QuestionSchema,
  QuizSchema,
  buzzerAnswer,
  hasRightAnswer,
} from './index.js';

describe('« Buzzer » option (T28)', () => {
  const mcq = {
    type: 'MCQ',
    text: 'Q ?',
    choices: [
      { text: 'A', isCorrect: true },
      { text: 'B', isCorrect: false },
    ],
  };

  it('is accepted on the types with an answer to say out loud, refused on the others', () => {
    expect(QuestionSchema.parse({ ...mcq, buzzer: true })).toMatchObject({ buzzer: true });
    expect(QuestionSchema.parse(mcq)).not.toHaveProperty('buzzer');
    const poll = { type: 'POLL', text: 'Q ?', choices: [{ text: 'A' }, { text: 'B' }] };
    expect(QuestionSchema.safeParse({ ...poll, buzzer: true }).success).toBe(false);
    const bluff = { type: 'BLUFF', text: 'Q ?', truth: 'V', buzzer: true };
    expect(QuestionSchema.safeParse(bluff).success).toBe(false);
  });

  it('buzzerAnswer: the right answer in words for the host', () => {
    expect(buzzerAnswer(QuestionSchema.parse(mcq))).toEqual(['A']);
    const typed = {
      type: 'TYPE_ANSWER',
      text: 'Q ?',
      acceptedAnswers: ['Pacifique', 'Le Pacifique'],
    };
    expect(buzzerAnswer(QuestionSchema.parse(typed))).toEqual(['Pacifique', 'Le Pacifique']);
    const slider = {
      type: 'SLIDER',
      text: 'Q ?',
      slider: { min: 0, max: 10, step: 0.5, correct: 2.5, unit: 'km' },
    };
    expect(buzzerAnswer(QuestionSchema.parse(slider))).toEqual(['2,5 km']);
    const order = { type: 'ORDER', text: 'Q ?', items: ['a', 'b', 'c'] };
    expect(buzzerAnswer(QuestionSchema.parse(order))).toEqual(['1. a', '2. b', '3. c']);
  });
});

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

  describe('media (sound clip, picture effect)', () => {
    const mcq = {
      text: 'Q',
      choices: [
        { text: 'a', isCorrect: true },
        { text: 'b', isCorrect: false },
      ],
    };
    const url = 'http://localhost/uploads/x.mp3';

    it('defaults the excerpt to 0 s + 15 s, on any question type', () => {
      expect(QuestionSchema.parse({ ...mcq, audio: { url } }).audio).toEqual({
        url,
        startSec: 0,
        durationSec: 15,
      });
      const slider = {
        text: 'S',
        type: 'SLIDER',
        slider: { min: 0, max: 10, correct: 5 },
        audio: { url, startSec: 61.5, durationSec: 30 },
        audioOnReveal: true,
      };
      expect(QuestionSchema.safeParse(slider).success).toBe(true);
    });

    it('bounds the clip duration to 5–30 s and the start to ≥ 0', () => {
      const ok = (audio: object) => QuestionSchema.safeParse({ ...mcq, audio }).success;
      expect(ok({ url, durationSec: 5 })).toBe(true);
      expect(ok({ url, durationSec: 4 })).toBe(false);
      expect(ok({ url, durationSec: 31 })).toBe(false);
      expect(ok({ url, durationSec: 10.5 })).toBe(false);
      expect(ok({ url, startSec: -1 })).toBe(false);
      expect(ok({ url: 'pas une url' })).toBe(false);
    });

    it('accepts an image effect only with an image', () => {
      const image = { imageUrl: 'http://localhost/uploads/x.png' };
      for (const imageEffect of ['blur', 'zoom', 'pixelate']) {
        expect(QuestionSchema.safeParse({ ...mcq, ...image, imageEffect }).success).toBe(true);
        expect(QuestionSchema.safeParse({ ...mcq, imageEffect }).success).toBe(false);
      }
      expect(QuestionSchema.safeParse({ ...mcq, imageEffect: 'none' }).success).toBe(true);
      expect(QuestionSchema.safeParse({ ...mcq, ...image, imageEffect: 'swirl' }).success).toBe(
        false,
      );
    });
  });
  describe('ordre, point sur l’image, « Qui de nous ? », nuage de mots', () => {
    const base = { text: 'Q', timeLimitSec: 20 };
    const ok = (q: object) => QuestionSchema.safeParse({ ...base, ...q }).success;

    it('order: 3–6 different items', () => {
      expect(ok({ type: 'ORDER', items: ['a', 'b', 'c'] })).toBe(true);
      expect(ok({ type: 'ORDER', items: ['a', 'b'] })).toBe(false);
      expect(ok({ type: 'ORDER', items: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] })).toBe(false);
      expect(ok({ type: 'ORDER', items: ['a', 'b', 'A'] })).toBe(false);
      expect(ok({ type: 'ORDER', items: ['a', 'b', ' '] })).toBe(false);
    });

    it('pin: an image and a zone inside the picture, no image effect', () => {
      const imageUrl = 'https://example.com/carte.png';
      const zone = { x: 0.5, y: 0.5, radius: 0.1 };
      expect(ok({ type: 'PIN', imageUrl, zone })).toBe(true);
      expect(ok({ type: 'PIN', zone })).toBe(false);
      expect(ok({ type: 'PIN', imageUrl, zone: { ...zone, x: 1.2 } })).toBe(false);
      expect(ok({ type: 'PIN', imageUrl, zone: { ...zone, radius: 0 } })).toBe(false);
      expect(ok({ type: 'PIN', imageUrl, zone, imageEffect: 'blur' })).toBe(false);
      expect(ok({ type: 'PIN', imageUrl, zone, imageEffect: 'none' })).toBe(true);
    });

    it('who of us: majority bonus off by default; word cloud has no settings', () => {
      expect(QuestionSchema.parse({ ...base, type: 'WHO_OF_US' })).toMatchObject({
        majorityBonus: false,
      });
      expect(ok({ type: 'WORD_CLOUD' })).toBe(true);
    });

    it('only polls, « Qui de nous ? » and word clouds have no right answer', () => {
      expect(['POLL', 'WHO_OF_US', 'WORD_CLOUD'].every((t) => !hasRightAnswer(t as never))).toBe(
        true,
      );
      expect(hasRightAnswer('ORDER')).toBe(true);
      expect(hasRightAnswer('PIN')).toBe(true);
    });

    it('player:answer takes an order, a point or a player id', () => {
      const target = { pin: '123456', questionIndex: 0 };
      const valid = (a: object) => PlayerAnswerPayload.safeParse({ ...target, ...a }).success;
      expect(valid({ order: [2, 0, 1] })).toBe(true);
      expect(valid({ order: [0, 1] })).toBe(false);
      expect(valid({ order: [0, 1, 6] })).toBe(false);
      expect(valid({ point: { x: 0.3, y: 1 } })).toBe(true);
      expect(valid({ point: { x: -0.1, y: 0 } })).toBe(false);
      expect(valid({ playerId: 'abc' })).toBe(true);
      expect(valid({ playerId: 'abc', choiceIndex: 1 })).toBe(false);
    });
  });
});

describe('« Mytho ! » question schema', () => {
  it('defaults: 45 s to write, 20 s to vote; the truth is required and ≤ 40 characters', () => {
    const q = QuestionSchema.parse({
      type: 'BLUFF',
      text: 'Le premier film ?',
      truth: ' Vincent ',
    });
    expect(q).toMatchObject({
      truth: 'Vincent',
      timeLimitSec: 45,
      voteTimeSec: 20,
      basePoints: 1000,
    });
    expect(hasRightAnswer('BLUFF')).toBe(true);
    expect(QuestionSchema.safeParse({ type: 'BLUFF', text: 'Q ?', truth: '' }).success).toBe(false);
    expect(
      QuestionSchema.safeParse({ type: 'BLUFF', text: 'Q ?', truth: 'x'.repeat(41) }).success,
    ).toBe(false);
    expect(
      QuestionSchema.safeParse({ type: 'BLUFF', text: 'Q ?', truth: 'V', voteTimeSec: 2 }).success,
    ).toBe(false);
  });
});
