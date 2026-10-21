#!/usr/bin/env node
/**
 * Rebuild the small, self-hosted CC0 MakeHuman asset subset used by Vân Thượng.
 * Usage: node scripts/sync-human-assets.mjs /path/to/humanforge [--list]
 * A sparse clone needs assets/human/manifest.json checked out before --list.
 * Source revision: abdulrehman043/humanforge@43b06f4de92d075e0861aa2f363a3e710b2eea2e
 * Assets are CC0-1.0; HumanForge runtime is MIT. Never fetch assets from the browser/CDN.
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../apps/client/public/human/', import.meta.url));
const sourceArg = process.argv.slice(2).find((argument) => argument !== '--list');
if (!sourceArg) throw new Error('Cần đường dẫn checkout HumanForge. Ví dụ: node scripts/sync-human-assets.mjs /tmp/humanforge --list');
const source = resolve(sourceArg);
const manifest = JSON.parse(await readFile(join(source, 'assets/human/manifest.json'), 'utf8'));

// Kept deliberately small: clothing fits the Mixamo rig, hair cards are separately tintable.
const hair = ['long01', 'ponytail01', 'bob02', 'short01', 'short03', 'braid01', 'rehmanpolanski_hair_bun_brown'];
const garments = ['dress_maxi01', 'jalabiya01', 'shoes04'];
const face = ['eyes-high-poly', 'teeth-teeth_base', 'tongue-tongue01', 'eyebrows-eyebrow001', 'eyelashes-eyelashes01'];
const allowed = new Set([...hair.map(id => `hair-${id}`), ...garments.map(id => `clothes-${id}`), ...face]);
manifest.proxies = manifest.proxies.filter(p => allowed.has(`${p.kind}-${p.id}`));
for (const p of manifest.proxies) delete p.preview; // keep CC0 fabric normal maps for close-up PBR detail
manifest.skins = manifest.skins.filter(s => /^young_(caucasian|asian|african)_(female|male)$/.test(s.id));
manifest.eyes = ['brownlight'];
manifest.eyeOptions = { brownlight: manifest.eyeOptions.brownlight };
// Mobile pack points at an external CDN. Our client always uses the bundled WebP assets.
delete manifest.mobileTextures;

const files = new Set([
  'body.glb.gz', 'shapes.bin.gz', 'eyes/brownlight.webp',
  ...manifest.skins.flatMap(s => [`skins/${s.id}_1k.webp`, `skins/${s.id}_2k.webp`]),
  ...manifest.proxies.flatMap(p => [p.file, p.texture, p.normalTexture].filter(Boolean)),
]);
if (process.argv.includes('--list')) {
  console.log(['/LICENSE.ASSETS.md', '/LICENSE', '/assets/human/manifest.json', ...[...files].map(p => `/assets/human/${p}`)].join('\n'));
  process.exit(0);
}
await mkdir(root, { recursive: true });
for (const path of files) {
  const output = join(root, path);
  await mkdir(dirname(output), { recursive: true });
  await copyFile(join(source, 'assets/human', path), output);
}
await copyFile(join(source, 'LICENSE.ASSETS.md'), join(root, 'LICENSE.ASSETS.md'));
await copyFile(join(source, 'LICENSE'), join(root, 'LICENSE.HUMANFORGE.md'));
await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
console.log(`Copied ${files.size} CC0 asset files into ${root}. Runtime never fetches external URLs.`);
