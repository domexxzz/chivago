/**
 * The import route, including the locks.
 *
 * The app is imported, not spawned — `server-node.ts` only listens when it is
 * the process. Its OWN database, set before that import so it opens an empty
 * one: the route refuses a database with users in it, so an empty one is the
 * only way to test the path that works.
 */

import { strict as assert } from 'node:assert';
import { test, describe, before, after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'chivago-import-'));
process.env.CHIVAGO_DB = join(dir, 'import.db');

const { app, db } = await import('./server-node.ts');
const { exportTable, tablesInDependencyOrder } = await import('./import-service.ts');
const { openTestDb } = await import('./db-node.ts');

const TOKEN = 'import-token-for-the-test';
const AT = '2026-11-02T00:00:00Z';

const arm = () => { process.env.CHIVAGO_IMPORT_TOKEN = TOKEN; };
const disarm = () => { delete process.env.CHIVAGO_IMPORT_TOKEN; };

after(() => {
  disarm();
  delete process.env.CHIVAGO_DB;
  // Windows keeps the SQLite file open while the handle lives, and the app's
  // handle outlives this file. `force` does not cover EPERM, so the temp
  // directory is left to the OS rather than failing the run over it.
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* the OS will */ }
});

const post = (body: unknown, token?: string) =>
  app.request('/admin/import', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token === undefined ? {} : { 'x-import-token': token }),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const aUser = {
  table: 'users',
  columns: ['id', 'display_name', 'locale', 'created_at'],
  values: [['u1', 'Nok', 'th', AT]],
};

describe('the door is shut unless somebody opens it', () => {
  before(disarm);

  test('with no token configured the route does not exist', async () => {
    /*
      404 and not 403: an unarmed deployment should not admit the door is
      there. It is also what makes "remove it afterwards" something somebody
      will actually do - unsetting a secret is easier than a deploy.
    */
    const res = await post(aUser, TOKEN);
    assert.equal(res.status, 404);
  });

  test('and not even to a request with no token at all', async () => {
    assert.equal((await post(aUser)).status, 404);
  });
});

describe('armed, but the caller has to prove it', () => {
  before(arm);

  test('no token is refused', async () => {
    assert.equal((await post(aUser)).status, 403);
  });

  test('the wrong token is refused', async () => {
    assert.equal((await post(aUser, 'not-the-token')).status, 403);
  });

  test('a token that is a prefix of the real one is refused', async () => {
    // The compare is constant-time and length-checked; this is the shape that
    // a naive `startsWith` would have let through.
    assert.equal((await post(aUser, TOKEN.slice(0, -1))).status, 403);
  });
});

describe('a batch has to make sense', () => {
  before(arm);

  test('a body that is not JSON is a 400, not a 500', async () => {
    const res = await post('{not json', TOKEN);
    assert.equal(res.status, 400);
    assert.equal((await res.json() as { code: string }).code, 'BAD_BATCH');
  });

  test('a body missing its parts is refused', async () => {
    assert.equal((await post({ table: 'users' }, TOKEN)).status, 400);
  });

  test('a table that does not exist is refused, by name', async () => {
    const res = await post({ table: 'nope', columns: ['a'], values: [['x']] }, TOKEN);
    assert.equal(res.status, 400);
    assert.match((await res.json() as { error: string }).error, /No such table: nope/);
  });

  test('SQL in a table name is refused', async () => {
    const res = await post(
      { table: 'users"; DROP TABLE users; --', columns: ['id'], values: [['x']] },
      TOKEN,
    );
    assert.equal(res.status, 400);
    // And the table is still there to be dropped another day.
    assert.ok(db.prepare('SELECT COUNT(*) AS n FROM users').get());
  });
});

describe('a real import, and then the door closes behind it', () => {
  before(arm);

  test('an empty database takes a whole snapshot, table by table', async () => {
    // A source database with rows in it, exported exactly as the script does.
    const src = openTestDb();
    src.prepare('INSERT INTO users (id, display_name, locale, created_at) VALUES (?,?,?,?)')
      .run('u1', 'Nok', 'th', AT);
    src.prepare('INSERT INTO wallets (user_id, trip_points, green_points, exp) VALUES (?,?,?,?)')
      .run('u1', 120, 340, 500);
    src.prepare('INSERT INTO hosts (id, name, type) VALUES (?,?,?)')
      .run('h1', 'Samui Municipality', 'municipality');

    let sent = 0;
    for (const table of tablesInDependencyOrder(src)) {
      const batch = exportTable(src, table);
      if (batch.values.length === 0) continue;
      const res = await post(batch, TOKEN);
      // Read the body ONCE. A failure message built with `await res.text()`
      // inline consumes it even when the assertion passes, and the `json()`
      // below then throws "Body has already been read".
      if (res.status !== 200) assert.fail(`${table}: ${res.status} ${await res.text()}`);
      const body = await res.json() as { data: { table: string; inserted: number } };
      assert.equal(body.data.table, table);
      sent += body.data.inserted;
    }

    assert.equal(sent, 3, 'one user, one wallet, one host');
    const n = (t: string) =>
      (db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get() as unknown as { n: number }).n;
    assert.equal(n('users'), 1);
    assert.equal(n('wallets'), 1);
    assert.equal(n('hosts'), 1);
  });

  test('more batches are still accepted while the run is open', async () => {
    /*
      THE BUG THIS TEST CAUGHT. The guard was "is the database empty", which is
      true before the first batch and false before the second - so a 63-table
      import died on batch two with a 409. It is now "did this import begin on
      an empty database", remembered in `import_runs`.
    */
    const res = await post({
      table: 'users',
      columns: ['id', 'display_name', 'locale', 'created_at'],
      values: [['u-later', 'Arrived second', 'en', AT]],
    }, TOKEN);
    assert.equal(res.status, 200, await res.text());
  });

  test('the run is recorded, so where the data came from is answerable', () => {
    const run = db.prepare('SELECT id, started_at, finished_at FROM import_runs')
      .get() as unknown as { id: string; started_at: string; finished_at: string | null };
    assert.match(run.id, /^imp_/);
    assert.ok(run.started_at);
    assert.equal(run.finished_at, null, 'still open until somebody says otherwise');
  });

  test('closing the run is explicit, and then a live database is refused again', async () => {
    const closed = await app.request('/admin/import/finish', {
      method: 'POST',
      headers: { 'x-import-token': TOKEN },
    });
    assert.equal(closed.status, 200);

    // With the run closed and users present, this is now a LIVE database.
    const res = await post(aUser, TOKEN);
    assert.equal(res.status, 409);
    assert.equal((await res.json() as { code: string }).code, 'DATABASE_NOT_EMPTY');
  });

  test('unsetting the token is what shuts the door', async () => {
    disarm();
    assert.equal((await post(aUser, TOKEN)).status, 404);
  });
});
