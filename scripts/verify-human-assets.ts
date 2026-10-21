// Deno 2 CI check. The unusual .ysl file is input, not a GitHub Actions workflow.
// Usage: deno run --allow-read=deno.ysl,apps/client/public/human scripts/verify-human-assets.ts
const ci = await Deno.readTextFile('deno.ysl');
const setting = (name: string): string => {
  const value = ci.match(new RegExp(`^${name}:\\s*([^#\\n]+)`, 'm'))?.[1]?.trim();
  if (!value) throw new Error(`deno.ysl: missing ${name}`);
  return value;
};
const root = setting('assets_dir');
if (root !== 'apps/client/public/human') throw new Error('Unexpected asset root in deno.ysl');
const tiers = setting('skin_tiers').split(',');
if (tiers.join(',') !== '1k,2k') throw new Error('Both 1K and 2K local skin textures are required');
const minVertices = Number(setting('minimum_vertices'));
if (!Number.isSafeInteger(minVertices) || minVertices < 19000) throw new Error('Invalid minimum vertex count');

type Proxy = { file: string; texture?: string; normalTexture?: string };
type Manifest = {
  vertexCount: number; body: { file: string }; shapes: { file: string };
  proxies: Proxy[]; skins: { id: string }[]; eyes: string[];
};
const manifest = JSON.parse(await Deno.readTextFile(`${root}/manifest.json`)) as Manifest;
if (manifest.vertexCount < minVertices || manifest.skins.length < 6 || manifest.proxies.length < 14)
  throw new Error('Human mesh, gender-specific skins or face/hair proxy is missing');
if (!manifest.proxies.some((p) => p.normalTexture)) throw new Error('Detailed PBR robe normal maps are missing');
const paths = new Set([
  manifest.body.file, manifest.shapes.file,
  ...manifest.skins.flatMap(({ id }) => tiers.map((tier) => `skins/${id}_${tier}.webp`)),
  ...manifest.eyes.map((id) => `eyes/${id}.webp`),
  ...manifest.proxies.flatMap((p) => [p.file, p.texture, p.normalTexture].filter((path): path is string => Boolean(path))),
]);
for (const file of paths) {
  if (file.startsWith('/') || file.includes('..') || !/^[\w/.-]+$/.test(file)) throw new Error(`Unsafe manifest path: ${file}`);
  const stat = await Deno.stat(`${root}/${file}`);
  if (!stat.isFile || stat.size === 0) throw new Error(`Empty human asset: ${file}`);
}
console.log(`HumanForge CC0: ${manifest.vertexCount} vertices, ${manifest.skins.length} skins, ${paths.size} local assets validated.`);
