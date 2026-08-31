/**
 * Notifications: the outbox, and the in-app inbox.
 *
 * THE PATTERN AND WHY
 * A decision writes a notification row inside the SAME transaction that awards
 * the points. Sending happens separately, afterwards.
 *
 * That ordering matters. If the push were sent inline, a slow or down Expo
 * would make a municipal officer's approval hang or fail - and the approval is
 * the thing that must not fail. Recording first, sending second, means delivery
 * can be retried without ever putting the award at risk.
 *
 * The same rows are the app's inbox. A notification that exists only as a push
 * is a notification that can be lost - permission denied, token expired, phone
 * in a bag for a day - and "you were paid eight hours ago, we just never told
 * you" is the failure this whole feature exists to prevent.
 */

import { randomUUID } from 'node:crypto';
import {
  inQuietHours, isUrgentKind,
  isNotificationKind, renderNotification,
  type Bilingual, type NotificationKind,
} from '@chivago/core';
import { row, rows, type DB } from './db.ts';
import { isExpoPushToken, type PushMessage, type PushOutcome, type PushTransport } from './push/expo.ts';

/** Give up after this many tries. Roughly a day of backoff. */
export const MAX_ATTEMPTS = 6;

/**
 * Exponential backoff in minutes: 1, 4, 15, 60, 240.
 * A phone in airplane mode on a boat to Koh Taen comes back hours later, so the
 * tail is long; the head is short because most failures are a blip.
 */
const BACKOFF_MINUTES = [1, 4, 15, 60, 240];

export const backoffMs = (attempts: number): number =>
  (BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length - 1)] ?? 240) * 60_000;

export interface EnqueueInput {
  userId: string;
  kind: NotificationKind;
  params: Record<string, string | number>;
  /** Deep link target, e.g. { screen: 'quest', questId: 'q1' }. */
  data?: Record<string, unknown>;
  /**
   * Idempotency key. Deterministic for the real-world event, e.g.
   * `quest-approved:q1:u1` - NOT a random id, or a retried host callback
   * notifies twice.
   */
  dedupeKey: string;
  now?: Date;
}

export interface EnqueueResult {
  id: string | null;
  /** False when this dedupeKey was already queued. */
  created: boolean;
}

/**
 * Record a notification. Safe to call inside an outer transaction.
 *
 * Returns `created: false` rather than throwing on a duplicate: a repeated
 * delivery is normal operation, and the caller should carry on.
 */
