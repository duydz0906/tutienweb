import * as THREE from 'three';

/**
 * Sculpted models are expensive to build and identical for identical looks, so each unique
 * configuration is built once and cloned per actor. Clones share geometry and materials;
 * only the node transforms (and therefore the animation) are independent.
 */
const prototypes = new Map<string, THREE.Group>();

const LIMIT = 64;

export function clonePrototype(key: string, build: () => THREE.Group): THREE.Group {
  let prototype = prototypes.get(key);
  if (!prototype) {
    prototype = build();
    prototypes.set(key, prototype);
    // Clones keep their own reference to the shared geometry, so evicting the oldest entry is safe.
    while (prototypes.size > LIMIT) {
      const oldest = prototypes.keys().next();
      if (oldest.done || oldest.value === key) break;
      prototypes.delete(oldest.value);
    }
  }
  return prototype.clone(true);
}

/** Bound the cache so a big appearance sweep cannot leak GPU memory forever. */
export function trimPrototypes(limit = 48): void {
  while (prototypes.size > limit) {
    const oldest = prototypes.keys().next();
    if (oldest.done) break;
    prototypes.delete(oldest.value);
  }
}
