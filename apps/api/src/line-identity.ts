/**
 * Turning a LINE account into a traveller on this server.
 *
 * Four outcomes, and the fourth is the one that matters.
 *
 *   'signed-in'  this LINE account is already a traveller here. Nothing is
 *                written; a link code is issued for the user it names.
 *   'linked'     the phone was already signed in and this LINE account was
 *                not known. The two are bound and NOTHING moves: it is the
 *                same traveller gaining a second way in.
 *   'created'    neither was known. A new traveller is made.
 *   'clash'      the phone belongs to one traveller and the LINE account to
 *                another, and both have a history. NOTHING is written.
 *
 * WHY 'clash' REFUSES RATHER THAN MERGES. Merging two travellers means
 * reconciling thirty-three tables that reference `users(id)`, and two of them
 * are the wallet and the ledger - the record an auditor is asked to trust.
 * Adding two balances without a ledger entry that explains where the total
 * came from would break that claim silently. So this says so and stops, and
 * the traveller keeps both accounts until a merge exists that can be audited.
 *
 * On the day LINE login opens, 'clash' cannot happen: no LINE account is bound
 * to anybody yet. It becomes possible later, when somebody signs in with a
 * LINE account they already used on another phone that has its own progress.
 */

import type { DB } from './db.ts';

export type LineOutcome = 'signed-in' | 'linked' | 'created' | 'clash';

export interface LineResolution {
  outcome: LineOutcome;
  /** The traveller to sign in as. Null only on a clash, where nobody is signed in. */
  userId: string | null;
  /** On a clash, the traveller the phone was already signed in as. */
  deviceUserId?: string;
  /** On a clash, the traveller the LINE account already belongs to. */
  lineUserId?: string;
}

const row = <T>(v: unknown): T | null => (v === undefined ? null : v as T);

/** The traveller a LINE account already names, or null. */
export function userForLineSub(db: DB, sub: string): string | null {
  const r = row<{ user_id: string }>(
    db.prepare('SELECT user_id FROM line_identities WHERE line_sub = ?').get(sub),
  );
  return r ? r.user_id : null;
}

/**
 * Whether a traveller has anything worth keeping. A brand-new row is not a history.
 * Exported because google-identity.ts applies the same clash rule.
 */
export function hasHistory(db: DB, userId: string): boolean {
  const n = row<{ n: number }>(
    db.prepare('SELECT COUNT(*) AS n FROM ledger WHERE user_id = ?').get(userId),
  );
  return (n?.n ?? 0) > 0;
}

/**
 * Bind a LINE account to a traveller and say what happened.
 *
 * `deviceUserId` is the traveller the phone was already signed in as, or null
 * for a phone with no key yet. `createUser` makes a fresh traveller and is
 * only called when there is nobody to sign in as.
 */
export function resolveLineSignIn(
  db: DB,
  sub: string,
  deviceUserId: string | null,
  createUser: () => string,
  now = new Date(),
): LineResolution {
  const known = userForLineSub(db, sub);

  if (known) {
    // The LINE account is somebody here already.
    if (!deviceUserId || deviceUserId === known) return { outcome: 'signed-in', userId: known };
    // Two different travellers. If the phone's one has nothing, there is
    // nothing to lose by signing in as the LINE one.
    if (!hasHistory(db, deviceUserId)) return { outcome: 'signed-in', userId: known };
    return { outcome: 'clash', userId: null, deviceUserId, lineUserId: known };
  }

  // The LINE account is new here.
  const userId = deviceUserId ?? createUser();
  db.prepare(
    'INSERT INTO line_identities (line_sub, user_id, created_at) VALUES (?, ?, ?)',
  ).run(sub, userId, now.toISOString());
  return { outcome: deviceUserId ? 'linked' : 'created', userId };
}
