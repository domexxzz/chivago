import { strict as assert } from 'node:assert';
import { beforeEach, describe, test } from 'node:test';

import { openTestDb, type DB } from './db-node.ts';
import { ATTRIBUTIONS_KEPT, OWN_ROWS_REMOVED, deleteAccount } from './account-deletion.ts';

/**
 * Deleting an account must work for everybody, not only for people who never
 * did anything (account-deletion.ts).
 *
 * Found on 19 November 2026, while adding the in-app button: five party
 * tables point at users(id) with no ON DELETE, and foreign keys are enforced.
 * `DELETE FROM users` threw for anyone who had chatted in, planned for, or
 * started a quest in a party somebody else created. The PDPA erasure route
 * answered 500 to exactly the people most likely to have data worth erasing.
 */

let db: DB;
beforeEach(() => { db = openTestDb(); });

const T = '2026-11-19T00:00:00.000Z';

/** A row with every required column filled, so a test names only what it is about. */
function insert(table: string, values: Record<string, unknown>): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as
    { name: string; type: string; notnull: number; dflt_value: unknown; pk: number }[];
  const row: Record<string, unknown> = {};
  for (const c of cols) {
    if (c.name in values) row[c.name] = values[c.name];
    else if (c.notnull && c.dflt_value === null) row[c.name] = /INT/i.test(c.type) ? 1 : /REAL/i.test(c.type) ? 1 : `${table}-${c.name}`;
  }
  const names = Object.keys(row);
  db.prepare(`INSERT INTO ${table} (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`)
    .run(...(names.map((n) => row[n]) as never[]));
}

const count = (sql: string, ...args: unknown[]) =>
  (db.prepare(sql).get(...(args as never[])) as { n: number }).n;

describe('the schema lets an account be deleted', () => {
  test('every reference that would block deleting a user is one deleteAccount handles', () => {
    type Fk = { table: string; from: string; on_delete: string };
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as
      { name: string }[]).map((r) => r.name);
    const fks = new Map(tables.map((t) => [t, db.prepare(`PRAGMA foreign_key_list(${t})`).all() as Fk[]]));

    // Every table whose rows can disappear when a user does: users, and
    // anything that cascades from a table already in the set.
    const goes = new Set(['users']);
    for (let grew = true; grew;) {
      grew = false;
      for (const [t, list] of fks) {
        if (!goes.has(t) && list.some((f) => goes.has(f.table) && f.on_delete === 'CASCADE')) {
          goes.add(t);
          grew = true;
        }
      }
    }

    // A reference into that set that neither cascades nor nulls makes the
    // delete throw, unless deleteAccount clears it first.
    const handled = new Set([...OWN_ROWS_REMOVED, ...ATTRIBUTIONS_KEPT].map((r) => `${r.table}.${r.column}`));
    const blocking: string[] = [];
    for (const [t, list] of fks) {
      for (const f of list) {
        if (goes.has(f.table) && !['CASCADE', 'SET NULL', 'SET DEFAULT'].includes(f.on_delete)) {
          if (!handled.has(`${t}.${f.from}`)) blocking.push(`${t}.${f.from} -> ${f.table}`);
        }
      }
    }
    assert.deepEqual(blocking, [], 'add these to account-deletion.ts, or give them an ON DELETE');
  });
});

