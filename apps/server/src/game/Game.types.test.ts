import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  QUESTION_INTRO_MS,
  type AnswerInput,
  type PlayerResultPayload,
  type QuestionPromptPayload,
  type QuestionRevealPayload,
  type Quiz,
  type ServerToClientEvents,
  type StandingsPayload,
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

const base = { timeLimitSec: 20, basePoints: 1000 as const };
/** Every question type; time frozen in the tests, so a right answer earns its full 1000 points. */
const quiz: Quiz = {
  id: 'types',
  title: 'Types',
  questions: [
    {
      ...base,
      text: 'QCM',
      type: 'MCQ',
      choices: [
        { text: 'Oui', isCorrect: true },
        { text: 'Non', isCorrect: false },
      ],
    },
    {
      ...base,
      text: 'Sondage',
      type: 'POLL',
      choices: [{ text: 'Glace' }, { text: 'Tarte' }, { text: 'Crêpe' }],
    },
    {
      ...base,
      text: 'Plus grand océan ?',
      type: 'TYPE_ANSWER',
      acceptedAnswers: ['Pacifique', 'Océan Pacifique'],
      typoTolerance: true,
    },
    {
      ...base,
      text: 'Curseur',
      type: 'SLIDER',
      slider: { min: 0, max: 100, step: 1, correct: 50, margin: 10, unit: 'km' },
    },
    {
      ...base,
      text: 'Curseur exact',
      type: 'SLIDER',
      slider: { min: 0, max: 10, step: 1, correct: 4, margin: 0 },
    },
  ],
};
const Q = { MCQ: 0, POLL: 1, TYPED: 2, SLIDER: 3, EXACT: 4 } as const;

