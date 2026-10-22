import type { PinPoint, PinZone } from '@lbq/shared';

/**
 * PIN — Point sur l'image (PLAN.md §3). Distances are in picture fractions (x in widths, y in
 * heights), like the zone drawn in the editor.
 */

/** Beyond the zone, partial points fade out over this distance. */
export const PIN_FALLOFF = 0.2;

export function pinDistance(point: PinPoint, zone: PinPoint): number {
  return Math.hypot(point.x - zone.x, point.y - zone.y);
}

/**
 * Inside the zone: correct, the full time-based points. Outside: wrong (streak broken), but
 * close guesses keep some points — half at the edge of the zone, down to 0 at PIN_FALLOFF
 * beyond it.
 */
export function pinPoints(
  timePoints: number,
  point: PinPoint,
  zone: PinZone,
): { correct: boolean; points: number } {
  const beyond = pinDistance(point, zone) - zone.radius;
  if (beyond <= 1e-9) return { correct: true, points: timePoints };
  if (beyond >= PIN_FALLOFF) return { correct: false, points: 0 };
  return { correct: false, points: Math.round(timePoints * 0.5 * (1 - beyond / PIN_FALLOFF)) };
}
