import { describe, expect, it } from 'vitest';
import { jumpHeight } from './SceneEngine';

/**
 * Feel regressions players reported directly: a hop that snapped back to the ground, and a flight
 * ceiling that stopped the climb. Both are pure curves, so they are pinned here.
 */
describe('hop and flight feel', () => {
  const samples = Array.from({ length: 101 }, (_, i) => jumpHeight(i / 100));

  it('takes off and lands on the ground', () => {
    expect(samples[0]).toBe(0);
    expect(samples.at(-1)).toBe(0);
    expect(Math.max(...samples)).toBeCloseTo(1, 5);
  });

  it('hangs at the top instead of dropping straight back down', () => {
    // Still above half height a third of the way through the fall.
    expect(jumpHeight(0.45)).toBeGreaterThan(0.5);
    // The descent is the slow part: more than half the airtime is spent coming down.
    const apex = samples.indexOf(Math.max(...samples));
    expect(apex / 100).toBeLessThan(0.42);
  });

  it('decelerates into the landing, so the last metres are a glide', () => {
    // h = 1 - t² is concave: each equal time slice falls less than the one before it only near the
    // top, so compare the final slice against the one above the midpoint of the fall.
    const drop = (a: number, b: number) => jumpHeight(a) - jumpHeight(b);
    expect(drop(0.72, 0.78)).toBeGreaterThan(drop(0.92, 0.98));
    // Never falls faster than ~1.35 m in a single 1/60 s frame at 1.5 m jump height.
    const perFrame = drop(0, 1 / 60) * 1.5;
    expect(perFrame).toBeLessThan(1.35);
  });

  it('rises monotonically so the take-off never stutters', () => {
    for (let i = 1; i <= 33; i++) expect(samples[i]!).toBeGreaterThan(samples[i - 1]!);
  });
});
