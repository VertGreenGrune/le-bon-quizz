import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUCTION_BID_MS,
  PAUSE_GRACE_MS,
  QuestionSchema,
  RESUME_COUNTDOWN_MS,
  auctionAllowed,
  auctionDelta,
  auctionMaxBid,
  type AuctionBidPayload,
  type GameStatePayload,
  type JokerType,
  type PlayerResultPayload,
  type Question,
  type QuestionRevealPayload,
  type Quiz,
  type ServerToClientEvents,
  type StandingsPayload,
  type SurvivalStatePayload,
} from '@lbq/shared';
import { Game, type GameSettings, type GameTransport, type Player } from './Game.js';
import type { GameError } from './errors.js';

// T64 « Enchères »: players bid on a question before seeing it.

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

const mcq = (text: string, extra: Partial<Question> = {}): Question =>
  ({
    text,
    type: 'MCQ',
    timeLimitSec: 20,
    basePoints: 1000,
    choices: [
      { text: 'Bon', isCorrect: true },
      { text: 'Faux', isCorrect: false },
    ],
    ...extra,
  }) as Question;

/** Q1 plain (to earn points), Q2 and Q3 with bids. Choice 0 right; instant answer = 1000. */
const quiz: Quiz = {
  id: 'auction',
  title: 'Enchères',
  questions: [
    mcq('Q1 sans enchères'),
    mcq('Q2 secrète', { auction: true, auctionTopic: 'Cinéma des années 80' }),
    mcq('Q3 secrète', { auction: true }),
  ],
};
const RIGHT = { choiceIndex: 0 };
const WRONG = { choiceIndex: 1 };

const errorCode = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as GameError).code;
  }
  return null;
};

