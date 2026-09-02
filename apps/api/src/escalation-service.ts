/**
 * SOS escalation.
 *
 * WHAT ESCALATION MEANS HERE, AND WHAT IT DOES NOT
 *
 * An alert fires, lands on the duty desk, and nobody looks. Before this, that
 * failure was silent: the traveller's app said "nobody has picked this up yet"
 * indefinitely, and the system kept waiting.
 *
 * The instinct is to escalate INWARDS - find another operator, page harder, try
 * more of our own channels. That is the wrong instinct. ChivaGo cannot send
 * help, so an escalation ladder that only searches inside ChivaGo is a ladder
 * that leads nowhere.
 *
 * The most valuable thing this system can do when its own channel has
 * demonstrably failed is TELL THE PERSON so they use the one that works. Every
 * rung below is built around moving them toward 1669, not around finding
 * someone here.
 *
 * The desk and the on-call webhook still fire, because a human who can act
 * should get the chance. But they are not what the ladder is for.
 */

import { randomUUID } from 'node:crypto';
import { row, rows, transact, type DB } from './db.ts';
import { enqueue } from './notification-service.ts';
import { listContacts, liveAlerts, type SosAlertRecord, displayNameOf } from './sos-service.ts';
import type { OncallTransport } from './push/webhook.ts';

export type Rung = 'nudge_1' | 'oncall' | 'nudge_2';

export interface RungDefinition {
  rung: Rung;
  /** Seconds after firing, while still unacknowledged. */
  afterSeconds: number;
  description: string;
}

/**
 * The ladder.
 *
 * Two minutes is deliberately short. In an ordinary product it would be
 * impatient; in an emergency, two minutes of silence is a long time, and the
 * cost of nudging early is one notification while the cost of nudging late is
 * measured in something else entirely.
 *
 * Overridable per deployment, because a desk staffed 24/7 by three people can
 * reasonably wait longer than one covered by a single duty phone.
 */
export const LADDER: RungDefinition[] = [
  {
    rung: 'nudge_1',
    afterSeconds: Number(process.env.CHIVAGO_ESCALATE_NUDGE_1 ?? 120),
    description: 'Tell the traveller nobody has answered, and re-alert their contacts.',
  },
  {
    rung: 'oncall',
    afterSeconds: Number(process.env.CHIVAGO_ESCALATE_ONCALL ?? 300),
    description: 'Page the on-call webhook and flag the alert on the desk.',
  },
  {
    rung: 'nudge_2',
    afterSeconds: Number(process.env.CHIVAGO_ESCALATE_NUDGE_2 ?? 600),
    description: 'Final, blunter push toward 1669.',
  },
];

/** Which rungs are due for an alert that has been unacknowledged this long. */
export function dueRungs(alert: SosAlertRecord, now: Date, alreadyFired: Set<string>): Rung[] {
  // Escalation exists to break silence. Once a named human has the alert, or it
  // is over, there is nothing left to escalate.
  if (alert.status !== 'dispatching') return [];

  const elapsed = (now.getTime() - new Date(alert.firedAt).getTime()) / 1000;
  return LADDER
    .filter((r) => elapsed >= r.afterSeconds && !alreadyFired.has(r.rung))
    .map((r) => r.rung);
}

export const minutesOpen = (alert: SosAlertRecord, now: Date): number =>
  Math.max(1, Math.round((now.getTime() - new Date(alert.firedAt).getTime()) / 60_000));

export function firedRungs(db: DB, alertId: string): Set<string> {
  return new Set(
    rows<{ rung: string }>(
      db.prepare('SELECT rung FROM sos_escalations WHERE alert_id = ?').all(alertId),
    ).map((r) => r.rung),
  );
}

export interface EscalationOutcome {
  alertId: string;
  rung: Rung;
  travellerNotified: boolean;
  contactsRenotified: number;
  oncallPaged: boolean | null;
  detail: string;
}

// ---------------------------------------------------------------------------
// Firing a rung
// ---------------------------------------------------------------------------

const mapsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

/**
 * Fire one rung, once.
 *
 * The INSERT into sos_escalations happens first and carries a UNIQUE
 * constraint, so a second ticker - or a tick that overlaps a slow one - cannot
 * double-fire. Claiming the rung before doing the work is the whole guard.
 */
