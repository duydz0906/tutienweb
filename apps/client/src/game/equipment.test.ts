import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import type { HumanLook, HumanRig } from './human/character';
import type { HumanSource } from './human/source';

/**
 * Equipment has to sit on the body, not near it. Every assertion below was measured on the real
 * rig: the weapon inside the fist, the circlet on the forehead, the pauldrons on the shoulders,
 * the boots on the ankles, the ring on a phalanx and the talisman on the belt. The previous
 * version failed all of them (a 2.6 m sword through the legs, a circlet around the neck), so this
 * file is the regression guard.
 */
const ASSETS = fileURLToPath(new URL('../../public/human/', import.meta.url));
const loader = new GLTFLoader();
const nodeSource: HumanSource = {
  gltf(path) {
    const packed = gunzipSync(readFileSync(`${ASSETS}${path}`));
    const buffer = packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength);
    return new Promise((resolve, reject) => loader.parse(buffer as ArrayBuffer, '', (gltf) => resolve(gltf.scene as THREE.Group), reject));
  },
  texture: () => null,
};

const LOOK: HumanLook = {
  gender: 'nam', hair: 'long', hairColor: 'ink', face: 'oval',
  skinTone: 'warm', robeColor: 'jade', height: 0.5, build: 0.5,
};

const EQUIPMENT = {
  weapon: 'jade_blade', head: 'luu_van_quan', shoulder: 'huyen_thiet_ho_vai', boots: 'dap_van_ngoa',
  ring: 'tu_linh_gioi', necklace: 'ngoc_tam_boi', talisman: 'lien_hoa_phu',
};

type Build = typeof import('./human/character');
type Animate = typeof import('./human/animation');
type Equip = typeof import('./equipment');

let build: Build;
let animate: Animate;
let equip: Equip;
let character: THREE.Group;
/** Captured right after the build: `rigOf` snapshots the current pose as the bind pose. */
let rig: HumanRig;
let groups: THREE.Object3D[];

const box = (object: THREE.Object3D) => new THREE.Box3().setFromObject(object);
const centre = (object: THREE.Object3D) => box(object).getCenter(new THREE.Vector3());
const size = (object: THREE.Object3D) => box(object).getSize(new THREE.Vector3());
const worldPosition = (object: THREE.Object3D) => {
  const point = new THREE.Vector3();
  object.getWorldPosition(point);
  return point;
};
/** One mount by its slot name (`weapon`, `head`, `shoulder:L`, ...). */
const mountOf = (name: string) => groups.find((group) => group.name === `equipment-mount:${name}`);

beforeAll(async () => {
  // The sculpted gear paints canvas textures at module load; a stub context is enough here.
  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => null }),
  };
  build = await import('./human/character');
  animate = await import('./human/animation');
  equip = await import('./equipment');
  character = await build.buildHuman(LOOK, 0.55, nodeSource);
  character.updateMatrixWorld(true);
  rig = build.rigOf(character);
  animate.applyHumanPose(rig, { time: 0.6, walk: 0, phase: 0, grip: 'R' });
  groups = equip.mountEquipment(character, 'human', EQUIPMENT, 0.55);
  character.updateMatrixWorld(true);
}, 60_000);

