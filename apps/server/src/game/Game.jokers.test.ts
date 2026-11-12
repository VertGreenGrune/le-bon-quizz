import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLASSIC_DEMO_QUIZ,
  FREEZE_MS,
  JOKERS_AT_START,
  jokerAllowed,
  PAUSE_GRACE_MS,
  QUESTION_INTRO_MS,
  RESUME_COUNTDOWN_MS,
  type JokerType,
  type JokerUsedPayload,
  type PlayerJokersPayload,
  type PlayerResultPayload,
  type QuestionRevealPayload,
  type Question,
  type Quiz,
  type ServerToClientEvents,
  type StandingsPayload,
} from '@lbq/shared';
import { Game, type GameSettings, type GameTransport, type Player } from './Game.js';
import { GameError } from './errors.js';
import { e2eJokerHand } from './jokers.js';
import { rightAnswer, wrongAnswer, introOf } from './testing.js';

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
  return { sent, transport, last, clear: () => (sent.length = 0) };
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

const mcq = (text: string): Question => ({
  text,
  type: 'MCQ',
  timeLimitSec: 20,
  basePoints: 1000,
  choices: [
    { text: 'Bon', isCorrect: true },
    { text: 'Faux A', isCorrect: false },
    { text: 'Faux B', isCorrect: false },
    { text: 'Faux C', isCorrect: false },
  ],
});

/** 4 MCQ of 20 s / 1000 pts, choice 0 right: an instant right answer = 1000 points. */
const quiz: Quiz = {
  id: 'jokers',
  title: 'Jokers',
  questions: [1, 2, 3, 4].map((i) => mcq(`Q${i}`)),
};
const RIGHT = { choiceIndex: 0 };
const WRONG = { choiceIndex: 1 };

