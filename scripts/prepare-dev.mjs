// A pull can add build-time plugins while keeping an older local node_modules.
// Check the same resolution locations used by the npm workspaces before starting Vite.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const fromRoot = createRequire(new URL('../package.json', import.meta.url));
const fromClient = createRequire(new URL('../apps/client/postcss.config.cjs', import.meta.url));
const fromServer = createRequire(new URL('../apps/server/package.json', import.meta.url));

const required = [
  ['concurrently', fromRoot],
  ['vite', fromClient],
  ['postcss', fromClient],
  ['tailwindcss', fromClient],
  ['tsx', fromServer],
];
const missing = required.filter(([name, resolveFrom]) => {
  try { resolveFrom.resolve(name); return false; }
  catch (error) {
    if (error?.code === 'MODULE_NOT_FOUND' || error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') return true;
    throw error;
  }
}).map(([name]) => name);

if (missing.length) {
  console.log(`[setup] Missing local dependencies: ${missing.join(', ')}. Installing workspace dev dependencies...`);
  const install = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['install', '--include=dev', '--no-audit', '--no-fund'],
    { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (install.error || install.status !== 0) {
    console.error('[setup] Automatic install failed. Run "npm ci --include=dev" in the repository root, then "npm run dev".');
    if (install.error) console.error(install.error.message);
    process.exit(install.status || 1);
  }
  const unresolved = required.filter(([name, resolveFrom]) => {
    try { resolveFrom.resolve(name); return false; } catch { return true; }
  }).map(([name]) => name);
  if (unresolved.length) {
    console.error(`[setup] Still missing ${unresolved.join(', ')}. Run "npm ci --include=dev" in the repository root.`);
    process.exit(1);
  }
  console.log('[setup] Workspace dependencies are ready.');
}
