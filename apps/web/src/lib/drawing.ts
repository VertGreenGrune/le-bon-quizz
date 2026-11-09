import { DRAW_CHUNK_MAX_POINTS, DRAW_MAX_CHUNKS, type DrawStroke } from '@lbq/shared';

export interface DrawMessage {
  strokes: DrawStroke[];
  clear: boolean;
}

/**
 * Splits stroke chunks into `player:draw` messages the server accepts: at most
 * DRAW_CHUNK_MAX_POINTS points per chunk (a longer stroke becomes several chunks with the same
 * id, appended in order) and DRAW_MAX_CHUNKS chunks per message. `clear` goes on the first
 * message only — so « Annuler le dernier trait » can re-send the whole drawing after a clear.
 */
export function drawMessages(strokes: readonly DrawStroke[], clear = false): DrawMessage[] {
  const max = DRAW_CHUNK_MAX_POINTS * 2;
  const chunks: DrawStroke[] = [];
  for (const s of strokes) {
    if (s.points.length <= max) chunks.push(s);
    else
      for (let i = 0; i < s.points.length; i += max)
        chunks.push({ ...s, points: s.points.slice(i, i + max) });
  }
  const messages: DrawMessage[] = [];
  for (let i = 0; i < chunks.length; i += DRAW_MAX_CHUNKS)
    messages.push({ strokes: chunks.slice(i, i + DRAW_MAX_CHUNKS), clear: false });
  if (clear) {
    if (messages.length === 0) messages.push({ strokes: [], clear: true });
    else messages[0]!.clear = true;
  }
  return messages;
}

/**
 * Smoothed stroke through its points (finger drawing is jagged): a quadratic curve from one
 * midpoint to the next with the point as control, a straight end to the last point. `onCurve`
 * receives (control, end) pairs; same shape on the phone canvas and the TV's SVG. `first` = index
 * of the first point not drawn yet (incremental painting on the phone): only the pieces it
 * changes are emitted, starting at `move`.
 */
export function smoothSegments(
  points: readonly number[],
  first = 0,
): { move: [number, number]; curves: [number, number, number, number][]; end: [number, number] } {
  const n = points.length / 2;
  const x = (i: number) => points[2 * i]!;
  const y = (i: number) => points[2 * i + 1]!;
  const mid = (i: number): [number, number] => [(x(i) + x(i + 1)) / 2, (y(i) + y(i + 1)) / 2];
  const last = n - 1;
  // Curve i (1 ≤ i ≤ last - 1) needs point i + 1: the new points change curves from first - 1 on.
  const c0 = Math.max(1, first - 1);
  const move: [number, number] = c0 === 1 || c0 > last - 1 ? [x(0), y(0)] : mid(c0 - 1);
  const curves: [number, number, number, number][] = [];
  for (let i = c0; i <= last - 1; i++) curves.push([x(i), y(i), ...mid(i)]);
  return { move, curves, end: [x(last), y(last)] };
}
