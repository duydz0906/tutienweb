import * as THREE from 'three';
import type { GripFinger, HumanBone, HumanRig } from './character';

/**
 * Procedural animation for the real-human skeleton. Poses are deltas from the bind pose, applied in
 * bone-local space (mixamo axes: X = pitch/forward swing, Y = twist along the bone, Z = lift/side).
 *
 * Signs were measured against the rig, not guessed:
 *  · `LeftArm` Z negative brings the arm down to the side (positive lifts it out).
 *  · `LeftUpLeg` Z positive swings the thigh forward; `LeftLeg` X negative flexes the knee.
 *  · the right side mirrors Z (and the value, not the axis) for both arms and legs.
 */
export type HumanPose = {
  /** Seconds since mount; drives breathing, sway and idle head movement. */
  time: number;
  /** 0 = standing still, 1 = full walk cycle. */
  walk: number;
  /** Walk cycle phase in radians (advanced by the caller). */
  phase: number;
  flying?: boolean;
  meditating?: boolean;
  /** 0..1 progress of a sword swing; 0 means no attack. */
  attack?: number;
  /** 0..1 progress of a skill cast (hand seals); 0 means the character is not casting. */
  cast?: number;
  /** Extra head yaw in radians (look toward the camera target). */
  look?: number;
  /** Hand that holds a weapon; its fingers close into a fist around the grip. */
  grip?: 'L' | 'R';
};

/**
 * How far the body floats above the ground while meditating. The robe is skinned to the legs, so a
 * real lotus pose tears the cloth; hovering in nhập định (the usual xianxia look) is both correct
 * for the genre and keeps the garment intact.
 */
export const MEDITATE_HOVER = 0.3;

const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) } as const;
const _delta = new THREE.Quaternion();

type Accumulator = Map<HumanBone, THREE.Quaternion>;

function add(acc: Accumulator, bone: HumanBone, axis: keyof typeof AXES, angle: number): void {
  if (!angle) return;
  let rotation = acc.get(bone);
  if (!rotation) { rotation = new THREE.Quaternion(); acc.set(bone, rotation); }
  rotation.multiply(_delta.setFromAxisAngle(AXES[axis], angle));
}

/**
 * Write the accumulated deltas onto the bones, on top of their bind-pose rotations, and close the
 * holding hand around its grip. Fingers are not part of the pose accumulator: they either hold an
 * item (curl) or relax back to the bind pose, never both.
 */
function flush(rig: HumanRig, acc: Accumulator, grip?: 'L' | 'R'): void {
  for (const [key, bone] of Object.entries(rig.bones) as [HumanBone, THREE.Bone][]) {
    const rest = rig.rest.get(bone);
    if (!rest) continue;
    const delta = acc.get(key);
    if (delta) bone.quaternion.copy(rest).multiply(delta);
    else bone.quaternion.copy(rest);
  }
  for (const [side, fingers] of Object.entries(rig.fingers) as ['L' | 'R', GripFinger[]][]) {
    const closed = grip === side;
    for (const finger of fingers) {
      if (closed) finger.bone.quaternion.copy(finger.rest).multiply(finger.curl);
      else finger.bone.quaternion.copy(finger.rest);
    }
  }
}

function poseIdle(acc: Accumulator, pose: HumanPose): void {
  const breathe = Math.sin(pose.time * 1.7) * 0.012;
  add(acc, 'chest', 'x', breathe);
  add(acc, 'spine', 'x', breathe * 0.6);
  add(acc, 'armL', 'z', -0.44 - Math.sin(pose.time * 1.1) * 0.015);
  add(acc, 'armR', 'z', 0.44 + Math.sin(pose.time * 1.1) * 0.015);
  add(acc, 'foreArmL', 'z', 0.2);
  add(acc, 'foreArmR', 'z', -0.2);
  add(acc, 'head', 'y', (pose.look ?? 0) + Math.sin(pose.time * 0.7) * 0.1);
  add(acc, 'head', 'x', Math.sin(pose.time * 0.9) * 0.03);
}