export function enqueue(db: DB, input: EnqueueInput): EnqueueResult {
  const existing = row<{ id: string }>(
    db.prepare('SELECT id FROM notifications WHERE dedupe_key = ?').get(input.dedupeKey),
  );
  if (existing) return { id: existing.id, created: false };

  const id = randomUUID();
  db.prepare(
    `INSERT INTO notifications (id, user_id, kind, params, data, created_at, dedupe_key)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(
    id, input.userId, input.kind,
    JSON.stringify(input.params),
    JSON.stringify(input.data ?? {}),
    (input.now ?? new Date()).toISOString(),
    input.dedupeKey,
  );
  return { id, created: true };
}

// ---------------------------------------------------------------------------
// Device tokens
// ---------------------------------------------------------------------------

export class InvalidPushToken extends Error {
  constructor(token: string) {
    super(`not an Expo push token: ${token.slice(0, 24)}`);
    this.name = 'InvalidPushToken';
  }
}

/**
 * Register or refresh a device.
 *
 * Keyed on the token, not the user: a shared or resold phone can move between
 * users, and re-registering must move the token rather than notify the previous
 * owner. Re-registering also clears `disabled_at`, because the user just
 * granted permission again.
 */
export function registerDevice(
  db: DB,
  args: { userId: string; token: string; locale: string; platform?: string | null; now?: Date },
): void {
  if (!isExpoPushToken(args.token)) throw new InvalidPushToken(args.token);
  const now = (args.now ?? new Date()).toISOString();
  const locale = args.locale === 'th' ? 'th' : 'en';

  db.prepare(
    `INSERT INTO push_tokens (token, user_id, locale, platform, created_at, last_seen_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(token) DO UPDATE SET
       user_id = excluded.user_id,
       locale = excluded.locale,
       platform = excluded.platform,
       last_seen_at = excluded.last_seen_at,
       disabled_at = NULL`,
  ).run(args.token, args.userId, locale, args.platform ?? null, now, now);
}

/**
 * Stop sending to a device.
 *
 * PDPA: notification consent is revocable, and revoking must take effect
 * immediately. Disabled rather than deleted so a later re-grant is recognised
 * as the same device.
 */
export function disableDevice(db: DB, token: string, now = new Date()): void {
  db.prepare('UPDATE push_tokens SET disabled_at = ? WHERE token = ?').run(now.toISOString(), token);
}

/** Drop a token Expo told us no longer exists. */
export function forgetDevice(db: DB, token: string): void {
  db.prepare('DELETE FROM push_tokens WHERE token = ?').run(token);
}

interface TokenRow {
  token: string;
  locale: string;
}

export const devicesFor = (db: DB, userId: string): TokenRow[] =>
  rows<TokenRow>(
    db
      .prepare('SELECT token, locale FROM push_tokens WHERE user_id = ? AND disabled_at IS NULL')
      .all(userId),
  );

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

interface PendingRow {
  id: string;
  user_id: string;
  kind: string;
  params: string;
  data: string;
  attempts: number;
  created_at: string;
}

/**
 * Notifications waiting to go out, respecting backoff.
 *
 * Backoff is computed from `created_at` plus the accumulated delay rather than
 * from a stored `next_attempt_at`. One less column to keep consistent, and the
 * schedule is derivable from what already happened.
 */
export function pending(db: DB, now = new Date(), limit = 100): PendingRow[] {
  return rows<PendingRow>(
    db
      .prepare(
        `SELECT id, user_id, kind, params, data, attempts, created_at
         FROM notifications
         WHERE sent_at IS NULL AND attempts < ?
         ORDER BY created_at ASC, rowid ASC LIMIT ?`,
      )
      .all(MAX_ATTEMPTS, limit),
  ).filter((n) => {
    // Quiet hours, in ISLAND time. A quest approved at 03:00 can wait until
    // seven; waking somebody to tell them a moderator hid a review is how an
    // app gets its notifications turned off for ever.
    //
    // Tested on NOW rather than on when the row was written, so a retry at
    // 02:00 of something queued at 21:00 is held too.
    //
    // Nothing is dropped and no attempt is consumed - the row simply is not
    // eligible yet, and the in-app inbox has had it all along.
    if (!isUrgentKind(n.kind as NotificationKind) && inUserQuietHours(db, n.user_id, now)) {
      return false;
    }

    if (n.attempts === 0) return true;
    const waited = BACKOFF_MINUTES.slice(0, n.attempts)
      .reduce((acc, m) => acc + m, 0) * 60_000;
    return now.getTime() - new Date(n.created_at).getTime() >= waited;
  });
}

export interface DispatchSummary {
  considered: number;
  sent: number;
  retried: number;
  failed: number;
  /** Tokens Expo reported as gone, now removed. */
  pruned: number;
}

/**
 * Send whatever is due.
 *
 * Called after a decision and on a timer. Never throws - a dispatcher that
 * crashes on one bad row stops delivering for everybody.
 */
export async function dispatch(
  db: DB,
  transport: PushTransport,
  now = new Date(),
): Promise<DispatchSummary> {
  const due = pending(db, now);
  const summary: DispatchSummary = { considered: due.length, sent: 0, retried: 0, failed: 0, pruned: 0 };
  if (due.length === 0) return summary;

  // One flat batch across all notifications, so a hundred approvals after a
  // festival weekend cost one upstream request rather than a hundred.
  const messages: PushMessage[] = [];
  const messageOwner: string[] = [];
  const noDevice: string[] = [];

  for (const n of due) {
    if (!isNotificationKind(n.kind)) {
      // An unknown kind cannot be rendered and never will be. Fail it rather
      // than retrying six times.
      markFailed(db, n.id, `unknown notification kind: ${n.kind}`, now);
      summary.failed += 1;
      continue;
    }
    const devices = devicesFor(db, n.user_id);
    if (devices.length === 0) {
      // Nobody to push to. The row stays as the in-app inbox entry; marking it
      // sent stops it retrying forever for a user who never granted permission.
      noDevice.push(n.id);
      continue;
    }

    const params = JSON.parse(n.params) as Record<string, string | number>;
    const data = JSON.parse(n.data) as Record<string, unknown>;
    const rendered = renderNotification(n.kind, params);

    for (const device of devices) {
      const locale = device.locale === 'th' ? 'th' : 'en';
      messages.push({
        to: device.token,
        title: pick(rendered.title, locale),
        body: pick(rendered.body, locale),
        data: { ...data, notificationId: n.id },
        sound: 'default',
        channelId: 'default',
      });
      messageOwner.push(n.id);
    }
  }

  for (const id of noDevice) markSent(db, id, now);
  summary.sent += noDevice.length;

  if (messages.length === 0) return summary;

  const outcomes = await transport.send(messages);

  // A notification succeeds if ANY of the user's devices took it. Two phones
  // and one stale token should not read as a failure.
  const perNotification = new Map<string, PushOutcome[]>();
  outcomes.forEach((outcome, index) => {
    const id = messageOwner[index];
    if (!id) return;
    const list = perNotification.get(id) ?? [];
    list.push(outcome);
    perNotification.set(id, list);
  });

  for (const [id, results] of perNotification) {
    for (const r of results) {
      if (r.status === 'unregistered') {
        forgetDevice(db, r.token);
        summary.pruned += 1;
      }
    }
    if (results.some((r) => r.status === 'ok')) {
      markSent(db, id, now);
      summary.sent += 1;
      continue;
    }
    // Every device gone is a permanent outcome, not something to retry.
    if (results.every((r) => r.status === 'unregistered')) {
      markSent(db, id, now);
      summary.sent += 1;
      continue;
    }
    const permanent = results.every((r) => r.status === 'failed' || r.status === 'unregistered');
    const message = results.map((r) => ('message' in r ? r.message : r.status)).join('; ');
    if (permanent) {
      markFailed(db, id, message, now);
      summary.failed += 1;
    } else {
      bumpAttempt(db, id, message);
      summary.retried += 1;
    }
  }

  return summary;
}

const pick = (b: Bilingual, locale: 'th' | 'en'): string => (locale === 'th' ? b.th : b.en);

const markSent = (db: DB, id: string, now: Date): void => {
  db.prepare('UPDATE notifications SET sent_at = ?, last_error = NULL WHERE id = ?')
    .run(now.toISOString(), id);
};

const bumpAttempt = (db: DB, id: string, error: string): void => {
  db.prepare('UPDATE notifications SET attempts = attempts + 1, last_error = ? WHERE id = ?')
    .run(error.slice(0, 300), id);
};

/** Retire a notification that will never send. It stays visible in the inbox. */
const markFailed = (db: DB, id: string, error: string, now: Date): void => {
  db.prepare(
    'UPDATE notifications SET attempts = ?, last_error = ?, sent_at = ? WHERE id = ?',
  ).run(MAX_ATTEMPTS, error.slice(0, 300), now.toISOString(), id);
};

// ---------------------------------------------------------------------------
// The in-app inbox
// ---------------------------------------------------------------------------

export interface InboxItem {
  id: string;
  kind: NotificationKind;
  /** Rendered in BOTH languages, like everything else the app shows. */
  title: Bilingual;
  body: Bilingual;
  data: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
}

/**
 * What the app shows.
 *
 * Rendered bilingually here, unlike the push, which commits to the device's
 * one language. Inside the app there is room for both lines and the rest of the
 * product already works that way.
 */
export function inbox(db: DB, userId: string, limit = 50): InboxItem[] {
  return rows<{
    id: string; kind: string; params: string; data: string;
    created_at: string; read_at: string | null;
  }>(
    db
      .prepare(
        `SELECT id, kind, params, data, created_at, read_at
         FROM notifications WHERE user_id = ?
         -- rowid breaks the tie. Two notifications written in the same
         -- millisecond - a rejection immediately followed by an approval in a
         -- test, or two decisions in one batch - would otherwise come back in
         -- arbitrary order, and the inbox would reorder itself between reads.
         ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      )
      .all(userId, limit),
  )
    .filter((n) => isNotificationKind(n.kind))
    .map((n) => {
      const rendered = renderNotification(
        n.kind as NotificationKind,
        JSON.parse(n.params) as Record<string, string | number>,
      );
      return {
        id: n.id,
        kind: n.kind as NotificationKind,
        title: rendered.title,
        body: rendered.body,
        data: JSON.parse(n.data) as Record<string, unknown>,
        createdAt: n.created_at,
        readAt: n.read_at,
      };
    });
}

