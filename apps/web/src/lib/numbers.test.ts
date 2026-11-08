import { describe, expect, it } from 'vitest';
import { formatNumber, formatValue, sliderInitialValue, snapToStep } from './numbers';

describe('numbers', () => {
  it('formats in French without thousands separators', () => {
    expect(formatNumber(1789)).toBe('1789');
    expect(formatNumber(2.5)).toBe('2,5');
    expect(formatNumber(0.1 + 0.2)).toBe('0,3');
    expect(formatValue(42, 'km')).toBe('42 km');
  });

  it('snaps to the slider steps, within the range', () => {
    expect(snapToStep(1789.4, 1700, 1900, 1)).toBe(1789);
    expect(snapToStep(0.34, 0, 1, 0.1)).toBe(0.3);
    expect(snapToStep(7, 0, 10, 5)).toBe(5);
    expect(snapToStep(-3, 0, 10, 1)).toBe(0);
    expect(snapToStep(12, 0, 10, 3)).toBe(9);
    expect(snapToStep(10, 0, 10, 4)).toBe(8); // 10 isn't a position
  });
});

describe('sliderInitialValue (T49)', () => {
  it('starts at the server start, clamped into a 50/50 range', () => {
    expect(sliderInitialValue({ min: 1700, max: 1900, step: 1, start: 1712 })).toBe(1712);
    expect(sliderInitialValue({ min: 1780, max: 1800, step: 1, start: 1712 })).toBe(1780);
    expect(sliderInitialValue({ min: 0, max: 10, step: 0.5, start: 7.3 })).toBe(7.5);
  });

  it('falls back to the middle without a start', () => {
    expect(sliderInitialValue({ min: 0, max: 10, step: 1 })).toBe(5);
  });
});
