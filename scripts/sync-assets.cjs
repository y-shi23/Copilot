const fs = require('fs');
const path = require('path');

const root = process.cwd();
const releaseDir = path.join(root, 'runtime');

if (!fs.existsSync(releaseDir)) {
  console.error('[sync-assets] Missing release directory: runtime');
  process.exit(1);
}

function shouldCopy(sourcePath) {
  const name = path.basename(sourcePath);

  if (name === 'node_modules' || name === '__pycache__') return false;
  if (name.endsWith('.map')) return false;
  if (name.startsWith('.') && name !== '.gitkeep') return false;
  return true;
}

function resetDir(targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
}

function copyDirectory(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Source directory not found: ${src}`);
  }

  fs.cpSync(src, dest, {
    recursive: true,
    force: true,
    filter: shouldCopy,
  });
}

function copyDirectoryContents(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Source directory not found: ${src}`);
  }

  const entries = fs.readdirSync(src);
  for (const entry of entries) {
    const from = path.join(src, entry);
    if (!shouldCopy(from)) continue;
    const to = path.join(dest, entry);
    fs.cpSync(from, to, {
      recursive: true,
      force: true,
      filter: shouldCopy,
    });
  }
}

function syncAssets() {
  const mainSrc = path.join(root, 'apps', 'main', 'dist');
  const windowSrc = path.join(root, 'apps', 'window', 'dist');
  const backendSrc = path.join(root, 'apps', 'backend', 'public');
  const fastWindowSrc = path.join(root, 'apps', 'fast-window');

  const mainDest = path.join(releaseDir, 'main');
  const windowDest = path.join(releaseDir, 'window');
  const fastWindowDest = path.join(releaseDir, 'fast_window');

  resetDir(mainDest);
  resetDir(windowDest);
  resetDir(fastWindowDest);

  copyDirectory(mainSrc, mainDest);
  copyDirectory(windowSrc, windowDest);
  copyDirectory(fastWindowSrc, fastWindowDest);

  for (const preloadName of ['preload.js', 'window_preload.js', 'fast_window_preload.js']) {
    fs.rmSync(path.join(releaseDir, preloadName), { force: true });
  }
  fs.rmSync(path.join(releaseDir, 'runtime'), { recursive: true, force: true });
  copyDirectoryContents(backendSrc, releaseDir);

  for (const dir of [mainDest, windowDest, fastWindowDest]) {
    const gitkeep = path.join(dir, '.gitkeep');
    if (!fs.existsSync(gitkeep)) fs.writeFileSync(gitkeep, '');
  }
}

try {
  syncAssets();
  console.log('[sync-assets] Completed.');
} catch (error) {
  console.error(`[sync-assets] Failed: ${error.message}`);
  process.exit(1);
}
