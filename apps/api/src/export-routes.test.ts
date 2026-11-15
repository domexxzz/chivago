/**
 * The export route, including the locks.
 *
 * The app is imported, not spawned — `server-node.ts` only listens when it is
 * the process, so `app.request()` drives the real chain, middleware included.
 * Its OWN database in a temp directory, set before that import.
 *
 * `export-service.test.ts` proves what the paging does to a database, under
 * both drivers. This proves the part that is only true over HTTP: that the
 * door is shut unless somebody arms it, that an unarmed deployment does not
 * admit the route is there, and that a page arrives as a batch rather than
 * wrapped in the envelope every other route uses.
 */

import { strict as assert } from 'node:assert';
import { test, describe, before, after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'chivago-export-'));
process.env.CHIVAGO_DB = join(dir, 'export.db');

// A type-only import is erased, so it may be static while the modules
// themselves must wait for CHIVAGO_DB above.
import type { ImportBatch } from './import-service.ts';

const { app, db } = await import('./server-node.ts');
const { importBatch } = await import('./import-service.ts');
const { openTestDb } = await import('./db-node.ts');

// At least 32 characters: the route refuses a shorter one, because there is no
// throttle here and this one answers with people's personal data.
const TOKEN = 'export-token-for-the-test-which-is-long-enough';
const AT = '2026-11-02T00:00:00Z';

const arm = () => { process.env.CHIVAGO_EXPORT_TOKEN = TOKEN; };
const disarm = () => { delete process.env.CHIVAGO_EXPORT_TOKEN; };

before(() => {
  db.prepare('INSERT INTO hosts (id, name, type) VALUES (?,?,?)')
    .run('h1', 'Samui Municipality', 'municipality');
  for (let i = 1; i <= 5; i += 1) {
    db.prepare('INSERT INTO users (id, display_name, locale, created_at) VALUES (?,?,?,?)')
      .run(`u${i}`, `ผู้ใช้ ${i}`, 'th', AT);
    db.prepare('INSERT INTO wallets (user_id, trip_points, green_points, exp) VALUES (?,?,?,?)')
      .run(`u${i}`, i * 10, i * 20, i * 30);
  }
});

after(() => {
  disarm();
  delete process.env.CHIVAGO_DB;
  // Windows keeps the SQLite file open while the handle lives, and the app's
  // handle outlives this file. Left to the OS rather than failing the run.
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* the OS will */ }
});

const get = (path: string, token?: string) =>
  app.request(path, {
    method: 'GET',
    headers: token === undefined ? {} : { 'x-export-token': token },
  });

/*
  Counted, never assumed.

  The unarmed tests above FALL THROUGH to the ordinary pipeline, and on an
  empty `device_keys` that pipeline provisions an anonymous traveller and
  hands it a wallet - the same behaviour `import-routes.test.ts` documents. So
  this database legitimately holds a row or two nobody inserted here, and a
  hard-coded 5 would be a test that fails for a reason that is not a bug.
*/
const countOf = (table: string): number =>
  (db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as unknown as { n: number }).n;
const countUsers = (): number => countOf('users');

describe('the door is shut unless somebody opens it', () => {
  before(disarm);

  test('with no token configured the route is indistinguishable from a path that does not exist', async () => {
    /*
      The rule, stated as the comparison rather than as a number: an unarmed
      deployment must not admit the door is there. Both of these fall THROUGH
      to the ordinary pipeline, so whatever an unknown path answers - a 404
      here, the device middleware's 401 on a deployment with phones registered
      on it - the export answers the same thing.
    */
    const unarmed = await get('/admin/export', TOKEN);
    const nonsense = await get('/admin/not-a-route-at-all', TOKEN);
    assert.equal(unarmed.status, nonsense.status);
    assert.equal(unarmed.status, 404);
  });

  test('the batch route is just as invisible', async () => {
    const unarmed = await get('/admin/export/batch?table=users', TOKEN);
    assert.equal(unarmed.status, 404);
  });

  test('and no page of data comes back on the way', async () => {
    const res = await get('/admin/export/batch?table=users', TOKEN);
    assert.ok(!(await res.text()).includes('ผู้ใช้'), 'no rows leaked through the fall-through');
  });
});

