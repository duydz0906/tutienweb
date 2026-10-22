// A pull can add build-time plugins while keeping an older local node_modules.
// Check the same resolution locations used by the npm workspaces before starting Vite.
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const fromRoot = createRequire(new URL('../package.json', import.meta.url));
const fromClient = createRequire(new URL('../apps/client/postcss.config.cjs', import.meta.url));
const fromServer = createRequire(new URL('../apps/server/package.json', import.meta.url));

/**
 * A pull that changes dependencies (removing one is enough) leaves Vite's prebundled cache stale, and
 * the browser then asks for a hash that no longer exists: the page loads and stays blank. The cache is
 * disposable, so drop it whenever package.json is newer than the prebundle.
 */
function clearStaleViteCache() {
  const cacheDir = fileURLToPath(new URL('../apps/client/node_modules/.vite/', import.meta.url));
  if (!existsSync(cacheDir)) return;
  const packageFile = fileURLToPath(new URL('../apps/client/package.json', import.meta.url));
  try {
    if (statSync(packageFile).mtimeMs <= statSync(cacheDir).mtimeMs) return;
    rmSync(cacheDir, { recursive: true, force: true });
    console.log('[setup] package.json is newer than the Vite cache; cleared it so the page cannot load a stale bundle.');
  } catch (error) {
    console.warn('[setup] Could not check the Vite cache:', error?.message ?? error);
  }
}

/** Ports are checked before starting so "cannot connect" is never a mystery. */
function checkPort(port, label) {
  return new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1' });
    const done = (busy) => { socket.destroy(); resolve(busy); };
    socket.setTimeout(700);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.once('close', () => resolve(false));
  });
}

async function warnBusyPorts() {
  for (const [port, label] of [[3001, 'API/socket'], [5173, 'giao diện Vite']]) {
    if (!await checkPort(port, label)) continue;
    console.warn(`[setup] Cổng ${port} (${label}) đang được dùng. Nếu đó là tiến trình "npm run dev" cũ,`
      + ' hãy tắt nó trước để tránh trang trắng / lỗi kết nối.');
  }
}

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
    ['install', '--include=dev', '--package-lock=false', '--no-audit', '--no-fund'],
    { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (install.error || install.status !== 0) {
    console.error('[setup] Automatic install failed. Run "npm install --include=dev --package-lock=false" in the repository root, then "npm run dev".');
    if (install.error) console.error(install.error.message);
    process.exit(install.status || 1);
  }
  const unresolved = required.filter(([name, resolveFrom]) => {
    try { resolveFrom.resolve(name); return false; } catch { return true; }
  }).map(([name]) => name);
  if (unresolved.length) {
    console.error(`[setup] Still missing ${unresolved.join(', ')}. Run "npm install --include=dev --package-lock=false" in the repository root.`);
    process.exit(1);
  }
  console.log('[setup] Workspace dependencies are ready.');
}

clearStaleViteCache();
await warnBusyPorts();