export async function fireRung(
  db: DB,
  alert: SosAlertRecord,
  rung: Rung,
  oncall: OncallTransport,
  now = new Date(),
): Promise<EscalationOutcome | null> {
  const claimed = claimRung(db, alert.id, rung, now);
  if (!claimed) return null;

  const minutes = minutesOpen(alert, now);
  const outcome: EscalationOutcome = {
    alertId: alert.id,
    rung,
    travellerNotified: false,
    contactsRenotified: 0,
    oncallPaged: null,
    detail: '',
  };

  if (rung === 'nudge_1' || rung === 'nudge_2') {
    // The point of the ladder. Tell them our channel has not worked, and name
    // the number that does.
    enqueue(db, {
      userId: alert.userId,
      kind: rung === 'nudge_1' ? 'sos_unacknowledged' : 'sos_still_unacknowledged',
      params: { minutes },
      data: { screen: 'safety' },
      dedupeKey: `sos-escalate:${alert.id}:${rung}`,
      now,
    });
    outcome.travellerNotified = true;
  }

  if (rung === 'nudge_1') {
    // Re-alert contacts who use the app. The first push may have arrived while
    // their phone was face-down on a table.
    for (const contact of listContacts(db, alert.userId)) {
      if (!contact.linkedUserId) continue;
      enqueue(db, {
        userId: contact.linkedUserId,
        kind: 'sos_contact_escalated',
        // The traveller's NAME. The template reads "{name}'s alert has been
        // open {minutes} min"; the first version put the location label here,
        // so a mother was told that "Chaweng, 120 m's alert" was unanswered.
        params: { name: displayNameOf(db, alert.userId), minutes },
        data: { screen: 'sos', shareToken: alert.shareUrl.split('/').pop() ?? '' },
        dedupeKey: `sos-escalate:${alert.id}:${rung}:${contact.id}`,
        now,
      });
      outcome.contactsRenotified += 1;
    }
  }

  if (rung === 'oncall') {
    outcome.oncallPaged = await oncall.page({
      text:
        `SOS unacknowledged for ${minutes} min — ${alert.locationLabel}. ` +
        `Nobody has picked it up on the ChivaGo desk.`,
      alertId: alert.id,
      locationLabel: alert.locationLabel,
      lat: alert.lat,
      lng: alert.lng,
      minutesOpen: minutes,
      mapsUrl: mapsUrl(alert.lat, alert.lng),
      liveUrl: alert.shareUrl,
      deskUrl: `${publicBaseUrl()}/console/sos`,
    });
  }

  outcome.detail = describeOutcome(outcome);
  db.prepare('UPDATE sos_escalations SET outcome = ? WHERE alert_id = ? AND rung = ?')
    .run(JSON.stringify(outcome), alert.id, rung);
  return outcome;
}

const publicBaseUrl = (): string => process.env.CHIVAGO_PUBLIC_URL ?? 'http://localhost:8787';

/**
 * Claim a rung. Returns false if it was already fired.
 * The UNIQUE (alert_id, rung) constraint is what makes this safe under
 * concurrent ticks; the catch is the expected path, not an error case.
 */
function claimRung(db: DB, alertId: string, rung: Rung, now: Date): boolean {
  try {
    return transact(db, () => {
      db.prepare(
        'INSERT INTO sos_escalations (id, alert_id, rung, fired_at) VALUES (?,?,?,?)',
      ).run(randomUUID(), alertId, rung, now.toISOString());
      return true;
    });
  } catch {
    return false;
  }
}

function describeOutcome(o: EscalationOutcome): string {
  const parts: string[] = [];
  if (o.travellerNotified) parts.push('traveller told nobody has answered');
  if (o.contactsRenotified > 0) parts.push(`${o.contactsRenotified} contact(s) re-alerted`);
  if (o.oncallPaged === true) parts.push('on-call paged');
  if (o.oncallPaged === false) parts.push('on-call page FAILED');
  if (o.oncallPaged === null && o.rung === 'oncall') parts.push('no on-call webhook configured');
  return parts.join(' · ') || 'nothing to do';
}

// ---------------------------------------------------------------------------
// The ticker
// ---------------------------------------------------------------------------

export interface SweepSummary {
  alertsChecked: number;
  rungsFired: number;
  outcomes: EscalationOutcome[];
}

/**
 * Check every live alert and fire whatever is due.
 *
 * Called on a 30-second timer. Never throws: an escalation sweep that dies on
 * one malformed alert stops escalating for everybody, and the whole point of
 * this module is that silence gets broken.
 */
export async function sweep(
  db: DB,
  oncall: OncallTransport,
  now = new Date(),
): Promise<SweepSummary> {
  const alerts = liveAlerts(db);
  const summary: SweepSummary = { alertsChecked: alerts.length, rungsFired: 0, outcomes: [] };

  for (const alert of alerts) {
    try {
      const due = dueRungs(alert, now, firedRungs(db, alert.id));
      for (const rung of due) {
        const outcome = await fireRung(db, alert, rung, oncall, now);
        if (outcome) {
          summary.rungsFired += 1;
          summary.outcomes.push(outcome);
        }
      }
    } catch (err) {
      console.error('[chivago] escalation failed for alert', alert.id, err);
    }
  }

  return summary;
}

/** Escalation history for one alert, for the desk and the incident record. */
export interface EscalationRecord {
  rung: Rung;
  firedAt: string;
  detail: string;
}

export function escalationsFor(db: DB, alertId: string): EscalationRecord[] {
  return rows<{ rung: string; fired_at: string; outcome: string }>(
    db
      .prepare(
        'SELECT rung, fired_at, outcome FROM sos_escalations WHERE alert_id = ? ORDER BY fired_at',
      )
      .all(alertId),
  ).map((r) => {
    let detail = '';
    try {
      detail = (JSON.parse(r.outcome) as EscalationOutcome).detail ?? '';
    } catch {
      detail = '';
    }
    return { rung: r.rung as Rung, firedAt: r.fired_at, detail };
  });
}

/**
 * How long an alert has gone unanswered, in seconds. Drives the desk's ranking
 * so the one nobody has touched sits at the top.
 */
export function unansweredSeconds(alert: SosAlertRecord, now = new Date()): number {
  if (alert.status !== 'dispatching') return 0;
  return Math.floor((now.getTime() - new Date(alert.firedAt).getTime()) / 1000);
}

/** Has this alert passed a rung without anyone acknowledging it? */
export const isEscalated = (db: DB, alertId: string): boolean =>
  (row<{ n: number }>(
    db.prepare('SELECT COUNT(*) n FROM sos_escalations WHERE alert_id = ?').get(alertId),
  )?.n ?? 0) > 0;
