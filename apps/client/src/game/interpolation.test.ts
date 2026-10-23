import { describe, expect, it } from 'vitest';
import { LOCAL_DELAY_MS, MAX_EXTRAPOLATION_MS, MotionTrack, REMOTE_DELAY_MS, REMOTE_EXTRA_MS, STALE_MS, clearPlayerTracks, playerTrack } from './interpolation';

/**
 * These tests pin the fix for "nhân vật bị giật khi đi bộ / khi phi hành": the server broadcasts a
 * position every 100 ms, so anything drawn straight from the packets moves in 0.6 m (walking) or
 * 1 m (flying) steps ten times a second. The track has to turn that staircase into a straight line.
 */
const FRAME = 1000 / 60;

/** Plays a 10 Hz snapshot stream through a track and returns what a 60 Hz renderer would draw. */
function render(samples: { t: number; x: number }[], frames: number, delay = LOCAL_DELAY_MS) {
  const track = new MotionTrack();
  const drawn: number[] = [];
  let next = 0;
  for (let frame = 0; frame < frames; frame++) {
    const t = frame * FRAME;
    while (next < samples.length && samples[next]!.t <= t) {
      track.push(samples[next]!.t, samples[next]!.x, 0);
      next++;
    }
    const point = track.at(t - delay);
    // The first frames are the warm-up before the delay has any history to read; a body that has
    // just spawned is allowed to sit still there.
    if (point && t > delay * 2) drawn.push(point.x);
  }
  return drawn;
}

const walking = (seconds: number, speed = 6) => Array.from({ length: Math.ceil(seconds * 10) + 1 },
  (_, i) => ({ t: i * 100, x: speed * (i * 100) / 1000 }));