function poseWalk(acc: Accumulator, pose: HumanPose): void {
  const amount = Math.min(1, Math.max(0, pose.walk));
  if (amount <= 0) return;
  const swing = Math.sin(pose.phase);
  const lift = Math.max(0, -Math.sin(pose.phase));
  const liftOther = Math.max(0, Math.sin(pose.phase));

  // Mirroring means the SAME sign swings the legs in opposite directions on this rig.
  add(acc, 'legL', 'z', swing * 0.52 * amount);
  add(acc, 'legR', 'z', swing * 0.52 * amount);
  add(acc, 'kneeL', 'x', -(0.08 + 0.62 * lift) * amount);
  add(acc, 'kneeR', 'x', -(0.08 + 0.62 * liftOther) * amount);
  add(acc, 'footL', 'x', (0.1 + 0.3 * lift) * amount);
  add(acc, 'footR', 'x', (0.1 + 0.3 * liftOther) * amount);
  // Arms counter-swing against the legs.
  add(acc, 'armL', 'x', -swing * 0.5 * amount);
  add(acc, 'armR', 'x', swing * 0.5 * amount);
  add(acc, 'foreArmL', 'z', 0.12 * amount);
  add(acc, 'foreArmR', 'z', -0.12 * amount);
  add(acc, 'hips', 'y', swing * 0.06 * amount);
  add(acc, 'chest', 'y', -swing * 0.08 * amount);
}

function poseMeditate(acc: Accumulator, pose: HumanPose): void {
  // The CC0 robe is a long dress skinned to the legs: any real lotus/kneel pose rips the cloth
  // open at the knees. Nhập định is therefore a floating, upright pose with the legs only slightly
  // tucked and the ankles crossed — the look xianxia games use for exactly this reason.
  const breath = Math.sin(pose.time * 1.1) * 0.02;
  add(acc, 'legL', 'z', 0.16);
  add(acc, 'legR', 'z', 0.16);
  add(acc, 'kneeL', 'x', -0.34);
  add(acc, 'kneeR', 'x', -0.4);
  add(acc, 'footL', 'x', 0.26);
  add(acc, 'footR', 'x', 0.2);
  add(acc, 'armL', 'z', -0.58);
  add(acc, 'armR', 'z', 0.58);
  add(acc, 'armL', 'x', 0.4);
  add(acc, 'armR', 'x', 0.4);
  add(acc, 'foreArmL', 'z', 0.8);
  add(acc, 'foreArmR', 'z', -0.8);
  add(acc, 'chest', 'x', 0.03 + breath * 0.5);
}