describe('deleteAccount', () => {
  /** Ana created the party; Ben joined it and did a bit of everything in it. */
  function partyWithBen(): void {
    insert('users', { id: 'ana', display_name: 'Ana', created_at: T });
    insert('users', { id: 'ben', display_name: 'Ben', created_at: T });
    insert('hosts', { id: 'h1' });
    insert('places', { id: 'p1' });
    insert('quests', { id: 'q1', host_id: 'h1' });
    insert('parties', { id: 'party', created_by: 'ana', created_at: T });
    insert('party_members', { party_id: 'party', user_id: 'ana', joined_at: T });
    insert('party_members', { party_id: 'party', user_id: 'ben', joined_at: T });
    insert('party_messages', { id: 'm-ana', party_id: 'party', user_id: 'ana', kind: 'chat', body: 'hi', created_at: T });
    insert('party_messages', { id: 'm-ben', party_id: 'party', user_id: 'ben', kind: 'chat', body: 'hello', created_at: T });
    insert('party_itinerary', { id: 'i1', party_id: 'party', place_id: 'p1', position: 0, added_by: 'ben', created_at: T });
    insert('party_meeting_points', { party_id: 'party', set_by: 'ben', latitude: 13, longitude: 100, label: 'pier', updated_at: T });
    insert('party_quest_instances', {
      id: 'pq', party_id: 'party', quest_id: 'q1', quest_type: 'eco', quest_mode: 'collective',
      state: 'in_progress', selected_by: 'ben', selected_at: T,
    });
    insert('party_quest_participants', { party_quest_id: 'pq', user_id: 'ana', display_name_snapshot: 'Ana', rostered_at: T });
    insert('party_quest_participants', { party_quest_id: 'pq', user_id: 'ben', display_name_snapshot: 'Ben', rostered_at: T });
  }

  test('a plain DELETE FROM users is refused for someone active in another person\'s party - the bug', () => {
    partyWithBen();
    assert.throws(() => db.prepare('DELETE FROM users WHERE id = ?').run('ben'), /FOREIGN KEY/i);
  });

  test('deletes the account, and everything that was only theirs', () => {
    partyWithBen();
    assert.equal(deleteAccount(db, 'ben'), true);
    assert.equal(count('SELECT count(*) n FROM users WHERE id = ?', 'ben'), 0);
    assert.equal(count("SELECT count(*) n FROM party_messages WHERE user_id = 'ben'"), 0, 'their words go with them');
    assert.equal(count("SELECT count(*) n FROM party_members WHERE user_id = 'ben'"), 0);
    assert.equal(count("SELECT count(*) n FROM party_quest_participants WHERE user_id = 'ben'"), 0);
    assert.equal(count('SELECT count(*) n FROM party_meeting_points'), 0, 'a pin they dropped is theirs');
  });

  test('leaves the rest of the party standing, credited to the person who created it', () => {
    partyWithBen();
    deleteAccount(db, 'ben');
    assert.equal(count("SELECT count(*) n FROM parties WHERE id = 'party'"), 1);
    assert.equal(count("SELECT count(*) n FROM party_messages WHERE user_id = 'ana'"), 1, 'Ana keeps her own messages');
    assert.equal(count("SELECT count(*) n FROM party_itinerary WHERE id = 'i1' AND added_by = 'ana'"), 1,
      'the shared plan keeps its stop; the deleted name is no longer on it');
    assert.equal(count("SELECT count(*) n FROM party_quest_instances WHERE id = 'pq' AND selected_by = 'ana'"), 1,
      'a quest Ana is part of is not cancelled under her');
    assert.equal(count("SELECT count(*) n FROM party_quest_participants WHERE user_id = 'ana'"), 1);
  });

  test('deleting the party\'s creator takes the party with them, as it always has', () => {
    partyWithBen();
    assert.equal(deleteAccount(db, 'ana'), true);
    assert.equal(count('SELECT count(*) n FROM parties'), 0);
    assert.equal(count('SELECT count(*) n FROM party_messages'), 0);
    assert.equal(count("SELECT count(*) n FROM users WHERE id = 'ben'"), 1, 'Ben is still here');
  });

  test('their proof photos are queued for removal from storage, not left behind in R2', () => {
    partyWithBen();
    const proofFks = db.prepare('PRAGMA foreign_key_list(proofs)').all() as { table: string; from: string }[];
    const refs: Record<string, string> = { users: 'ben', quests: 'q1', hosts: 'h1', places: 'p1' };
    insert('proofs', { id: 'proof1', ...Object.fromEntries(proofFks.map((f) => [f.from, refs[f.table]])) });
    insert('proof_files', { id: 'f1', proof_id: 'proof1', storage_path: 'proofs/ben/photo.jpg', mime_type: 'image/jpeg', uploaded_at: T });
    deleteAccount(db, 'ben');
    assert.equal(count("SELECT count(*) n FROM proof_files WHERE id = 'f1'"), 0);
    assert.equal(count("SELECT count(*) n FROM media_deletions WHERE key = 'proofs/ben/photo.jpg'"), 1,
      'the alarm that drains media_deletions is what removes the file itself');
  });

  test('an account that does not exist is reported, not invented', () => {
    assert.equal(deleteAccount(db, 'nobody'), false);
  });

  test('all or nothing: a failure part-way leaves the account whole', () => {
    partyWithBen();
    db.exec(`CREATE TRIGGER refuse BEFORE DELETE ON users BEGIN SELECT RAISE(ABORT, 'refused'); END;`);
    assert.throws(() => deleteAccount(db, 'ben'), /refused/);
    assert.equal(count("SELECT count(*) n FROM party_messages WHERE user_id = 'ben'"), 1, 'nothing was half-deleted');
  });
});
