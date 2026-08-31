import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, type DB } from './db.ts';
import {
  generateApiKey, hashApiKey, hostOwnsQuest, login, logout, pruneSessions,
  readCookie, resolveSession, SESSION_TTL_MS, verifyApiKey,
} from './host-auth.ts';

let db: DB;
const KEY_A = 'chv_AAAAA-BBBBB-CCCCC-DDDDD';
const KEY_B = 'chv_EEEEE-FFFFF-GGGGG-HHHHH';

beforeEach(() => {
  db = openTestDb();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO hosts (id, name, type, api_key_hash, created_at) VALUES (?,?,?,?,?)').run(
    'h-muni', 'Samui Municipality', 'municipality', hashApiKey(KEY_A), now);
  db.prepare('INSERT INTO hosts (id, name, type, api_key_hash, created_at) VALUES (?,?,?,?,?)').run(
    'h-lab', 'Ocean Lab', 'hotel', hashApiKey(KEY_B), now);
  // A host with no key issued yet.
  db.prepare('INSERT INTO hosts (id, name, type, created_at) VALUES (?,?,?,?)').run(
    'h-none', 'Unprovisioned NGO', 'ngo', now);

  const quest = (id: string, code: string, host: string) =>
    db.prepare(
      `INSERT INTO quests (id, code, name_en, name_th, where_label, duration, reward_points,
         host_id, kind, lat, lng, geofence_radius_m)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(id, code, code, code, 'x', '1 hr', 100, host, 'today', 9.5, 100.0, 250);
  quest('q-muni', 'BC-04', 'h-muni');
  quest('q-lab', 'CR-02', 'h-lab');
});

describe('api key hashing', () => {
  test('a correct key verifies', () => {
    assert.equal(verifyApiKey(KEY_A, hashApiKey(KEY_A)), true);
  });

  test('a wrong key does not', () => {
    assert.equal(verifyApiKey(KEY_B, hashApiKey(KEY_A)), false);
  });

  test('the same key hashes differently every time (salted)', () => {
    assert.notEqual(hashApiKey(KEY_A), hashApiKey(KEY_A));
  });

  test('the plaintext key never appears in the hash', () => {
    assert.ok(!hashApiKey(KEY_A).includes(KEY_A));
  });

  test('a corrupt or missing stored hash fails closed, it does not throw', () => {
    assert.equal(verifyApiKey(KEY_A, null), false);
    assert.equal(verifyApiKey(KEY_A, ''), false);
    assert.equal(verifyApiKey(KEY_A, 'garbage'), false);
    assert.equal(verifyApiKey(KEY_A, 'scrypt$zz$zz'), false);
    assert.equal(verifyApiKey(KEY_A, 'md5$aa$bb'), false);
  });

  test('generated keys are prefixed, grouped and unique', () => {
    const keys = new Set(Array.from({ length: 50 }, generateApiKey));
    assert.equal(keys.size, 50, 'no collisions');
    for (const k of keys) assert.match(k, /^chv_[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/);
  });
});

describe('login', () => {
  test('a valid key opens a session for the right host', () => {
    const s = login(db, KEY_A, 'Nok');
    assert.ok(s);
    assert.equal(s.hostId, 'h-muni');
    assert.equal(s.hostName, 'Samui Municipality');
    assert.equal(s.reviewer, 'Nok');
  });

  test('each host gets its own host id', () => {
    assert.equal(login(db, KEY_B, 'Lek')!.hostId, 'h-lab');
  });

  test('an unknown key is refused', () => {
    assert.equal(login(db, 'chv_ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ', 'x'), null);
  });

  test('an empty key is refused', () => {
    assert.equal(login(db, '', 'x'), null);
  });

  test('a host with no key issued cannot be logged into', () => {
    // The unprovisioned host has a NULL hash; nothing should ever match it.
    assert.equal(login(db, '', null), null);
    assert.equal(login(db, 'null', null), null);
  });

  test('two sessions for the same host get different tokens', () => {
    assert.notEqual(login(db, KEY_A, 'a')!.token, login(db, KEY_A, 'b')!.token);
  });
});

describe('sessions', () => {
  test('a fresh session resolves', () => {
    const s = login(db, KEY_A, 'Nok')!;
    assert.equal(resolveSession(db, s.token)!.hostId, 'h-muni');
  });

  test('an unknown token does not', () => {
    assert.equal(resolveSession(db, 'nope'), null);
    assert.equal(resolveSession(db, undefined), null);
  });

  test('an expired session is refused and cleaned up', () => {
    const s = login(db, KEY_A, 'Nok')!;
    const later = new Date(Date.now() + SESSION_TTL_MS + 1000);
    assert.equal(resolveSession(db, s.token, later), null);
    // And the row is gone, so an expired token cannot be replayed.
    assert.equal(resolveSession(db, s.token), null);
  });

  test('signing out invalidates the token immediately', () => {
    const s = login(db, KEY_A, 'Nok')!;
    logout(db, s.token);
    assert.equal(resolveSession(db, s.token), null);
  });

  test('pruning removes only expired sessions', () => {
    login(db, KEY_A, 'live');
    const old = login(db, KEY_B, 'old')!;
    db.prepare('UPDATE host_sessions SET expires_at = ? WHERE token = ?').run(
      new Date(Date.now() - 1000).toISOString(), old.token);
    assert.equal(pruneSessions(db), 1);
    assert.equal(resolveSession(db, old.token), null);
  });
});

describe('host scoping — the rule this file exists for', () => {
  test('a host owns its own quest', () => {
    assert.equal(hostOwnsQuest(db, 'h-muni', 'q-muni'), true);
  });

  test('a host does NOT own another host quest', () => {
    // Samui Municipality must never be able to approve Ocean Lab's work: the
    // host is the party vouching for it, and its name goes on the ledger.
    assert.equal(hostOwnsQuest(db, 'h-muni', 'q-lab'), false);
    assert.equal(hostOwnsQuest(db, 'h-lab', 'q-muni'), false);
  });

  test('an unknown quest is not owned by anyone', () => {
    assert.equal(hostOwnsQuest(db, 'h-muni', 'q-nope'), false);
  });

  test('an unknown host owns nothing', () => {
    assert.equal(hostOwnsQuest(db, 'h-ghost', 'q-muni'), false);
  });
});

describe('cookie parsing', () => {
  test('reads the named cookie among others', () => {
    assert.equal(readCookie('a=1; chivago_host=tok3n; b=2', 'chivago_host'), 'tok3n');
  });

  test('returns undefined when absent or headerless', () => {
    assert.equal(readCookie('a=1', 'chivago_host'), undefined);
    assert.equal(readCookie(undefined, 'chivago_host'), undefined);
  });

  test('handles values containing =', () => {
    assert.equal(readCookie('chivago_host=aa=bb', 'chivago_host'), 'aa=bb');
  });
});

describe('the empty-hash authentication bypass', () => {
  // Regression guard. An earlier verifyApiKey decoded the stored hex loosely,
  // so a corrupt api_key_hash produced a zero-length expected buffer - and
  // timingSafeEqual(empty, empty) is TRUE, authenticating every key against
  // that row. Each of these must fail closed.
  const CORRUPT = [
    'scrypt$zz$zz',
    'scrypt$$',
    'scrypt$00$',
    'scrypt$$00',
    // Right shape, wrong lengths.
    'scrypt$00112233$0011223344',
    // Valid hex but a truncated hash.
    `scrypt$${'a'.repeat(32)}$${'b'.repeat(32)}`,
    // Valid hex but a truncated salt.
    `scrypt$${'a'.repeat(30)}$${'b'.repeat(64)}`,
    // Non-hex characters at full length.
    `scrypt$${'g'.repeat(32)}$${'g'.repeat(64)}`,
  ];

  for (const stored of CORRUPT) {
    test(`refuses "${stored.slice(0, 28)}..."`, () => {
      assert.equal(verifyApiKey('any key at all', stored), false);
      assert.equal(verifyApiKey('', stored), false);
    });
  }

  test('a host row with a corrupt hash cannot be logged into', () => {
    db.prepare('UPDATE hosts SET api_key_hash = ? WHERE id = ?').run('scrypt$zz$zz', 'h-muni');
    assert.equal(login(db, 'literally anything', 'attacker'), null);
    assert.equal(login(db, '', 'attacker'), null);
  });
});

describe('a check that could not run is not a wrong key', () => {
  test('an unverifiable key is distinguishable from a bad one', () => {
    // Under load scryptSync throws "Deriving bits failed". Swallowing that
    // into `false` tells a legitimate host their key is wrong and sends them
    // to rotate a key that works.
    const stored = hashApiKey(KEY_A);
    const parts = stored.split('$');
    // A salt of the right length but a hash the comparison will reject: the
    // wrong-key path, which must stay a plain false.
    const wrongHash = `${parts[0]}$${parts[1]}$${'0'.repeat(64)}`;
    assert.equal(verifyApiKey(KEY_A, wrongHash), false);
  });

  test('a corrupt stored hash still fails closed without throwing', () => {
    // The original reason for the catch. It must survive the change.
    assert.equal(verifyApiKey(KEY_A, 'scrypt$zz$zz'), false);
    assert.equal(verifyApiKey(KEY_A, 'scrypt$' + 'a'.repeat(32) + '$short'), false);
  });

  test('hashing and verifying agree under the pinned parameters', () => {
    // If the two ever disagree on N, r or p, every stored hash stops matching.
    const stored = hashApiKey(KEY_A);
    assert.equal(verifyApiKey(KEY_A, stored), true);
    assert.equal(verifyApiKey(KEY_B, stored), false);
  });
});
