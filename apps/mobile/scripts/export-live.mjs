/**
 * Build the live web app: the one Workers Assets serves at chivargo.com.
 *
 *   pnpm --filter @chivago/mobile export:live
 *
 * THE SIBLING OF `export-demo.mjs`, AND THE REASON THIS FILE EXISTS. The demo
 * path was a script and the live path was six lines pasted into
 * `.github/workflows/deploy-worker.yml`. The two drifted, as a copy and an
 * original do: `flatten-assets.mjs` moved into this directory on 1 September
 * and the workflow kept calling `../../scripts/flatten-assets.mjs`, a path
 * that has not existed since. Nobody found out, because that workflow has
 * never been run - every deploy has gone through wrangler on somebody's
 * machine, with the steps typed from memory.
 *
 * So the live build is a script for the same reason the demo build is: a
 * ritual nobody can forget is a script. The workflow now calls this, and
 * `scripts/workflow-paths.test.mjs` fails if a workflow ever again names a
 * file that is not there.
 */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');
const out = process.argv[2] ?? 'dist-live';

/*
  ONE WORKER AND A BIG HEAP, for the reason written out in export-demo.mjs:
  measured on 17 November, two workers run this machine out of memory and the
  export stops with a directory that still looks deployable. Both numbers are
  overridable for a machine with more to give.
*/
const workers = process.env.CHIVAGO_EXPORT_WORKERS ?? '1';

const env = {
  ...process.env,
  NODE_OPTIONS: process.env.NODE_OPTIONS ?? '--max-old-space-size=8192',
  /*
    SAME-ORIGIN, so there is no hostname baked in to go stale: the app talks
    to whatever host served it. Check 4 in check-export.mjs refuses a build
    that still names localhost, because that failure arrives as a page of
    empty states rather than an error.
  */
  EXPO_PUBLIC_API_URL: 'same-origin',
  CI: '1',
};

const run = (cmd, args) => {
  const res = spawnSync(cmd, args, { cwd: app, env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (res.status !== 0) process.exit(res.status ?? 1);
};

/*
  `--clear` IS NOT OPTIONAL, and it matters more here than it does for the
  demo. Metro keys its transform cache on source, not on env, so a demo export
  left in the cache would otherwise put the demo's in-process fake server into
  a LIVE build - a production site answering its own fetches from a snapshot.
*/
run('node', [join(here, '../../../scripts/build-promo.mjs')]);
run('npx', ['expo', 'export', '--platform', 'web', '--output-dir', out, '--clear', '--max-workers', workers]);
run('node', [join(here, 'flatten-assets.mjs'), out]);
run('node', [join(here, 'check-export.mjs'), out]);
console.log(`\n[chivago] live build in apps/mobile/${out}. This is what wrangler deploys.`);
