/**
 * `wrangler deploy` must refuse a web build that check-export.mjs refuses.
 *
 * On 19 November a bundle exported by hand, without
 * EXPO_PUBLIC_API_URL=same-origin, went to chivargo.com through a plain
 * `wrangler deploy`. Every request the site made went to the visitor's own
 * localhost:8787 for six and a half hours. check-export.mjs would have refused
 * that bundle, but only `export:live` ran it, and the deploy did not go
 * through `export:live`. Now wrangler itself runs the check as its build
 * step, so no deploy can skip it.
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const guard = join(root, 'scripts', 'deploy-guard.mjs');
const work = mkdtempSync(join(tmpdir(), 'deploy-guard-'));
after(() => rmSync(work, { recursive: true, force: true }));

/** A web export with everything check-export.mjs looks for, calling `api`. */
function exportCalling(name, api) {
  const out = join(work, name);
  mkdirSync(join(out, '_expo', 'static', 'js', 'web'), { recursive: true });
  writeFileSync(join(out, '_expo', 'static', 'js', 'web', 'index-abc.js'), `const API_BASE = "${api}";`);
  writeFileSync(join(out, 'index.html'), '<html><script src="/_expo/static/js/web/index-abc.js" defer></script></html>');
  writeFileSync(join(out, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n');
  return out;
}

const runGuard = (dir, wranglerCommand) => {
  const env = { ...process.env, CHIVAGO_EXPECT_FILES: '1' };
  delete env.WRANGLER_COMMAND;
  if (wranglerCommand !== undefined) env.WRANGLER_COMMAND = wranglerCommand;
  return spawnSync(process.execPath, [guard, dir], { env, encoding: 'utf8' });
};

const leaky = exportCalling('leaky', 'http://localhost:8787');
const sound = exportCalling('sound', '');

describe('deploy guard', () => {
  it('refuses to deploy a bundle that calls localhost', () => {
    const res = runGuard(leaky, 'deploy');
    assert.equal(res.status, 1, res.stdout + res.stderr);
    assert.match(res.stderr, /localhost:8787/);
  });

  it('refuses a version upload of the same bundle', () => {
    assert.equal(runGuard(leaky, 'versions upload').status, 1);
  });

  it('refuses when wrangler does not say what it is doing', () => {
    assert.equal(runGuard(leaky, undefined).status, 1);
  });

  it('lets a sound bundle deploy', () => {
    const res = runGuard(sound, 'deploy');
    assert.equal(res.status, 0, res.stdout + res.stderr);
  });

  it('stays out of wrangler dev, which CI runs against an empty directory', () => {
    const empty = join(work, 'empty');
    mkdirSync(empty, { recursive: true });
    assert.equal(runGuard(empty, 'dev').status, 0);
    assert.equal(runGuard(leaky, 'dev').status, 0);
  });

  it('is the build step of the production wrangler config, pointed at its assets', () => {
    const config = readFileSync(join(root, 'apps', 'api', 'wrangler.jsonc'), 'utf8');
    const assets = /"directory"\s*:\s*"([^"]+)"/.exec(config)?.[1];
    assert.equal(assets, '../mobile/dist-live');
    const command = /"build"\s*:\s*\{\s*"command"\s*:\s*"([^"]+)"/.exec(config)?.[1];
    assert.equal(command, `node ../../scripts/deploy-guard.mjs ${assets}`);
  });
});
