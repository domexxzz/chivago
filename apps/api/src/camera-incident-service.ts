/**
 * Incidents reported by a camera's AI.
 *
 * READ THIS BEFORE CHANGING ANYTHING HERE.
 *
 * This is the first thing in ChivarGo that accepts a write from a machine
 * rather than from a person. The partner is Sentiara AI, whose detector runs
 * on a box on Ko Sichang; their answers to our 26 questions are recorded in
 * docs/sentiara-integration-questions.md and the numbered answers cited below
 * are from that file. Four of them decided the whole design:
 *
 * ANSWER 16 - THE MEASURED FALSE-ALARM RATE IS 62% (18 of 29), and that was a
 * test house, not the island, with an uncalibrated confidence score (answer
 * 14). So nothing here dispatches anybody. An incident lands in a queue and
 * waits for a human; `escalation-service.ts` is not wired to this and must not
 * be until the island's own rate is known. Hand an officer a pager that is
 * wrong two times in three and within a fortnight they stop answering it -
 * which is the failure mode that kills the system quietly, with every test
 * still green.
 *
 * ANSWER 8 - THE IMAGERY STAYS ON THEIR BOX. We receive a signed link that
 * stops working after 24 hours. The whole platform is one Durable Object with
 * a 10 GB ceiling, and SQLITE_FULL stops every write on the platform, not just
 * the table that grew, so camera imagery was never going to live here.
 *
 * ANSWER 5 - THEIR `incidentId` MERGES REPEATS INSIDE A 10-MINUTE WINDOW and
 * they flagged the seam themselves: something still happening when one window
 * ends gets a fresh id in the next. Unmerged, a car parked across the pier
 * becomes a new job every ten minutes, and the queue - which is a person's
 * attention - fills with one car.
 *
 * ANSWER 3 - AUTHENTICATION IS AN HMAC OVER THE RAW BODY. That lives in
 * `incident-signature.ts`; this file assumes the caller is already proven and
 * worries only about what they said.
 *
 * The honesty rule from `sos-service.ts` applies here unchanged: a decision a
 * human made and a report that actually reached Sentiara are two different
 * facts, stored in two different columns, and the desk may only claim the one
 * that happened.
 */

import { transact, type DB } from './db.ts';
import { signatureFor, unixSeconds } from './incident-signature.ts';

/** A payload that is not something we are willing to store. */
export class InvalidIncident extends Error {}

/** A kind of detection ChivarGo refuses to hold, whatever the sender says. */
export class ForbiddenIncidentKind extends Error {}

/** This incident id is already on file. Their outbox reads the 409 as sent. */
export class IncidentAlreadyStored extends Error {}

/** No incident with that id. */
export class UnknownIncident extends Error {}

/**
 * What a human can decide about an incident, in Sentiara's own vocabulary
 * (answer 6) so the value travels back to them unchanged.
 */
export type IncidentOutcome = 'confirmed' | 'false_alarm' | 'duplicate' | 'unresolved';

const OUTCOMES: readonly IncidentOutcome[] = ['confirmed', 'false_alarm', 'duplicate', 'unresolved'];

/** Everything a queue row needs, with the evidence reduced to one word. */
export interface QueuedIncident {
  id: string;
  kind: string;
  cameraId: string;
  cameraOwner: string | null;
  lat: number | null;
  lng: number | null;
  confidence: number | null;
  description: string;
  observedAt: string;
  receivedAt: string;
  /** 'none' before their evidence proxy exists, 'expired' after 24 hours. */
  evidence: EvidenceState;
}

/**
 * The three honest answers to "can I see the picture?".
 *
 * 'none' is the normal case today: Sentiara has not built the proxy that makes
 * their links reachable from outside, so incidents arrive with an empty
 * evidence array. A desk that renders a broken image for this is telling the
 * officer there is proof.
 */
export type EvidenceState = 'none' | 'available' | 'expired';

interface ParsedEvidence {
  kind: string;
  ref: string;
  expiresAt: string | null;
}

interface ParsedIncident {
  id: string;
  source: string;
  kind: string;
  detectorVersion: string | null;
  cameraId: string;
  cameraOwner: string | null;
  lat: number | null;
  lng: number | null;
  locationAccuracy: string | null;
  confidence: number | null;
  provenance: string;
  description: string;
  observedAt: string;
  evidence: ParsedEvidence[];
}

/**
 * Kinds that are refused in code, not in configuration.
 *
 * Sentiara does not do plate reading and blocks it on their side (answer 15),
 * and we have no lawful basis to hold plate data: nobody has yet said who the
 * data controller is under the PDPA (answer 23). Two independent refusals are
 * the right number for a capability that would be a reportable incident if it
 * arrived by accident, and the regex catches the renaming that a well-meaning
 * integrator does at three in the morning.
 */
