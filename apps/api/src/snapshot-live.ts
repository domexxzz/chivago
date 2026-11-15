/**
 * Take a snapshot of the LIVE database, from a laptop.
 *
 *   CHIVAGO_EXPORT_TOKEN=... node --experimental-strip-types src/snapshot-live.ts \
 *     --api https://chivargo.com --out "C:/Users/<you>/chivago-backups/2026-11-15"
 *
 *   CHIVAGO_EXPORT_TOKEN=... node --experimental-strip-types src/snapshot-live.ts \
 *     --api https://chivargo.com --check "C:/Users/<you>/chivago-backups/2026-11-15"
 *
 * WHAT IT IS FOR. `export-for-import.ts` reads a snapshot FILE, which is what
 * the Fly volume had. A Durable Object has no file: its SQLite is reachable
 * only from inside the object, so the rows have to come out over HTTP, one
 * page at a time, through `GET /admin/export`. This is the other end of that.
 *
 * WHAT IT PRODUCES is exactly what a restore consumes: numbered batch files in
 * send order plus a `manifest.json`, the same layout `export-for-import.ts`
 * writes, so the replay loop in `docs/71` works on either without a change.
 *
 * THE TOKEN COMES FROM THE ENVIRONMENT, never from an argument. `ps` shows
 * another user's command line, and a shell keeps its history; an environment
 * variable does neither. Nothing here prints it - only its length.
 *
 * WHAT IT WRITES IS PERSONAL DATA: 339 people, their wallets and a ledger. The
 * output directory belongs outside the repository, and this refuses to write
 * inside it without `--force` for exactly that reason.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { checkCounts, failures, type CountCheck } from './snapshot-check.ts';
import type { ImportBatch } from './import-service.ts';

const { values } = parseArgs({
  options: {
    api: { type: 'string' },
    out: { type: 'string' },
    check: { type: 'string' },
    rows: { type: 'string' },
    force: { type: 'boolean' },
  },
});

const USAGE = `usage: snapshot-live --api <https://host> --out <dir outside the repo> [--rows 500]
   or: snapshot-live --api <https://host> --check <dir>

CHIVAGO_EXPORT_TOKEN must be set in the environment (never passed as an argument).`;

const die = (message: string, code = 2): never => {
  console.error(message);
  process.exit(code);
};

const token = process.env.CHIVAGO_EXPORT_TOKEN ?? '';
if (token === '') die(`CHIVAGO_EXPORT_TOKEN is not set.\n\n${USAGE}`);
// Length only. The deployment refuses a short one too, and saying so here
// saves a round trip that would have answered 500.
if (token.length < 32) {
  die(`CHIVAGO_EXPORT_TOKEN is ${token.length} characters; the route refuses anything under 32.`);
}

const api = (values.api ?? process.env.CHIVAGO_API ?? '').replace(/\/+$/, '');
if (!/^https?:\/\//.test(api)) die(`--api must be a URL, not ${JSON.stringify(api)}\n\n${USAGE}`);
if (api.startsWith('http://') && !api.includes('localhost') && !api.includes('127.0.0.1')) {
  // The whole database, in the clear, over somebody's hotel wifi.
  die('--api is plain http against a remote host. Use https: this is the entire database.');
}

const pageRows = Number(values.rows ?? 500);
if (!Number.isInteger(pageRows) || pageRows < 1) die(`--rows must be a whole number, not ${values.rows}`);

/** The repository, so a backup full of personal data does not land in it. */
const repoRoot = resolve(import.meta.dirname, '../../..');

type Manifest = {
  takenAt: string;
  schemaVersion: number;
  tables: { table: string; rows: number }[];
  totalRows: number;
};

/**
 * One request, with the token in a header and the body left as text.
 *
 * Three attempts, because a page is a retry unit and a dropped connection
 * halfway through a 60-table backup should cost a second rather than the
 * whole run. A 4xx is NOT retried: it will say the same thing again.
 */
