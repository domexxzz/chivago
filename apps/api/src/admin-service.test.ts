import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { POOL, itemKey } from '@chivago/core';
import { openTestDb } from './db-node.ts';
import { upsertAdmin } from './admin-account.ts';
import { login } from './host-auth.ts';
import {
  adminPlaces, adminPosts, adminUsers, editAdminUser, grantToUser, saveAdminPlace,
  setPlaceHidden, setPostHidden,
} from './admin-service.ts';
import { collectionFor, fashionFor, heldBy } from './summon-service.ts';
import { getBalances, getExp } from './wallet-service.ts';

const setup = () => {
  const db = openTestDb();
  const admin = upsertAdmin(db, { username: 'AdminChivarGOnaja', password: '123456789' });
  db.prepare('INSERT INTO users(id,display_name,created_at) VALUES (?,?,?)')
    .run('u1', 'Traveller One', '2026-11-13T00:00:00.000Z');
  db.prepare(`INSERT INTO user_accounts(id,email,password_hash,account_type,created_at,updated_at)
    VALUES ('u1','one@example.com','x','traveller',?,?)`)
    .run('2026-11-13T00:00:00.000Z', '2026-11-13T00:00:00.000Z');
  return { db, admin };
};

describe('administrator credentials', () => {
  test('require both the username and password and produce an admin session', () => {
    const { db } = setup();
    assert.equal(login(db, '123456789', 'AdminChivarGOnaja'), null, 'password alone is not an admin login');
    assert.equal(login(db, '123456789', 'AdminChivarGOnaja', 'wrong'), null);
    const session = login(db, '123456789', 'AdminChivarGOnaja', 'AdminChivarGOnaja');
    assert.equal(session?.role, 'admin');
  });
});

describe('admin user and content controls', () => {
  test('edits and disables a user with an audit record', () => {
    const { db, admin } = setup();
    editAdminUser(db, admin.id, 'u1', { displayName: 'New Name', accountType: 'operator', disabled: true });
    const user = adminUsers(db, 'one@example.com')[0]!;
    assert.equal(user.displayName, 'New Name');
    assert.equal(user.accountType, 'operator');
    assert.ok(user.disabledAt);
    assert.equal((db.prepare("SELECT COUNT(*) n FROM admin_audit_log WHERE action='user.update'").get() as { n: number }).n, 1);
  });

  test('creates and reversibly hides a place from the public repository', () => {
    const { db, admin } = setup();
    saveAdminPlace(db, admin.id, { id: 'sichang-admin-place', nameEn: 'Admin Place', nameTh: 'สถานที่แอดมิน', layer: 'culture', province: 'TH-20', lat: 13.16, lng: 100.81 });
    assert.equal(adminPlaces(db, 'Admin Place').length, 1);
    assert.equal((db.prepare("SELECT admin_hidden_at FROM places WHERE id='sichang-admin-place'").get() as { admin_hidden_at: string | null }).admin_hidden_at, null);
    setPlaceHidden(db, admin.id, 'sichang-admin-place', true);
    assert.ok((db.prepare("SELECT admin_hidden_at FROM places WHERE id='sichang-admin-place'").get() as { admin_hidden_at: string | null }).admin_hidden_at);
    setPlaceHidden(db, admin.id, 'sichang-admin-place', false);
    assert.equal((db.prepare("SELECT admin_hidden_at FROM places WHERE id='sichang-admin-place'").get() as { admin_hidden_at: string | null }).admin_hidden_at, null);
  });

  test('hides and restores a community post without deleting it', () => {
    const { db, admin } = setup();
    db.prepare(`INSERT INTO community_posts(id,author_id,body,share_count,created_at,updated_at)
      VALUES ('p1','u1','hello',0,?,?)`).run('2026-11-13T00:00:00.000Z', '2026-11-13T00:00:00.000Z');
    setPostHidden(db, admin.id, 'p1', true);
    assert.ok(adminPosts(db)[0]!.hiddenAt);
    setPostHidden(db, admin.id, 'p1', false);
    assert.equal(adminPosts(db)[0]!.hiddenAt, null);
  });
});

describe('admin grants', () => {
  test('grants points, EXP and a real collection item', () => {
    const { db, admin } = setup();
    grantToUser(db, admin.id, { userId: 'u1', kind: 'trip', amount: 400, note: 'support credit' });
    grantToUser(db, admin.id, { userId: 'u1', kind: 'green', amount: 120, note: 'verified correction' });
    grantToUser(db, admin.id, { userId: 'u1', kind: 'exp', amount: 75, note: 'progress correction' });
    const item = POOL[0]!;
    grantToUser(db, admin.id, { userId: 'u1', kind: 'item', itemKey: itemKey(item), note: 'event reward' });
    assert.deepEqual(getBalances(db, 'u1'), { trip: 400, green: 120 });
    assert.equal(getExp(db, 'u1'), 75);
    assert.equal(heldBy(db, 'u1').get(itemKey(item)), 1);
    if (item.kind === 'spirit') assert.equal(collectionFor(db, 'u1').find((x) => x.key === itemKey(item))?.held, 1);
    else assert.equal(fashionFor(db, 'u1').find((x) => x.key === itemKey(item))?.held, 1);
  });
});
