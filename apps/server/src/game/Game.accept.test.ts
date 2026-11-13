import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AnswerInput,
  JokerType,
  PlayerResultPayload,
  Question,
  QuestionRevealPayload,
  Quiz,
  ServerToClientEvents,
  StandingsPayload,
  SurvivalStatePayload,
} from '@lbq/shared';
import { Game, type GameSettings, type GameTransport, type Player } from './Game.js';
import { GameError } from './errors.js';

// T44: « ✅ Accepter aussi cette réponse » — the host fixes a question whose answer was set wrong.

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

const base = { timeLimitSec: 20, basePoints: 1000 } as const;
/** Choice 0 is marked right; the « real » answer is choice 1. */
const mcq = (text = 'Q'): Question => ({
  ...base,
  text,
  type: 'MCQ',
  choices: [
    { text: 'A', isCorrect: true },
    { text: 'B', isCorrect: false },
    { text: 'C', isCorrect: false },
  ],
});
const trueFalse: Question = {
  ...base,
  text: 'Vrai ?',
  type: 'TRUE_FALSE',
  choices: [
    { text: 'Vrai', isCorrect: true },
    { text: 'Faux', isCorrect: false },
  ],
};
const selectAll: Question = {
  ...base,
  text: 'Coche',
  type: 'MCQ',
  choices: [
    { text: 'A', isCorrect: true },
    { text: 'B', isCorrect: true },
    { text: 'C', isCorrect: false },
    { text: 'D', isCorrect: false },
  ],
};
const typed: Question = {
  ...base,
  text: 'Océan ?',
  type: 'TYPE_ANSWER',
  acceptedAnswers: ['Pacifique'],
  typoTolerance: true,
};
const slider: Question = {
  ...base,
  text: 'Année ?',
  type: 'SLIDER',
  slider: { min: 1700, max: 1900, step: 1, correct: 1789, margin: 0 },
};
const poll: Question = {
  ...base,
  text: 'Sondage',
  type: 'POLL',
  basePoints: 0,
  choices: [{ text: 'X' }, { text: 'Y' }],
};

const RIGHT = { choiceIndex: 0 };
const REAL = { choiceIndex: 1 };
const WRONG = { choiceIndex: 2 };

/** Points of a right answer after `ms` (20 s, 1000 points). */
const at = (ms: number) => Math.round(1000 * (1 - ms / 20000 / 2));