describe('armed, but the caller has to prove it', () => {
  before(arm);

  test('no token is refused', async () => {
    assert.equal((await get('/admin/export')).status, 403);
  });

  test('the wrong token is refused', async () => {
    assert.equal((await get('/admin/export', 'not-the-token')).status, 403);
  });

  test('a token that is a prefix of the real one is refused', async () => {
    // The compare is constant-time and length-checked; this is the shape a
    // naive `startsWith` would have let through.
    assert.equal((await get('/admin/export', TOKEN.slice(0, -1))).status, 403);
  });

  test('the refusal does not quote the token back', async () => {
    // Handoff section 2: never print a token value, anywhere.
    const body = await (await get('/admin/export', 'wrong')).text();
    assert.ok(!body.includes(TOKEN), 'the real token must not appear in a response');
    assert.ok(!body.includes('wrong'), 'nor the offered one');
  });
});

describe('a token too short to be a secret is refused outright', () => {
  after(arm);

  test('under 32 characters, the route will not export at all', async () => {
    // Refused at use rather than at arm time: `wrangler secret put` is where
    // it is set and nothing here sees that.
    process.env.CHIVAGO_EXPORT_TOKEN = 'short';
    const res = await get('/admin/export', 'short');
    assert.equal(res.status, 500);
    assert.equal((await res.json() as { code: string }).code, 'WEAK_EXPORT_TOKEN');
  });
});

