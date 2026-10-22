import * as THREE from 'three';
import { MATS, silk } from './materials';
import { bladeGeometry, meshOf, pleatedLathe, seg, taperedSpline } from './geometry';

const tintCache = new Map<string, THREE.MeshStandardMaterial>();

/** Cache one tinted PBR material per colour so every clone of a beast shares GPU state. */
function tinted(color: string, options: { roughness?: number; metalness?: number; emissive?: string;
  emissiveIntensity?: number; map?: THREE.Texture; bumpScale?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${options.roughness ?? 0.6}|${options.metalness ?? 0.05}|${options.emissive ?? ''}|${options.emissiveIntensity ?? 0}`;
  let material = tintCache.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color, roughness: options.roughness ?? 0.6, metalness: options.metalness ?? 0.05,
      emissive: options.emissive ?? '#000000', emissiveIntensity: options.emissiveIntensity ?? 0,
      map: options.map, bumpMap: options.map, bumpScale: options.bumpScale ?? 0.02,
    });
    tintCache.set(key, material);
  }
  return material;
}

type QuadrupedOptions = {
  body: THREE.Material;
  accent: THREE.Material;
  eye: THREE.Material;
  quality: number;
  scale?: number;
  legHeight?: number;
  bodyThickness?: number;
  neckLength?: number;
  saddle?: boolean;
  wings?: boolean;
};

/** Elliptical ribcage, tucked waist, three-joint legs, four-toed paws and a lofted head. */
function buildQuadruped(options: QuadrupedOptions) {
  const { body, accent, eye, quality } = options;
  const legHeight = options.legHeight ?? 0.85;
  const thickness = options.bodyThickness ?? 0.32;
  const neckLength = options.neckLength ?? 0.45;
  const beast = new THREE.Group();

  beast.add(taperedSpline([
    [0, legHeight + 0.02, -0.82], [0, legHeight + 0.14, -0.45], [0, legHeight + 0.08, 0],
    [0, legHeight + 0.12, 0.48], [0, legHeight + 0.2, 0.78],
  ], (u) => {
    const chest = Math.exp(-Math.pow((u - 0.78) / 0.22, 2)) * 0.32;
    const hip = Math.exp(-Math.pow((u - 0.22) / 0.2, 2)) * 0.24;
    const waist = Math.sin(u * Math.PI) * 0.72;
    return thickness * (0.22 + waist + chest + hip);
  }, body, { quality, tubular: 40, radial: 24, aspect: (u) => [1.18 + (u > 0.55 ? 0.18 : 0), 0.92] }));

  beast.add(taperedSpline([[0, legHeight + 0.02, 0.62], [0, legHeight + 0.22, 0.85], [0, legHeight + neckLength * 0.65, 0.92]],
    (u) => thickness * Math.sin(u * Math.PI * 0.85 + 0.15) * 0.75, accent, { quality, tubular: 20, radial: 16, aspect: () => [1.15, 0.95] }));

  beast.add(taperedSpline([[0, legHeight + 0.16, 0.64], [0, legHeight + neckLength * 0.55, 0.84], [0, legHeight + neckLength, 0.98]],
    (u) => thickness * (0.76 - u * 0.28), body, { quality, tubular: 20, radial: 16, aspect: () => [1.12, 0.92] }));

  const head = new THREE.Group();
  head.position.set(0, legHeight + neckLength + 0.06, 1.02);
  head.add(taperedSpline([[0, 0.04, -0.18], [0, 0.05, 0.02], [0, 0, 0.2], [0, -0.04, 0.38], [0, -0.05, 0.48]],
    (u) => {
      if (u < 0.45) return thickness * (0.45 + Math.sin((u / 0.45) * Math.PI * 0.75) * 0.25);
      const t = (u - 0.45) / 0.55;
      return thickness * 0.62 * (1 - t * 0.62);
    }, body, { quality, tubular: 26, radial: 18, aspect: (u) => [0.92 - u * 0.15, 1.05 - u * 0.1] }));
  head.add(taperedSpline([[0, -0.06, 0.04], [0, -0.09, 0.24], [0, -0.08, 0.42]],
    (u) => thickness * 0.32 * (1 - u * 0.55), body, { quality, tubular: 16, radial: 12, aspect: () => [0.65, 0.95] }));
  head.add(meshOf(new THREE.SphereGeometry(0.036, seg(18, quality, 8), seg(18, quality, 8)), MATS.pupil, [0, -0.035, 0.48], [0, 0, 0], [1.2, 0.85, 1]));

  for (const side of [-1, 1]) {
    head.add(meshOf(new THREE.SphereGeometry(0.034, seg(18, quality, 8), seg(18, quality, 8)), eye,
      [side * thickness * 0.44, 0.035, 0.14], [0, side * 0.35, side * -0.15], [1.25, 0.68, 0.9]));
    head.add(taperedSpline([[side * thickness * 0.45, -0.02, 0.05], [side * thickness * 0.68, -0.06, -0.06],
      [side * thickness * 0.78, -0.04, -0.18]], (u) => (1 - u * 0.85) * thickness * 0.22, body,
    { quality, tubular: 12, radial: 10, aspect: () => [0.5, 1.3] }));
    head.add(meshOf(bladeGeometry(0.3, 0.075, 0.022, -0.05), body,
      [side * thickness * 0.38, 0.22, -0.05], [-0.25, 0, side * -0.35]));
    head.add(meshOf(bladeGeometry(0.22, 0.045, 0.012, -0.04), accent,
      [side * thickness * 0.38, 0.21, -0.03], [-0.25, 0, side * -0.35]));
  }
  beast.add(head);

  const legs: THREE.Group[] = [];
  const legSpecs = [
    { x: -thickness * 0.65, z: 0.56, front: true },
    { x: thickness * 0.65, z: 0.56, front: true },
    { x: -thickness * 0.68, z: -0.58, front: false },
    { x: thickness * 0.68, z: -0.58, front: false },
  ];
  for (const spec of legSpecs) {
    const leg = new THREE.Group();
    leg.position.set(spec.x, legHeight + 0.06, spec.z);
    const points: [number, number, number][] = spec.front
      ? [[0, 0.05, 0], [0, -legHeight * 0.42, -0.07], [0, -legHeight * 0.82, 0.03], [0, -legHeight, 0.11]]
      : [[0, 0.06, 0], [0, -legHeight * 0.38, 0.11], [0, -legHeight * 0.72, -0.14], [0, -legHeight, 0.06]];
    leg.add(taperedSpline(points, (u) => thickness * (0.52 * Math.pow(1 - u * 0.65, 1.2) + (u > 0.82 ? 0.05 : 0)),
      body, { quality, tubular: 22, radial: 14, aspect: (u) => [1.25 - u * 0.25, 0.85] }));
    const pawZ = spec.front ? 0.12 : 0.07;
    for (let toe = -1.5; toe <= 1.5; toe += 1) {
      const tx = toe * thickness * 0.095;
      leg.add(taperedSpline([[tx * 0.6, -legHeight + 0.02, pawZ - 0.04], [tx, -legHeight - 0.01, pawZ + 0.06],
        [tx, -legHeight - 0.02, pawZ + 0.11]], (u) => thickness * 0.11 * (1 - u * 0.55), accent,
      { quality, tubular: 10, radial: 8 }));
    }
    beast.add(leg);
    legs.push(leg);
  }

  if (options.saddle) {
    beast.add(meshOf(new THREE.CylinderGeometry(thickness * 1.08, thickness * 1.15, 0.62, 28, 1, false,
      -Math.PI * 0.65, Math.PI * 1.3), silk('#8f2f3a'), [0, legHeight + 0.12, 0.05], [Math.PI / 2, 0, 0]));
    beast.add(meshOf(new THREE.TorusGeometry(thickness * 0.95, 0.055, 12, 28, Math.PI), MATS.gold,
      [0, legHeight + 0.22, 0.05], [0, Math.PI / 2, 0]));
  }

  const wings: THREE.Group[] = [];
  if (options.wings) {
    for (const side of [-1, 1] as const) {
      const wing = buildFeatheredWing(side, 1.55, MATS.cloudWhite, MATS.glowCyan, quality);
      wing.position.set(side * thickness * 0.75, legHeight + 0.25, 0.35);
      beast.add(wing);
      wings.push(wing);
    }
  }

  beast.scale.setScalar(options.scale ?? 1);
  return { group: beast, head, legs, wings };
}

function buildFeatheredWing(side: 1 | -1, span: number, main: THREE.Material, tip: THREE.Material, quality: number): THREE.Group {
  const wing = new THREE.Group();
  wing.add(taperedSpline([[0, 0, 0], [side * span * 0.4, 0.35, -0.1], [side * span * 0.85, 0.55, -0.25],
    [side * span, 0.25, -0.4]], (u) => (1 - u * 0.7) * 0.05, main, { quality, tubular: 18, radial: 8 }));
  const count = Math.max(7, Math.round(14 * quality));
  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1);
    const length = (0.45 + Math.sin(t * Math.PI) * 0.55) * span * 0.65;
    wing.add(meshOf(bladeGeometry(length, 0.065, 0.012, -0.05), i % 3 === 0 ? tip : main,
      [side * (0.15 + t * span * 0.82), 0.15 + Math.sin(t * Math.PI) * 0.25 - length * 0.35, -0.15 - t * 0.25],
      [0.3, 0, side * (-0.2 - t * 0.65)]));
  }
  return wing;
}

export function buildDetailedSword(blade: THREE.Material, hilt: THREE.Material, scale = 1, quality = 1): THREE.Group {
  const sword = new THREE.Group();
  sword.add(meshOf(bladeGeometry(2.2, 0.13, 0.025), blade, [0, 0.6, 0]));
  sword.add(meshOf(bladeGeometry(1.85, 0.035, 0.036), MATS.glowCyan, [0, 0.52, 0]));
  sword.add(meshOf(new THREE.SphereGeometry(0.12, seg(22, quality, 10), seg(22, quality, 10)), hilt, [0, -0.5, 0], [0, 0, 0], [1.4, 0.75, 0.55]));
  for (const side of [-1, 1]) {
    sword.add(taperedSpline([[0, -0.5, 0], [side * 0.22, -0.42, 0], [side * 0.38, -0.26, 0]],
      (u) => (1 - u * 0.75) * 0.058, hilt, { quality, tubular: 16, radial: 10 }));
  }
  sword.add(meshOf(new THREE.SphereGeometry(0.05, 18, 14), MATS.ruby, [0, -0.5, 0.065]));
  const grip = pleatedLathe([[0.034, 0], [0.042, 0.24], [0.036, 0.48]], silk('#8f2f3a'),
    { quality, segments: 20, pleats: 10, pleatDepth: 0.003 });
  grip.position.set(0, -1.02, 0);
  sword.add(grip, meshOf(new THREE.TorusGeometry(0.055, 0.018, 12, 24), hilt, [0, -1.06, 0]));
  sword.add(taperedSpline([[0, -1.1, 0], [0.08, -1.35, 0.05], [-0.05, -1.65, -0.05]],
    (u) => 0.015 + u * 0.035, silk('#b6414b'), { quality, tubular: 22, radial: 10 }));
  sword.scale.setScalar(scale);
  return sword;
}

/** Nine-tailed spirit fox: the classic xianxia companion. */
export function buildSpiritFox(quality = 1): THREE.Group {
  const fur = tinted('#f7ece2', { roughness: 0.6, emissive: '#ffe6ea', emissiveIntensity: 0.07 });
  const tip = tinted('#d9506a', { roughness: 0.45, emissive: '#a32a44', emissiveIntensity: 0.35 });
  const { group, head, legs, } = buildQuadruped({ body: fur, accent: tip, eye: MATS.eyeGold, quality,
    scale: 0.86, legHeight: 0.72, bodyThickness: 0.27, neckLength: 0.34 });
  const tails = new THREE.Group();
  tails.position.set(0, 0.72 + 0.08, -0.72);
  const pivots: THREE.Group[] = [];
  for (let i = 0; i < 9; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.set(0.15 + Math.cos((i - 4) * 0.3) * 0.3, (i - 4) * 0.26, 0);
    pivot.add(taperedSpline([[0, 0, 0], [0, 0.45, -0.55], [0, 0.95, -1.25], [0, 1.45, -1.65], [0, 1.85, -1.45]],
      (u) => Math.sin(Math.pow(u, 0.7) * Math.PI) * 0.19 + 0.01, i % 2 === 0 ? fur : tip,
      { quality, tubular: 30, radial: 14 }));
    tails.add(pivot);
    pivots.push(pivot);
  }
  group.add(tails);
  group.userData.parts = { head, legs, tails: pivots };
  return group;
}

export function buildSpiritWolf(quality = 1, color = '#98a4b2', glow = '#bff2ff'): THREE.Group {
  const fur = tinted(color, { roughness: 0.66 });
  const accent = tinted('#dfe6ee', { roughness: 0.5, metalness: 0.2 });
  const eye = tinted(glow, { roughness: 0.2, emissive: glow, emissiveIntensity: 1.8 });
  const { group, head, legs } = buildQuadruped({ body: fur, accent, eye, quality,
    scale: 1.05, legHeight: 0.92, bodyThickness: 0.35, neckLength: 0.44 });
  for (let i = 0; i < 7; i++) {
    group.add(meshOf(bladeGeometry(0.42, 0.075, 0.028, -0.08), accent,
      [0, 0.92 + 0.32, 0.75 - i * 0.14], [-0.7, 0, 0]));
  }
  group.add(taperedSpline([[0, 0.92, -0.75], [0, 0.72, -1.35], [0, 0.95, -1.85]],
    (u) => Math.sin(u * Math.PI) * 0.16, fur, { quality, tubular: 24, radial: 12 }));
  group.userData.parts = { head, legs };
  return group;
}

export function buildIronBoar(quality = 1): THREE.Group {
  const hide = tinted('#4a4f57', { roughness: 0.4, metalness: 0.72, map: undefined });
  const armor = tinted('#c9a45f', { roughness: 0.34, metalness: 0.8 });
  const eye = tinted('#ffd9a0', { roughness: 0.2, emissive: '#ff8c3b', emissiveIntensity: 1.9 });
  const { group, head, legs } = buildQuadruped({ body: hide, accent: armor, eye, quality,
    scale: 1.0, legHeight: 0.62, bodyThickness: 0.5, neckLength: 0.2 });
  for (const side of [-1, 1]) {
    head.add(taperedSpline([[side * 0.16, -0.08, 0.25], [side * 0.29, 0.06, 0.52], [side * 0.22, 0.36, 0.46]],
      (u) => (1 - u * 0.88) * 0.06, MATS.tusk, { quality, tubular: 20, radial: 12 }));
  }
  for (let i = 0; i < 6; i++) {
    group.add(meshOf(bladeGeometry(0.36, 0.1, 0.032, -0.08), armor, [0, 0.62 + 0.44, 0.52 - i * 0.22], [-0.45, 0, 0]));
  }
  group.userData.parts = { head, legs };
  return group;
}

export function buildSpiritStag(quality = 1, saddle = false, color = '#f6ead1'): THREE.Group {
  const fur = tinted(color, { roughness: 0.52, emissive: '#fde68a', emissiveIntensity: 0.08 });
  const accent = MATS.whiteJade;
  const { group, head, legs } = buildQuadruped({ body: fur, accent, eye: MATS.glowJade, quality,
    scale: 1.02, legHeight: 1.05, bodyThickness: 0.3, neckLength: 0.62, saddle });
  for (const side of [-1, 1]) {
    head.add(taperedSpline([[side * 0.07, 0.16, -0.02], [side * 0.28, 0.48, -0.18], [side * 0.42, 0.85, -0.12],
      [side * 0.32, 1.18, 0.08]], (u) => (1 - u * 0.75) * 0.036, MATS.jade, { quality, tubular: 24, radial: 10 }));
    head.add(taperedSpline([[side * 0.22, 0.38, -0.12], [side * 0.18, 0.62, 0.12]],
      (u) => (1 - u * 0.8) * 0.025, MATS.jade, { quality, tubular: 12, radial: 8 }));
    head.add(taperedSpline([[side * 0.38, 0.72, -0.15], [side * 0.55, 0.98, -0.28]],
      (u) => (1 - u * 0.8) * 0.025, MATS.jade, { quality, tubular: 12, radial: 8 }));
    head.add(meshOf(new THREE.SphereGeometry(0.055, 16, 12), MATS.glowCyan, [side * 0.34, 1.16, 0.06]));
  }
  group.userData.parts = { head, legs };
  return group;
}

export function buildSpiritSerpent(quality = 1, options: { dark?: boolean } = {}): THREE.Group {
  const scaleMat = options.dark ? MATS.voidScale : MATS.serpentScale;
  const glow = options.dark ? MATS.glowPurple : MATS.glowGold;
  const group = new THREE.Group();
  const points: [number, number, number][] = [];
  const turns = options.dark ? 6.5 : 5.5;
  for (let i = 0; i <= 56; i++) {
    const u = i / 56;
    const angle = u * Math.PI * turns;
    const radius = (1 - u * 0.65) * 1.35 + 0.15;
    points.push([Math.cos(angle) * radius, u * 2.2, Math.sin(angle) * radius]);
  }
  group.add(taperedSpline(points, (u) => Math.sin(Math.pow(u, 0.6) * Math.PI * 0.92 + 0.15) * 0.22,
    scaleMat, { quality, tubular: 80, radial: 18 }));
  const last = points[points.length - 1];
  const head = new THREE.Group();
  head.position.set(last[0], last[1] + 0.08, last[2]);
  head.add(meshOf(bladeGeometry(0.62, 0.3, 0.04, -0.08), scaleMat, [0, -0.12, -0.08]));
  head.add(meshOf(new THREE.SphereGeometry(0.21, seg(22, quality, 10), seg(22, quality, 10)), scaleMat,
    [0, 0.05, 0.12], [0, 0, 0], [1, 0.7, 1.4]));
  for (const side of [-1, 1]) head.add(meshOf(new THREE.SphereGeometry(0.036, 12, 10), glow, [side * 0.13, 0.1, 0.22]));
  head.add(taperedSpline([[0, 0, 0.35], [0, -0.02, 0.58], [0.05, -0.04, 0.68]], (u) => 0.012 * (1 - u * 0.5),
    MATS.ruby, { quality, tubular: 10, radial: 8 }));
  if (options.dark) {
    for (let i = 2; i < points.length - 2; i += 4) {
      const [x, y, z] = points[i];
      group.add(meshOf(bladeGeometry(0.3, 0.06, 0.02, -0.06), MATS.glowPurple, [x, y + 0.22, z], [-0.5, 0, 0]));
    }
  }
  group.add(head);
  group.userData.parts = { head };
  return group;
}

export function buildCloudCrane(quality = 1, options: { saddle?: boolean; tint?: string } = {}): THREE.Group {
  const feather = options.tint ? tinted(options.tint, { roughness: 0.55, emissive: '#9fe0f5', emissiveIntensity: 0.16 }) : MATS.cloudWhite;
  const crane = new THREE.Group();
  crane.add(taperedSpline([[0, 1.08, -0.52], [0, 1.22, 0], [0, 1.3, 0.48]],
    (u) => Math.sin(u * Math.PI) * 0.34 + 0.04, feather, { quality, tubular: 26, radial: 18, aspect: () => [0.92, 1.12] }));
  for (let t = -2; t <= 2; t++) {
    crane.add(taperedSpline([[t * 0.04, 1.12, -0.45], [t * 0.08, 1.08, -0.85], [t * 0.11, 0.85, -1.28]],
      (u) => Math.sin(u * Math.PI * 0.85 + 0.15) * 0.07, MATS.cloth,
      { quality, tubular: 16, radial: 10, aspect: () => [0.3, 1.6] }));
  }
  crane.add(taperedSpline([[0, 1.28, 0.42], [0, 1.65, 0.68], [0, 2.15, 0.48], [0, 2.52, 0.65]],
    (u) => 0.085 - u * 0.035, feather, { quality, tubular: 30, radial: 14 }));
  crane.add(meshOf(new THREE.SphereGeometry(0.095, seg(24, quality, 10), seg(24, quality, 10)), feather,
    [0, 2.55, 0.68], [0, 0, 0], [0.92, 0.95, 1.15]));
  crane.add(meshOf(new THREE.SphereGeometry(0.055, 18, 14), options.tint ? MATS.glowCyan : MATS.ruby, [0, 2.62, 0.69], [0, 0, 0], [0.9, 0.7, 1.1]));
  crane.add(taperedSpline([[0, 2.54, 0.74], [0, 2.52, 1.18]], (u) => (1 - u * 0.92) * 0.036, MATS.gold,
    { quality, tubular: 14, radial: 10 }));
  const wings: THREE.Group[] = [];
  for (const side of [-1, 1] as const) {
    const wing = buildFeatheredWing(side, 2.0, feather, MATS.cloth, quality);
    wing.position.set(side * 0.26, 1.32, 0.15);
    crane.add(wing);
    wings.push(wing);
  }
  for (const x of [-0.14, 0.14]) {
    crane.add(taperedSpline([[x, 1.0, 0], [x, 0.45, -0.15], [x, -0.15, -0.05]],
      (u) => 0.026 * (1 - u * 0.25), MATS.gold, { quality, tubular: 16, radial: 8 }));
    for (const tx of [-0.04, 0, 0.04]) {
      crane.add(taperedSpline([[x, -0.15, -0.05], [x + tx, -0.17, 0.09]],
        (u) => 0.012 * (1 - u * 0.6), MATS.gold, { quality, tubular: 8, radial: 6 }));
    }
  }
  if (options.saddle) {
    const cushion = pleatedLathe([[0.01, 0], [0.3, 0.02], [0.32, 0.08], [0.26, 0.14]], silk('#a8802f'),
      { quality, segments: 28, pleats: 12, pleatDepth: 0.008 });
    cushion.position.set(0, 1.42, 0);
    crane.add(cushion);
  }
  crane.userData.parts = { wings, head: crane, legs: [] };
  return crane;
}

/** Hooded void spirit: tattered cloak, hollow chest and a drifting soul core. */
export function buildWraith(quality = 1, tint = '#584773', glow = '#c28bff'): THREE.Group {
  const cloak = tinted(tint, { roughness: 0.7, emissive: '#2c1642', emissiveIntensity: 0.5, });
  const aura = tinted(glow, { roughness: 0.2, emissive: glow, emissiveIntensity: 1.9 });
  const group = new THREE.Group();
  group.add(pleatedLathe([[0.06, 0], [0.52, 0.05], [0.62, 0.55], [0.5, 1.15], [0.42, 1.55], [0.3, 1.72]],
    cloak, { quality, segments: 60, pleats: 20, pleatDepth: 0.05 }));
  group.add(meshOf(new THREE.SphereGeometry(0.3, seg(26, quality, 10), seg(26, quality, 10)), cloak,
    [0, 1.86, 0.02], [0, 0, 0], [1, 1.05, 1]));
  group.add(meshOf(new THREE.ConeGeometry(0.36, 0.6, seg(26, quality, 10), 1, true), cloak, [0, 2.12, -0.02], [0.12, 0, 0]));
  group.add(meshOf(new THREE.SphereGeometry(0.16, 20, 14), aura, [0, 1.9, 0.2], [0, 0, 0], [1.1, 0.7, 0.5]));
  group.add(meshOf(new THREE.OctahedronGeometry(0.24, 1), aura, [0, 1.35, 0.06]));
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2;
    group.add(taperedSpline([[Math.cos(angle) * 0.34, 1.2, Math.sin(angle) * 0.34],
      [Math.cos(angle) * 0.6, 0.55, Math.sin(angle) * 0.6], [Math.cos(angle) * 0.75, -0.05, Math.sin(angle) * 0.75]],
    (u) => 0.09 * (1 - u * 0.7), cloak, { quality, tubular: 14, radial: 8, aspect: () => [0.4, 1] }));
  }
  for (const side of [-1, 1]) {
    group.add(meshOf(new THREE.SphereGeometry(0.045, 12, 10), aura, [side * 0.12, 1.98, 0.26]));
    group.add(taperedSpline([[side * 0.3, 1.6, 0.1], [side * 0.62, 1.35, 0.4], [side * 0.78, 0.95, 0.2]],
      (u) => 0.06 * (1 - u * 0.5), cloak, { quality, tubular: 14, radial: 8 }));
  }
  group.userData.parts = { legs: [] };
  return group;
}

/** Ancient stone guardian held together by a spirit core. */
export function buildStoneGolem(quality = 1, tint = '#8a8d84', glow = '#ffe4b2'): THREE.Group {
  const rock = tinted(tint, { roughness: 0.85, emissive: '#000000' });
  const core = tinted(glow, { roughness: 0.2, emissive: glow, emissiveIntensity: 1.9 });
  const group = new THREE.Group();
  const boulder = (radius: number, stretch: [number, number, number], seed: number, position: [number, number, number]) => {
    const mesh = meshOf(new THREE.SphereGeometry(radius, seg(24, quality, 10), seg(24, quality, 10)), rock);
    const attribute = mesh.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < attribute.count; i++) {
      const x = attribute.getX(i), y = attribute.getY(i), z = attribute.getZ(i);
      const n = 1 + Math.sin(x * 6.5 + seed) * Math.cos(y * 6.5 - seed) * Math.sin(z * 6.5 + seed) * 0.24 +
        Math.sin(x * 14 + y * 11) * 0.06;
      attribute.setXYZ(i, x * stretch[0] * n, y * stretch[1] * n, z * stretch[2] * n);
    }
    mesh.geometry.computeVertexNormals();
    mesh.position.set(...position);
    return mesh;
  };
  group.add(boulder(0.66, [1.05, 1.15, 0.85], 1.2, [-0.44, 1.5, 0]));
  group.add(boulder(0.66, [1.05, 1.15, 0.85], 2.5, [0.44, 1.5, 0]));
  group.add(boulder(0.5, [1.2, 0.85, 0.9], 3.8, [0, 0.6, 0]));
  group.add(boulder(0.4, [0.95, 1.1, 0.95], 5.1, [0, 2.32, 0.04]));
  group.add(meshOf(new THREE.SphereGeometry(0.42, seg(24, quality, 10), seg(24, quality, 10)), core, [0, 1.38, 0]));
  group.add(meshOf(new THREE.TorusGeometry(0.6, 0.024, 10, 40), core, [0, 1.38, 0], [0.6, 0.4, 0]));
  for (const side of [-1, 1] as const) {
    group.add(boulder(0.36, [1.05, 0.95, 1], 6.4 + side, [side * 1.0, 1.72, 0]));
    group.add(boulder(0.3, [0.85, 1.3, 0.9], 8.1 + side, [side * 1.2, 1.0, 0.18]));
    group.add(boulder(0.32, [1.1, 1, 1.15], 9.7 + side, [side * 1.28, 0.35, 0.3]));
    group.add(meshOf(new THREE.SphereGeometry(0.062, 14, 10), core, [side * 0.14, 2.34, 0.36]));
  }
  for (const side of [-1, 1] as const) group.add(boulder(0.3, [0.9, 1.35, 0.95], 11.2 + side, [side * 0.42, 0.1, 0]));
  group.userData.parts = { legs: [] };
  return group;
}

/** Coiling void dragon boss with antlers, whiskers, flame mane and a dragon pearl. */
export function buildDragonBoss(quality = 1): THREE.Group {
  const dragon = new THREE.Group();
  const points: [number, number, number][] = [];
  for (let i = 0; i <= 72; i++) {
    const u = i / 72;
    const angle = u * Math.PI * 3.2;
    const radius = 1.9 * Math.sin(u * Math.PI * 0.8 + 0.2);
    points.push([Math.cos(angle) * radius, (u - 0.35) * 3.6 + Math.sin(u * 10) * 0.24, Math.sin(angle) * radius]);
  }
  dragon.add(taperedSpline(points, (u) => Math.sin(Math.pow(u, 0.68) * Math.PI * 0.92 + 0.1) * 0.38,
    MATS.dragonScale, { quality, tubular: 96, radial: 24, aspect: () => [1.08, 0.94] }));
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  for (let i = 4; i < 68; i += 3) {
    const u = i / 72;
    const point = curve.getPointAt(u);
    dragon.add(meshOf(bladeGeometry(0.46 * Math.sin(u * Math.PI), 0.085, 0.022, -0.09), MATS.gold,
      [point.x, point.y + 0.3, point.z]));
  }
  for (const [index, uPos] of [0.26, 0.4, 0.64, 0.8].entries()) {
    const point = curve.getPointAt(uPos);
    const side = index % 2 === 0 ? -1 : 1;
    const leg = new THREE.Group();
    leg.position.set(point.x, point.y - 0.1, point.z);
    leg.add(taperedSpline([[0, 0, 0], [side * 0.4, -0.26, 0.16], [side * 0.3, -0.62, 0.34]],
      (u) => 0.19 * (1 - u * 0.45), MATS.dragonScale, { quality, tubular: 16, radial: 12 }));
    for (let claw = -2; claw <= 2; claw++) {
      leg.add(taperedSpline([[side * 0.3 + claw * 0.035, -0.62, 0.34], [side * 0.3 + claw * 0.055, -0.72, 0.5],
        [side * 0.3 + claw * 0.05, -0.8, 0.44]], (u) => (1 - u * 0.85) * 0.028, MATS.gold,
      { quality, tubular: 10, radial: 8 }));
    }
    dragon.add(leg);
  }
  const headPosition = points[points.length - 1];
  const head = new THREE.Group();
  head.position.set(headPosition[0], headPosition[1], headPosition[2]);
  head.add(taperedSpline([[0, 0.06, -0.34], [0, 0.1, 0.06], [0, 0.02, 0.44], [0, 0.05, 0.8]],
    (u) => 0.32 * (1 - u * 0.28 + Math.sin(u * Math.PI * 2) * 0.06), MATS.dragonScale,
    { quality, tubular: 26, radial: 18, aspect: (u) => [0.75 - u * 0.15, 1.25] }));
  head.add(taperedSpline([[0, -0.08, -0.1], [0, -0.18, 0.34], [0, -0.22, 0.7]],
    (u) => 0.24 * (1 - u * 0.35), MATS.gold, { quality, tubular: 20, radial: 16, aspect: () => [0.48, 1.15] }));
  for (const side of [-1, 1] as const) {
    head.add(taperedSpline([[side * 0.12, 0.14, 0.28], [side * 0.28, 0.22, 0.12], [side * 0.36, 0.3, -0.12]],
      (u) => Math.sin(u * Math.PI) * 0.055, MATS.gold, { quality, tubular: 14, radial: 10 }));
    head.add(meshOf(new THREE.SphereGeometry(0.062, 18, 14), MATS.glowGold, [side * 0.22, 0.1, 0.18], [0, 0, 0], [1.2, 0.75, 1]));
    head.add(taperedSpline([[side * 0.18, 0.18, -0.08], [side * 0.42, 0.58, -0.45], [side * 0.34, 1.02, -0.82]],
      (u) => (1 - u * 0.78) * 0.065, MATS.gold, { quality, tubular: 20, radial: 12 }));
    head.add(taperedSpline([[side * 0.32, 0.45, -0.32], [side * 0.56, 0.72, -0.25]],
      (u) => (1 - u * 0.85) * 0.04, MATS.gold, { quality, tubular: 12, radial: 8 }));
    head.add(taperedSpline([[side * 0.2, 0.02, 0.68], [side * 0.68, 0.18, 0.98], [side * 1.05, -0.22, 1.22]],
      (u) => (1 - u * 0.85) * 0.024, MATS.glowCyan, { quality, tubular: 24, radial: 8 }));
    head.add(taperedSpline([[side * 0.15, 0, 0.62], [side * 0.16, -0.16, 0.65]],
      (u) => (1 - u * 0.9) * 0.032, MATS.tusk, { quality, tubular: 10, radial: 8 }));
    for (let m = 0; m < 5; m++) {
      const angle = (m / 4 - 0.5) * Math.PI * 1.1;
      head.add(taperedSpline([[Math.sin(angle) * 0.28, Math.cos(angle) * 0.22, -0.18],
        [Math.sin(angle) * 0.52, Math.cos(angle) * 0.42, -0.55]], (u) => Math.sin(u * Math.PI) * 0.05,
      MATS.glowCyan, { quality, tubular: 12, radial: 8 }));
    }
  }
  dragon.add(head);
  const pearl = meshOf(new THREE.SphereGeometry(0.26, seg(26, quality, 12), seg(26, quality, 12)), MATS.glowGold,
    [headPosition[0], headPosition[1] - 0.14, headPosition[2] + 1.3]);
  dragon.add(pearl);
  dragon.userData.parts = { head, pearl };
  return dragon;
}

/* ------------------------------- mounts ---------------------------------- */

export function buildFlyingSwordMount(quality = 1): THREE.Group {
  const group = new THREE.Group();
  const sword = buildDetailedSword(MATS.jade, MATS.gold, 1.5, quality);
  sword.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  group.add(sword);
  group.add(meshOf(new THREE.TorusGeometry(1.5, 0.02, 12, 48), MATS.glowCyan, [0, -0.12, 0], [Math.PI / 2, 0, 0]));
  group.userData.parts = {};
  return group;
}

export function buildCloudDiscMount(quality = 1): THREE.Group {
  const group = new THREE.Group();
  group.add(meshOf(new THREE.CylinderGeometry(1.5, 1.24, 0.16, seg(44, quality, 16)), MATS.whiteJade));
  group.add(meshOf(new THREE.CircleGeometry(1.46, seg(44, quality, 16)), MATS.rune, [0, 0.09, 0], [-Math.PI / 2, 0, 0]));
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2;
    group.add(meshOf(bladeGeometry(0.55, 0.2, 0.028, 0.1), MATS.jade,
      [Math.cos(angle) * 1.45, 0.13, Math.sin(angle) * 1.45], [Math.PI / 3, -angle + Math.PI / 2, 0]));
  }
  group.userData.parts = {};
  return group;
}

export function buildWindFireWheelMount(quality = 1): THREE.Group {
  const group = new THREE.Group();
  for (const [index, x] of [-0.95, 0.95].entries()) {
    const wheel = new THREE.Group();
    wheel.position.set(x, 0.2, 0);
    wheel.add(meshOf(new THREE.TorusGeometry(0.8, 0.07, 16, 48), MATS.gold));
    wheel.add(meshOf(new THREE.SphereGeometry(0.2, 18, 14), index === 0 ? MATS.glowFire : MATS.glowCyan));
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      wheel.add(meshOf(new THREE.CylinderGeometry(0.022, 0.022, 1.6, 10), MATS.gold, [0, 0, 0], [0, 0, angle]));
      wheel.add(meshOf(bladeGeometry(0.42, 0.1, 0.02, 0.1), index === 0 ? MATS.glowFire : MATS.glowCyan,
        [Math.cos(angle) * 0.9, Math.sin(angle) * 0.9, 0], [0, 0, angle - Math.PI / 3]));
    }
    group.add(wheel);
  }
  group.userData.parts = { wheels: group.children as THREE.Group[] };
  return group;
}

export function buildCloudMount(dark = false, quality = 1): THREE.Group {
  const cloudMaterial = dark ? MATS.darkCloud : MATS.cloudWhite;
  const coreMaterial = dark ? MATS.glowFire : MATS.glowCyan;
  const group = new THREE.Group();
  group.add(taperedSpline([[-1.5, -0.18, -0.7], [-0.7, 0.1, 0.45], [0, 0.18, 0], [0.8, 0.1, -0.35], [1.4, 0.28, 0.35]],
    (u) => Math.sin(u * Math.PI) * 0.6 + 0.22, cloudMaterial, { quality, tubular: 32, radial: 18 }));
  for (const [x, y, z, radius] of [[0, 0.2, 0, 0.8], [-0.8, 0.1, 0.3, 0.6], [0.78, 0.16, -0.2, 0.64],
    [0.2, 0.34, 0.48, 0.5], [-0.38, 0.24, -0.48, 0.54]] as const) {
    group.add(meshOf(new THREE.SphereGeometry(radius, seg(28, quality, 12), seg(28, quality, 12)), cloudMaterial,
      [x, y, z], [0, 0, 0], [1.3, 0.72, 1.1]));
  }
  group.add(meshOf(new THREE.SphereGeometry(0.5, seg(22, quality, 10), seg(22, quality, 10)), coreMaterial, [0, 0.14, 0]));
  group.userData.parts = {};
  return group;
}

export function buildQilinMount(quality = 1): THREE.Group {
  const { group, head, legs, wings } = buildQuadruped({
    body: MATS.spiritSkin, accent: MATS.gold, eye: MATS.glowCyan, quality,
    scale: 1.08, legHeight: 0.95, bodyThickness: 0.34, neckLength: 0.5, saddle: true, wings: true,
  });
  for (const side of [-1, 1] as const) {
    head.add(taperedSpline([[side * 0.08, 0.18, 0], [side * 0.22, 0.48, -0.18], [side * 0.15, 0.72, -0.35]],
      (u) => (1 - u * 0.8) * 0.04, MATS.gold, { quality, tubular: 16, radial: 10 }));
  }
  group.add(taperedSpline([[0, 0.95, -0.75], [0, 1.3, -1.4], [0, 1.7, -1.85]],
    (u) => Math.sin(u * Math.PI) * 0.14 + 0.02, MATS.glowCyan, { quality, tubular: 20, radial: 10 }));
  group.userData.parts = { head, legs, wings };
  return group;
}

/* ------------------------------ registries -------------------------------- */

export type PetId = 'spirit_fox' | 'spirit_wolf' | 'iron_boar' | 'cloud_crane_pet' | 'spirit_stag_pet'
  | 'spirit_serpent' | 'shadow_raven';

/**
 * Every spirit beast is sculpted at its own natural scale, so the world layer normalises each
 * one to a target height and rests it on the ground before it is ever cloned.
 */
function fitBounds(group: THREE.Group, height: number): THREE.Group {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (size.y > 0.0001) group.scale.multiplyScalar(height / size.y);
  group.updateMatrixWorld(true);
  box.setFromObject(group);
  group.position.y -= box.min.y;
  return group;
}

export function buildPetModel(itemId: string, quality = 1): THREE.Group {
  switch (itemId) {
    case 'spirit_wolf': return fitBounds(buildSpiritWolf(quality), 1.35);
    case 'iron_boar': return fitBounds(buildIronBoar(quality), 1.05);
    case 'cloud_crane_pet': return fitBounds(buildCloudCrane(quality), 1.35);
    case 'spirit_stag_pet': return fitBounds(buildSpiritStag(quality), 1.55);
    case 'spirit_serpent': return fitBounds(buildSpiritSerpent(quality), 1.15);
    case 'shadow_raven': {
      const raven = buildCloudCrane(quality, { tint: '#2c2a3f' });
      raven.traverse((child) => { if (child instanceof THREE.Mesh) child.material = MATS.cloth; });
      raven.add(meshOf(new THREE.SphereGeometry(0.05, 16, 12), MATS.glowPurple, [0, 2.62, 0.78]));
      return fitBounds(raven, 1.3);
    }
    default: return fitBounds(buildSpiritFox(quality), 1.2);
  }
}

export function buildMountModel(itemId: string, quality = 1): THREE.Group {
  switch (itemId) {
    case 'cloud_disc': return buildCloudDiscMount(quality);
    case 'wind_fire_wheel': return buildWindFireWheelMount(quality);
    case 'cloud_crane_mount': return buildCloudCrane(quality, { saddle: true });
    case 'jade_stag_mount': return buildSpiritStag(quality, true);
    case 'ink_cloud': return buildCloudMount(true, quality);
    case 'spirit_cloud': return buildCloudMount(false, quality);
    default: return buildFlyingSwordMount(quality);
  }
}

export type MonsterVisual = { color: string; glow: string; quality: number };

/** Field-monster silhouettes, all ground-aligned so nothing sinks into the terrain. */
const MONSTER_HEIGHT: Record<string, number> = {
  wolf: 1.55, boar: 1.15, spirit_stag: 2.1, forest_serpent: 1.55, void_serpent: 2.45,
  stone_golem: 2.6, star_guardian: 3.4, cloud_crane: 2.2, thunder_bird: 2.6,
  shade: 2.15, sky_wraith: 2.7,
};

/** One entry point so world actors never carry their own mesh code. */
export function buildMonsterModel(kind: string, visual: MonsterVisual): THREE.Group {
  const { quality, color, glow } = visual;
  const model = buildMonsterBody(kind, color, glow, quality);
  return fitBounds(model, MONSTER_HEIGHT[kind] ?? 1.8);
}

function buildMonsterBody(kind: string, color: string, glow: string, quality: number): THREE.Group {
  switch (kind) {
    case 'boar': return buildIronBoar(quality);
    case 'spirit_stag': return buildSpiritStag(quality, false, color);
    case 'forest_serpent': return buildSpiritSerpent(quality);
    case 'void_serpent': return buildSpiritSerpent(quality, { dark: true });
    case 'stone_golem': return buildStoneGolem(quality, color, glow);
    case 'star_guardian': return buildStoneGolem(quality, '#9aa2bb', glow);
    case 'cloud_crane': return buildCloudCrane(quality);
    case 'thunder_bird': return buildCloudCrane(quality, { tint: '#c9dcf2' });
    case 'shade': return buildWraith(quality, color, glow);
    case 'sky_wraith': return buildWraith(quality, color, glow);
    default: return buildSpiritWolf(quality, color, glow);
  }
}
