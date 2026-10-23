/**
 * Turning 10 Hz snapshots into 60 Hz motion.
 *
 * The server integrates movement on a 50 ms tick and broadcasts a position every 100 ms. Whatever
 * the client does with those numbers, the *inputs* arrive as steps: a body that is drawn at the
 * latest snapshot walks in 0.6 m jumps ten times a second, and one that is smoothed towards the
 * latest snapshot speeds up and slows down every time a packet lands — the "giật" players report
 * while walking, and worse while flying (10.5 m/s makes the same step 1 m long).
 *
 * A {@link MotionTrack} keeps the last dozen samples with the time they arrived and answers
 * `at(time)` by *interpolating between* them, a little behind the newest one. That answer is a
 * continuous function of time, so drawing a body on it is smooth by construction: the per-frame
 * step is constant instead of pulsing at the snapshot rate.
 *
 * The local player is still predicted from input (that is what keeps the controls instant); the
 * engine merely pulls that prediction towards this smooth path instead of towards the raw packet.
 */
export type MotionPoint = { x: number; z: number };

/** A body is drawn this far behind the newest sample, so there are almost always two to interpolate. */
export const LOCAL_DELAY_MS = 90;
/** Remote bodies can afford a longer delay: nothing the player does depends on them. */
export const REMOTE_DELAY_MS = 130;
/** Never guess further ahead than this past the newest sample, or a stop would overshoot. */
export const MAX_EXTRAPOLATION_MS = 70;
/** Older than this, the newest sample is treated as the truth and the body stops dead. */
export const STALE_MS = 340;
/** Faster than any mount; a velocity above this is a teleport, not motion. */
const MAX_SPEED = 14;

export class MotionTrack {
  private times: number[] = [];
  private xs: number[] = [];
  private zs: number[] = [];

  constructor(private readonly capacity = 20) {}

  get size(): number { return this.times.length; }

  /** Newest sample time, or null when the track is empty. */
  newestAt(): number | null { return this.times.length ? this.times[this.times.length - 1]! : null; }

  /** Newest sample itself, or null when the track is empty. */
  newest(): MotionPoint | null {
    const count = this.times.length;
    return count ? { x: this.xs[count - 1]!, z: this.zs[count - 1]! } : null;
  }

  /** Discard everything and start again from a known position (zone change, respawn, teleport). */
  reset(time: number, x: number, z: number): void {
    this.times = [time];
    this.xs = [x];
    this.zs = [z];
  }

  push(time: number, x: number, z: number): void {
    const count = this.times.length;
    if (!count) { this.reset(time, x, z); return; }
    const newest = this.times[count - 1]!;
    if (!Number.isFinite(time) || time <= newest) {
      // Two updates inside the same millisecond (or a clock that went backwards): keep one.
      this.xs[count - 1] = x;
      this.zs[count - 1] = z;
      return;
    }
    this.times.push(time); this.xs.push(x); this.zs.push(z);
    if (this.times.length > this.capacity) {
      this.times.shift(); this.xs.shift(); this.zs.shift();
    }
  }

  /**
   * Where the body should be drawn at `time`.
   *
   * · before the first sample: the first sample (nothing better is known);
   * · between two samples: linear interpolation, which is exactly "the motion the server saw";
   * · after the newest one: a short, capped extrapolation along the last measured velocity, so a
   *   late packet does not stall the body — but a *stale* track (no packet for `STALE_MS`) holds
   *   still rather than drifting off into the distance.
   */
  at(time: number): MotionPoint | null {
    const count = this.times.length;
    if (!count) return null;
    if (time <= this.times[0]!) return { x: this.xs[0]!, z: this.zs[0]! };
    const newest = count - 1;
    if (time >= this.times[newest]!) {
      const age = time - this.times[newest]!;
      if (count < 2 || age > STALE_MS) return { x: this.xs[newest]!, z: this.zs[newest]! };
      const span = (this.times[newest]! - this.times[newest - 1]!) / 1000;
      if (span <= 0) return { x: this.xs[newest]!, z: this.zs[newest]! };
      const vx = clampSpeed((this.xs[newest]! - this.xs[newest - 1]!) / span);
      const vz = clampSpeed((this.zs[newest]! - this.zs[newest - 1]!) / span);
      const ahead = Math.min(MAX_EXTRAPOLATION_MS, age) / 1000;
      return { x: this.xs[newest]! + vx * ahead, z: this.zs[newest]! + vz * ahead };
    }
    for (let i = count - 1; i > 0; i--) {
      const t0 = this.times[i - 1]!;
      const t1 = this.times[i]!;
      if (time < t0) continue;
      const span = t1 - t0;
      if (span <= 0) return { x: this.xs[i]!, z: this.zs[i]! };
      const ratio = (time - t0) / span;
      return { x: this.xs[i - 1]! + (this.xs[i]! - this.xs[i - 1]!) * ratio,
        z: this.zs[i - 1]! + (this.zs[i]! - this.zs[i - 1]!) * ratio };
    }
    return { x: this.xs[0]!, z: this.zs[0]! };
  }
}

