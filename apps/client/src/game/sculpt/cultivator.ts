import * as THREE from 'three';
import { HAIR_HEX, ROBE_HEX, SKIN_HEX } from '../humanAppearance';
import { MATS, bladeSteel, hairMaterial, ribbonSilk, silk, skinMaterial } from './materials';
import { bladeGeometry, meshOf, pleatedLathe, seg, taperedSpline, type Point3 } from './geometry';

export type CultivatorLook = {
  gender: 'nam' | 'nu';
  hair: keyof typeof HAIR_MESH;
  hairColor: keyof typeof HAIR_HEX;
  face: 'oval' | 'round' | 'angular' | 'heart';
  skinTone: keyof typeof SKIN_HEX;
  robeColor: keyof typeof ROBE_HEX;
  height: number;
  build: number;
  beard?: boolean;
  staff?: boolean;
  quality?: number;
};

/** Rig nodes every consumer can look up by name (equipment mounts and animation pivots). */
export const RIG = {
  hips: 'rig-hips', torso: 'rig-torso', head: 'rig-head',
  armL: 'rig-armL', armR: 'rig-armR', handL: 'rig-handL', handR: 'rig-handR',
  legL: 'rig-legL', legR: 'rig-legR', skirt: 'rig-skirt', ribbonL: 'rig-ribbonL', ribbonR: 'rig-ribbonR',
} as const;

const HAIR_MESH = {
  long: 'long', tied: 'tied', bob: 'bob', braid: 'braid', bun: 'bun', short: 'short', cropped: 'cropped',
} as const;

