import { z } from 'zod';

/**
 * « Associer » (MATCH, T67): pairs to link together. The TV and every phone show the left items
 * in one column and the right items in another, both shuffled (the same shuffle everywhere);
 * each player links every left item to its partner on the right.
 */

export const MATCH_MIN_PAIRS = 3;
export const MATCH_MAX_PAIRS = 6;
export const MATCH_TEXT_MAX_LENGTH = 60;
export const MATCH_DEFAULT_SEC = 45;

/** One side of a pair: a text, a picture, or both (at least one). */
export const MatchSideSchema = z
  .object({
    text: z.string().trim().max(MATCH_TEXT_MAX_LENGTH).optional(),
    imageUrl: z.string().url().optional(),
  })
  .refine((s) => !!s.text || !!s.imageUrl, { message: 'A text or a picture is needed' });
export type MatchSide = z.infer<typeof MatchSideSchema>;

export const MatchPairSchema = z.object({ left: MatchSideSchema, right: MatchSideSchema });
export type MatchPair = z.infer<typeof MatchPairSchema>;

/** How a side reads in words (the remote, the report): its text, else « image n ». */
export function matchSideLabel(side: MatchSide, fallback: string): string {
  return side.text?.trim() || fallback;
}

/** Labels shown on the TV and the phones: left items 1, 2, 3…, right items A, B, C… */
export const matchLeftLabel = (shown: number) => String(shown + 1);
export const matchRightLabel = (shown: number) => String.fromCharCode(65 + shown);

/** A side's identity (two sides with the same text and picture are the same, refused). */
export const matchSideKey = (s: MatchSide) =>
  `${s.text?.trim().toLocaleLowerCase() ?? ''}|${s.imageUrl ?? ''}`;

/**
 * Points: the time-based points × share of the pairs linked right (like « Remettre dans
 * l'ordre »); only every pair right is correct (streak, « Survie »).
 */
export function matchPoints(
  timePoints: number,
  right: number,
  total: number,
): { correct: boolean; points: number } {
  return { correct: right === total, points: Math.round((timePoints * right) / total) };
}
