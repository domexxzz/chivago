/**
 * Flatten exported asset paths so a static host will serve them.
 *
 * Expo writes font assets to their source path, which under pnpm is
 * `assets/__node_modules/.pnpm/<pkg>/node_modules/<pkg>/Font.<hash>.ttf`.
 * Vercel refuses to serve any path containing a `node_modules` segment, so
 * every font 404s and the app hangs on its splash waiting for `useFonts`.
 *
 * The filenames already carry a content hash, so flattening them into one
 * directory cannot collide. Run after `expo export`, before deploying.
 */

import { readdirSync, statSync, renameSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const src = join(dist, 'assets', '__node_modules');
const dest = join(dist, 'assets', 'fonts');

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

let moved = 0;
try { statSync(src); } catch { console.log('nothing to flatten'); process.exit(0); }
mkdirSync(dest, { recursive: true });
for (const file of walk(src)) {
  renameSync(file, join(dest, basename(file)));
  moved += 1;
}
rmSync(src, { recursive: true, force: true });

// Rewrite every reference in the bundle and the shell to the flat path.
let rewritten = 0;
const texts = walk(dist).filter((f) => f.endsWith('.js') || f.endsWith('.html') || f.endsWith('.json'));
for (const file of texts) {
  const before = readFileSync(file, 'utf8');
  const after = before.replace(
    /assets\/__node_modules\/[^"'\)\s]*?\/([^/"'\)\s]+\.(?:ttf|otf|woff2?|png|jpg))/g,
    'assets/fonts/$1',
  );
  if (after !== before) { writeFileSync(file, after); rewritten += 1; }
}
console.log(`flattened ${moved} assets, rewrote ${rewritten} files`);