describe('the manifest', () => {
  before(arm);

  test('says what is here, counted now, parents first', async () => {
    const res = await get('/admin/export', TOKEN);
    assert.equal(res.status, 200);
    const { data } = await res.json() as {
      data: { tables: { table: string; rows: number }[]; totalRows: number; schemaVersion: number };
    };
    const users = data.tables.find((t) => t.table === 'users');
    assert.equal(users?.rows, countUsers());
    assert.ok((users?.rows ?? 0) >= 5, 'the five seeded travellers are in the count');
    assert.equal(data.tables.find((t) => t.table === 'wallets')?.rows, countOf('wallets'));
    const order = data.tables.map((t) => t.table);
    assert.ok(order.indexOf('users') < order.indexOf('wallets'));
    assert.ok(!order.includes('import_runs'), 'not a table a restore may write');
    assert.ok(data.schemaVersion >= 1, 'which schema these rows came out of');
    assert.equal(data.totalRows, data.tables.reduce((n, t) => n + t.rows, 0));
  });

  test('is not cached, not indexed and not sniffed', async () => {
    // It is a row count per table of a live pilot: how many people, how many
    // ledger entries. Not something to leave in a proxy.
    const res = await get('/admin/export', TOKEN);
    assert.match(res.headers.get('cache-control') ?? '', /no-store/);
    assert.match(res.headers.get('x-robots-tag') ?? '', /noindex/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });
});

describe('a page comes back as a batch, not as an envelope', () => {
  before(arm);

  test('the body is exactly what POST /admin/import accepts', async () => {
    /*
      THE POINT OF THE WHOLE SHAPE. The file on the laptop has to be the batch
      - no `{ ok, data }` to unwrap, no field to rename - so a restore is the
      loop already written in docs/71 and there is no translation step to be
      wrong. Proved by handing these bytes, straight off the wire, to the
      importer against an empty database.
    */
    const res = await get('/admin/export/batch?table=users&rows=2', TOKEN);
    assert.equal(res.status, 200);
    const body = await res.json() as ImportBatch & { ok?: unknown; data?: unknown };
    assert.equal(body.ok, undefined, 'no success envelope');
    assert.equal(body.data, undefined);
    assert.equal(body.table, 'users');
    assert.ok(Array.isArray(body.columns) && Array.isArray(body.values));

    const fresh = openTestDb();
    assert.equal(importBatch(fresh, body), 2, 'the importer took it as it stood');
  });

  test('the cursor travels in a header, and the last page carries none', async () => {
    const first = await get('/admin/export/batch?table=users&rows=2', TOKEN);
    assert.equal(first.headers.get('x-chivago-export-rows'), '2');
    const cursor = first.headers.get('x-chivago-export-next');
    assert.ok(cursor !== null, 'a full page says where to carry on');

    const last = await get(`/admin/export/batch?table=users&rows=50&after=${cursor}`, TOKEN);
    assert.equal(last.headers.get('x-chivago-export-next'), null, 'a short page is the last one');
  });

  test('following the cursor collects every row exactly once', async () => {
    const seen: string[] = [];
    let url = '/admin/export/batch?table=users&rows=2';
    for (let request = 0; request < 20; request += 1) {
      const res = await get(url, TOKEN);
      assert.equal(res.status, 200);
      const batch = await res.json() as ImportBatch;
      for (const r of batch.values) seen.push(String(r[0]));
      const next = res.headers.get('x-chivago-export-next');
      if (next === null) break;
      url = `/admin/export/batch?table=users&rows=2&after=${next}`;
    }
    assert.equal(seen.length, countUsers());
    assert.equal(new Set(seen).size, seen.length, 'no row came twice');
    assert.ok(seen.includes('u1') && seen.includes('u5'));
  });

  test('a page of personal data is not cached either', async () => {
    const res = await get('/admin/export/batch?table=users', TOKEN);
    assert.match(res.headers.get('cache-control') ?? '', /no-store/);
  });
});

describe('a request has to make sense', () => {
  before(arm);

  test('no table named is refused rather than guessed', async () => {
    const res = await get('/admin/export/batch', TOKEN);
    assert.equal(res.status, 400);
    assert.equal((await res.json() as { code: string }).code, 'BAD_EXPORT_REQUEST');
  });

  test('a table that does not exist is refused, by name', async () => {
    const res = await get('/admin/export/batch?table=nope', TOKEN);
    assert.equal(res.status, 400);
    assert.match((await res.json() as { error: string }).error, /nope is not a table/);
  });

  test('a table a restore may not write is refused, although it is real', async () => {
    for (const table of ['import_runs', 'sqlite_master']) {
      const res = await get(`/admin/export/batch?table=${table}`, TOKEN);
      assert.equal(res.status, 400, `${table} should not be exportable`);
    }
  });

  test('SQL in a table name is refused, and the table is still there', async () => {
    const before = countUsers();
    const res = await get(
      `/admin/export/batch?table=${encodeURIComponent('users"; DROP TABLE users; --')}`,
      TOKEN,
    );
    assert.equal(res.status, 400);
    assert.equal(countUsers(), before, 'users is still there to be dropped another day');
  });

  test('a page size the importer would refuse is refused here', async () => {
    const res = await get('/admin/export/batch?table=users&rows=50000', TOKEN);
    assert.equal(res.status, 400);
    assert.match((await res.json() as { error: string }).error, /at most/);
  });

  test('a page size that is not a number is refused, not silently defaulted', async () => {
    // `rows=5oo` quietly becoming 500 is how a backup gets a hole in it.
    const res = await get('/admin/export/batch?table=users&rows=5oo', TOKEN);
    assert.equal(res.status, 400);
  });

  test('a cursor that is not a number is refused', async () => {
    assert.equal((await get('/admin/export/batch?table=users&after=abc', TOKEN)).status, 400);
  });
});

describe('reading does not change anything', () => {
  before(arm);

  test('a whole export leaves the row counts and the import runs alone', async () => {
    const before = countUsers();
    const manifest = await (await get('/admin/export', TOKEN)).json() as {
      data: { tables: { table: string; rows: number }[] };
    };
    for (const { table, rows } of manifest.data.tables) {
      if (rows === 0) continue;
      const res = await get(`/admin/export/batch?table=${table}&rows=500`, TOKEN);
      assert.equal(res.status, 200, `${table}: ${res.status}`);
    }
    assert.equal(countUsers(), before, 'nothing was provisioned by exporting');
    const runs = db.prepare('SELECT COUNT(*) AS n FROM import_runs').get() as unknown as { n: number };
    assert.equal(runs.n, 0, 'the export keeps no state of its own');
  });
});

describe('closing the door', () => {
  test('unsetting the token is what shuts it, with no deploy', async () => {
    disarm();
    assert.equal((await get('/admin/export', TOKEN)).status, 404);
    assert.equal((await get('/admin/export/batch?table=users', TOKEN)).status, 404);
  });
});
