import { describe, expect, it } from 'vitest';
import { formatNumber, formatValue, snapToStep } from './numbers';

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
