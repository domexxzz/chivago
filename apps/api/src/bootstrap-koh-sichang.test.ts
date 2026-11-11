import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { openTestDb } from './db.ts';
import { bootstrapKohSichangBusinesses, KOH_SICHANG_BUSINESSES } from './bootstrap-koh-sichang.ts';

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
});
