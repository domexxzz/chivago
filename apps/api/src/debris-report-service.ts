/**
 * Taking a traveller's debris report in: check it, place it, keep it.
 *
 * The rules are in packages/core/src/debris-report.ts and are not restated
 * here. This file owns the order things happen in, because the order is where
 * the privacy promise lives:
 *
 *   1. read the answers and refuse bad input before anything is written;
 *   2. check the photograph is an image by its own bytes, still in memory;
 *   3. count this person's last hour, refused reports included;
 *   4. triage - and only a report that joins or opens a case has its
 *      photograph written to storage. A refused photograph never touches the
 *      blob store, so there is nothing to forget to delete later.
 *
 * NOTHING HERE TOUCHES A WALLET OR THE LEDGER. That is the first rule on the
 * triage board and the test file checks it after every verdict.
 */

import { randomUUID } from 'node:crypto';
import {
  DEBRIS_CASE_PREFIX, DEBRIS_REPORTS_PER_HOUR, debrisAreaOf, debrisCaseMonth, debrisCaseNumber,
  readDebrisReport, triageDebrisReport,
  type DebrisAccess, type DebrisAmount, type DebrisCaseStatus, type DebrisKind, type DebrisProblem,
  type DebrisRejectReason, type DebrisReportInput, type DebrisReportView, type OpenDebrisCase,
} from '@chivago/core';
import { blobStore } from './blob-store.ts';
import { row, rows, transact, type DB } from './db.ts';
import { sniff } from './uploads.ts';

export type DebrisReportErrorCode = 'INVALID_REPORT' | 'PHOTO_REQUIRED' | 'TOO_MANY_REPORTS';

export class DebrisReportError extends Error {
  readonly code: DebrisReportErrorCode;
  readonly status: 400 | 429;
  readonly problems: DebrisProblem[] | null;

  constructor(code: DebrisReportErrorCode, message: string, problems: DebrisProblem[] | null = null) {
    super(message);
    this.name = 'DebrisReportError';
    this.code = code;
    this.status = code === 'TOO_MANY_REPORTS' ? 429 : 400;
    this.problems = problems;
  }
}

export interface DebrisSubmission {
  userId: string;
  raw: { position?: unknown; takenAt?: unknown; kinds?: unknown; amount?: unknown; access?: unknown };
  photo: Buffer | null;
}

const HOUR_MS = 60 * 60_000;

/* ------------------------------------------------------------------ in -- */

export async function submitDebrisReport(db: DB, input: DebrisSubmission, now = new Date()): Promise<DebrisReportView> {
  const read = readDebrisReport(input.raw, now);
  if (!read.ok) {
    throw new DebrisReportError('INVALID_REPORT', `Check these answers: ${read.problems.join(', ')}.`, read.problems);
  }
  if (!input.photo || input.photo.length === 0) {
    throw new DebrisReportError('PHOTO_REQUIRED', 'A report needs the photograph of what you saw.');
  }
  // Throws UnsupportedUpload for anything that is not a JPEG, PNG or WebP.
  const { mime, ext } = sniff(input.photo);

  refuseOverCap(db, input.userId, now);

  const report = read.value;
  const area = debrisAreaOf(report);
  const first = triageDebrisReport(report, area ? openCasesIn(db, area) : [], now);
  const reportId = randomUUID();

  // No await between the cap and this insert, so a refusal cannot race itself.
  if (first.verdict === 'rejected') {
    insertReport(db, { reportId, userId: input.userId, report, now, caseId: null, verdict: 'rejected', rejectReason: first.reason, photo: null });
    return viewOf(db, input.userId, reportId)!;
  }
  // Triage refuses anything with no island, so this only guards the types.
  if (!area) throw new Error('Triage accepted a report on no island.');

  // The bytes land first, and only a successful write gets a row - see uploads.ts.
  const photoPath = `debris/${reportId.slice(0, 2)}/${reportId}.${ext}`;
  await blobStore().put(photoPath, input.photo);
  try {
    /*
      EVERYTHING READ BEFORE THE AWAIT IS READ AGAIN HERE. Another report can
      be written while the photograph uploads: two people at one pile in the
      same second both triaged `opened` against an empty island and made two
      cases, and twelve parallel posts all passed a cap that had counted none
      of them. Triage is pure and cheap, so it runs again on the cases as they
      now stand. Only `opened` and `merged` can come back - the refusals
      depend on the report alone, not on the queue.
    */
    transact(db, () => {
      refuseOverCap(db, input.userId, now);
      const placed = triageDebrisReport(report, openCasesIn(db, area), now);
      if (placed.verdict === 'rejected') throw new Error(`Triage refused on the second pass (${placed.reason}) what it accepted on the first.`);
      const caseId = placed.verdict === 'merged'
        ? joinCase(db, placed.caseId, report.takenAt)
        : openCase(db, placed.area, report, now);
      insertReport(db, {
        reportId, userId: input.userId, report, now, caseId,
        verdict: placed.verdict, rejectReason: null, photo: { path: photoPath, mime },
      });
    });
  } catch (err) {
    await blobStore().delete(photoPath).catch(() => undefined);
    throw err;
  }
  return viewOf(db, input.userId, reportId)!;
}