describe('« Enchères » (T64)', () => {
  let rec: ReturnType<typeof recorder>;
  let game: Game;

  const create = (settings: Partial<GameSettings> = {}, q: Quiz = quiz) => {
    rec = recorder();
    game = new Game(
      '123456',
      q,
      rec.transport,
      {},
      { mode: 'solo', allAnsweredGraceMs: 0, ...settings },
    );
  };

  beforeEach(() => {
    vi.useFakeTimers(); // Date.now() frozen: every answer is instant (full points)
    create();
  });

  afterEach(() => {
    game.dispose();
    vi.useRealTimers();
  });

  const joinAll = (...names: string[]) => names.map((n) => game.join(n, `sock-${n}`)) as Player[];
  const answer = (p: Player, input: object) =>
    game.answer(p.id, game.questionIndex, input as { choiceIndex: number });
  const state = () => rec.last('game:state', 'all') as GameStatePayload;
  const result = (p: Player) => rec.last('player:result', p.socketId!) as PlayerResultPayload;
  const reveal = () => rec.last('question:reveal', 'host') as QuestionRevealPayload;
  const board = () => rec.last('leaderboard', 'host') as StandingsPayload;
  const bid = (p: Player, amount: number) => game.bid(p.id, game.questionIndex, amount);
  /** Q1 played: everyone in `right` answers right (1000 points each). Ends on Q2's bid stage. */
  const playFirst = (all: Player[], right: Player[]) => {
    game.start();
    game.next(); // Q1 intro → ANSWERING
    for (const p of all) answer(p, right.includes(p) ? RIGHT : WRONG);
    if (game.phase === 'ANSWERING') game.next();
    game.next(); // LEADERBOARD
    game.next(); // Q2 intro: the bid stage
    expect(state().auction?.stage).toBe('bid');
  };
  /** Bid stage → ANSWERING (« Passer » twice). */
  const toAnswering = () => {
    game.next();
    game.next();
    expect(game.phase).toBe('ANSWERING');
  };
  const toReveal = () => {
    if (game.phase === 'ANSWERING') game.next();
    expect(game.phase).toBe('REVEAL');
  };

  describe('shared rules', () => {
    it('takes bids on the types with a right answer, never au buzzer', () => {
      expect(auctionAllowed('MCQ')).toBe(true);
      expect(auctionAllowed('BLUFF')).toBe(true);
      expect(auctionAllowed('WAGER')).toBe(true);
      expect(auctionAllowed('MCQ', true)).toBe(false);
      for (const t of [
        'POLL',
        'WHO_OF_US',
        'WORD_CLOUD',
        'DRAW',
        'WAVELENGTH',
        'HOT_POTATO',
      ] as const)
        expect(auctionAllowed(t)).toBe(false);
      const base = { text: 'Q', choices: [{ text: 'A' }, { text: 'B' }] };
      expect(QuestionSchema.safeParse({ ...base, type: 'POLL', auction: true }).success).toBe(
        false,
      );
      expect(QuestionSchema.safeParse(mcq('Q', { auction: true, buzzer: true })).success).toBe(
        false,
      );
      expect(QuestionSchema.safeParse(mcq('Q', { auction: true })).success).toBe(true);
      expect(
        QuestionSchema.safeParse(mcq('Q', { auction: true, auctionTopic: 'x'.repeat(41) })).success,
      ).toBe(false);
    });

    it('max bid = the score, at most 1000, at least 200, on a step of 50; floors the total at 0', () => {
      expect([0, 150, 437, 999, 1000, 5000].map(auctionMaxBid)).toEqual([
        200, 200, 400, 950, 1000, 1000,
      ]);
      expect(auctionDelta(400, true, 0)).toBe(400);
      expect(auctionDelta(400, false, 1000)).toBe(-400);
      expect(auctionDelta(400, false, 150)).toBe(-150);
      expect(auctionDelta(400, false, -100)).toBe(0);
      expect(auctionDelta(0, false, 1000)).toBe(0);
    });
  });

  it('shows nothing of the question before the bid stage is over', () => {
    const players = joinAll('Alice', 'Bob');
    playFirst(players, players);
    const from = rec.sent.findIndex(
      (s) => s.event === 'game:state' && s.to === 'all' && (s.payload as GameStatePayload).auction,
    );
    const during = rec.sent.slice(from);
    expect(during.some((s) => s.event === 'question:show')).toBe(false);
    expect(JSON.stringify(during)).not.toContain('Q2 secrète');
    expect(state()).toMatchObject({
      phase: 'QUESTION_INTRO',
      remainingMs: AUCTION_BID_MS,
      auction: { stage: 'bid', topic: 'Cinéma des années 80', questionType: 'MCQ', bidders: [] },
    });
    expect(state().introMs).toBeUndefined();
    // Each phone gets its max (1000 points → 1000).
    expect(rec.last('auction:bid', 'sock-Alice')).toEqual({ index: 1, max: 1000, amount: 0 });
    // A host reload during the bids: still no question.
    rec.sent.length = 0;
    game.resyncHost('host-2');
    expect(rec.sent.some((s) => s.event === 'question:show')).toBe(false);
    // Closing the bids sends the question with its topic, then the usual intro.
    game.next();
    expect(game.phase).toBe('QUESTION_INTRO');
    expect(rec.last('question:show', 'host')).toMatchObject({
      text: 'Q2 secrète',
      auction: { topic: 'Cinéma des années 80' },
    });
    expect(state().auction?.stage).toBe('play');
    expect(state().introMs).toBeGreaterThan(0);
    // The bid stage ends by itself too.
    game.next(); // ANSWERING
    game.next(); // REVEAL
    game.next(); // LEADERBOARD
    game.next(); // Q3 bid stage
    expect(state().auction).toMatchObject({ stage: 'bid', questionType: 'MCQ' });
    expect(state().auction?.topic).toBeUndefined();
    vi.advanceTimersByTime(AUCTION_BID_MS);
    expect(state().auction?.stage).toBe('play');
    expect(rec.last('question:show', 'host')).toMatchObject({ text: 'Q3 secrète', auction: {} });
  });

  it('checks the bids: max, steps, changes, only during the bid stage, never the amounts', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    playFirst([alice!, bob!], [alice!]); // Alice 1000 → max 1000, Bob 0 → max 200
    expect(rec.last('auction:bid', 'sock-Bob')).toMatchObject({ max: 200 });
    expect(errorCode(() => bid(bob!, 250))).toBe('INVALID_PAYLOAD');
    expect(errorCode(() => bid(alice!, 75))).toBe('INVALID_PAYLOAD');
    expect(bid(alice!, 1000)).toEqual({ amount: 1000 });
    expect(bid(bob!, 200)).toEqual({ amount: 200 });
    expect(state().auction?.bidders.map((p) => p.nickname)).toEqual(['Alice', 'Bob']);
    expect(bid(alice!, 300)).toEqual({ amount: 300 });
    expect(bid(bob!, 0)).toEqual({ amount: 0 });
    expect(state().auction?.bidders.map((p) => p.nickname)).toEqual(['Alice']);
    expect(JSON.stringify(rec.sent.filter((s) => s.event === 'game:state'))).not.toContain(
      'amount',
    );
    expect(errorCode(() => game.useJoker(alice!.id, 1, 'double'))).toBe('JOKER_REFUSED');
    game.next(); // bids closed
    expect(errorCode(() => bid(alice!, 100))).toBe('NOT_ANSWERING');
  });

  it('right → + bid, wrong / none → − bid (never below 0), in the result, the reveal and the gains', () => {
    const [alice, bob, chloe, dan] = joinAll('Alice', 'Bob', 'Chloé', 'Dan');
    playFirst([alice!, bob!, chloe!, dan!], [alice!, bob!]);
    bid(alice!, 400);
    bid(bob!, 1000);
    bid(chloe!, 200); // 0 points: nothing to lose
    toAnswering();
    answer(alice!, RIGHT);
    answer(bob!, WRONG);
    answer(chloe!, WRONG);
    // Dan doesn't answer, no bid.
    toReveal();
    expect(result(alice!)).toMatchObject({ pointsEarned: 1500, auction: { bid: 400, delta: 400 } });
    expect(result(bob!)).toMatchObject({
      pointsEarned: -1000,
      auction: { bid: 1000, delta: -1000 },
    });
    expect(result(bob!).totalScore).toBe(0);
    expect(result(chloe!)).toMatchObject({ pointsEarned: 0, auction: { bid: 200, delta: 0 } });
    expect(result(dan!).auction).toEqual({ bid: 0, delta: 0 });
    expect(reveal().auction?.bids.map((b) => [b.nickname, b.amount, b.correct, b.delta])).toEqual([
      ['Bob', 1000, false, -1000],
      ['Alice', 400, true, 400],
      ['Chloé', 200, false, 0],
    ]);
    expect(game.questionStats.at(-1)?.details.auction?.bids).toHaveLength(3);
    game.next();
    const gains = Object.fromEntries(board().top.map((p) => [p.nickname, p.gained]));
    expect(gains).toEqual({ Alice: 1500, Bob: -1000, Chloé: 0, Dan: 0 });
  });

  it('comes after Double ou rien and before the Voleur', () => {
    create({ jokers: true, random: () => 0 }); // the wheel lands on Alice
    const [alice, bob] = joinAll('Alice', 'Bob');
    const hand = (p: Player, jokers: JokerType[]) => game.jokers!.setHand(p.id, jokers);
    playFirst([alice!, bob!], [alice!, bob!]);
    bid(alice!, 300);
    game.next(); // bids closed: jokers allowed now
    hand(alice!, ['double']);
    hand(bob!, ['thief']);
    game.useJoker(alice!.id, game.questionIndex, 'double');
    game.useJoker(bob!.id, game.questionIndex, 'thief');
    game.next();
    answer(alice!, WRONG);
    answer(bob!, RIGHT);
    toReveal();
    // Alice: 1000 − 500 (Double) = 500, − 300 (bid) = 200, − 20 (10 % stolen) = 180.
    expect(result(alice!)).toMatchObject({ pointsEarned: -820, totalScore: 180 });
    // Bob: 1000 + 1000 + 100 (streak) + 20.
    expect(result(bob!)).toMatchObject({ totalScore: 2120 });
  });

  it('a host accept turns − bid into + bid', () => {
    const q: Quiz = {
      ...quiz,
      questions: [mcq('Q1'), mcq('Q2', { auction: true }), mcq('Q3')],
    };
    create({}, q);
    const [alice, bob] = joinAll('Alice', 'Bob');
    playFirst([alice!, bob!], [alice!, bob!]);
    bid(bob!, 400);
    toAnswering();
    answer(alice!, RIGHT);
    answer(bob!, WRONG);
    toReveal();
    expect(result(bob!)).toMatchObject({ auction: { delta: -400 }, totalScore: 600 });
    game.accept(1, { choiceIndex: 1 });
    expect(result(bob!)).toMatchObject({
      accepted: true,
      auction: { bid: 400, delta: 400 },
      totalScore: 1000 + 1000 + 100 + 400,
    });
    expect(reveal().auction?.bids).toEqual([
      expect.objectContaining({ nickname: 'Bob', correct: true, delta: 400 }),
    ]);
    expect(game.questionStats).toHaveLength(2);
  });

  it('team mode: the bid is part of the player points, so of the team average', () => {
    const q: Quiz = { ...quiz, questions: [mcq('Q1', { auction: true }), mcq('Q2')] };
    create({ mode: 'teams', teamCount: 2 }, q);
    const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
    game.setTeam(alice!.id, 0);
    game.setTeam(bob!.id, 0);
    game.setTeam(chloe!.id, 1);
    game.start();
    bid(alice!, 200);
    toAnswering();
    answer(alice!, RIGHT);
    answer(bob!, WRONG);
    answer(chloe!, RIGHT);
    toReveal();
    game.next();
    expect(board().teams?.map((t) => [t.name, t.score])).toEqual([
      ['Équipe Bleue', 1000],
      ['Équipe Rouge', 600],
    ]);
  });

  it('« Survie »: hearts are lost as usual, a bid saves none', () => {
    const q: Quiz = { ...quiz, questions: [mcq('Q1', { auction: true }), mcq('Q2')] };
    create({ mode: 'survival', hearts: 3 }, q);
    const [alice, bob] = joinAll('Alice', 'Bob');
    game.start();
    bid(alice!, 200);
    bid(bob!, 200);
    toAnswering();
    answer(alice!, RIGHT);
    answer(bob!, WRONG);
    toReveal();
    const hearts = (p: Player) =>
      (rec.last('survival:state', 'all') as SurvivalStatePayload).players.find((s) => s.id === p.id)
        ?.hearts;
    expect(hearts(alice!)).toBe(3);
    expect(hearts(bob!)).toBe(2);
    expect(result(alice!).auction).toEqual({ bid: 200, delta: 200 });
  });

  it('a pause freezes the bid stage; a rejoin gets the bid back', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    playFirst([alice!, bob!], [alice!, bob!]);
    bid(bob!, 500);
    vi.advanceTimersByTime(3000);
    game.disconnect(bob!.socketId!);
    vi.advanceTimersByTime(PAUSE_GRACE_MS);
    expect(state().paused).toBeDefined();
    expect(state().remainingMs).toBe(AUCTION_BID_MS - 3000);
    expect(errorCode(() => bid(alice!, 100))).toBe('GAME_PAUSED');
    vi.advanceTimersByTime(60_000);
    expect(state().auction?.stage).toBe('bid');
    game.resync(game.rejoin(bob!.sessionToken, 'sock-bob-2'));
    expect(rec.last('auction:bid', 'sock-bob-2') as AuctionBidPayload).toEqual({
      index: 1,
      max: 1000,
      amount: 500,
    });
    vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
    expect(state().paused).toBeUndefined();
    vi.advanceTimersByTime(AUCTION_BID_MS - 3000 - 1);
    expect(state().auction?.stage).toBe('bid');
    vi.advanceTimersByTime(1);
    expect(state().auction?.stage).toBe('play');
  });

  it('« Passer » closes the bids: the bids so far count, the others are 0', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    playFirst([alice!, bob!], [alice!, bob!]);
    bid(alice!, 100);
    toAnswering();
    answer(alice!, WRONG);
    answer(bob!, WRONG);
    toReveal();
    expect(result(alice!).auction).toEqual({ bid: 100, delta: -100 });
    expect(result(bob!).auction).toEqual({ bid: 0, delta: 0 });
  });

  it('« Continuer sans »: the excused player’s bid is cancelled', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    playFirst([alice!, bob!], [alice!, bob!]);
    bid(bob!, 500);
    toAnswering();
    game.disconnect(bob!.socketId!);
    vi.advanceTimersByTime(PAUSE_GRACE_MS);
    game.resume(); // « Continuer sans Bob »
    vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
    answer(alice!, RIGHT);
    expect(game.phase).toBe('REVEAL');
    expect(game.standings().find((s) => s.nickname === 'Bob')?.score).toBe(1000);
  });
});
