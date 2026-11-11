import { listItemAnswers } from '@lbq/shared';

/**
 * TYPE_ANSWER matching (server only, PLAN.md §3): both sides are normalized — trimmed, lower
 * case, without accents, punctuation, extra spaces or a leading article — then compared. With
 * typo tolerance, a Levenshtein distance of 1 is accepted for answers of 5–9 characters and 2
 * for 10+. Answers containing a number must match exactly ("8" ≠ "9").
 */

const LEADING_ARTICLE = /^(?:le|la|les|l|un|une|des) (?=\S)/;

export function normalizeAnswer(input: string): string {
  return (
    input
      .normalize('NFD')
      .replace(/\p{M}/gu, '') // accents
      .toLowerCase()
      .replace(/œ/g, 'oe')
      .replace(/æ/g, 'ae')
      // Punctuation (apostrophes included: "l'océan" → "l ocean") becomes a space.
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .replace(LEADING_ARTICLE, '')
  );
}

/** Edit distance (insertions, deletions, substitutions). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row.push(Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost));
    }
    prev = row;
  }
  return prev[b.length]!;
}

/** Typos allowed for a normalized accepted answer of this length. */
export function allowedTypos(length: number): number {
  if (length >= 10) return 2;
  if (length >= 5) return 1;
  return 0;
}

export function matchesAnswer(
  typed: string,
  acceptedAnswers: readonly string[],
  typoTolerance: boolean,
): boolean {
  const guess = normalizeAnswer(typed);
  if (!guess) return false;
  return acceptedAnswers.some((answer) => {
    const accepted = normalizeAnswer(answer);
    if (guess === accepted) return true;
    if (!typoTolerance || /\d/.test(accepted) || /\d/.test(guess)) return false;
    return levenshtein(guess, accepted) <= allowedTypos(accepted.length);
  });
}

/**
 * « Presque ! » (« Dessine-moi »): a guess that doesn't match but is close — one more typo than
 * `matchesAnswer` accepts, or one of the words of a longer answer (« tour » for « tour Eiffel »).
 * Answers with a digit never are.
 */
export function isNearMiss(typed: string, answer: string): boolean {
  const guess = normalizeAnswer(typed);
  const accepted = normalizeAnswer(answer);
  if (!guess || !accepted || guess === accepted || /\d/.test(guess + accepted)) return false;
  if (levenshtein(guess, accepted) <= allowedTypos(accepted.length) + 1) return true;
  const words = (s: string) => s.split(' ').filter((w) => w.length >= 3);
  const inside = (part: string, whole: string) => ` ${whole} `.includes(` ${part} `);
  return (
    words(guess).some((w) => inside(w, accepted)) || words(accepted).some((w) => inside(w, guess))
  );
}

/**
 * « Liste chrono » / « Pas évident ! »: the item (« | » spellings, `listItemAnswers`) a guess
 * names — an exact match first (so a close but different item isn't taken for it), then with
 * the typo tolerance. Items in `skip` are ignored. -1 = none.
 */
export function matchItem(
  items: readonly string[],
  guess: string,
  typoTolerance: boolean,
  skip: ReadonlySet<number> = new Set(),
): number {
  for (const tolerant of typoTolerance ? [false, true] : [false]) {
    const index = items.findIndex(
      (item, i) => !skip.has(i) && matchesAnswer(guess, listItemAnswers(item), tolerant),
    );
    if (index >= 0) return index;
  }
  return -1;
}