describe('equipment on the real-human rig', () => {
  it('puts the sword in the fist in a forehand carry, point up instead of reversed', () => {
    const weapon = mountOf('weapon')!;
    expect(weapon.parent?.name).toBe('rig-gripR');
    // Forehand: the point rises in front of the shoulder and the pommel sits under the fist.
    // Following the hand bone's own axis pointed the blade down and back — the "held upside down"
    // (cầm ngược) look players kept reporting.
    const blade = new THREE.Vector3(0, 1, 0).applyQuaternion(weapon.getWorldQuaternion(new THREE.Quaternion()));
    expect(blade.y).toBeGreaterThan(0.6);
    expect(blade.z).toBeGreaterThan(0.2);
    expect(Math.abs(blade.x)).toBeGreaterThan(0.1);
    // The blade is above the hand and the pommel below it, not the other way round.
    const handY = worldPosition(rig.sockets.gripR!).y;
    expect(box(weapon).max.y).toBeGreaterThan(handY + 0.4);
    expect(box(weapon).min.y).toBeLessThan(handY + 0.05);
    // A human-scale jian: ~1 m from tip to pommel, not the old 2.6 m slab.
    expect(size(weapon).length()).toBeGreaterThan(0.9);
    expect(size(weapon).length()).toBeLessThan(1.25);
    // The hilt is the socket: inside the closed hand, ~10 cm down the hand bone, not off the wrist.
    expect(worldPosition(weapon).distanceTo(worldPosition(rig.sockets.gripR!))).toBeLessThan(0.005);
    const wrist = worldPosition(rig.sockets.handR!);
    expect(worldPosition(weapon).distanceTo(wrist)).toBeGreaterThan(0.05);
    expect(worldPosition(weapon).distanceTo(wrist)).toBeLessThan(0.13);
  });

  it('closes the gripping hand into a fist around the hilt and relaxes it again', () => {
    const hand = rig.bones.handR!;
    const tip = (): THREE.Vector3 => {
      character.updateMatrixWorld(true);
      const index = rig.fingers.R!.find((finger) => finger.bone.name.endsWith('Index3'))!;
      return worldPosition(index.bone);
    };
    const grip = worldPosition(rig.sockets.gripR!);
    expect(tip().distanceTo(grip)).toBeLessThan(0.1);
    // The wrist is turned by the blade-aim constraint, so it is deliberately not at rest...
    expect(hand.quaternion.equals(rig.rest.get(hand)!)).toBe(false);
    animate.resetHumanPose(rig);
    character.updateMatrixWorld(true);
    expect(tip().distanceTo(grip)).toBeGreaterThan(0.12);
    // ...but resetting the pose has to undo it, or a recycled actor keeps a sword-shaking wrist.
    expect(hand.quaternion.equals(rig.rest.get(hand)!)).toBe(true);
    animate.applyHumanPose(rig, { time: 0.6, walk: 0, phase: 0, grip: 'R' });
    character.updateMatrixWorld(true);
    expect(tip().distanceTo(grip)).toBeLessThan(0.1);
  });

  it('wears the circlet on the forehead rather than around the neck', () => {
    const crown = mountOf('head')!;
    expect(crown).toBeTruthy();
    const headY = worldPosition(rig.bones.head!).y;
    const box3 = box(crown);
    // A 1.66 m body has a 0.24 m head: the band sits above the eyebrows and below the crown of the skull.
    expect(box3.min.y).toBeGreaterThan(headY + 0.06);
    expect(box3.max.y).toBeLessThan(headY + 0.35);
    // A crest is wider than the skull but must not turn into a helmet.
    expect(box3.max.x - box3.min.x).toBeLessThan(0.36);
  });

  it('straps the pauldrons to the shoulders at shoulder width', () => {
    const pauldrons = [mountOf('shoulder:L')!, mountOf('shoulder:R')!];
    expect(pauldrons).toHaveLength(2);
    const shoulderY = worldPosition(rig.bones.armR!).y;
    for (const pauldron of pauldrons) {
      const point = centre(pauldron);
      expect(Math.abs(point.y - shoulderY)).toBeLessThan(0.09);
      expect(Math.abs(point.x)).toBeGreaterThan(0.12);
      expect(Math.abs(point.x)).toBeLessThan(0.3);
      // Sized for a 0.25 m upper arm, not a dinner plate across the collarbone.
      expect(size(pauldron).x).toBeLessThan(0.28);
    }
  });

  it('puts the boots on the ankles, on the floor', () => {
    for (const [name, socket] of [['boots:L', 'rig-footL'], ['boots:R', 'rig-footR']]) {
      const boot = mountOf(name)!;
      expect(boot.parent?.name).toBe(socket);
      const box3 = box(boot);
      expect(box3.max.y).toBeLessThan(0.32);
      expect(box3.min.y).toBeGreaterThan(-0.03);
      // The sole reaches past the ankle toward the toes, never up a shin.
      expect(size(boot).z).toBeGreaterThan(0.12);
    }
  });

  it('slides the ring onto the ring finger', () => {
    const ring = mountOf('ring')!;
    expect(ring.parent?.name).toBe('rig-ringR');
    expect(worldPosition(ring).distanceTo(worldPosition(ring.parent!))).toBeLessThan(0.04);
    // A finger is ~1.8 cm across; the band may not read as a bracelet.
    expect(size(ring).x).toBeLessThan(0.05);
  });

  it('hangs the necklace on the collarbones and the talisman on the belt', () => {
    const chest = worldPosition(rig.sockets.torso!);
    const necklace = mountOf('necklace')!;
    const band = box(necklace);
    // The chain rests on the shoulders and the pendant stops at the sternum.
    expect(band.max.y).toBeGreaterThan(chest.y + 0.1);
    expect(band.min.y).toBeGreaterThan(chest.y - 0.22);
    const talisman = mountOf('talisman')!;
    expect(talisman).toBeTruthy();
    const point = centre(talisman);
    expect(point.y).toBeLessThan(chest.y - 0.1);
    expect(point.y).toBeGreaterThan(0.85);
    // In front of the robe, not buried inside it.
    expect(point.z).toBeGreaterThan(0.1);
    expect(Math.abs(point.x)).toBeLessThan(0.2);
  });

  it('swings the sword forward, never behind the back', () => {
    const weapon = mountOf('weapon')!;
    const axis = (): THREE.Vector3 => new THREE.Vector3(0, 1, 0)
      .applyQuaternion(weapon.getWorldQuaternion(new THREE.Quaternion()));
    const grip = new THREE.Vector3();
    const tip = (): THREE.Vector3 => {
      character.updateMatrixWorld(true);
      weapon.getWorldPosition(grip);
      return grip.clone().addScaledVector(axis(), 0.95);
    };
    const samples: { p: number; tip: THREE.Vector3; blade: THREE.Vector3 }[] = [];
    for (let p = 0; p <= 1.0001; p += 0.05) {
      animate.applyHumanPose(rig, { time: 0.6, walk: 0, phase: 0, grip: 'R', attack: Math.min(1, p) });
      samples.push({ p, tip: tip(), blade: axis().clone() });
    }
    // Every part of the swing happens in front of the body: the old curve carried the tip round
    // through the character's back (z ≈ -0.7), which players read as "attacking backwards".
    for (const { p, tip: point, blade } of samples) {
      expect(point.z, `tip at ${p.toFixed(2)}`).toBeGreaterThan(0.15);
      expect(blade.z, `blade at ${p.toFixed(2)}`).toBeGreaterThan(0.1);
    }
    // It is a real arc: the point rises above the head and comes down past the knees.
    const high = Math.max(...samples.map((sample) => sample.tip.y));
    const low = Math.min(...samples.slice(6).map((sample) => sample.tip.y));
    expect(high).toBeGreaterThan(1.8);
    expect(low).toBeLessThan(0.7);
    // ...and it sweeps across the body, not straight through it.
    expect(Math.max(...samples.map((sample) => sample.tip.x)) - Math.min(...samples.map((sample) => sample.tip.x))).toBeGreaterThan(0.6);
    // The last frame returns to the idle guard, so a repeated attack does not snap.
    animate.applyHumanPose(rig, { time: 0.6, walk: 0, phase: 0, grip: 'R' });
    const idle = axis().clone();
    expect(samples[0]!.blade.distanceTo(idle)).toBeLessThan(0.02);
    expect(samples.at(-1)!.blade.distanceTo(idle)).toBeLessThan(0.02);
  });

  it('raises the blade for a skill instead of leaving it hanging', () => {
    const weapon = mountOf('weapon')!;
    animate.applyHumanPose(rig, { time: 0.6, walk: 0, phase: 0, grip: 'R', cast: 0.5 });
    character.updateMatrixWorld(true);
    const blade = new THREE.Vector3(0, 1, 0).applyQuaternion(weapon.getWorldQuaternion(new THREE.Quaternion()));
    expect(blade.y).toBeGreaterThan(0.8);
    animate.applyHumanPose(rig, { time: 0.6, walk: 0, phase: 0, grip: 'R' });
    character.updateMatrixWorld(true);
  });

  it('keeps the sculpted body’s own placements, which were authored for it', () => {
    const sculpt = new THREE.Group();
    const sockets = ['rig-head', 'rig-torso', 'rig-handR', 'rig-armL', 'rig-armR', 'rig-legL', 'rig-legR'];
    for (const name of sockets) {
      const node = new THREE.Object3D();
      node.name = name;
      sculpt.add(node);
    }
    const placed = equip.mountEquipment(sculpt, 'sculpt', EQUIPMENT, 0.55);
    // weapon, crown, two pauldrons, two boots, ring, necklace, talisman.
    expect(placed).toHaveLength(9);
    // No grip socket on the sculpted rig: its weapon keeps the fixed hand offset.
    expect(placed[0].parent?.name).toBe('rig-handR');
  });

  it('only asks for a fist when a weapon is held', () => {
    expect(equip.weaponHand('human', EQUIPMENT)).toBe('R');
    expect(equip.weaponHand('human', {})).toBeUndefined();
    expect(equip.weaponHand('sculpt', EQUIPMENT)).toBeUndefined();
  });
});