function buildSculptedHead(faceShape: CultivatorLook['face'], hairStyle: CultivatorLook['hair'],
  hairMat: THREE.Material, skinMat: THREE.Material, quality: number, hasBeard = false): THREE.Group {
  const head = new THREE.Group();

  // 1. Cranium, cheekbones, brow ridge and jawline, sculpted from one dense sphere.
  const craniumGeometry = new THREE.SphereGeometry(0.24, seg(64, quality, 22), seg(64, quality, 22));
  const position = craniumGeometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    let x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    y *= 1.08;
    if (y < 0.02) {
      const t = Math.min(1, Math.abs(y - 0.02) / 0.27);
      if (faceShape === 'oval') { x *= 1 - Math.pow(t, 1.15) * 0.44; z *= 1 - Math.pow(t, 1.3) * 0.22; }
      else if (faceShape === 'heart') { x *= 1 - Math.pow(t, 0.85) * 0.56; z *= 1 - t * 0.24; }
      else if (faceShape === 'angular') { x *= t < 0.55 ? 0.94 - t * 0.15 : 0.86 - (t - 0.55) * 0.85; z *= 0.96 - t * 0.15; }
      else { x *= 1.04 - Math.pow(t, 1.4) * 0.24; y *= 0.94; }
      if (z > 0.08 && y > -0.08 && y < 0.01 && Math.abs(x) > 0.08) {
        z += 0.014 * Math.sin(((y + 0.08) / 0.09) * Math.PI);
        x *= 1.03;
      }
      if (z > 0.05 && t > 0.65 && Math.abs(x) < 0.08) z += 0.028 * Math.sin(((t - 0.65) / 0.35) * Math.PI);
    }
    if (y > -0.04 && y < 0.14 && Math.abs(z) < 0.15) x *= 0.93;
    if (z > 0.14 && y > -0.01 && y < 0.075 && Math.abs(x) > 0.035 && Math.abs(x) < 0.145) {
      const socket = Math.sin(((y + 0.01) / 0.085) * Math.PI) * Math.sin(((Math.abs(x) - 0.035) / 0.11) * Math.PI);
      z -= 0.026 * socket;
    }
    if (z > 0.16 && y >= 0.055 && y <= 0.095 && Math.abs(x) < 0.14) {
      z += 0.012 * Math.sin(((y - 0.055) / 0.04) * Math.PI);
    }
    position.setXYZ(i, x, y, z);
  }
  craniumGeometry.computeVertexNormals();
  head.add(meshOf(craniumGeometry, skinMat));

  // 2. Nose: glabella -> bridge -> soft tip -> nostrils, lofted in one piece.
  const nose = taperedSpline([[0, 0.055, 0.205], [0, 0.015, 0.242], [0, -0.032, 0.266], [0, -0.046, 0.242]],
    (u) => Math.sin(u * Math.PI * 0.85 + 0.15) * 0.022, skinMat,
    { quality, tubular: 26, radial: 16, aspect: (u) => [0.85 + u * 0.35, 1] });
  head.add(nose);
  for (const side of [-1, 1]) {
    head.add(meshOf(new THREE.SphereGeometry(0.014, seg(18, quality, 8), seg(18, quality, 8)), skinMat,
      [side * 0.017, -0.042, 0.245], [0, 0, side * 0.3], [1.1, 0.75, 1.15]));
  }

  // 3. Eyes: almond lids, layered iris, catchlights, sword brows and sculpted ears.
  for (const side of [-1, 1]) {
    const eyeX = side * 0.08, eyeY = 0.026, eyeZ = 0.202;
    head.add(meshOf(new THREE.SphereGeometry(0.033, seg(26, quality, 10), seg(26, quality, 10)), MATS.eyeWhite,
      [eyeX, eyeY, eyeZ], [0, side * 0.12, 0], [1.18, 0.82, 0.85]));
    head.add(meshOf(new THREE.SphereGeometry(0.0185, seg(22, quality, 10), seg(22, quality, 10)), MATS.eyeIris,
      [eyeX, eyeY, eyeZ + 0.019], [0, 0, 0], [1, 1, 0.35]));
    head.add(meshOf(new THREE.SphereGeometry(0.0095, seg(18, quality, 8), seg(18, quality, 8)), MATS.pupil,
      [eyeX, eyeY, eyeZ + 0.024], [0, 0, 0], [1, 1, 0.3]));
    head.add(meshOf(new THREE.SphereGeometry(0.0045, 12, 10), MATS.eyeWhite,
      [eyeX + side * 0.006, eyeY + 0.006, eyeZ + 0.027]));
    head.add(meshOf(new THREE.SphereGeometry(0.0025, 10, 8), MATS.eyeWhite,
      [eyeX - side * 0.005, eyeY - 0.005, eyeZ + 0.027]));
    head.add(taperedSpline([[eyeX - side * 0.038, eyeY - 0.005, eyeZ + 0.01], [eyeX, eyeY + 0.02, eyeZ + 0.025],
      [eyeX + side * 0.042, eyeY + 0.002, eyeZ + 0.006]], (u) => Math.sin(u * Math.PI) * 0.0075,
    skinMat, { quality, tubular: 18, radial: 10 }));
    head.add(taperedSpline([[eyeX - side * 0.038, eyeY - 0.006, eyeZ + 0.012], [eyeX, eyeY + 0.017, eyeZ + 0.026],
      [eyeX + side * 0.046, eyeY + 0.004, eyeZ + 0.008]], (u) => Math.sin(u * Math.PI) * 0.005,
    hairMat, { quality, tubular: 18, radial: 8 }));
    head.add(taperedSpline([[eyeX - side * 0.035, eyeY + 0.044, eyeZ + 0.018], [eyeX + side * 0.012, eyeY + 0.058, eyeZ + 0.014],
      [eyeX + side * 0.068, eyeY + 0.072, eyeZ - 0.014]], (u) => Math.sin(Math.pow(u, 0.6) * Math.PI) * 0.0105,
    hairMat, { quality, tubular: 18, radial: 10, aspect: () => [0.5, 1.2] }));
    head.add(taperedSpline([[side * 0.215, 0.025, 0.01], [side * 0.238, 0.045, -0.015],
      [side * 0.242, -0.005, -0.032], [side * 0.222, -0.052, -0.01]], (u) => Math.sin(u * Math.PI * 0.85 + 0.15) * 0.016,
    skinMat, { quality, tubular: 16, radial: 10, aspect: () => [0.7, 1.3] }));
  }

  // 4. Cupid's-bow lips.
  head.add(taperedSpline([[-0.038, -0.096, 0.212], [-0.013, -0.087, 0.234], [0, -0.091, 0.236],
    [0.013, -0.087, 0.234], [0.038, -0.096, 0.212]], (u) => Math.sin(u * Math.PI) * 0.0095,
  MATS.lips, { quality, tubular: 22, radial: 12 }));
  head.add(taperedSpline([[-0.035, -0.098, 0.212], [0, -0.108, 0.234], [0.035, -0.098, 0.212]],
    (u) => Math.sin(u * Math.PI) * 0.012, MATS.lips, { quality, tubular: 18, radial: 12 }));

  // 5. Immortal beard for elders.
  if (hasBeard) {
    for (const side of [-1, 1]) {
      head.add(taperedSpline([[0, -0.076, 0.236], [side * 0.055, -0.095, 0.215], [side * 0.11, -0.24, 0.18]],
        (u) => (1 - u * 0.85) * 0.013, hairMat, { quality, tubular: 20, radial: 10 }));
    }
    for (let strand = -2; strand <= 2; strand++) {
      head.add(taperedSpline([[strand * 0.018, -0.13, 0.215], [strand * 0.025, -0.38, 0.2],
        [strand * 0.03, -0.68, 0.16], [strand * 0.02, -0.92, 0.22]], (u) => Math.sin((1 - u * 0.7) * Math.PI * 0.5) * 0.028,
      hairMat, { quality, tubular: 24, radial: 10, aspect: () => [0.6, 1.4] }));
    }
  }

  // 6. Layered multi-strand hair.
  const hair = new THREE.Group();
  // The cap stops just above the brow so the face, eyes and brows stay uncovered.
  hair.add(meshOf(new THREE.SphereGeometry(0.252, seg(40, quality, 16), seg(40, quality, 16), 0, Math.PI * 2, 0, Math.PI * 0.44),
    hairMat, [0, 0.045, -0.016], [0, 0, 0], [1, 1.08, 1.03]));
  hair.add(meshOf(new THREE.SphereGeometry(0.2, seg(32, quality, 14), seg(32, quality, 14), 0, Math.PI * 2, 0, Math.PI * 0.5),
    hairMat, [0, 0.03, -0.045], [0, 0, 0], [1.06, 1, 0.92]));

  if (hairStyle !== 'cropped') {
    for (const side of [-1, 1]) {
      // Swept fringe: starts at the part line and stays above the eyebrow.
      hair.add(taperedSpline([[side * 0.03, 0.235, 0.15], [side * 0.12, 0.185, 0.175], [side * 0.2, 0.115, 0.145],
        [side * 0.235, 0.03, 0.09]], (u) => Math.sin(u * Math.PI) * 0.026 + 0.006,
      hairMat, { quality, tubular: 22, radial: 10, aspect: () => [0.5, 1.5] }));
      const length = hairStyle === 'short' || hairStyle === 'bob' ? -0.2 : -0.52;
      // Long sidelocks frame the cheeks instead of hanging over them.
      hair.add(taperedSpline([[side * 0.19, 0.16, 0.06], [side * 0.235, 0.0, 0.03], [side * 0.225, -0.18, 0.0],
        [side * 0.2, length, 0.02]], (u) => Math.sin(Math.min(u * 1.15, 1) * Math.PI) * 0.03 + 0.004,
      hairMat, { quality, tubular: 24, radial: 10, aspect: () => [0.4, 1.4] }));
    }
  }

  if (['long', 'tied', 'bun', 'braid'].includes(hairStyle)) {
    const ring = pleatedLathe([[0.068, 0], [0.082, 0.04], [0.065, 0.095]], MATS.gold,
      { quality, segments: 30, pleats: 8, pleatDepth: 0.004 });
    ring.position.set(0, 0.25, -0.04);
    hair.add(ring);
    hair.add(meshOf(new THREE.SphereGeometry(0.085, seg(28, quality, 12), seg(28, quality, 12)), hairMat,
      [0, 0.35, -0.04], [0, 0, 0], [1, 1.22, 1]));
    hair.add(taperedSpline([[-0.23, 0.34, -0.04], [0, 0.35, -0.04], [0.23, 0.36, -0.04]],
      (u) => (1 - u * 0.65) * 0.013, MATS.jade, { quality, tubular: 18, radial: 10 }));
    hair.add(meshOf(new THREE.SphereGeometry(0.022, 14, 12), MATS.gold, [-0.23, 0.34, -0.04]));
  }

  if (hairStyle === 'long') {
    for (let i = -4; i <= 4; i++) {
      const spread = i * 0.038;
      hair.add(taperedSpline([[spread * 0.8, 0.14, -0.21], [spread * 1.1, -0.35, -0.29],
        [spread * 1.25, -0.85, -0.34], [spread * 1.35, -1.32, -0.26]],
      (u) => Math.sin(Math.pow(u, 0.7) * Math.PI * 0.85 + 0.15) * 0.052, hairMat,
      { quality, tubular: 30, radial: 12, aspect: () => [0.38, 1.65] }));
    }
  } else if (hairStyle === 'tied') {
    for (let i = -2; i <= 2; i++) {
      hair.add(taperedSpline([[i * 0.015, 0.34, -0.08], [i * 0.03, 0.26, -0.28], [i * 0.045, -0.28, -0.38],
        [i * 0.05, -0.92, -0.3]], (u) => Math.sin(u * Math.PI * 0.85 + 0.15) * 0.055, hairMat,
      { quality, tubular: 30, radial: 12, aspect: () => [0.5, 1.4] }));
    }
  } else if (hairStyle === 'braid') {
    for (let braid = 0; braid < 3; braid++) {
      const points: Point3[] = [];
      for (let k = 0; k <= 24; k++) {
        const t = k / 24;
        const angle = t * Math.PI * 9 + (braid * Math.PI * 2) / 3;
        points.push([Math.cos(angle) * 0.036 * (1 - t * 0.5), 0.12 - t * 1.15,
          -0.25 + Math.sin(angle) * 0.036 * (1 - t * 0.5)]);
      }
      hair.add(taperedSpline(points, (u) => (1 - u * 0.6) * 0.04, hairMat, { quality, tubular: 38, radial: 10 }));
    }
  } else if (hairStyle === 'bob' || hairStyle === 'short') {
    const lengthY = hairStyle === 'bob' ? -0.24 : -0.11;
    for (let i = -5; i <= 5; i++) {
      const angle = (i / 5) * Math.PI * 0.65;
      const sx = Math.sin(angle) * 0.22, sz = -Math.cos(angle) * 0.22;
      hair.add(taperedSpline([[sx * 0.85, 0.16, sz * 0.85], [sx * 1.05, -0.04, sz * 1.05], [sx * 0.92, lengthY, sz * 0.95]],
        (u) => (1 - u * 0.45) * 0.048, hairMat, { quality, tubular: 20, radial: 10, aspect: () => [0.4, 1.5] }));
    }
  }

  head.add(hair);
  return head;
}