const FORBIDDEN_KIND = /plate|licen[cs]e|\banpr\b|\blpr\b/i;

const ID_PATTERN = /^[A-Za-z0-9_.:-]{8,128}$/;
const KIND_PATTERN = /^[A-Za-z0-9_.-]{2,64}$/;

/** Longest description we will store. Theirs are one templated sentence. */
const DESCRIPTION_LIMIT = 500;

/** Most evidence links one incident may carry. */
const EVIDENCE_LIMIT = 8;

/**
 * How long after an open incident a later one on the same camera is treated as
 * the same event, in seconds.
 *
 * Thirty minutes by default, which is three of Sentiara's windows: wide enough
 * to swallow the seam in answer 5, narrow enough that a genuinely new event an
 * hour later is still a new job.
 */
const mergeWindowSec = (): number => {
  const raw = Number(process.env.CHIVAGO_SENTIARA_MERGE_SEC ?? 1800);
  return Number.isFinite(raw) && raw >= 0 ? raw : 1800;
};

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** An ISO instant, normalised to UTC, or null when it is not one. */
function instant(v: unknown): string | null {
  const text = str(v);
  if (!text) return null;
  const at = new Date(text);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/**
 * Turn whatever arrived on the wire into something we are prepared to store.
 *
 * Strict at the boundary and nowhere else: every later function in this file
 * may assume a `ParsedIncident` is sane. Offsets are normalised to UTC here
 * because `observed_at` is compared as a string when merging, and
 * '…T14:02:11+07:00' sorts as if it were two in the afternoon UTC.
 */
export function parseIncident(raw: unknown): ParsedIncident {
  if (typeof raw !== 'object' || raw === null) throw new InvalidIncident('The body is not an object.');
  const body = raw as Record<string, unknown>;

  const id = str(body.incidentId);
  if (!id || !ID_PATTERN.test(id)) throw new InvalidIncident('incidentId is missing or malformed.');

  const kind = str(body.kind);
  if (!kind || !KIND_PATTERN.test(kind)) throw new InvalidIncident('kind is missing or malformed.');
  if (FORBIDDEN_KIND.test(kind)) {
    throw new ForbiddenIncidentKind(`ChivarGo does not accept "${kind}" detections.`);
  }

  const observedAt = instant(body.observedAt);
  if (!observedAt) throw new InvalidIncident('observedAt is missing or not a timestamp.');

  const camera = (typeof body.camera === 'object' && body.camera !== null ? body.camera : {}) as Record<string, unknown>;
  const cameraId = str(camera.id);
  if (!cameraId) throw new InvalidIncident('camera.id is missing.');

  const confidence = finite(body.confidence);
  if (body.confidence !== undefined && (confidence === null || confidence < 0 || confidence > 1)) {
    throw new InvalidIncident('confidence must be a number between 0 and 1.');
  }

  const description = str(body.description) ?? kind;

  /*
    `verified` is read and deliberately dropped. Sentiara sends false today,
    but a sending system claiming that a human confirmed something is a claim
    we cannot check, and treating it as a review would put "confirmed" on a
    desk with nobody's name against it. Confirmation happens here or not at all.
  */
  return {
    id,
    source: str(body.source) ?? 'sentiara',
    kind,
    detectorVersion: str(body.detectorVersion),
    cameraId,
    cameraOwner: str(camera.owner),
    ...coordinates(body, camera),
    confidence,
    provenance: str(body.provenance)?.slice(0, 32) ?? 'ai_estimate',
    description: description.slice(0, DESCRIPTION_LIMIT),
    observedAt,
    evidence: parseEvidence(body.evidence),
  };
}

/**
 * Where the incident was, preferring the incident's own fix over the camera's.
 *
 * Both are optional and stay null when absent. A camera nobody recorded the
 * position of still gets to report; the desk says "position unknown", and the
 * one thing it must never do is draw a pin in the Gulf of Guinea.
 */
function coordinates(
  body: Record<string, unknown>,
  camera: Record<string, unknown>,
): { lat: number | null; lng: number | null; locationAccuracy: string | null } {
  const location = (typeof body.location === 'object' && body.location !== null ? body.location : {}) as Record<string, unknown>;
  const lat = finite(location.lat) ?? finite(camera.lat);
  const lng = finite(location.lng) ?? finite(camera.lng);
  const usable = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  return {
    lat: usable ? lat : null,
    lng: usable ? lng : null,
    locationAccuracy: str(location.accuracy),
  };
}

/** Evidence links, or an empty list - which is today's normal case. */
function parseEvidence(raw: unknown): ParsedEvidence[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new InvalidIncident('evidence must be an array.');
  if (raw.length > EVIDENCE_LIMIT) throw new InvalidIncident('Too many evidence links.');

  return raw.map((item) => {
    const entry = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    const ref = str(entry.ref);
    // https only. An evidence link is opened by a person looking at a console
    // over TLS, and a plaintext one both breaks that page and hands the link -
    // which is the entire credential - to anybody on the path.
    if (!ref || !ref.startsWith('https://') || ref.length > 2048) {
      throw new InvalidIncident('Each evidence entry needs an https ref.');
    }
    const kind = str(entry.kind) ?? 'image';
    if (!KIND_PATTERN.test(kind)) throw new InvalidIncident('Malformed evidence kind.');
    return { kind, ref, expiresAt: instant(entry.expiresAt) };
  });
}

/** What storing an incident did, in the words the route replies with. */
export interface IncidentReceipt {
  incidentId: string;
  /** The earlier incident this was folded into, when it was. */
  mergedInto: string | null;
  /** Always 'unreviewed'. Said out loud so no caller infers we acted. */
  reviewState: 'unreviewed';
  evidence: EvidenceState;
}

/**
 * Store an incident, or refuse it.
 *
 * Throws `IncidentAlreadyStored` when the id is on file, which the route turns
 * into a 409 - the one non-2xx status Sentiara's outbox reads as delivered, so
 * a duplicate stops being retried instead of being retried for 24 hours.
 */
export function receiveCameraIncident(db: DB, raw: unknown, now = new Date()): IncidentReceipt {
  const incident = parseIncident(raw);
  const dedupeKey = `${incident.cameraId}|${incident.kind.toLowerCase()}`;

  return transact(db, () => {
    const seen = db.prepare('SELECT id FROM camera_incidents WHERE id = ?').get(incident.id);
    if (seen) throw new IncidentAlreadyStored(`${incident.id} is already on file.`);

    const mergedInto = openIncidentFor(db, dedupeKey, incident.observedAt);
    insertIncident(db, incident, dedupeKey, mergedInto, now);
    insertEvidence(db, incident);

    return {
      incidentId: incident.id,
      mergedInto,
      reviewState: 'unreviewed' as const,
      evidence: evidenceStateOf(incident.evidence, now),
    };
  });
}

/**
 * The open incident on this camera that a new report belongs to, if any.
 *
 * Measured from the LAST report on that camera, not from the job it belongs
 * to, and then resolved to that job. The difference is the whole point: a car
 * that sits across the pier for two hours reports every ten minutes, so each
 * report is minutes from the previous one and hours from the first. Comparing
 * against the job would open a fresh one every half hour and hand the officer
 * the same car four times.
 *
 * `merged_into` therefore always names the job itself - the chain is flat, one
 * hop deep - so a desk reading that column never has to walk anything. The
 * loop in `rootOf` is there because a flat chain is an invariant this function
 * maintains, not one the database enforces.
 *
 * Returns null once a person has looked: a reviewed incident is closed, and
 * the next report on that camera is genuinely news.
 */
function openIncidentFor(db: DB, dedupeKey: string, observedAt: string): string | null {
  const since = new Date(new Date(observedAt).getTime() - mergeWindowSec() * 1000).toISOString();
  const latest = db
    .prepare(
      `SELECT id, merged_into AS mergedInto FROM camera_incidents
        WHERE dedupe_key = ? AND observed_at >= ? AND observed_at <= ?
        ORDER BY observed_at DESC LIMIT 1`,
    )
    .get(dedupeKey, since, observedAt) as { id: string; mergedInto: string | null } | undefined;
  if (!latest) return null;

  const root = rootOf(db, latest.mergedInto ?? latest.id);
  const state = db
    .prepare('SELECT review_state AS reviewState FROM camera_incidents WHERE id = ?')
    .get(root) as { reviewState: string } | undefined;
  return state?.reviewState === 'unreviewed' ? root : null;
}

/** Follow `merged_into` to the job at the end of it. */
function rootOf(db: DB, id: string, hops = 10): string {
  let current = id;
  for (let i = 0; i < hops; i += 1) {
    const row = db
      .prepare('SELECT merged_into AS mergedInto FROM camera_incidents WHERE id = ?')
      .get(current) as { mergedInto: string | null } | undefined;
    if (!row?.mergedInto) return current;
    current = row.mergedInto;
  }
  return current;
}

function insertIncident(
  db: DB,
  incident: ParsedIncident,
  dedupeKey: string,
  mergedInto: string | null,
  now: Date,
): void {
  db.prepare(
    `INSERT INTO camera_incidents (
       id, source, kind, detector_version, camera_id, camera_owner, lat, lng,
       location_accuracy, confidence, provenance, description, observed_at,
       received_at, dedupe_key, review_state, merged_into)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'unreviewed',?)`,
  ).run(
    incident.id, incident.source, incident.kind, incident.detectorVersion,
    incident.cameraId, incident.cameraOwner, incident.lat, incident.lng,
    incident.locationAccuracy, incident.confidence, incident.provenance,
    incident.description, incident.observedAt, now.toISOString(), dedupeKey, mergedInto,
  );
}

function insertEvidence(db: DB, incident: ParsedIncident): void {
  const stmt = db.prepare(
    `INSERT INTO camera_incident_evidence (incident_id, position, kind, ref, expires_at)
     VALUES (?,?,?,?,?)`,
  );
  incident.evidence.forEach((item, position) => {
    stmt.run(incident.id, position, item.kind, item.ref, item.expiresAt);
  });
}

/**
 * One word for a pile of links.
 *
 * 'expired' only when every link has expired: one live link is still evidence.
 */
export function evidenceStateOf(
  evidence: readonly { expiresAt: string | null }[],
  now = new Date(),
): EvidenceState {
  if (evidence.length === 0) return 'none';
  const live = evidence.some((item) => item.expiresAt === null || new Date(item.expiresAt) > now);
  return live ? 'available' : 'expired';
}

interface IncidentRow {
  id: string;
  kind: string;
  camera_id: string;
  camera_owner: string | null;
  lat: number | null;
  lng: number | null;
  confidence: number | null;
  description: string;
  observed_at: string;
  received_at: string;
}

/**
 * The queue a person works through, newest first.
 *
 * Folded incidents are left out: they are on file, they are not a second job.
 * Confidence is returned for ordering by eye, never applied as a cutoff here -
 * answer 14 says the score is not calibrated, so a threshold would be a
 * guess wearing a number's clothes.
 */
export function pendingIncidents(db: DB, limit = 50, now = new Date()): QueuedIncident[] {
  const rows = db
    .prepare(
      `SELECT id, kind, camera_id, camera_owner, lat, lng, confidence, description,
              observed_at, received_at
         FROM camera_incidents
        WHERE review_state = 'unreviewed' AND merged_into IS NULL
        ORDER BY observed_at DESC LIMIT ?`,
    )
    .all(Math.max(1, Math.min(limit, 200))) as unknown as IncidentRow[];

  const evidence = db.prepare(
    'SELECT expires_at AS expiresAt FROM camera_incident_evidence WHERE incident_id = ?',
  );

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    cameraId: row.camera_id,
    cameraOwner: row.camera_owner,
    lat: row.lat,
    lng: row.lng,
    confidence: row.confidence,
    description: row.description,
    observedAt: row.observed_at,
    receivedAt: row.received_at,
    evidence: evidenceStateOf(evidence.all(row.id) as unknown as { expiresAt: string | null }[], now),
  }));
}

