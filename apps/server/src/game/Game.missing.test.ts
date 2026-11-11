import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PAUSE_GRACE_MS,
  QuestionSchema,
  RESUME_COUNTDOWN_MS,
  answerCancellable,
  answerText,
  jokerAvailability,
  type GameStatePayload,
  type MissingQuestion,
  type PlayerResultPayload,
  type Question,
  type QuestionPromptPayload,
  type QuestionRevealPayload,
  type QuestionShowPayload,
  type Quiz,
  type RemoteAnswerPayload,
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

const AVANT = 'https://example.com/uploads/salon-avant.png';
const APRES = 'https://example.com/uploads/salon-apres.png';
const ZONE = { x: 0.5, y: 0.3, radius: 0.1 };

const missing = (basePoints: 0 | 1000 | 2000 = 1000): MissingQuestion => ({
  text: 'Qu’est-ce qui a disparu du salon ?',
  type: 'MISSING',
  imageUrl: AVANT,
  missingImageUrl: APRES,
  zone: ZONE,
  memoSec: 20,
  timeLimitSec: 30,
  basePoints,
});

const mcq = CLASSIC_QUIZ.questions[0]!;
const quizOf = (...questions: Question[]): Quiz => ({ id: 'missing', title: 'Disparu', questions });

describe('« Qu’est-ce qui a disparu ? » (MISSING)', () => {
  let rec: ReturnType<typeof recorder>;
  let game: Game;

  const create = (quiz: Quiz = quizOf(missing(), mcq), settings: Partial<GameSettings> = {}) => {
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
  const tap = (p: Player, x: number, y: number) =>
    game.answer(p.id, game.questionIndex, { point: { x, y } });
  /** Players' messages (everything but the host room and the remote's answer). */
  const phoneFrames = () =>
    JSON.stringify(rec.sent.filter((s) => !s.to.startsWith('host') && s.event !== 'remote:answer'));
  const start = (...names: string[]) => {
    const players = joinAll(...names);
    game.start();
    vi.advanceTimersByTime(introOf(game));
    expect(game.phase).toBe('ANSWERING');
    return players;
  };
  const memorize = () => vi.advanceTimersByTime(20_000);

  it('schema: both pictures, a zone, memo 5–60 s, no image effect', () => {
    expect(QuestionSchema.safeParse(missing()).success).toBe(true);
    const parsed = QuestionSchema.parse({
      text: 'x',
      type: 'MISSING',
      imageUrl: AVANT,
      missingImageUrl: APRES,
      zone: ZONE,
    });
    expect(parsed).toMatchObject({ memoSec: 20, timeLimitSec: 20 });
    expect(QuestionSchema.safeParse({ ...missing(), imageUrl: undefined }).success).toBe(false);
    expect(QuestionSchema.safeParse({ ...missing(), missingImageUrl: undefined }).success).toBe(
      false,
    );
    expect(QuestionSchema.safeParse({ ...missing(), missingImageUrl: AVANT }).success).toBe(false);
    expect(QuestionSchema.safeParse({ ...missing(), zone: undefined }).success).toBe(false);
    expect(QuestionSchema.safeParse({ ...missing(), memoSec: 4 }).success).toBe(false);
    expect(QuestionSchema.safeParse({ ...missing(), memoSec: 61 }).success).toBe(false);
    expect(QuestionSchema.safeParse({ ...missing(), imageEffect: 'blur' }).success).toBe(false);
    expect(QuestionSchema.safeParse({ ...missing(), buzzer: true }).success).toBe(false);
    expect(answerText(missing())).toEqual(['Zone : à 50 % depuis la gauche, 30 % depuis le haut']);
    expect(answerCancellable('MISSING')).toBe(true);
    expect(jokerAvailability('MISSING')).toMatchObject({ jokers: true, unavailable: ['fifty'] });
  });

  it('stage 1: « avant » on the TV, nothing of the picture on the phones', () => {
    const [alice] = start('Alice', 'Bob');
    expect(prompt(alice!)).toEqual({
      index: 0,
      type: 'MISSING',
      timeLimitSec: 20,
      missing: { stage: 'memo' },
    });
    expect(show()).toMatchObject({ imageUrl: AVANT, timeLimitSec: 20, missing: { stage: 'memo' } });
    expect(JSON.stringify(show())).not.toContain('salon-apres');
    expect(state().remainingMs).toBe(20_000);
    // Can't answer while memorizing.
    expectGameError(() => tap(alice!, 0.5, 0.3), 'NOT_ANSWERING');
    expect(phoneFrames()).not.toContain('salon-');
    expect(phoneFrames()).not.toContain('"radius"');
  });

  it('stage 2: « après » for everyone, a new timer, never « avant » nor the zone on a phone', () => {
    const [alice] = start('Alice', 'Bob');
    memorize();
    expect(game.phase).toBe('ANSWERING');
    expect(state().remainingMs).toBe(30_000);
    expect(prompt(alice!)).toEqual({
      index: 0,
      type: 'MISSING',
      timeLimitSec: 30,
      missing: { stage: 'answer' },
      imageUrl: APRES,
    });
    expect(show()).toMatchObject({
      timeLimitSec: 30,
      missing: { stage: 'answer', missingImageUrl: APRES },
    });
    expect(phoneFrames()).not.toContain('salon-avant');
    expect(phoneFrames()).not.toContain('"radius"');
    expect(phoneFrames()).not.toContain('"zone"');
    vi.advanceTimersByTime(30_000);
    expect(game.phase).toBe('REVEAL');
  });

  it('scoring like PIN, time points from the start of stage 2; reveal with both pictures', () => {
    const [alice, bob, chloe, dan] = start('Alice', 'Bob', 'Chloé', 'Dan');
    memorize();
    tap(alice!, 0.55, 0.3); // inside, at once: full points
    vi.advanceTimersByTime(15_000);
    tap(bob!, 0.7, 0.3); // 0.1 beyond the edge, half time: 750 × 0.5 × 0.5
    tap(chloe!, 1, 1); // far
    vi.advanceTimersByTime(15_000);
    expect(game.phase).toBe('REVEAL');
    expect(result(alice!)).toMatchObject({ correct: true, pointsEarned: 1000, streak: 1 });
    expect(result(bob!)).toMatchObject({ correct: false, pointsEarned: 188, streak: 0 });
    expect(result(chloe!)).toMatchObject({ correct: false, pointsEarned: 0 });
    expect(result(dan!)).toMatchObject({ correct: false, pointsEarned: 0 });
    expect(reveal().missing).toEqual({
      imageUrl: AVANT,
      missingImageUrl: APRES,
      zone: ZONE,
      pins: [
        { x: 0.55, y: 0.3, nickname: 'Alice', avatar: alice!.avatar, correct: true },
        { x: 0.7, y: 0.3, nickname: 'Bob', avatar: bob!.avatar, correct: false },
        { x: 1, y: 1, nickname: 'Chloé', avatar: chloe!.avatar, correct: false },
      ],
    });
    expect(game.questionStats.at(-1)).toMatchObject({
      type: 'MISSING',
      correctCount: 1,
      answerCount: 3,
    });
  });

  it('wrong answer kinds are refused', () => {
    const [alice] = start('Alice');
    memorize();
    expectGameError(() => game.answer(alice!.id, 0, { choiceIndex: 0 }), 'INVALID_PAYLOAD');
    expectGameError(() => game.answer(alice!.id, 0, { text: 'la lampe' }), 'INVALID_PAYLOAD');
  });

  it('the remote gets « avant » and the zone', () => {
    start('Alice');
    game.remoteConnected('remote-1');
    game.resyncRemote('remote-1');
    expect(rec.last('remote:answer', 'remote-1') as RemoteAnswerPayload).toMatchObject({
      pin: { imageUrl: AVANT, zone: ZONE },
    });
  });

  it('answers can be cancelled and given again (scored from the new time)', () => {
    create(quizOf(missing()), { allAnsweredGraceMs: 2000 });
    const [alice] = start('Alice');
    memorize();
    tap(alice!, 1, 1);
    game.unanswer(alice!.id, 0);
    vi.advanceTimersByTime(15_000);
    tap(alice!, 0.5, 0.3);
    vi.advanceTimersByTime(2000);
    expect(game.phase).toBe('REVEAL');
    expect(result(alice!)).toMatchObject({ correct: true, pointsEarned: 750 });
  });

  it('a phone that reloads gets the stage it is in; the TV too', () => {
    const [alice] = start('Alice', 'Bob');
    game.disconnect('sock-Alice');
    game.resync(game.rejoin(alice!.sessionToken, 'sock-Alice-2'));
    expect(prompt(alice!)).toEqual({
      index: 0,
      type: 'MISSING',
      timeLimitSec: 20,
      missing: { stage: 'memo' },
    });
    game.resyncHost('host-2');
    expect(rec.last('question:show', 'host-2')).toMatchObject({ missing: { stage: 'memo' } });
    memorize();
    game.disconnect('sock-Alice-2');
    game.resync(game.rejoin(alice!.sessionToken, 'sock-Alice-3'));
    expect(prompt(alice!)).toMatchObject({ timeLimitSec: 30, imageUrl: APRES });
    game.resyncHost('host-3');
    expect(rec.last('question:show', 'host-3')).toMatchObject({
      missing: { stage: 'answer', missingImageUrl: APRES },
    });
    expect(phoneFrames()).not.toContain('salon-avant');
  });

  it('a pause while memorizing freezes the memo time', () => {
    const [, bob] = start('Alice', 'Bob');
    vi.advanceTimersByTime(5000);
    game.disconnect('sock-Bob');
    vi.advanceTimersByTime(PAUSE_GRACE_MS + 100);
    expect(game.paused).toBe(true);
    expect(state().remainingMs).toBe(15_000);
    vi.advanceTimersByTime(60_000);
    expect(show().missing!.stage).toBe('memo');
    game.resync(game.rejoin(bob!.sessionToken, 'sock-Bob-2'));
    vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
    expect(game.paused).toBe(false);
    vi.advanceTimersByTime(14_000);
    expect(show().missing!.stage).toBe('memo');
    vi.advanceTimersByTime(1500);
    expect(show().missing!.stage).toBe('answer');
  });

  it('« Passer » while memorizing starts the answers', () => {
    start('Alice');
    game.next();
    expect(game.phase).toBe('ANSWERING');
    expect(show().missing!.stage).toBe('answer');
    game.next();
    expect(game.phase).toBe('REVEAL');
  });

  it('team mode: average of the members’ points', () => {
    create(quizOf(missing(), mcq), { mode: 'teams', teamCount: 2 });
    const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
    game.setTeam(alice!.id, 0);
    game.setTeam(bob!.id, 0);
    game.setTeam(chloe!.id, 1);
    game.start();
    vi.advanceTimersByTime(introOf(game));
    memorize();
    tap(alice!, 0.5, 0.3);
    tap(bob!, 1, 1);
    tap(chloe!, 0.5, 0.35);
    expect(result(alice!).team).toMatchObject({ id: 0, score: 500 });
    expect(result(chloe!).team).toMatchObject({ id: 1, score: 1000 });
  });

  it('« Survie »: a tap outside the zone costs a heart', () => {
    create(quizOf(missing(), mcq), { mode: 'survival', hearts: 2 });
    const [alice, bob] = start('Alice', 'Bob');
    memorize();
    tap(alice!, 0.5, 0.3);
    tap(bob!, 0.65, 0.3); // near: partial points, still wrong
    expect(result(bob!).pointsEarned).toBeGreaterThan(0);
    expect(result(alice!).survival).toMatchObject({ hearts: 2, lostHeart: false });
    expect(result(bob!).survival).toMatchObject({ hearts: 1, lostHeart: true });
    const survival = rec.last('survival:state', 'all') as SurvivalStatePayload;
    expect(survival.players.map((p) => p.hearts)).toEqual([2, 1]);
  });

  describe('jokers (like PIN)', () => {
    it('no 50/50 nor Brouilleur; Copieur copies the pin', () => {
      create(quizOf(missing()), { jokers: true, jokerHand: ['fifty', 'copy', 'scramble'] });
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      expectGameError(() => game.useJoker(alice!.id, 0, 'fifty'), 'JOKER_REFUSED');
      expectGameError(() => game.useJoker(alice!.id, 0, 'scramble', bob!.id), 'JOKER_REFUSED');
      game.useJoker(bob!.id, 0, 'copy', alice!.id);
      vi.advanceTimersByTime(introOf(game));
      memorize();
      tap(alice!, 0.5, 0.3);
      expect(game.phase).toBe('REVEAL');
      expect(result(bob!)).toMatchObject({ correct: true });
      expect(reveal().missing!.pins.map((p) => p.nickname)).toEqual(['Alice', 'Bob']);
    });

    it('Gel played while memorizing blocks the first 5 s of the answers', () => {
      create(quizOf(missing()), { jokers: true, jokerHand: ['freeze', 'double', 'hourglass'] });
      const [alice, bob] = start('Alice', 'Bob');
      vi.advanceTimersByTime(10_000);
      game.useJoker(alice!.id, 0, 'freeze', bob!.id);
      vi.advanceTimersByTime(10_000);
      expect(show().missing!.stage).toBe('answer');
      expectGameError(() => tap(bob!, 0.5, 0.3), 'FROZEN');
      vi.advanceTimersByTime(5000);
      tap(bob!, 0.5, 0.3);
    });

    it('Double ou rien and Sablier as usual', () => {
      create(quizOf(missing()), { jokers: true, jokerHand: ['double', 'hourglass', 'shield'] });
      const [alice, bob] = start('Alice', 'Bob', 'Chloé');
      game.useJoker(alice!.id, 0, 'double');
      memorize();
      vi.advanceTimersByTime(15_000);
      tap(alice!, 0.5, 0.3);
      tap(bob!, 0.5, 0.3);
      game.useJoker(bob!.id, 0, 'hourglass');
      vi.advanceTimersByTime(15_000);
      expect(result(alice!).pointsEarned).toBe(1500);
      expect(result(bob!).pointsEarned).toBe(875);
    });
  });
});
