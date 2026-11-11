import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COLOR_SHAPES,
  PAUSE_GRACE_MS,
  QuestionSchema,
  RESUME_COUNTDOWN_MS,
  answerText,
  colorGrid,
  colorsPoints,
  colorsRight,
  generatedBoard,
  type ColorsQuestion,
  type GameStatePayload,
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

const IMAGE = 'https://example.com/uploads/tableau.png';
/** Colors of the picture zones: violet, bleu, rouge, vert. */
const RIGHT = [5, 4, 0, 3];

const picture = (basePoints: 0 | 1000 | 2000 = 1000): ColorsQuestion => ({
  text: 'Retrouve les couleurs du tableau',
  type: 'COLORS',
  imageUrl: IMAGE,
  timeLimitSec: 30,
  memoSec: 20,
  basePoints,
  cells: 6,
  zones: [
    { x: 0.2, y: 0.3, radius: 0.08, color: 5 },
    { x: 0.5, y: 0.5, radius: 0.08, color: 4 },
    { x: 0.8, y: 0.3, radius: 0.08, color: 0 },
    { x: 0.5, y: 0.8, radius: 0.08, color: 3 },
  ],
});

const generated = (cells = 6): ColorsQuestion => ({
  text: 'Quelles couleurs avaient les formes ?',
  type: 'COLORS',
  timeLimitSec: 30,
  memoSec: 20,
  basePoints: 1000,
  cells,
  zones: [],
});

const mcq = CLASSIC_QUIZ.questions[0]!;
const quizOf = (...questions: Question[]): Quiz => ({ id: 'colors', title: 'Couleurs', questions });

