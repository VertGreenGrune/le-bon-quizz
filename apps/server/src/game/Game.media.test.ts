import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { introOf } from './testing.js';
import {
  QUESTION_INTRO_MS,
  QuizSchema,
  type QuestionShowPayload,
  type Quiz,
  type ServerToClientEvents,
} from '@lbq/shared';
import { Game, type GameTransport } from './Game.js';

type Sent = { to: string; event: keyof ServerToClientEvents; payload: unknown };

const IMAGE = 'http://localhost/uploads/a.png';
const SOUND = 'http://localhost/uploads/b.mp3';

/** One question with a sound + blurred picture, one with a sound at the reveal, one plain. */
const quiz: Quiz = QuizSchema.parse({
  id: 'media',
  title: 'Média',
  questions: [
    {
      text: 'Quel est ce film ?',
      imageUrl: IMAGE,
      imageEffect: 'blur',
      audio: { url: SOUND, startSec: 12.5, durationSec: 10 },
      choices: [
        { text: 'A', isCorrect: true },
        { text: 'B', isCorrect: false },
      ],
    },
    {
      text: 'Écoutez la réponse',
      type: 'TYPE_ANSWER',
      acceptedAnswers: ['Batman'],
      audio: { url: SOUND },
      audioOnReveal: true,
    },
    {
      text: 'Sans média',
      imageUrl: IMAGE,
      imageEffect: 'none',
      choices: [
        { text: 'A', isCorrect: true },
        { text: 'B', isCorrect: false },
      ],
    },
  ],
});

describe('Game with media questions', () => {
  const sent: Sent[] = [];
  let game: Game;

  beforeEach(() => {
    vi.useFakeTimers();
    sent.length = 0;
    const transport: GameTransport = {
      toAll: (event, payload) => void sent.push({ to: 'all', event, payload }),
      toHost: (event, payload) => void sent.push({ to: 'host', event, payload }),
      toSocket: (to, event, payload) => void sent.push({ to, event, payload }),
      detachSocket: () => {},
    };
    game = new Game('123456', quiz, transport, {}, { mode: 'solo', allAnsweredGraceMs: 0 });
  });

  afterEach(() => {
    game.dispose();
    vi.useRealTimers();
  });

  it('sends the sound and the effect to the host screen only, never to the phones', () => {
    game.join('Alice', 'sock-Alice');
    game.start();
    for (let i = 0; i < quiz.questions.length; i++) {
      if (i > 0) {
        game.next(); // → LEADERBOARD
        game.next(); // → QUESTION_INTRO
      }
      vi.advanceTimersByTime(introOf(game));
      expect(game.phase).toBe('ANSWERING');
      game.next(); // → REVEAL
    }

    const showEvents = sent.filter((s) => s.event === 'question:show');
    expect(showEvents.every((s) => s.to === 'host')).toBe(true);
    const shows = showEvents.map((s) => s.payload as QuestionShowPayload);
    expect(shows[0]).toMatchObject({
      imageUrl: IMAGE,
      imageEffect: 'blur',
      audio: { url: SOUND, startSec: 12.5, durationSec: 10 },
    });
    expect(shows[0]!.audioOnReveal).toBeUndefined();
    expect(shows[1]).toMatchObject({
      audio: { url: SOUND, startSec: 0, durationSec: 15 },
      audioOnReveal: true,
    });
    expect(shows[2]!.imageEffect).toBeUndefined(); // 'none' isn't sent
    expect(shows[2]!.audio).toBeUndefined();

    // Everything that reaches a phone or the whole room: no media at all.
    const toPhones = sent.filter((s) => s.to !== 'host');
    expect(toPhones.some((s) => s.event === 'question:prompt')).toBe(true);
    for (const s of toPhones) {
      expect(JSON.stringify(s.payload)).not.toMatch(/uploads|audio|imageEffect|imageUrl/);
    }
  });
});
