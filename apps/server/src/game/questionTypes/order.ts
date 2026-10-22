import type { OrderQuestion, RevealDetails } from '@lbq/shared';

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

/** The right order, and per position how many players put the right item there. */
export function orderReveal(
  q: OrderQuestion,
  display: readonly number[],
  orders: readonly (readonly number[])[],
): RevealDetails {
  const placed = q.items.map(() => 0);
  for (const order of orders) {
    order.forEach((shown, position) => {
      if (display[shown] === position) placed[position]!++;
    });
  }
  return { order: { items: q.items, placed } };
}
