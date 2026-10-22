import * as THREE from 'three';

/**
 * Procedural PBR surfaces for the sculpted characters. Everything is generated once at module
 * load (no network, no texture files): woven silk, beast scales and a Bagua rune sheet.
 */
function paintTexture(paint: (ctx: CanvasRenderingContext2D, size: number) => void, repeat = 1): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) paint(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export const silkTexture = paintTexture((ctx, size) => {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(198, 214, 226, 0.32)';
  ctx.lineWidth = 1;
  for (let i = 0; i < size; i += 4) {
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
  }
  // Brocade cloud roundels, the classic xianxia garment motif.
  ctx.strokeStyle = 'rgba(255, 214, 138, 0.22)';
  ctx.lineWidth = 2;
  for (let x = 64; x < size; x += 128) {
    for (let y = 64; y < size; y += 128) {
      ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI * 1.5); ctx.stroke();
    }
  }
}, 3);

export const scaleTexture = paintTexture((ctx, size) => {
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  const radius = 24;
  for (let y = 0; y < size + radius; y += radius) {
    const offset = (Math.floor(y / radius) % 2) * radius;
    for (let x = -radius; x < size + radius; x += radius * 2) {
      ctx.beginPath(); ctx.arc(x + offset, y, radius, 0, Math.PI); ctx.stroke();
    }
  }
}, 4);

export const runeTexture = paintTexture((ctx, size) => {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 4;
  ctx.translate(size / 2, size / 2);
  for (const radius of [240, 220, 160, 90]) {
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
  }
  for (let i = 0; i < 8; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 4);
    ctx.strokeRect(-20, 175, 40, 6);
    ctx.strokeRect(-20, 190, 40, 6);
    ctx.strokeRect(-20, 205, 40, 6);
    ctx.beginPath(); ctx.moveTo(0, -160); ctx.lineTo(65, 160); ctx.stroke();
    ctx.restore();
  }
}, 1);

