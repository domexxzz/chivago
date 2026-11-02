/**
 * The Durable Object adapter's own guarantees.
 *
 * The whole suite already runs through this adapter under
 * `CHIVAGO_DB_DRIVER=durable` (`pnpm test:durable`), which is what proves the
 * SHAPE is right at 536 call sites. These tests pin the handful of decisions
 * that suite would not notice if they regressed quietly:
 *
 *  - what gets stripped, and - more easily got wrong - what must NOT be,
 *    because `BEGIN ... END` is both transaction control and trigger syntax;
 *  - that `.run().changes` answers the question twenty call sites ask;
 *  - that `transact()` keeps its re-entrancy through `transactionSync()`.
 *
 * Every expectation here was measured against real workerd first; see the
 * header of `do-storage.ts` for what it answered.
 */

import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import {
  openDurableDb,
  registerDurable,
  stripUnsupported,
  type SyncDatabase,
} from './do-storage.ts';
import { standInStorage, resetStandInDepth } from './do-storage-stand-in.ts';
import { transact } from './db.ts';

const openAdapted = (): SyncDatabase => {
  resetStandInDepth();
  const storage = standInStorage(new DatabaseSync(':memory:'));
  const db = openDurableDb(storage);
  registerDurable(db, storage);
  return db;
};

describe('what the adapter strips', () => {
  test('PRAGMA journal_mode goes, because Durable Objects answer SQLITE_AUTH', () => {
    assert.equal(stripUnsupported('PRAGMA journal_mode = WAL;').trim(), '');
  });

  test('PRAGMA foreign_keys STAYS - it works, and two migrations need it', () => {
    // Measured: foreign keys are on by default on Durable Object storage and
    // the pragma works in both directions. Stripping it would silently run
    // the two table-rebuild migrations with enforcement still on.
    assert.match(stripUnsupported('PRAGMA foreign_keys = OFF;'), /foreign_keys = OFF/);
    assert.match(stripUnsupported('PRAGMA foreign_keys = ON;'), /foreign_keys = ON/);
  });

  test('transaction control goes', () => {
    const stripped = stripUnsupported(`
      BEGIN;
      CREATE TABLE t (a TEXT);
      COMMIT;
    `);
    assert.doesNotMatch(stripped, /BEGIN/);
    assert.doesNotMatch(stripped, /COMMIT/);
    assert.match(stripped, /CREATE TABLE t/);
  });

  test('a TRIGGER BODY survives - its BEGIN is not a transaction', () => {
    /*
      The regression this guards. `migrations.ts` has nine append-only
      triggers shaped exactly like this; they are what stops a statement or a
      conclusion being edited after it was made. Durable Objects accept them
      and fire them. A strip rule that matched `BEGIN` without requiring the
      statement to END there would quietly delete the guard and leave the
      table writable.
    */
    const sql = `
      CREATE TRIGGER statements_append_only
      BEFORE UPDATE ON statements
      BEGIN SELECT RAISE(ABORT, 'statements are append-only: issue another'); END;
    `;
    assert.equal(stripUnsupported(sql), sql, 'the trigger is passed through untouched');
  });

  test('an append-only trigger still fires through the adapter', () => {
    const db = openAdapted();
    db.exec('CREATE TABLE statements (id TEXT PRIMARY KEY, body TEXT NOT NULL)');
    db.exec(`
      CREATE TRIGGER statements_append_only
      BEFORE UPDATE ON statements
      BEGIN SELECT RAISE(ABORT, 'statements are append-only: issue another'); END;
    `);
    db.prepare('INSERT INTO statements (id, body) VALUES (?,?)').run('s1', 'first');
    assert.throws(
      () => db.prepare('UPDATE statements SET body = ? WHERE id = ?').run('tampered', 's1'),
      /append-only/,
    );
  });

  test('a batch that opened a transaction is still atomic', () => {
    // BEGIN/COMMIT are stripped, so atomicity has to come from somewhere:
    // the adapter puts the remainder inside transactionSync().
    const db = openAdapted();
    db.exec('CREATE TABLE a (x TEXT)');
    assert.throws(() =>
      db.exec(`
        BEGIN;
        INSERT INTO a (x) VALUES ('one');
        INSERT INTO nonexistent (x) VALUES ('two');
        COMMIT;
      `));
    assert.deepEqual(db.prepare('SELECT x FROM a').all(), [], 'the first insert went back');
  });
});

