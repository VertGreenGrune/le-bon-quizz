import type { ImageEffect } from '@lbq/shared';

/** Start of each effect (progress 0); everything is back to normal at progress 1. */
export const BLUR_START_PX = 30;
export const ZOOM_START = 6;
/** Pixelate: blocks across the picture at the start. */
export const PIXELATE_START_BLOCKS = 8;

export interface EffectFrame {
  /** CSS blur radius (px). */
  blurPx: number;
  /** CSS scale (zoom). */
  scale: number;
  /** Pixelate: blocks across the width, null = the picture at full resolution. */
  blocks: number | null;
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/**
 * The picture at `progress` (0 = start of ANSWERING, 1 = end / REVEAL). Blur and zoom shrink
 * linearly; pixelate doubles its resolution at a steady pace (8 → 16 → 32 … blocks) until
 * `naturalWidth`, so each step is a visible gain.
 */
export function effectFrame(
  effect: ImageEffect | undefined,
  progress: number,
  naturalWidth = 1024,
): EffectFrame {
  const p = clamp01(progress);
  const none: EffectFrame = { blurPx: 0, scale: 1, blocks: null };
  switch (effect) {
    case 'blur':
      return { ...none, blurPx: BLUR_START_PX * (1 - p) };
    case 'zoom':
      return { ...none, scale: 1 + (ZOOM_START - 1) * (1 - p) };
    case 'pixelate': {
      if (p >= 1) return none;
      const max = Math.max(PIXELATE_START_BLOCKS, naturalWidth);
      const steps = Math.log2(max / PIXELATE_START_BLOCKS);
      const blocks = Math.round(PIXELATE_START_BLOCKS * 2 ** Math.floor(steps * p));
      return { ...none, blocks: blocks >= max ? null : blocks };
    }
    default:
      return none;
  }
}

/**
 * Zoom: the point the picture is zoomed on (percent, kept away from the edges so the zoomed
 * view isn't just a border). Derived from `seed` (picture URL + question) so a reload of the
 * host screen zooms on the same point.
 */
export function zoomOrigin(seed: string): { x: number; y: number } {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const a = (h >>> 0) % 1000;
  const b = Math.floor((h >>> 0) / 1000) % 1000;
  return { x: 25 + (a / 1000) * 50, y: 25 + (b / 1000) * 50 };
}
