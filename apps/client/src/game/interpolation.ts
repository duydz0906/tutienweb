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
 * The local player is still predicted from input — that is what keeps the controls instant — and is
 * only pulled towards the smooth path when the two genuinely disagree (see `LocalReconciler`).
 */
export type MotionPoint = { x: number; z: number };

/**
 * Smallest playback delay, in milliseconds: the body is drawn this far behind the newest sample so
 * there are almost always two to interpolate between. The real delay adapts upwards from here — see
 * {@link MotionTrack.delayMs}.
 */
export const LOCAL_DELAY_MS = 90;
/** Remote bodies can afford a longer delay: nothing the player does depends on them. */
export const REMOTE_DELAY_MS = 130;
/** Extra slack for other players' bodies on top of their measured packet interval. */
export const REMOTE_EXTRA_MS = 40;
/** Never guess further ahead than this past the newest sample, or a stop would overshoot. */
export const MAX_EXTRAPOLATION_MS = 100;
/** Older than this, the newest sample is treated as the truth and the body stops dead. */
export const STALE_MS = 340;
/** Faster than any mount; a velocity above this is a teleport, not motion. */
const MAX_SPEED = 14;

export class MotionTrack {
  private times: number[] = [];
  private xs: number[] = [];
  private zs: number[] = [];
  /** Smoothed gap between packets, in ms. The playback delay is derived from it. */
  private interval = 100;

  constructor(private readonly capacity = 20) {}

