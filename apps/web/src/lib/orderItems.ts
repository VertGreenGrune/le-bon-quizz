/** ORDER questions: the items are labelled A, B, C… in their shown order (TV and phones). */
export function itemLetter(shownIndex: number): string {
  return String.fromCharCode(65 + shownIndex);
}

/**
 * ORDER reveal (T50): one player's list as cells — the item put at each position, numbered by
 * its place in the right order (1 = first), `right` when it is in its place.
 */
export function orderCells(order: readonly number[]): { rank: number; right: boolean }[] {
  return order.map((item, position) => ({ rank: item + 1, right: item === position }));
}
