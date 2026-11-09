import { memo } from 'react';
import {
  DRAW_BACKGROUND,
  DRAW_HEIGHT,
  DRAW_WIDTH,
  strokeStyle,
  type DrawStroke,
} from '@lbq/shared';
import { smoothSegments } from '../lib/drawing';

/** SVG path of a stroke, smoothed like on the drawer's phone (a single point = a dot). */
export function strokePath(points: readonly number[]): string {
  if (points.length < 2) return '';
  if (points.length === 2) return `M${points[0]} ${points[1]}l0.01 0`;
  const { move, curves, end } = smoothSegments(points);
  const r = (v: number) => Math.round(v * 10) / 10;
  let d = `M${move[0]} ${move[1]}`;
  for (const [cx, cy, x, y] of curves) d += `Q${cx} ${cy} ${r(x)} ${r(y)}`;
  return `${d}L${end[0]} ${end[1]}`;
}

/**
 * « Dessine-moi »: a drawing (vector strokes) on its white 4:3 board — TV, report. Scales to its
 * container.
 */
export const Drawing = memo(function Drawing({
  strokes,
  className = '',
  label = 'Dessin',
}: {
  strokes: readonly DrawStroke[];
  className?: string;
  label?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${DRAW_WIDTH} ${DRAW_HEIGHT}`}
      role="img"
      aria-label={label}
      data-testid="drawing"
      data-strokes={strokes.length}
      className={`aspect-[4/3] ${className}`}
      style={{ background: DRAW_BACKGROUND }}
    >
      {strokes.map((s) => {
        const { color, width } = strokeStyle(s);
        return (
          <path
            key={s.id}
            d={strokePath(s.points)}
            stroke={color}
            strokeWidth={width}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        );
      })}
    </svg>
  );
});
