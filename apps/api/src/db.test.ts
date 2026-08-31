import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, transact, type DB } from './db.ts';

let db: DB;

beforeEach(() => {
  db = openTestDb();
  db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)').run(
    'u1', 'John', '2026-01-01T00:00:00Z');
});

const userCount = (): number =>
  (db.prepare('SELECT COUNT(*) n FROM users').get() as { n: number }).n;

const addUser = (id: string) =>
  db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)').run(
    id, id, '2026-01-01T00:00:00Z');

describe('transact', () => {
  test('commits on success', () => {
    transact(db, () => addUser('u2'));
    assert.equal(userCount(), 2);
  });

  test('rolls back on throw', () => {
    assert.throws(() => transact(db, () => { addUser('u2'); throw new Error('boom'); }));
    assert.equal(userCount(), 1, 'the insert was rolled back');
  });

  test('re-entrant: an inner transaction joins the outer one', () => {
    // This is the exact composition that broke the redeem endpoint: the route
    // opens a transaction, then calls a service that opens its own.
    transact(db, () => {
      addUser('u2');
      transact(db, () => addUser('u3'));
    });
    assert.equal(userCount(), 3);
  });

  test('an inner failure rolls back only its own work', () => {
    transact(db, () => {
      addUser('u2');
      try {
        transact(db, () => { addUser('u3'); throw new Error('inner'); });
      } catch {
        // Swallowed on purpose: the outer unit of work continues.
      }
      addUser('u4');
    });
    const ids = (db.prepare('SELECT id FROM users ORDER BY id').all() as { id: string }[])
      .map((r) => r.id);
    assert.deepEqual(ids, ['u1', 'u2', 'u4'], 'u3 rolled back, the rest committed');
  });

  test('an outer failure discards inner work that had already succeeded', () => {
    assert.throws(() =>
      transact(db, () => {
        transact(db, () => addUser('u2'));
        throw new Error('outer');
      }));
    assert.equal(userCount(), 1);
  });

  test('depth is restored so a later transaction still commits normally', () => {
    assert.throws(() => transact(db, () => { throw new Error('x'); }));
    transact(db, () => addUser('u2'));
    assert.equal(userCount(), 2);
  });

  test('three levels deep', () => {
    transact(db, () => transact(db, () => transact(db, () => addUser('u2'))));
    assert.equal(userCount(), 2);
  });
});

describe('schema guards', () => {
  test('neither purse can go negative', () => {
    db.prepare('INSERT INTO wallets (user_id, trip_points, green_points) VALUES (?,?,?)')
      .run('u1', 100, 100);
    // Both are checked separately. A single guard would let one purse fund a
    // shortfall in the other, which is exactly what two currencies must not do.
    assert.throws(
      () => db.prepare('UPDATE wallets SET green_points = -1 WHERE user_id = ?').run('u1'),
    );
    assert.throws(
      () => db.prepare('UPDATE wallets SET trip_points = -1 WHERE user_id = ?').run('u1'),
    );
  });

  test('lifetime EXP cannot go negative', () => {
    db.prepare('INSERT INTO wallets (user_id, exp) VALUES (?,?)').run('u1', 500);
    assert.throws(() => db.prepare('UPDATE wallets SET exp = -1 WHERE user_id = ?').run('u1'));
  });

  test('a ledger currency must be one of the two, not free text', () => {
    assert.throws(
      () =>
        db.prepare(
          `INSERT INTO ledger (id, user_id, label, occurred_at, host, amount, currency,
             kind, source_ref)
           VALUES (?,?,?,?,?,?,?,?,?)`,
        ).run('bad', 'u1', 'x', '2026-01-01T00:00:00Z', 'h', 10, 'gold',
              'quest_reward', 'ref-gold'),
      /CHECK/i,
    );
  });

  test('a ledger source_ref is unique - the idempotency guarantee', () => {
    const ins = () =>
      db.prepare(
        `INSERT INTO ledger (id, user_id, label, occurred_at, host, amount, currency, kind, source_ref)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      ).run(crypto.randomUUID(), 'u1', 'x', '2026-01-01T00:00:00Z', 'h', 10, 'green',
            'quest_reward', 'ref-1');
    ins();
    assert.throws(ins, /UNIQUE/i);
  });

  test('deleting a user cascades - the PDPA erasure path', () => {
    db.prepare('INSERT INTO wallets (user_id, green_points) VALUES (?,?)').run('u1', 100);
    db.prepare(
      `INSERT INTO ledger (id, user_id, label, occurred_at, host, amount, currency, kind, source_ref)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run('l1', 'u1', 'x', '2026-01-01T00:00:00Z', 'h', 10, 'green', 'quest_reward', 'ref-1');

    db.prepare('DELETE FROM users WHERE id = ?').run('u1');

    assert.equal((db.prepare('SELECT COUNT(*) n FROM wallets').get() as { n: number }).n, 0);
    assert.equal((db.prepare('SELECT COUNT(*) n FROM ledger').get() as { n: number }).n, 0);
  });
});
