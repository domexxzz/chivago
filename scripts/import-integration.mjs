/**
 * The migration, end to end, in the runtime it will run in.
 *
 *   node scripts/import-integration.mjs
 *
 * WHAT NOTHING ELSE PROVES. `import-service.test.ts` tests the round trip
 * under both drivers and `import-routes.test.ts` tests the route against Node,
 * but the two had never met in workerd. This starts a real Worker with a real
 * Durable Object, exports a seeded snapshot the way the runbook says to, sends
 * the batches over HTTP, and then READS THE DATA BACK through the ordinary
 * public API.
 *
 * It is worth the half-minute because the failure it guards against is the
 * expensive kind: an import that works everywhere except the place it has to
 * work, discovered with the Fly machine already turned off.
 *
 * It already earned its keep. The first run failed with a 409 - a `GET /places`
 * at the start had provisioned an anonymous account, `users` was no longer
 * empty, and the guard refused the whole import. That is exactly what a stray
 * request at cutover would have done, and it is why the guard now asks about
 * SUBSTANTIVE data instead.
 */

import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = join(ROOT, 'apps', 'api');
const PORT = Number(process.env.IMPORT_TEST_PORT ?? 8890);
const BASE = `http://127.0.0.1:${PORT}`;
// Long enough: the route refuses a token under 32 characters, because there
// is no throttle on it and the secret's length is the only thing in the way.
const TOKEN = 'import-integration-token-long-enough';

const fails = [];
const check = (name, cond, detail = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
  if (!cond) fails.push(name);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const work = mkdtempSync(join(tmpdir(), 'chivago-import-e2e-'));
const snap = join(work, 'snapshot.db');
const batches = join(work, 'batches');

/** A snapshot with a place in it, so the import can be read back through /places. */
const SEED = join(work, 'seed.ts');
writeFileSync(SEED, `
import { openDb } from ${JSON.stringify(`file:///${join(API, 'src', 'db-node.ts').replace(/\\/g, '/')}`)};
const db = openDb(process.env.CHIVAGO_DB);
db.prepare('INSERT INTO users (id, display_name, locale, created_at) VALUES (?,?,?,?)')
  .run('u-e2e', 'Nok', 'th', '2026-11-02T00:00:00Z');
db.prepare('INSERT INTO hosts (id,name,type) VALUES (?,?,?)')
  .run('h-e2e', 'Samui Municipality', 'municipality');
db.prepare(
  'INSERT INTO places (id,name_en,name_th,short,layer,lat,lng,meta,blurb_en,blurb_th,'
  + 'safety_label_en,safety_label_th,crowd_density,aqi,safety_index,walkability)'
  + ' VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
).run('p-e2e', 'Lamai Beach', '\\u0e2b\\u0e32\\u0e14\\u0e25\\u0e30\\u0e44\\u0e21', 'Beach', 'nature',
  9.47, 100.05, '{}', 'A beach.', '\\u0e0a\\u0e32\\u0e22\\u0e2b\\u0e32\\u0e14',
  'Safe', '\\u0e1b\\u0e25\\u0e2d\\u0e14\\u0e20\\u0e31\\u0e22', 0.3, 18, 0.9, 0.7);
console.log('seeded');
`, 'utf8');

// `wrangler.jsonc` serves the web export from apps/mobile/dist-live, a build
// output that is gitignored - so a plain checkout (CI, or a laptop that has not
// run `expo export`) does not have it, and `wrangler dev` refuses to start
// against a missing assets directory. This test is about the import API, not
// the web app, so an empty directory is enough: somewhere for Workers Assets
// to point, with nothing to serve.
const ASSETS_DIR = join(API, '..', 'mobile', 'dist-live');
if (!existsSync(ASSETS_DIR)) mkdirSync(ASSETS_DIR, { recursive: true });

writeFileSync(join(API, '.dev.vars'), `CHIVAGO_IMPORT_TOKEN=${TOKEN}\n`, 'utf8');

const wrangler = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  /*
    `--persist-to` a throwaway directory, so the Durable Object is EMPTY every
    run. Without it wrangler reuses `.wrangler/state` and the second run finds
    a database that has already been imported into - which the guard correctly
    refuses, making the test fail for a reason that is entirely its own. (That
    is how this line came to be written.)
  */
  ['wrangler', 'dev', '--port', String(PORT), '--local', '--persist-to', join(work, 'state')],
  { cwd: API, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' },
);
// `kill()` does not reliably take down the npx -> wrangler -> workerd tree on
// Windows, and without this the script hangs after its checks.
wrangler.unref();
let log = '';
wrangler.stdout.on('data', (c) => { log += c.toString('utf8'); });
wrangler.stderr.on('data', (c) => { log += c.toString('utf8'); });

async function waitForReady(timeoutMs = 120_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await sleep(1_000);
  }
  return false;
}

/*
  The backstop. `waitForReady` has a deadline; every request after it did not,
  and the sibling script (`alarm-integration.mjs`) proved on 13 November what
  that costs: wrangler came up, one request was never answered, the script sat
  inside `try` past the runner's twenty minutes, and the job was cut with no
  reason given and orphan `workerd` left behind.

  This one moves a database, so ten minutes rather than the alarm script's
  five - but it is still a point past which waiting is not going to help.
  `unref`ed, so a healthy run is never held open by it.
*/
const watchdog = setTimeout(() => {
  console.error(
    `\n[import] no result after 10 minutes - giving up rather than holding the job open.\n`
    + `wrangler's output:\n${log.slice(-2_000)}`,
  );
  wrangler.kill();
  process.exit(1);
}, 10 * 60_000);
watchdog.unref();