/** Sculpted hand: organic palm and five tapered fingers (two extended in a sword mudra). */
function buildHand(side: 1 | -1, skinMat: THREE.Material, quality: number): THREE.Group {
  const hand = new THREE.Group();
  hand.add(taperedSpline([[0, 0.045, -0.005], [0, 0, 0.002], [0, -0.042, 0]],
    (u) => 0.038 + Math.sin(u * Math.PI) * 0.008, skinMat, { quality, tubular: 14, radial: 12, aspect: () => [0.38, 1.15] }));
  hand.add(taperedSpline([[side * 0.028, 0.018, 0.006], [side * 0.052, -0.012, 0.024], [side * 0.042, -0.042, 0.038]],
    (u) => (1 - u * 0.4) * 0.0125, skinMat, { quality, tubular: 14, radial: 10 }));
  for (let finger = 0; finger < 4; finger++) {
    const fx = (finger - 1.5) * 0.0175 * side;
    const lengthFactor = finger === 1 ? 1.08 : finger === 0 || finger === 2 ? 0.98 : 0.82;
    const extended = finger < 2;
    const points: Point3[] = extended
      ? [[fx, -0.036, 0], [fx, -0.082 * lengthFactor, 0.004], [fx, -0.125 * lengthFactor, 0.009]]
      : [[fx, -0.036, 0], [fx, -0.068 * lengthFactor, 0.028], [fx * 0.85, -0.038, 0.036]];
    hand.add(taperedSpline(points, (u) => (1 - u * 0.42) * 0.0098, skinMat, { quality, tubular: 14, radial: 10 }));
  }
  return hand;
}

