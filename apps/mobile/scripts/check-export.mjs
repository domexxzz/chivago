/**
 * Refuse to ship a website with no application in it.
 *
 *   node scripts/check-export.mjs dist-live
 *
 * WHY THIS EXISTS. On the night of the 15th a plain `expo export` was killed
 * mid-transform (`jest worker ... SIGTERM`) and **still exited 0**, leaving a
 * directory that looked deployable: an index.html, a favicon, the static
 * files from `public/` - and no bundle. Deployed, it is a site that loads,
 * looks almost right, and does nothing. The five checks below were a ritual
 * in handoff.md, performed by hand, on one of the two build paths. A ritual
 * nobody can forget is a script.
 *
 * On 17 November the demo path, which had no ritual at all, produced exactly
 * that directory again - 39 files, no `_expo/`, no `<script>`. It was caught
 * by eye. This file is so that the next one is caught by the build.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );

/** @returns {string[]} the reasons this export must not be deployed. */
export const checkExport = (out, { expect = 100 } = {}) => {
  const wrong = [];
  if (!existsSync(out)) return [`${out} does not exist`];
  const files = walk(out);

  // 1. The bundle itself.
  const js = join(out, '_expo', 'static', 'js', 'web');
  if (!existsSync(js) || readdirSync(js).filter((f) => f.endsWith('.js')).length === 0) {
    wrong.push('no bundle: _expo/static/js/web is missing or holds no .js');
  }

  // 2. The page that loads it. An export killed mid-transform keeps the
  //    index.html it wrote first, with the script tag never added.
  const indexPath = join(out, 'index.html');
  if (!existsSync(indexPath)) wrong.push('no index.html');
  else {
    const index = readFileSync(indexPath, 'utf8');
    if (!/<script[^>]+src=/.test(index)) wrong.push('index.html loads no script');
  }

  // 3. The count. Hundreds is normal; tens means the transforms died early.
  if (files.length < expect) {
    wrong.push(`only ${files.length} files, expected at least ${expect}`);
  }

  // 4. The address. Without EXPO_PUBLIC_API_URL the bundle calls the
  //    VISITOR'S OWN MACHINE. It fails as a page of empty states, never as an
  //    error, which is the worst way for anything to fail.
  const leaks = files.filter(
    (f) => /\.(js|html|json)$/.test(f) && readFileSync(f, 'utf8').includes('localhost:8787'),
  );
  // The demo is the exception: its own server answers that address in-process.
  if (leaks.length && process.env.EXPO_PUBLIC_DEMO !== '1') {
    wrong.push(`${leaks.length} file(s) still call localhost:8787`);
  }

  // 5. The headers. Cache rules AND the CORS rule the island cannot load
  //    without live here, not in wrangler.jsonc, where they are ignored.
  if (!existsSync(join(out, '_headers'))) wrong.push('no _headers');

  return wrong;
};

// Run as a command when given a directory; importable as checkExport either way.
if (process.argv[2]) {
  const out = process.argv[2];
  const wrong = checkExport(out, { expect: Number(process.env.CHIVAGO_EXPECT_FILES ?? 100) });
  if (wrong.length) {
    console.error(`\n[chivago] ${out} MUST NOT BE DEPLOYED:\n` + wrong.map((w) => `  - ${w}`).join('\n') + '\n');
    process.exit(1);
  }
  console.log(`[chivago] ${out} passes all five checks.`);
}
