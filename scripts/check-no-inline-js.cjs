const fs = require('fs');
const path = require('path');

const root = process.cwd();

const HTML_FILES = [
  'apps/main/index.html',
  'apps/main/launcher.html',
  'apps/window/index.html',
  'apps/fast-window/fast_input.html',
];

const INLINE_SCRIPT_RE = /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi;

let hasError = false;

for (const rel of HTML_FILES) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) continue;

  const content = fs.readFileSync(file, 'utf8');
  const matches = content.match(INLINE_SCRIPT_RE);

  if (matches && matches.length > 0) {
    hasError = true;
    console.error(`[check:no-inline-js] Inline <script> found in ${rel}`);
  }
}

if (hasError) process.exit(1);

console.log('[check:no-inline-js] OK');
