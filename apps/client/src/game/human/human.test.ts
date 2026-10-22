import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildHuman, humanLookKey, instantiateHuman, resetHumanPrototypes, rigOf, type HumanLook } from './character';
import { applyHumanPose, MEDITATE_HOVER, resetHumanPose } from './animation';
import type { HumanSource } from './source';
import { assertCloneSafe } from '../sculpt/parts';

/**
 * The real-human character is a skinned mesh plus proxies bound onto the same 52-bone skeleton.
 * These tests run the exact production builder against the shipped assets (a Node variation of
 * `browserHumanSource`), so a broken bind matrix, a missing hairstyle or a wrong bone axis fails
 * here instead of producing a floating or exploded character in the browser.
 */
const ASSETS = fileURLToPath(new URL('../../../public/human/', import.meta.url));
const loader = new GLTFLoader();

const nodeSource: HumanSource = {
  gltf(path) {
    const packed = gunzipSync(readFileSync(`${ASSETS}${path}`));
    const buffer = packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength);
    return new Promise((resolve, reject) => loader.parse(buffer as ArrayBuffer, '', (gltf) => resolve(gltf.scene as THREE.Group), reject));
  },
  // Node cannot decode WebP; materials then fall back to their flat PBR colours.
  texture: () => null,
};

const LOOK: HumanLook = {
  gender: 'nam', hair: 'long', hairColor: 'ink', face: 'oval',
  skinTone: 'warm', robeColor: 'jade', height: 0.5, build: 0.5,
};

function meshesOf(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const found: THREE.SkinnedMesh[] = [];
  root.traverse((object) => { if ((object as THREE.SkinnedMesh).isSkinnedMesh) found.push(object as THREE.SkinnedMesh); });
  return found;
}

function worldBox(mesh: THREE.SkinnedMesh): THREE.Box3 {
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  const count = mesh.geometry.attributes.position.count;
  const step = Math.max(1, Math.floor(count / 500));
  for (let i = 0; i < count; i += step) {
    mesh.getVertexPosition(i, point);
    box.expandByPoint(point);
  }
  return box;
}

function bonePosition(rig: ReturnType<typeof rigOf>, key: 'handL' | 'handR' | 'footL' | 'footR' | 'head'): THREE.Vector3 {
  const bone = rig.bones[key];
  if (!bone) throw new Error(`missing bone ${key}`);
  const point = new THREE.Vector3();
  bone.getWorldPosition(point);
  return point;
}

let character: THREE.Group;
/** Captured once, immediately after the build: `rigOf` snapshots the current pose as the bind pose. */
let rig: ReturnType<typeof rigOf>;

beforeAll(async () => {
  resetHumanPrototypes();
  character = await buildHuman(LOOK, 1, nodeSource);
  character.updateMatrixWorld(true);
  rig = rigOf(character);
}, 60_000);

