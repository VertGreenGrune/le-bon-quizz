import { AUCTION_STEP } from '@lbq/shared';

/** « Enchères » (T64): « + 400 » / « − 400 » / « ± 0 ». */
export function auctionDeltaLabel(delta: number): string {
  if (delta > 0) return `+ ${delta}`;
  if (delta < 0) return `− ${-delta}`;
  return '± 0';
}

/** The bid after a « − / + » tap or a quick choice: on a step, within 0 … max. */
export function clampBid(amount: number, max: number): number {
  const stepped = Math.round(amount / AUCTION_STEP) * AUCTION_STEP;
  return Math.min(Math.max(0, stepped), max);
}

/** Quick choices of the phone's bid pad: 0, ¼, ½, the max (on steps, no duplicates). */
export function quickBids(max: number): number[] {
  const values = [0, clampBid(max / 4, max), clampBid(max / 2, max), max];
  return [...new Set(values)];
}

/** Phone result line: « Tu avais misé 400 : + 400 ! » … */
export function auctionResultLine(auction: { bid: number; delta: number }): string | null {
  if (auction.bid <= 0) return null;
  if (auction.delta > 0) return `💰 Mise gagnée : + ${auction.delta} !`;
  if (auction.delta < 0) return `💰 Mise perdue : − ${-auction.delta}`;
  return `💰 Mise de ${auction.bid} : rien de perdu`;
}