/** Refused reports count: a phone sending eleven piles from Si Racha is not reporting rubbish either. */
function refuseOverCap(db: DB, userId: string, now: Date): void {
  const lastHour = row<{ n: number }>(db.prepare(
    'SELECT COUNT(*) AS n FROM debris_reports WHERE user_id = ? AND submitted_at > ?',
  ).get(userId, new Date(now.getTime() - HOUR_MS).toISOString()))?.n ?? 0;
  if (lastHour >= DEBRIS_REPORTS_PER_HOUR) {
    throw new DebrisReportError('TOO_MANY_REPORTS', `At most ${DEBRIS_REPORTS_PER_HOUR} reports an hour.`);
  }
}

function openCasesIn(db: DB, area: string): OpenDebrisCase[] {
  return rows<{ id: string; lat: number; lng: number; last_report_at: string }>(db.prepare(
    `SELECT id, lat, lng, last_report_at FROM debris_cases
     WHERE area = ? AND status IN ('open','assigned')`,
  ).all(area)).map((c) => ({ id: c.id, lat: c.lat, lng: c.lng, lastReportAt: c.last_report_at }));
}

/** Keep the case's window on its newest report, so a pile reported all morning stays one case. */
function joinCase(db: DB, caseId: string, takenAt: string): string {
  db.prepare('UPDATE debris_cases SET last_report_at = MAX(last_report_at, ?) WHERE id = ?').run(takenAt, caseId);
  return caseId;
}

const openCase = (db: DB, area: string, report: DebrisReportInput, now: Date): string =>
  openDebrisCase(db, area, report, report.takenAt, now);

/** What a follow-up case carries over from the part-collection that opened it. */
export interface DebrisCarried {
  followUpOf: string;
  amount: DebrisAmount;
  access: DebrisAccess;
  reporters: number;
}

/**
 * A new case, numbered next in its island's month. Shared by the report that
 * finds a new pile and the part-collection that leaves one behind; call it
 * inside the transaction that writes whatever points at the case.
 */
export function openDebrisCase(
  db: DB, area: string, at: { lat: number; lng: number }, lastReportAt: string, now: Date, carried: DebrisCarried | null = null,
): string {
  const prefix = DEBRIS_CASE_PREFIX[area as keyof typeof DEBRIS_CASE_PREFIX];
  if (!prefix) throw new Error(`No case prefix for ${area}: a case was opened on an island that takes no reports.`);
  const month = `${prefix}-${debrisCaseMonth(now)}-`;
  // From the highest number used, not the count: a gap must never hand out a
  // number that is already taken. By value, so 10000 sorts after 9999.
  const seq = (row<{ n: number | null }>(db.prepare(
    'SELECT MAX(CAST(substr(number, ?) AS INTEGER)) AS n FROM debris_cases WHERE number LIKE ?',
  ).get(month.length + 1, `${month}%`))?.n ?? 0) + 1;
  const id = randomUUID();
  db.prepare(
    `INSERT INTO debris_cases
       (id, number, area, lat, lng, status, opened_at, last_report_at, follow_up_of, carried_amount, carried_access, carried_reporters)
     VALUES (?,?,?,?,?,'open',?,?,?,?,?,?)`,
  ).run(
    id, debrisCaseNumber(prefix, now, seq), area, at.lat, at.lng, now.toISOString(), lastReportAt,
    carried?.followUpOf ?? null, carried?.amount ?? null, carried?.access ?? null, carried?.reporters ?? null,
  );
  return id;
}

