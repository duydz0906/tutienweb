/**
 * Vertical flight motion — one small integrator shared by take-off, hovering and landing.
 *
 * Every complaint about flying so far has come from the same place: the height was written
 * directly from the input (`altitude += climb * dt`, or `altitude = max(altitude, hover)` on
 * take-off, or `altitude -= glide * dt` on landing). Those are three different, discontinuous
 * rules, so the rider was teleported up to the hover height on take-off and then *stepped* down
 * whenever the mount vanished.
 *
 * This module replaces the three rules with one: the height is the integral of a vertical
 * velocity, and the velocity may only change so fast (an acceleration limit). That makes every
 * transition — take off, release Space, hold Shift, dismount at 900 m, touch down — continuous in
 * both position and speed, which is what "mượt" actually means here.
 *
 * The descent speed is proportional to the height left above the ground, plus the contact speed:
 * `v(h) = touchdownSpeed + gain · h` (capped at the terminal speed). That is the classic smooth
 * landing curve — proportional control, no snap, and it arrives at `touchdownSpeed` exactly, so
 * two metres and nine hundred metres use one formula and both land like a feather.
 */

export type FlightState = { altitude: number; velocity: number };
export type FlightInput = { flying: boolean; climb: number; hover: number };
export type FlightStep = FlightState & { landed: boolean };

export const FLIGHT = {
  /** Climb rate while Space is held, in m/s. */
  climbRate: 7.5,
  /** Fastest free glide once the mount is gone, in m/s. */
  maxDescent: 80,
  /** Descent per metre of remaining height, in 1/s: the shape of the landing curve. */
  descentGain: 2.5,
  /** Contact speed. Low enough that the last frame is a step down, not an impact. */
  touchdownSpeed: 0.9,
  /** Vertical acceleration limits: the velocity may never change faster than this. */
  accelUp: 26,
  accelDown: 24,
  /** The ease towards the mount's hover height: gain in 1/s, capped in m/s. */
  hoverGain: 1.8,
  hoverRate: 3.4,
  /** Shift descends this fraction of the free-fall curve — fast from altitude, soft on the floor. */
  shiftScale: 0.62,
  /**
   * The braking ceiling of the curve is built from this fraction of the acceleration limit. The
   * curve then needs a little less deceleration than the integrator can supply, so the speed can
   * follow it without ever being clamped — a clamp is a visible hitch.
   */
  curveMargin: 0.85,
  /** No ceiling, only the camera's far plane; this is the same clamp the engine applies. */
  maxAltitude: 900,
} as const;

/**
 * Descent speed for a given height above the ground. `max` is the terminal speed of that mode.
 *
 * Two curves, whichever is lower: the proportional landing curve `vt + gain·h`, which arrives at
 * the contact speed smoothly, and the fastest speed from which the acceleration limit can still
 * shed the momentum in the height left, `√(vt² + 2·a·h)`. Without the second one a fall from
 * cloud height would carry its terminal speed into the last thirty metres and slam down; without
 * the first one a low dismount would crawl down. Together they give one formula for every height.
 */
export function landingSpeed(height: number, max: number = FLIGHT.maxDescent): number {
  const h = Math.max(0, height);
  const glide = FLIGHT.touchdownSpeed + FLIGHT.descentGain * h;
  const feasible = Math.sqrt(FLIGHT.touchdownSpeed ** 2 + 2 * FLIGHT.accelDown * FLIGHT.curveMargin * h);
  return Math.min(max, glide, feasible);
}

/** One frame of vertical flight. Pure, so the feel can be pinned by tests instead of by eye. */
export function stepFlight(state: FlightState, dt: number, input: FlightInput): FlightStep {
  const step = Math.min(0.05, Math.max(dt, 0));
  const altitude = Math.max(0, Math.min(FLIGHT.maxAltitude, state.altitude));
  const velocity = state.velocity;
  let target = 0;
  let accel: number = FLIGHT.accelUp;
  if (!input.flying || input.climb < 0) {
    // Descending towards the ground. The profile is the speed the rider is allowed to have at this
    // height and it is built to be reachable, so the speed chases it within the acceleration limit
    // and lands on the contact speed exactly — whether the fall started at 2 m or 900 m.
    const max = input.flying ? FLIGHT.maxDescent * FLIGHT.shiftScale : FLIGHT.maxDescent;
    target = -landingSpeed(altitude, max) * (input.flying ? Math.min(1, -input.climb) : 1);
    accel = FLIGHT.accelDown;
  } else if (input.climb > 0) {
    target = FLIGHT.climbRate * Math.min(1, input.climb);
  } else if (altitude < input.hover - 0.001) {
    // Take-off and every "I am below the mount" case: ease up, never assign the height.
    target = Math.min(FLIGHT.hoverRate, (input.hover - altitude) * FLIGHT.hoverGain);
  } // else: above the hover height with no key held — hold it, never sink
  if (altitude <= 0 && target < 0) target = 0;

  const nextVelocity = velocity + Math.max(-accel * step, Math.min(accel * step, target - velocity));
  if (altitude <= 0 && nextVelocity <= 0) return { altitude: 0, velocity: 0, landed: false };
  const next = altitude + nextVelocity * step;
  if (next <= 0) {
    // Touchdown: reported once so the scene can play the landing effect, and the next frame starts
    // from rest instead of pushing into the floor.
    return { altitude: 0, velocity: 0, landed: true };
  }
  return { altitude: Math.min(FLIGHT.maxAltitude, next), velocity: nextVelocity, landed: false };
}
