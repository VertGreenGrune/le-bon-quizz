import type { LobbyMember, OrderAnswer, OrderQuestion, RevealDetails } from '@lbq/shared';

/**
 * ORDER — Remettre dans l'ordre (PLAN.md §3). The items are shown shuffled (same order on the TV
 * and every phone); a player answers with the shown indexes in the order they chose.
 */

/**
 * Display order: `display[shown index] = index in the right order`. A derangement (no item
 * already in its place), so the shuffle never gives the answer away and an untouched list
 * scores 0.
 */
export function shuffleOrder(count: number, random: () => number = Math.random): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  if (count < 2) return order;
  do {
    for (let i = count - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
  } while (order.some((v, i) => v === i));
  return order;
}

/** `order` is a permutation of the shown indexes 0…count−1. */
export function isPermutation(order: readonly number[], count: number): boolean {
  return order.length === count && new Set(order).size === count && order.every((i) => i < count);
}

/** Number of positions where the player put the right item. */
export function placedCount(order: readonly number[], display: readonly number[]): number {
  return order.filter((shown, position) => display[shown] === position).length;
}

/**
 * Points (PLAN.md §3): the time-based points × share of the items in the right place. Only a
 * fully right order is correct (streak); a partial one still earns its share.
 */
export function orderPoints(
  timePoints: number,
  placed: number,
  total: number,
): { correct: boolean; points: number } {
  return { correct: placed === total, points: Math.round((timePoints * placed) / total) };
}

/** Items in the shown order. */
export function shownItems(q: OrderQuestion, display: readonly number[]): string[] {
  return display.map((i) => q.items[i]!);
}

/** One player's list for the reveal (T50). */
export interface OrderAnswerInput {
  player: LobbyMember;
  /** Shown indexes in the order the player chose; null = no answer. */
  order: readonly number[] | null;
  points: number;
}

/**
 * The right order, per position how many players put the right item there, and (T50) every
 * player's list in right-order indexes — best first, players without an answer last.
 */
export function orderReveal(
  q: OrderQuestion,
  display: readonly number[],
  answers: readonly OrderAnswerInput[],
): RevealDetails {
  const placed = q.items.map(() => 0);
  for (const { order } of answers) {
    order?.forEach((shown, position) => {
      if (display[shown] === position) placed[position]!++;
    });
  }
  const rows: OrderAnswer[] = answers.map(({ player, order, points }) => ({
    nickname: player.nickname,
    avatar: player.avatar,
    order: order ? order.map((shown) => display[shown]!) : [],
    placed: order ? placedCount(order, display) : 0,
    points: order ? points : 0,
  }));
  // Stable sort: answered first, then most items placed, then most points (faster).
  rows.sort(
    (a, b) =>
      Number(b.order.length > 0) - Number(a.order.length > 0) ||
      b.placed - a.placed ||
      b.points - a.points,
  );
  return { order: { items: q.items, placed, answers: rows } };
}