/**
 * Record what a person decided.
 *
 * Writes the decision and NOTHING about reporting it: `outcome_sent_at` is the
 * job of `sendPendingOutcomes`, and only a call that actually succeeded may
 * set it. A re-review is allowed and resets the reporting state, because a
 * corrected decision is worth telling them about too.
 */
export function reviewIncident(
  db: DB,
  id: string,
  outcome: IncidentOutcome,
  reviewedBy: string,
  now = new Date(),
): void {
  if (!OUTCOMES.includes(outcome)) throw new InvalidIncident(`"${outcome}" is not an outcome.`);
  const changed = db
    .prepare(
      `UPDATE camera_incidents
          SET review_state = ?, reviewed_by = ?, reviewed_at = ?,
              outcome_sent_at = NULL, outcome_attempts = 0, outcome_error = NULL
        WHERE id = ?`,
    )
    .run(outcome, reviewedBy, now.toISOString(), id);
  if (Number(changed.changes ?? 0) === 0) throw new UnknownIncident(`No incident ${id}.`);
}

/**
 * How the island is actually doing, counted from decisions people made.
 *
 * `falseAlarmRate` is null until somebody has reviewed something. The number
 * we have from Sentiara is 62% from a test house (answer 16); this is the
 * instrument that replaces it with Ko Sichang's own, and a rate invented from
 * zero reviews would be worse than no rate at all.
 */
