/** ORDER questions: the items are labelled A, B, C… in their shown order (TV and phones). */
export function itemLetter(shownIndex: number): string {
  return String.fromCharCode(65 + shownIndex);
}
