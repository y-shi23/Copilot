const fs = require('fs');
const path = require('path');

const root = process.cwd();

const SOURCE_DIRS = [
  'apps/main/src',
  'apps/window/src',
  'apps/backend/src',
  'apps/fast-window/src',
  'electron-src',
  'shared',
];

const ALLOWLIST = new Set([
  // Intentionally empty: business/runtime source should be TS-only.
]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (entry.isFile() && full.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

const offenders = [];
for (const rel of SOURCE_DIRS) {
  const abs = path.join(root, rel);
  for (const file of walk(abs)) {
    const normalized = file.split(path.sep).join('/');
    if (!ALLOWLIST.has(normalized)) {
      offenders.push(normalized);
    }
  }
}

if (offenders.length > 0) {
  console.error('[check:no-js-source] Found JavaScript source files:');
  for (const file of offenders) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

console.log('[check:no-js-source] OK');
