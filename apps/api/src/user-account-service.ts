/**
 * User Account Authentication Service
 *
 * Provides real database storage and authentication for user accounts:
 * - Secure scrypt password hashing with unique random salt
 * - Registration storing full name, normalized email, normalized phone, and password hash
 * - Collision prevention for duplicate email or phone numbers
 * - Login matching either email or phone with constant-time password verification
 * - Device key issuance and wallet provisioning upon successful registration and login
 */

import { randomBytes } from 'node:crypto';
import { isLang } from '@chivago/core';
import { row, type DB } from './db.ts';
import { generateDeviceKey, hashToken } from './account-service.ts';
import { ensureWallet, grantOpeningBalance } from './wallet-service.ts';
import { constantTimeEqual, deriveKey, hashSecret, parseHash } from './scrypt.ts';

export class UserAuthError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'UserAuthError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Hash a password using scrypt.
 * Format: `scrypt$<salt-hex>$<hash-hex>`
 *
 * The parameters and the derivation moved to `scrypt.ts`, which computes the
 * same digest without `node:crypto` so that this runs on Workers too. Existing
 * hashes keep verifying - the algorithm did not change, only the code that
 * runs it.
 */
export function hashPassword(password: string): string {
  return hashSecret(password);
}

/**
 * Verify a password against the stored scrypt hash in constant time.
 *
 * Returns false rather than throwing on a malformed stored value: a corrupt
 * row must fail closed, not crash the login route for everyone.
 */
export function verifyPassword(password: string, stored: string | null): boolean {
  const parsed = parseHash(stored);
  if (!parsed) return false;

  let actual: Uint8Array;
  try {
    actual = deriveKey(password, parsed.salt);
  } catch {
    return false;
  }
  return constantTimeEqual(actual, parsed.expected);
}

export type AccountType = 'traveller' | 'operator';

export interface RegisterUserParams {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  accountType?: AccountType;
  businessName?: string;
  locale?: 'th' | 'en';
}

export interface AuthSuccessResult {
  userId: string;
  deviceKey: string;
  name: string;
  email: string;
  phone: string;
  accountType: AccountType;
  businessName: string | null;
}

/**
 * Register a new user in the database.
 */
