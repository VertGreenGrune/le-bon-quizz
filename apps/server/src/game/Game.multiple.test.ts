import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { introOf } from './testing.js';
import {
  QUESTION_INTRO_MS,
  type JokerType,
  type PlayerJokersPayload,
  type PlayerResultPayload,
  type Question,
  type QuestionPromptPayload,
  type QuestionRevealPayload,
  type QuestionShowPayload,
  type Quiz,
  type ServerToClientEvents,
  type SurvivalStatePayload,
} from '@lbq/shared';
import { Game, type GameSettings, type GameTransport, type Player } from './Game.js';
import { GameError } from './errors.js';

type Sent = { to: string; event: keyof ServerToClientEvents; payload: unknown };

function recorder() {
  const sent: Sent[] = [];
  const transport: GameTransport = {
    toAll: (event, payload) => void sent.push({ to: 'all', event, payload }),
    toHost: (event, payload) => void sent.push({ to: 'host', event, payload }),
    toSocket: (to, event, payload) => void sent.push({ to, event, payload }),
    detachSocket: () => {},
  };
  const last = (event: Sent['event'], to?: string) =>
    sent.filter((s) => s.event === event && (to === undefined || s.to === to)).at(-1)?.payload;
  return { sent, transport, last };
}

function expectGameError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(GameError);
    expect((err as GameError).code).toBe(code);
    return;
  }
  throw new Error(`expected GameError ${code}`);
}

const EXPLANATION = 'Le bleu et le rouge sont les couleurs de Paris.';

/** 20 s / 1000 pts, choices 0 and 2 right: an instant right answer = 1000 points. */
const multiple = (text: string, explanation?: string): Question => ({
  text,
  type: 'MCQ',
  timeLimitSec: 20,
  basePoints: 1000,
  choices: [
    { text: 'Bleu', isCorrect: true },
    { text: 'Vert', isCorrect: false },
    { text: 'Rouge', isCorrect: true },
    { text: 'Jaune', isCorrect: false },
  ],
  ...(explanation !== undefined && { explanation }),
});

const single: Question = {
  text: 'Capitale ?',
  type: 'MCQ',
  timeLimitSec: 20,
  basePoints: 1000,
  choices: [
    { text: 'Paris', isCorrect: true },
    { text: 'Lyon', isCorrect: false },
  ],
  explanation: 'Depuis Clovis.',
};

const typed: Question = {
  text: 'Plus grand océan ?',
  type: 'TYPE_ANSWER',
  timeLimitSec: 20,
  basePoints: 1000,
  acceptedAnswers: ['Pacifique'],
  typoTolerance: true,
  explanation: 'Il couvre un tiers de la Terre.',
};

const quiz: Quiz = {
  id: 'multi',
  title: 'Multiple',
  questions: [multiple('Couleurs du drapeau ?', EXPLANATION), single, typed, multiple('Encore ?')],
};
const RIGHT = { choiceIndexes: [0, 2] };

