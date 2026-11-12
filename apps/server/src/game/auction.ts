import {
  AUCTION_STEP,
  auctionAllowed,
  auctionDelta,
  auctionMaxBid,
  type AuctionBid,
  type AuctionStatus,
  type LobbyMember,
  type Question,
} from '@lbq/shared';
import { GameError } from './errors.js';

/**
 * « Enchères » (T64), one question: the bid stage at the start of QUESTION_INTRO (`bid`), then
 * the question as usual (`play`); the bids are settled at the reveal (after Double ou rien,
 * before Voleur).
 */
export interface AuctionRound {
  stage: 'bid' | 'play';
  topic?: string;
  /** Highest bid of each player, fixed at the start of the bid stage. */
  max: Map<string, number>;
  /** Bids above 0, in the order they were first placed. */
  bids: Map<string, number>;
  /** What each bid did at the last settlement (+ / − / 0); recomputed by a T44 accept. */
  deltas: Map<string, { bid: number; delta: number; correct: boolean }>;
}

interface Bidder {
  id: string;
  nickname: string;
  avatar: LobbyMember['avatar'];
  totalScore: number;
}

/** A round when the question takes bids, else null. */
export function newAuction(question: Question, players: Iterable<Bidder>): AuctionRound | null {
  if (!question.auction || !auctionAllowed(question.type, question.buzzer)) return null;
  const topic = question.auctionTopic?.trim();
  return {
    stage: 'bid',
    ...(topic && { topic }),
    max: new Map([...players].map((p) => [p.id, auctionMaxBid(p.totalScore)])),
    bids: new Map(),
    deltas: new Map(),
  };
}

/** A bid of the bid stage (replaces the previous one; 0 = no bid). */
export function placeBid(round: AuctionRound, playerId: string, amount: number): number {
  if (round.stage !== 'bid') throw new GameError('NOT_ANSWERING', 'Les enchères sont closes');
  const max = round.max.get(playerId) ?? 0;
  if (amount < 0 || amount % AUCTION_STEP !== 0 || amount > max)
    throw new GameError('INVALID_PAYLOAD', `Mise entre 0 et ${max} points`);
  if (amount === 0) round.bids.delete(playerId);
  else round.bids.set(playerId, amount);
  return amount;
}

/** The player's bid (0 without one). */
export const bidOf = (round: AuctionRound, playerId: string): number =>
  round.bids.get(playerId) ?? 0;

/**
 * At the reveal: + bid for a right answer, − bid otherwise (never below 0). `refunded`: the
 * player was excused / absent for the whole question, the bid is cancelled.
 */
export function settleBid(
  round: AuctionRound,
  playerId: string,
  correct: boolean,
  totalBefore: number,
  refunded: boolean,
): number {
  const bid = bidOf(round, playerId);
  const delta = refunded ? 0 : auctionDelta(bid, correct, totalBefore);
  if (bid > 0) round.deltas.set(playerId, { bid, delta, correct });
  return delta;
}

export function auctionStatus(
  round: AuctionRound,
  question: Question,
  players: ReadonlyMap<string, LobbyMember>,
): AuctionStatus {
  return {
    stage: round.stage,
    ...(round.topic && { topic: round.topic }),
    questionType: question.type,
    bidders: [...round.bids.keys()].flatMap((id) => {
      const p = players.get(id);
      return p ? [member(p)] : [];
    }),
  };
}

/** Every bid above 0 of the players still in the game, biggest first. */
export function auctionReveal(
  round: AuctionRound,
  players: ReadonlyMap<string, LobbyMember>,
): { bids: AuctionBid[] } {
  const bids = [...round.deltas].flatMap(([id, d]) => {
    const p = players.get(id);
    return p ? [{ ...member(p), amount: d.bid, correct: d.correct, delta: d.delta }] : [];
  });
  return { bids: bids.sort((a, b) => b.amount - a.amount) };
}

const member = ({ id, nickname, avatar }: LobbyMember): LobbyMember => ({ id, nickname, avatar });
