import * as THREE from 'three';
import { ROBE_HEX } from '../humanAppearance';
import type { HumanLook, HumanRig } from './character';

/**
 * Cloth trim on top of the CC0 garment, so the character reads as a tu tiên robe instead of a
 * modern dress: a crossed collar (giao lĩnh) over the chest, a waist sash with a jade clasp and a
 * hanging ribbon. These are rigid props anchored to the measured skeleton, not skinned meshes —
 * they sit where the torso barely deforms, and cost one draw call each.
 */
const DARKEN = 0.55;

/**
 * Trim uses plain PBR silk rather than the sculpted materials module, which paints its weave on a
 * `<canvas>` at import time — the human pipeline must stay usable outside a DOM (tests, native).
 */
const trimMaterials = new Map<string, THREE.MeshStandardMaterial>();
function silk(color: string): THREE.MeshStandardMaterial {
  const cached = trimMaterials.get(color);
  if (cached) return cached;
  const material = new THREE.MeshStandardMaterial({
    color, roughness: 0.42, metalness: 0.1, side: THREE.DoubleSide,
    emissive: color, emissiveIntensity: 0.04,
  });
  trimMaterials.set(color, material);
  return material;
}

const jadeClasp = new THREE.MeshStandardMaterial({ color: '#e9f7ee', metalness: 0.1, roughness: 0.22,
  emissive: '#9fe8c6', emissiveIntensity: 0.2, side: THREE.DoubleSide });
const goldTie = new THREE.MeshStandardMaterial({ color: '#d9b072', metalness: 0.88, roughness: 0.24,
  emissive: '#7c4d13', emissiveIntensity: 0.12 });

function darkened(hex: string): string {
  return `#${new THREE.Color(hex).multiplyScalar(DARKEN).getHexString()}`;
}

function worldOf(bone: THREE.Bone | undefined, fallback: THREE.Vector3): THREE.Vector3 {
  if (!bone) return fallback.clone();
  return bone.getWorldPosition(new THREE.Vector3());
}

/** Hanging ribbon: a tapered cloth strip that stays readable from the front. */
function ribbon(color: string, length: number, width: number): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2 - 0.01, -length);
  shape.lineTo(-width / 2 + 0.015, -length * 0.96);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 8);
  const mesh = new THREE.Mesh(geometry, silk(color));
  mesh.castShadow = true;
  return mesh;
}

/** Radii of the garment at a given height, so trim sits ON the cloth instead of inside it. */
function clothRadii(root: THREE.Object3D, y: number, tolerance = 0.04): { x: number; z: number } {
  const robe = root.getObjectByName('human-robe');
  const mesh = robe as THREE.Mesh | undefined;
  if (!mesh?.geometry) return { x: 0.19, z: 0.14 };
  const position = mesh.geometry.attributes.position as THREE.BufferAttribute;
  const point = new THREE.Vector3();
  let x = 0; let z = 0;
  for (let i = 0; i < position.count; i += 3) {
    point.fromBufferAttribute(position, i);
    if (Math.abs(point.y - y) > tolerance) continue;
    x = Math.max(x, Math.abs(point.x));
    z = Math.max(z, Math.abs(point.z));
  }
  return { x: x || 0.19, z: z || 0.14 };
}

