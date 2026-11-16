/** Durable, deployment-wide quota for calls made with the shared Groq key. */

import type { DB } from './db.ts';
import { transact } from './db.ts';

export const DEFAULT_GROQ_REQUESTS_PER_MINUTE = 120;
const WINDOW_MS = 60_000;
const PROVIDER = 'groq';

export function groqRequestsPerMinute(env: Record<string, string | undefined>): number {
  const value = Number(env.GROQ_GLOBAL_REQUESTS_PER_MINUTE);
  return Number.isInteger(value) && value >= 1 && value <= 10_000
    ? value
    : DEFAULT_GROQ_REQUESTS_PER_MINUTE;
}

/**
 * Reserve one real upstream attempt atomically. Both Node SQLite and the one
 * Durable Object map `transact` to their writer-serialising transaction.
 */
export function takeGroqProviderQuota(
  db: DB,
  maxRequests: number,
  now = Date.now(),
): boolean {
  return transact(db, () => {
    const current = db.prepare(
      'SELECT window_started_at,used FROM concierge_provider_quota WHERE provider = ?',
    ).get(PROVIDER) as { window_started_at: number | bigint; used: number | bigint } | undefined;

    if (!current) {
      db.prepare(
        'INSERT INTO concierge_provider_quota(provider,window_started_at,used) VALUES(?,?,1)',
      ).run(PROVIDER, now);
      return true;
    }

    const startedAt = Number(current.window_started_at);
    if (now - startedAt >= WINDOW_MS) {
      db.prepare(
        'UPDATE concierge_provider_quota SET window_started_at = ?, used = 1 WHERE provider = ?',
      ).run(now, PROVIDER);
      return true;
    }
    if (Number(current.used) >= maxRequests) return false;
    db.prepare(
      'UPDATE concierge_provider_quota SET used = used + 1 WHERE provider = ?',
    ).run(PROVIDER);
    return true;
  });
}
