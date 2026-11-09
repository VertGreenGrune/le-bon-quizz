import { describe, expect, it } from 'vitest';
import { MOVING_SPEED, buttonSize, initialBodies, step, type Arena } from './movingPhysics';

const arena: Arena = { width: 360, height: 560, ...buttonSize(360, 560) };
const seeded = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

describe('Brouilleur moving buttons', () => {
  it('starts in the 2 × 2 grid places, inside the arena, at the medium speed', () => {
    const bodies = initialBodies([0, 1, 2, 3], arena, seeded([0.1, 0.5, 0.6, 0.2, 0.9, 0.7]));
    expect(bodies.map((b) => b.index)).toEqual([0, 1, 2, 3]);
    for (const b of bodies) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x).toBeLessThanOrEqual(arena.width - arena.w);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeLessThanOrEqual(arena.height - arena.h);
      const speed = Math.hypot(b.vx, b.vy);
      expect(speed).toBeGreaterThan(MOVING_SPEED * 360 * 0.84); // ± 15 %
      expect(speed).toBeLessThan(MOVING_SPEED * 360 * 1.16);
      expect(speed).toBeCloseTo(b.speed!);
      expect(Math.abs(b.vx)).toBeGreaterThan(0);
      expect(Math.abs(b.vy)).toBeGreaterThan(0);
    }
    expect(bodies[0]!.x).toBeLessThan(bodies[1]!.x); // left / right column
    expect(bodies[0]!.y).toBeLessThan(bodies[2]!.y); // top / bottom row
  });

  it('really moves, never leaves the arena, keeps its speed after bounces', () => {
    const bodies = initialBodies([0, 1, 2, 3], arena, seeded([0.13, 0.8, 0.42, 0.27, 0.66]));
    const start = bodies.map((b) => ({ x: b.x, y: b.y }));
    for (let i = 0; i < 60 * 20; i++) {
      step(bodies, arena, 1 / 60);
      for (const b of bodies) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x).toBeLessThanOrEqual(arena.width - arena.w + 1e-9);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeLessThanOrEqual(arena.height - arena.h + 1e-9);
      }
      if (i === 30)
        bodies.forEach((b, j) =>
          expect(Math.hypot(b.x - start[j]!.x, b.y - start[j]!.y)).toBeGreaterThan(20),
        );
    }
    for (const b of bodies) expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(b.speed!);
  });

  it('bounces off the walls', () => {
    const [b] = initialBodies([0], arena, seeded([0]));
    b!.x = arena.width - arena.w - 1;
    b!.vx = 200;
    b!.speed = undefined;
    step([b!], arena, 0.02);
    expect(b!.x).toBe(arena.width - arena.w);
    expect(b!.vx).toBe(-200);
  });

  it('two buttons running into each other bounce apart', () => {
    const a = { index: 0, x: 20, y: 100, vx: 150, vy: 0 };
    const b = { index: 1, x: 20 + arena.w - 2, y: 100, vx: -150, vy: 0 };
    step([a, b], arena, 0.01);
    expect(a.vx).toBeLessThan(0);
    expect(b.vx).toBeGreaterThan(0);
    expect(b.x - a.x).toBeGreaterThanOrEqual(arena.w - 1e-9);
  });

  it('a slow frame does not teleport the buttons', () => {
    const a = { index: 0, x: 50, y: 50, vx: 150, vy: 150 };
    step([a], arena, 5);
    expect(a.x).toBeCloseTo(50 + 150 * 0.05);
  });
});
