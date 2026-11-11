import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { openTestDb } from './db.ts';
import { registerUser } from './user-account-service.ts';
import {
  bootstrapKohSichangBusinesses,
  KOH_SICHANG_BUSINESSES,
  KOH_SICHANG_OPERATOR_EMAIL,
} from './bootstrap-koh-sichang.ts';

const env = {
  CHIVAGO_BOOTSTRAP_KOH_SICHANG: '1',
  CHIVAGO_BOOTSTRAP_OPERATOR_PASSWORD: 'test-password-456123',
  CHIVAGO_BOOTSTRAP_OPERATOR_PHONE: '0000456123',
} as NodeJS.ProcessEnv;

describe('Ko Sichang production bootstrap', () => {
  test('creates the operator and inserts each business exactly once', () => {
    const db = openTestDb();
    const first = bootstrapKohSichangBusinesses(db, env);
    assert.deepEqual(first, { accountCreated: true, shopsInserted: KOH_SICHANG_BUSINESSES.length, shopsAlreadyPresent: 0, skipped: false });

    const second = bootstrapKohSichangBusinesses(db, env);
    assert.deepEqual(second, { accountCreated: false, shopsInserted: 0, shopsAlreadyPresent: KOH_SICHANG_BUSINESSES.length, skipped: false });
    const count = db.prepare("SELECT COUNT(*) AS n FROM local_shops WHERE area_key='koh-sichang'").get() as { n: number };
    assert.equal(count.n, KOH_SICHANG_BUSINESSES.length);
  });

  test('does nothing when deployment configuration is disabled', () => {
    const db = openTestDb();
    assert.equal(bootstrapKohSichangBusinesses(db, {}).skipped, true);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM user_accounts').get() as { n: number }).n, 0);
  });

  // THE CASE THAT TOOK THE SERVER DOWN. This bootstrap is called at the top
  // level of server.ts, so anything it throws happens while the module is
  // still being imported and kills the process before a port is ever opened.
  // Both tests below reach that throw, and `stop` + `auto_start_machines` in
  // fly.toml would then wake the machine, crash it, and leave the pilot dark
  // until somebody edited fly.toml and deployed again.
  test('an operator renaming their own shop does not break the next boot', () => {
    const db = openTestDb();
    bootstrapKohSichangBusinesses(db, env);

    // Exactly what the docstring promises to tolerate: the operator edits a
    // profile. The row keeps its id and loses the name the bootstrap knows.
    db.prepare('UPDATE local_shops SET name = ? WHERE id = ?')
      .run('Novotel Ko Si Chang (ปรับปรุง)', 'bootstrap-koh-sichang-novotel');

    const again = bootstrapKohSichangBusinesses(db, env);
    assert.deepEqual(again, {
      accountCreated: false,
      shopsInserted: 0,
      shopsAlreadyPresent: KOH_SICHANG_BUSINESSES.length,
      skipped: false,
    });

    const count = db.prepare("SELECT COUNT(*) AS n FROM local_shops WHERE area_key='koh-sichang'")
      .get() as { n: number };
    assert.equal(count.n, KOH_SICHANG_BUSINESSES.length, 'the renamed shop must not be inserted twice');
    const renamed = db.prepare("SELECT name FROM local_shops WHERE id='bootstrap-koh-sichang-novotel'")
      .get() as { name: string };
    assert.equal(renamed.name, 'Novotel Ko Si Chang (ปรับปรุง)', "the operator's edit must survive");
  });

  test('an email already taken by a traveller is refused without throwing', () => {
    const db = openTestDb();
    registerUser(db, {
      fullName: 'Someone Else',
      email: KOH_SICHANG_OPERATOR_EMAIL,
      phone: '0812345678',
      password: 'traveller-password-1',
      accountType: 'traveller',
      locale: 'th',
    } as Parameters<typeof registerUser>[1]);

    const result = bootstrapKohSichangBusinesses(db, env);
    assert.equal(result.skipped, true, 'a wrong account type must skip, not throw');
    assert.equal(result.shopsInserted, 0);

    const count = db.prepare("SELECT COUNT(*) AS n FROM local_shops WHERE area_key='koh-sichang'")
      .get() as { n: number };
    assert.equal(count.n, 0, 'no business may be attached to an account that is not the operator');
  });

  // A shop somebody added by hand before this ever ran keeps its own row: the
  // bootstrap must not plant a second listing for the same business.
  test('a hand-made shop of the same name is left alone', () => {
    const db = openTestDb();
    const owner = registerUser(db, {
      fullName: 'Operator', email: 'someone-else@example.com', phone: '0898765432',
      password: 'operator-password-1', accountType: 'operator', businessName: 'Hand made',
      locale: 'th',
    } as Parameters<typeof registerUser>[1]);
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO local_shops
      (id, owner_id, name, category, area_key, description, address, lat, lng, phone, email,
       opening_hours, amenities, active, created_at, updated_at, service_type)
      VALUES ('by-hand', ?, ?, 'ที่พัก', 'koh-sichang', '', '', 13.17, 100.8, '', '', '', '', 1, ?, ?, 'business')`)
      .run(owner.userId, KOH_SICHANG_BUSINESSES[0]!.name, now, now);

    const result = bootstrapKohSichangBusinesses(db, env);
    assert.equal(result.shopsInserted, KOH_SICHANG_BUSINESSES.length - 1);
    assert.equal(result.shopsAlreadyPresent, 1);
    const dupes = db.prepare('SELECT COUNT(*) AS n FROM local_shops WHERE lower(name) = lower(?)')
      .get(KOH_SICHANG_BUSINESSES[0]!.name) as { n: number };
    assert.equal(dupes.n, 1, 'the business must be listed once, not twice');
  });
});
