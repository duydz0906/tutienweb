/**
 * Software rasteriser used to eyeball the sculpted models without a browser.
 * Renders a scene to a PNG with a z-buffer and a single lambert light.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';

(globalThis as unknown as { document: unknown }).document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => null }),
};

const counts = new Map<string, number>();
const WIDTH = 520;
const HEIGHT = 660;

type Vertex = { x: number; y: number; z: number };

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function writePng(path: string, rgb: Uint8Array, width: number, height: number): void {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width * 3; x++) raw[y * (width * 3 + 1) + 1 + x] = rgb[y * width * 3 + x];
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2; header[10] = 0; header[11] = 0; header[12] = 0;
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]));
}

function render(object: THREE.Object3D, path: string, eye: THREE.Vector3, target: THREE.Vector3): void {
  object.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(32, WIDTH / HEIGHT, 0.05, 200);
  camera.position.copy(eye);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  const viewProject = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix, camera.matrixWorldInverse);

  const color = new Uint8Array(WIDTH * HEIGHT * 3);
  const depth = new Float32Array(WIDTH * HEIGHT).fill(Infinity);
  // Warm sky gradient background.
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const t = y / HEIGHT;
      const index = (y * WIDTH + x) * 3;
      color[index] = 34 + t * 46; color[index + 1] = 40 + t * 50; color[index + 2] = 52 + t * 60;
    }
  }

  const light = new THREE.Vector3(0.45, 0.82, 0.36).normalize();
  const triangles: { points: Vertex[]; shade: number; alpha: number; depth: number; color: THREE.Color }[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const na = new THREE.Vector3(), nb = new THREE.Vector3(), nc = new THREE.Vector3();
  const projected: Vertex[] = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }];

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.visible) return;
    const geometry = child.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute('position');
    if (!position) return;
    const index = geometry.getIndex();
    const normalAttribute = geometry.getAttribute('normal');
    let tint = (child.material as THREE.MeshStandardMaterial).color ?? new THREE.Color(0.7, 0.7, 0.7);
    const material = child.material as THREE.MeshStandardMaterial;
    const emissive = material.emissive ? material.emissive.clone().multiplyScalar(material.emissiveIntensity ?? 0) : new THREE.Color(0, 0, 0);
    const alpha = material.transparent ? (material.opacity ?? 1) * 0.85 : 1;
    const count = index ? index.count : position.count;
    for (let i = 0; i < count; i += 3) {
      for (let k = 0; k < 3; k++) {
        const vi = index ? index.getX(i + k) : i + k;
        a.fromBufferAttribute(position, vi).applyMatrix4(child.matrixWorld);
        const p = projected[k];
        const clip = new THREE.Vector4(a.x, a.y, a.z, 1).applyMatrix4(viewProject);
        p.x = (clip.x / clip.w * 0.5 + 0.5) * WIDTH;
        p.y = (1 - (clip.y / clip.w * 0.5 + 0.5)) * HEIGHT;
        p.z = clip.z / clip.w;
        (k === 0 ? b : c).copy(a);
      }
      // World-space normal for a cheap directional light.
      b.sub(a); c.sub(a);
      const worldNormal = new THREE.Vector3().crossVectors(b, c).normalize();
      const shade = Math.abs(worldNormal.dot(light));
      if (normalAttribute) na.fromBufferAttribute(normalAttribute, 0);
      const base = tint.clone().multiplyScalar(0.22 + shade * 0.9).add(emissive.clone().multiplyScalar(0.6));
      if (path.includes('golem')) counts.set(base.getHexString(), (counts.get(base.getHexString()) ?? 0) + 1);
      triangles.push({
        points: projected.map((p) => ({ ...p })),
        shade,
        alpha,
        depth: (projected[0].z + projected[1].z + projected[2].z) / 3,
        color: base,
      });
    }
  });

  triangles.sort((l, r) => (l.alpha < 1 && r.alpha >= 1 ? 1 : r.alpha < 1 && l.alpha >= 1 ? -1 : r.depth - l.depth));

  for (const triangle of triangles) {
    const [p0, p1, p2] = triangle.points;
    const minX = Math.max(0, Math.floor(Math.min(p0.x, p1.x, p2.x)));
    const maxX = Math.min(WIDTH - 1, Math.ceil(Math.max(p0.x, p1.x, p2.x)));
    const minY = Math.max(0, Math.floor(Math.min(p0.y, p1.y, p2.y)));
    const maxY = Math.min(HEIGHT - 1, Math.ceil(Math.max(p0.y, p1.y, p2.y)));
    const area = (p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y);
    if (Math.abs(area) < 1e-9) continue;
    const r = Math.round(Math.min(255, Math.max(0, triangle.color.r * 255)));
    const g = Math.round(Math.min(255, Math.max(0, triangle.color.g * 255)));
    const bl = Math.round(Math.min(255, Math.max(0, triangle.color.b * 255)));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((p1.x - p0.x) * (py - p0.y) - (px - p0.x) * (p1.y - p0.y)) / area;
        const w1 = ((px - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (py - p0.y)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = p0.z * w2 + p1.z * w0 + p2.z * w1;
        const index = y * WIDTH + x;
        if (z >= depth[index]) continue;
        if (triangle.alpha >= 1) depth[index] = z;
        const target3 = index * 3;
        if (triangle.alpha >= 1) {
          color[target3] = r; color[target3 + 1] = g; color[target3 + 2] = bl;
        } else {
          color[target3] = Math.round(color[target3] * (1 - triangle.alpha) + r * triangle.alpha);
          color[target3 + 1] = Math.round(color[target3 + 1] * (1 - triangle.alpha) + g * triangle.alpha);
          color[target3 + 2] = Math.round(color[target3 + 2] * (1 - triangle.alpha) + bl * triangle.alpha);
        }
      }
    }
  }
  writePng(path, color, WIDTH, HEIGHT);
  console.log(`wrote ${path} (${triangles.length} triangles)`);
  if (counts.size) console.log('colors', [...counts.entries()].sort((l, r) => r[1] - l[1]).slice(0, 8), 'of', counts.size);
}

const { buildCultivator } = await import('../src/game/sculpt/cultivator.ts');
const beasts = await import('../src/game/sculpt/beasts.ts');

const look = { gender: 'nam' as const, hair: 'tied' as const, hairColor: 'ink' as const, face: 'oval' as const,
  skinTone: 'warm' as const, robeColor: 'ivory' as const, height: 0.6, build: 0.55, quality: 1 };
const cultivator = buildCultivator(look);
render(cultivator, '/tmp/cultivator-front.png', new THREE.Vector3(2.6, 1.7, 3.4), new THREE.Vector3(0, 1.05, 0));
render(cultivator, '/tmp/cultivator-side.png', new THREE.Vector3(3.6, 1.6, 0.6), new THREE.Vector3(0, 1.05, 0));
const head = cultivator.getObjectByName('rig-head');
if (head) {
  const box = new THREE.Box3().setFromObject(head);
  console.log('head box', box.min.toArray().map((v) => v.toFixed(2)), box.max.toArray().map((v) => v.toFixed(2)));
}
if (head) render(head, '/tmp/cultivator-head.png', new THREE.Vector3(0.5, 1.8, 1.05), new THREE.Vector3(0, 1.78, 0));
render(cultivator, '/tmp/cultivator-back.png', new THREE.Vector3(-2.4, 1.7, -3.4), new THREE.Vector3(0, 1.05, 0));
render(beasts.buildPetModel('spirit_fox', 1), '/tmp/fox.png', new THREE.Vector3(1.6, 0.9, 2.1), new THREE.Vector3(0, 0.55, 0));
const golem = beasts.buildMonsterModel('stone_golem', { color: '#888375', glow: '#ffe4b2', quality: 1 });
golem.traverse((child) => {
  if (child instanceof THREE.Mesh) {
    const material = child.material as THREE.MeshStandardMaterial;
    const box = new THREE.Box3().setFromBufferAttribute(child.geometry.getAttribute('position') as THREE.BufferAttribute);
    console.log('golem part', material.type, material.color.getHexString(), 'transparent=', material.transparent,
      'points', child.geometry.getAttribute('position').count, 'box', box.min.toArray().map((v) => v.toFixed(1)).join(','), box.max.toArray().map((v) => v.toFixed(1)).join(','));
  }
});
render(golem, '/tmp/golem.png', new THREE.Vector3(3.2, 1.9, 4.4), new THREE.Vector3(0, 1.2, 0));
