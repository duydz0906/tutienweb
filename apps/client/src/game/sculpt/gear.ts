import * as THREE from 'three';
import { MATS, silk } from './materials';
import { buildDetailedSword } from './beasts';
import { bladeGeometry, meshOf, pleatedLathe, seg, taperedSpline } from './geometry';

/**
 * Equipment is sculpted from the same vocabulary as the body: beveled blades, gold trim and
 * jade inlays. Each builder returns a group already oriented for its rig socket.
 */
/**
 * Blade length per socket: 3.35 units from pommel to tip, so the grip is centred at the origin
 * (`GRIP_CENTRE`) and the whole figure is scaled to the body that wears it in `equipment.ts`.
 * An earlier version left the model origin at the guard and then rotated the sword inside the
 * hand, which threw a 2.6 m blade across the character.
 */
const GRIP_CENTRE = 0.78;
const SWORD_SCALE = 0.78;

export function buildWeaponModel(itemId: string, quality = 1): THREE.Group {
  const sword = new THREE.Group();
  sword.name = 'weapon-model';
  const blade = buildDetailedSword(weaponBlade(itemId), MATS.gold, SWORD_SCALE, quality);
  // The pleated grip runs from y -1.02 to -0.54; move the sword so the hand sits on its middle.
  blade.position.y = GRIP_CENTRE * SWORD_SCALE;
  sword.add(blade);
  return sword;
}

function weaponBlade(itemId: string): THREE.Material {
  if (itemId === 'immortal_sword') {
    return new THREE.MeshStandardMaterial({ color: '#ff9b86', metalness: 0.75, roughness: 0.22,
      emissive: '#ff3b24', emissiveIntensity: 2.1 });
  }
  if (itemId === 'jade_blade') return MATS.jade;
  return new THREE.MeshStandardMaterial({ color: '#cfd8c9', metalness: 0.7, roughness: 0.3,
    emissive: '#5c6c60', emissiveIntensity: 0.3 });
}

/** Lưu Vân Quan: gold circlet with swept wings and three floating jade beads. */
export function buildCrownModel(quality = 1): THREE.Group {
  const crown = new THREE.Group();
  crown.add(meshOf(new THREE.TorusGeometry(0.19, 0.022, 12, 44), MATS.gold, [0, 0.02, 0], [Math.PI / 2, 0, 0]));
  for (const [index, angle] of [-0.55, 0, 0.55].entries()) {
    crown.add(meshOf(new THREE.SphereGeometry(0.03, 16, 12), MATS.whiteJade,
      [Math.sin(angle) * 0.19, 0.07 + (index === 1 ? 0.02 : 0), Math.cos(angle) * 0.19]));
  }
  for (const side of [-1, 1] as const) {
    // Wings sweep back over the skull (a Lưu Vân crest), not up like antlers.
    crown.add(taperedSpline([[side * 0.1, 0.02, -0.04], [side * 0.22, 0.08, -0.24], [side * 0.31, 0.12, -0.46]],
      (u) => (1 - u * 0.8) * 0.022, MATS.gold, { quality, tubular: 18, radial: 10 }));
  }
  crown.position.set(0, 0.24, 0.01);
  return crown;
}

/** Huyền Thiết Hộ Vai: domed pauldron with a gold rim and a shoulder spike. */
export function buildPauldronModel(side: 1 | -1, quality = 1): THREE.Group {
  const pauldron = new THREE.Group();
  const dome = meshOf(new THREE.SphereGeometry(0.17, seg(26, quality, 12), seg(26, quality, 12), 0, Math.PI * 2, 0, Math.PI * 0.6),
    MATS.darkIron, [0, 0.02, 0], [0, 0, 0], [1.15, 0.85, 1.05]);
  dome.material = new THREE.MeshStandardMaterial({ color: '#5a616b', metalness: 0.82, roughness: 0.3 });
  pauldron.add(dome);
  pauldron.add(meshOf(new THREE.TorusGeometry(0.155, 0.015, 12, 36), MATS.gold, [0, -0.01, 0], [Math.PI / 2, 0, 0], [1.08, 1, 1]));
  pauldron.add(meshOf(bladeGeometry(0.28, 0.06, 0.02, -0.05), MATS.gold, [side * 0.1, 0.08, -0.02], [-0.4, 0, side * 0.5]));
  pauldron.position.set(side * 0.03, 0.03, 0);
  return pauldron;
}

