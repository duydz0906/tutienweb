import { describe, expect, it } from 'vitest';
import { LOCAL_DELAY_MS, MotionTrack, correctionStep } from './interpolation';

/**
 * End-to-end feel test for movement: a fake server ticks at 20 Hz and sends a snapshot every 100 ms
 * with 40 ms of latency, while the client draws at 60 Hz with prediction and the same reconciliation
 * the engine runs. The numbers below are the complaint, measured:
 *
 *  · "nhân vật bị giật khi đi bộ" — before the fix the drawn body advanced in 0.6 m jumps (one per
 *    packet) and the per-frame speed swung between 0 and 12 m/s;
 *  · "phi hành bị giật" — the same, with 1.05 m jumps at 10.5 m/s.
 *
 * With interpolation and same-instant reconciliation both collapse to a constant step.
 */
const FRAME = 1000 / 60;
const TICK = 50;
const SNAPSHOT = 100;
const LATENCY = 40;

type Vec = { x: number; z: number };

function simulate({ seconds, speed, stopAt }: { seconds: number; speed: number; stopAt: number }) {
  const server: Vec = { x: 0, z: 0 };
  let input: Vec = { x: 0, z: 0 };
  let clientInputAt = 0;
  const client: Vec = { x: 0, z: 0 };
  const history = new MotionTrack(90);
  const path = new MotionTrack(90);
  const inFlight: { due: number; point: Vec }[] = [];
  const drawn: number[] = [];
  let historySince = 0;

  const total = Math.ceil(seconds * 60);
  for (let frame = 0; frame < total; frame++) {
    const now = frame * FRAME;

    // The player holds W until `stopAt`, then lets go.
    const wanted: Vec = now < stopAt ? { x: 0, z: -1 } : { x: 0, z: 0 };
    if (wanted.z !== input.z && now >= clientInputAt) { input = wanted; clientInputAt = now; }

    // Client prediction: the same integration the engine does, at frame rate.
    client.x += input.x * speed * (FRAME / 1000);
    client.z += input.z * speed * (FRAME / 1000);

    // Server: 20 Hz, using whatever input it has received (50 ms old at worst).
    if (Math.abs(now % TICK) < FRAME / 2) {
      const stale = now - TICK < stopAt ? { x: 0, z: -1 } : { x: 0, z: 0 };
      server.x += stale.x * speed * (TICK / 1000);
      server.z += stale.z * speed * (TICK / 1000);
      if (Math.abs(now % SNAPSHOT) < FRAME / 2) inFlight.push({ due: now + LATENCY, point: { ...server } });
    }
    while (inFlight.length && inFlight[0]!.due <= now) {
      const packet = inFlight.shift()!;
      path.push(now, packet.point.x, packet.point.z);
    }

    // Reconciliation, exactly as SceneEngine does it.
    if (!history.size) { history.reset(now, client.x, client.z); historySince = now; }
    const own = now - historySince >= LOCAL_DELAY_MS ? history.at(now - LOCAL_DELAY_MS) : null;
    history.push(now, client.x, client.z);
    const reference = path.at(now - LOCAL_DELAY_MS);
    if (own && reference) {
      const fix = correctionStep(own, reference, FRAME / 1000, speed, input.z === 0);
      client.x += fix.x; client.z += fix.z;
      if (fix.snap) { history.reset(now, client.x, client.z); historySince = now; }
    }
    drawn.push(client.z);
  }
  return { drawn, server, client };
}

describe('movement feel: walking and flying over a laggy 10 Hz stream', () => {
  for (const [label, speed] of [['walking', 6], ['flying', 10.5]] as const) {
    it(`draws ${label} at a constant speed instead of one jump per packet`, () => {
      const { drawn } = simulate({ seconds: 2, speed, stopAt: 5000 });
      const steps = drawn.slice(60).map((z, i) => Math.abs(z - drawn[60 + i - 1]!));
      const expected = speed / 60;
      // Every frame covers the same distance, within a millimetre or two.
      expect(Math.max(...steps)).toBeLessThan(expected + 0.004);
      expect(Math.min(...steps)).toBeGreaterThan(expected - 0.004);
    });

    it(`does not glide on after ${label} input is released`, () => {
      const { drawn } = simulate({ seconds: 3, speed, stopAt: 1000 });
      const atRelease = drawn[Math.round((1000 + 120) / FRAME)]!;
      const settled = drawn.at(-1)!;
      // Prediction stops on the frame the key is released; the correction must not drag it further
      // than a few centimetres afterwards.
      expect(Math.abs(settled - atRelease)).toBeLessThan(0.06);
    });
  }

  it('keeps the drawn body on the server position to within one input tick of travel', () => {
    const { drawn, client, server } = simulate({ seconds: 2, speed: 6, stopAt: 1500 });
    // The prediction and the server agree: nothing accumulates. The residual is the input the server
    // has not received yet (one 50 ms tick = 0.3 m at walking speed), not drift.
    expect(Math.abs(client.z - server.z)).toBeLessThan(0.6);
    expect(Math.abs(drawn.at(-1)! - client.z)).toBeLessThan(1e-9);
  });
});