export function incidentCounts(db: DB): {
  unreviewed: number;
  reviewed: number;
  falseAlarm: number;
  merged: number;
  awaitingReport: number;
  falseAlarmRate: number | null;
} {
  const one = (sql: string, ...args: unknown[]): number =>
    Number((db.prepare(sql).get(...args) as { n: number } | undefined)?.n ?? 0);

  const unreviewed = one(
    "SELECT COUNT(*) AS n FROM camera_incidents WHERE review_state = 'unreviewed' AND merged_into IS NULL",
  );
  const reviewed = one("SELECT COUNT(*) AS n FROM camera_incidents WHERE review_state <> 'unreviewed'");
  const falseAlarm = one("SELECT COUNT(*) AS n FROM camera_incidents WHERE review_state = 'false_alarm'");

  return {
    unreviewed,
    reviewed,
    falseAlarm,
    merged: one('SELECT COUNT(*) AS n FROM camera_incidents WHERE merged_into IS NOT NULL'),
    awaitingReport: one(
      "SELECT COUNT(*) AS n FROM camera_incidents WHERE review_state <> 'unreviewed' AND outcome_sent_at IS NULL",
    ),
    falseAlarmRate: reviewed === 0 ? null : falseAlarm / reviewed,
  };
}

/** One decision, on its way back to Sentiara. */
export interface OutcomeReport {
  incidentId: string;
  outcome: IncidentOutcome;
  reviewedAt: string;
}

