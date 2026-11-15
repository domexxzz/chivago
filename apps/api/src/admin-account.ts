/**
 * Provision a global ChivarGo administrator.
 *
 * The password is never stored: it goes through the same scrypt format as a
 * host console key. The username is separate so knowing another host's key
 * cannot accidentally turn that host into an administrator.
 */
import type { DB } from './db.ts';
import { hashApiKey } from './host-auth.ts';

export function upsertAdmin(
  db: DB,
  input: { username: string; password: string; now?: Date },
): { id: string; username: string } {
  const username = input.username.trim();
  if (username.length < 4 || username.length > 80) throw new Error('admin username must be 4-80 characters');
  if (input.password.length < 9) throw new Error('admin password must be at least 9 characters');
  const id = `admin:${username.toLocaleLowerCase('en-US')}`;
  db.prepare(
    `INSERT INTO hosts (id, name, type, role, created_at, console_username, api_key_hash)
     VALUES (?, ?, 'admin', 'admin', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, type='admin', role='admin', console_username=excluded.console_username,
       api_key_hash=excluded.api_key_hash`,
  ).run(id, username, (input.now ?? new Date()).toISOString(), username, hashApiKey(input.password));
  return { id, username };
}
