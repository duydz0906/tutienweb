import * as THREE from 'three';
import type { EquipmentSlot } from '@van-thuong/shared';
import {
  buildBootModel, buildCrownModel, buildNecklaceModel, buildPauldronModel, buildRingModel,
  buildTalismanModel, buildWeaponModel,
} from './sculpt/gear';

/**
 * Equipment mounts.
 *
 * Two bodies wear the same sculpted items: the sculpted cultivator (1.93 m tall, 0.36 m head,
 * shoulder pivot 0.21 m off centre) and the real-human rig (1.66 m, 0.167 m head, shoulder pivot
 * 0.17 m off centre). Sculpted gear was authored for the first, so hanging it unchanged on the
 * human put a circlet around the face, dinner-plate pauldrons on the collarbones and a 2.6 m sword
 * through the legs. Everything below is therefore measured per body type, and each item is scaled
 * about its socket instead of being hand-offset. Socket transforms are the only placement data:
 * builders keep the offsets they were authored with.
 */

export type BodyKind = 'human' | 'sculpt';

export type Placement = {
  /** Socket node name; both rigs publish the same ones (see `HUMAN_SOCKETS` / `RIG`). */
  socket: string;
  scale: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
};

type Slot = 'weapon' | 'head' | 'shoulder' | 'boots' | 'ring' | 'necklace' | 'talisman';
type Sided = [left: Placement, right: Placement];

/**
 * Measured against the two rigs:
 *  · crown — a human head is 0.167 m wide, so the 0.19 m circlet comes down to 0.087 m;
 *  · pauldron — a 0.40 m dome belongs on a 0.25 m upper arm, not across the chest;
 *  · boots — the human foot is 0.17 m long and 0.09 m wide, the boot spline 0.35 m;
 *  · ring — a finger is ~0.018 m across, so a 0.064 m band becomes a ring, not a bracelet;
 *  · weapon — the human holds a 1.2 m jian (1.93 m body: 1.55 m), never a 2.6 m slab.
 */
const PLACEMENT: Record<BodyKind, Record<Slot, Placement | Sided>> = {
  human: {
    // `rig-gripR` sits in the closed right fist and already points the blade down the side.
    weapon: { socket: 'rig-gripR', scale: 0.4 },
    // The crown builder lifts the circlet 0.24 m above the socket: 0.132 m here, onto the forehead.
    head: { socket: 'rig-head', scale: 0.55 },
    // Strapped to the chest, not to the upper arm: a shoulder rotates with every swing, a pauldron
    // does not. The chest socket is world-aligned, so these offsets are metres.
    shoulder: [
      { socket: 'rig-torso', scale: 0.45, position: [0.2, 0.095, 0.02] },
      { socket: 'rig-torso', scale: 0.45, position: [-0.2, 0.095, 0.02] },
    ],
    boots: [
      { socket: 'rig-footL', scale: 0.55 },
      { socket: 'rig-footR', scale: 0.55 },
    ],
    // The band builder sits 5 cm below its socket, i.e. 1.5 cm down the ring finger at this scale.
    ring: { socket: 'rig-ringR', scale: 0.3, position: [0, 0.015, 0] },
    necklace: { socket: 'rig-torso', scale: 0.62, position: [0, 0.105, 0.012] },
    // Baked into the model: the plate hangs 0.17 m to the left and 0.14 m down; the offset below
    // puts the finished talisman on the belt, just outside the robe.
    talisman: { socket: 'rig-torso', scale: 0.85, position: [-0.035, -0.15, 0.04] },
  },
  sculpt: {
    weapon: { socket: 'rig-handR', scale: 0.62, position: [0, -0.1, 0.02], rotation: [0.16, 0, -0.2] },
    head: { socket: 'rig-head', scale: 1 },
    // The sculpted rig publishes its left arm on the -X side, opposite to the human rig.
    shoulder: [
      { socket: 'rig-armL', scale: 1, position: [0.02, 0.02, 0] },
      { socket: 'rig-armR', scale: 1, position: [0.02, 0.02, 0] },
    ],
    boots: [
      { socket: 'rig-legL', scale: 1.06, position: [0, -1.3, 0.02] },
      { socket: 'rig-legR', scale: 1.06, position: [0, -1.3, 0.02] },
    ],
    ring: { socket: 'rig-handR', scale: 1, position: [0, -0.16, 0.06] },
    necklace: { socket: 'rig-torso', scale: 1, position: [0, 0.62, 0.06] },
    talisman: { socket: 'rig-torso', scale: 1 },
  },
};

function mount(model: THREE.Object3D, host: THREE.Object3D, placement: Placement, name: string): THREE.Object3D {
  const group = new THREE.Group();
  // Named per slot so tests (and the debug scene) can find one item without guessing by size.
  group.name = `equipment-mount:${name}`;
  if (placement.position) group.position.set(...placement.position);
  if (placement.rotation) group.rotation.set(...placement.rotation);
  group.scale.setScalar(placement.scale);
  group.add(model);
  host.add(group);
  return group;
}

export type EquipmentState = Partial<Record<EquipmentSlot, string>>;

/**
 * Attach every equipped item to its socket and return the mount groups, so the caller can detach
 * them without touching the rig. A missing socket is skipped rather than thrown: an older or
 * fallback body must never take the whole avatar down.
 */
export function mountEquipment(root: THREE.Object3D, kind: BodyKind, equipment: EquipmentState,
  quality = 1): THREE.Object3D[] {
  const table = PLACEMENT[kind];
  const groups: THREE.Object3D[] = [];
  const add = (model: THREE.Object3D, placement: Placement, name: string): void => {
    const host = root.getObjectByName(placement.socket);
    if (host) groups.push(mount(model, host, placement, name));
  };
  const addSided = (slot: 'shoulder' | 'boots', build: (side: 1 | -1) => THREE.Object3D): void => {
    const [left, right] = table[slot] as Sided;
    add(build(-1), left, `${slot}:L`);
    add(build(1), right, `${slot}:R`);
  };

  if (equipment.weapon) add(buildWeaponModel(equipment.weapon, quality), table.weapon as Placement, 'weapon');
  if (equipment.head) add(buildCrownModel(quality), table.head as Placement, 'head');
  if (equipment.shoulder) addSided('shoulder', (side) => buildPauldronModel(side, quality));
  if (equipment.boots) addSided('boots', (side) => buildBootModel(side, quality));
  // The ring goes on the gripping hand: the human holds steel in the right one.
  if (equipment.ring) add(buildRingModel(quality), table.ring as Placement, 'ring');
  if (equipment.necklace) add(buildNecklaceModel(quality), table.necklace as Placement, 'necklace');
  if (equipment.talisman) add(buildTalismanModel(quality), table.talisman as Placement, 'talisman');

  // The sculpted body carries a bare blade in its right hand; an equipped weapon replaces it.
  const bare = root.getObjectByName('cultivator-sword');
  if (bare) bare.visible = !equipment.weapon;
  return groups;
}

/** Which fist closes around a weapon, so the pose can curl exactly that hand. */
export function weaponHand(kind: BodyKind, equipment: EquipmentState): 'L' | 'R' | undefined {
  return equipment.weapon && kind === 'human' ? 'R' : undefined;
}
