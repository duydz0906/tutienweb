import { describe, expect, it } from 'vitest';
import { FLIGHT, landingSpeed, stepFlight, type FlightState } from './flight';

/**
 * The flight integrator is a pure function, so the feel that used to be reported by eye — "it pops
 * up on take-off", "it snaps down when landing", "dismounting at altitude is a drop" — is pinned
 * here as numeric limits instead.
 */
const FRAME = 1 / 60;

/** Runs the integrator and records every frame, which is what the assertions need. */
function run(state: FlightState, frames: number, input: (frame: number, state: FlightState) => Parameters<typeof stepFlight>[2]) {
  const trail: (FlightState & { landed: boolean; delta: number; velocityDelta: number })[] = [];
  let current = { ...state };
  for (let frame = 0; frame < frames; frame++) {
    const previous = current;
    const next = stepFlight(previous, FRAME, input(frame, previous));
    trail.push({ ...next, delta: Math.abs(next.altitude - previous.altitude),
      velocityDelta: Math.abs(next.velocity - previous.velocity) });
    current = next;
  }
  return trail;
}

describe('flight: take-off, hover and descent', () => {
  it('lifts off continuously onto the hover height instead of popping there', () => {
    const trail = run({ altitude: 0, velocity: 0 }, 240, () => ({ flying: true, climb: 0, hover: 1.9 }));
    // No single 60 Hz frame may move more than a centimetre or two: that is a lift, not a teleport.
    expect(Math.max(...trail.map((frame) => frame.delta))).toBeLessThan(0.06);
    // It settles on the hover height without overshooting into a bounce.
    expect(Math.max(...trail.map((frame) => frame.altitude))).toBeLessThan(2.05);
    expect(trail.at(-1)!.altitude).toBeCloseTo(1.9, 1);
    expect(trail.at(-1)!.velocity).toBeCloseTo(0, 1);
  });

  it('never changes vertical speed faster than its own acceleration limit', () => {
    // Climb, release, hold Shift, then dismount: the worst case for a discontinuous rule.
    const trail = run({ altitude: 0, velocity: 0 }, 600, (frame) => ({
      flying: frame < 300, climb: frame < 120 ? 1 : frame < 200 ? 0 : -1, hover: 1.9,
    }));
    for (const frame of trail) {
      // Touchdown zeroes the speed while the height is already 0 — the position stays continuous,
      // so it is the one place a velocity step is allowed (it is the impact, not a motion pop).
      if (frame.landed) continue;
      expect(frame.velocityDelta).toBeLessThanOrEqual(Math.max(FLIGHT.accelUp, FLIGHT.accelDown) * FRAME + 1e-9);
    }
  });

  it('descends from the ceiling in a braking curve and touches down at a walking pace', () => {
    const trail = run({ altitude: FLIGHT.maxAltitude, velocity: 0 }, 60 * 40, () => (
      { flying: false, climb: 0, hover: 1.9 }));
    const glide = trail.filter((frame) => frame.altitude > 0);
    // Monotone: a glide never rises.
    for (let i = 1; i < glide.length; i++) expect(glide[i]!.altitude).toBeLessThanOrEqual(glide[i - 1]!.altitude);
    // Terminal speed is capped, so 900 m does not become a 900 m instant drop…
    expect(Math.max(...glide.map((frame) => -frame.velocity))).toBeLessThanOrEqual(FLIGHT.maxDescent + 1e-6);
    // …and the last metre is slower than the first, i.e. it flares instead of slamming down.
    const last = glide.at(-1)!;
    expect(Math.abs(last.velocity)).toBeLessThanOrEqual(FLIGHT.touchdownSpeed + 0.15);
    expect(last.delta).toBeLessThan(0.02);
    // It reports the touchdown exactly once, and the frame after it is at rest.
    expect(trail.filter((frame) => frame.landed)).toHaveLength(1);
    expect(trail.at(-1)!.altitude).toBe(0);
    // Sanity on the pacing: long enough to read as a glide, short enough not to be punished.
    const seconds = glide.length * FRAME;
    expect(seconds).toBeGreaterThan(6);
    expect(seconds).toBeLessThan(30);
  });

  it('lands softly from a low hover — the ordinary dismount', () => {
    const trail = run({ altitude: 2.1, velocity: 0 }, 60 * 4, () => ({ flying: false, climb: 0, hover: 1.9 }));
    const glide = trail.filter((frame) => frame.altitude > 0);
    expect(glide.length * FRAME).toBeLessThan(3);
    expect(Math.abs(glide.at(-1)!.velocity)).toBeLessThanOrEqual(FLIGHT.touchdownSpeed + 0.15);
    expect(Math.max(...glide.map((frame) => frame.delta))).toBeLessThan(0.1);
  });

  it('Shift descends quickly from altitude and still lands softly', () => {
    const high = landingSpeed(300, FLIGHT.maxDescent * FLIGHT.shiftScale);
    expect(high).toBeGreaterThan(FLIGHT.touchdownSpeed * 4);
    expect(high).toBeLessThanOrEqual(FLIGHT.maxDescent * FLIGHT.shiftScale + 1e-6);
    const trail = run({ altitude: 300, velocity: 0 }, 60 * 40, () => ({ flying: true, climb: -1, hover: 1.9 }));
    const glide = trail.filter((frame) => frame.altitude > 0);
    expect(glide.length * FRAME).toBeLessThan(25);
    expect(Math.abs(glide.at(-1)!.velocity)).toBeLessThanOrEqual(FLIGHT.touchdownSpeed + 0.15);
    expect(Math.min(...trail.map((frame) => frame.altitude))).toBe(0);
  });

  it('catches a free fall mid-air without a jump when the rider mounts again', () => {
    // Dismount at 120 m, fall for a second, then remount: the fall must be arrested smoothly and
    // the rider held where they were — no teleport back to the mount's hover height.
    const falling = run({ altitude: 120, velocity: 0 }, 60, () => ({ flying: false, climb: 0, hover: 1.9 }));
    const caught = falling.at(-1)!;
    expect(caught.velocity).toBeLessThan(-10);
    const trail = run(caught, 120, () => ({ flying: true, climb: 0, hover: 1.9 }));
    const lowest = Math.min(...trail.map((frame) => frame.altitude));
    // It keeps sinking for a moment (momentum is real) but only by the distance it needs to stop.
    expect(lowest).toBeLessThan(caught.altitude);
    expect(caught.altitude - lowest).toBeLessThan(Math.abs(caught.velocity) ** 2 / (2 * FLIGHT.accelUp) + 1);
    // Then it holds still: no creep, no snap, and it never rises back to the hover height.
    expect(trail.at(-1)!.velocity).toBeCloseTo(0, 2);
    expect(trail.at(-1)!.altitude).toBeGreaterThan(FLIGHT.touchdownSpeed);
    expect(trail.at(-1)!.altitude).toBeLessThan(caught.altitude);
  });

  it('descent speed grows with height and settles at the contact speed on the ground', () => {
    expect(landingSpeed(0)).toBe(FLIGHT.touchdownSpeed);
    expect(landingSpeed(-5)).toBe(FLIGHT.touchdownSpeed);
    expect(landingSpeed(1)).toBeLessThan(landingSpeed(10));
    expect(landingSpeed(10)).toBeLessThan(landingSpeed(100));
    expect(landingSpeed(10_000)).toBeCloseTo(FLIGHT.maxDescent, 5);
    // The curve is the same shape in every mode, only its ceiling moves.
    expect(landingSpeed(10_000, FLIGHT.maxDescent * 0.5)).toBeCloseTo(FLIGHT.maxDescent * 0.5, 5);
    // It never speeds up as the ground gets closer, and it grows strictly at the heights where a
    // landing actually happens.
    for (let h = 0.5; h < 40; h += 0.5) expect(landingSpeed(h)).toBeGreaterThanOrEqual(landingSpeed(h - 0.5));
    for (let h = 1; h <= 10; h++) expect(landingSpeed(h)).toBeGreaterThan(landingSpeed(h - 1));
  });
});