export interface OutcomeTransport {
  /**
   * Returns null when no callback URL is configured for this deployment.
   * Null and false are different facts - "nobody wired it up" and "it failed" -
   * and the desk shows which one happened.
   */
  send(report: OutcomeReport): Promise<boolean | null>;
}

/** Whether this deployment can report decisions back at all. */
export const outcomeConfigured = (): boolean =>
  Boolean(process.env.CHIVAGO_SENTIARA_OUTCOME_URL && process.env.CHIVAGO_SENTIARA_SECRET);

/**
 * The real callback: a signed POST to Sentiara's `/v1/incidents/outcome`.
 *
 * Signed with the same construction they use on the way in, under our own
 * header names (answer 6). Their endpoint answers 409 when a decision is
 * already recorded and refuses to let a later signature overwrite an earlier
 * one, so a 409 here means "they have it" and counts as delivered.
 */
export function outcomeTransport(timeoutMs = 6000): OutcomeTransport {
  return {
    async send(report: OutcomeReport): Promise<boolean | null> {
      const url = process.env.CHIVAGO_SENTIARA_OUTCOME_URL;
      const secret = process.env.CHIVAGO_SENTIARA_SECRET;
      if (!url || !secret) return null;

      const body = JSON.stringify(report);
      const timestamp = String(unixSeconds());
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-chivargo-timestamp': timestamp,
            'x-chivargo-signature': signatureFor(secret, timestamp, body),
          },
          body,
          signal: ctl.signal,
        });
        return res.ok || res.status === 409;
      } catch {
        // Never throws. The row keeps `outcome_sent_at` null and the next
        // sweep tries again; a failed callback must not break the desk.
        return false;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * Report every decision that has not reached Sentiara yet.
 *
 * Returns what happened, counted from attempts actually made. `skipped` is for
 * a deployment with no callback URL: those rows are not failures and must not
 * be reported as retries.
 */
export async function sendPendingOutcomes(
  db: DB,
  transport: OutcomeTransport,
  limit = 20,
  now = new Date(),
): Promise<{ sent: number; failed: number; skipped: number }> {
  const rows = db
    .prepare(
      `SELECT id, review_state AS outcome, reviewed_at AS reviewedAt
         FROM camera_incidents
        WHERE review_state <> 'unreviewed' AND outcome_sent_at IS NULL
        ORDER BY reviewed_at ASC LIMIT ?`,
    )
    .all(Math.max(1, Math.min(limit, 100))) as unknown as
    { id: string; outcome: IncidentOutcome; reviewedAt: string }[];

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    const delivered = await transport.send({
      incidentId: row.id,
      outcome: row.outcome,
      reviewedAt: row.reviewedAt,
    });

    if (delivered === null) {
      skipped += 1;
      continue;
    }
    if (delivered) {
      db.prepare(
        `UPDATE camera_incidents
            SET outcome_sent_at = ?, outcome_attempts = outcome_attempts + 1, outcome_error = NULL
          WHERE id = ?`,
      ).run(now.toISOString(), row.id);
      sent += 1;
    } else {
      db.prepare(
        `UPDATE camera_incidents
            SET outcome_attempts = outcome_attempts + 1, outcome_error = ?
          WHERE id = ?`,
      ).run('callback failed', row.id);
      failed += 1;
    }
  }

  return { sent, failed, skipped };
}
