import { describe, expect, it } from 'vitest';
import { DRAW_CHUNK_MAX_POINTS, DRAW_MAX_CHUNKS, mergeStrokes, type DrawStroke } from '@lbq/shared';
import { drawMessages, smoothSegments } from './drawing';

const stroke = (id: number, n: number): DrawStroke => ({
  id,
  color: 0,
  size: 1,
  points: Array.from({ length: n * 2 }, (_, i) => i),
});

describe('drawMessages (« Annuler le dernier trait » re-sends the drawing)', () => {
  it('sends small chunks as they are, clear on the first message only', () => {
    expect(drawMessages([stroke(1, 3)])).toEqual([{ strokes: [stroke(1, 3)], clear: false }]);
    const [first, ...rest] = drawMessages([stroke(1, 3), stroke(2, 1)], true);
    expect(first!.clear).toBe(true);
    expect(rest).toEqual([]);
  });

  it('an empty drawing after an undo is just a clear', () => {
    expect(drawMessages([], true)).toEqual([{ strokes: [], clear: true }]);
    expect(drawMessages([])).toEqual([]);
  });

  it('splits long strokes and many strokes within the server limits, same drawing once merged', () => {
    const drawing = [
      stroke(1, DRAW_CHUNK_MAX_POINTS * 2 + 5),
      ...Array.from({ length: 30 }, (_, i) => stroke(i + 2, 4)),
    ];
    const messages = drawMessages(drawing, true);
    expect(messages.length).toBeGreaterThan(1);
    expect(messages.filter((m) => m.clear)).toHaveLength(1);
    for (const m of messages) {
      expect(m.strokes.length).toBeLessThanOrEqual(DRAW_MAX_CHUNKS);
      for (const c of m.strokes)
        expect(c.points.length).toBeLessThanOrEqual(DRAW_CHUNK_MAX_POINTS * 2);
    }
    expect(messages.reduce<DrawStroke[]>((d, m) => mergeStrokes(d, m.strokes), [])).toEqual(
      drawing,
    );
  });
});

describe('smoothSegments (finger strokes drawn as curves)', () => {
  const pts = [0, 0, 10, 0, 10, 10, 20, 10, 20, 20];

  it('curves through the midpoints, ends on the last point', () => {
    expect(smoothSegments(pts)).toEqual({
      move: [0, 0],
      curves: [
        [10, 0, 10, 5],
        [10, 10, 15, 10],
        [20, 10, 20, 15],
      ],
      end: [20, 20],
    });
    expect(smoothSegments([0, 0, 4, 4])).toEqual({ move: [0, 0], curves: [], end: [4, 4] });
  });

  it('painting point by point draws every curve exactly once (phone = TV)', () => {
    const curves: number[][] = [];
    for (let k = 1; k < pts.length / 2; k++) {
      const seg = smoothSegments(pts.slice(0, (k + 1) * 2), k);
      // Each piece starts where the previous curve ended (no gap, no jump).
      const prev = curves.at(-1);
      if (seg.curves.length > 0) expect(seg.move).toEqual(prev ? prev.slice(2) : [0, 0]);
      curves.push(...seg.curves);
    }
    expect(curves).toEqual(smoothSegments(pts).curves);
  });
});