export function addRobeTrim(root: THREE.Group, rig: HumanRig, look: HumanLook): THREE.Group {
  const trim = new THREE.Group();
  trim.name = 'human-trim';
  const robe = ROBE_HEX[look.robeColor];
  const collarColor = darkened(robe);
  const chest = worldOf(rig.bones.chest, new THREE.Vector3(0, 1.32, 0));
  const hips = worldOf(rig.bones.hips, new THREE.Vector3(0, 0.92, 0));
  const neck = worldOf(rig.bones.neck, new THREE.Vector3(0, 1.4, 0));
  const shoulderL = worldOf(rig.bones.armL, new THREE.Vector3(0.18, 1.32, 0));
  const shoulderR = worldOf(rig.bones.armR, new THREE.Vector3(-0.18, 1.32, 0));
  const halfShoulder = Math.abs(shoulderL.x - shoulderR.x) / 2;
  const waistY = hips.y + 0.09;
  const waist = clothRadii(root, waistY);
  const chestCloth = clothRadii(root, chest.y, 0.12);

  // 0. Inner robe (trung y): a cream yoke from the throat down to the garment neckline. Without it
  //    the CC0 dress leaves bare skin across the chest, which reads as modern, not tu tiên.
  const yokeTop = neck.y - 0.03;
  const yokeBottom = chest.y - 0.1;
  const yokeHeight = Math.max(0.1, yokeTop - yokeBottom);
  const yoke = new THREE.Mesh(new THREE.CylinderGeometry(halfShoulder * 0.5, chestCloth.x * 0.96, yokeHeight, 28, 1, true),
    silk('#efe6d5'));
  yoke.position.set(0, yokeTop - yokeHeight / 2, 0);
  yoke.scale.set(1, 1, 0.78);
  yoke.castShadow = true;
  trim.add(yoke);

  // 1. Giao lĩnh collar: a band around the throat plus two crossed lapels over the chest.
  //    Drawn as flat bands laid ON the cloth (never coincident with it, or it z-fights).
  const frontZ = chestCloth.z + 0.012;
  const collarTop = neck.y - 0.005;
  const collarBottom = chest.y - 0.16;
  const neckRing = new THREE.Mesh(new THREE.TorusGeometry(halfShoulder * 0.34, 0.016, 10, 32), silk(collarColor));
  neckRing.rotation.x = Math.PI / 2;
  neckRing.position.set(0, collarTop, frontZ * 0.35);
  neckRing.scale.set(1, 0.8, 1);
  neckRing.castShadow = true;
  trim.add(neckRing);

  // Lapels: a short crossed V from the collarbone to the sternum (never up over the throat).
  const lapelLength = 0.2;
  const lapelY = chest.y + 0.02;
  for (const side of [1, -1] as const) {
    const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.06, lapelLength, 0.012), silk(collarColor));
    lapel.position.set(side * halfShoulder * 0.22, lapelY, frontZ);
    lapel.rotation.z = side * 0.5;
    lapel.rotation.x = -0.12;
    lapel.castShadow = true;
    trim.add(lapel);
    // Gold piping down the lapel edge.
    const piping = new THREE.Mesh(new THREE.BoxGeometry(0.011, lapelLength * 0.95, 0.014), goldTie);
    piping.position.set(side * (halfShoulder * 0.22 + 0.031), lapelY, frontZ + 0.002);
    piping.rotation.z = side * 0.5;
    piping.rotation.x = -0.12;
    trim.add(piping);
  }

  // 2. Waist sash with a jade clasp — the classic cultivator belt.
  const sash = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 36, 1, true), silk(darkened(robe)));
  sash.scale.set(waist.x + 0.012, 0.085, waist.z + 0.012);
  sash.position.set(0, waistY, 0);
  sash.castShadow = true;
  trim.add(sash);
  const clasp = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), jadeClasp);
  clasp.position.set(0, waistY, waist.z + 0.02);
  trim.add(clasp);

  // 3. Two ribbons hanging off the sash.
  for (const side of [-1, 1] as const) {
    const strip = ribbon(side > 0 ? collarColor : darkened(robe), 0.42, 0.05);
    strip.position.set(side * 0.055, waistY - 0.04, waist.z * 0.92);
    strip.rotation.y = side * 0.06;
    strip.rotation.z = side * 0.03;
    trim.add(strip);
  }

  // 4. Hair tie so tied/braided hair has a visible binding.
  if (look.hair === 'tied' || look.hair === 'braid' || look.hair === 'bun') {
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.008, 8, 20), goldTie);
    tie.position.set(0, neck.y + 0.1, -0.09);
    tie.rotation.x = Math.PI / 2.6;
    trim.add(tie);
  }

  trim.traverse((child) => { child.matrixAutoUpdate = false; child.updateMatrix(); });
  root.add(trim);
  return trim;
}

/**
 * Elder NPC props: a beard bound to the head and a jade staff in the left hand. Both are rigid
 * children of the measured skeleton, so they follow the head and hand bones without extra work.
 */
export function addFlavor(root: THREE.Group, rig: HumanRig, look: HumanLook): THREE.Group | null {
  if (!look.beard && !look.staff) return null;
  const flavor = new THREE.Group();
  flavor.name = 'human-flavor';
  const headSocket = rig.sockets.head;
  const handSocket = rig.sockets.handL;

  if (look.beard && headSocket) {
    const hairColor = look.hairColor === 'silver' || look.hairColor === 'ash' ? '#e1e0d8' : '#d8d4cc';
    const beardMaterial = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.85, metalness: 0 });
    // Tapered cone from the jaw down: a long scholar's beard, not a blob.
    const beard = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.4, 18, 4, true), beardMaterial);
    beard.position.set(0, -0.1, 0.085);
    beard.rotation.x = 0.16;
    beard.scale.set(1, 1, 0.6);
    beard.castShadow = true;
    flavor.add(beard);
    const moustache = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 8, 18, Math.PI), beardMaterial);
    moustache.position.set(0, 0.035, 0.075);
    moustache.rotation.set(0.4, 0, 0);
    flavor.add(moustache);
    headSocket.add(flavor);
  }

  if (look.staff && handSocket) {
    const staff = new THREE.Group();
    staff.name = 'human-staff';
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 1.5, 12), new THREE.MeshStandardMaterial({
      color: '#5c4433', roughness: 0.55, metalness: 0.08,
    }));
    pole.position.set(0, -0.15, 0);
    pole.castShadow = true;
    staff.add(pole);
    // The hand socket's local +Y points down the arm, so the head of the staff is at -Y.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.013, 10, 28), goldTie);
    ring.position.set(0, -0.86, 0);
    staff.add(ring);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 18, 14), jadeClasp);
    orb.position.set(0, -0.86, 0);
    staff.add(orb);
    staff.position.set(0, 0.02, 0.06);
    staff.rotation.set(0.08, 0, 0.05);
    handSocket.add(staff);
  }

  return flavor;
}