describe('Jokers', () => {
  let rec: ReturnType<typeof recorder>;
  let game: Game;

  const create = (q: Quiz = quiz, settings: Partial<GameSettings> = {}) => {
    game?.dispose();
    rec = recorder();
    game = new Game(
      '123456',
      q,
      rec.transport,
      {},
      { mode: 'solo', allAnsweredGraceMs: 0, jokers: true, ...settings },
    );
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
  const hand = (p: Player, jokers: JokerType[]) => game.jokers!.setHand(p.id, jokers);
  const state = (p: Player) => rec.last('joker:state', p.socketId!) as PlayerJokersPayload;
  const result = (p: Player) => rec.last('player:result', p.socketId!) as PlayerResultPayload;
  const used = () => rec.last('joker:used', 'all') as JokerUsedPayload;
  const reveal = () => rec.last('question:reveal', 'host') as QuestionRevealPayload;
  const play = (p: Player, joker: JokerType, target?: Player) =>
    game.useJoker(p.id, game.questionIndex, joker, target?.id);
  const answer = (p: Player, input: { choiceIndex: number } | object) =>
    game.answer(p.id, game.questionIndex, input as { choiceIndex: number });
  const toAnswering = () => {
    vi.advanceTimersByTime(introOf(game));
    expect(game.phase).toBe('ANSWERING');
  };
  /** LEADERBOARD → next question's ANSWERING. */
  const nextQuestion = () => {
    if (game.phase === 'REVEAL') game.next();
    game.next();
    toAnswering();
  };

  describe('hands', () => {
    it('deals 3 different jokers to each player at the start, flags the game state', () => {
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      for (const p of [alice!, bob!]) {
        const { hand: h } = state(p);
        expect(h).toHaveLength(JOKERS_AT_START);
        expect(new Set(h).size).toBe(JOKERS_AT_START);
      }
      expect(game.statePayload().jokers).toBe(true);
      expect(state(alice!).others.map((o) => o.nickname)).toEqual(['Bob']);
    });

    it('a game without the option has no jokers: refused, nothing sent', () => {
      create(quiz, { jokers: false });
      const [alice] = joinAll('Alice');
      game.start();
      expect(game.statePayload().jokers).toBeUndefined();
      expectGameError(() => play(alice!, 'double'), 'JOKER_REFUSED');
      expect(rec.sent.some((s) => s.event === 'joker:state')).toBe(false);
    });

    it('earns a joker every 3 correct answers in a row, at most 5 in hand', () => {
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      hand(alice!, ['double']);
      hand(bob!, ['double', 'double', 'double', 'double', 'double']);
      for (let q = 0; q < 3; q++) {
        if (q > 0) nextQuestion();
        else toAnswering();
        answer(alice!, RIGHT);
        answer(bob!, RIGHT);
      }
      expect(game.phase).toBe('REVEAL');
      expect(state(alice!).hand).toHaveLength(2);
      expect(result(alice!).jokers).toEqual([{ kind: 'earned', joker: state(alice!).hand[1] }]);
      expect(state(bob!).hand).toHaveLength(5); // full hand: nothing more
      expect(result(bob!).jokers).toBeUndefined();
    });

    it('refuses a joker not in hand, a second one, after answering, on another question', () => {
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      hand(alice!, ['double', 'hourglass']);
      hand(bob!, ['fifty', 'copy']);
      expectGameError(() => play(alice!, 'thief', bob), 'JOKER_REFUSED');
      expectGameError(() => game.useJoker(alice!.id, 1, 'double'), 'JOKER_REFUSED');
      play(alice!, 'double'); // QUESTION_INTRO is fine
      expectGameError(() => play(alice!, 'hourglass'), 'JOKER_REFUSED');
      toAnswering();
      answer(bob!, WRONG);
      // After answering: 50/50 and Copieur are « before answering » only (T42).
      expectGameError(() => play(bob!, 'fifty'), 'JOKER_REFUSED');
      expectGameError(() => play(bob!, 'copy', alice), 'JOKER_REFUSED');
      expect(state(alice!).hand).toEqual(['hourglass']);
      expect(state(bob!).hand).toEqual(['fifty', 'copy']); // refused = kept
    });

    it('refuses a target that is yourself or unknown', () => {
      const [alice] = joinAll('Alice', 'Bob');
      game.start();
      hand(alice!, ['freeze']);
      expectGameError(() => play(alice!, 'freeze', alice), 'JOKER_REFUSED');
      expectGameError(() => play(alice!, 'freeze'), 'JOKER_REFUSED');
    });
  });

  describe('50/50', () => {
    it('hides half of the wrong choices on that phone only, never a right one', () => {
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      hand(alice!, ['fifty']);
      play(alice!, 'fifty');
      const hidden = state(alice!).effects.hiddenChoices!;
      expect(hidden).toHaveLength(2);
      expect(hidden).not.toContain(0);
      expect(state(bob!).effects).toEqual({});
      expect(used()).toMatchObject({ joker: 'fifty', by: { nickname: 'Alice' } });
    });

    it('narrows the slider around the answer, gives the first letter of a typed answer', () => {
      create(CLASSIC_DEMO_QUIZ);
      const [alice] = joinAll('Alice');
      game.start();
      const toIndex = (i: number) => {
        while (game.questionIndex < i) {
          if (game.phase === 'QUESTION_INTRO') toAnswering();
          answer(alice!, rightAnswer(game.currentQuestion!));
          game.next();
          game.next();
        }
      };
      toIndex(5); // TYPE_ANSWER « Pacifique »
      hand(alice!, ['fifty']);
      play(alice!, 'fifty');
      expect(state(alice!).effects).toEqual({ firstLetter: 'P' });

      toAnswering();
      toIndex(6); // SLIDER 1700–1900, 1789
      hand(alice!, ['fifty']);
      play(alice!, 'fifty');
      const range = state(alice!).effects.sliderRange!;
      expect(range.max - range.min).toBe(100);
      expect(range.min).toBeLessThanOrEqual(1789);
      expect(range.max).toBeGreaterThanOrEqual(1789);
    });

    it('is not offered on a true/false question, no joker at all on a poll', () => {
      create(CLASSIC_DEMO_QUIZ);
      const [alice] = joinAll('Alice');
      game.start();
      toAnswering();
      answer(alice!, rightAnswer(game.currentQuestion!));
      nextQuestion(); // TRUE_FALSE
      hand(alice!, ['fifty', 'double']);
      expectGameError(() => play(alice!, 'fifty'), 'JOKER_REFUSED');
      expect(jokerAllowed('TRUE_FALSE', 'scramble')).toBe(false); // Brouilleur: choix multiple only
      answer(alice!, { choiceIndex: 0 });
      nextQuestion();
      answer(alice!, rightAnswer(game.currentQuestion!));
      nextQuestion();
      answer(alice!, rightAnswer(game.currentQuestion!));
      game.next();
      game.next(); // POLL intro
      expect(game.currentQuestion!.type).toBe('POLL');
      expectGameError(() => play(alice!, 'double'), 'JOKER_REFUSED');
      expect(state(alice!).hand.slice(0, 2)).toEqual(['fifty', 'double']); // + 1 earned
    });
  });

  describe('Copieur', () => {
    it("gives the target's answer automatically, with its time + 1 s", () => {
      const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
      game.start();
      hand(alice!, ['copy']);
      play(alice!, 'copy', bob);
      expect(used().target).toBeUndefined(); // whom you copy stays secret
      expect(state(alice!).played).toMatchObject({ joker: 'copy', target: { nickname: 'Bob' } });
      toAnswering();
      expectGameError(() => answer(alice!, WRONG), 'ALREADY_ANSWERED');
      vi.advanceTimersByTime(2000);
      answer(bob!, RIGHT); // 950
      expect(state(alice!).effects.copied).toBe(true);
      answer(chloe!, WRONG);
      expect(game.phase).toBe('REVEAL'); // the copier did not block the end
      expect(result(bob!).pointsEarned).toBe(950);
      expect(result(alice!)).toMatchObject({ correct: true, pointsEarned: 925 });
      expect(result(alice!).jokers).toEqual([
        { kind: 'copied', player: { id: bob!.id, nickname: 'Bob', avatar: bob!.avatar } },
      ]);
    });

    it('two players copying the same target both get the answer', () => {
      const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
      game.start();
      hand(alice!, ['copy']);
      hand(chloe!, ['copy']);
      play(alice!, 'copy', bob);
      play(chloe!, 'copy', bob);
      toAnswering();
      answer(bob!, RIGHT);
      expect(game.phase).toBe('REVEAL');
      expect(result(alice!).correct).toBe(true);
      expect(result(chloe!).correct).toBe(true);
    });

    it('gets nothing if the target never answers (time runs out)', () => {
      const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
      game.start();
      hand(alice!, ['copy']);
      play(alice!, 'copy', bob);
      toAnswering();
      answer(chloe!, RIGHT);
      vi.advanceTimersByTime(20_000);
      expect(game.phase).toBe('REVEAL');
      expect(result(alice!)).toMatchObject({ correct: false, pointsEarned: 0, streak: 0 });
      expect(result(alice!).jokers?.[0]?.kind).toBe('copyMissed');
    });

    it('copies at once a target who already answered (no earlier than now)', () => {
      const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
      game.start();
      hand(alice!, ['copy']);
      toAnswering();
      answer(bob!, RIGHT); // 1000
      vi.advanceTimersByTime(4000);
      play(alice!, 'copy', bob);
      answer(chloe!, WRONG);
      expect(result(alice!).pointsEarned).toBe(900); // at 4 s, not 1 s
    });
  });

  describe('attacks', () => {
    it('Gel during the intro: refuses the target’s answers for 5 s of this question, pauses excluded', () => {
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      hand(alice!, ['freeze']);
      play(alice!, 'freeze', bob);
      expect(used()).toMatchObject({ joker: 'freeze', target: { nickname: 'Bob' } });
      toAnswering();
      expect(state(bob!).effects.frozen).toMatchObject({
        ms: FREEZE_MS,
        by: { nickname: 'Alice' },
      });
      vi.advanceTimersByTime(3000);
      game.disconnect(alice!.socketId!); // pause: the frozen time stops too
      vi.advanceTimersByTime(PAUSE_GRACE_MS + 10_000);
      game.rejoin(alice!.sessionToken, 'sock-alice-2');
      vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
      expect(game.paused).toBe(false);
      vi.advanceTimersByTime(1000);
      expectGameError(() => answer(bob!, RIGHT), 'FROZEN');
      vi.advanceTimersByTime(1000);
      answer(bob!, RIGHT);
      expect(bob!.answer?.responseMs).toBe(FREEZE_MS);
    });

    it('Brouilleur: moving buttons (choices + texts sent), right away on this question', () => {
      create(CLASSIC_DEMO_QUIZ);
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      for (let i = 0; i < 3; i++) {
        if (i > 0) nextQuestion();
        else toAnswering();
        answer(alice!, rightAnswer(game.currentQuestion!));
        answer(bob!, rightAnswer(game.currentQuestion!));
      }
      game.next();
      game.next(); // Q4 (Joconde) intro
      hand(alice!, ['scramble']);
      play(alice!, 'scramble', bob);
      const scrambled = state(bob!).effects.scrambled!;
      expect(scrambled.by.nickname).toBe('Alice');
      expect(scrambled.choices.map((c) => c.text).sort()).toEqual(
        ['Botticelli', 'Léonard de Vinci', 'Michel-Ange', 'Raphaël'].sort(),
      );
      expect(scrambled.choices.map((c) => c.index)).not.toEqual([0, 1, 2, 3]);
      expect(state(alice!).effects.scrambled).toBeUndefined();
    });

    it('Brouilleur is refused on questions without buttons (joker kept)', () => {
      create(CLASSIC_DEMO_QUIZ);
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      for (let i = 0; i < 4; i++) {
        if (i > 0) nextQuestion();
        else toAnswering();
        answer(alice!, rightAnswer(game.currentQuestion!));
        answer(bob!, rightAnswer(game.currentQuestion!));
      }
      for (let i = 4; i < 7; i++) {
        game.next();
        game.next(); // poll, typed, slider intro
        hand(alice!, ['scramble']);
        expectGameError(() => play(alice!, 'scramble', bob), 'JOKER_REFUSED');
        expect(game.jokers!.leaderboardInfo(alice!.id)?.hand).toEqual(['scramble']);
        toAnswering();
        answer(alice!, rightAnswer(game.currentQuestion!));
        answer(bob!, rightAnswer(game.currentQuestion!));
      }
    });

    it('Gel during ANSWERING: 5 s from when it lands, on a target who hasn’t answered', () => {
      const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
      game.start();
      hand(alice!, ['freeze']);
      toAnswering();
      vi.advanceTimersByTime(4000);
      play(alice!, 'freeze', bob);
      expect(state(bob!).effects.frozen).toMatchObject({ ms: 4000 + FREEZE_MS });
      vi.advanceTimersByTime(4000);
      expectGameError(() => answer(bob!, RIGHT), 'FROZEN');
      vi.advanceTimersByTime(1000);
      answer(bob!, RIGHT);
      expect(bob!.answer?.responseMs).toBe(4000 + FREEZE_MS);
      answer(alice!, RIGHT);
      answer(chloe!, RIGHT);
    });

    it('Gel / Brouilleur refused on a target who already answered (joker kept)', () => {
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      hand(alice!, ['freeze', 'scramble']);
      toAnswering();
      answer(bob!, RIGHT);
      expect(state(alice!).answered).toEqual([bob!.id]);
      for (const joker of ['freeze', 'scramble'] as const) {
        try {
          play(alice!, joker, bob);
          throw new Error('expected a refusal');
        } catch (err) {
          expect((err as GameError).code).toBe('JOKER_REFUSED');
          expect((err as GameError).message).toBe('Bob a déjà répondu');
        }
      }
      expect(state(alice!).hand).toEqual(['freeze', 'scramble']);
      expect(rec.sent.some((s) => s.event === 'joker:used')).toBe(false);
    });

    it('a « Survie » haunt still lands on the target’s next question', () => {
      create(quiz, { mode: 'survival', jokers: true });
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      game.jokers!.haunt(alice!, 'freeze', bob!);
      expect(state(bob!).effects.frozen).toBeUndefined();
      toAnswering();
      answer(alice!, RIGHT);
      answer(bob!, RIGHT);
      nextQuestion();
      expect(state(bob!).effects.frozen).toMatchObject({ ms: FREEZE_MS });
    });

    it('one attack per target per question', () => {
      const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
      game.start();
      hand(alice!, ['freeze']);
      hand(chloe!, ['scramble']);
      play(alice!, 'freeze', bob);
      expect(state(chloe!).attacked).toEqual([bob!.id]);
      expectGameError(() => play(chloe!, 'scramble', bob), 'JOKER_REFUSED');
      play(chloe!, 'scramble', alice);
    });

    it('Bouclier blocks the next attack (announced) and keeps the streak on a wrong answer', () => {
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      hand(bob!, ['shield']);
      hand(alice!, ['freeze']);
      bob!.streak = 2;
      play(bob!, 'shield');
      expect(state(bob!).shield).toBe(true);
      play(alice!, 'freeze', bob);
      expect(used()).toMatchObject({ joker: 'freeze', blocked: true });
      expect(state(bob!).shield).toBeUndefined();
      expect(state(bob!).effects.frozen).toBeUndefined(); // blocked
      toAnswering();
      answer(bob!, WRONG);
      answer(alice!, RIGHT);
      expect(result(bob!)).toMatchObject({ correct: false, streak: 2 });
      expect(result(bob!).jokers).toEqual([{ kind: 'shieldSaved' }]);
    });

    it('Voleur: the wheel lands on another player, 10 % of their score goes to the thief', () => {
      create(quiz, { random: () => 0.99 }); // last player of the wheel: Bob
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      bob!.totalScore = 5000;
      hand(alice!, ['thief']);
      play(alice!, 'thief');
      expect(used()).toMatchObject({ questionIndex: 0, joker: 'thief' });
      expect(used().target).toBeUndefined(); // no target any more (T51)
      toAnswering();
      answer(alice!, RIGHT);
      answer(bob!, WRONG);
      expect(alice!.totalScore).toBe(1500);
      expect(bob!.totalScore).toBe(4500);
      expect(result(alice!)).toMatchObject({ pointsEarned: 1500 });
      expect(result(bob!)).toMatchObject({ pointsEarned: -500 });
      expect(result(alice!).jokers).toEqual([
        { kind: 'stole', points: 500, player: expect.objectContaining({ nickname: 'Bob' }) },
      ]);
      expect(result(bob!).jokers).toEqual([
        { kind: 'stolen', points: 500, player: expect.objectContaining({ nickname: 'Alice' }) },
      ]);
    });

    it('Voleur: steals even on a wrong answer; the wheel lists every player', () => {
      create(quiz, { random: () => 0.5 }); // middle of 3: Bob
      const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
      game.start();
      bob!.totalScore = 5000;
      hand(alice!, ['thief']);
      play(alice!, 'thief');
      toAnswering();
      answer(alice!, WRONG);
      answer(bob!, RIGHT);
      answer(chloe!, RIGHT);
      expect(bob!.totalScore).toBe(5400); // 6000 − 600
      expect(alice!.totalScore).toBe(600);
      const names = (ms: { nickname: string }[]) => ms.map((m) => m.nickname);
      const [wheel] = reveal().wheels!;
      expect(names(wheel!.candidates)).toEqual(['Alice', 'Bob', 'Chloé']);
      expect(wheel).toMatchObject({ thief: { nickname: 'Alice' }, drawn: { nickname: 'Bob' } });
      expect(wheel!.points).toBe(600);
    });

    it('Voleur: the wheel lands on the thief, who loses 10 % (never below 0)', () => {
      create(quiz, { random: () => 0 }); // first player of the wheel: Alice
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      alice!.totalScore = 5000;
      hand(alice!, ['thief']);
      play(alice!, 'thief');
      toAnswering();
      answer(alice!, RIGHT); // 6000
      answer(bob!, RIGHT);
      expect(alice!.totalScore).toBe(5400);
      expect(bob!.totalScore).toBe(1000);
      expect(result(alice!)).toMatchObject({ pointsEarned: 400 });
      expect(result(alice!).jokers).toEqual([{ kind: 'selfRobbed', points: 600 }]);
      expect(reveal().wheels![0]).toMatchObject({ drawn: { nickname: 'Alice' }, points: 600 });
    });

    it('Voleur: a Bouclier of the drawn player blocks it', () => {
      create(quiz, { random: () => 0.99 }); // Bob
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      bob!.totalScore = 5000;
      hand(alice!, ['thief']);
      hand(bob!, ['shield']);
      play(bob!, 'shield');
      play(alice!, 'thief');
      toAnswering();
      answer(alice!, RIGHT);
      answer(bob!, RIGHT);
      expect(bob!.totalScore).toBe(6000);
      expect(alice!.totalScore).toBe(1000);
      expect(reveal().wheels![0]).toMatchObject({
        drawn: { nickname: 'Bob' },
        points: 0,
        blocked: true,
      });
      expect(result(alice!).jokers).toEqual([
        { kind: 'stealBlocked', player: expect.objectContaining({ nickname: 'Bob' }) },
      ]);
      expect(result(bob!).jokers).toEqual([
        { kind: 'wheelShielded', player: expect.objectContaining({ nickname: 'Alice' }) },
      ]);
      expect(state(bob!).shield).toBeUndefined(); // used up
    });

    it('Voleur: two thieves spin one wheel each, in the order played', () => {
      const draws: number[] = [];
      create(quiz, { random: () => draws.shift() ?? 0.3 });
      const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
      game.start(); // dealing the hands used the random source: the draws come after it
      hand(alice!, ['thief']);
      hand(chloe!, ['thief']);
      draws.push(0.5, 0); // Chloé's wheel → Bob, then Alice's wheel → Alice
      play(chloe!, 'thief');
      play(alice!, 'thief');
      bob!.totalScore = 5000;
      toAnswering();
      for (const p of [alice!, bob!, chloe!]) answer(p, RIGHT);
      expect(reveal().wheels!.map((w) => [w.thief.nickname, w.drawn.nickname, w.points])).toEqual([
        ['Chloé', 'Bob', 600],
        ['Alice', 'Alice', 100],
      ]);
      expect(bob!.totalScore).toBe(5400);
      expect(chloe!.totalScore).toBe(1600);
      expect(alice!.totalScore).toBe(900);
    });
  });

  describe('score jokers', () => {
    it('Double ou rien: ×2 when right, −500 when wrong (never below 0)', () => {
      const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
      game.start();
      hand(alice!, ['double']);
      hand(bob!, ['double']);
      hand(chloe!, ['double']);
      bob!.totalScore = 2000;
      chloe!.totalScore = 300;
      for (const p of [alice!, bob!, chloe!]) play(p, 'double');
      toAnswering();
      answer(alice!, RIGHT);
      answer(bob!, WRONG);
      answer(chloe!, WRONG);
      expect(result(alice!)).toMatchObject({ pointsEarned: 2000, totalScore: 2000 });
      expect(result(alice!).jokers).toEqual([{ kind: 'double', points: 1000 }]);
      expect(result(bob!)).toMatchObject({ pointsEarned: -500, totalScore: 1500 });
      expect(result(chloe!)).toMatchObject({ pointsEarned: -300, totalScore: 0 });
      expect(result(chloe!).jokers).toEqual([{ kind: 'doubleLost', points: 300 }]);
    });

    it('Sablier: speed points as if answered in half the time', () => {
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      hand(alice!, ['hourglass']);
      play(alice!, 'hourglass');
      toAnswering();
      vi.advanceTimersByTime(4000);
      answer(alice!, RIGHT); // as at 2 s → 950 instead of 900
      answer(bob!, RIGHT); // 900
      expect(result(alice!).pointsEarned).toBe(950);
      expect(result(bob!).pointsEarned).toBe(900);
      expect(result(alice!).jokers).toEqual([{ kind: 'hourglass', points: 50 }]);
    });

    describe('after answering (T42)', () => {
      it('Double ou rien and Voleur played while waiting for the others', () => {
        create(quiz, { random: () => 0.5 }); // the Voleur wheel lands on Bob (middle of 3)
        const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
        game.start();
        bob!.totalScore = 5000;
        hand(alice!, ['double']);
        hand(chloe!, ['thief']);
        toAnswering();
        answer(alice!, RIGHT);
        answer(chloe!, RIGHT);
        play(alice!, 'double');
        play(chloe!, 'thief');
        expect(state(alice!).played).toEqual({ joker: 'double' });
        answer(bob!, WRONG);
        expect(result(alice!)).toMatchObject({ pointsEarned: 2000 });
        expect(result(chloe!).jokers).toEqual([
          { kind: 'stole', points: 500, player: expect.objectContaining({ nickname: 'Bob' }) },
        ]);
      });

      it('Bouclier keeps the streak of a wrong answer already given, and arms the shield', () => {
        const [alice, bob] = joinAll('Alice', 'Bob');
        game.start();
        hand(bob!, ['shield']);
        bob!.streak = 4;
        toAnswering();
        answer(bob!, WRONG);
        play(bob!, 'shield');
        expect(state(bob!).shield).toBe(true);
        answer(alice!, RIGHT);
        expect(result(bob!)).toMatchObject({ correct: false, streak: 4 });
      });

      it('Sablier counts the recorded answer time half', () => {
        const [alice, bob] = joinAll('Alice', 'Bob');
        game.start();
        hand(alice!, ['hourglass']);
        toAnswering();
        vi.advanceTimersByTime(4000);
        answer(alice!, RIGHT); // at 4 s: 900
        vi.advanceTimersByTime(3000);
        play(alice!, 'hourglass'); // as at 2 s: 950
        answer(bob!, RIGHT);
        expect(result(alice!).pointsEarned).toBe(950);
        expect(result(alice!).jokers).toEqual([{ kind: 'hourglass', points: 50 }]);
      });

      it('still one joker per question: one played before answering is the only one', () => {
        const [alice, bob] = joinAll('Alice', 'Bob');
        game.start();
        hand(alice!, ['shield', 'double']);
        play(alice!, 'shield');
        toAnswering();
        answer(alice!, RIGHT);
        expectGameError(() => play(alice!, 'double'), 'JOKER_REFUSED');
        answer(bob!, RIGHT);
      });

      it('team mode: Double after answering counts in the team average', () => {
        create(quiz, { mode: 'teams', jokers: true });
        const [r1, b1] = joinAll('R1', 'B1');
        game.setTeam(r1!.id, 0);
        game.setTeam(b1!.id, 1);
        game.start();
        hand(r1!, ['double']);
        toAnswering();
        answer(r1!, RIGHT);
        play(r1!, 'double');
        answer(b1!, RIGHT);
        game.next();
        const teams = (rec.last('leaderboard', 'host') as StandingsPayload).teams!;
        expect(teams.find((t) => t.id === 0)?.score).toBe(2000);
        expect(teams.find((t) => t.id === 1)?.score).toBe(1000);
      });
    });

    describe('intro length (T42)', () => {
      it('8 s with jokers, 3 s without, longer for long texts, 3 s on a poll', () => {
        const long = { ...mcq('x'.repeat(161)) };
        const poll: Question = {
          text: 'Sondage ?',
          type: 'POLL',
          timeLimitSec: 20,
          basePoints: 0,
          choices: [{ text: 'A' }, { text: 'B' }],
        };
        create({ ...quiz, questions: [mcq('Q1'), long, poll] });
        const [alice] = joinAll('Alice');
        game.start();
        expect(game.statePayload()).toMatchObject({ phase: 'QUESTION_INTRO', introMs: 8000 });
        expect(game.statePayload().remainingMs).toBe(8000);
        vi.advanceTimersByTime(7999);
        expect(game.phase).toBe('QUESTION_INTRO');
        vi.advanceTimersByTime(1);
        expect(game.statePayload().introMs).toBeUndefined();
        answer(alice!, RIGHT);
        game.next();
        game.next();
        expect(introOf(game)).toBe(11_000); // 161 characters: 81 beyond 80 → + 3 s
        vi.advanceTimersByTime(11_000);
        answer(alice!, RIGHT);
        game.next();
        game.next();
        expect(introOf(game)).toBe(QUESTION_INTRO_MS); // a poll takes no joker

        create(quiz, { jokers: false });
        joinAll('Alice');
        game.start();
        expect(introOf(game)).toBe(QUESTION_INTRO_MS);
        create(quiz, { mode: 'survival' }); // haunts, without the Jokers option
        joinAll('Alice');
        game.start();
        expect(introOf(game)).toBe(8000);
      });

      it('a pause during the intro freezes it; the state (and so the resyncs) has its length', () => {
        const [alice, bob] = joinAll('Alice', 'Bob');
        game.start();
        vi.advanceTimersByTime(3000);
        game.disconnect(bob!.socketId!);
        vi.advanceTimersByTime(PAUSE_GRACE_MS + 10_000);
        expect(game.phase).toBe('QUESTION_INTRO');
        game.rejoin(bob!.sessionToken, 'sock-bob-2');
        expect(game.statePayload()).toMatchObject({ introMs: 8000 }); // the resync sends it
        vi.advanceTimersByTime(RESUME_COUNTDOWN_MS + 4999);
        expect(game.phase).toBe('QUESTION_INTRO');
        vi.advanceTimersByTime(1);
        expect(game.phase).toBe('ANSWERING');
        answer(alice!, RIGHT);
      });
    });

    it('works on every question type that takes jokers (typed, slider)', () => {
      create(CLASSIC_DEMO_QUIZ);
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      for (let i = 0; i < 7; i++) {
        if (i > 0) nextQuestion();
        else toAnswering();
        const q = game.currentQuestion!;
        if (q.type === 'TYPE_ANSWER' || q.type === 'SLIDER') {
          hand(alice!, ['double']);
          play(alice!, 'double');
          const before = alice!.totalScore;
          answer(alice!, rightAnswer(q));
          answer(bob!, wrongAnswer(q));
          expect(alice!.totalScore - before).toBe(result(alice!).pointsEarned);
          expect(result(alice!).jokers?.[0]).toMatchObject({ kind: 'double' });
        } else {
          answer(alice!, rightAnswer(q));
          answer(bob!, rightAnswer(q));
        }
      }
    });
  });

  describe('team mode', () => {
    const teamGame = () => {
      create(quiz, { mode: 'teams', teamCount: 2 });
      const players = joinAll('Alice', 'Bob', 'Chloé');
      game.setTeam(players[0]!.id, 0);
      game.setTeam(players[1]!.id, 0);
      game.setTeam(players[2]!.id, 1);
      game.start();
      return players;
    };

    it('attacks only the other teams, copies only your own team', () => {
      const [alice, bob, chloe] = teamGame();
      hand(alice!, ['freeze', 'copy']);
      expectGameError(() => play(alice!, 'freeze', bob), 'JOKER_REFUSED');
      expectGameError(() => play(alice!, 'copy', chloe), 'JOKER_REFUSED');
      play(alice!, 'copy', bob);
      // T51: the Voleur has no target (its wheel takes every player, teammates included).
      hand(chloe!, ['thief']);
      play(chloe!, 'thief');
    });

    it('team averages use the points after the jokers', () => {
      const [alice, bob, chloe] = teamGame();
      hand(alice!, ['double']);
      play(alice!, 'double');
      toAnswering();
      answer(alice!, RIGHT); // 2000
      answer(bob!, WRONG); // 0
      answer(chloe!, RIGHT); // 1000
      game.next();
      const board = rec.last('leaderboard', 'host') as StandingsPayload;
      expect(board.teams).toEqual([
        expect.objectContaining({ id: 0, score: 1000 }),
        expect.objectContaining({ id: 1, score: 1000 }),
      ]);
    });
  });

  describe('rejoin, kick, reports', () => {
    it('a phone that rejoins gets its hand and effects back', () => {
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      hand(alice!, ['fifty', 'double']);
      play(alice!, 'fifty');
      const hidden = state(alice!).effects.hiddenChoices;
      game.disconnect(alice!.socketId!);
      const player = game.rejoin(alice!.sessionToken, 'sock-new');
      game.resync(player);
      expect(rec.last('joker:state', 'sock-new')).toMatchObject({
        hand: ['double'],
        played: { joker: 'fifty' },
        effects: { hiddenChoices: hidden },
      });
      void bob;
    });

    it('a copier of a kicked player stops waiting', () => {
      const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
      game.start();
      hand(alice!, ['copy']);
      play(alice!, 'copy', bob);
      toAnswering();
      answer(chloe!, RIGHT);
      game.kick(bob!.id);
      expect(game.phase).toBe('REVEAL');
    });

    it('leaderboard shows hands and the joker played; standings keep the jokers used', () => {
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      hand(alice!, ['double', 'shield']);
      hand(bob!, []);
      play(alice!, 'double');
      toAnswering();
      answer(alice!, RIGHT);
      answer(bob!, RIGHT);
      game.next();
      const board = rec.last('leaderboard', 'host') as StandingsPayload;
      expect(board.top[0]).toMatchObject({
        nickname: 'Alice',
        jokers: { hand: ['shield'], used: 'double' },
      });
      expect(board.top[1]).toMatchObject({ nickname: 'Bob', jokers: { hand: [] } });
      game.kick(bob!.id);
      game.end();
      expect(game.standings().map((s) => s.jokersUsed)).toEqual([['double'], []]);
    });

    it('jokers are refused while the game is paused', () => {
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      hand(alice!, ['double']);
      toAnswering();
      game.disconnect(bob!.socketId!);
      vi.advanceTimersByTime(PAUSE_GRACE_MS);
      expect(game.paused).toBe(true);
      expectGameError(() => play(alice!, 'double'), 'GAME_PAUSED');
    });
  });
});

describe('e2eJokerHand', () => {
  it('reads a fixed hand outside production only', () => {
    expect(e2eJokerHand({ E2E_JOKER_HAND: 'freeze, copy' })).toEqual(['freeze', 'copy']);
    expect(e2eJokerHand({ E2E_JOKER_HAND: 'freeze', NODE_ENV: 'production' })).toBeUndefined();
    expect(e2eJokerHand({ E2E_JOKER_HAND: 'freeze,nope' })).toBeUndefined();
    expect(e2eJokerHand({})).toBeUndefined();
  });
});

// Wave 6: jokers on the T27 question types (wired in `jokerAvailability` at merge).
describe('Jokers on the T27 question types', () => {
  const ITEMS = ['Beetlejuice', 'Batman', 'Edward aux mains d’argent', 'Ed Wood'];
  const quizT27: Quiz = {
    id: 'jokers-t27',
    title: 'Jokers et nouveaux types',
    questions: [
      { text: 'Dans l’ordre', type: 'ORDER', timeLimitSec: 20, basePoints: 1000, items: ITEMS },
      { text: 'Nuage', type: 'WORD_CLOUD', timeLimitSec: 20, basePoints: 0 },
    ] as Question[],
  };
  let rec: ReturnType<typeof recorder>;
  let game: Game;

  beforeEach(() => {
    vi.useFakeTimers();
    rec = recorder();
    game = new Game(
      '123456',
      quizT27,
      rec.transport,
      {},
      { mode: 'solo', allAnsweredGraceMs: 0, jokers: true },
    );
  });
  afterEach(() => {
    game.dispose();
    vi.useRealTimers();
  });

  it('ordre: Double ou rien doubles the points, 50/50 is refused', () => {
    const alice = game.join('Alice', 'sock-a');
    game.join('Bob', 'sock-b');
    game.start();
    game.jokers!.setHand(alice.id, ['double', 'fifty']);
    vi.advanceTimersByTime(introOf(game));
    expectGameError(() => game.useJoker(alice.id, 0, 'fifty'), 'JOKER_REFUSED');
    game.useJoker(alice.id, 0, 'double');
    const prompt = rec.last('question:prompt', 'sock-a') as { items: string[] };
    const order = ITEMS.map((item) => prompt.items.indexOf(item));
    game.answer(alice.id, 0, { order });
    vi.advanceTimersByTime(20_000); // Bob doesn't answer: the timer ends ANSWERING
    const res = rec.last('player:result', 'sock-a') as PlayerResultPayload;
    expect(res.correct).toBe(true);
    expect(res.pointsEarned).toBe(2000);
  });

  it('nuage de mots: no right answer, so jokers are refused (like a poll)', () => {
    const alice = game.join('Alice', 'sock-a');
    game.start();
    game.jokers!.setHand(alice.id, ['double']);
    vi.advanceTimersByTime(introOf(game));
    game.next(); // skip the ORDER question
    game.next();
    game.next();
    vi.advanceTimersByTime(introOf(game));
    expect(game.currentQuestion?.type).toBe('WORD_CLOUD');
    expectGameError(() => game.useJoker(alice.id, 1, 'double'), 'JOKER_REFUSED');
  });
});