describe('Explanations and « select all » questions (T37)', () => {
  let rec: ReturnType<typeof recorder>;
  let game: Game;

  const create = (q: Quiz = quiz, settings: Partial<GameSettings> = {}) => {
    game?.dispose();
    rec = recorder();
    game = new Game('123456', q, rec.transport, {}, { mode: 'solo', ...settings });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    create();
  });

  afterEach(() => {
    game.dispose();
    vi.useRealTimers();
  });

  const joinAll = (...names: string[]) => names.map((n) => game.join(n, `sock-${n}`));
  const answer = (p: Player, input: object) =>
    game.answer(p.id, game.questionIndex, input as { choiceIndex: number });
  const prompt = (p: Player) => rec.last('question:prompt', p.socketId!) as QuestionPromptPayload;
  const result = (p: Player) => rec.last('player:result', p.socketId!) as PlayerResultPayload;
  const show = () => rec.last('question:show', 'host') as QuestionShowPayload;
  const reveal = () => rec.last('question:reveal', 'host') as QuestionRevealPayload;
  const jokerState = (p: Player) => rec.last('joker:state', p.socketId!) as PlayerJokersPayload;
  const toAnswering = () => {
    vi.advanceTimersByTime(introOf(game));
    expect(game.phase).toBe('ANSWERING');
  };
  /** REVEAL / LEADERBOARD → next question's ANSWERING. */
  const nextQuestion = () => {
    if (game.phase === 'REVEAL') game.next();
    game.next();
    toAnswering();
  };

  describe('explanation', () => {
    it('is never sent before the reveal, then reaches the TV, the phones and the report', () => {
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      toAnswering();
      const before = JSON.stringify(rec.sent);
      expect(before).not.toContain(EXPLANATION);
      expect(show()).not.toHaveProperty('explanation');
      expect(prompt(alice!)).not.toHaveProperty('explanation');
      answer(alice!, RIGHT);
      answer(bob!, { choiceIndexes: [1] });
      expect(game.phase).toBe('REVEAL');
      expect(reveal().explanation).toBe(EXPLANATION);
      expect(result(alice!).explanation).toBe(EXPLANATION);
      expect(result(bob!).explanation).toBe(EXPLANATION);
      expect(game.questionStats[0]!.explanation).toBe(EXPLANATION);
    });

    it('works on every type (typed answer here), and is absent when the question has none', () => {
      const [alice] = joinAll('Alice');
      game.start();
      toAnswering();
      answer(alice!, RIGHT);
      nextQuestion();
      answer(alice!, { choiceIndex: 0 });
      nextQuestion(); // typed answer
      expect(JSON.stringify(prompt(alice!))).not.toContain('tiers');
      answer(alice!, { text: 'pacifiqe' });
      expect(reveal().explanation).toBe('Il couvre un tiers de la Terre.');
      expect(result(alice!)).toMatchObject({ correct: true, explanation: typed.explanation });
      nextQuestion(); // no explanation
      answer(alice!, RIGHT);
      expect(reveal()).not.toHaveProperty('explanation');
      expect(result(alice!)).not.toHaveProperty('explanation');
      expect(game.questionStats.map((s) => s.explanation)).toEqual([
        EXPLANATION,
        'Depuis Clovis.',
        'Il couvre un tiers de la Terre.',
        null,
      ]);
    });

    it('is re-sent to a host that rejoins during the reveal', () => {
      const [alice] = joinAll('Alice');
      game.start();
      toAnswering();
      answer(alice!, RIGHT);
      game.resyncHost('host-2');
      const resent = rec.last('question:reveal', 'host-2') as QuestionRevealPayload;
      expect(resent.explanation).toBe(EXPLANATION);
    });
  });

  describe('select all', () => {
    it('tells the phones and the TV it is a multiple-answer question, never which ones', () => {
      const [alice] = joinAll('Alice');
      game.start();
      expect(show().multiple).toBe(true);
      toAnswering();
      expect(prompt(alice!)).toEqual({
        index: 0,
        type: 'MCQ',
        timeLimitSec: 20,
        choiceCount: 4,
        multiple: true,
      });
      answer(alice!, RIGHT);
      nextQuestion(); // single-answer MCQ: unchanged
      expect(prompt(alice!)).not.toHaveProperty('multiple');
      expect(show()).not.toHaveProperty('multiple');
    });

    it('only the exact set of right choices scores; subset, superset, wrong → 0', () => {
      const [exact, subset, superset, wrong] = joinAll('Exact', 'Subset', 'Superset', 'Wrong');
      game.start();
      toAnswering();
      answer(exact!, { choiceIndexes: [2, 0] }); // order doesn't matter
      answer(subset!, { choiceIndexes: [0] });
      answer(superset!, { choiceIndexes: [0, 1, 2] });
      answer(wrong!, { choiceIndexes: [1, 3] });
      expect(game.phase).toBe('REVEAL');
      expect(result(exact!)).toMatchObject({
        correct: true,
        pointsEarned: 1000,
        multiple: { correctIndexes: [0, 2], yours: [0, 2] },
      });
      for (const p of [subset!, superset!, wrong!])
        expect(result(p)).toMatchObject({
          correct: false,
          pointsEarned: 0,
          streak: 0,
          multiple: { correctIndexes: [0, 2] },
        });
      expect(result(subset!).multiple!.yours).toEqual([0]);
      // Every ticked choice counts in its bar.
      expect(reveal()).toMatchObject({
        correctIndexes: [0, 2],
        distribution: [3, 2, 2, 1],
        multiple: { allFound: 1 },
      });
      expect(game.questionStats[0]).toMatchObject({ correctCount: 1, answerCount: 4 });
    });

    it('refuses a single choiceIndex there, choiceIndexes elsewhere, bad selections', () => {
      const [alice] = joinAll('Alice');
      game.start();
      toAnswering();
      expectGameError(() => answer(alice!, { choiceIndex: 0 }), 'INVALID_PAYLOAD');
      expectGameError(() => answer(alice!, { choiceIndexes: [0, 0] }), 'INVALID_PAYLOAD');
      expectGameError(() => answer(alice!, { choiceIndexes: [0, 3, 5] }), 'INVALID_PAYLOAD');
      expectGameError(() => answer(alice!, { text: 'Bleu' }), 'INVALID_PAYLOAD');
      answer(alice!, RIGHT);
      nextQuestion(); // single-answer MCQ
      expectGameError(() => answer(alice!, { choiceIndexes: [0] }), 'INVALID_PAYLOAD');
      answer(alice!, { choiceIndex: 0 });
      expect(result(alice!)).not.toHaveProperty('multiple');
    });

    it('speed points count from the validation, the streak goes on', () => {
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      toAnswering();
      vi.advanceTimersByTime(4000);
      answer(alice!, RIGHT); // 4 s of 20 → 900
      answer(bob!, { choiceIndexes: [0] });
      expect(result(alice!)).toMatchObject({ correct: true, pointsEarned: 900, streak: 1 });
      nextQuestion();
      answer(alice!, { choiceIndex: 0 });
      answer(bob!, { choiceIndex: 0 });
      expect(result(alice!)).toMatchObject({ streak: 2, pointsEarned: 1000 + 100 });
    });

    it('a phone that rejoins gets `multiple` again', () => {
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      toAnswering();
      game.disconnect(alice!.socketId!);
      game.rejoin(alice!.sessionToken, 'sock-new');
      game.resync(alice!);
      expect(prompt(alice!)).toMatchObject({ multiple: true, choiceCount: 4 });
      answer(alice!, RIGHT);
      answer(bob!, RIGHT);
      expect(result(alice!).correct).toBe(true);
    });

    it('team mode: the members’ points are averaged as usual', () => {
      create(quiz, { mode: 'teams', teamCount: 2 });
      const [a, b, c] = joinAll('A', 'B', 'C');
      game.setTeam(a!.id, 0);
      game.setTeam(b!.id, 0);
      game.setTeam(c!.id, 1);
      game.start();
      toAnswering();
      answer(a!, RIGHT); // 1000
      answer(b!, { choiceIndexes: [0] }); // 0
      answer(c!, RIGHT); // 1000
      expect(result(a!).team).toMatchObject({ id: 0, score: 500, rank: 2 });
      expect(result(c!).team).toMatchObject({ id: 1, score: 1000, rank: 1 });
    });

    it('« Survie »: a partial selection is wrong and costs a heart', () => {
      create(quiz, { mode: 'survival', hearts: 3 });
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      toAnswering();
      answer(alice!, RIGHT);
      answer(bob!, { choiceIndexes: [2] });
      const survival = rec.last('survival:state', 'all') as SurvivalStatePayload;
      const hearts = (p: Player) => survival.players.find((s) => s.id === p.id)?.hearts;
      expect(hearts(alice!)).toBe(3);
      expect(hearts(bob!)).toBe(2);
      expect(result(bob!).survival).toMatchObject({ lostHeart: true });
    });
  });

  describe('with jokers', () => {
    const hand = (p: Player, jokers: JokerType[]) => game.jokers!.setHand(p.id, jokers);
    const play = (p: Player, joker: JokerType, target?: Player) =>
      game.useJoker(p.id, game.questionIndex, joker, target?.id);

    beforeEach(() => create(quiz, { jokers: true }));

    it('50/50 hides wrong choices only, at least one choice stays to tick', () => {
      const [alice] = joinAll('Alice');
      game.start();
      hand(alice!, ['fifty']);
      play(alice!, 'fifty');
      const hidden = jokerState(alice!).effects.hiddenChoices!;
      expect(hidden).toHaveLength(1); // 2 wrong choices: min(ceil(2 / 2), 2 − 1)
      expect([1, 3]).toContain(hidden[0]);
      toAnswering();
      answer(alice!, RIGHT);
      expect(result(alice!).correct).toBe(true);
    });

    it('Copieur copies the whole selection', () => {
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      hand(bob!, ['copy']);
      play(bob!, 'copy', alice);
      toAnswering();
      answer(alice!, { choiceIndexes: [0, 2] });
      expect(game.phase).toBe('REVEAL');
      expect(result(bob!)).toMatchObject({
        correct: true,
        multiple: { yours: [0, 2] },
      });
      expect(reveal().distribution).toEqual([2, 0, 2, 0]);
    });

    it('Brouilleur scrambles a multiple-answer question; the ticks are still choice indexes', () => {
      const scrambled: Quiz = { ...quiz, questions: [single, multiple('Couleurs ?')] };
      create(scrambled, { jokers: true });
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      toAnswering();
      answer(alice!, { choiceIndex: 0 });
      answer(bob!, { choiceIndex: 0 });
      game.next();
      game.next(); // question 2 intro
      hand(alice!, ['scramble']);
      play(alice!, 'scramble', bob); // hits this question (T42)
      toAnswering();
      expect(prompt(bob!).multiple).toBe(true);
      const effect = jokerState(bob!).effects.scrambled!;
      expect(effect.choices.map((c) => c.text).sort()).toEqual(
        ['Bleu', 'Jaune', 'Rouge', 'Vert'].sort(),
      );
      answer(bob!, { choiceIndexes: [0, 2] });
      answer(alice!, { choiceIndexes: [0] });
      expect(result(bob!).correct).toBe(true);
      expect(result(alice!).correct).toBe(false);
    });
  });
});
