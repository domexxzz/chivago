/**
 * SOS dispatch.
 *
 * READ THIS BEFORE CHANGING ANYTHING HERE.
 *
 * ChivaGo is not an emergency service and cannot send an ambulance. Thailand's
 * emergency medical service is 1669; the tourist police line is 1155. Nothing
 * in this file replaces either, and the app must never let itself become the
 * reason somebody did not call one.
 *
 * What this can honestly do is get a person's live location in front of people
 * who can act, through every channel that actually works, and then report
 * truthfully which of those channels succeeded.
 *
 * THE RULE: never claim a delivery that did not happen.
 *
 * The prototype's panel says "Live location shared with 2 contacts" as fixed
 * copy, and the first version of this API stored `contacts_notified = 2`
 * regardless. In a safety feature that is not a harmless placeholder - it tells
 * someone in trouble that help was reached when nothing was sent. Every number
 * this module returns is counted from a real attempt.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { row, rows, transact, type DB } from './db.ts';
import { enqueue } from './notification-service.ts';

/**
 * How an alert can reach someone.
 *
 * `share_link` is the one that needs no provider account and no app on the
 * other end: the person sends it themselves through LINE, WhatsApp or SMS.
 * In Thailand that reaches further than any integration we could buy.
 */
export type DispatchChannel = 'push' | 'share_link' | 'operator' | 'sms';

export type DispatchStatus =
  | 'delivered'
  /** Queued through a channel whose delivery we cannot confirm. */
  | 'sent'
  /** The channel exists but is not configured in this deployment. */
  | 'unavailable'
  | 'failed';

export interface DispatchRecord {
  channel: DispatchChannel;
  target: string;
  targetLabel: string;
  status: DispatchStatus;
  detail: string | null;
  attemptedAt: string;
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string | null;
  relationship: string | null;
  /** Set when the contact is also a ChivaGo user and can be pushed. */
  linkedUserId: string | null;
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

/**
 * Thai mobile numbers are 10 digits starting 0, or +66 followed by 9.
 * Kept permissive: a number we cannot parse is still worth storing, because the
 * user can read it off the screen and dial it themselves.
 */
export function normalisePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '');
  if (digits.length < 8) return null;
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `+66${digits.slice(1)}`;
  return digits;
}

export function listContacts(db: DB, userId: string): EmergencyContact[] {
  return rows<{
    id: string; name: string; phone: string | null;
    relationship: string | null; linked_user_id: string | null;
  }>(
    db
      .prepare(
        `SELECT id, name, phone, relationship, linked_user_id
         FROM emergency_contacts WHERE user_id = ? ORDER BY created_at`,
      )
      .all(userId),
  ).map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    relationship: r.relationship,
    linkedUserId: r.linked_user_id,
  }));
}

