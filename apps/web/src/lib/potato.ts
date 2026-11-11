import type { PlayerResultPayload } from '@lbq/shared';

/** « Patate chaude » (T63): web helpers (pure). */

/** Slowest / fastest pace of the bomb's ticking on the TV (ms between two ticks). */
export const POTATO_TICK_SLOW_MS = 1000;
export const POTATO_TICK_FAST_MS = 220;

/**
 * Time between two ticks of the bomb, `elapsedMs` into the round: slow at first, faster and
 * faster until the shortest fuse (`fuseMinSec`), then as fast as it gets — so it never tells when
 * the (secret) fuse ends.
 */
export function potatoTickMs(elapsedMs: number, fuseMinSec: number): number {
  const progress = Math.min(1, Math.max(0, elapsedMs / Math.max(1, fuseMinSec * 1000)));
  // Eased: the speed-up is felt mostly at the end.
  const eased = progress * progress;
  return Math.round(POTATO_TICK_SLOW_MS - (POTATO_TICK_SLOW_MS - POTATO_TICK_FAST_MS) * eased);
}

/** 0 (calm) → 1 (as fast as it gets): the bomb shakes and glows with it. */
export function potatoDanger(elapsedMs: number, fuseMinSec: number): number {
  return (
    (POTATO_TICK_SLOW_MS - potatoTickMs(elapsedMs, fuseMinSec)) /
    (POTATO_TICK_SLOW_MS - POTATO_TICK_FAST_MS)
  );
}

/** Title of the phone's result screen. */
export function potatoResultTitle(r: Pick<PlayerResultPayload, 'potato'>): string {
  const p = r.potato;
  if (!p?.loser) return 'Pas de partie de patate…';
  return p.exploded ? '💥 Boum ! Elle t’a explosé dans les mains !' : 'Sauvé !';
}

/** « 3 passes », « 1 passe », « aucune passe ». */
export function passesLabel(n: number): string {
  return n === 0 ? 'aucune passe' : `${n} passe${n > 1 ? 's' : ''}`;
}
