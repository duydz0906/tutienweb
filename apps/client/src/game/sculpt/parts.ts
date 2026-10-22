import * as THREE from 'three';

/**
 * Animated sub-parts (head, legs, wings, tails, wheels) are addressed by node **name**, never by
 * `userData`.
 *
 * `Object3D.clone()` copies user data with `JSON.parse(JSON.stringify(userData))`, so an Object3D
 * stored there is a circular structure (`part → .parent → model → .userData → part`) and cloning a
 * cached prototype throws `Converting circular structure to JSON`, which unmounts the whole React
 * tree and leaves a blank page. Names survive `clone(true)` and are never serialised, so they are
 * both safe and clone-friendly.
 */
export type BeastParts = {
  head?: THREE.Object3D;
  pearl?: THREE.Object3D;
  legs: THREE.Object3D[];
  wings: THREE.Object3D[];
  tails: THREE.Object3D[];
  wheels: THREE.Object3D[];
};

const PREFIX = 'beast-';
const cache = new WeakMap<THREE.Object3D, BeastParts>();

/** Give a part a stable, serialisable label. Indexes keep legs/wings/tails distinguishable. */
export function markPart(node: THREE.Object3D, part: 'head' | 'pearl' | 'leg' | 'wing' | 'tail' | 'wheel', index = 0): void {
  node.name = `${PREFIX}${part}-${index}`;
}

/** Label a whole set at once, so builders stay readable. */
export function markParts(parts: {
  head?: THREE.Object3D; pearl?: THREE.Object3D;
  legs?: THREE.Object3D[]; wings?: THREE.Object3D[]; tails?: THREE.Object3D[]; wheels?: THREE.Object3D[];
}): void {
  if (parts.head) markPart(parts.head, 'head');
  if (parts.pearl) markPart(parts.pearl, 'pearl');
  parts.legs?.forEach((leg, index) => markPart(leg, 'leg', index));
  parts.wings?.forEach((wing, index) => markPart(wing, 'wing', index));
  parts.tails?.forEach((tail, index) => markPart(tail, 'tail', index));
  parts.wheels?.forEach((wheel, index) => markPart(wheel, 'wheel', index));
}

/** Resolve the animated parts of a model (or of any clone of it). */
export function partsOf(root: THREE.Object3D): BeastParts {
  const cached = cache.get(root);
  if (cached) return cached;
  const found: BeastParts = { legs: [], wings: [], tails: [], wheels: [] };
  root.traverse((node) => {
    if (!node.name.startsWith(PREFIX)) return;
    const [part, index] = node.name.slice(PREFIX.length).split('-');
    if (part === 'head') found.head = node;
    else if (part === 'pearl') found.pearl = node;
    else if (part === 'leg') found.legs[Number(index)] = node;
    else if (part === 'wing') found.wings[Number(index)] = node;
    else if (part === 'tail') found.tails[Number(index)] = node;
    else if (part === 'wheel') found.wheels[Number(index)] = node;
  });
  cache.set(root, found);
  return found;
}

/**
 * Guard for the whole model graph: `clone()` must be able to serialise every userData block.
 * Called with the freshly built prototype so a regression fails loudly instead of blanking the page.
 */
export function assertCloneSafe(root: THREE.Object3D): void {
  root.traverse((node) => {
    try {
      JSON.stringify(node.userData);
    } catch {
      throw new Error(`Mô hình "${root.name || root.type}" chứa Object3D trong userData của `
        + `"${node.name || node.type}" — không thể nhân bản. Dùng markPart()/partsOf() thay thế.`);
    }
  });
}
