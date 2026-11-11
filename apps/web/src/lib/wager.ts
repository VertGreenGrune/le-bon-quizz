import { WAGER_MAX_ABS, type PlayerResultPayload } from '@lbq/shared';
import { formatValue } from './numbers';

/** « Paris sur les réponses » (T61): the first slot, below every guess. */
export const SMALLER_THAN_ALL = 'Plus petit que tout';

/** A slot in words: « 1 789 km »-style value, or « Plus petit que tout ». */
export function slotLabel(value: number | null, unit?: string): string {
  return value === null ? SMALLER_THAN_ALL : formatValue(value, unit);
}

/** First and last slots: the riskier bets (+50 %). */
export function isOuterSlot(index: number, count: number): boolean {
  return index === 0 || index === count - 1;
}

/**
 * A number typed on the phone: spaces (thousands) ignored, French comma or dot, an optional sign.
 * null when it isn't a number (or too big).
 */
export function parseGuess(text: string): number | null {
  // \s also covers the non-breaking spaces of French thousands; U+2212 = the minus sign.
  const clean = text.replace(/\s/g, '').replace(',', '.').replace(/−/g, '-');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(clean)) return null;
  const value = Number(clean);
  return Number.isFinite(value) && Math.abs(value) <= WAGER_MAX_ABS ? value : null;
}

/**
 * Number line of the reveal: where each value sits, as a fraction (5 %–95 %) of the line between
 * the smallest and the biggest of `values` (all at the middle when they are equal).
 */
export function linePositions(values: readonly number[]): (v: number) => number {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!Number.isFinite(min) || max === min) return () => 0.5;
  return (v) => 0.05 + (0.9 * (v - min)) / (max - min);
}

/** Phone result title: bet won, winning guess only, lost, or no bet. */
export function wagerResultTitle(r: PlayerResultPayload): string {
  const w = r.wager;
  if (r.correct) return 'Pari gagné !';
  if (w?.author) return 'Bien estimé !';
  return w?.bet !== undefined ? 'Pari perdu !' : 'Temps écoulé !';
}
