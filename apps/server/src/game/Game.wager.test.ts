import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { introOf } from './testing.js';
import {
  PAUSE_GRACE_MS,
  QuestionSchema,
  RESUME_COUNTDOWN_MS,
  answerCancellable,
  answerText,
  jokerAvailability,
  wagerAuthorPoints,
  wagerBetPoints,
  type GameStatePayload,
  type PlayerResultPayload,
  type QuestionPromptPayload,
  type QuestionRevealPayload,
  type QuestionShowPayload,
  type Quiz,
  type ServerToClientEvents,
  type StandingsPayload,
  type SurvivalStatePayload,
  type WagerQuestion,
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

const wager = (text: string, correct: number, unit?: string): WagerQuestion => ({
  text,
  type: 'WAGER',
  wager: { correct, ...(unit && { unit }) },
  timeLimitSec: 30,
  betTimeSec: 20,
  basePoints: 1000,
});

const quiz: Quiz = {
  id: 'wager',
  title: 'Paris',
  questions: [
    wager('Hauteur de la tour Eiffel ?', 330, 'm'),
    wager('Année de la prise de la Bastille ?', 1789),
  ],
};

describe('« Paris sur les réponses » (WAGER)', () => {
  let rec: ReturnType<typeof recorder>;
  let game: Game;

  const create = (settings: Partial<GameSettings> = {}, q: Quiz = quiz) => {
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
  const prompt = (p: Player) => rec.last('question:prompt', p.socketId!) as QuestionPromptPayload;
  const show = () => rec.last('question:show', 'host') as QuestionShowPayload;
  const result = (p: Player) => rec.last('player:result', p.socketId!) as PlayerResultPayload;
  const reveal = () => rec.last('question:reveal', 'host') as QuestionRevealPayload;
  const guess = (p: Player, value: number) => game.answer(p.id, game.questionIndex, { value });
  const slots = () => {
    const w = show().wager;
    if (w?.stage !== 'bet') throw new Error('not betting');
    return w.slots.map((s) => s.value);
  };
  /** Bets on the slot with this value (null = « Plus petit que tout »). */
  const bet = (p: Player, value: number | null) =>
    game.answer(p.id, game.questionIndex, { choiceIndex: slots().indexOf(value) });
  const toGuessing = () => {
    game.start();
    vi.advanceTimersByTime(introOf(game));
    expect(game.phase).toBe('ANSWERING');
  };
  /** Alice 300, Bob 324, Chloé 400 (the answer is 330 m): bets start. */
  const threeGuesses = () => {
    const players = joinAll('Alice', 'Bob', 'Chloé');
    toGuessing();
    guess(players[0]!, 300);
    guess(players[1]!, 324);
    guess(players[2]!, 400);
    return players;
  };
  /** Every frame a phone got (by socket id). */
  const phoneFrames = (...players: Player[]) =>
    rec.sent.filter((s) => players.some((p) => s.to === p.socketId) || s.to === 'all');

  it('schema: defaults, decimals, bounds; helpers', () => {
    const q = QuestionSchema.parse({ text: 'Q', type: 'WAGER', wager: { correct: 2.5 } });
    expect(q).toMatchObject({ timeLimitSec: 30, betTimeSec: 20, wager: { correct: 2.5 } });
    for (const bad of [
      { wager: {} },
      { wager: { correct: 1 }, betTimeSec: 4 },
      { wager: { correct: 1 }, betTimeSec: 61 },
      { wager: { correct: 1e13 } },
      { wager: { correct: 1, unit: 'beaucoup trop long' } },
      { wager: { correct: 1 }, buzzer: true },
    ])
      expect(QuestionSchema.safeParse({ text: 'Q', type: 'WAGER', ...bad }).success).toBe(false);
    expect(answerText(wager('Q', 2.5, 'km'))).toEqual(['2,5 km']);
    expect(answerCancellable('WAGER')).toBe(false);
    expect(jokerAvailability('WAGER')).toMatchObject({
      jokers: true,
      unavailable: ['fifty', 'scramble', 'hourglass'],
    });
    expect(wagerBetPoints(1000, false)).toBe(1000);
    expect(wagerBetPoints(1000, true)).toBe(1500);
    expect(wagerAuthorPoints(2000)).toBe(1000);
  });

  it('guess stage: numbers stored (replaceable), the TV sees who guessed, then the bets', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    toGuessing();
    expect(prompt(alice!)).toMatchObject({ type: 'WAGER', wager: { stage: 'guess', unit: 'm' } });
    expect(show()).toMatchObject({ wager: { stage: 'guess', unit: 'm' } });
    guess(alice!, 250);
    guess(alice!, 300); // replaced
    expect(rec.last('answer:count', 'host')).toEqual({ answered: 1, total: 2 });
    expect((rec.last('game:state') as GameStatePayload).wager).toEqual({
      stage: 'guess',
      guessed: [{ id: alice!.id, nickname: 'Alice', avatar: alice!.avatar }],
    });
    expectGameError(() => game.answer(bob!.id, 0, { choiceIndex: 0 }), 'INVALID_PAYLOAD');
    expectGameError(() => guess(bob!, Number.POSITIVE_INFINITY), 'INVALID_PAYLOAD');
    guess(bob!, 300); // same guess as Alice: merged
    expect(game.phase).toBe('ANSWERING');
    expect(game.statePayload().remainingMs).toBe(20_000);
    expect(show().wager).toEqual({
      stage: 'bet',
      unit: 'm',
      slots: [
        { value: null, authors: [] },
        {
          value: 300,
          authors: [
            { id: alice!.id, nickname: 'Alice', avatar: alice!.avatar },
            { id: bob!.id, nickname: 'Bob', avatar: bob!.avatar },
          ],
        },
      ],
    });
    expect(show().timeLimitSec).toBe(20);
    expect(prompt(bob!)).toEqual({
      index: 0,
      type: 'WAGER',
      timeLimitSec: 20,
      wager: { stage: 'bet', unit: 'm', slots: [null, 300], own: 1 },
    });
    expect(rec.last('answer:count', 'host')).toEqual({ answered: 0, total: 2 });
  });

  it('slots are sorted ascending (decimals and negatives too)', () => {
    const [a, b, c, d] = joinAll('A', 'B', 'C', 'D');
    toGuessing();
    guess(a!, 12.5);
    guess(b!, -3);
    guess(c!, 1000);
    guess(d!, 12.25);
    expect(slots()).toEqual([null, -3, 12.25, 12.5, 1000]);
  });

  it('nobody can learn the answer before the reveal (phones nor TV)', () => {
    const [alice, bob, chloe] = threeGuesses();
    bet(alice!, 324);
    bet(bob!, 324);
    const before = JSON.stringify([
      ...phoneFrames(alice!, bob!, chloe!),
      ...rec.sent.filter((s) => s.to === 'host'),
    ]);
    // 330 as a JSON value anywhere (ids are random strings, so look at values only).
    expect(before).not.toMatch(/[:,[]330[,\]}]/);
    expect(before).toMatch(/[:,[]324[,\]}]/); // the guesses are there
    bet(chloe!, null);
    expect(game.phase).toBe('REVEAL');
    expect(reveal().wager?.correct).toBe(330);
  });

  it('scores: winning bet, author bonus, wrong bets; « correct » = won the bet', () => {
    const [alice, bob, chloe] = threeGuesses();
    // Winning slot: 324 (biggest ≤ 330, not an outer slot).
    bet(alice!, 324); // won: 1000
    bet(bob!, 400); // lost, but author of 324: +500
    bet(chloe!, 300); // lost
    expect(game.phase).toBe('REVEAL');
    expect(result(alice!)).toMatchObject({
      correct: true,
      pointsEarned: 1000,
      wager: { correct: 330, unit: 'm', guess: 300, bet: 324, winning: 324, won: true },
    });
    expect(result(bob!)).toMatchObject({
      correct: false,
      pointsEarned: 500,
      wager: { guess: 324, bet: 400, won: false, author: true, authorPoints: 500 },
    });
    expect(result(chloe!)).toMatchObject({ correct: false, pointsEarned: 0 });
    expect(reveal().wager).toMatchObject({
      correct: 330,
      winning: 2,
      betPoints: 1000,
      authorPoints: 500,
    });
    expect(reveal().wager!.slots.map((s) => s.bettors.map((b) => b.nickname))).toEqual([
      [],
      ['Chloé'],
      ['Alice'],
      ['Bob'],
    ]);
    // No time points: answering later changes nothing (checked by the exact values above).
  });

  it('an exact guess wins; the outer slots pay 50 % more', () => {
    const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
    toGuessing();
    guess(alice!, 100);
    guess(bob!, 200);
    guess(chloe!, 330); // exact, and the biggest guess: outer slot
    bet(alice!, 330);
    bet(bob!, 330);
    bet(chloe!, 330); // own guess allowed
    expect(result(alice!).pointsEarned).toBe(1500);
    expect(result(chloe!).pointsEarned).toBe(1500 + 500);
  });

  it('every guess over the answer: « Plus petit que tout » wins (outer, no author)', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    toGuessing();
    guess(alice!, 500);
    guess(bob!, 600);
    bet(alice!, null);
    bet(bob!, 500);
    expect(result(alice!)).toMatchObject({
      correct: true,
      pointsEarned: 1500,
      wager: { bet: null, winning: null, author: false },
    });
    expect(result(bob!)).toMatchObject({ correct: false, pointsEarned: 0 });
    expect(reveal().wager).toMatchObject({ winning: 0, betPoints: 1500, authorPoints: 0 });
  });

  it('a player who did not guess can still bet; without a bet the author still earns', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    toGuessing();
    guess(alice!, 320);
    vi.advanceTimersByTime(30_000); // Bob never guesses
    expect(slots()).toEqual([null, 320]);
    expect(prompt(bob!).wager).toEqual({ stage: 'bet', unit: 'm', slots: [null, 320] });
    bet(bob!, 320);
    vi.advanceTimersByTime(20_000); // Alice never bets
    expect(game.phase).toBe('REVEAL');
    expect(result(bob!)).toMatchObject({ correct: true, pointsEarned: 1500 });
    expect(result(alice!)).toMatchObject({ correct: false, pointsEarned: 500 });
  });

  it('nobody guessed: no bet stage, revealed at once', () => {
    const [alice] = joinAll('Alice', 'Bob');
    toGuessing();
    vi.advanceTimersByTime(30_000);
    expect(game.phase).toBe('REVEAL');
    expect(reveal().wager).toMatchObject({ correct: 330, slots: [], betPoints: 0 });
    expect(result(alice!)).toMatchObject({ correct: false, pointsEarned: 0 });
  });

  it('alone: guess then bet', () => {
    const [alice] = joinAll('Alice');
    toGuessing();
    guess(alice!, 300);
    expect(slots()).toEqual([null, 300]);
    bet(alice!, 300);
    expect(result(alice!)).toMatchObject({ correct: true, pointsEarned: 1500 + 500 });
  });

  it('bets are final (not cancellable); a bet on an unknown slot is refused', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    toGuessing();
    guess(alice!, 300);
    guess(bob!, 310);
    expectGameError(() => game.answer(alice!.id, 0, { choiceIndex: 9 }), 'INVALID_PAYLOAD');
    expectGameError(() => game.answer(alice!.id, 0, { value: 3 }), 'INVALID_PAYLOAD');
    bet(alice!, 310);
    expectGameError(() => game.unanswer(alice!.id, 0), 'CANCEL_REFUSED');
    expectGameError(() => bet(alice!, 300), 'ALREADY_ANSWERED');
  });

  it('the host skips each stage (« Passer »)', () => {
    const [alice] = joinAll('Alice', 'Bob');
    toGuessing();
    guess(alice!, 300);
    game.next(); // ends the guesses
    expect(show().wager?.stage).toBe('bet');
    game.next(); // ends the bets
    expect(game.phase).toBe('REVEAL');
  });

  it('a kicked player’s guess is dropped while guessing', () => {
    const [alice, bob] = joinAll('Alice', 'Bob', 'Chloé');
    toGuessing();
    guess(bob!, 999);
    game.kick(bob!.id);
    guess(alice!, 300);
    expect(game.phase).toBe('ANSWERING');
    expect(show().wager?.stage).toBe('guess'); // Chloé still awaited
  });

  it('rejoin in each stage: the guess, then the slots come back; pause freezes the timer', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    toGuessing();
    guess(alice!, 300);
    game.disconnect(alice!.socketId!);
    let back = game.rejoin(alice!.sessionToken, 'sock-alice-2');
    game.resync(back);
    expect(rec.last('question:prompt', 'sock-alice-2')).toMatchObject({
      wager: { stage: 'guess', guess: 300 },
    });
    vi.advanceTimersByTime(5_000);
    game.disconnect(bob!.socketId!);
    vi.advanceTimersByTime(PAUSE_GRACE_MS + 30_000);
    expect(game.paused).toBe(true);
    expectGameError(() => guess(alice!, 310), 'GAME_PAUSED');
    back = game.rejoin(bob!.sessionToken, 'sock-bob-2');
    game.resync(back);
    vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
    expect(game.statePayload().remainingMs).toBe(25_000);
    guess(bob!, 320);
    expect(show().wager?.stage).toBe('bet');
    game.disconnect('sock-alice-2');
    back = game.rejoin(alice!.sessionToken, 'sock-alice-3');
    game.resync(back);
    expect(rec.last('question:prompt', 'sock-alice-3')).toMatchObject({
      timeLimitSec: 20,
      wager: { stage: 'bet', slots: [null, 300, 320], own: 1 },
    });
    // The TV after a reload gets the slots back too.
    game.resyncHost('host-2');
    expect(rec.last('question:show', 'host-2')).toMatchObject({ wager: { stage: 'bet' } });
  });

  it('team mode: team averages', () => {
    create({ mode: 'teams', teamCount: 2 });
    const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
    game.setTeam(alice!.id, 0);
    game.setTeam(bob!.id, 0);
    game.setTeam(chloe!.id, 1);
    toGuessing();
    guess(alice!, 300);
    guess(bob!, 324);
    guess(chloe!, 400);
    bet(alice!, 324); // 1000
    bet(bob!, 400); // 0 + 500 (author)
    bet(chloe!, 324); // 1000
    game.next();
    const board = rec.last('leaderboard', 'host') as StandingsPayload;
    expect(board.teams?.map((t) => [t.id, t.score])).toEqual([
      [1, 1000],
      [0, 750],
    ]);
  });

  it('« Survie »: a lost bet costs a heart (the author bonus does not save it)', () => {
    create({ mode: 'survival', hearts: 3 });
    const [alice, bob] = joinAll('Alice', 'Bob');
    toGuessing();
    guess(alice!, 300);
    guess(bob!, 320);
    bet(alice!, 320);
    bet(bob!, 300);
    const state = rec.last('survival:state') as SurvivalStatePayload;
    const hearts = Object.fromEntries(state.players.map((p) => [p.nickname, p.hearts]));
    expect(hearts).toEqual({ Alice: 3, Bob: 2 });
    expect(result(bob!).pointsEarned).toBe(500);
  });

  describe('jokers', () => {
    const jokerGame = () => {
      create({ jokers: true });
      return joinAll('Alice', 'Bob', 'Chloé');
    };

    it('Copieur copies the bet (the copier still guesses)', () => {
      const [alice, bob, chloe] = jokerGame();
      game.start();
      game.jokers!.setHand(chloe!.id, ['copy']);
      game.useJoker(chloe!.id, 0, 'copy', alice!.id);
      vi.advanceTimersByTime(introOf(game));
      guess(alice!, 300);
      guess(bob!, 324);
      guess(chloe!, 329);
      bet(bob!, 300);
      bet(alice!, 329);
      expect(game.phase).toBe('REVEAL'); // Chloé bet through Alice
      expect(result(chloe!)).toMatchObject({
        correct: true,
        pointsEarned: 1500 + 500,
        wager: { bet: 329 },
      });
    });

    it('Gel lets the target guess, then blocks the first 5 s of its bets', () => {
      const [alice, bob] = jokerGame();
      game.start();
      game.jokers!.setHand(alice!.id, ['freeze']);
      game.useJoker(alice!.id, 0, 'freeze', bob!.id);
      vi.advanceTimersByTime(introOf(game));
      vi.advanceTimersByTime(8_000);
      guess(bob!, 300); // writing is never frozen
      guess(alice!, 310);
      game.next();
      expect(show().wager?.stage).toBe('bet');
      expectGameError(() => bet(bob!, 300), 'FROZEN');
      vi.advanceTimersByTime(5_000);
      bet(bob!, 300);
    });

    it('Double ou rien and Bouclier as usual; no 50/50, Brouilleur nor Sablier', () => {
      const [alice, bob, chloe] = jokerGame();
      game.start();
      game.jokers!.setHand(alice!.id, ['fifty', 'scramble', 'hourglass', 'double']);
      expectGameError(() => game.useJoker(alice!.id, 0, 'fifty'), 'JOKER_REFUSED');
      expectGameError(() => game.useJoker(alice!.id, 0, 'scramble', bob!.id), 'JOKER_REFUSED');
      expectGameError(() => game.useJoker(alice!.id, 0, 'hourglass'), 'JOKER_REFUSED');
      game.useJoker(alice!.id, 0, 'double');
      game.jokers!.setHand(bob!.id, ['shield']);
      game.useJoker(bob!.id, 0, 'shield');
      vi.advanceTimersByTime(introOf(game));
      guess(alice!, 300);
      guess(bob!, 324);
      guess(chloe!, 400);
      bet(alice!, 324);
      bet(bob!, 400);
      bet(chloe!, 400);
      expect(result(alice!).pointsEarned).toBe(2000);
      expect(result(bob!).correct).toBe(false);
    });
  });
});