describe('host accepts a refused answer (T44)', () => {
  let rec: ReturnType<typeof recorder>;
  let game: Game;

  const create = (questions: Question[], settings: Partial<GameSettings> = {}) => {
    rec = recorder();
    const quiz: Quiz = { id: 'accept', title: 'Accepter', questions };
    game = new Game(
      '123456',
      quiz,
      rec.transport,
      {},
      { mode: 'solo', allAnsweredGraceMs: 0, ...settings },
    );
  };
  const joinAll = (...names: string[]) => names.map((n) => game.join(n, `sock-${n}`)) as Player[];
  const answer = (p: Player, input: object) =>
    game.answer(p.id, game.questionIndex, input as AnswerInput);
  const toAnswering = () => {
    game.next();
    expect(game.phase).toBe('ANSWERING');
  };
  const toReveal = () => {
    if (game.phase === 'ANSWERING') game.next();
    expect(game.phase).toBe('REVEAL');
  };
  /** LEADERBOARD → next question's ANSWERING. */
  const nextQuestion = () => {
    if (game.phase === 'ANSWERING') game.next();
    if (game.phase === 'REVEAL') game.next();
    game.next();
    toAnswering();
  };
  const reveal = () => rec.last('question:reveal', 'host') as QuestionRevealPayload;
  const result = (p: Player) => rec.last('player:result', p.socketId!) as PlayerResultPayload;
  const accept = (input: { choiceIndex?: number; text?: string; margin?: number }) =>
    game.accept(game.questionIndex, input);
  const errorCode = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      return (e as GameError).code;
    }
    return null;
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    game.dispose();
    vi.useRealTimers();
  });

  it('MCQ: the accepted choice becomes right, with points from the real answer time', () => {
    create([mcq(), mcq('Q2')]);
    const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
    game.start();
    toAnswering();
    answer(alice!, RIGHT);
    vi.advanceTimersByTime(5000);
    answer(bob!, REAL);
    answer(chloe!, WRONG);
    toReveal();
    expect(result(bob!)).toMatchObject({ correct: false, pointsEarned: 0 });

    rec.sent.length = 0;
    accept({ choiceIndex: 1 });
    expect(reveal()).toMatchObject({
      correctIndexes: [0, 1],
      distribution: [1, 1, 1],
      accepted: { choiceIndexes: [1] },
    });
    expect(result(bob!)).toMatchObject({
      correct: true,
      pointsEarned: at(5000),
      totalScore: at(5000),
      streak: 1,
      accepted: true,
    });
    expect(result(alice!)).toMatchObject({ correct: true, pointsEarned: 1000 });
    expect(result(alice!)).not.toHaveProperty('accepted');
    expect(result(chloe!)).toMatchObject({ correct: false, rank: 3 });
    // The report snapshot follows (one entry for the question, not two).
    expect(game.questionStats).toHaveLength(1);
    expect(game.questionStats[0]).toMatchObject({
      correctIndexes: [0, 1],
      correctCount: 2,
      details: { accepted: { choiceIndexes: [1] } },
    });
    expect(game.standings().find((s) => s.nickname === 'Bob')?.correctCount).toBe(1);

    game.next();
    const board = rec.last('leaderboard', 'host') as StandingsPayload;
    expect(board.top.map((p) => [p.nickname, p.score, p.gained])).toEqual([
      ['Alice', 1000, 1000],
      ['Bob', at(5000), at(5000)],
      ['Chloé', 0, 0],
    ]);
  });

  it('accepting twice is a no-op, and only during the REVEAL of that question', () => {
    create([mcq(), poll]);
    const [alice] = joinAll('Alice');
    game.start();
    expect(errorCode(() => accept({ choiceIndex: 1 }))).toBe('NOT_REVEALING');
    toAnswering();
    answer(alice!, REAL);
    toReveal();
    expect(errorCode(() => game.accept(1, { choiceIndex: 1 }))).toBe('NOT_REVEALING');
    expect(errorCode(() => accept({ text: 'B' }))).toBe('INVALID_PAYLOAD');
    accept({ choiceIndex: 1 });
    const score = alice!.totalScore;
    rec.sent.length = 0;
    accept({ choiceIndex: 1 }); // already accepted
    accept({ choiceIndex: 0 }); // right in the quiz
    expect(rec.sent).toEqual([]);
    expect(alice!.totalScore).toBe(score);

    game.next(); // LEADERBOARD
    expect(errorCode(() => accept({ choiceIndex: 2 }))).toBe('NOT_REVEALING');
    nextQuestion();
    answer(alice!, { choiceIndex: 0 });
    toReveal();
    // A poll has no right answer to accept.
    expect(errorCode(() => accept({ choiceIndex: 1 }))).toBe('INVALID_PAYLOAD');
  });

  it('refuses buzzer questions (judged out loud)', () => {
    create([{ ...mcq(), buzzer: true }]);
    const [alice] = joinAll('Alice');
    game.start();
    toAnswering();
    game.buzz(alice!.id, 0);
    game.judge(false);
    toReveal();
    expect(errorCode(() => accept({ choiceIndex: 1 }))).toBe('INVALID_PAYLOAD');
  });

  it('vrai / faux: accepting the other choice makes both right', () => {
    create([trueFalse]);
    const [alice, bob] = joinAll('Alice', 'Bob');
    game.start();
    toAnswering();
    answer(alice!, { choiceIndex: 0 });
    answer(bob!, { choiceIndex: 1 });
    accept({ choiceIndex: 1 });
    expect(reveal().correctIndexes).toEqual([0, 1]);
    expect([result(alice!).correct, result(bob!).correct]).toEqual([true, true]);
  });

  it('« select all »: the accepted choice joins the set to tick, the old set stays right', () => {
    create([selectAll]);
    const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
    game.start();
    toAnswering();
    answer(alice!, { choiceIndexes: [0, 1] });
    answer(bob!, { choiceIndexes: [0, 1, 2] });
    answer(chloe!, { choiceIndexes: [0] });
    toReveal();
    accept({ choiceIndex: 2 });
    expect(reveal()).toMatchObject({ correctIndexes: [0, 1, 2], multiple: { allFound: 2 } });
    expect([alice, bob, chloe].map((p) => result(p!).correct)).toEqual([true, true, false]);
    expect(result(bob!)).toMatchObject({ accepted: true, multiple: { correctIndexes: [0, 1] } });
  });

  it('réponse libre: every typed group is listed, an accepted group becomes right', () => {
    create([typed]);
    const [alice, bob, chloe, dan] = joinAll('Alice', 'Bob', 'Chloé', 'Dan');
    game.start();
    toAnswering();
    answer(alice!, { text: 'Pacifique' });
    vi.advanceTimersByTime(2000);
    answer(bob!, { text: 'Atlantique' });
    answer(chloe!, { text: "l'atlantique" });
    answer(dan!, { text: 'Indien' });
    toReveal();
    expect(reveal().typedAnswers?.map((g) => [g.text, g.count, g.correct])).toEqual([
      ['Atlantique', 2, false],
      ['Pacifique', 1, true],
      ['Indien', 1, false],
    ]);
    accept({ text: 'Atlantique' });
    expect(reveal().typedAnswers).toEqual([
      { text: 'Atlantique', count: 2, correct: true, accepted: true },
      { text: 'Pacifique', count: 1, correct: true },
      { text: 'Indien', count: 1, correct: false },
    ]);
    expect(reveal().topAnswers?.[0]).toMatchObject({ text: 'Atlantique', accepted: true });
    expect(reveal().accepted).toEqual({ texts: ['Atlantique'] });
    expect(result(chloe!)).toMatchObject({ correct: true, pointsEarned: at(2000), accepted: true });
    expect(result(dan!).correct).toBe(false);
  });

  it('curseur: a wider margin scores every guess again', () => {
    create([slider]);
    const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
    game.start();
    toAnswering();
    answer(alice!, { value: 1789 });
    answer(bob!, { value: 1794 });
    answer(chloe!, { value: 1850 });
    toReveal();
    expect(result(bob!).correct).toBe(false);
    expect(errorCode(() => accept({ choiceIndex: 0 }))).toBe('INVALID_PAYLOAD');
    accept({ margin: 10 });
    expect(reveal()).toMatchObject({
      margin: 10,
      slider: { margin: 10 },
      accepted: { margin: 10 },
    });
    // 5 away with ± 10: 1000 × (1 − 0.5 × 5 / 10).
    expect(result(bob!)).toMatchObject({ correct: true, pointsEarned: 750, accepted: true });
    expect(result(alice!)).toMatchObject({ correct: true, pointsEarned: 1000 });
    expect(result(chloe!).correct).toBe(false);
    // Narrower than what is accepted: nothing to do.
    rec.sent.length = 0;
    accept({ margin: 5 });
    expect(rec.sent).toEqual([]);
  });

  it('streak and streak bonus follow the accepted answer', () => {
    create([mcq('Q1'), mcq('Q2')]);
    const [alice] = joinAll('Alice');
    game.start();
    toAnswering();
    answer(alice!, RIGHT);
    nextQuestion();
    answer(alice!, REAL);
    toReveal();
    expect(result(alice!)).toMatchObject({ streak: 0, streakBonus: 0 });
    accept({ choiceIndex: 1 });
    expect(result(alice!)).toMatchObject({
      streak: 2,
      streakBonus: 100,
      pointsEarned: 1100,
      totalScore: 2100,
    });
  });

  describe('jokers', () => {
    const hand = (p: Player, jokers: JokerType[]) => game.jokers!.setHand(p.id, jokers);

    it('Double ou rien: the −500 becomes ×2', () => {
      create([mcq('Q1'), mcq('Q2')], { jokers: true });
      const [alice] = joinAll('Alice');
      game.start();
      toAnswering();
      answer(alice!, RIGHT);
      nextQuestion();
      hand(alice!, ['double']);
      game.useJoker(alice!.id, game.questionIndex, 'double');
      answer(alice!, REAL);
      toReveal();
      expect(result(alice!)).toMatchObject({ pointsEarned: -500, totalScore: 500 });
      accept({ choiceIndex: 1 });
      expect(result(alice!)).toMatchObject({
        pointsEarned: 2200,
        totalScore: 3200,
        jokers: [{ kind: 'double', points: 1100 }],
      });
    });

    it('Voleur: a thief made right steals; the victim loses the stolen points', () => {
      // Random 0.99: the wheel lands on the last player (Bob), again after the accept.
      create([mcq('Q1'), mcq('Q2'), mcq('Q3')], { jokers: true, random: () => 0.99 });
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      toAnswering();
      answer(bob!, RIGHT);
      nextQuestion();
      hand(alice!, ['thief']);
      game.useJoker(alice!.id, game.questionIndex, 'thief');
      answer(alice!, REAL);
      answer(bob!, RIGHT);
      toReveal();
      // T51: the wheel steals even on a wrong answer — Bob: 1000 + 1100 = 2100, 10 % = 210.
      expect(result(alice!).pointsEarned).toBe(210);
      expect(reveal().wheels).toEqual([
        expect.objectContaining({
          drawn: expect.objectContaining({ nickname: 'Bob' }),
          points: 210,
        }),
      ]);
      accept({ choiceIndex: 1 });
      // Same draw after the accept: Bob again, 210 stolen.
      expect(result(alice!)).toMatchObject({ pointsEarned: 1210, totalScore: 1210 });
      expect(result(bob!)).toMatchObject({ pointsEarned: 890, totalScore: 1890 });
      game.next();
      const board = rec.last('leaderboard', 'host') as StandingsPayload;
      expect(board.top.map((p) => [p.nickname, p.gained])).toEqual([
        ['Bob', 890],
        ['Alice', 1210],
      ]);
    });

    it('Bouclier: no « shieldSaved » once the answer is accepted', () => {
      create([mcq()], { jokers: true });
      const [alice] = joinAll('Alice');
      game.start();
      hand(alice!, ['shield']);
      game.useJoker(alice!.id, 0, 'shield');
      toAnswering();
      answer(alice!, REAL);
      toReveal();
      expect(result(alice!).jokers).toEqual([{ kind: 'shieldSaved' }]);
      accept({ choiceIndex: 1 });
      expect(result(alice!)).toMatchObject({ correct: true, pointsEarned: 1000 });
      expect(result(alice!)).not.toHaveProperty('jokers');
    });

    it('Sablier played after answering: the accepted answer counts half its time', () => {
      create([mcq()], { jokers: true });
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      hand(alice!, ['hourglass']);
      toAnswering();
      vi.advanceTimersByTime(10_000);
      answer(alice!, REAL);
      game.useJoker(alice!.id, 0, 'hourglass');
      answer(bob!, RIGHT);
      toReveal();
      accept({ choiceIndex: 1 });
      expect(result(alice!)).toMatchObject({
        pointsEarned: at(5000),
        jokers: [{ kind: 'hourglass', points: at(5000) - at(10_000) }],
      });
    });

    it('jokers earned for a streak are drawn again the same way', () => {
      // Fixed draws: the earned joker depends only on the order of the draws.
      let seed = 7;
      const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
      create([mcq('Q1'), mcq('Q2'), mcq('Q3')], { jokers: true, random });
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      for (const p of [alice!, bob!]) hand(p, []);
      toAnswering();
      answer(alice!, RIGHT);
      answer(bob!, RIGHT);
      nextQuestion();
      answer(alice!, RIGHT);
      answer(bob!, RIGHT);
      nextQuestion();
      answer(alice!, RIGHT);
      answer(bob!, REAL);
      toReveal();
      const earned = result(alice!).jokers;
      expect(earned).toEqual([{ kind: 'earned', joker: expect.any(String) }]);
      accept({ choiceIndex: 1 });
      expect(result(alice!).jokers).toEqual(earned);
      expect(result(bob!).jokers).toEqual([{ kind: 'earned', joker: expect.any(String) }]);
      expect(game.jokers!.leaderboardInfo(alice!.id)?.hand).toHaveLength(1);
      expect(game.jokers!.leaderboardInfo(bob!.id)?.hand).toHaveLength(1);
    });
  });

  it('team mode: the team averages are computed again', () => {
    create([mcq(), mcq('Q2')], { mode: 'teams', teamCount: 2 });
    const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
    game.setTeam(alice!.id, 0);
    game.setTeam(bob!.id, 0);
    game.setTeam(chloe!.id, 1);
    game.start();
    toAnswering();
    answer(alice!, RIGHT);
    answer(bob!, REAL);
    answer(chloe!, RIGHT);
    toReveal();
    expect(result(bob!).team).toMatchObject({ score: 500, rank: 2 });
    accept({ choiceIndex: 1 });
    expect(result(bob!).team).toMatchObject({ score: 1000, rank: 1 });
    game.next();
    const board = rec.last('leaderboard', 'host') as StandingsPayload;
    expect(board.teams?.map((t) => [t.name, t.score, t.gained])).toEqual([
      ['Équipe Rouge', 1000, 1000],
      ['Équipe Bleue', 1000, 1000],
    ]);
  });

  it('« Survie »: the heart comes back and the elimination is undone', () => {
    create([mcq('Q1'), mcq('Q2')], { mode: 'survival', hearts: 1 });
    const [alice, bob] = joinAll('Alice', 'Bob');
    game.start();
    toAnswering();
    answer(alice!, RIGHT);
    answer(bob!, REAL);
    toReveal();
    expect(result(bob!).survival).toMatchObject({ hearts: 0, eliminated: true });
    expect((rec.last('survival:state', 'all') as SurvivalStatePayload).finished).toBe(true);
    accept({ choiceIndex: 1 });
    expect(result(bob!).survival).toEqual({ hearts: 1, lostHeart: false });
    const state = rec.last('survival:state', 'all') as SurvivalStatePayload;
    expect(state.finished).toBeUndefined();
    expect(state.players.find((p) => p.nickname === 'Bob')).toMatchObject({ hearts: 1 });
    // Not over any more: « Suivant » goes on to question 2, not to the podium.
    game.next();
    game.next();
    expect(game.phase).toBe('QUESTION_INTRO');
  });

  it('both resyncs carry the new reveal and results', () => {
    create([mcq()]);
    const [alice] = joinAll('Alice');
    game.start();
    toAnswering();
    answer(alice!, REAL);
    toReveal();
    accept({ choiceIndex: 1 });
    rec.sent.length = 0;
    game.resyncHost('host-2');
    expect(rec.last('question:reveal', 'host-2')).toMatchObject({
      correctIndexes: [0, 1],
      accepted: { choiceIndexes: [1] },
    });
    game.disconnect('sock-Alice');
    game.rejoin(alice!.sessionToken, 'sock-2');
    game.resync(alice!);
    expect(rec.last('player:result', 'sock-2')).toMatchObject({ correct: true, accepted: true });
  });
});
