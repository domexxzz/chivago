/**
 * Build the static demo: the web app with the snapshot server baked in.
 *
 *   pnpm --filter @chivago/mobile demo:web
 *
 * Then host `apps/mobile/dist-demo` anywhere static - it is what
 * chivago-demo.vercel.app serves. Nothing in it talks to a server;
 * `src/demo/server.ts` answers every fetch from `src/demo/fixtures.json`,
 * which `pnpm --filter @chivago/api demo:capture` refreshes from a running
 * API after `demo:reset`.
 *
 * A script rather than a package.json one-liner because the env has to be
 * set the same way on Windows, where this repository was born, and because
 * `--clear` is not optional: Metro caches transformed modules keyed on
 * source, not env, so a previous LIVE export would otherwise leave the demo
 * server out of a demo build - or, worse, the reverse.
 */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');
const out = process.argv[2] ?? 'dist-demo';

/*
  ONE WORKER, AND A BIG HEAP. Measured on 17 November: this bundle runs the
  machine out of memory at the two workers this repository had used all day
  ("Data cannot be cloned, out of memory"), and the demo build died the same
  way - a jest worker gone, the export stopping with a directory that still
  looked deployable. Both numbers are overridable for a machine with more to
  give, but the DEFAULT has to be the one that finishes.
*/
const workers = process.env.CHIVAGO_EXPORT_WORKERS ?? '1';

const env = {
  ...process.env,
  NODE_OPTIONS: process.env.NODE_OPTIONS ?? '--max-old-space-size=8192',
  EXPO_PUBLIC_DEMO: '1',
  // The demo server only intercepts requests aimed at this base, so the
  // client and the server must agree on it. Nothing ever listens here.
  EXPO_PUBLIC_API_URL: 'http://localhost:8787',
  CI: '1',
};

const run = (cmd, args) => {
  const res = spawnSync(cmd, args, { cwd: app, env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (res.status !== 0) process.exit(res.status ?? 1);
};

run('npx', ['expo', 'export', '--platform', 'web', '--output-dir', out, '--clear', '--max-workers', workers]);
run('node', [join(here, 'flatten-assets.mjs'), out]);
/*
  AND THEN LOOK AT WHAT WAS BUILT. An export that dies mid-transform has been
  seen to exit 0, and the five checks were until today a ritual in handoff.md
  performed by hand on the OTHER build path. See scripts/check-export.mjs.
*/
run('node', [join(here, 'check-export.mjs'), out]);
console.log(`\n[chivago] demo build in apps/mobile/${out}. Host it anywhere static.`);
