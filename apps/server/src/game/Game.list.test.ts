import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  QuestionSchema,
  answerText,
  listCorrect,
  listPoints,
  type GameStatePayload,
  type ListQuestion,
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
import { CLASSIC_QUIZ, introOf } from './testing.js';

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

const DWARFS = [
  'Prof | Professeur',
  'Grincheux',
  'Joyeux',
  'Timide',
  'Atchoum',
  'Dormeur',
  'Simplet',
];

const list = (items = DWARFS, basePoints: 0 | 1000 | 2000 = 1000): ListQuestion => ({
  text: 'Citez les 7 nains',
  type: 'LIST',
  items,
  typoTolerance: true,
  timeLimitSec: 60,
  basePoints,
});

const mcq = CLASSIC_QUIZ.questions[0]!;
const quizOf = (...questions: Question[]): Quiz => ({ id: 'list', title: 'Liste', questions });

describe('« Liste chrono » (LIST)', () => {
  let rec: ReturnType<typeof recorder>;
  let game: Game;

  const create = (quiz: Quiz = quizOf(list()), settings: Partial<GameSettings> = {}) => {
    game?.dispose();
    rec = recorder();
    game = new Game(
      '123456',
      quiz,
      rec.transport,
      {},
      { mode: 'solo', allAnsweredGraceMs: 0, ...settings },
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
  const prompt = (p: Player) => rec.last('question:prompt', p.socketId!) as QuestionPromptPayload;
  const show = () => rec.last('question:show', 'host') as QuestionShowPayload;
  const result = (p: Player) => rec.last('player:result', p.socketId!) as PlayerResultPayload;
  const reveal = () => rec.last('question:reveal', 'host') as QuestionRevealPayload;
  const state = () => rec.last('game:state', 'all') as GameStatePayload;
  const guess = (p: Player, text: string) => game.answer(p.id, game.questionIndex, { text }).list!;
  const start = (...names: string[]) => {
    const players = joinAll(...names);
    game.start();
    vi.advanceTimersByTime(introOf(game));
    expect(game.phase).toBe('ANSWERING');
    return players;
  };
  const timeUp = () => vi.advanceTimersByTime(60_000);

  it('schema: items with spellings, different, 2–30', () => {
    expect(QuestionSchema.safeParse(list()).success).toBe(true);
    expect(QuestionSchema.safeParse({ ...list(), items: ['Seul'] }).success).toBe(false);
    expect(QuestionSchema.safeParse({ ...list(), items: ['Prof', 'prof | Doc'] }).success).toBe(
      false,
    );
    expect(QuestionSchema.safeParse({ ...list(), items: ['A', ' | '] }).success).toBe(false);
    const parsed = QuestionSchema.parse({ text: 'x', type: 'LIST', items: ['a', 'b'] });
    expect(parsed).toMatchObject({ timeLimitSec: 60, typoTolerance: true });
    expect(answerText(list())[0]).toBe('Prof');
  });

  it('points and « right » rule', () => {
    expect(listPoints(1000, 7, 7)).toBe(1000);
    expect(listPoints(1000, 3, 7)).toBe(429);
    expect(listPoints(0, 3, 7)).toBe(0);
    expect(listCorrect(3, 7)).toBe(false);
    expect(listCorrect(4, 7)).toBe(true);
    expect(listCorrect(1, 2)).toBe(true);
  });

  it('never sends the items before the reveal', () => {
    const [alice] = start('Alice');
    expect(prompt(alice!)).toEqual({
      index: 0,
      type: 'LIST',
      timeLimitSec: 60,
      list: { total: 7, maxLength: 40, found: [] },
    });
    expect(show().list).toEqual({ total: 7 });
    const everything = JSON.stringify(rec.sent.filter((s) => s.event !== 'remote:answer'));
    expect(everything).not.toContain('Grincheux');
    expect(everything).not.toContain('Professeur');
  });

  it('guesses: found (spellings, typos, case, accents), already, wrong', () => {
    const [alice] = start('Alice');
    expect(guess(alice!, 'professeur')).toEqual({
      result: 'found',
      item: { index: 0, text: 'Prof' },
      found: 1,
    });
    expect(guess(alice!, 'Prof')).toEqual({
      result: 'already',
      item: { index: 0, text: 'Prof' },
      found: 1,
    });
    expect(guess(alice!, 'Grincheu')).toMatchObject({ result: 'found', found: 2 });
    expect(guess(alice!, 'TIMIDE ')).toMatchObject({ result: 'found', found: 3 });
    expect(guess(alice!, 'Blanche-Neige')).toEqual({ result: 'wrong', found: 3 });
    expectGameError(() => game.answer(alice!.id, 0, { choiceIndex: 0 }), 'INVALID_PAYLOAD');
  });

  it('no typo tolerance when switched off', () => {
    create(quizOf({ ...list(), typoTolerance: false }));
    const [alice] = start('Alice');
    expect(guess(alice!, 'Grincheu').result).toBe('wrong');
    expect(guess(alice!, 'grincheux').result).toBe('found');
  });

  it('the TV sees counts per item and per player, never the texts', () => {
    const [alice, bob] = start('Alice', 'Bob');
    guess(alice!, 'Joyeux');
    guess(alice!, 'Simplet');
    guess(bob!, 'Joyeux');
    expect(state().list).toEqual({
      items: [0, 0, 2, 0, 0, 0, 1],
      players: [
        expect.objectContaining({ nickname: 'Alice', found: 2 }),
        expect.objectContaining({ nickname: 'Bob', found: 1 }),
      ],
    });
  });

  it('partial lists are scored at the reveal: share of the items, right from half on', () => {
    const [alice, bob, chloe] = start('Alice', 'Bob', 'Chloé');
    for (const name of ['Prof', 'Joyeux', 'Timide', 'Atchoum']) guess(alice!, name);
    for (const name of ['Prof', 'Joyeux']) guess(bob!, name);
    timeUp();
    expect(game.phase).toBe('REVEAL');
    expect(result(alice!)).toMatchObject({
      correct: true,
      pointsEarned: 571,
      streak: 1,
      list: { found: 4, total: 7, missed: ['Grincheux', 'Dormeur', 'Simplet'] },
    });
    expect(result(bob!)).toMatchObject({ correct: false, pointsEarned: 286, streak: 0 });
    expect(result(chloe!)).toMatchObject({ correct: false, pointsEarned: 0 });
    expect(reveal().list).toMatchObject({
      players: [
        expect.objectContaining({ nickname: 'Alice', found: 4 }),
        expect.objectContaining({ nickname: 'Bob', found: 2 }),
        expect.objectContaining({ nickname: 'Chloé', found: 0 }),
      ],
    });
    expect(reveal().list!.items[0]).toMatchObject({
      text: 'Prof',
      finders: [
        expect.objectContaining({ nickname: 'Alice' }),
        expect.objectContaining({ nickname: 'Bob' }),
      ],
    });
    expect(reveal().list!.items[1]).toEqual({ text: 'Grincheux', finders: [] });
  });

  it('ends when everyone found everything', () => {
    create(quizOf(list(['Rouge', 'Vert'])));
    const [alice, bob] = start('Alice', 'Bob');
    guess(alice!, 'rouge');
    guess(alice!, 'vert');
    expect(game.phase).toBe('ANSWERING');
    expect(rec.last('answer:count', 'host')).toEqual({ answered: 1, total: 2 });
    guess(bob!, 'vert');
    guess(bob!, 'rouge');
    expect(game.phase).toBe('REVEAL');
    expect(result(bob!)).toMatchObject({ correct: true, pointsEarned: 1000 });
    expectGameError(() => guess(alice!, 'bleu'), 'NOT_ANSWERING');
  });

  it('answers can’t be cancelled; jokers can’t be played', () => {
    create(quizOf(list()), { jokers: true });
    const [alice] = start('Alice');
    guess(alice!, 'Joyeux');
    expectGameError(() => game.unanswer(alice!.id, 0), 'CANCEL_REFUSED');
    expectGameError(() => game.useJoker(alice!.id, 0, 'double'), 'JOKER_REFUSED');
  });

  it('a phone that reloads gets back what it found', () => {
    const [alice] = start('Alice');
    guess(alice!, 'Dormeur');
    game.disconnect('sock-Alice');
    game.resync(game.rejoin(alice!.sessionToken, 'sock-Alice-2'));
    expect(prompt(alice!).list).toEqual({
      total: 7,
      maxLength: 40,
      found: [{ index: 5, text: 'Dormeur' }],
    });
  });

  it('« Survie »: fewer than half the items costs a heart', () => {
    create(quizOf(list(), mcq), { mode: 'survival', hearts: 2 });
    const [alice, bob] = start('Alice', 'Bob');
    for (const name of ['Prof', 'Joyeux', 'Timide', 'Atchoum']) guess(alice!, name);
    guess(bob!, 'Prof');
    timeUp();
    expect(result(alice!).survival).toMatchObject({ hearts: 2, lostHeart: false });
    expect(result(bob!).survival).toMatchObject({ hearts: 1, lostHeart: true });
    const survival = rec.last('survival:state', 'all') as SurvivalStatePayload;
    expect(survival.players.map((p) => p.hearts)).toEqual([2, 1]);
  });

  it('team mode: average of the members’ points', () => {
    create(quizOf(list(['Rouge', 'Vert']), mcq), { mode: 'teams', teamCount: 2 });
    const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
    game.setTeam(alice!.id, 0);
    game.setTeam(bob!.id, 0);
    game.setTeam(chloe!.id, 1);
    game.start();
    vi.advanceTimersByTime(introOf(game));
    guess(alice!, 'rouge');
    guess(alice!, 'vert');
    guess(bob!, 'vert');
    guess(chloe!, 'rouge');
    timeUp();
    expect(result(alice!).team).toMatchObject({ id: 0, score: 750 });
    expect(result(chloe!).team).toMatchObject({ id: 1, score: 500 });
  });
});
