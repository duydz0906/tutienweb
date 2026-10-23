import { describe, expect, it } from 'vitest';
import { WALK_SPEED, resolveMove, type GameScene } from '@van-thuong/shared';
import { LOCAL_DELAY_MS, LocalReconciler, MotionTrack, reconcileStep } from './interpolation';

/**
 * End-to-end feel test for movement: a fake authoritative server (20 Hz integration, 10 Hz snapshots,
 * network latency in both directions) and a client that predicts at 60 Hz with the same
 * `resolveMove` the server uses, reconciled the way the engine reconciles.
 *
 * These numbers are the player's complaint, measured:
 *  · "giật" — the drawn body must advance by the same distance every frame;
 *  · "trôi" — it must not keep sliding after the input stops, and corrections must never drag it.
 */
const FRAME = 1000 / 60;
const TICK = 50;
const SNAPSHOT = 100;

type Vec = { x: number; z: number };

type SimOptions = {
  seconds: number;
  speed: number;
  latency: number;
  /** Direction asked for at a given time; ±1 in z, 0 to stand still. */
  input: (now: number) => number;
  /** Stop the body at this z on the server (a wall the server refuses to let it pass). */
  wallAt?: number;
  /** Whether the client predicts that wall too (`resolveMove` does this for sect buildings). */
  clientWalls?: boolean;
  scene?: GameScene;
};

function simulate({ seconds, speed, latency, input, wallAt, clientWalls = true, scene = 'wilderness' }: SimOptions) {
  let serverZ = 0;
  let clientZ = 0;
  let clientDir = 0;
  let lastSentAt = -1e9;
  let serverDir = 0;
  let serverLastInputAt = -1e9;
  const upstream: { due: number; dir: number }[] = [];
  const downstream: { due: number; z: number }[] = [];
  const path = new MotionTrack(60);
  const reconciler = new LocalReconciler();
  let lastTick = 0;
  let lastSnapshot = 0;
  const drawn: number[] = [];
  let serverBlocked = 0;

  for (let frame = 0; frame < seconds * 60; frame++) {
    const now = frame * FRAME;
    const want = input(now);
    // The client sends its steering 20 times a second, as the real one does.
    if (now - lastSentAt >= 50) { upstream.push({ due: now + latency, dir: want }); lastSentAt = now; }
    clientDir = want;

    // Client prediction, with the server's collision rule (and the hold, like the engine).
    if (!reconciler.held) {
      const predicted = resolveMove({ x: 0, y: 0, z: clientZ },
        { x: 0, y: 0, z: clientZ + clientDir * speed * (FRAME / 1000) },
        { scene, collide: true });
      let nextClientZ = predicted.z;
      if (clientWalls && wallAt !== undefined && nextClientZ > wallAt) nextClientZ = wallAt;
      clientZ = nextClientZ;
    }

    if (now - lastTick >= TICK) {
      const dt = (now - lastTick) / 1000;
      lastTick = now;
      if (now - serverLastInputAt <= 400) {
        const before = serverZ;
        serverZ += serverDir * speed * dt;
        if (wallAt !== undefined && serverZ > wallAt && wallAt >= before) serverZ = wallAt;
        if (serverZ === before && serverDir !== 0) serverBlocked++;
      }
      if (now - lastSnapshot >= SNAPSHOT) { lastSnapshot = now; downstream.push({ due: now + latency, z: serverZ }); }
    }
    while (upstream.length && upstream[0]!.due <= now) { serverDir = upstream.shift()!.dir; serverLastInputAt = now; }
    while (downstream.length && downstream[0]!.due <= now) { const packet = downstream.shift()!; path.push(now, 0, packet.z); }

    const fix = reconciler.step(now, { x: 0, z: clientZ }, FRAME / 1000, speed,
      path.at(now - LOCAL_DELAY_MS), clientDir === 0);
    clientZ += fix.z;
    drawn.push(clientZ);
  }
  return { drawn, serverZ, clientZ, serverBlocked };
}

const movingFrames = (drawn: number[], from: number, to: number) => drawn.slice(from, to);

describe('movement feel: 6 m/s walk and 10.5 m/s flight over a laggy 10 Hz stream', () => {
  for (const [label, speed] of [['walking', WALK_SPEED], ['flying', 10.5]] as const) {
    it(`draws ${label} at a constant speed, with no correction fighting the input`, () => {
      for (const latency of [20, 60, 110]) {
        const { drawn } = simulate({ seconds: 3, speed, latency, input: () => 1 });
        const sample = movingFrames(drawn, 60, 170);
        const steps = sample.slice(1).map((z, i) => z - sample[i]!);
        const expected = speed / 60;
        // Every frame covers the same distance: no jitter, and no drag either (the mean is full speed).
        expect(Math.max(...steps)).toBeLessThan(expected + 0.006);
        expect(Math.min(...steps)).toBeGreaterThan(expected - 0.006);
      }
    });

    it(`stops ${label} on the frame the key is released and never slides afterwards`, () => {
      const stopAt = 1200;
      const { drawn } = simulate({ seconds: 3, speed, latency: 60, input: (now) => (now < stopAt ? 1 : 0) });
      const atStop = drawn[Math.round(stopAt / FRAME) + 1]!;
      const settled = drawn.at(-1)!;
      expect(Math.abs(settled - atStop)).toBeLessThan(0.02);
    });
  }

  it('stops at a wall in the same place as the server, because both use one rule', () => {
    const wallAt = 6;
    const { drawn, serverZ, clientZ } = simulate({ seconds: 4, speed: WALK_SPEED, latency: 70,
      input: () => 1, wallAt });
    expect(serverZ).toBe(wallAt);
    // Client-side prediction uses `resolveMove`, so it is *identical* — not merely close.
    expect(clientZ).toBe(wallAt);
    // It arrives and holds: nothing rattles back and forth against the wall.
    const parked = drawn.slice(-60);
    expect(Math.max(...parked) - Math.min(...parked)).toBeLessThan(0.02);
  });

  it('pulls a body that predicted too far back to the server without oscillating', () => {
    // The safety net for anything the client cannot know (a monster that appeared, a closed gate):
    // the body slides back at the capped catch-up speed and settles exactly on the server's spot.
    const wallAt = 6;
    const { drawn, serverZ, clientZ } = simulate({ seconds: 5, speed: WALK_SPEED, latency: 70,
      input: () => 1, wallAt, clientWalls: false });
    expect(serverZ).toBe(wallAt);
    // Never snapped (it is well inside the snap distance) — it eased back towards the server.
    expect(clientZ).toBeGreaterThan(wallAt);
    // …and it ends up parked just in front of the wall, smoothly: the last second has no jumps.
    const parked = drawn.slice(-60);
    expect(Math.max(...parked) - Math.min(...parked)).toBeLessThan(0.05);
    expect(clientZ - wallAt).toBeLessThan(1.6);
  });

  it('still recovers when the server teleports the body', () => {
    const path = new MotionTrack(60);
    const history = new MotionTrack(240);
    const now = 5000;
    path.reset(now - LOCAL_DELAY_MS, 0, 0);
    history.reset(now - 500, 0, 40);
    const own = history.at(now - LOCAL_DELAY_MS) ?? { x: 0, z: 40 };
    const fix = reconcileStep(own, { x: 0, z: 0 }, FRAME / 1000, WALK_SPEED);
    expect(fix.snap).toBe(true);
    expect(fix.z).toBeCloseTo(-40, 5);
  });
});