try {
  if (!(await waitForReady())) {
    console.error(`wrangler dev never answered on ${BASE}. Its output:\n${log.slice(-2_000)}`);
    process.exit(1);
  }
  console.log('[import] wrangler dev is up\n');

  execFileSync(process.execPath, ['--experimental-strip-types', SEED],
    { cwd: API, env: { ...process.env, CHIVAGO_DB: snap }, stdio: 'ignore' });
  execFileSync(process.execPath,
    ['--experimental-strip-types', 'src/export-for-import.ts', '--db', snap, '--out', batches],
    { cwd: API, stdio: 'ignore' });

  const files = readdirSync(batches).filter((f) => /^\d/.test(f)).sort();
  check('the exporter produced batches', files.length > 0, files.join(', '));

  const places = async () => (await (await fetch(`${BASE}/places`)).json()).data;

  /*
    THE DATABASE IS NO LONGER EMPTY WHEN IT STARTS, and this test used to
    require that it was.

    `CHIVAGO_BOOTSTRAP_KOH_SICHANG=1` went into `apps/api/wrangler.jsonc` on
    17 November so the island's landmarks exist in production, and
    `wrangler dev` reads that same file - so a fresh Durable Object now comes
    up with those landmarks already in it. This check went red on main the
    moment that merged, and it was right to: it said something true that had
    stopped being true.

    What this script is actually for is whether an EXPORT LANDS AND IS SERVED.
    That does not need an empty database, only a known one, so the baseline is
    measured rather than assumed and the imported row is found by being new.
  */
  const before = await places();
  const beforeIds = new Set(before.map((p) => p.id));
  check('the Durable Object starts with only what the deployment seeds',
    before.every((p) => p.id.startsWith('sc-')),
    `${before.length} place(s): ${before.map((p) => p.id).join(', ') || 'none'}`);

  let inserted = 0;
  for (const f of files) {
    const res = await fetch(`${BASE}/admin/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-import-token': TOKEN },
      body: readFileSync(join(batches, f), 'utf8'),
    });
    if (res.status !== 200) {
      check(`batch ${f}`, false, `${res.status} ${(await res.text()).slice(0, 200)}`);
      break;
    }
    inserted += (await res.json()).data.inserted;
  }
  check('every batch was accepted', fails.length === 0, `${inserted} row(s)`);

  /*
    Read back through the PUBLIC api, not by querying storage. That is the
    whole point: the rows have to be usable by the app, not merely present.
  */
  const after = await places();
  /* Found by being new, rather than by being the only one there. */
  const fresh = after.filter((p) => !beforeIds.has(p.id));
  check('the place is served by the API', fresh.length === 1,
    `${fresh.length} new of ${after.length} total`);
  const place = fresh[0];
  if (place) {
    // The DTO is `name: { en, th }`; an earlier version of this script looked
    // for `nameTh` and reported a failure that was its own.
    check('its Thai name survived', place.name?.th === 'หาดละไม',
      JSON.stringify(place.name));
    check('its coordinates survived', Math.abs(place.lat - 9.47) < 1e-9, String(place.lat));
  }

  check('the run can be closed',
    (await fetch(`${BASE}/admin/import/finish`, {
      method: 'POST', headers: { 'x-import-token': TOKEN },
    })).status === 200);

  const send = (token) => fetch(`${BASE}/admin/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { 'x-import-token': token } : {}) },
    body: JSON.stringify({ table: 'users', columns: ['id'], values: [['nope']] }),
  });

  check('a second import, after the run was closed, is refused',
    (await send(TOKEN)).status === 409);
  check('a request with no token is refused', (await send()).status === 403);
} catch (e) {
  check('the run completed', false, String(e.message).slice(0, 300));
} finally {
  clearTimeout(watchdog);
  wrangler.kill();
  rmSync(join(API, '.dev.vars'), { force: true });
  await sleep(1_000);
  /*
    Windows holds the Durable Object's SQLite files open until workerd is
    really gone, and `force` does not cover EPERM - so a cleanup failure threw
    out of the `finally` and made a run where every check passed exit 1. The
    temp directory is the OS's problem; the checks are this script's.
  */
  try {
    rmSync(work, { recursive: true, force: true });
  } catch {
    console.log(`[import] left ${work} for the OS to clean up`);
  }
}

if (fails.length > 0) {
  console.error(`\n[import] ${fails.length} failed: ${fails.join('; ')}`);
  process.exit(1);
}
console.log('\n[import] the whole chain works: export -> HTTP -> Durable Object -> GET /places');
process.exit(0);