describe('Game with every question type', () => {
  let rec: ReturnType<typeof recorder>;
  let game: Game;

  beforeEach(() => {
    vi.useFakeTimers(); // Date.now() frozen: every answer is instant
    rec = recorder();
  });

  afterEach(() => {
    game?.dispose();
    vi.useRealTimers();
  });

  const create = (settings?: GameSettings) => {
    game = new Game('123456', quiz, rec.transport, {}, settings);
    return game;
  };
  const join = (...names: string[]) => names.map((n) => game.join(n, `sock-${n}`));
  /** From the lobby or a leaderboard to ANSWERING of question `index`. */
  const goTo = (index: number) => {
    if (game.phase === 'LOBBY') game.start();
    while (game.questionIndex < index || game.phase !== 'QUESTION_INTRO') game.next();
    vi.advanceTimersByTime(QUESTION_INTRO_MS);
    expect(game.phase).toBe('ANSWERING');
  };
  const answer = (p: Player, a: AnswerInput | number) => game.answer(p.id, game.questionIndex, a);
  const result = (p: Player) => rec.last('player:result', p.socketId!) as PlayerResultPayload;
  const reveal = () => rec.last('question:reveal', 'host') as QuestionRevealPayload;

  it('never sends the answer in prompts (phones) nor in question:show (host)', () => {
    create();
    join('Alice');
    for (let i = 0; i < quiz.questions.length; i++) {
      goTo(i);
      const prompt = rec.last('question:prompt', 'sock-Alice') as QuestionPromptPayload;
      const show = rec.last('question:show', 'host');
      for (const json of [JSON.stringify(prompt), JSON.stringify(show)]) {
        expect(json).not.toMatch(/correct|margin|accepted|Pacifique|isCorrect/i);
      }
      expect(prompt.type).toBe(quiz.questions[i]!.type);
      game.next(); // → REVEAL (timer skipped)
    }
    const prompts = rec.sent
      .filter((s) => s.event === 'question:prompt')
      .map((s) => s.payload as QuestionPromptPayload);
    expect(prompts.map(({ index: _i, timeLimitSec: _t, ...rest }) => rest)).toEqual([
      { type: 'MCQ', choiceCount: 2 },
      { type: 'POLL', choiceCount: 3 },
      { type: 'TYPE_ANSWER', maxLength: 40 },
      { type: 'SLIDER', slider: { min: 0, max: 100, step: 1, unit: 'km' } },
      { type: 'SLIDER', slider: { min: 0, max: 10, step: 1 } },
    ]);
  });

  it('rejects an answer of the wrong kind (INVALID_PAYLOAD) and lets the player answer again', () => {
    create();
    const [alice] = join('Alice', 'Bob');
    goTo(Q.MCQ);
    expectGameError(() => answer(alice!, { text: 'Oui' }), 'INVALID_PAYLOAD');
    expectGameError(() => answer(alice!, { value: 0 }), 'INVALID_PAYLOAD');
    expectGameError(() => answer(alice!, 5), 'INVALID_PAYLOAD');
    game.next();
    game.next();
    goTo(Q.POLL);
    expectGameError(() => answer(alice!, 3), 'INVALID_PAYLOAD'); // 3 choices only
    game.next();
    game.next();
    goTo(Q.TYPED);
    expectGameError(() => answer(alice!, 0), 'INVALID_PAYLOAD');
    expectGameError(() => answer(alice!, { value: 1 }), 'INVALID_PAYLOAD');
    game.next();
    game.next();
    goTo(Q.SLIDER);
    expectGameError(() => answer(alice!, { text: '50' }), 'INVALID_PAYLOAD');
    expectGameError(() => answer(alice!, 1), 'INVALID_PAYLOAD');
    expectGameError(() => answer(alice!, { value: 101 }), 'INVALID_PAYLOAD');
    expect(alice!.answer).toBeNull();
    answer(alice!, { value: 50 });
    expect(alice!.answer).toMatchObject({ value: 50, correct: true });
  });

  it('poll: 0 points, no right answer, the streak neither breaks nor grows', () => {
    create();
    const [alice, bob, chloe] = join('Alice', 'Bob', 'Chloé');
    goTo(Q.MCQ);
    answer(alice!, 0); // right → streak 1
    answer(bob!, 0);
    answer(chloe!, 1); // wrong → streak 0
    game.next();
    game.next();
    goTo(Q.POLL);
    answer(alice!, 2);
    answer(bob!, 2);
    game.next(); // Chloé doesn't vote
    expect(reveal()).toEqual({ type: 'POLL', correctIndexes: [], distribution: [0, 0, 2] });
    expect(result(alice!)).toMatchObject({
      correct: false,
      poll: true,
      pointsEarned: 0,
      streak: 1,
      streakBonus: 0,
      totalScore: 1000,
    });
    expect(result(chloe!)).toMatchObject({ poll: true, streak: 0, pointsEarned: 0 });
    expect(game.questionStats[1]).toMatchObject({ correctCount: 0, answerCount: 2 });

    game.next();
    game.next();
    goTo(Q.TYPED);
    answer(alice!, { text: 'Pacifique' }); // 2nd right answer in a row: the poll didn't break it
    game.next();
    expect(result(alice!)).toMatchObject({ correct: true, streak: 2, streakBonus: 100 });
    expect(alice!.correctCount).toBe(2);
  });

  it('typed answer: tolerant matching, answers grouped after normalization at the reveal', () => {
    create();
    const [alice, bob, chloe, dan] = join('Alice', 'Bob', 'Chloé', 'Dan');
    goTo(Q.TYPED);
    answer(alice!, { text: '  Pacifique ' });
    answer(bob!, { text: 'le pacifique' });
    answer(chloe!, { text: 'Pacifiqe' }); // 1 typo, tolerated
    answer(dan!, { text: 'Atlantique' });
    expect(game.phase).toBe('REVEAL');
    expect(reveal()).toEqual({
      type: 'TYPE_ANSWER',
      correctIndexes: [],
      distribution: [],
      acceptedAnswers: ['Pacifique', 'Océan Pacifique'],
      topAnswers: [
        { text: 'Pacifique', count: 2, correct: true },
        { text: 'Pacifiqe', count: 1, correct: true },
        { text: 'Atlantique', count: 1, correct: false },
      ],
    });
    expect(result(chloe!)).toMatchObject({ correct: true, pointsEarned: 1000 });
    expect(result(dan!)).toMatchObject({ correct: false, pointsEarned: 0, streak: 0 });
  });

  it('keeps the 6 most typed answers', () => {
    create();
    const players = join(...'ABCDEFGH'.split('').map((c) => `P${c}`));
    goTo(Q.TYPED);
    players.forEach((p, i) => answer(p, { text: i < 2 ? 'Indien' : `Mer ${i}` }));
    expect(reveal().topAnswers).toHaveLength(6);
    expect(reveal().topAnswers![0]).toEqual({ text: 'Indien', count: 2, correct: false });
  });

  it('slider: points by distance inside the margin, closest player, values in the results', () => {
    create();
    const [alice, bob, chloe, dan] = join('Alice', 'Bob', 'Chloé', 'Dan');
    goTo(Q.SLIDER);
    answer(bob!, { value: 55 });
    answer(alice!, { value: 50 });
    answer(chloe!, { value: 40 }); // edge of the margin
    answer(dan!, { value: 61 }); // outside
    const slider = { min: 0, max: 100, step: 1, correct: 50, margin: 10, unit: 'km' };
    expect(reveal()).toEqual({
      type: 'SLIDER',
      correctIndexes: [],
      distribution: [],
      slider,
      correct: 50,
      margin: 10,
      guesses: [50, 55, 40, 61], // same response time: join order
      closest: { nickname: 'Alice', avatar: expect.any(String), value: 50 },
    });
    expect(result(alice!)).toMatchObject({
      correct: true,
      pointsEarned: 1000,
      yourValue: 50,
      correctValue: 50,
    });
    expect(result(bob!)).toMatchObject({ correct: true, pointsEarned: 750, yourValue: 55 });
    expect(result(chloe!)).toMatchObject({ correct: true, pointsEarned: 500 });
    expect(result(dan!)).toMatchObject({ correct: false, pointsEarned: 0, streak: 0 });
  });

  it('slider with margin 0: exact value only; no answer → no yourValue', () => {
    create();
    const [alice, bob, chloe] = join('Alice', 'Bob', 'Chloé');
    goTo(Q.EXACT);
    answer(alice!, { value: 4 });
    answer(bob!, { value: 5 });
    game.next(); // Chloé doesn't answer
    expect(result(alice!)).toMatchObject({ correct: true, pointsEarned: 1000 });
    expect(result(bob!)).toMatchObject({ correct: false, pointsEarned: 0 });
    expect(result(chloe!)).not.toHaveProperty('yourValue');
    expect(result(chloe!)).toMatchObject({ correctValue: 4 });
    expect(reveal().closest).toEqual({ nickname: 'Alice', avatar: expect.any(String), value: 4 });
  });

  it('re-sends the typed result (poll flag, slider values) on rejoin during REVEAL', () => {
    create();
    const [alice] = join('Alice');
    goTo(Q.SLIDER);
    answer(alice!, { value: 52 });
    game.disconnect('sock-Alice');
    game.resync(game.rejoin(alice!.sessionToken, 'sock-new'));
    expect(rec.last('player:result', 'sock-new')).toMatchObject({
      correct: true,
      yourValue: 52,
      correctValue: 50,
    });
  });

  describe('team mode', () => {
    const teamGame = () => {
      create({ mode: 'teams', teamCount: 2 });
      const [alice, bob, chloe] = join('Alice', 'Bob', 'Chloé');
      game.setTeam(alice!.id, 0);
      game.setTeam(bob!.id, 0);
      game.setTeam(chloe!.id, 1);
      return [alice!, bob!, chloe!] as const;
    };
    const teamScores = () =>
      Object.fromEntries(
        (rec.last('leaderboard', 'host') as StandingsPayload).teams!.map((t) => [t.id, t.score]),
      );

    it('a poll leaves the team scores unchanged', () => {
      const [alice, bob, chloe] = teamGame();
      goTo(Q.MCQ);
      answer(alice, 0);
      answer(bob, 1);
      answer(chloe, 0);
      game.next();
      expect(teamScores()).toEqual({ 0: 500, 1: 1000 });
      game.next();
      goTo(Q.POLL);
      [alice, bob, chloe].forEach((p) => answer(p, 0));
      expect(result(alice)).toMatchObject({ poll: true, team: { id: 0, score: 500, rank: 2 } });
      game.next();
      expect(teamScores()).toEqual({ 0: 500, 1: 1000 });
    });

    it('typed and slider questions are averaged per team like the others', () => {
      const [alice, bob, chloe] = teamGame();
      goTo(Q.TYPED);
      answer(alice, { text: 'pacifique' }); // 1000
      answer(bob, { text: 'Arctique' }); // 0
      answer(chloe, { text: 'Océan Pacifique' }); // 1000
      game.next();
      expect(teamScores()).toEqual({ 0: 500, 1: 1000 });
      game.next();
      goTo(Q.SLIDER);
      answer(alice, { value: 50 }); // 1000 + streak bonus 100
      answer(bob, { value: 60 }); // 500
      answer(chloe, { value: 45 }); // 750 + 100
      game.next();
      // Rouge: 500 + (1100 + 500) / 2 = 1300; Bleue: 1000 + 850 = 1850.
      expect(teamScores()).toEqual({ 0: 1300, 1: 1850 });
    });
  });
});