function buildSword(bladeMaterial: THREE.Material, hiltMaterial: THREE.Material, scale = 1, quality = 1): THREE.Group {
  const sword = new THREE.Group();
  sword.add(meshOf(bladeGeometry(2.1, 0.125, 0.024), bladeMaterial, [0, 0.6, 0]));
  sword.add(meshOf(bladeGeometry(1.75, 0.03, 0.034), MATS.glowJade, [0, 0.52, 0]));
  sword.add(meshOf(new THREE.SphereGeometry(0.11, seg(22, quality, 10), seg(22, quality, 10)), hiltMaterial,
    [0, -0.5, 0], [0, 0, 0], [1.4, 0.75, 0.55]));
  for (const side of [-1, 1]) {
    sword.add(taperedSpline([[0, -0.5, 0], [side * 0.22, -0.42, 0], [side * 0.36, -0.26, 0]],
      (u) => (1 - u * 0.75) * 0.056, hiltMaterial, { quality, tubular: 16, radial: 10 }));
  }
  sword.add(meshOf(new THREE.SphereGeometry(0.05, 18, 14), MATS.ruby, [0, -0.5, 0.06]));
  const grip = pleatedLathe([[0.034, 0], [0.042, 0.24], [0.036, 0.48]], silk('#8f2f3a'),
    { quality, segments: 20, pleats: 10, pleatDepth: 0.003 });
  grip.position.set(0, -1.02, 0);
  sword.add(grip);
  sword.add(meshOf(new THREE.TorusGeometry(0.055, 0.018, 12, 24), hiltMaterial, [0, -1.06, 0]));
  sword.add(taperedSpline([[0, -1.1, 0], [0.08, -1.35, 0.05], [-0.05, -1.62, -0.05]],
    (u) => 0.014 + u * 0.03, silk('#b6414b'), { quality, tubular: 18, radial: 10 }));
  sword.scale.setScalar(scale);
  return sword;
}

