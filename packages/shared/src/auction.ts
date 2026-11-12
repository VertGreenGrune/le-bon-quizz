import type { QuestionType } from './quiz.js';

/**
 * « Enchères » (T64): a question option. Before seeing the question, each player secretly bids
 * points on it (a bid stage at the start of QUESTION_INTRO); at the reveal a right answer wins the
 * bid, a wrong / missing one loses it.
 */

/** Length of the bid stage, at the start of QUESTION_INTRO. */
export const AUCTION_BID_MS = 10_000;
/** Bids go by steps of 50. */
export const AUCTION_STEP = 50;
/** Highest bid: the player's score, at most 1000… */
export const AUCTION_MAX_BID = 1000;
/** …but a player with fewer points can still bid up to 200. */
export const AUCTION_MIN_MAX_BID = 200;
/** The topic shown on the TV during the bids (« Cinéma des années 80 »). */
export const AUCTION_TOPIC_MAX_LENGTH = 40;

/**
 * Types that can't take bids: the ones without a right answer, and the ones where some players
 * have nothing to answer (« Dessine-moi »: the drawer; « Sur la même longueur d'onde »: the
 * psychic; « Patate chaude »: a round, not a question).
 */
export const AUCTION_EXCLUDED_TYPES = [
  'POLL',
  'WHO_OF_US',
  'WORD_CLOUD',
  'DRAW',
  'WAVELENGTH',
  'HOT_POTATO',
] as const satisfies readonly QuestionType[];

/** « Enchères » possible on this question (never au buzzer). */
export function auctionAllowed(type: QuestionType, buzzer?: boolean): boolean {
  return !buzzer && !(AUCTION_EXCLUDED_TYPES as readonly string[]).includes(type);
}

/** Highest bid for a player with `totalScore` points: min(score, 1000), at least 200, on a step. */
export function auctionMaxBid(totalScore: number): number {
  const capped = Math.min(Math.max(0, totalScore), AUCTION_MAX_BID);
  return Math.max(Math.floor(capped / AUCTION_STEP) * AUCTION_STEP, AUCTION_MIN_MAX_BID);
}

/**
 * What a bid does to the score at the reveal: right → + bid; wrong / no answer → − bid, but the
 * total (`totalBefore` = the score with this question's points) never goes below 0.
 */
export function auctionDelta(bid: number, correct: boolean, totalBefore: number): number {
  if (bid <= 0) return 0;
  if (correct) return bid;
  const lost = Math.min(bid, Math.max(0, totalBefore));
  return lost > 0 ? -lost : 0;
}
