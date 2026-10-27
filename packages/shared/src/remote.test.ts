import { describe, expect, it } from 'vitest';
import {
  HostActionPayload,
  HostKickPayload,
  HostRemotePayload,
  HostTokenPayload,
  RemoteTvPayload,
} from './events.js';
import { QuestionSchema, answerText, buzzerAnswer, type Question } from './quiz.js';

const q = (raw: object): Question =>
  QuestionSchema.parse({ text: 'Q ?', timeLimitSec: 20, ...raw });

describe('answerText (« Télécommande », T39)', () => {
  it('gives the right answer in words for every type that has one', () => {
    const mcq = q({
      type: 'MCQ',
      choices: [
        { text: 'Paris', isCorrect: true },
        { text: 'Lyon', isCorrect: false },
        { text: 'Nice', isCorrect: true },
      ],
    });
    expect(answerText(mcq)).toEqual(['Paris', 'Nice']);
    const tf = q({
      type: 'TRUE_FALSE',
      choices: [
        { text: 'Vrai', isCorrect: false },
        { text: 'Faux', isCorrect: true },
      ],
    });
    expect(answerText(tf)).toEqual(['Faux']);
    expect(
      answerText(q({ type: 'TYPE_ANSWER', acceptedAnswers: ['Pacifique', 'Océan Pacifique'] })),
    ).toEqual(['Pacifique', 'Océan Pacifique']);
    expect(
      answerText(
        q({
          type: 'SLIDER',
          slider: { min: 0, max: 10, step: 0.5, correct: 2.5, margin: 0.5, unit: 'km' },
        }),
      ),
    ).toEqual(['2,5 km (± 0,5)']);
    expect(
      answerText(
        q({ type: 'SLIDER', slider: { min: 1700, max: 1900, step: 1, correct: 1789, margin: 0 } }),
      ),
    ).toEqual(['1789']);
    expect(answerText(q({ type: 'ORDER', items: ['Un', 'Deux', 'Trois'] }))).toEqual([
      '1. Un',
      '2. Deux',
      '3. Trois',
    ]);
    expect(
      answerText(
        q({
          type: 'PIN',
          imageUrl: 'https://example.com/a.png',
          zone: { x: 0.123, y: 0.9, radius: 0.1 },
        }),
      ),
    ).toEqual(['Zone : à 12 % depuis la gauche, 90 % depuis le haut']);
    expect(answerText(q({ type: 'BLUFF', truth: 'Bud et Lou' }))).toEqual(['Bud et Lou']);
    const draw = q({ type: 'DRAW', words: ['Licorne'] });
    expect(answerText(draw, 'Licorne')).toEqual(['Licorne']);
    expect(answerText(draw)).toEqual([]);
  });

  it('nothing for the types without a right answer', () => {
    expect(answerText(q({ type: 'POLL', choices: [{ text: 'A' }, { text: 'B' }] }))).toEqual([]);
    expect(answerText(q({ type: 'WHO_OF_US' }))).toEqual([]);
    expect(answerText(q({ type: 'WORD_CLOUD' }))).toEqual([]);
  });

  it('buzzerAnswer is the same text', () => {
    const typed = q({ type: 'TYPE_ANSWER', acceptedAnswers: ['Pacifique'], buzzer: true });
    expect(buzzerAnswer(typed)).toEqual(answerText(typed));
  });
});

describe('host action payloads: hostToken or remoteToken', () => {
  it('accepts either token', () => {
    expect(HostActionPayload.safeParse({ pin: '123456', hostToken: 'h' }).success).toBe(true);
    expect(HostActionPayload.safeParse({ pin: '123456', remoteToken: 'r' }).success).toBe(true);
    expect(HostActionPayload.safeParse({ pin: '123456' }).success).toBe(false);
    expect(HostActionPayload.safeParse({ pin: '123456', remoteToken: '' }).success).toBe(false);
    expect(
      HostKickPayload.safeParse({ pin: '123456', remoteToken: 'r', playerId: 'p' }).success,
    ).toBe(true);
    expect(HostKickPayload.safeParse({ pin: '123456', remoteToken: 'r' }).success).toBe(false);
  });

  it('TV-only events need the hostToken', () => {
    expect(HostTokenPayload.safeParse({ pin: '123456', remoteToken: 'r' }).success).toBe(false);
    expect(
      HostRemotePayload.safeParse({ pin: '123456', hostToken: 'h', revoke: true }).success,
    ).toBe(true);
    expect(HostRemotePayload.safeParse({ pin: '123456', remoteToken: 'r' }).success).toBe(false);
  });

  it('remote:tv actions', () => {
    for (const action of ['mute', 'unmute', 'replay'])
      expect(RemoteTvPayload.safeParse({ pin: '123456', remoteToken: 'r', action }).success).toBe(
        true,
      );
    expect(
      RemoteTvPayload.safeParse({ pin: '123456', remoteToken: 'r', action: 'explode' }).success,
    ).toBe(false);
  });
});