function poseFly(acc: Accumulator, pose: HumanPose): void {
  // Riding stance: weight forward over the front foot, knees soft, arms out for balance, and a
  // slow sway so a hovering rider never looks like a statue nailed to the sword.
  const flow = Math.sin(pose.time * 1.6) * 0.06;
  const drift = Math.sin(pose.time * 0.9) * 0.04;
  add(acc, 'chest', 'x', 0.16 + flow * 0.4);
  add(acc, 'spine', 'x', 0.06);
  add(acc, 'hips', 'x', -0.04);
  // Front foot forward, back foot braced: a sword rider stands across the blade, not on it.
  add(acc, 'legL', 'z', 0.34 + flow);
  add(acc, 'legR', 'z', -0.14 - flow * 0.6);
  add(acc, 'kneeL', 'x', -0.3);
  add(acc, 'kneeR', 'x', -0.22);
  add(acc, 'footL', 'x', 0.16);
  add(acc, 'footR', 'x', 0.1);
  // Arms: one trailing, one leading, gently riding the air.
  add(acc, 'armL', 'z', -0.4 - drift);
  add(acc, 'armR', 'z', 0.3 + drift);
  add(acc, 'armL', 'x', -0.18 - flow);
  add(acc, 'armR', 'x', 0.12 + flow);
  add(acc, 'foreArmL', 'z', 0.3);
  add(acc, 'foreArmR', 'z', -0.24);
  add(acc, 'head', 'x', -0.1 + flow * 0.5);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Where the blade should point, in character space (+Z forward, +X to the character's left).
 * The grip socket aims the blade along the hand bone's own X axis, and that axis turns with the
 * shoulder: raise the arm and the sword points sideways, drop it and the sword trails behind the
 * leg. Rather than fight the skeleton with magic wrist offsets, every pose states the blade
 * direction it wants and `aimGrip` rotates the wrist to match — which is exactly the freedom a real
 * wrist has, and the reason a swing now reads as a swing instead of a windmill.
 *
 * The idle aim points the blade UP: a jian carried at the side with the point down is a reverse
 * (ice-pick) grip, which is what players described as holding the sword "ngược/xuôi". Thumbs-up
 * forehand is the natural carry: pommel under the fist, steel rising in front of the shoulder.
 */
const IDLE_AIM: Record<'L' | 'R', THREE.Vector3> = {
  L: new THREE.Vector3(0.26, 0.9, 0.35).normalize(),
  R: new THREE.Vector3(-0.26, 0.9, 0.35).normalize(),
};
/** Vertical guard used by skill casts: blade up beside the shoulder, tip clear of the head. */
const CAST_AIM: Record<'L' | 'R', THREE.Vector3> = {
  L: new THREE.Vector3(0.16, 0.95, 0.26).normalize(),
  R: new THREE.Vector3(-0.16, 0.95, 0.26).normalize(),
};
/**
 * The slash, as a sequence of blade directions. It lifts the point in FRONT of the body, drives it
 * down and across the chest, and only then returns to the idle guard — the old curve carried on
 * through the front and finished behind the character's back, which is what read as "attacking
 * backwards". Keyframes are `[progress, direction]` and are interpolated with a smoothstep.
 */
const ATTACK_AIM: [number, THREE.Vector3][] = [
  [0, IDLE_AIM.R.clone()],
  [0.18, new THREE.Vector3(-0.5, 0.76, 0.32).normalize()],
  [0.38, new THREE.Vector3(-0.06, 0.7, 0.42).normalize()],
  [0.6, new THREE.Vector3(0.5, -0.5, 0.38).normalize()],
  [0.78, new THREE.Vector3(0.42, -0.74, 0.3).normalize()],
  [0.9, new THREE.Vector3(0.1, 0.24, 0.5).normalize()],
  [1, IDLE_AIM.R.clone()],
];

const _aim = new THREE.Vector3();
const _blade = new THREE.Vector3();
const _world = new THREE.Quaternion();
const _parent = new THREE.Quaternion();
const _socket = new THREE.Quaternion();
const _aimDelta = new THREE.Quaternion();
const _hand = new THREE.Quaternion();
const _root = new THREE.Quaternion();
const _chain: THREE.Object3D[] = [];

/** Accumulated rotation of every ancestor of `node` (root first), without needing matrixWorld. */
function parentQuaternion(node: THREE.Object3D, out: THREE.Quaternion): THREE.Object3D {
  _chain.length = 0;
  for (let current = node.parent; current; current = current.parent) _chain.push(current);
  out.identity();
  for (let i = _chain.length - 1; i >= 0; i--) out.multiply(_chain[i]!.quaternion);
  return _chain[_chain.length - 1]!;
}

/**
 * Rotate the gripping wrist so the equipped blade (+Y of the grip socket) points along `aim`.
 * Runs after the pose has been written, so it also inherits every ancestor rotation — the avatar's
 * yaw, the torso twist — and is therefore a rotation *relative to the body*, not to the world.
 */
function aimGrip(rig: HumanRig, side: 'L' | 'R', aim: THREE.Vector3): void {
  const bone = rig.bones[side === 'L' ? 'handL' : 'handR'];
  const socket = rig.sockets[side === 'L' ? 'gripL' : 'gripR'];
  if (!bone || !socket) return;
  // `parentQuaternion` walks to the outermost ancestor; its own local rotation *is* the world one
  // (read from `quaternion`, not from `matrixWorld`, which the render loop updates a frame later).
  const root = parentQuaternion(bone, _parent);
  _root.copy(root.quaternion);
  // Blade direction in world space, from the socket we are about to correct.
  _world.copy(_parent).multiply(bone.quaternion);
  _blade.set(0, 1, 0).applyQuaternion(_socket.copy(_world).multiply(socket.quaternion));
  _aim.copy(aim).normalize().applyQuaternion(_root);
  _aimDelta.setFromUnitVectors(_blade, _aim);
  _hand.copy(_aimDelta).multiply(_world);
  bone.quaternion.copy(_parent).invert().multiply(_hand);
}

/** Blade direction for the current pose, or undefined when nothing is held. */
function bladeAim(pose: HumanPose): THREE.Vector3 | undefined {
  const side = pose.grip;
  if (!side) return undefined;
  if (pose.attack) {
    const p = Math.min(1, Math.max(0, pose.attack));
    for (let i = 1; i < ATTACK_AIM.length; i++) {
      const [end, direction] = ATTACK_AIM[i]!;
      const [start, previous] = ATTACK_AIM[i - 1]!;
      if (p > end) continue;
      const t = smoothstep(start, end, p);
      const lerped = previous.clone().lerp(direction, t).normalize();
      return side === 'L' ? new THREE.Vector3(-lerped.x, lerped.y, lerped.z) : lerped;
    }
  }
  if (pose.cast) return CAST_AIM[side];
  return IDLE_AIM[side];
}

/**
 * One handed slash, in the direction a player expects: the sword is lifted in FRONT of the body
 * and then sweeps down and forward. The old version pitched the arm to -1.75 rad, i.e. it swung
 * behind the character's back, which read as attacking backwards.
 *
 * `progress` runs 0 → 1 over the swing: 0-0.3 lift, 0.3-0.62 cut, 0.62-1 recover.
 */
function poseAttack(acc: Accumulator, progress: number): void {
  const p = Math.min(1, Math.max(0, progress));
  // Lift the fist to the shoulder (0-0.3), drive it forward and down (0.3-0.64), recover (0.64-1).
  // +X on this rig pitches the arm forward (measured); negative X would swing it behind the back,
  // so the cut stops at +0.3 instead of continuing through zero into the character's back.
  const lift = smoothstep(0, 0.3, p);
  const cut = smoothstep(0.3, 0.64, p);
  const back = smoothstep(0.64, 1, p);
  const raise = lift * (1 - cut);
  const drive = cut * (1 - back);
  const settle = back;
  const pitch = 1.3 * raise + 0.42 * drive + 0.1 * settle;
  add(acc, 'armR', 'x', pitch);
  // Elbow out on the wind-up, tucked in as the cut passes the chest.
  add(acc, 'armR', 'z', -0.55 * raise + 0.34 * drive + 0.1 * settle);
  add(acc, 'foreArmR', 'z', -1.0 * raise + 0.55 * drive - 0.2 * settle);
  add(acc, 'foreArmR', 'x', 0.25 * raise - 0.3 * drive);
  // The torso winds over the back foot and follows the blade through the cut.
  add(acc, 'chest', 'y', -0.34 * raise + 0.5 * cut * (1 - back));
  add(acc, 'spine', 'y', -0.15 * raise + 0.22 * cut * (1 - back));
  add(acc, 'chest', 'x', 0.06 * raise + 0.1 * cut * (1 - back));
  add(acc, 'head', 'y', 0.2 * cut * (1 - back) - 0.12 * raise);
  // Weight shifts onto the front foot for the strike.
  add(acc, 'legR', 'z', -0.14 * cut * (1 - back));
  add(acc, 'legL', 'z', 0.12 * cut * (1 - back));
}

/**
 * Skill cast: both hands come up in front of the chest into a seal (ấn quyết), the shoulders open,
 * then the arms push the technique forward. This is the pose the game was missing — skills used to
 * play only their VFX while the character stood still.
 */
function poseCast(acc: Accumulator, progress: number): void {
  const p = Math.min(1, Math.max(0, progress));
  const raise = smoothstep(0, 0.4, p) * (1 - smoothstep(0.8, 1, p));
  const push = smoothstep(0.38, 0.62, p) * (1 - smoothstep(0.72, 1, p));
  // Arms forward (X+) and tucked inwards (Z towards the chest), elbows deeply bent.
  add(acc, 'armL', 'x', 1.05 * raise + 0.3 * push);
  add(acc, 'armR', 'x', 1.05 * raise + 0.3 * push);
  add(acc, 'armL', 'z', 0.3 * raise + 0.05 * push);
  add(acc, 'armR', 'z', -0.3 * raise - 0.05 * push);
  add(acc, 'foreArmL', 'z', 1.05 * raise - 0.55 * push);
  add(acc, 'foreArmR', 'z', -1.05 * raise + 0.55 * push);
  add(acc, 'chest', 'x', 0.05 * raise - 0.1 * push);
  add(acc, 'spine', 'x', 0.03 * raise);
  add(acc, 'head', 'x', -0.05 * raise - 0.05 * push);
}

/**
 * Apply one animation frame and return the vertical offset the model group should use.
 * Rotating a leg forward lifts the foot, so a walk cycle needs the pelvis to drop with it —
 * otherwise the whole character appears to float above the ground.
 */
export function applyHumanPose(rig: HumanRig, pose: HumanPose): number {
  const acc: Accumulator = new Map();
  if (pose.meditating) poseMeditate(acc, pose);
  else if (pose.flying) poseFly(acc, pose);
  else poseIdle(acc, pose);

  if (!pose.meditating && !pose.flying) poseWalk(acc, pose);
  if (pose.attack) poseAttack(acc, pose.attack);
  if (pose.cast) poseCast(acc, pose.cast);
  flush(rig, acc, pose.grip);
  // The blade follows the pose's intent, not the shoulder's accident.
  const aim = bladeAim(pose);
  if (aim && pose.grip) aimGrip(rig, pose.grip, aim);

  if (pose.meditating) return MEDITATE_HOVER + Math.sin(pose.time * 1.1) * 0.012;
  if (pose.flying) return 0;
  return -0.11 * Math.abs(Math.sin(pose.phase)) * Math.min(1, Math.max(0, pose.walk));
}

/** Restore the bind pose (used when an actor is recycled). */
export function resetHumanPose(rig: HumanRig): void {
  flush(rig, new Map());
}