function clampSpeed(speed: number): number {
  return Math.max(-MAX_SPEED, Math.min(MAX_SPEED, speed));
}

/** Beyond this the two disagree so completely that only a teleport explains it. */
export const SNAP_DISTANCE = 6;
/** Below this the difference is not worth moving the body for. */
const DEAD_ZONE = 0.02;
/**
 * While the player is standing still, only a real disagreement is worth correcting. The server keeps
 * walking for the time it takes the released key to reach it (one tick plus the network), and its
 * packet is extrapolated a little further besides, so a stopped body sits a few decimetres behind
 * the path — pulling it forward there would be a visible glide after every stop ("trượt").
 */
const IDLE_DEAD_ZONE = 1.2;

/**
 * How far to move a predicted body this frame so it stays glued to the server's own path.
 *
 * Both points are the *same instant* (`LOCAL_DELAY_MS` ago): the body's remembered position and the
 * server's interpolated one. That is the whole trick — comparing "now" with "the last packet" bakes
 * the latency into the error, and the body is then dragged backwards every single frame.
 */
export function correctionStep(own: MotionPoint, reference: MotionPoint, dt: number, speed: number,
  idle = false): { x: number; z: number; snap: boolean } {
  const errorX = reference.x - own.x;
  const errorZ = reference.z - own.z;
  const drift = Math.hypot(errorX, errorZ);
  if (drift > SNAP_DISTANCE) return { x: errorX, z: errorZ, snap: true };
  if (drift <= (idle ? IDLE_DEAD_ZONE : DEAD_ZONE)) return { x: 0, z: 0, snap: false };
  // Gentle for the odd centimetre, firm when the client is genuinely wrong, and never faster than a
  // run, so the correction itself can never look like a slide.
  const gain = drift > 1.2 ? 14 : 6;
  const budget = Math.max(8, speed * 2) * dt;
  const move = Math.min(drift * Math.min(1, gain * dt), budget);
  return { x: errorX * (move / drift), z: errorZ * (move / drift), snap: false };
}

/**
 * One track per body. Snapshots are per-scene and every avatar is drawn from the same 10 Hz stream,
 * so the registry lives here rather than being threaded through the React tree — the scene pushes
 * on every snapshot, each avatar reads its own on every frame.
 */
/**
 * Record one packet. A jump further than `snapDistance` is a teleport (dev teleport, respawn, portal),
 * not motion: interpolating across it would slide the body over the whole map, so the track restarts
 * there instead.
 */
export function recordMotion(track: MotionTrack, time: number, x: number, z: number, snapDistance = 8): void {
  const newest = track.newest();
  if (!newest || Math.hypot(x - newest.x, z - newest.z) > snapDistance) { track.reset(time, x, z); return; }
  // The same point twice in the same frame is one packet seen twice, not a body that stopped.
  const newestAt = track.newestAt() ?? 0;
  if (Math.hypot(x - newest.x, z - newest.z) < 1e-4 && time - newestAt < 5) return;
  track.push(time, x, z);
}

const tracks = new Map<string, MotionTrack>();

export function playerTrack(id: string): MotionTrack {
  let track = tracks.get(id);
  if (!track) {
    // Older avatars are forgotten so a long session cannot accumulate thousands of tracks.
    if (tracks.size > 64) tracks.clear();
    track = new MotionTrack();
    tracks.set(id, track);
  }
  return track;
}

export function clearPlayerTracks(): void { tracks.clear(); }