export function addContact(
  db: DB,
  args: { userId: string; name: string; phone?: string; relationship?: string; linkedUserId?: string },
): EmergencyContact {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO emergency_contacts
       (id, user_id, name, phone, relationship, linked_user_id, created_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(
    id, args.userId, args.name.trim(),
    args.phone ? normalisePhone(args.phone) : null,
    args.relationship ?? null,
    args.linkedUserId ?? null,
    new Date().toISOString(),
  );
  return listContacts(db, args.userId).find((c) => c.id === id)!;
}

export function removeContact(db: DB, userId: string, contactId: string): void {
  // Scoped by user: a contact id alone must not be enough to edit someone
  // else's emergency list.
  db.prepare('DELETE FROM emergency_contacts WHERE id = ? AND user_id = ?').run(contactId, userId);
}

// ---------------------------------------------------------------------------
// Firing an alert
// ---------------------------------------------------------------------------

export interface SosAlertRecord {
  id: string;
  userId: string;
  status: 'dispatching' | 'acknowledged' | 'resolved' | 'cancelled';
  /**
   * NULL when the phone had no fix to give - permission refused, GPS dead.
   * The first version substituted a fixed point on the island, so the desk
   * drew a confident pin at Bophut for somebody who could have been anywhere.
   * An unknown position is a fact the desk needs; a made-up one is a lie it
   * cannot detect.
   */
  lat: number | null;
  lng: number | null;
  locationLabel: string;
  firedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
  nearestHospital: string;
  note: string | null;
  /** The public live-location URL. Share this, not the alert id. */
  shareUrl: string;
  lastPositionAt: string | null;
  /** Every delivery attempt, so the app can report what actually happened. */
  dispatches: DispatchRecord[];
  /** Counted, never asserted. */
  contactsReached: number;
  contactsTotal: number;
}

export const publicBase = (): string =>
  process.env.CHIVAGO_PUBLIC_URL ?? 'http://localhost:8787';

/**
 * The share token.
 *
 * 32 bytes of CSPRNG. This URL shows a person's live location to anyone holding
 * it, with no authentication - a family member abroad cannot be asked to create
 * an account mid-emergency - so unguessability is the entire access control.
 */
const newShareToken = (): string => randomBytes(32).toString('base64url');

interface AlertRow {
  id: string; user_id: string; status: string; lat: number; lng: number;
  location_label: string; fired_at: string; resolved_at: string | null;
  nearest_hospital: string; acknowledged_at: string | null;
  acknowledged_by: string | null; share_token: string | null;
  last_lat: number | null; last_lng: number | null; last_position_at: string | null;
  note: string | null;
}

function dispatchesFor(db: DB, alertId: string): DispatchRecord[] {
  return rows<{
    channel: string; target: string; target_label: string;
    status: string; detail: string | null; attempted_at: string;
  }>(
    db
      .prepare(
        `SELECT channel, target, target_label, status, detail, attempted_at
         FROM sos_dispatch WHERE alert_id = ? ORDER BY attempted_at, rowid`,
      )
      .all(alertId),
  ).map((d) => ({
    channel: d.channel as DispatchChannel,
    target: d.target,
    targetLabel: d.target_label,
    status: d.status as DispatchStatus,
    detail: d.detail,
    attemptedAt: d.attempted_at,
  }));
}

function toAlert(db: DB, r: AlertRow): SosAlertRecord {
  const dispatches = dispatchesFor(db, r.id);
  const contactChannels = dispatches.filter((d) => d.channel === 'push' || d.channel === 'sms');
  return {
    id: r.id,
    userId: r.user_id,
    status: r.status as SosAlertRecord['status'],
    // The LATEST known position, falling back to where it was fired.
    lat: r.last_lat ?? r.lat,
    lng: r.last_lng ?? r.lng,
    locationLabel: r.location_label,
    firedAt: r.fired_at,
    acknowledgedAt: r.acknowledged_at,
    acknowledgedBy: r.acknowledged_by,
    resolvedAt: r.resolved_at,
    nearestHospital: r.nearest_hospital,
    note: r.note,
    shareUrl: r.share_token ? `${publicBase()}/sos/live/${r.share_token}` : '',
    lastPositionAt: r.last_position_at,
    dispatches,
    contactsReached: contactChannels.filter(
      (d) => d.status === 'delivered' || d.status === 'sent',
    ).length,
    contactsTotal: contactChannels.length,
  };
}

export function activeAlert(db: DB, userId: string): SosAlertRecord | null {
  const r = row<AlertRow>(
    db
      .prepare(
        `SELECT * FROM sos_alerts
         WHERE user_id = ? AND status IN ('dispatching','acknowledged')
         ORDER BY fired_at DESC LIMIT 1`,
      )
      .get(userId),
  );
  return r ? toAlert(db, r) : null;
}

export function alertByShareToken(db: DB, token: string): SosAlertRecord | null {
  const r = row<AlertRow>(db.prepare('SELECT * FROM sos_alerts WHERE share_token = ?').get(token));
  return r ? toAlert(db, r) : null;
}

/** Is an SMS provider wired up in this deployment? */
export const smsConfigured = (): boolean =>
  Boolean(process.env.CHIVAGO_SMS_PROVIDER && process.env.CHIVAGO_SMS_KEY);

const logDispatch = (
  db: DB,
  alertId: string,
  d: Omit<DispatchRecord, 'attemptedAt'> & { attemptedAt?: string },
): void => {
  db.prepare(
    `INSERT INTO sos_dispatch
       (id, alert_id, channel, target, target_label, status, detail, attempted_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).run(
    randomUUID(), alertId, d.channel, d.target, d.targetLabel, d.status,
    d.detail, d.attemptedAt ?? new Date().toISOString(),
  );
};

export interface FireInput {
  userId: string;
  /** Null when the phone could not say. Never substitute a default. */
  lat: number | null;
  lng: number | null;
  locationLabel: string;
  nearestHospital?: string;
  /** Optional free text from the user, e.g. "motorbike accident". */
  note?: string | null;
  now?: Date;
}

/**
 * Fire an alert and fan it out.
 *
 * Re-firing while one is live returns the SAME alert rather than opening a
 * second. Two dispatches for one emergency is worse than none - it splits
 * whatever attention there is - and a frightened person taps more than once.
 */
export function fireAlert(db: DB, input: FireInput): SosAlertRecord {
  const existing = activeAlert(db, input.userId);
  if (existing) return existing;

  const now = (input.now ?? new Date()).toISOString();
  const id = randomUUID();
  const token = newShareToken();

  const alert = transact(db, () => {
    db.prepare(
      `INSERT INTO sos_alerts
         (id, user_id, status, lat, lng, location_label, fired_at, nearest_hospital,
          contacts_notified, interpreter_joining, share_token,
          last_lat, last_lng, last_position_at, note)
       VALUES (?,?,'dispatching',?,?,?,?,?,0,1,?,?,?,?,?)`,
    ).run(
      id, input.userId, input.lat, input.lng, input.locationLabel, now,
      input.nearestHospital ?? 'Bangkok Hospital Samui',
      token, input.lat, input.lng, input.lat === null ? null : now, input.note ?? null,
    );

    const contacts = listContacts(db, input.userId);

    // -- Channel 1: the share link ----------------------------------------
    // Always available. No provider, no account, no app on the other end. The
    // user sends it themselves through whatever messenger they already use,
    // which in Thailand means LINE.
    logDispatch(db, id, {
      channel: 'share_link',
      target: token,
      targetLabel: 'Live location link',
      status: 'delivered',
      detail: 'Ready to share. The link shows live position until the alert ends.',
      attemptedAt: now,
    });

    // -- Channel 2: push to contacts who are also users --------------------
    for (const contact of contacts) {
      if (contact.linkedUserId && !listsBack(db, contact.linkedUserId, input.userId)) {
        // A linked user who has NOT listed this traveller as their own
        // contact never agreed to be woken at 03:00 by them. Anyone could
        // type anyone's user id here, and without this rule that was a way
        // to push an emergency at a stranger through their quiet hours. The
        // row is recorded as unavailable - with the reason - rather than
        // skipped, so the traveller knows this contact was NOT reached.
        logDispatch(db, id, {
          channel: 'push',
          target: contact.id,
          targetLabel: contact.name,
          status: 'unavailable',
          detail: 'They have not added you as a contact in their app, so nothing is pushed to them — send them the link.',
          attemptedAt: now,
        });
        continue;
      }
      if (contact.linkedUserId) {
        enqueue(db, {
          userId: contact.linkedUserId,
          kind: 'sos_contact_alerted',
          params: { name: displayNameOf(db, input.userId), where: input.locationLabel },
          data: { screen: 'sos', shareToken: token },
          dedupeKey: `sos:${id}:contact:${contact.id}`,
          now: input.now,
        });
        logDispatch(db, id, {
          channel: 'push',
          target: contact.id,
          targetLabel: contact.name,
          status: 'sent',
          detail: 'Push queued to their ChivaGo app.',
          attemptedAt: now,
        });
        continue;
      }

      // -- Channel 3: SMS -------------------------------------------------
      // Recorded as UNAVAILABLE when no provider is configured, and surfaced
      // that way in the app. Silently skipping would leave the user believing
      // their family had been told.
      logDispatch(db, id, {
        channel: 'sms',
        target: contact.id,
        targetLabel: contact.name,
        status: smsConfigured() ? 'sent' : 'unavailable',
        detail: smsConfigured()
          ? 'SMS queued.'
          : 'No SMS provider configured — send the link yourself.',
        attemptedAt: now,
      });
    }

    // -- Channel 4: the duty operator --------------------------------------
    // Always logged so the operator console has the alert. Whether a human is
    // actually watching is an operational fact this software cannot assert.
    logDispatch(db, id, {
      channel: 'operator',
      target: 'duty-desk',
      targetLabel: 'ChivaGo duty desk',
      status: 'sent',
      detail: 'Visible in the operator console. Not yet acknowledged.',
      attemptedAt: now,
    });

    return activeAlert(db, input.userId)!;
  });

  return alert;
}

/**
 * Has `linkedUserId` listed `userId` as one of THEIR emergency contacts?
 *
 * Consent, in the only form this pilot can record it: two people who each
 * put the other on their list have agreed to hear from each other in an
 * emergency. One side alone is a claim about somebody else.
 */
export const listsBack = (db: DB, linkedUserId: string, userId: string): boolean =>
  row<{ n: number }>(
    db.prepare(
      'SELECT 1 AS n FROM emergency_contacts WHERE user_id = ? AND linked_user_id = ? LIMIT 1',
    ).get(linkedUserId, userId),
  ) !== undefined;

/** Contacts of `userId` who use the app AND have listed them back. */
export function pushableContacts(db: DB, userId: string): EmergencyContact[] {
  return listContacts(db, userId).filter(
    (c) => c.linkedUserId !== null && listsBack(db, c.linkedUserId, userId),
  );
}

export const displayNameOf = (db: DB, userId: string): string =>
  row<{ display_name: string }>(
    db.prepare('SELECT display_name FROM users WHERE id = ?').get(userId),
  )?.display_name ?? 'A ChivaGo traveller';

// ---------------------------------------------------------------------------
// Live position, acknowledgement, resolution
// ---------------------------------------------------------------------------

/**
 * Update the position of a live alert.
 *
 * Someone in trouble may be moving - walking to a road, being carried, on the
 * back of a pickup. A dispatch panel frozen at the firing position sends help
 * to where they were, not where they are.
 */
export function updatePosition(
  db: DB,
  userId: string,
  pos: { lat: number; lng: number },
  now = new Date(),
): SosAlertRecord | null {
  const alert = activeAlert(db, userId);
  if (!alert) return null;
  db.prepare(
    'UPDATE sos_alerts SET last_lat = ?, last_lng = ?, last_position_at = ? WHERE id = ?',
  ).run(pos.lat, pos.lng, now.toISOString(), alert.id);
  return activeAlert(db, userId);
}

/**
 * A duty operator picks the alert up.
 *
 * This is the only thing that changes an alert from "sent into the system" to
 * "a named human has seen it", and the app says exactly that. Until it happens
 * the panel must not imply anyone is on the way.
 */
export function acknowledgeAlert(
  db: DB,
  alertId: string,
  operator: string,
  now = new Date(),
): SosAlertRecord | null {
  const r = row<AlertRow>(db.prepare('SELECT * FROM sos_alerts WHERE id = ?').get(alertId));
  if (!r || (r.status !== 'dispatching' && r.status !== 'acknowledged')) return null;

  transact(db, () => {
    db.prepare(
      `UPDATE sos_alerts SET status = 'acknowledged', acknowledged_at = ?, acknowledged_by = ?
       WHERE id = ? AND acknowledged_at IS NULL`,
    ).run(now.toISOString(), operator, alertId);

    db.prepare(
      `UPDATE sos_dispatch SET status = 'delivered', detail = ?
       WHERE alert_id = ? AND channel = 'operator'`,
    ).run(`Acknowledged by ${operator}.`, alertId);

    // Tell the person in trouble that a human has them. This is the single
    // most reassuring thing the system can send.
    enqueue(db, {
      userId: r.user_id,
      kind: 'sos_acknowledged',
      params: { operator },
      data: { screen: 'safety' },
      dedupeKey: `sos-ack:${alertId}`,
      now,
    });
  });

  const updated = row<AlertRow>(db.prepare('SELECT * FROM sos_alerts WHERE id = ?').get(alertId));
  return updated ? toAlert(db, updated) : null;
}

/** The user stands the alert down. */
export function cancelAlert(db: DB, userId: string, now = new Date()): void {
  db.prepare(
    `UPDATE sos_alerts SET status = 'cancelled', resolved_at = ?
     WHERE user_id = ? AND status IN ('dispatching','acknowledged')`,
  ).run(now.toISOString(), userId);
}

/** An operator closes it out. */
export function resolveAlert(db: DB, alertId: string, operator: string, now = new Date()): void {
  db.prepare(
    `UPDATE sos_alerts SET status = 'resolved', resolved_at = ?, acknowledged_by = COALESCE(acknowledged_by, ?)
     WHERE id = ? AND status IN ('dispatching','acknowledged')`,
  ).run(now.toISOString(), operator, alertId);
}

/** Every live alert, for the operator console. Oldest first - longest waiting. */
export function liveAlerts(db: DB): SosAlertRecord[] {
  return rows<AlertRow>(
    db
      .prepare(
        `SELECT * FROM sos_alerts WHERE status IN ('dispatching','acknowledged')
         ORDER BY fired_at ASC`,
      )
      .all(),
  ).map((r) => toAlert(db, r));
}

export function recentAlerts(db: DB, limit = 50): SosAlertRecord[] {
  return rows<AlertRow>(
    db.prepare('SELECT * FROM sos_alerts ORDER BY fired_at DESC LIMIT ?').all(limit),
  ).map((r) => toAlert(db, r));
}

/**
 * What the share link exposes.
 *
 * Deliberately minimal. Anyone holding the URL sees it, so it carries the one
 * thing a family member needs - where this person is - and nothing else about
 * them. No quest history, no points, no other trips.
 */
export interface PublicAlertView {
  status: SosAlertRecord['status'];
  name: string;
  /** Null while live if the phone gave no fix; null once the alert ends. */
  lat: number | null;
  lng: number | null;
  locationLabel: string;
  firedAt: string;
  lastPositionAt: string | null;
  acknowledgedBy: string | null;
  nearestHospital: string;
  note: string | null;
  /** Dead once the alert ends, so an old link cannot track someone forever. */
  live: boolean;
}

export function publicView(db: DB, token: string): PublicAlertView | null {
  const alert = alertByShareToken(db, token);
  if (!alert) return null;
  const live = alert.status === 'dispatching' || alert.status === 'acknowledged';
  return {
    status: alert.status,
    name: displayNameOf(db, alert.userId),
    // A resolved alert stops reporting position. The link showed where someone
    // was during an emergency; it is not a permanent tracker. Null, not 0:
    // (0, 0) is a real place in the Gulf of Guinea.
    lat: live ? alert.lat : null,
    lng: live ? alert.lng : null,
    locationLabel: live ? alert.locationLabel : '',
    firedAt: alert.firedAt,
    lastPositionAt: live ? alert.lastPositionAt : null,
    acknowledgedBy: alert.acknowledgedBy,
    nearestHospital: alert.nearestHospital,
    note: live ? alert.note : null,
    live,
  };
}
