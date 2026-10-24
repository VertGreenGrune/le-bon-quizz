import { memo } from 'react';
import {
  DRAW_BACKGROUND,
  DRAW_HEIGHT,
  DRAW_WIDTH,
  strokeStyle,
  type DrawStroke,
} from '@lbq/shared';

/** SVG path of a stroke (a single point becomes a dot thanks to the round caps). */
export function strokePath(points: readonly number[]): string {
  if (points.length < 2) return '';
  let d = `M${points[0]} ${points[1]}`;
  if (points.length === 2) return `${d}l0.01 0`;
  for (let i = 2; i < points.length; i += 2) d += `L${points[i]} ${points[i + 1]}`;
  return d;
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