describe('« Couleurs perdues » (COLORS)', () => {
  let rec: ReturnType<typeof recorder>;
  let game: Game;

  const create = (quiz: Quiz = quizOf(picture()), settings: Partial<GameSettings> = {}) => {
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
  const answer = (p: Player, colors: number[]) => game.answer(p.id, game.questionIndex, { colors });
  /** Players' messages (everything but the host room and the remote's answer). */
  const phoneFrames = () =>
    JSON.stringify(rec.sent.filter((s) => s.to !== 'host' && s.event !== 'remote:answer'));
  const start = (...names: string[]) => {
    const players = joinAll(...names);
    game.start();
    vi.advanceTimersByTime(introOf(game));
    expect(game.phase).toBe('ANSWERING');
    return players;
  };
  const memorize = () => vi.advanceTimersByTime(20_000);

  it('schema: generated board (4–12 cells) or picture + 2–12 zones', () => {
    expect(QuestionSchema.safeParse(picture()).success).toBe(true);
    expect(QuestionSchema.safeParse(generated()).success).toBe(true);
    const parsed = QuestionSchema.parse({ text: 'x', type: 'COLORS' });
    expect(parsed).toMatchObject({ timeLimitSec: 30, memoSec: 20, cells: 6, zones: [] });
    expect(QuestionSchema.safeParse(generated(3)).success).toBe(false);
    expect(QuestionSchema.safeParse(generated(13)).success).toBe(false);
    expect(QuestionSchema.safeParse({ ...generated(), memoSec: 4 }).success).toBe(false);
    // Zones need a picture, a picture needs zones, at least two of them.
    expect(QuestionSchema.safeParse({ ...picture(), imageUrl: undefined }).success).toBe(false);
    expect(QuestionSchema.safeParse({ ...generated(), imageUrl: IMAGE }).success).toBe(false);
    expect(
      QuestionSchema.safeParse({ ...picture(), zones: picture().zones.slice(0, 1) }).success,
    ).toBe(false);
    expect(
      QuestionSchema.safeParse({ ...picture(), zones: [{ x: 0.5, y: 0.5, radius: 0.1, color: 8 }] })
        .success,
    ).toBe(false);
    expect(QuestionSchema.safeParse({ ...picture(), imageEffect: 'blur' }).success).toBe(false);
    expect(answerText(picture())).toEqual(['1. Violet', '2. Bleu', '3. Rouge', '4. Vert']);
    expect(answerText(generated(), undefined, [0, 7])).toEqual(['1. Rouge', '2. Noir']);
  });

  it('helpers: grid, board, points', () => {
    expect(colorGrid(4)).toEqual({ cols: 2, rows: 2 });
    expect(colorGrid(5)).toEqual({ cols: 3, rows: 2 });
    expect(colorGrid(9)).toEqual({ cols: 3, rows: 3 });
    expect(colorGrid(12)).toEqual({ cols: 4, rows: 3 });
    const board = generatedBoard(COLOR_SHAPES.slice(0, 5));
    expect(board.spots).toHaveLength(5);
    // Last row (2 of 3) centred.
    expect(board.spots[3]!.x).toBeCloseTo(1 / 3);
    expect(board.spots[4]!.x).toBeCloseTo(2 / 3);
    expect(colorsRight([5, 4, -1, 2], RIGHT)).toBe(2);
    expect(colorsPoints(800, 2, 4)).toBe(400);
  });

  it('stage 1: the TV gets the colors, the phones nothing of the board', () => {
    const [alice] = start('Alice', 'Bob');
    expect(prompt(alice!)).toEqual({
      index: 0,
      type: 'COLORS',
      timeLimitSec: 20,
      colors: { stage: 'memo' },
    });
    expect(show()).toMatchObject({
      timeLimitSec: 20,
      colors: {
        stage: 'memo',
        board: { imageUrl: IMAGE, spots: [{ x: 0.2, y: 0.3, radius: 0.08 }, {}, {}, {}] },
        colors: RIGHT,
      },
    });
    expect(state().remainingMs).toBe(20_000);
    // Can't answer while memorizing.
    expectGameError(() => answer(alice!, RIGHT), 'NOT_ANSWERING');
    expect(phoneFrames()).not.toContain('"spots"');
    expect(phoneFrames()).not.toContain('tableau.png');
  });

  it('stage 2: grey board for everyone, a new timer, never the colors before the reveal', () => {
    const [alice] = start('Alice', 'Bob');
    memorize();
    expect(game.phase).toBe('ANSWERING');
    expect(state().remainingMs).toBe(30_000);
    const p = prompt(alice!);
    expect(p.timeLimitSec).toBe(30);
    expect(p.colors).toEqual({
      stage: 'answer',
      board: {
        imageUrl: IMAGE,
        spots: picture().zones.map(({ x, y, radius }) => ({ x, y, radius })),
      },
    });
    expect(show()).toMatchObject({ timeLimitSec: 30, colors: { stage: 'answer' } });
    expect(show().colors!.colors).toBeUndefined();
    expect(phoneFrames()).not.toContain('"color"');
    expect(phoneFrames()).not.toContain('"colors":[5');
    vi.advanceTimersByTime(30_000);
    expect(game.phase).toBe('REVEAL');
  });

  it('scoring: time points from stage 2 × share right; right = every zone', () => {
    const [alice, bob, chloe, dan] = start('Alice', 'Bob', 'Chloé', 'Dan');
    memorize();
    answer(alice!, RIGHT); // at once: full points
    vi.advanceTimersByTime(15_000);
    answer(bob!, [5, 4, 1, -1]); // half the time, half the zones: 750 × 2 / 4
    answer(chloe!, [0, 0, 0, 0]); // 1 / 4
    vi.advanceTimersByTime(15_000);
    expect(game.phase).toBe('REVEAL');
    expect(result(alice!)).toMatchObject({
      correct: true,
      pointsEarned: 1000,
      streak: 1,
      colors: { right: 4, total: 4, colors: RIGHT, yours: RIGHT },
    });
    expect(result(bob!)).toMatchObject({ correct: false, pointsEarned: 375, streak: 0 });
    expect(result(chloe!)).toMatchObject({ correct: false, pointsEarned: 188 });
    expect(result(dan!)).toMatchObject({
      correct: false,
      pointsEarned: 0,
      colors: { right: 0, total: 4 },
    });
    expect(result(dan!).colors!.yours).toBeUndefined();
    const r = reveal().colors!;
    expect(r.colors).toEqual(RIGHT);
    expect(r.zones).toEqual([2, 2, 2, 1]);
    expect(r.answers.map((a) => [a.nickname, a.right, a.points])).toEqual([
      ['Alice', 4, 1000],
      ['Bob', 2, 375],
      ['Chloé', 1, 188],
      ['Dan', 0, 0],
    ]);
    expect(r.answers[3]!.colors).toBeNull();
  });

  it('wrong answer kinds are refused', () => {
    const [alice] = start('Alice');
    memorize();
    expectGameError(() => answer(alice!, [5, 4, 0]), 'INVALID_PAYLOAD');
    expectGameError(() => game.answer(alice!.id, 0, { choiceIndex: 0 }), 'INVALID_PAYLOAD');
  });

  it('generated board: random shapes and colors from the game’s random source', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    create(quizOf(generated(12)), { random });
    const [alice] = start('Alice');
    const board = show().colors!.board;
    const colors = show().colors!.colors!;
    expect(board).toMatchObject({ cols: 4, rows: 3 });
    expect(board.spots).toHaveLength(12);
    expect(board.spots.every((s) => s.shape && COLOR_SHAPES.includes(s.shape))).toBe(true);
    // Every shape at least once before any twice.
    expect(new Set(board.spots.slice(0, 8).map((s) => s.shape)).size).toBe(8);
    expect(colors).toHaveLength(12);
    expect(new Set(colors).size).toBeGreaterThan(1);
    expect(prompt(alice!).colors).toEqual({ stage: 'memo' });
    memorize();
    expect(prompt(alice!).colors).toEqual({ stage: 'answer', board });
    answer(alice!, colors);
    expect(game.phase).toBe('REVEAL');
    expect(result(alice!)).toMatchObject({ correct: true, pointsEarned: 1000 });
    expect(reveal().colors!.board).toEqual(board);
  });

  it('answers can be cancelled and given again (scored from the new time)', () => {
    create(quizOf(picture()), { allAnsweredGraceMs: 2000 });
    const [alice] = start('Alice');
    memorize();
    answer(alice!, [0, 0, 0, 0]);
    game.unanswer(alice!.id, 0);
    vi.advanceTimersByTime(15_000);
    answer(alice!, RIGHT);
    vi.advanceTimersByTime(2000);
    expect(game.phase).toBe('REVEAL');
    expect(result(alice!)).toMatchObject({ correct: true, pointsEarned: 750 });
  });

  it('a phone that reloads gets the stage it is in', () => {
    const [alice] = start('Alice', 'Bob');
    game.disconnect('sock-Alice');
    game.resync(game.rejoin(alice!.sessionToken, 'sock-Alice-2'));
    expect(prompt(alice!)).toMatchObject({ timeLimitSec: 20, colors: { stage: 'memo' } });
    memorize();
    game.disconnect('sock-Alice-2');
    game.resync(game.rejoin(alice!.sessionToken, 'sock-Alice-3'));
    expect(prompt(alice!)).toMatchObject({ timeLimitSec: 30, colors: { stage: 'answer' } });
    // The TV reloads too: the grey board.
    game.resyncHost('host-2');
    expect(rec.last('question:show', 'host-2')).toMatchObject({ colors: { stage: 'answer' } });
  });

  it('a pause while memorizing freezes the memo time', () => {
    const [, bob] = start('Alice', 'Bob');
    vi.advanceTimersByTime(5000);
    game.disconnect('sock-Bob');
    vi.advanceTimersByTime(PAUSE_GRACE_MS + 100);
    expect(game.paused).toBe(true);
    expect(state().remainingMs).toBe(15_000);
    vi.advanceTimersByTime(60_000);
    expect(show().colors!.stage).toBe('memo');
    game.resync(game.rejoin(bob!.sessionToken, 'sock-Bob-2'));
    vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
    expect(game.paused).toBe(false);
    vi.advanceTimersByTime(14_000);
    expect(show().colors!.stage).toBe('memo');
    vi.advanceTimersByTime(1500);
    expect(show().colors!.stage).toBe('answer');
  });

  it('« Passer » while memorizing starts the answers', () => {
    start('Alice');
    game.next();
    expect(game.phase).toBe('ANSWERING');
    expect(show().colors!.stage).toBe('answer');
    game.next();
    expect(game.phase).toBe('REVEAL');
  });

  it('team mode: average of the members’ points', () => {
    create(quizOf(picture(), mcq), { mode: 'teams', teamCount: 2 });
    const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
    game.setTeam(alice!.id, 0);
    game.setTeam(bob!.id, 0);
    game.setTeam(chloe!.id, 1);
    game.start();
    vi.advanceTimersByTime(introOf(game));
    memorize();
    answer(alice!, RIGHT);
    answer(bob!, [5, 4, -1, -1]);
    answer(chloe!, [-1, -1, -1, -1]);
    expect(result(alice!).team).toMatchObject({ id: 0, score: 750 });
    expect(result(chloe!).team).toMatchObject({ id: 1, score: 0 });
  });

  it('« Survie »: a zone wrong costs a heart', () => {
    create(quizOf(picture(), mcq), { mode: 'survival', hearts: 2 });
    const [alice, bob] = start('Alice', 'Bob');
    memorize();
    answer(alice!, RIGHT);
    answer(bob!, [5, 4, 0, 2]);
    expect(result(alice!).survival).toMatchObject({ hearts: 2, lostHeart: false });
    expect(result(bob!).survival).toMatchObject({ hearts: 1, lostHeart: true });
    const survival = rec.last('survival:state', 'all') as SurvivalStatePayload;
    expect(survival.players.map((p) => p.hearts)).toEqual([2, 1]);
  });

  describe('jokers', () => {
    const jokerState = (p: Player) =>
      rec.last('joker:state', p.socketId!) as PlayerJokersPayload | undefined;

    it('50/50: half of the zones already colored right, on that phone only', () => {
      create(quizOf(picture()), { jokers: true, jokerHand: ['fifty', 'copy', 'scramble'] });
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      game.useJoker(alice!.id, 0, 'fifty');
      const hints = jokerState(alice!)!.effects.colorHints!;
      expect(hints).toHaveLength(2);
      for (const h of hints) expect(h.color).toBe(RIGHT[h.zone]);
      expect(jokerState(bob!)!.effects.colorHints).toBeUndefined();
      // No Copieur, no Brouilleur here.
      expectGameError(() => game.useJoker(bob!.id, 0, 'copy', alice!.id), 'JOKER_REFUSED');
      expectGameError(() => game.useJoker(bob!.id, 0, 'scramble', alice!.id), 'JOKER_REFUSED');
    });

    it('Gel played while memorizing blocks the first 5 s of the answers', () => {
      create(quizOf(picture()), { jokers: true, jokerHand: ['freeze', 'double', 'hourglass'] });
      const [alice, bob] = start('Alice', 'Bob');
      vi.advanceTimersByTime(10_000);
      game.useJoker(alice!.id, 0, 'freeze', bob!.id);
      vi.advanceTimersByTime(10_000);
      expect(show().colors!.stage).toBe('answer');
      expectGameError(() => answer(bob!, RIGHT), 'FROZEN');
      vi.advanceTimersByTime(5000);
      answer(bob!, RIGHT);
    });

    it('Double ou rien and Sablier as usual', () => {
      create(quizOf(picture()), { jokers: true, jokerHand: ['double', 'hourglass', 'shield'] });
      const [alice, bob] = start('Alice', 'Bob', 'Chloé');
      game.useJoker(alice!.id, 0, 'double');
      memorize();
      vi.advanceTimersByTime(15_000);
      answer(alice!, RIGHT);
      answer(bob!, RIGHT);
      game.useJoker(bob!.id, 0, 'hourglass');
      vi.advanceTimersByTime(15_000);
      expect(result(alice!).pointsEarned).toBe(1500);
      expect(result(bob!).pointsEarned).toBe(875);
    });
  });
});
