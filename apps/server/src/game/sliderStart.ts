import type { SliderSettings } from '@lbq/shared';

/** Share of the range kept free around the right answer's margin (T49). */
export const SLIDER_START_GAP = 0.1;

/**
 * Where the phone sliders start (T49): a random value on the step grid, at least
 * `margin + 10 % of the range` away from the right answer — so the start never sits in (or next
 * to) the scoring band. When no such value exists, the end of the range farthest from it.
 */
export function sliderStart(
  { min, max, step, correct, margin }: SliderSettings,
  random: () => number,
): number {
  const positions = Math.round((max - min) / step);
  const value = (i: number) => roundToStep(min + i * step, step);
  const gap = margin + SLIDER_START_GAP * (max - min);
  // Grid indexes at or below `correct - gap` (left part) and at or above `correct + gap` (right).
  const leftLast = Math.floor((correct - gap - min) / step + 1e-9);
  const rightFirst = Math.ceil((correct + gap - min) / step - 1e-9);
  const left = leftLast >= 0 ? Math.min(leftLast, positions) + 1 : 0; // indexes 0..leftLast
  const right = rightFirst <= positions ? positions - Math.max(rightFirst, 0) + 1 : 0;
  if (left + right === 0) return correct - min >= max - correct ? min : max;
  const pick = Math.min(Math.floor(random() * (left + right)), left + right - 1);
  return pick < left ? value(pick) : value(Math.max(rightFirst, 0) + (pick - left));
}

/** Rounds away floating-point noise (0.1 + 0.2) to the step's decimals. */
function roundToStep(v: number, step: number): number {
  const decimals = (String(step).split('.')[1] ?? '').length;
  return Number(v.toFixed(Math.min(decimals + 2, 12)));
}