describe('.run() answers about rows, not about billing', () => {
  let db: SyncDatabase;

  beforeEach(() => {
    db = openAdapted();
    db.exec('CREATE TABLE t (id TEXT PRIMARY KEY, v TEXT)');
    db.prepare('INSERT INTO t (id, v) VALUES (?,?)').run('a', '1');
    db.prepare('INSERT INTO t (id, v) VALUES (?,?)').run('b', '2');
  });

  test('changes counts the rows an UPDATE matched', () => {
    assert.equal(Number(db.prepare('UPDATE t SET v = ? WHERE id = ?').run('9', 'a').changes), 1);
  });

  test('changes is 0 when nothing matched - the check twenty call sites make', () => {
    assert.equal(
      Number(db.prepare('UPDATE t SET v = ? WHERE id = ?').run('9', 'absent').changes),
      0,
    );
  });

  test('changes counts the rows a DELETE removed', () => {
    assert.equal(Number(db.prepare('DELETE FROM t WHERE id = ?').run('b').changes), 1);
    assert.equal(Number(db.prepare('DELETE FROM t WHERE id = ?').run('b').changes), 0);
  });
});

describe('transact() over transactionSync()', () => {
  // The same expectations as db.test.ts, against the Durable Object path.
  // Measured on workerd: transactionSync nests, and an inner throw caught by
  // the outer transaction discards only the inner work.
  let db: SyncDatabase;

  const add = (id: string) => db.prepare('INSERT INTO users (id) VALUES (?)').run(id);
  const ids = (): string[] =>
    db.prepare('SELECT id FROM users ORDER BY id').all().map((r) => String(r.id));

  beforeEach(() => {
    db = openAdapted();
    db.exec('CREATE TABLE users (id TEXT PRIMARY KEY)');
    add('u1');
  });

  test('commits on success', () => {
    transact(db, () => add('u2'));
    assert.deepEqual(ids(), ['u1', 'u2']);
  });

  test('rolls back on throw', () => {
    assert.throws(() => transact(db, () => { add('u2'); throw new Error('boom'); }));
    assert.deepEqual(ids(), ['u1']);
  });

  test('an inner failure rolls back only its own work', () => {
    transact(db, () => {
      add('u2');
      try {
        transact(db, () => { add('u3'); throw new Error('inner'); });
      } catch {
        // Swallowed on purpose: the outer unit of work continues.
      }
      add('u4');
    });
    assert.deepEqual(ids(), ['u1', 'u2', 'u4'], 'u3 rolled back, the rest committed');
  });

  test('an outer failure discards inner work that had already succeeded', () => {
    assert.throws(() =>
      transact(db, () => {
        transact(db, () => add('u2'));
        throw new Error('outer');
      }));
    assert.deepEqual(ids(), ['u1']);
  });

  test('three levels deep', () => {
    transact(db, () => transact(db, () => transact(db, () => add('u2'))));
    assert.deepEqual(ids(), ['u1', 'u2']);
  });
});

describe('the stand-in refuses what Durable Objects refuse', () => {
  // Without this the local suite would prove nothing: a permissive stand-in
  // accepts SQL the real runtime rejects, and the failure waits for a deploy.
  const storage = () => standInStorage(new DatabaseSync(':memory:'));

  test('PRAGMA journal_mode', () => {
    assert.throws(() => storage().sql.exec('PRAGMA journal_mode = WAL;'), /SQLITE_AUTH/);
  });

  test('BEGIN as a statement', () => {
    assert.throws(() => storage().sql.exec('BEGIN;'), /transactionSync/);
  });

  test('SAVEPOINT', () => {
    assert.throws(() => storage().sql.exec('SAVEPOINT sp_0;'), /transactionSync/);
  });

  test('but NOT a trigger body', () => {
    const s = storage();
    s.sql.exec('CREATE TABLE t (a TEXT)');
    s.sql.exec(`
      CREATE TRIGGER guard BEFORE UPDATE ON t
      BEGIN SELECT RAISE(ABORT, 'no'); END;
    `);
    // A row has to exist, or a BEFORE UPDATE trigger has nothing to fire on
    // and the test would pass for the wrong reason.
    s.sql.exec("INSERT INTO t (a) VALUES ('here')");
    assert.throws(() => s.sql.exec("UPDATE t SET a='x'"), /no/);
  });
});
