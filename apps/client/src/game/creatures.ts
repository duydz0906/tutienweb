import * as THREE from 'three';
import { partsOf } from './sculpt/parts';

/**
 * Procedural life for the sculpted creatures (pets, mounts, field monsters, the world boss).
 *
 * Before this every creature was a statue that only bobbed up and down: the models already mark
 * their legs, wings, tails, heads, wheels and pearls by NAME (`sculpt/parts.ts`), so one clock can
 * drive all of them. Poses are offsets from the authored rest transform, which is cached the first
 * time a model is animated — a clawed paw, a coiled tail or a feathered wing keeps the shape it was
 * sculpted with and only gains motion.
 */
export type CreatureMotion = {
  /** Seconds since the actor was mounted (the R3F clock). */
  time: number;
  /** 0 = standing still and breathing, 1 = travelling at full speed. */
  moving?: number;
  /** Wings: birds beat them, quadrupeds fold them. */
  flying?: boolean;
  /** Legless creatures (serpents, wraiths) weave their whole body instead of stepping. */
  sway?: boolean;
  /** Multiplies every speed; a sprinting mount moves faster than a grazing pet. */
  tempo?: number;
};

type Rest = { rotation: THREE.Euler; position: THREE.Vector3 };

const rests = new WeakMap<THREE.Object3D, Rest>();

/** Remember the transform a part was authored with, so animation is always relative to it. */
function restOf(part: THREE.Object3D): Rest {
  let rest = rests.get(part);
  if (!rest) {
    rest = { rotation: part.rotation.clone(), position: part.position.clone() };
    rests.set(part, rest);
  }
  return rest;
}

/** One creature's pose for one frame. Cheap enough for a whole battlefield of monsters. */
export function animateCreature(root: THREE.Object3D, motion: CreatureMotion): void {
  const time = motion.time;
  const tempo = motion.tempo ?? 1;
  const speed = Math.min(1, Math.max(0, motion.moving ?? 0.35));
  const parts = partsOf(root);

  for (const [index, leg] of parts.legs.entries()) {
    if (!leg) continue;
    const rest = restOf(leg);
    // Diagonal pairs move together, which is how a four-legged animal actually walks.
    const phase = time * (2.4 + 3.4 * speed) * tempo + (index % 2 === 0 ? 0 : Math.PI) + (index < 2 ? 0 : Math.PI / 2.6);
    const step = Math.sin(phase) * (0.08 + 0.34 * speed);
    leg.rotation.set(rest.rotation.x + step, rest.rotation.y, rest.rotation.z);
  }

  for (const [index, wing] of parts.wings.entries()) {
    if (!wing) continue;
    const rest = restOf(wing);
    // Wings are mirrored, so the lift has to be mirrored too: +X wing rises with +Z rotation.
    const side = wing.position.x >= 0 ? 1 : -1;
    const beat = motion.flying ? 0.95 : 0.32 + 0.3 * speed;
    const flap = Math.sin(time * (motion.flying ? 7.2 : 2.1) * tempo + index * 0.35) * beat;
    wing.rotation.set(rest.rotation.x + Math.sin(time * 1.6) * 0.04,
      rest.rotation.y, rest.rotation.z + side * flap);
  }

  for (const [index, tail] of parts.tails.entries()) {
    if (!tail) continue;
    const rest = restOf(tail);
    const wave = Math.sin(time * (1.5 + 2.2 * speed) * tempo - index * 0.42);
    tail.rotation.set(rest.rotation.x + wave * 0.06,
      rest.rotation.y + wave * (0.12 + 0.14 * speed),
      rest.rotation.z + Math.cos(time * 1.3 - index * 0.42) * 0.05);
  }

  if (parts.head) {
    const rest = restOf(parts.head);
    parts.head.rotation.set(rest.rotation.x + Math.sin(time * 0.9) * 0.05 + (motion.flying ? -0.08 : 0),
      rest.rotation.y + Math.sin(time * 0.55 + 0.7) * 0.18, rest.rotation.z);
  }

  for (const wheel of parts.wheels) {
    if (!wheel) continue;
    const rest = restOf(wheel);
    wheel.rotation.set(rest.rotation.x, rest.rotation.y,
      rest.rotation.z + time * (2.2 + 2.6 * speed) * tempo);
  }

  if (parts.pearl) {
    const rest = restOf(parts.pearl);
    const orbit = time * 1.1;
    parts.pearl.position.set(rest.position.x + Math.cos(orbit) * 0.16, rest.position.y + Math.sin(orbit * 1.7) * 0.1,
      rest.position.z + Math.sin(orbit) * 0.16);
  }

  if (motion.sway) {
    // A serpent or wraith has one long body: weaving the whole model is what makes it read as alive.
    root.rotation.y = Math.sin(time * 0.85 * tempo) * (0.12 + 0.16 * speed);
    root.rotation.z = Math.cos(time * 0.7 * tempo) * 0.035;
  } else {
    root.rotation.y = 0;
    root.rotation.z = 0;
  }
}

/** Which creatures weave instead of walking, and which ones beat their wings. */
export function creatureKindTraits(kind: string): { sway: boolean; flying: boolean } {
  const flying = ['cloud_crane', 'thunder_bird', 'cloud_crane_pet', 'cloud_crane_mount', 'sky_wraith', 'soul_raven', 'shadow_raven'];
  const sway = ['forest_serpent', 'void_serpent', 'spirit_serpent', 'shade', 'sky_wraith', 'ink_cloud', 'spirit_cloud'];
  return { sway: sway.includes(kind), flying: flying.includes(kind) };
}