/**
 * Full sculpted cultivator: pleated robes, crossed collar, waist sash with a jade clasp,
 * sculpted face and hair, articulated hands, legs and silk ribbons.
 * The model faces +Z (game convention) with feet on y = 0.
 */
export function buildCultivator(look: CultivatorLook): THREE.Group {
  const quality = look.quality ?? 1;
  const female = look.gender === 'nu';
  const skinMat = skinMaterial(SKIN_HEX[look.skinTone]);
  const outer = silk(ROBE_HEX[look.robeColor]);
  const inner = silk(ROBE_HEX[look.robeColor === 'ivory' ? 'jade' : 'ivory']);
  const hairMat = hairMaterial(HAIR_HEX[look.hairColor]);
  const build = 0.9 + look.build * 0.2;
  const shoulder = 0.31 * build * (female ? 0.92 : 1.05);

  const root = new THREE.Group();
  root.name = 'cultivator';

  // Open-hem lathe profiles (bottom to top) so the robe flows around the legs instead of
  // closing like a lampshade; the silk material is double sided.
  const skirt = pleatedLathe([[0.74, 0.02], [0.69, 0.28], [0.56, 0.66], [0.44, 1.02], [0.34, 1.3], [0.3, 1.42]],
    inner, { quality, segments: 84, pleats: 26, pleatDepth: 0.026 });
  root.add(skirt);
  const coatProfile: [number, number][] = [[0.74, 0.3], [0.6, 0.72], [0.45, 1.1], [0.33, 1.42], [0.35, 1.76], [0.3, 2.0], [0.19, 2.14]];
  const coatL = pleatedLathe(coatProfile, outer, { quality, segments: 60, pleats: 12, pleatDepth: 0.02, startAngle: -Math.PI * 0.42, angleLength: Math.PI * 0.85 });
  const coatR = pleatedLathe(coatProfile, outer, { quality, segments: 60, pleats: 12, pleatDepth: 0.02, startAngle: Math.PI * 0.58, angleLength: Math.PI * 0.85 });
  root.add(coatL, coatR);

  // Upper body: chest and sloping shoulders, softer for female silhouettes.
  const chest = pleatedLathe([[0.27, 1.42], [0.26, 1.58], [0.31, 1.8], [0.34, 2.0], [0.25, 2.13], [0.11, 2.22]],
    inner, { quality, segments: 60, pleats: 14, pleatDepth: 0.011 });
  chest.scale.set(female ? 1.0 : 1.13, 1, female ? 0.74 : 0.79);
  root.add(chest);

  root.add(taperedSpline([[0, 2.22, -0.14], [-0.15, 2.18, -0.02], [-0.19, 2.02, 0.18], [0.02, 1.7, 0.255], [0.18, 1.48, 0.245]],
    () => 0.042, MATS.gold, { quality, tubular: 28, radial: 14, aspect: () => [0.35, 1.4] }));
  root.add(taperedSpline([[0, 2.22, -0.14], [0.15, 2.18, -0.02], [0.19, 2.02, 0.18], [0, 1.74, 0.242]],
    () => 0.038, outer, { quality, tubular: 24, radial: 14, aspect: () => [0.35, 1.4] }));

  // Waist sash, jade clasp and hanging brocade apron.
  const belt = pleatedLathe([[0.32, 1.38], [0.35, 1.43], [0.36, 1.48], [0.35, 1.53], [0.32, 1.56]], MATS.gold,
    { quality, segments: 60, pleats: 18, pleatDepth: 0.005 });
  belt.scale.set(female ? 1.02 : 1.08, 1, 0.82);
  root.add(belt);
  root.add(meshOf(new THREE.SphereGeometry(0.066, seg(22, quality, 10), seg(22, quality, 10)), MATS.jade,
    [0, 1.47, 0.29], [0, 0, 0], [1.15, 1.3, 0.42]));
  root.add(meshOf(new THREE.TorusGeometry(0.072, 0.014, 12, 28), MATS.gold, [0, 1.47, 0.285], [0, 0, 0], [1.1, 1.25, 0.5]));
  root.add(taperedSpline([[0, 1.42, 0.29], [0, 1.03, 0.38], [0, 0.6, 0.46], [0, 0.28, 0.55]],
    (u) => 0.105 + Math.sin(u * Math.PI * 0.7) * 0.05, inner, { quality, tubular: 26, radial: 14, aspect: () => [0.14, 1.6] }));
  root.add(meshOf(new THREE.TorusGeometry(0.06, 0.017, 16, 32), MATS.jade, [0.21, 1.2, 0.28], [0.15, 0.3, 0]));
  root.add(taperedSpline([[0.21, 1.13, 0.28], [0.23, 0.83, 0.32]], (u) => 0.012 + u * 0.024, silk('#a8494f'),
    { quality, tubular: 14, radial: 10 }));

  // Legs (mostly under the hem, but visible and animated below it).
  const legTops: { side: 1 | -1; group: THREE.Group }[] = [];
  for (const side of [-1, 1] as const) {
    const leg = new THREE.Group();
    leg.name = side === -1 ? RIG.legL : RIG.legR;
    leg.position.set(side * 0.14 * build, 1.3, 0);
    const thigh = taperedSpline([[0, 0, 0], [side * 0.01, -0.34, 0.01], [0, -0.66, 0.02]],
      (u) => 0.115 - u * 0.03, skinMat, { quality, tubular: 18, radial: 12 });
    const calf = taperedSpline([[0, -0.66, 0.02], [0, -0.9, 0.01], [0, -1.12, 0.03]],
      (u) => 0.082 - u * 0.022, skinMat, { quality, tubular: 18, radial: 12 });
    const boot = buildBoot(side, quality);
    boot.position.set(0, -1.3, 0.02);
    leg.add(thigh, calf, boot);
    root.add(leg);
    legTops.push({ side, group: leg });
  }

  // Arms: billowing wide sleeves, inner cuffs and sculpted hands.
  const arms: { side: 1 | -1; pivot: THREE.Group; hand: THREE.Group }[] = [];
  for (const side of [-1, 1] as const) {
    const pivot = new THREE.Group();
    pivot.name = side === -1 ? RIG.armL : RIG.armR;
    pivot.position.set(side * shoulder, 2.04, 0);
    // Sleeve: fitted at the shoulder, softly bell-shaped at the elbow, gathered at the cuff.
    pivot.add(taperedSpline([[0, 0.02, 0], [side * 0.09, -0.2, 0.04], [side * 0.14, -0.42, 0.1], [side * 0.15, -0.58, 0.16]],
      (u) => 0.098 + Math.sin(u * Math.PI * 0.9) * 0.042, outer,
      { quality, tubular: 28, radial: 20, aspect: () => [1.05, 0.95] }));
    // Water-sleeve drape falls behind the arm, flat and long like folded silk.
    pivot.add(taperedSpline([[side * 0.12, -0.26, 0.02], [side * 0.18, -0.62, 0.06], [side * 0.16, -0.98, 0.02],
      [side * 0.13, -1.2, -0.04]], (u) => 0.07 + Math.sin(u * Math.PI * 0.75) * 0.06, outer,
      { quality, tubular: 26, radial: 16, aspect: () => [0.34, 1.5] }));
    // Jade cuff ring.
    pivot.add(meshOf(new THREE.TorusGeometry(0.088, 0.014, 12, 30), MATS.gold, [side * 0.15, -0.585, 0.16], [Math.PI / 2, 0, 0]));
    pivot.add(taperedSpline([[side * 0.135, -0.6, 0.15], [side * 0.14, -0.68, 0.17]], (u) => 0.062 - u * 0.012,
      inner, { quality, tubular: 12, radial: 14 }));
    const hand = buildHand(side, skinMat, quality);
    hand.name = side === -1 ? RIG.handL : RIG.handR;
    hand.position.set(side * 0.145, -0.72, 0.18);
    hand.rotation.set(0.22, side * 0.24, side * -0.12);
    pivot.add(hand);
    root.add(pivot);
    arms.push({ side, pivot, hand });
  }

  // Neck and sculpted head.
  root.add(taperedSpline([[0, 2.14, -0.01], [0, 2.24, 0], [0, 2.36, 0.01]], (u) => 0.103 - u * 0.016, skinMat,
    { quality, tubular: 14, radial: 16 }));
  const headPivot = new THREE.Group();
  headPivot.name = RIG.head;
  headPivot.position.set(0, 2.3, 0);
  const head = buildSculptedHead(look.face, look.hair, hairMat, skinMat, quality, look.beard);
  head.position.set(0, 0.18, 0);
  headPivot.add(head);
  root.add(headPivot);

  // Celestial silk ribbons that trail from the shoulders.
  const ribbons: THREE.Mesh[] = [];
  for (const side of [-1, 1] as const) {
    const ribbon = taperedSpline([[side * 0.24, 2.0, -0.18], [side * 0.62, 1.86, -0.34], [side * 0.72, 1.3, -0.36],
      [side * 0.52, 0.82, -0.26], [side * 0.62, 0.42, -0.36]], (u) => Math.sin(u * Math.PI * 0.9 + 0.1) * 0.045,
    ribbonSilk, { quality, tubular: 44, radial: 12, aspect: () => [0.12, 1.5] });
    ribbon.name = side === -1 ? RIG.ribbonL : RIG.ribbonR;
    root.add(ribbon);
    ribbons.push(ribbon);
  }

  if (look.staff) {
    const staff = taperedSpline([[0.62, -0.1, 0.44], [0.62, 0.9, 0.44], [0.62, 1.9, 0.44], [0.56, 2.5, 0.5],
      [0.7, 2.66, 0.42], [0.62, 2.74, 0.34]], (u) => 0.032 - u * 0.01, MATS.wood, { quality, tubular: 34, radial: 12 });
    root.add(staff);
    root.add(meshOf(new THREE.SphereGeometry(0.075, seg(22, quality, 10), seg(22, quality, 10)), MATS.glowGold, [0.62, 2.5, 0.5]));
  } else {
    // Gripped at the hilt and rested point-up beside the leg, the way a disciple stands guard.
    const sword = buildSword(bladeSteel, MATS.gold, 0.62, quality);
    sword.name = 'cultivator-sword';
    sword.position.set(0, 0.63, 0.03);
    sword.rotation.set(0.08, 0, -0.16);
    arms.find((arm) => arm.side === 1)!.hand.add(sword);
  }

  // Careful layering: pivots take ownership of their meshes without moving them.
  root.updateMatrixWorld(true);
  const hips = new THREE.Group();
  hips.name = RIG.hips;
  hips.position.set(0, 1.4, 0);
  root.add(hips);
  const torso = new THREE.Group();
  torso.name = RIG.torso;
  torso.position.set(0, 1.5, 0);
  root.add(torso);

  const attachTo = (parent: THREE.Object3D, children: THREE.Object3D[]) => {
    for (const child of children) parent.attach(child);
  };
  const skirtGroup = new THREE.Group();
  skirtGroup.name = RIG.skirt;
  skirtGroup.position.set(0, 1.36, 0);
  root.add(skirtGroup);
  attachTo(skirtGroup, [skirt, coatL, coatR]);
  attachTo(hips, [skirtGroup, ...legTops.map((leg) => leg.group)]);
  attachTo(torso, [chest, belt, ...ribbons, headPivot, ...arms.map((arm) => arm.pivot)]);

  const heightScale = (0.6 + look.height * 0.1) * (female ? 0.985 : 1);
  root.scale.setScalar(heightScale);
  root.userData.look = look;
  return root;
}

function buildBoot(side: 1 | -1, quality: number): THREE.Group {
  const boot = new THREE.Group();
  const shoe = taperedSpline([[0, 0.16, 0.02], [0, 0.06, 0.16], [0, 0.03, 0.34]],
    (u) => 0.072 * (1 - u * 0.3), MATS.darkIron, { quality, tubular: 16, radial: 12, aspect: () => [0.8, 1.1] });
  const sole = meshOf(new THREE.SphereGeometry(0.075, seg(18, quality, 10), seg(18, quality, 10)), MATS.darkStone,
    [0, 0.03, 0.2], [0, 0, 0], [0.85, 0.42, 1.6]);
  const cloud = meshOf(new THREE.TorusGeometry(0.055, 0.014, 10, 24), MATS.glowCyan, [0, 0.12, 0.06], [Math.PI / 2, 0, 0]);
  boot.add(shoe, sole, cloud);
  boot.rotation.y = side * 0.04;
  return boot;
}
