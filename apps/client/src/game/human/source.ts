import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Real humanoid assets (CC0 MakeHuman/MPFB pipeline, see public/human/LICENSE.ASSETS.md).
 *
 * Everything is shipped gzipped — a whole human is ~1.4 MB instead of ~4 MB — and unpacked in the
 * browser with `DecompressionStream`. The body is a quantised, skinned GLB (52 mixamo bones), and
 * hair/clothes/eyes are separate proxy meshes that share that skeleton.
 *
 * Loading is the only browser-specific part of the human pipeline, so it sits behind
 * `HumanSource`: tests drive the exact same builder with a Node source (fs + zlib) and no textures.
 */
export type HumanSource = {
  /** Parsed glTF scene for a file inside public/human, e.g. `proxies/hair-long01.glb.gz`. */
  gltf(path: string): Promise<THREE.Group>;
  /** Decoded colour texture, or null when the platform cannot load images (Node tests). */
  texture(path: string): THREE.Texture | null;
};

/** Assets are served from the Vite base (works under a sub-path deployment too). */
export function humanAssetUrl(path: string): string {
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
  return `${base.replace(/\/+$/, '')}/human/${path.replace(/^\/+/, '')}`;
}

/**
 * Files ship as `.gz`, but a static host may already have sent `Content-Encoding: gzip` (Vite does,
 * and the browser then decompresses transparently). Detect the magic bytes instead of assuming:
 * if it still starts with 1f 8b, unpack it here; otherwise the payload is already the raw GLB.
 */
async function maybeGunzip(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const magic = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength));
  if (magic[0] !== 0x1f || magic[1] !== 0x8b) return buffer;
  if (typeof DecompressionStream === 'undefined') throw new Error('Trình duyệt không hỗ trợ giải nén gzip.');
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

const gltfCache = new Map<string, Promise<THREE.Group>>();
const textureCache = new Map<string, THREE.Texture | null>();

/** Parse one packed GLB. The result is the shared prototype: never mutate it, clone instead. */
export function loadHumanGltf(path: string): Promise<THREE.Group> {
  const cached = gltfCache.get(path);
  if (cached) return cached;
  const pending = (async () => {
    const response = await fetch(humanAssetUrl(path));
    if (!response.ok) throw new Error(`Không tải được tài nguyên nhân vật: ${path} (${response.status}).`);
    const glb = await maybeGunzip(await response.arrayBuffer());
    const loader = new GLTFLoader();
    const gltf = await new Promise<GLTF>((resolve, reject) => loader.parse(glb, '', resolve, reject));
    return gltf.scene;
  })();
  gltfCache.set(path, pending);
  // A failed fetch must not poison the cache: the next attempt should retry.
  pending.catch(() => gltfCache.delete(path));
  return pending;
}

export function loadHumanTexture(path: string): THREE.Texture | null {
  if (textureCache.has(path)) return textureCache.get(path) ?? null;
  // Node (tests) has no image decoder; materials then fall back to flat PBR colours.
  if (typeof document === 'undefined') {
    textureCache.set(path, null);
    return null;
  }
  const texture = new THREE.TextureLoader().load(humanAssetUrl(path));
  // The GLB UVs follow the glTF convention (V measured from the top). Verified against the eye
  // texture: at v as-is the pupil vertex samples pure black; flipped it samples sclera grey.
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  textureCache.set(path, texture);
  return texture;
}

export const browserHumanSource: HumanSource = { gltf: loadHumanGltf, texture: loadHumanTexture };

/** Test/utility hook: forget decoded assets (also frees GPU memory on scene teardown). */
export function resetHumanAssets(): void {
  gltfCache.clear();
  textureCache.clear();
}