  /**
   * How far behind the newest sample to draw this body.
   *
   * A fixed 90 ms looked fine in theory and starved in practice: the server's snapshot cadence
   * drifts, the network adds its own jitter, and whenever a packet arrived late the playback point
   * ran past the newest sample and had to *extrapolate* — a guess that is wrong in a straight line
   * and visibly right at walking speed but a stutter at 10.5 m/s. Sizing the delay from the measured
   * interval keeps two real samples around the playback point at all times, which is why flying now
   * looks as smooth as standing still.
   */
  get delayMs(): number {
    return Math.max(LOCAL_DELAY_MS, Math.min(220, Math.round(25 + this.interval * 1.4)));
  }

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
    // The interval survives a reset on purpose: a teleport says nothing about the connection.
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
    const gap = time - newest;
    // Long pauses (a stalled tab, a zone change) are not a cadence; only plausible gaps shape it.
    if (gap >= 20 && gap <= 500) this.interval = this.interval * 0.82 + gap * 0.18;
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

/**
 * Reconciliation constants.
 *
 * The important one is the deadband. A predicted body is *always* a little ahead of the server: the
 * client's input takes one 50 ms packet to arrive, plus the network's own delay. At walking speed
 * that is ~0.5 m and at flight speed ~0.9 m, and it is not an error — it is the price of instant
 * controls. Pulling it back every frame turned that constant offset into a permanent drag: the body
 * moved slower than its input, the gap grew, and the correction grew with it. Players read that as
 * "the character slides / judders" (trôi, giật) rather than as a network detail.
 *
 * So a disagreement smaller than the deadband is ignored outright; larger ones (a body that appeared
 * in the way, a clamp, a closed gate) are corrected gently and speed limited, and only a real
 * teleport snaps.
 */
export const RECONCILE = {
  /** Ignored error while the player is moving: the input-delay offset plus a margin. */
  band: 0.55,
  bandPerSpeed: 0.1,
  /** A stopped body is never dragged back, so it may keep a little more slack. */
  idleBandBonus: 0.3,
  /** Beyond this the two disagree so completely that only a teleport explains it. */
  snapDistance: 6,
  /** How fast a body may be pulled towards the server, in m/s, when nothing else is moving it. */
  minCatchUpSpeed: 2.5,
  /**
   * …plus the body's own speed, so a correction is always able to outweigh the input that caused the
   * disagreement. Without this a body that the server refused to move would walk further away every
   * frame and only come back in a teleport-sized jump.
   */
  catchUpOver: 3,
  /** Fraction of the deadband over which a correction ramps from nothing to full strength. */
  ramp: 0.8,
} as const;

/**
 * How far to move a predicted body this frame so it stays on the server's own path.
 *
 * Both points are the *same instant* (`LOCAL_DELAY_MS` ago): the body's remembered position and the
 * server's interpolated one. Comparing "now" with "the last packet" would bake the latency into the
 * error and drag the body backwards on every frame.
 */
export type ReconcileFix = { x: number; z: number; snap: boolean; engaged: boolean };

export function reconcileStep(own: MotionPoint, reference: MotionPoint, dt: number, speed: number,
  idle = false): ReconcileFix {
  const errorX = reference.x - own.x;
  const errorZ = reference.z - own.z;
  const drift = Math.hypot(errorX, errorZ);
  if (drift > RECONCILE.snapDistance) return { x: errorX, z: errorZ, snap: true, engaged: true };
  const band = RECONCILE.band + speed * RECONCILE.bandPerSpeed + (idle ? RECONCILE.idleBandBonus : 0);
  if (drift <= band) return { x: 0, z: 0, snap: false, engaged: false };
  // Ramped rather than switched: corrections fade in over `ramp × band`, so crossing the deadband
  // never produces a step in velocity (which is what a player actually perceives as a jolt).
  const over = drift - band;
  const strength = Math.min(1, over / (band * RECONCILE.ramp));
  const catchUp = Math.max(RECONCILE.minCatchUpSpeed, speed + RECONCILE.catchUpOver);
  const move = Math.min(over * strength, catchUp * dt);
  return { x: errorX * (move / drift), z: errorZ * (move / drift), snap: false, engaged: true };
}

/**
 * How long a disagreement must persist before the body stops walking into whatever refuses it, and
 * how fast that timer drains once the disagreement is gone (twice real time, so a single late packet
 * never freezes the controls).
 */
const HOLD_AFTER_MS = 380;
const RELEASE_PER_MS = 2;

/**
 * Reconciliation for one predicted body: its own short history plus the "am I pushing against
 * something the server refuses" state.
 *
 * The history is what makes the comparison meaningful — the body's position `LOCAL_DELAY_MS` ago
 * against the server's path at the same instant. The hold covers the case prediction cannot know
 * about (a body that appeared from nowhere, a gate that closed): if the disagreement refuses to go
 * away, the input is ignored until it does, which turns an endless push-and-be-pulled-back cycle
 * into "the character stops, slides back two paces and carries on".
 */
export class LocalReconciler {
  private readonly history: MotionTrack;
  private since = 0;
  private holdMs = 0;

  constructor(capacity = 240) { this.history = new MotionTrack(capacity); }

  get held(): boolean { return this.holdMs > HOLD_AFTER_MS; }

  reset(time: number, x: number, z: number): void {
    this.history.reset(time, x, z);
    this.since = time;
    this.holdMs = 0;
  }

  /** Record where the body is, then return how far to move it towards the server. */
  step(now: number, body: MotionPoint, dt: number, speed: number, reference: MotionPoint | null,
    idle: boolean, delayMs = LOCAL_DELAY_MS): ReconcileFix {
    if (!this.history.size) this.reset(now, body.x, body.z);
    // Only meaningful once the history reaches back a full delay; before that the "past" sample
    // would just be the present and the difference would be latency rather than disagreement. The
    // delay must be the one the reference was sampled at, or the two instants would not line up and
    // the difference would be speed × delay instead of a real disagreement.
    const own = now - this.since >= delayMs ? this.history.at(now - delayMs) : null;
    this.history.push(now, body.x, body.z);
    if (!own || !reference) return { x: 0, z: 0, snap: false, engaged: false };
    const fix = reconcileStep(own, reference, dt, speed, idle);
    if (fix.snap) this.reset(now, body.x + fix.x, body.z + fix.z);
    this.holdMs = fix.engaged ? this.holdMs + dt * 1000 : Math.max(0, this.holdMs - dt * RELEASE_PER_MS);
    return fix;
  }
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