async function ask(path: string): Promise<{ status: number; text: string; headers: Headers }> {
  let last = '';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(`${api}${path}`, { headers: { 'x-export-token': token } });
      const text = await res.text();
      if (res.status >= 500 && attempt < 3) {
        last = `${res.status}`;
      } else {
        return { status: res.status, text, headers: res.headers };
      }
    } catch (err) {
      last = (err as Error).message;
      if (attempt === 3) break;
    }
    await new Promise((r) => setTimeout(r, attempt * 1000));
  }
  return die(`${path}: ${last} after 3 attempts`);
}

/** Say what a refusal means, in the words of the thing that refused. */
function explain(status: number, text: string): never {
  if (status === 404) {
    return die(
      'The deployment answered 404: it is not armed for export.\n'
      + '  wrangler secret put CHIVAGO_EXPORT_TOKEN      (then redeploy - a new secret needs one)',
    );
  }
  if (status === 403) return die('403: that token is not the one the deployment was armed with.');
  if (status === 401) {
    return die('401: the request reached the traveller middleware, which means the route is not armed.');
  }
  return die(`${status}: ${text.slice(0, 400)}`);
}

async function manifestNow(): Promise<Manifest> {
  const res = await ask('/admin/export');
  if (res.status !== 200) explain(res.status, res.text);
  const body = JSON.parse(res.text) as { ok: boolean; data: Manifest };
  if (!body?.ok) return die(`/admin/export answered something unexpected: ${res.text.slice(0, 200)}`);
  return body.data;
}

/** Row counts as a plain map, which is what a check compares. */
const countsOf = (m: Manifest): Record<string, number> =>
  Object.fromEntries(m.tables.map((t) => [t.table, t.rows]));

/** What a finished snapshot wrote beside its batches. */
type SavedManifest = {
  source: string;
  takenAt: string;
  schemaVersion: number;
  batches: { file: string; table: string; rows: number }[];
  live: { before: Record<string, number>; after: Record<string, number> };
};