describe('motion track: 10 Hz packets drawn at 60 Hz', () => {
  it('draws a walking body as a straight line instead of 0.6 m steps', () => {
    const drawn = render(walking(2), 120);
    const steps = drawn.slice(1).map((x, i) => x - drawn[i]!);
    const spread = Math.max(...steps) - Math.min(...steps);
    // Every frame moves the same ~0.1 m: this is what "smooth" means numerically.
    expect(spread).toBeLessThan(0.01);
    expect(Math.abs(steps[0]! - steps[60]!)).toBeLessThan(0.005);
  });

  it('draws a flying body just as smoothly even though its packets are 1 m apart', () => {
    const samples = walking(2, 10.5);
    const drawn = render(samples, 120);
    const steps = drawn.slice(1).map((x, i) => x - drawn[i]!);
    expect(Math.max(...steps) - Math.min(...steps)).toBeLessThan(0.02);
    // …where drawing the newest packet directly would have produced 1.05 m jumps and dead frames.
    const raw = samples.map((sample) => sample.x);
    const rawSteps = raw.slice(1).map((x, i) => x - raw[i]!);
    expect(Math.max(...rawSteps)).toBeGreaterThan(1);
    expect(Math.max(...steps)).toBeLessThan(0.25);
  });

  it('is continuous across packet boundaries — no jump at the moment a snapshot lands', () => {
    const drawn = render(walking(3), 180);
    const steps = drawn.slice(1).map((x, i) => x - drawn[i]!);
    // Second difference = acceleration. A staircase produces a spike of a whole packet here.
    const jerk = steps.slice(1).map((step, i) => Math.abs(step - steps[i]!));
    expect(Math.max(...jerk)).toBeLessThan(0.01);
  });

  it('stops where the body stopped instead of gliding on', () => {
    const samples = [...walking(1), { t: 1000, x: 6 }, { t: 1100, x: 6 }, { t: 1200, x: 6 }, { t: 1300, x: 6 }];
    const drawn = render(samples, 90);
    expect(Math.max(...drawn)).toBeLessThan(6 + MAX_EXTRAPOLATION_MS / 1000 * 6 + 0.001);
    // By the end of the render it is parked exactly on the stop position.
    expect(drawn.at(-1)).toBeCloseTo(6, 2);
  });

  it('holds still when packets stop arriving rather than drifting away', () => {
    const track = new MotionTrack();
    track.push(0, 0, 0);
    track.push(100, 6, 0);
    expect(track.at(150)!.x).toBeGreaterThan(6);
    const stale = track.at(100 + STALE_MS + 500)!;
    expect(stale.x).toBe(6);
  });

  it('never extrapolates further than its cap, and treats a teleport as a teleport', () => {
    const track = new MotionTrack();
    track.push(0, 0, 0);
    track.push(100, 0.6, 0); // walking at 6 m/s
    const far = track.at(100 + MAX_EXTRAPOLATION_MS + 150)!;
    expect(far.x).toBeCloseTo(0.6 + MAX_EXTRAPOLATION_MS / 1000 * 6, 5);
    // A velocity above the fastest mount is a position jump, not motion; it is clamped, then held.
    const fast = new MotionTrack();
    fast.push(0, 0, 0);
    fast.push(100, 60, 0);
    expect(fast.at(400)!.x).toBeCloseTo(60 + 14 * (MAX_EXTRAPOLATION_MS / 1000), 5);
  });

  it('does not interpolate across a teleport once it is reset', () => {
    const track = new MotionTrack();
    track.push(0, 0, 0);
    track.push(100, 0.6, 0);
    track.reset(110, 250, -80);
    expect(track.at(110)!.x).toBe(250);
    expect(track.at(120)!.x).toBe(250);
    track.push(200, 250.6, -80);
    expect(track.at(150)!.x).toBeGreaterThan(250);
    expect(track.at(150)!.x).toBeLessThan(251);
  });

  it('answers with the first sample before any time has passed and ignores duplicate timestamps', () => {
    const track = new MotionTrack();
    expect(track.at(0)).toBeNull();
    track.push(100, 3, 4);
    expect(track.at(0)).toEqual({ x: 3, z: 4 });
    track.push(100, 5, 6);
    expect(track.size).toBe(1);
    expect(track.at(100)).toEqual({ x: 5, z: 6 });
  });

  it('uses a longer delay for remote bodies, which is still monotone', () => {
    const drawn = render(walking(2), 120, REMOTE_DELAY_MS + REMOTE_EXTRA_MS);
    for (let i = 1; i < drawn.length; i++) expect(drawn[i]!).toBeGreaterThanOrEqual(drawn[i - 1]!);
  });

  it('sizes its playback delay from the measured packet interval', () => {
    const track = new MotionTrack();
    for (let i = 0; i < 12; i++) track.push(i * 100, i * 0.6, 0);
    // A steady 100 ms stream: enough delay to sit between two samples, not a fifth of a second.
    expect(track.delayMs).toBeGreaterThanOrEqual(LOCAL_DELAY_MS);
    expect(track.delayMs).toBeLessThan(170);
    // A slow stream (the server's cadence used to degenerate to 150 ms) gets a longer delay, so the
    // playback point never runs past the newest sample and has to guess.
    const slow = new MotionTrack();
    for (let i = 0; i < 12; i++) slow.push(i * 150, i * 0.9, 0);
    expect(slow.delayMs).toBeGreaterThan(track.delayMs);
    expect(slow.delayMs).toBeLessThanOrEqual(220);
  });

  it('never runs out of samples on a 150 ms cadence — no stall, no extrapolation jump', () => {
    // What the server actually did before the schedule was put on a fixed grid: a tick landing a few
    // milliseconds late pushed every snapshot out to 150 ms. At 10.5 m/s that is 1.6 m of guessing
    // per cycle, which is the "khựng" a rider felt.
    const speed = 10.5;
    const track = new MotionTrack();
    const drawn: number[] = [];
    let pushed = 0;
    for (let frame = 0; frame < 240; frame++) {
      const t = frame * FRAME;
      while (pushed * 150 <= t) { track.push(pushed * 150, speed * (pushed * 150) / 1000, 0); pushed++; }
      const point = track.at(t - track.delayMs);
      // The first second is the buffer filling up and the delay adapting; the body is not on screen yet.
      if (point && t > 1200) drawn.push(point.x);
    }
    const steps = drawn.slice(1).map((x, i) => x - drawn[i]!);
    const expected = speed / 60;
    expect(Math.max(...steps)).toBeLessThan(expected + 0.01);
    expect(Math.min(...steps)).toBeGreaterThan(expected - 0.01);
  });

  it('hands out one shared track per body and forgets them on a zone change', () => {
    clearPlayerTracks();
    const track = playerTrack('p1');
    expect(playerTrack('p1')).toBe(track);
    track.push(0, 1, 1);
    clearPlayerTracks();
    expect(playerTrack('p1').size).toBe(0);
  });
});
