import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, type DB } from './db.ts';
import { verifyApiKey } from './host-auth.ts';
import { addHost } from './add-host.ts';

let db: DB;
beforeEach(() => { db = openTestDb(); });

describe('adding a real host', () => {
  test('creates the row as a plain host and hands back a key that actually opens the console', () => {
    const r = addHost(db, { id: 'h-trash-hero-samui', name: 'Trash Hero Koh Samui', type: 'ngo' });
    assert.equal(r.created, true);
    assert.ok(r.key, 'a new host must be given its key once');

    const host = db.prepare('SELECT name, type, role, api_key_hash FROM hosts WHERE id = ?')
      .get('h-trash-hero-samui') as { name: string; type: string; role: string; api_key_hash: string };
    assert.equal(host.role, 'host', 'a partner never moderates reviews by default');
    assert.equal(host.type, 'ngo');
    assert.ok(verifyApiKey(r.key!, host.api_key_hash), 'the printed key must match the stored hash');
    assert.notEqual(host.api_key_hash, r.key, 'only a hash is stored');
  });

  test('running it again renames but never reissues the key', () => {
    const first = addHost(db, { id: 'h-x', name: 'Before', type: 'community' });
    const again = addHost(db, { id: 'h-x', name: 'After', type: 'community' });
    assert.equal(again.created, false);
    assert.equal(again.key, null, 'a second run must not print a second key');
    const host = db.prepare('SELECT name, api_key_hash FROM hosts WHERE id = ?').get('h-x') as { name: string; api_key_hash: string };
    assert.equal(host.name, 'After');
    assert.ok(verifyApiKey(first.key!, host.api_key_hash), 'the original key still works');
  });

  test('refuses a type the app does not know', () => {
    assert.throws(() => addHost(db, { id: 'h-y', name: 'Y', type: 'sponsor' as never }), /type must be one of/);
  });
});
