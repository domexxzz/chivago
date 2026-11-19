/**
 * Turning a Google account into a traveller on this server.
 *
 * The same four outcomes as LINE, for the same reasons - READ line-identity.ts.
 * In short: 'clash' refuses rather than merges, because merging two travellers
 * means reconciling the wallet and the ledger, and adding two balances without
 * an entry that explains the total would break the one record an auditor is
 * asked to trust.
 *
 * A traveller may hold a LINE identity AND a Google identity; each table binds
 * its own subject to a user and neither knows about the other. That is two
 * ways in, not two travellers.
 *
 * What is stored is Google's `sub` and nothing else - no email, no name - which
 * is all the `openid` scope returns and all a sign-in needs.
 */

import type { DB } from './db.ts';
import { hasHistory, type LineOutcome } from './line-identity.ts';

export type GoogleOutcome = LineOutcome;

export interface GoogleResolution {
  outcome: GoogleOutcome;
  /** The traveller to sign in as. Null only on a clash, where nobody is signed in. */
  userId: string | null;
  /** On a clash, the traveller the phone was already signed in as. */
  deviceUserId?: string;
  /** On a clash, the traveller the Google account already belongs to. */
  googleUserId?: string;
}

/** The traveller a Google account already names, or null. */
export function userForGoogleSub(db: DB, sub: string): string | null {
  const r = db.prepare('SELECT user_id FROM google_identities WHERE google_sub = ?').get(sub) as { user_id: string } | undefined;
  return r ? r.user_id : null;
}

/**
 * Bind a Google account to a traveller and say what happened.
 *
 * `deviceUserId` is the traveller the phone was already signed in as, or null
 * for a phone with no key yet. `createUser` is only called when there is
 * nobody to sign in as.
 */
export function resolveGoogleSignIn(
  db: DB,
  sub: string,
  deviceUserId: string | null,
  createUser: () => string,
  now = new Date(),
): GoogleResolution {
  const known = userForGoogleSub(db, sub);

  if (known) {
    if (!deviceUserId || deviceUserId === known) return { outcome: 'signed-in', userId: known };
    if (!hasHistory(db, deviceUserId)) return { outcome: 'signed-in', userId: known };
    return { outcome: 'clash', userId: null, deviceUserId, googleUserId: known };
  }

  const userId = deviceUserId ?? createUser();
  db.prepare('INSERT INTO google_identities (google_sub, user_id, created_at) VALUES (?, ?, ?)')
    .run(sub, userId, now.toISOString());
  return { outcome: deviceUserId ? 'linked' : 'created', userId };
}