function insertReport(db: DB, a: {
  reportId: string; userId: string; report: DebrisReportInput; now: Date; caseId: string | null;
  verdict: 'opened' | 'merged' | 'rejected'; rejectReason: DebrisRejectReason | null;
  photo: { path: string; mime: string } | null;
}): void {
  db.prepare(
    `INSERT INTO debris_reports
       (id, user_id, case_id, lat, lng, accuracy_m, taken_at, submitted_at, kinds, amount, access,
        verdict, reject_reason, photo_path, photo_mime)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    a.reportId, a.userId, a.caseId, a.report.lat, a.report.lng, a.report.accuracyM, a.report.takenAt,
    a.now.toISOString(), JSON.stringify(a.report.kinds), a.report.amount, a.report.access,
    a.verdict, a.rejectReason, a.photo?.path ?? null, a.photo?.mime ?? null,
  );
}

/* ----------------------------------------------------------------- out -- */

interface ReportRow {
  id: string;
  submitted_at: string;
  taken_at: string;
  kinds: string;
  amount: DebrisAmount;
  access: DebrisAccess;
  verdict: 'opened' | 'merged' | 'rejected';
  reject_reason: DebrisRejectReason | null;
  case_number: string | null;
  case_status: DebrisCaseStatus | null;
  case_opened_at: string | null;
  reporters: number | null;
  collected_at: string | null;
  collected_by: string | null;
  weight_kg: number | null;
  outcome: 'all' | 'partial' | null;
  follow_up_number: string | null;
}

/*
  `reporters` counts PEOPLE on the case, not reports: one person sending the
  same pile twice is one pair of eyes.
*/
const VIEW_SQL = `
  SELECT r.id, r.submitted_at, r.taken_at, r.kinds, r.amount, r.access, r.verdict, r.reject_reason,
         c.number AS case_number, c.status AS case_status, c.opened_at AS case_opened_at,
         (SELECT COUNT(DISTINCT o.user_id) FROM debris_reports o WHERE o.case_id = r.case_id) AS reporters,
         k.at AS collected_at, k.actor AS collected_by, k.weight_kg, k.outcome, f.number AS follow_up_number
  FROM debris_reports r
  LEFT JOIN debris_cases c ON c.id = r.case_id
  LEFT JOIN debris_collections k ON k.case_id = r.case_id
  LEFT JOIN debris_cases f ON f.id = k.follow_up_case_id`;

const toView = (r: ReportRow): DebrisReportView => ({
  id: r.id,
  submittedAt: r.submitted_at,
  takenAt: r.taken_at,
  kinds: JSON.parse(r.kinds) as DebrisKind[],
  amount: r.amount,
  access: r.access,
  verdict: r.verdict,
  rejectReason: r.reject_reason,
  case: r.case_number && r.case_status && r.case_opened_at
    ? {
        number: r.case_number, status: r.case_status, openedAt: r.case_opened_at, reporters: r.reporters ?? 0,
        collection: r.collected_at && r.collected_by && r.weight_kg != null && r.outcome
          ? { at: r.collected_at, by: r.collected_by, weightKg: r.weight_kg, outcome: r.outcome, followUpNumber: r.follow_up_number }
          : null,
      }
    : null,
});

function viewOf(db: DB, userId: string, reportId: string): DebrisReportView | null {
  const found = row<ReportRow>(db.prepare(`${VIEW_SQL} WHERE r.id = ? AND r.user_id = ?`).get(reportId, userId));
  return found ? toView(found) : null;
}

/** One of the sender's own reports. Somebody else's is not found, not forbidden. */
export const debrisReportFor = (db: DB, userId: string, reportId: string): DebrisReportView | null =>
  viewOf(db, userId, reportId);

/** The sender's reports, newest first, refused ones included: they were told why, and can look again. */
export function debrisReportsOf(db: DB, userId: string, limit = 50): DebrisReportView[] {
  const bounded = Math.max(1, Math.min(200, Math.floor(limit) || 50));
  return rows<ReportRow>(db.prepare(
    `${VIEW_SQL} WHERE r.user_id = ? ORDER BY r.submitted_at DESC, r.rowid DESC LIMIT ?`,
  ).all(userId, bounded)).map(toView);
}
