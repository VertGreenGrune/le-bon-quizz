/**
 * Zoom / pan of the « point sur l'image » picture on the phone. The picture is scaled by `scale`
 * from its top left corner then moved by (`x`, `y`) pixels, inside a viewport of its own size.
 */
export interface View {
  scale: number;
  x: number;
  y: number;
}

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
export const IDENTITY: View = { scale: 1, x: 0, y: 0 };

/** Keeps the zoomed picture covering the whole viewport (no empty border). */
export function clampView(v: View, width: number, height: number): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale));
  const clamp = (pos: number, size: number) => Math.min(0, Math.max(size - size * scale, pos));
  return { scale, x: clamp(v.x, width), y: clamp(v.y, height) };
}

/** New scale, keeping the picture point under (`cx`, `cy`) (viewport pixels) in place. */
export function zoomAt(
  v: View,
  scale: number,
  cx: number,
  cy: number,
  width: number,
  height: number,
): View {
  const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
  const px = (cx - v.x) / v.scale;
  const py = (cy - v.y) / v.scale;
  return clampView({ scale: s, x: cx - px * s, y: cy - py * s }, width, height);
}
