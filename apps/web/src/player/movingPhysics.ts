/**
 * Brouilleur (🌀): the shape buttons drift around the answer area, bouncing off its edges and
 * off each other, at a medium speed — hard (not impossible) to tap the right one. Pure physics,
 * no DOM: `MovingButtons` (MovingButtons.tsx) moves the buttons with these positions.
 */

export interface Body {
  /** Choice index (shape) of this button. */
  index: number;
  /** Top-left corner, in px inside the arena. */
  x: number;
  y: number;
  /** Velocity in px / s. */
  vx: number;
  vy: number;
  /** Its own constant speed, px / s (kept after bounces so no button ends up crawling). */
  speed?: number;
}

export interface Arena {
  /** Arena size, px. */
  width: number;
  height: number;
  /** Button size, px. */
  w: number;
  h: number;
}

/** Speed as a share of the arena's smaller side per second (~235 px/s on a phone; T66: faster). */
export const MOVING_SPEED = 0.65;
/** Longest step simulated at once (a background tab, a slow frame): no teleporting. */
const MAX_STEP_S = 0.05;

/** Button size for an arena: ~2 columns × 4 rows worth, so they have room to move. */
export function buttonSize(width: number, height: number): { w: number; h: number } {
  return { w: Math.round(width * 0.42), h: Math.round(Math.min(height * 0.2, width * 0.42)) };
}

/**
 * Starting layout: the usual 2 × 2 grid places (so the first frame looks familiar), each button
 * flying off in its own random direction at the medium speed (± 15 %).
 */
export function initialBodies(
  indexes: number[],
  arena: Arena,
  random: () => number = Math.random,
): Body[] {
  const speed = MOVING_SPEED * Math.min(arena.width, arena.height);
  const cols = 2;
  const rows = Math.max(1, Math.ceil(indexes.length / cols));
  return indexes.map((index, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = ((col + 0.5) / cols) * arena.width;
    const cy = ((row + 0.5) / rows) * arena.height;
    const angle = random() * Math.PI * 2;
    const v = speed * (0.85 + random() * 0.3);
    const dx = withMin(Math.cos(angle));
    const dy = withMin(Math.sin(angle));
    const norm = Math.hypot(dx, dy);
    return {
      index,
      x: clamp(cx - arena.w / 2, 0, arena.width - arena.w),
      y: clamp(cy - arena.h / 2, 0, arena.height - arena.h),
      // Never almost horizontal / vertical: they would slide along an edge.
      vx: (v * dx) / norm,
      vy: (v * dy) / norm,
      speed: v,
    };
  });
}

/** Moves every body by `dt` seconds (in place): walls, then button-on-button bounces. */
export function step(bodies: Body[], arena: Arena, dt: number): void {
  const t = Math.min(Math.max(dt, 0), MAX_STEP_S);
  const maxX = Math.max(0, arena.width - arena.w);
  const maxY = Math.max(0, arena.height - arena.h);
  for (const b of bodies) {
    b.x += b.vx * t;
    b.y += b.vy * t;
    if (b.x < 0) [b.x, b.vx] = [0, Math.abs(b.vx)];
    else if (b.x > maxX) [b.x, b.vx] = [maxX, -Math.abs(b.vx)];
    if (b.y < 0) [b.y, b.vy] = [0, Math.abs(b.vy)];
    else if (b.y > maxY) [b.y, b.vy] = [maxY, -Math.abs(b.vy)];
  }
  for (let i = 0; i < bodies.length; i++)
    for (let j = i + 1; j < bodies.length; j++) collide(bodies[i]!, bodies[j]!, arena, maxX, maxY);
  for (const b of bodies) {
    const v = Math.hypot(b.vx, b.vy);
    if (b.speed && v > 0) [b.vx, b.vy] = [(b.vx * b.speed) / v, (b.vy * b.speed) / v];
  }
}

/** Two overlapping buttons: pushed apart on the shallow axis, speeds swapped on it. */
function collide(a: Body, b: Body, arena: Arena, maxX: number, maxY: number) {
  const overlapX = arena.w - Math.abs(a.x - b.x);
  const overlapY = arena.h - Math.abs(a.y - b.y);
  if (overlapX <= 0 || overlapY <= 0) return;
  if (overlapX < overlapY) {
    const dir = a.x < b.x ? -1 : 1;
    a.x = clamp(a.x + (dir * overlapX) / 2, 0, maxX);
    b.x = clamp(b.x - (dir * overlapX) / 2, 0, maxX);
    if ((b.vx - a.vx) * dir > 0) [a.vx, b.vx] = [b.vx, a.vx];
  } else {
    const dir = a.y < b.y ? -1 : 1;
    a.y = clamp(a.y + (dir * overlapY) / 2, 0, maxY);
    b.y = clamp(b.y - (dir * overlapY) / 2, 0, maxY);
    if ((b.vy - a.vy) * dir > 0) [a.vy, b.vy] = [b.vy, a.vy];
  }
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), Math.max(min, max));
}

/** Keeps a direction component at least 0.35 in size (same sign). */
function withMin(c: number) {
  return Math.sign(c || 1) * Math.max(Math.abs(c), 0.35);
}
