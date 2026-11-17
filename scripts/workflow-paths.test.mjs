/**
 * Every file and script a workflow names must exist.
 *
 * WHY. `deploy-worker.yml` called `node ../../scripts/flatten-assets.mjs` from
 * apps/mobile. That script moved into apps/mobile/scripts on 1 September and
 * the workflow was never updated, so the only committed way to deploy this
 * project would have died on its first run. It was never pressed, so the
 * mistake sat in main for eleven weeks: a deploy button that could not work,
 * and nothing anywhere saying so.
 *
 * A path in a workflow is code that nothing type-checks, nothing imports and
 * no test runs. The only thing that notices a dead one is the deploy, at the
 * worst moment. These two checks are cheap and they run on every push.
 *
 * WHAT THIS CANNOT DO. It reads `run:` blocks with regular expressions, not a
 * YAML parser, and it follows `cd` one directory at a time. It will not catch
 * a path built from a variable, a tool invoked through a shell alias, or a
 * binary that is missing from a package's dependencies - that last one is how
 * `demo:deploy` came to call a `wrangler` that was not installed. It catches
 * the plain case, which is the case that broke.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, '.github', 'workflows');

const workflows = readdirSync(dir)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  .map((f) => ({ name: f, text: readFileSync(join(dir, f), 'utf8') }));

/** Every `node <path>` in the file, with the directory it runs in. */
const nodeCalls = (text) => {
  const found = [];
  let cwd = '.';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^-\s|^\w+:/.test(line)) cwd = '.'; // a new step starts back at the root
    const dirStep = line.match(/^working-directory:\s*(\S+)/);
    if (dirStep) cwd = dirStep[1];
    const cd = line.match(/^cd\s+(\S+)/);
    if (cd) cwd = cwd === '.' ? cd[1] : join(cwd, cd[1]);
    const call = line.match(/\bnode\s+(?:--\S+\s+)*([^\s'"]+\.(?:mjs|js|cjs|ts))/);
    if (call) found.push({ cwd, path: call[1] });
  }
  return found;
};

/** Every `pnpm --filter <package> <script>` in the file. */
const pnpmCalls = (text) =>
  [...text.matchAll(/pnpm\s+--filter\s+(\S+)\s+(?!exec\b|run\b-)([A-Za-z][\w:-]*)/g)]
    .map((m) => ({ pkg: m[1], script: m[2] }));

const packages = new Map();
for (const area of ['apps', 'packages']) {
  const base = join(root, area);
  if (!existsSync(base)) continue;
  for (const name of readdirSync(base)) {
    const file = join(base, name, 'package.json');
    if (existsSync(file)) {
      const json = JSON.parse(readFileSync(file, 'utf8'));
      packages.set(json.name, json);
    }
  }
}

test('every script a workflow runs with node is actually there', () => {
  const dead = [];
  for (const { name, text } of workflows) {
    for (const { cwd, path } of nodeCalls(text)) {
      if (!existsSync(resolve(root, cwd, path))) dead.push(name + ': node ' + path + '  (from ' + cwd + ')');
    }
  }
  assert.deepEqual(dead, [], 'a workflow names a file that does not exist:\n  ' + dead.join('\n  '));
});

test('every package script a workflow calls is defined in that package', () => {
  const missing = [];
  for (const { name, text } of workflows) {
    for (const { pkg, script } of pnpmCalls(text)) {
      const json = packages.get(pkg);
      if (!json) { missing.push(name + ': no package named ' + pkg); continue; }
      if (!json.scripts?.[script]) missing.push(name + ': ' + pkg + ' has no script "' + script + '"');
    }
  }
  assert.deepEqual(missing, [], 'a workflow calls a script that is not defined:\n  ' + missing.join('\n  '));
});
