import { describe, expect, it } from 'vitest';
import { cloudLayout } from './wordCloud';

describe('cloudLayout', () => {
  it('sizes words by count and puts the most typed in the middle', () => {
    const layout = cloudLayout([
      { text: 'génial', count: 5 },
      { text: 'drôle', count: 3 },
      { text: 'gothique', count: 1 },
      { text: 'noir', count: 1 },
    ]);
    expect(layout.map((w) => w.text)).toEqual(['noir', 'drôle', 'génial', 'gothique']);
    const size = Object.fromEntries(layout.map((w) => [w.text, w.sizeRem]));
    expect(size).toEqual({ génial: 5, drôle: 3.3, gothique: 1.5, noir: 1.5 });
    // The most typed word appears last.
    const delay = Object.fromEntries(layout.map((w) => [w.text, w.delay]));
    expect(delay.génial).toBeGreaterThan(delay.drôle!);
  });

  it('gives every word the same size when counts are equal', () => {
    expect(cloudLayout([{ text: 'a', count: 2 }]).map((w) => w.sizeRem)).toEqual([3.25]);
    expect(cloudLayout([])).toEqual([]);
  });
});
