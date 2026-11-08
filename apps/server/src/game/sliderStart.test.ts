import { describe, expect, it } from 'vitest';
import { isOnStep, type SliderSettings } from '@lbq/shared';
import { SLIDER_START_GAP, sliderStart } from './sliderStart.js';

const slider = (s: Partial<SliderSettings> = {}): SliderSettings => ({
  min: 1700,
  max: 1900,
  step: 1,
  correct: 1789,
  margin: 5,
  ...s,
});

/** Every random draw from 0 to just below 1, in `n` steps. */
const draws = (n = 200) => Array.from({ length: n }, (_, i) => i / n);

describe('slider start position (T49)', () => {
  it.each([
    ['exact answer', slider({ margin: 0 })],
    ['margin 5', slider()],
    ['wide margin', slider({ margin: 40 })],
    ['decimal step', slider({ min: 0, max: 10, step: 0.5, correct: 2.5, margin: 1 })],
    ['answer at an end', slider({ correct: 1700, margin: 10 })],
  ])('%s: on a step, inside the range, far from the answer', (_, s) => {
    const gap = s.margin + SLIDER_START_GAP * (s.max - s.min);
    for (const r of draws()) {
      const start = sliderStart(s, () => r);
      expect(start).toBeGreaterThanOrEqual(s.min);
      expect(start).toBeLessThanOrEqual(s.max);
      expect(isOnStep(start, s.min, s.step)).toBe(true);
      expect(Math.abs(start - s.correct)).toBeGreaterThanOrEqual(gap - 1e-9);
    }
  });

  it('spreads over both sides of the answer', () => {
    const starts = draws().map((r) => sliderStart(slider(), () => r));
    expect(starts.some((v) => v < 1789)).toBe(true);
    expect(starts.some((v) => v > 1789)).toBe(true);
    expect(new Set(starts).size).toBeGreaterThan(100);
  });

  it('falls back to the farthest end when the band covers everything', () => {
    expect(sliderStart(slider({ min: 0, max: 10, correct: 3, margin: 8 }), () => 0.5)).toBe(10);
    expect(sliderStart(slider({ min: 0, max: 10, correct: 7, margin: 8 }), () => 0.5)).toBe(0);
  });
});