const standard = (parameters: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(parameters);

/** One material per colour, so cached prototypes and their clones can share GPU resources. */
const silkCache = new Map<string, THREE.MeshStandardMaterial>();
export function silk(color: string): THREE.MeshStandardMaterial {
  let material = silkCache.get(color);
  if (!material) {
    material = standard({ color, map: silkTexture, bumpMap: silkTexture, bumpScale: 0.008,
      roughness: 0.4, metalness: 0.12, emissive: color, emissiveIntensity: 0.05, side: THREE.DoubleSide });
    silkCache.set(color, material);
  }
  return material;
}

const skinCache = new Map<string, THREE.MeshStandardMaterial>();
export function skinMaterial(color: string): THREE.MeshStandardMaterial {
  let material = skinCache.get(color);
  if (!material) {
    material = standard({ color, roughness: 0.42, metalness: 0.02, emissive: '#3a1810', emissiveIntensity: 0.06 });
    skinCache.set(color, material);
  }
  return material;
}

const hairCache = new Map<string, THREE.MeshStandardMaterial>();
export function hairMaterial(color: string): THREE.MeshStandardMaterial {
  let material = hairCache.get(color);
  if (!material) {
    material = standard({ color, roughness: 0.34, metalness: 0.16, emissive: color, emissiveIntensity: 0.05, side: THREE.DoubleSide });
    hairCache.set(color, material);
  }
  return material;
}

export const MATS = {
  lips: standard({ color: '#c9636f', roughness: 0.28, metalness: 0.04 }),
  eyeWhite: standard({ color: '#fdfbf7', roughness: 0.12 }),
  eyeIris: standard({ color: '#243a6b', roughness: 0.14, emissive: '#1e3a8a', emissiveIntensity: 0.3 }),
  eyeGold: standard({ color: '#fbbf24', emissive: '#f59e0b', emissiveIntensity: 1.35, roughness: 0.2 }),
  pupil: new THREE.MeshBasicMaterial({ color: '#050505' }),
  gold: standard({ color: '#d9b072', metalness: 0.88, roughness: 0.24, emissive: '#7c4d13', emissiveIntensity: 0.12 }),
  silver: standard({ color: '#dfe6ee', metalness: 0.86, roughness: 0.22 }),
  darkIron: standard({ color: '#414750', metalness: 0.8, roughness: 0.38, bumpMap: scaleTexture, bumpScale: 0.02 }),
  bronze: standard({ color: '#8c5a2e', metalness: 0.78, roughness: 0.34 }),
  jade: standard({ color: '#3fbf95', metalness: 0.15, roughness: 0.2, emissive: '#0f7f63', emissiveIntensity: 0.35,
    transparent: true, opacity: 0.94, side: THREE.DoubleSide }),
  whiteJade: standard({ color: '#e9f7ee', metalness: 0.1, roughness: 0.22, emissive: '#9fe8c6', emissiveIntensity: 0.14, side: THREE.DoubleSide }),
  ruby: standard({ color: '#e04a49', roughness: 0.18, metalness: 0.12, emissive: '#b01f1f', emissiveIntensity: 0.45 }),
  wood: standard({ color: '#5c3a22', roughness: 0.78 }),
  bamboo: standard({ color: '#4f9b58', roughness: 0.42 }),
  whiteFur: standard({ color: '#f4efe6', roughness: 0.62 }),
  cloudWhite: standard({ color: '#f2f8fb', roughness: 0.7, emissive: '#7fd4ec', emissiveIntensity: 0.16, transparent: true, opacity: 0.95 }),
  darkCloud: standard({ color: '#221f3d', roughness: 0.75, emissive: '#8c1d1d', emissiveIntensity: 0.28 }),
  glowCyan: standard({ color: '#dff6ff', emissive: '#38bdf8', emissiveIntensity: 1.7, side: THREE.DoubleSide }),
  glowGold: standard({ color: '#fff6d5', emissive: '#fbbf24', emissiveIntensity: 1.7, side: THREE.DoubleSide }),
  glowFire: standard({ color: '#ffe9d2', emissive: '#f97316', emissiveIntensity: 1.9, side: THREE.DoubleSide }),
  glowPurple: standard({ color: '#f2e6ff', emissive: '#a855f7', emissiveIntensity: 1.7, side: THREE.DoubleSide }),
  glowJade: standard({ color: '#e6fff7', emissive: '#2fd6b0', emissiveIntensity: 1.5, side: THREE.DoubleSide }),
  rune: standard({ map: runeTexture, emissiveMap: runeTexture, emissive: '#38bdf8', emissiveIntensity: 1.8,
    transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }),
  dragonScale: standard({ color: '#1f7fb8', metalness: 0.5, roughness: 0.28, bumpMap: scaleTexture, bumpScale: 0.045,
    emissive: '#0b4d78', emissiveIntensity: 0.25 }),
  serpentScale: standard({ color: '#2f9e6a', metalness: 0.36, roughness: 0.26, bumpMap: scaleTexture, bumpScale: 0.03,
    emissive: '#0e6b46', emissiveIntensity: 0.2 }),
  voidScale: standard({ color: '#4b3f66', metalness: 0.5, roughness: 0.3, bumpMap: scaleTexture, bumpScale: 0.035,
    emissive: '#5c2a8c', emissiveIntensity: 0.3 }),
  stone: standard({ color: '#7d858c', roughness: 0.82, bumpMap: silkTexture, bumpScale: 0.03 }),
  darkStone: standard({ color: '#5b6470', roughness: 0.86, bumpMap: silkTexture, bumpScale: 0.035 }),
  furGray: standard({ color: '#98a4b2', roughness: 0.66 }),
  furTan: standard({ color: '#c9a887', roughness: 0.68 }),
  furWhite: standard({ color: '#f6f1e7', roughness: 0.64 }),
  furCream: standard({ color: '#fdf3e2', roughness: 0.62 }),
  furCrimson: standard({ color: '#c94f5c', roughness: 0.5, emissive: '#8f1f2c', emissiveIntensity: 0.3 }),
  hoof: standard({ color: '#3c3a36', roughness: 0.55 }),
  tusk: standard({ color: '#efe3cf', roughness: 0.34 }),
  cloth: standard({ color: '#2b2f3a', roughness: 0.72, side: THREE.DoubleSide }),
  spiritSkin: standard({ color: '#eef7f1', roughness: 0.6, emissive: '#7fd4ec', emissiveIntensity: 0.08 }),
} as const;

/** Jade-steel blade: pale polished metal with a faint green spirit sheen. */
export const bladeSteel = standard({ color: '#dfe8e2', metalness: 0.86, roughness: 0.2,
  emissive: '#3f9a83', emissiveIntensity: 0.22 });

/** Celestial silk ribbon: pale, faintly luminous and translucent, never a neon tube. */
export const ribbonSilk = standard({ color: '#dff3ea', map: silkTexture, bumpMap: silkTexture, bumpScale: 0.004,
  roughness: 0.55, metalness: 0.06, emissive: '#6fd3bb', emissiveIntensity: 0.35,
  transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false });

export type SculptMaterial = THREE.MeshStandardMaterial;
