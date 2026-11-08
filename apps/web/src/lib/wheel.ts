import type { ThiefWheel } from '@lbq/shared';

/** Voleur wheel (T51): equal slices, slice 0 starts at the top, clockwise. */
export function sliceAngle(count: number): number {
  return 360 / Math.max(count, 1);
}

/** Angle of the middle of slice `index`, clockwise from the top. */
export function sliceCenter(index: number, count: number): number {
  return (index + 0.5) * sliceAngle(count);
}

/**
 * Final rotation of the wheel (clockwise, degrees) so that slice `index` stops under the pointer
 * at the top, after `turns` full turns.
 */
export function wheelRotation(index: number, count: number, turns = 5): number {
  return turns * 360 + ((360 - sliceCenter(index, count)) % 360);
}

/** SVG path of slice `index` of a wheel of radius `r` centred on (r, r). */
export function slicePath(index: number, count: number, r: number): string {
  if (count <= 1) return `M ${r} 0 A ${r} ${r} 0 1 1 ${r - 0.01} 0 Z`;
  const point = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return `${(r + r * Math.cos(rad)).toFixed(2)} ${(r + r * Math.sin(rad)).toFixed(2)}`;
  };
  const from = index * sliceAngle(count);
  const to = from + sliceAngle(count);
  const large = to - from > 180 ? 1 : 0;
  return `M ${r} ${r} L ${point(from)} A ${r} ${r} 0 ${large} 1 ${point(to)} Z`;
}

/** Index of the drawn player among the wheel's candidates (by id). */
export function drawnIndex(wheel: ThiefWheel): number {
  return Math.max(
    0,
    wheel.candidates.findIndex((c) => c.id === wheel.drawn.id),
  );
}

/** The TV line once the wheel has stopped. */
export function wheelResult(w: ThiefWheel): string {
  const thief = w.thief.nickname;
  if (w.blocked) return `🛡️ ${w.drawn.nickname} était protégé par son Bouclier !`;
  if (w.drawn.id === w.thief.id)
    return `🦹 Pas de chance, ${thief} se vole lui-même : − ${w.points} pts !`;
  return `🦹 ${thief} vole ${w.points} pts à ${w.drawn.nickname} !`;
}