/** Đạp Vân Ngoa: rounded boot with a metal toe cap and a cloud ring. */
export function buildBootModel(side: 1 | -1, quality = 1): THREE.Group {
  const boot = new THREE.Group();
  const leather = new THREE.MeshStandardMaterial({ color: '#59646a', metalness: 0.35, roughness: 0.46 });
  boot.add(taperedSpline([[0, 0.17, 0.02], [0, 0.07, 0.16], [0, 0.035, 0.35]], (u) => 0.075 * (1 - u * 0.3),
    leather, { quality, tubular: 16, radial: 14, aspect: () => [0.82, 1.1] }));
  boot.add(meshOf(new THREE.SphereGeometry(0.075, seg(18, quality, 10), seg(18, quality, 10)), MATS.darkStone,
    [0, 0.032, 0.21], [0, 0, 0], [0.85, 0.42, 1.55]));
  boot.add(meshOf(new THREE.TorusGeometry(0.055, 0.013, 10, 26), MATS.glowCyan, [0, 0.13, 0.07], [Math.PI / 2, 0, 0]));
  boot.rotation.y = side * 0.04;
  return boot;
}

/** Tụ Linh Giới: banded ring with a jade focus that orbits the knuckle. */
export function buildRingModel(quality = 1): THREE.Group {
  const ring = new THREE.Group();
  ring.add(meshOf(new THREE.TorusGeometry(0.032, 0.009, 12, 26), MATS.gold, [0, -0.05, 0], [Math.PI / 2, 0, 0]));
  ring.add(meshOf(new THREE.OctahedronGeometry(0.024, 1), MATS.glowJade, [0, -0.05, 0.03]));
  return ring;
}

/** Ngọc Tâm Bội: beaded chain, carved jade medallion and a silk tassel. */
export function buildNecklaceModel(quality = 1): THREE.Group {
  const necklace = new THREE.Group();
  necklace.add(meshOf(new THREE.TorusGeometry(0.16, 0.008, 10, 44), MATS.gold, [0, 0.02, 0], [Math.PI / 2.6, 0, 0], [1, 1, 0.8]));
  necklace.add(meshOf(new THREE.SphereGeometry(0.045, seg(18, quality, 10), seg(18, quality, 10)), MATS.jade,
    [0, -0.12, 0.13], [0, 0, 0], [1, 1.25, 0.45]));
  necklace.add(meshOf(new THREE.TorusGeometry(0.05, 0.01, 10, 26), MATS.gold, [0, -0.12, 0.13], [0, 0, 0], [1, 1.25, 0.4]));
  necklace.add(taperedSpline([[0, -0.16, 0.14], [0.02, -0.34, 0.16], [-0.01, -0.5, 0.14]],
    (u) => 0.014 - u * 0.006, silk('#a8494f'), { quality, tubular: 14, radial: 8 }));
  necklace.position.set(0, 0.06, 0.02);
  return necklace;
}

/** Liên Hoa Phù: gilded talisman plate with a glowing rune face. */
export function buildTalismanModel(quality = 1): THREE.Group {
  const talisman = new THREE.Group();
  talisman.add(meshOf(new THREE.BoxGeometry(0.09, 0.17, 0.01), MATS.gold));
  talisman.add(meshOf(new THREE.PlaneGeometry(0.07, 0.14), MATS.glowFire, [0, 0, 0.008]));
  talisman.add(meshOf(new THREE.TorusGeometry(0.028, 0.006, 8, 20), MATS.gold, [0, 0.1, 0]));
  talisman.position.set(0.17, -0.14, 0.12);
  talisman.rotation.z = 0.18;
  return talisman;
}

/** Bản Mệnh Châu: the soul orb that circles the cultivator. */
export function buildArtifactModel(quality = 1): THREE.Group {
  const artifact = new THREE.Group();
  artifact.add(meshOf(new THREE.OctahedronGeometry(0.16, 2), MATS.glowJade));
  artifact.add(meshOf(new THREE.TorusGeometry(0.24, 0.01, 10, 36), MATS.glowCyan, [0, 0, 0], [Math.PI / 2, 0, 0]));
  artifact.add(meshOf(new THREE.TorusGeometry(0.22, 0.008, 10, 36), MATS.gold, [0, 0, 0], [0, Math.PI / 3, 0.4]));
  return artifact;
}

/** Small jade circlet used by NPC elders who do not wear the full armour set. */
export function buildCircletModel(quality = 1): THREE.Group {
  const circlet = new THREE.Group();
  circlet.add(meshOf(new THREE.TorusGeometry(0.2, 0.014, 12, 40), MATS.jade, [0, 0.22, 0], [Math.PI / 2, 0, 0]));
  const pin = pleatedLathe([[0.008, 0], [0.01, 0.18]], MATS.gold, { quality, segments: 12, pleats: 6, pleatDepth: 0.002 });
  pin.rotation.z = Math.PI / 2;
  pin.position.set(0, 0.24, -0.02);
  circlet.add(pin);
  return circlet;
}
