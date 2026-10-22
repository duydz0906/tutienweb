import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';

/**
 * Guards the model graph against the failure that used to blank the whole page: storing an
 * Object3D inside `userData`. `Object3D.clone()` serialises user data with
 * `JSON.parse(JSON.stringify(...))`, so such a cycle throws "Converting circular structure to JSON"
 * while React is rendering. Every model is therefore checked for (a) clone-safe user data and
 * (b) actually being clonable, which is what the renderer does for each actor.
 */
let beasts: typeof import('./beasts');
let cultivator: typeof import('./cultivator');
let gear: typeof import('./gear');
let parts: typeof import('./parts');

beforeAll(async () => {
  // The procedural textures only need a 2D context; they are never uploaded in this environment.
  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => null }),
  };
  beasts = await import('./beasts');
  cultivator = await import('./cultivator');
  gear = await import('./gear');
  parts = await import('./parts');
});

const QUALITY = 0.55;
const PETS = ['spirit_fox', 'spirit_wolf', 'iron_boar', 'cloud_crane_pet', 'spirit_stag_pet', 'spirit_serpent', 'shadow_raven'];
const MOUNTS = ['flying_sword', 'cloud_disc', 'wind_fire_wheel', 'cloud_crane_mount', 'jade_stag_mount', 'ink_cloud', 'spirit_cloud'];
const MONSTERS = ['wolf', 'boar', 'shade', 'forest_serpent', 'stone_golem', 'spirit_stag', 'sky_wraith', 'cloud_crane',
  'void_serpent', 'star_guardian', 'thunder_bird'];

type Built = { label: string; model: THREE.Object3D };

function models(): Built[] {
  const built: Built[] = [];
  for (const id of PETS) built.push({ label: `pet:${id}`, model: beasts.buildPetModel(id, QUALITY) });
  for (const id of MOUNTS) built.push({ label: `mount:${id}`, model: beasts.buildMountModel(id, QUALITY) });
  for (const kind of MONSTERS) built.push({ label: `monster:${kind}`, model: beasts.buildMonsterModel(kind, { color: '#8899aa', glow: '#cceeff', quality: QUALITY }) });
  built.push({ label: 'boss:dragon', model: beasts.buildDragonBoss(QUALITY) });
  const look = { gender: 'nam' as const, hair: 'tied' as const, hairColor: 'ink' as const, face: 'oval' as const,
    skinTone: 'warm' as const, robeColor: 'ivory' as const, height: 0.6, build: 0.55, quality: QUALITY };
  built.push({ label: 'cultivator', model: cultivator.buildCultivator(look) });
  built.push({ label: 'cultivator:elder', model: cultivator.buildCultivator({ ...look, hairColor: 'silver', beard: true, staff: true }) });
  built.push({ label: 'cultivator:female', model: cultivator.buildCultivator({ ...look, gender: 'nu', hair: 'bun' }) });
  for (const [label, build] of Object.entries({
    weapon: () => gear.buildWeaponModel('jade_blade', QUALITY),
    crown: () => gear.buildCrownModel(QUALITY),
    pauldron: () => gear.buildPauldronModel(1, QUALITY),
    boots: () => gear.buildBootModel(-1, QUALITY),
    ring: () => gear.buildRingModel(QUALITY),
    necklace: () => gear.buildNecklaceModel(QUALITY),
    talisman: () => gear.buildTalismanModel(QUALITY),
    artifact: () => gear.buildArtifactModel(QUALITY),
    circlet: () => gear.buildCircletModel(QUALITY),
  })) built.push({ label: `gear:${label}`, model: build() });
  return built;
}

describe('sculpted models', () => {
  it('never store an Object3D inside userData', () => {
    const offenders: string[] = [];
    for (const { label, model } of models()) {
      model.traverse((node) => {
        try {
          JSON.stringify(node.userData);
        } catch {
          offenders.push(`${label} → ${node.name || node.type}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('can be cloned, which is how every actor gets its own copy', () => {
    for (const { label, model } of models()) {
      expect(() => model.clone(true), label).not.toThrow();
    }
  });

  it('keeps animated parts addressable after cloning', () => {
    const fox = beasts.buildPetModel('spirit_fox', QUALITY);
    const foxParts = parts.partsOf(fox);
    expect(foxParts.head).toBeDefined();
    expect(foxParts.legs).toHaveLength(4);
    expect(foxParts.tails).toHaveLength(9);

    const clone = fox.clone(true);
    const cloneParts = parts.partsOf(clone);
    expect(cloneParts.head).toBeDefined();
    expect(cloneParts.tails).toHaveLength(9);
    // The clone owns its own nodes, but they still share geometry with the prototype.
    expect(cloneParts.head).not.toBe(foxParts.head);
    const cloneHeadMesh = cloneParts.head?.children[0] as THREE.Mesh;
    const sourceHeadMesh = foxParts.head?.children[0] as THREE.Mesh;
    expect(cloneHeadMesh.geometry).toBe(sourceHeadMesh.geometry);

    expect(parts.partsOf(beasts.buildMountModel('cloud_crane_mount', QUALITY)).wings).toHaveLength(2);
    expect(parts.partsOf(beasts.buildMountModel('wind_fire_wheel', QUALITY)).wheels).toHaveLength(2);
    expect(parts.partsOf(beasts.buildDragonBoss(QUALITY)).pearl).toBeDefined();
  });

  it('reports a clear error when a model is not clone-safe', () => {
    const group = new THREE.Group();
    const child = new THREE.Mesh();
    group.add(child);
    // Reproduce the old bug on purpose.
    group.userData.parts = { head: group };
    expect(() => parts.assertCloneSafe(group)).toThrow(/không thể nhân bản/);
  });

  it('clones cached prototypes without sharing transforms', async () => {
    const cache = await import('./cache');
    const first = cache.clonePrototype('test:wolf', () => beasts.buildSpiritWolf(QUALITY));
    const second = cache.clonePrototype('test:wolf', () => beasts.buildSpiritWolf(QUALITY));
    expect(first).not.toBe(second);
    first.position.set(4, 0, 0);
    expect(second.position.x).toBe(0);
  });
});