export function registerUser(
  db: DB,
  params: RegisterUserParams,
  now = new Date(),
): AuthSuccessResult {
  const cleanName = params.fullName ? params.fullName.trim() : '';
  const cleanEmail = params.email ? params.email.trim().toLowerCase() : '';
  const cleanPhone = params.phone ? params.phone.trim().replace(/[-\s]/g, '') : '';
  const accountType: AccountType = params.accountType === 'operator' ? 'operator' : 'traveller';
  const cleanBusiness = accountType === 'operator'
    ? (params.businessName?.trim() || cleanName)
    : null;

  if (!cleanName) {
    throw new UserAuthError('NAME_REQUIRED', 'กรุณากรอกชื่อ-นามสกุล', 400);
  }
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new UserAuthError('EMAIL_INVALID', 'รูปแบบอีเมลไม่ถูกต้อง', 400);
  }
  if (!cleanPhone || cleanPhone.length < 8) {
    throw new UserAuthError('PHONE_INVALID', 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง', 400);
  }
  if (!params.password || params.password.length < 8) {
    throw new UserAuthError('PASSWORD_TOO_SHORT', 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร', 400);
  }

  // Check email collision
  const existingEmail = row<{ id: string }>(
    db.prepare('SELECT id FROM user_accounts WHERE lower(email) = ?').get(cleanEmail),
  );
  if (existingEmail) {
    throw new UserAuthError('EMAIL_EXISTS', 'อีเมลนี้ถูกใช้งานแล้วในระบบ', 409);
  }

  // Check phone collision
  const existingPhone = row<{ id: string }>(
    db.prepare('SELECT id FROM user_accounts WHERE phone = ?').get(cleanPhone),
  );
  if (existingPhone) {
    throw new UserAuthError('PHONE_EXISTS', 'เบอร์โทรศัพท์นี้ถูกใช้งานแล้วในระบบ', 409);
  }

  const userId = `u_${randomBytes(9).toString('base64url')}`;
  const deviceKey = generateDeviceKey();
  const timestamp = now.toISOString();
  const pwdHash = hashPassword(params.password);
  const locale = isLang(params.locale) ? params.locale : 'en';

  db.prepare(
    'INSERT INTO users (id, display_name, locale, created_at) VALUES (?, ?, ?, ?)',
  ).run(userId, cleanName, locale, timestamp);

  db.prepare(
    `INSERT INTO user_accounts (id, email, phone, password_hash, account_type, business_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(userId, cleanEmail, cleanPhone, pwdHash, accountType, cleanBusiness, timestamp, timestamp);

  db.prepare(
    'INSERT INTO device_keys (key_hash, user_id, label, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
  ).run(hashToken(deviceKey), userId, accountType === 'operator' ? 'Operator Console Device' : 'Mobile Device', timestamp, timestamp);

  ensureWallet(db, userId);
  grantOpeningBalance(db, userId);

  return {
    userId,
    deviceKey,
    name: cleanName,
    email: cleanEmail,
    phone: cleanPhone,
    accountType,
    businessName: cleanBusiness,
  };
}

export interface LoginUserParams {
  identifier: string;
  password: string;
  label?: string;
  accountType?: AccountType;
}

/**
 * Authenticate an existing user by email or phone and password.
 */
export function loginUser(
  db: DB,
  params: LoginUserParams,
  now = new Date(),
): AuthSuccessResult {
  const cleanId = params.identifier ? params.identifier.trim() : '';
  if (!cleanId || !params.password) {
    throw new UserAuthError('INVALID_CREDENTIALS', 'อีเมล เบอร์โทรศัพท์ หรือรหัสผ่านไม่ถูกต้อง', 401);
  }

  const isEmail = cleanId.includes('@');
  let userRow: {
    id: string;
    display_name: string;
    password_hash: string;
    email: string;
    phone: string;
    account_type: AccountType;
    business_name: string | null;
  } | undefined;

  if (isEmail) {
    userRow = row<{
      id: string;
      display_name: string;
      password_hash: string;
      email: string;
      phone: string;
      account_type: AccountType;
      business_name: string | null;
    }>(
      db.prepare(`
        SELECT u.id, u.display_name, a.password_hash, a.email, a.phone, a.account_type, a.business_name
        FROM user_accounts a
        JOIN users u ON u.id = a.id
        WHERE lower(a.email) = ?
      `).get(cleanId.toLowerCase()),
    );
  } else {
    const cleanPhone = cleanId.replace(/[-\s]/g, '');
    userRow = row<{
      id: string;
      display_name: string;
      password_hash: string;
      email: string;
      phone: string;
      account_type: AccountType;
      business_name: string | null;
    }>(
      db.prepare(`
        SELECT u.id, u.display_name, a.password_hash, a.email, a.phone, a.account_type, a.business_name
        FROM user_accounts a
        JOIN users u ON u.id = a.id
      WHERE a.phone = ? OR lower(a.email) = ? OR lower(substr(a.email, 1, instr(a.email, '@') - 1)) = ?
      `).get(cleanPhone, cleanId.toLowerCase(), cleanId.toLowerCase()),
    );
  }

  if (!userRow) {
    throw new UserAuthError('INVALID_CREDENTIALS', 'อีเมล เบอร์โทรศัพท์ หรือรหัสผ่านไม่ถูกต้อง', 401);
  }

  const valid = verifyPassword(params.password, userRow.password_hash);
  if (!valid) {
    throw new UserAuthError('INVALID_CREDENTIALS', 'อีเมล เบอร์โทรศัพท์ หรือรหัสผ่านไม่ถูกต้อง', 401);
  }

  if (params.accountType && userRow.account_type && userRow.account_type !== params.accountType) {
    throw new UserAuthError(
      'ACCOUNT_TYPE_MISMATCH',
      params.accountType === 'operator'
        ? 'บัญชีนี้เป็นบัญชีนักท่องเที่ยว กรุณาเลือกเข้าสู่ระบบในฐานะนักท่องเที่ยว'
        : 'บัญชีนี้เป็นบัญชีผู้ประกอบการ กรุณาเลือกเข้าสู่ระบบในฐานะผู้ประกอบการ',
      400,
    );
  }

  const deviceKey = generateDeviceKey();
  const timestamp = now.toISOString();

  db.prepare(
    'INSERT INTO device_keys (key_hash, user_id, label, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
  ).run(hashToken(deviceKey), userRow.id, params.label ?? 'Mobile Device', timestamp, timestamp);

  return {
    userId: userRow.id,
    deviceKey,
    name: userRow.display_name,
    email: userRow.email,
    phone: userRow.phone,
    accountType: userRow.account_type ?? 'traveller',
    businessName: userRow.business_name ?? null,
  };
}
