import { normalizeAnswer } from '../matching.js';

/** WORD_CLOUD — Nuage de mots (PLAN.md §3): free text, no right answer, 0 points. */

export const WORD_CLOUD_SIZE = 40;

/**
 * Groups the typed texts after normalization (case, accents, punctuation, leading article), most
 * frequent first; a group shows its first typing. `texts` should be earliest first.
 */
export function wordCloud(texts: Iterable<string>): { text: string; count: number }[] {
  const groups = new Map<string, { text: string; count: number }>();
  for (const text of texts) {
    const key = normalizeAnswer(text);
    if (!key) continue;
    const group = groups.get(key);
    if (group) group.count++;
    else groups.set(key, { text, count: 1 });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count).slice(0, WORD_CLOUD_SIZE);
}
