import { strict as assert } from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import { openTestDb, type DB } from './db.ts';
import { resolveDevice } from './account-service.ts';
import {
  hashPassword,
  loginUser,
  registerUser,
  UserAuthError,
  verifyPassword,
} from './user-account-service.ts';

describe('user account authentication service', () => {
  let db: DB;

  beforeEach(() => {
    db = openTestDb();
  });

  it('hashes and verifies passwords securely using scrypt', () => {
    const pwd = 'mySecurePassword123!';
    const hash = hashPassword(pwd);

    assert.ok(hash.startsWith('scrypt$'));
    assert.equal(verifyPassword(pwd, hash), true);
    assert.equal(verifyPassword('wrongPassword', hash), false);
    assert.equal(verifyPassword(pwd, null), false);
    assert.equal(verifyPassword(pwd, 'invalid$hash'), false);
  });

  it('registers a new user in the database, provisions wallet, and returns deviceKey', () => {
    const res = registerUser(db, {
      fullName: 'สมชาย เดินทาง',
      email: 'Somchai@Example.COM',
      phone: '081-234-5678',
      password: 'password123',
    });

    assert.ok(res.userId.startsWith('u_'));
    assert.ok(res.deviceKey.startsWith('chvg_dev_'));
    assert.equal(res.name, 'สมชาย เดินทาง');
    assert.equal(res.email, 'somchai@example.com');
    assert.equal(res.phone, '0812345678');

    // Verify user can be resolved with deviceKey
    const resolvedUser = resolveDevice(db, res.deviceKey);
    assert.equal(resolvedUser, res.userId);

    // Verify wallet was provisioned
    const wallet = db.prepare('SELECT user_id, trip_points FROM wallets WHERE user_id = ?').get(res.userId) as { user_id: string; trip_points: number };
    assert.ok(wallet);
    assert.equal(wallet.user_id, res.userId);
  });

  it('refuses registration when email or phone is already taken', () => {
    registerUser(db, {
      fullName: 'คนแรก',
      email: 'test@example.com',
      phone: '0891112233',
      password: 'password123',
    });

    // Duplicate email
    assert.throws(
      () =>
        registerUser(db, {
          fullName: 'คนที่สอง',
          email: 'TEST@EXAMPLE.COM',
          phone: '0894445566',
          password: 'password123',
        }),
      (err: UserAuthError) => {
        assert.equal(err.code, 'EMAIL_EXISTS');
        assert.equal(err.status, 409);
        return true;
      },
    );

    // Duplicate phone
    assert.throws(
      () =>
        registerUser(db, {
          fullName: 'คนที่สาม',
          email: 'other@example.com',
          phone: '089-111-2233',
          password: 'password123',
        }),
      (err: UserAuthError) => {
        assert.equal(err.code, 'PHONE_EXISTS');
        assert.equal(err.status, 409);
        return true;
      },
    );
  });

  it('authenticates existing user using email or phone', () => {
    registerUser(db, {
      fullName: 'กานดา สดใส',
      email: 'kanda@chivargo.com',
      phone: '0867778899',
      password: 'secretPassword999',
    });

    // Login with email
    const loginEmailRes = loginUser(db, {
      identifier: 'KANDA@CHIVARGO.COM',
      password: 'secretPassword999',
    });
    assert.equal(loginEmailRes.name, 'กานดา สดใส');
    assert.ok(loginEmailRes.deviceKey.startsWith('chvg_dev_'));
    assert.equal(resolveDevice(db, loginEmailRes.deviceKey), loginEmailRes.userId);

    // Login with phone (with formatting)
    const loginPhoneRes = loginUser(db, {
      identifier: '086-777-8899',
      password: 'secretPassword999',
    });
    assert.equal(loginPhoneRes.userId, loginEmailRes.userId);
    assert.ok(loginPhoneRes.deviceKey.startsWith('chvg_dev_'));
  });

  it('refuses login with invalid identifier or wrong password', () => {
    registerUser(db, {
      fullName: 'ประเสริฐ',
      email: 'prasert@example.com',
      phone: '0855554444',
      password: 'correctPassword',
    });

    // Wrong password
    assert.throws(
      () =>
        loginUser(db, {
          identifier: 'prasert@example.com',
          password: 'incorrectPassword',
        }),
      (err: UserAuthError) => {
        assert.equal(err.code, 'INVALID_CREDENTIALS');
        assert.equal(err.status, 401);
        return true;
      },
    );

    // Unknown user
    assert.throws(
      () =>
        loginUser(db, {
          identifier: 'nobody@example.com',
          password: 'anyPassword',
        }),
      (err: UserAuthError) => {
        assert.equal(err.code, 'INVALID_CREDENTIALS');
        assert.equal(err.status, 401);
        return true;
      },
    );
  });
});