export const unreadCount = (db: DB, userId: string): number =>
  row<{ n: number }>(
    db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read_at IS NULL')
      .get(userId),
  )?.n ?? 0;

/** Mark one notification read. Scoped by user so an id alone is not enough. */
export function markRead(db: DB, userId: string, id: string, now = new Date()): void {
  db.prepare(
    'UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL',
  ).run(now.toISOString(), id, userId);
}

export function markAllRead(db: DB, userId: string, now = new Date()): void {
  db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL')
    .run(now.toISOString(), userId);
}

/**
 * A person's own quiet hours.
 *
 * The island default of 22:00-07:00 is right for most people and wrong for a
 * night-shift worker, and wrong again for someone who would rather be woken
 * than miss a quest result. NULL columns mean "use the default", so the setting
 * costs nothing for everybody who never touches it.
 *
 * Read per notification rather than cached: this runs a hundred times a tick at
 * most, and a stale cache here means waking somebody who asked not to be.
 */
export function inUserQuietHours(db: DB, userId: string, now: Date): boolean {
  const pref = row<{ quiet_enabled: number; quiet_from: number | null; quiet_until: number | null }>(
    db
      .prepare('SELECT quiet_enabled, quiet_from, quiet_until FROM profiles WHERE user_id = ?')
      .get(userId),
  );
  // No profile means no preference expressed, which is the default, not "off".
  if (!pref) return inQuietHours(now);
  if (pref.quiet_enabled === 0) return false;
  return inQuietHours(
    now,
    pref.quiet_from ?? undefined,
    pref.quiet_until ?? undefined,
  );
}

