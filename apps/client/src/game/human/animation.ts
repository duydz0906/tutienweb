import * as THREE from 'three';
import type { HumanBone, HumanRig } from './character';

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
  /** Extra head yaw in radians (look toward the camera target). */
  look?: number;
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

/** Write the accumulated deltas onto the bones, on top of their bind-pose rotations. */
function flush(rig: HumanRig, acc: Accumulator): void {
  for (const [key, bone] of Object.entries(rig.bones) as [HumanBone, THREE.Bone][]) {
    const rest = rig.rest.get(bone);
    if (!rest) continue;
    const delta = acc.get(key);
    if (delta) bone.quaternion.copy(rest).multiply(delta);
    else bone.quaternion.copy(rest);
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
  const flow = Math.sin(pose.time * 2.4) * 0.05;
  add(acc, 'legL', 'z', 0.12 + flow);
  add(acc, 'legR', 'z', -0.12 - flow);
  add(acc, 'kneeL', 'x', -0.22);
  add(acc, 'kneeR', 'x', -0.22);
  add(acc, 'armL', 'z', -0.24);
  add(acc, 'armR', 'z', 0.24);
  add(acc, 'chest', 'x', 0.1);
  add(acc, 'armL', 'x', -0.12 - flow);
  add(acc, 'armR', 'x', -0.12 - flow);
}

function poseAttack(acc: Accumulator, progress: number): void {
  const arc = Math.sin(Math.min(1, Math.max(0, progress)) * Math.PI);
  add(acc, 'armR', 'x', -1.75 * arc);
  add(acc, 'armR', 'z', -0.3 * arc);
  add(acc, 'foreArmR', 'z', -0.5 * arc);
  add(acc, 'chest', 'y', 0.42 * arc);
  add(acc, 'spine', 'y', 0.2 * arc);
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
  flush(rig, acc);

  if (pose.meditating) return MEDITATE_HOVER + Math.sin(pose.time * 1.1) * 0.012;
  if (pose.flying) return 0;
  return -0.11 * Math.abs(Math.sin(pose.phase)) * Math.min(1, Math.max(0, pose.walk));
}

/** Restore the bind pose (used when an actor is recycled). */
export function resetHumanPose(rig: HumanRig): void {
  flush(rig, new Map());
}
