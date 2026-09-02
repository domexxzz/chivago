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

const env = {
  ...process.env,
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

run('npx', ['expo', 'export', '--platform', 'web', '--output-dir', out, '--clear']);
run('node', [join(here, 'flatten-assets.mjs'), out]);
console.log(`\n[chivago] demo build in apps/mobile/${out}. Host it anywhere static.`);