export interface QuietPreference {
  enabled: boolean;
  /** Island hour, 0-23. Null means the default. */
  from: number | null;
  until: number | null;
}

const validHour = (h: unknown): h is number =>
  typeof h === 'number' && Number.isInteger(h) && h >= 0 && h <= 23;

/**
 * Set a person's quiet hours.
 *
 * An out-of-range hour is dropped rather than rejected: this arrives from a
 * settings screen, and the worst outcome of ignoring nonsense is that they get
 * the default, which is what they had.
 */
export function setQuietPreference(
  db: DB,
  userId: string,
  pref: { enabled?: boolean; from?: unknown; until?: unknown },
): QuietPreference {
  db.prepare('INSERT OR IGNORE INTO profiles (user_id) VALUES (?)').run(userId);
  const enabled = pref.enabled === false ? 0 : 1;
  const from = validHour(pref.from) ? pref.from : null;
  const until = validHour(pref.until) ? pref.until : null;
  db.prepare(
    'UPDATE profiles SET quiet_enabled = ?, quiet_from = ?, quiet_until = ? WHERE user_id = ?',
  ).run(enabled, from, until, userId);
  return { enabled: enabled === 1, from, until };
}

export function getQuietPreference(db: DB, userId: string): QuietPreference {
  const pref = row<{ quiet_enabled: number; quiet_from: number | null; quiet_until: number | null }>(
    db
      .prepare('SELECT quiet_enabled, quiet_from, quiet_until FROM profiles WHERE user_id = ?')
      .get(userId),
  );
  if (!pref) return { enabled: true, from: null, until: null };
  return {
    enabled: pref.quiet_enabled === 1,
    from: pref.quiet_from,
    until: pref.quiet_until,
  };
}