describe('real human character', () => {
  it('builds a full human: body, hair, robe, eyes, brows, lashes and teeth', () => {
    const names = meshesOf(character).map((mesh) => mesh.name);
    expect(names).toContain('human-body');
    expect(names).toContain('human-hair');
    expect(names).toContain('human-robe');
    expect(names).toContain('human-eyes');
    expect(names).toContain('human-brows');
    // Detail proxies are dropped on low quality but present at full quality.
    expect(names).toContain('human-lashes');
    expect(names).toContain('human-teeth');
  });

  it('is a life-sized body, not a pile of boxes', () => {
    const body = meshesOf(character).find((mesh) => mesh.name === 'human-body')!;
    expect(body.geometry.attributes.position.count).toBeGreaterThan(10_000);
    const box = worldBox(body);
    const height = box.max.y - box.min.y;
    expect(height).toBeGreaterThan(1.5);
    expect(height).toBeLessThan(1.9);
    // A human is much wider than deep; a box body would have a square footprint.
    const width = box.max.x - box.min.x;
    const depth = box.max.z - box.min.z;
    expect(width / depth).toBeGreaterThan(2.2);
  });

  it('binds hair and eyes to the same skeleton so they follow the head', () => {
    const head = character.getObjectByName('human-hair')!;
    expect(head).toBeInstanceOf(THREE.SkinnedMesh);
    expect((head as THREE.SkinnedMesh).skeleton.bones.length).toBe(52);
    expect((head as THREE.SkinnedMesh).skeleton).toBe(
      (character.getObjectByName('human-body') as THREE.SkinnedMesh).skeleton);
    const headY = bonePosition(rig, 'head').y;
    const eyes = worldBox(character.getObjectByName('human-eyes') as THREE.SkinnedMesh);
    expect(eyes.min.y).toBeGreaterThan(headY);
    expect(eyes.min.y).toBeLessThan(headY + 0.25);
  });

  it('wears tu-tien trim over the cloth: inner yoke, crossed collar, sash and ribbons', () => {
    const trim = character.getObjectByName('human-trim');
    expect(trim).toBeTruthy();
    let parts = 0;
    trim!.traverse((child) => { if ((child as THREE.Mesh).isMesh) parts += 1; });
    // yoke + lapels (2, mirrored) + gold piping (2) + neck ring + sash + clasp + 2 ribbons
    expect(parts).toBeGreaterThanOrEqual(9);
    // Trim is placed from the measured skeleton, so the sash sits at waist height.
    rigOf(character);
    const sash = trim!.children.find((child) => (child as THREE.Mesh).isMesh && child.scale.y < 0.2);
    expect(sash).toBeTruthy();
  });

  it('gives elder NPCs a beard and a staff on the human rig', async () => {
    const elder = await buildHuman({ ...LOOK, beard: true, staff: true }, 1, nodeSource);
    elder.updateMatrixWorld(true);
    expect(elder.getObjectByName('human-flavor')).toBeTruthy();
    const staff = elder.getObjectByName('human-staff');
    expect(staff).toBeTruthy();
    // The staff is parented to the left-hand socket, so it follows the arm.
    expect(staff!.parent?.name).toBe('rig-handL');
    // A shaved student has neither prop.
    expect(character.getObjectByName('human-staff')).toBeFalsy();
  });

  it('puts cloth shoes on the character unless a boot item replaces them', async () => {
    const bare = await buildHuman({ ...LOOK, shoes: false }, 1, nodeSource);
    expect(bare.getObjectByName('human-shoes')).toBeFalsy();
  });

  it('exposes the rig sockets equipment hangs from', () => {
    expect(Object.keys(rig.bones)).toHaveLength(17);
    for (const socket of ['hips', 'torso', 'head', 'armL', 'armR', 'handL', 'handR', 'legL', 'legR', 'footL', 'footR']) {
      expect(rig.sockets[socket as keyof typeof rig.sockets]).toBeTruthy();
    }
  });

  it('walks with alternating legs and keeps both feet near the ground', () => {
    applyHumanPose(rig, { time: 1, walk: 0, phase: 0 });
    character.updateMatrixWorld(true);
    const idleL = bonePosition(rig, 'footL');
    const idleR = bonePosition(rig, 'footR');
    expect(idleL.y).toBeCloseTo(idleR.y, 3);

    applyHumanPose(rig, { time: 1, walk: 1, phase: Math.PI / 2 });
    character.updateMatrixWorld(true);
    const stepL = bonePosition(rig, 'footL');
    const stepR = bonePosition(rig, 'footR');
    // Opposite swing: one foot forward, the other behind.
    expect(Math.sign(stepL.z)).toBe(-Math.sign(stepR.z));
    expect(Math.abs(stepL.z - stepR.z)).toBeGreaterThan(0.4);
    expect(stepL.y).toBeGreaterThan(0);
    expect(stepR.y).toBeLessThan(0.45);
  });

  it('meditates hovering, with the knees folded under the robe', () => {
    const offset = applyHumanPose(rig, { time: 1, walk: 0, phase: 0, meditating: true });
    character.updateMatrixWorld(true);
    // Nhập định floats a little above the ground instead of clipping through it.
    expect(offset).toBeGreaterThan(MEDITATE_HOVER - 0.02);
    expect(offset).toBeLessThan(MEDITATE_HOVER + 0.02);
    const body = character.getObjectByName('human-body') as THREE.SkinnedMesh;
    const box = worldBox(body);
    expect(box.min.y + offset).toBeGreaterThan(-0.05);
    // Knees are drawn up: the ankles end up well above the standing pose.
    expect(bonePosition(rig, 'footL').y + offset).toBeGreaterThan(0.25);
  });

  it('clones keep every vertex where the prototype had it', async () => {
    // Earlier tests posed the shared prototype; compare bind pose to bind pose.
    resetHumanPose(rig);
    character.updateMatrixWorld(true);
    const key = humanLookKey(LOOK, 1);
    const clone = await instantiateHuman(key, LOOK, 1, nodeSource);
    clone.updateMatrixWorld(true);
    const original = meshesOf(character).find((mesh) => mesh.name === 'human-eyes')!;
    const copy = meshesOf(clone).find((mesh) => mesh.name === 'human-eyes')!;
    expect(copy).toBeTruthy();
    const a = new THREE.Vector3(); const b = new THREE.Vector3();
    for (let i = 0; i < original.geometry.attributes.position.count; i += 97) {
      original.getVertexPosition(i, a);
      copy.getVertexPosition(i, b);
      expect(b.distanceTo(a)).toBeLessThan(1e-4);
    }
  });

  it('clones into independent skeletons and stays safe to clone', async () => {
    const key = humanLookKey(LOOK, 1);
    const a = await instantiateHuman(key, LOOK, 1, nodeSource);
    const b = await instantiateHuman(key, LOOK, 1, nodeSource);
    const rigA = rigOf(a);
    const rigB = rigOf(b);
    expect(rigA.bones.handR).not.toBe(rigB.bones.handR);
    const restArm = rigB.bones.armR!.quaternion.clone();
    applyHumanPose(rigA, { time: 2, walk: 0, phase: 0, attack: 0.5 });
    // Posing one actor must not move the other.
    expect(rigA.bones.armR!.quaternion.equals(restArm)).toBe(false);
    expect(rigB.bones.armR!.quaternion.equals(restArm)).toBe(true);
    // The circular-userData crash is guarded: clones never carry an Object3D in userData.
    expect(() => assertCloneSafe(a)).not.toThrow();
    expect(() => assertCloneSafe(b)).not.toThrow();
  });
});
