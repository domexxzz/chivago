import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, type DB } from './db.ts';
import { login, verifyApiKey } from './host-auth.ts';
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

  test('AN OPERATOR IS ADDED THE SAME WAY, AND ITS KEY OPENS A SESSION THAT KNOWS IT IS ONE', () => {
    // The console reads `hostType` off the session to keep an operator to its
    // listings and questions (console/routes.ts); a session that forgot the
    // type would open the whole console to a boat co-op.
    const r = addHost(db, { id: 'op-example-boat', name: 'Example Boat Co-op', type: 'operator' });
    assert.ok(r.key);
    const session = login(db, r.key!, 'Somchai');
    assert.equal(session?.hostType, 'operator');
    assert.equal(session?.role, 'host', 'an operator never moderates');
  });

  test('refuses a type the app does not know', () => {
    assert.throws(() => addHost(db, { id: 'h-y', name: 'Y', type: 'sponsor' as never }), /type must be one of/);
  });
});

/**
 * An operator that is an example rather than a business.
 *
 * The mark is what makes the app say "Example · not a real business" on every
 * screen the listing reaches, and what keeps a made-up operator from being
 * given a response time. It is worth exactly as much as it is hard to lose.
 */
describe('marking an operator as an example', () => {
  const marked = (id: string) =>
    (db.prepare('SELECT example FROM hosts WHERE id = ?').get(id) as { example: number }).example;

  test('an ordinary host is not an example', () => {
    addHost(db, { id: 'h-real', name: 'Samui Municipality', type: 'municipality' });
    assert.equal(marked('h-real'), 0);
  });

  test('--example marks it', () => {
    addHost(db, { id: 'op-eg', name: 'Example Boat Co-op', type: 'operator', example: true });
    assert.equal(marked('op-eg'), 1);
  });

  test('RE-RUNNING WITHOUT THE FLAG DOES NOT QUIETLY UN-MARK IT', () => {
    // Renaming an example operator must not turn it into a business on every
    // traveller's screen. Taking the mark off is a deliberate UPDATE.
    addHost(db, { id: 'op-eg', name: 'Example Boat Co-op', type: 'operator', example: true });
    addHost(db, { id: 'op-eg', name: 'Example Boat Co-op (renamed)', type: 'operator' });
    assert.equal(marked('op-eg'), 1, 'the example mark came off by accident');
    assert.equal(
      (db.prepare("SELECT name FROM hosts WHERE id = 'op-eg'").get() as { name: string }).name,
      'Example Boat Co-op (renamed)', 'the rename did not happen',
    );
  });

  test('and a real host is never marked by somebody else’s run', () => {
    addHost(db, { id: 'op-eg', name: 'Example', type: 'operator', example: true });
    addHost(db, { id: 'h-real', name: 'Real', type: 'hotel' });
    assert.equal(marked('h-real'), 0);
  });
});