function readSavedManifest(path: string): SavedManifest {
  try {
    const saved = JSON.parse(readFileSync(path, 'utf8')) as SavedManifest;
    // Without these there is nothing to check against, and saying so beats a
    // stack trace about a property of undefined.
    if (!Array.isArray(saved?.batches) || saved?.live?.before === undefined) {
      throw new Error('it is not a snapshot manifest (no batches, or no live counts)');
    }
    return saved;
  } catch (err) {
    return die(`cannot read ${path}: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------- checking

if (values.check !== undefined) {
  const dir = resolve(values.check);
  const manifestPath = join(dir, 'manifest.json');
  const saved = readSavedManifest(manifestPath);

  /*
    THE FILES ARE COUNTED, NOT TRUSTED. `manifest.json` says how many rows each
    batch holds; a truncated or half-written file agrees with nothing but
    itself, so every batch is parsed and its rows counted here. This is the
    half of the check that needs no network.
  */
  const inSnapshot: Record<string, number> = {};
  let fileProblems = 0;
  for (const entry of saved.batches) {
    const path = join(dir, entry.file);
    try {
      const batch = JSON.parse(readFileSync(path, 'utf8')) as ImportBatch;
      if (batch.table !== entry.table) throw new Error(`names ${batch.table}`);
      if (!Array.isArray(batch.values)) throw new Error('has no values');
      if (batch.values.length !== entry.rows) {
        throw new Error(`holds ${batch.values.length} row(s), not the ${entry.rows} recorded`);
      }
      const wrong = batch.values.find((r) => r.length !== batch.columns.length);
      if (wrong) throw new Error(`a row has ${wrong.length} of ${batch.columns.length} columns`);
      inSnapshot[entry.table] = (inSnapshot[entry.table] ?? 0) + batch.values.length;
    } catch (err) {
      console.error(`  BAD  ${entry.file}: ${(err as Error).message}`);
      fileProblems += 1;
    }
  }
  // A table listed in the manifest with no batch at all counts as zero rows,
  // which is what makes "the loop never ran for this table" visible below.
  for (const table of Object.keys(saved.live.before)) inSnapshot[table] ??= 0;

  const live = await manifestNow();
  const now = countsOf(live);
  const checks: CountCheck[] = Object.keys(saved.live.before).map((table) => ({
    table,
    inSnapshot: inSnapshot[table] ?? 0,
    before: saved.live.before[table] ?? 0,
    after: saved.live.after[table] ?? 0,
    liveNow: now[table],
  }));

  console.log(`\n[chivago] ${dir}`);
  console.log(`  taken ${saved.takenAt} from ${saved.source}, schema version ${saved.schemaVersion}`);
  if (live.schemaVersion !== saved.schemaVersion) {
    console.log(
      `  NOTE the live schema is now version ${live.schemaVersion}, not ${saved.schemaVersion}: `
      + 'a restore of this snapshot would be missing whatever changed.',
    );
  }
  console.log('\n  table                          in snapshot   when taken   live now');
  for (const c of checks) {
    if (c.inSnapshot === 0 && c.before === 0 && c.after === 0) continue;
    const when = c.before === c.after ? `${c.before}` : `${c.before}→${c.after}`;
    console.log(
      `  ${c.table.padEnd(30)} ${String(c.inSnapshot).padStart(11)}   ${when.padStart(10)}`
      + `   ${String(c.liveNow ?? '-').padStart(8)}`,
    );
  }

  const bad = failures(checkCounts(checks));
  console.log('');
  for (const f of bad) console.error(`  FAIL ${f.reason}`);
  if (bad.length === 0 && fileProblems === 0) {
    console.log('  Every table is consistent with what the live database held while it was read.');
    console.log('  "live now" drifting is expected: the pilot gains users and expires stories.');
    process.exit(0);
  }
  console.error(`\n  ${bad.length} table(s) and ${fileProblems} file(s) wrong. This snapshot is not sound.`);
  process.exit(1);
}

// --------------------------------------------------------------- snapshotting

const outDir = resolve(values.out ?? '');
if (values.out === undefined) die(USAGE);
if (outDir.startsWith(repoRoot) && values.force !== true) {
  die(
    `${outDir} is inside the repository, and this snapshot is 339 people's personal data.\n`
    + 'Write it somewhere else, or pass --force if you really mean it (batches/ and *.db are\n'
    + 'the only paths .gitignore already covers).',
  );
}

mkdirSync(outDir, { recursive: true });
const existing = readdirSync(outDir).filter((f) => /^\d{4}-.*\.json$/.test(f));
if (existing.length > 0 && values.force !== true) {
  die(
    `${outDir} already holds ${existing.length} batch file(s) from another snapshot.\n`
    + 'Two snapshots in one directory restore as one database that never existed. '
    + 'Use a new directory.',
  );
}

console.log(`[chivago] ${api}`);
console.log(`[chivago] token: ${token.length} characters`);

const before = await manifestNow();
console.log(
  `[chivago] ${before.tables.length} table(s), ${before.totalRows} row(s), `
  + `schema version ${before.schemaVersion}.`,
);

let fileNumber = 0;
let totalRows = 0;
const batches: { file: string; table: string; rows: number }[] = [];
const skipped: string[] = [];
const tooBig: string[] = [];

for (const { table, rows: expected } of before.tables) {
  if (expected === 0) {
    // Not an error and not worth a file: most of a pilot's schema is empty.
    skipped.push(table);
    continue;
  }

  let after: string | null = null;
  let rowsHere = 0;
  /*
    THE PAGE SIZE ADAPTS instead of being configured per table. A row of
    `wallets` is tens of bytes and a row of `stories` carries video in the
    row, so one number cannot be right for both - and a hand-written list of
    exceptions is a list that rots as tables are added. On a 413 the page
    halves and the same cursor is asked again; a failed page inserted nothing
    and cost nothing.
  */
  let rowsPerPage = pageRows;
  for (;;) {
    const query = new URLSearchParams({ table, rows: String(rowsPerPage) });
    if (after !== null) query.set('after', after);
    const res = await ask(`/admin/export/batch?${query}`);

    if (res.status === 413 && rowsPerPage > 1) {
      rowsPerPage = Math.max(1, Math.floor(rowsPerPage / 2));
      console.log(`  ${table}: a page was too large; trying ${rowsPerPage} row(s) at a time`);
      continue;
    }
    if (res.status === 413) {
      /*
        One row on its own is over the 16 MB a batch may be. It cannot be
        exported AND it could never have been imported either - the ceiling is
        the same on both halves - so this is a hole to report rather than
        paper over. A story may be 25 MB (`STORY_MAX_BYTES`) and base64 adds a
        third, so this is reachable with one long clip.
      */
      console.error(`  ${table}: a single row is over the batch ceiling. NOT COPIED.`);
      tooBig.push(table);
      break;
    }
    if (res.status !== 200) explain(res.status, res.text);

    const batch = JSON.parse(res.text) as ImportBatch;
    if (batch.values.length > 0) {
      fileNumber += 1;
      // Zero-padded and in send order, so `ls`, `sort` and a shell loop agree.
      const file = `${String(fileNumber).padStart(4, '0')}-${table}.json`;
      // The bytes exactly as they arrived: re-serialising would be a second
      // chance to change them.
      writeFileSync(join(outDir, file), res.text, 'utf8');
      batches.push({ file, table, rows: batch.values.length });
      rowsHere += batch.values.length;
      totalRows += batch.values.length;
    }

    after = res.headers.get('x-chivago-export-next');
    if (after === null) break;
  }
  console.log(`  ${table}: ${rowsHere} row(s)`);
}

/*
  The counts AFTER the read, from the live system, because the database did not
  hold still while it was read. Those two numbers are the bracket
  `snapshot-check.ts` judges the file against; writing them down now is what
  makes the snapshot checkable later, when the database has moved on again.
*/
const after = await manifestNow();

writeFileSync(
  join(outDir, 'manifest.json'),
  JSON.stringify({
    source: api,
    takenAt: before.takenAt,
    finishedAt: after.takenAt,
    schemaVersion: before.schemaVersion,
    totalRows,
    batches,
    skipped,
    tooBig,
    live: { before: countsOf(before), after: countsOf(after) },
  }, null, 2),
  'utf8',
);

const verdicts = checkCounts(before.tables.map(({ table }) => ({
  table,
  inSnapshot: batches.filter((b) => b.table === table).reduce((n, b) => n + b.rows, 0),
  before: countsOf(before)[table] ?? 0,
  after: countsOf(after)[table] ?? 0,
})));
const bad = failures(verdicts);

console.log(`\n[chivago] ${totalRows} row(s) in ${fileNumber} file(s) under ${outDir}`);
if (skipped.length > 0) console.log(`[chivago] ${skipped.length} empty table(s), no file written.`);
for (const f of bad) console.error(`[chivago] FAIL ${f.reason}`);
if (tooBig.length > 0) {
  console.error(`[chivago] NOT COPIED, row too large for a batch: ${tooBig.join(', ')}`);
}

console.log('\nCheck it again later, against the live counts:');
console.log(`  snapshot-live --api ${api} --check "${outDir}"`);
console.log('\nTo restore it into an EMPTY deployment, arm the import and send them in order:');
console.log('  for f in "' + outDir + '"/[0-9]*.json; do');
console.log('    curl -fsS -X POST "$API/admin/import" \\');
console.log('      -H "x-import-token: $CHIVAGO_IMPORT_TOKEN" \\');
console.log('      -H "content-type: application/json" \\');
console.log('      --data-binary "@$f" || { echo "FAILED on $f"; break; }');
console.log('  done');

if (bad.length > 0 || tooBig.length > 0) process.exit(1);
