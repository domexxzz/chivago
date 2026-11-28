/**
 * The municipality's desk for debris reports: what to send people to first,
 * how much of what came in was usable, and the two decisions an officer makes.
 *
 * Boards ก ข ค and F4 of the Ko Sichang proposal. Three rules from them shape
 * everything here:
 *
 *   THE DESK SUGGESTS, IT DOES NOT ORDER. The ranking is severity × people ×
 *   access (`debrisPriority` in core), printed on the page with its formula,
 *   and the officer who knows the beach decides. Every decision is written
 *   down with the name of whoever made it.
 *
 *   A REPORTER IS A COUNT HERE, NOT A NAME. The desk sees how many people saw a
 *   pile and what they said, never who they are. Nothing in this file selects
 *   `user_id` into anything it returns.
 *
 *   AN ISLAND SEES ITS OWN. A municipality login sees the island its host
 *   record is tied to (`hosts.campus`), and nothing else; a municipality with
 *   no island set sees nothing rather than everything. The platform's
 *   moderators see every island that takes reports.
 */

import { randomUUID } from 'node:crypto';
import {
  AREAS, DEBRIS_AMOUNTS, DEBRIS_CASE_PREFIX, DEBRIS_KINDS, debrisAreaOf, debrisPriority, hardestDebrisAccess,
  largestDebrisAmount, metresBetween,
  type AreaKey, type DebrisAccess, type DebrisAmount, type DebrisCaseStatus, type DebrisKind, type DebrisRejectReason,
} from '@chivago/core';
import { blobStore } from './blob-store.ts';
import { row, rows, transact, type DB } from './db.ts';
import { openDebrisCase } from './debris-report-service.ts';
import { sniff, type PhotoBlob } from './uploads.ts';

/* --------------------------------------------------------------- scope -- */

export type DebrisDeskScope = readonly AreaKey[];

const DEBRIS_AREAS = AREAS.map((a) => a.key).filter((k) => DEBRIS_CASE_PREFIX[k] !== undefined);

/** The islands a console login may see. Empty means no desk at all. */
export function debrisDeskScope(
  db: DB,
  session: { hostId: string; hostType: string; role: 'host' | 'moderator' | 'admin' },
): AreaKey[] {
  if (session.role === 'moderator' || session.role === 'admin') return [...DEBRIS_AREAS];
  if (session.hostType !== 'municipality') return [];
  const campus = row<{ campus: string | null }>(db.prepare('SELECT campus FROM hosts WHERE id = ?').get(session.hostId))?.campus;
  return DEBRIS_AREAS.filter((k) => k === campus);
}

/* -------------------------------------------------------------- errors -- */

export type DebrisDeskErrorCode =
  | 'NOT_FOUND' | 'NOT_OPEN' | 'REASON_REQUIRED' | 'WEIGHT_REQUIRED' | 'OUTCOME_REQUIRED' | 'LEFT_REQUIRED';

export class DebrisDeskError extends Error {
  readonly code: DebrisDeskErrorCode;
  constructor(code: DebrisDeskErrorCode, message: string) {
    super(message);
    this.name = 'DebrisDeskError';
    this.code = code;
  }
}

/* --------------------------------------------------------------- cases -- */

export interface DebrisDeskCase {
  id: string;
  number: string;
  area: AreaKey;
  lat: number;
  lng: number;
  status: DebrisCaseStatus;
  openedAt: string;
  lastReportAt: string;
  /** People, not reports: one person sending twice is one pair of eyes. */
  reporters: number;
  reportCount: number;
  /** The biggest pile anybody reported. */
  amount: DebrisAmount;
  /** The hardest way in anybody reported. */
  access: DebrisAccess;
  kinds: DebrisKind[];
  priority: number;
}

interface CaseRow {
  id: string; number: string; area: AreaKey; lat: number; lng: number; status: DebrisCaseStatus;
  opened_at: string; last_report_at: string;
  follow_up_of: string | null; carried_amount: DebrisAmount | null; carried_access: DebrisAccess | null;
  carried_reporters: number | null;
}

const CASE_COLUMNS = `id, number, area, lat, lng, status, opened_at, last_report_at,
  follow_up_of, carried_amount, carried_access, carried_reporters`;
interface ReportRow {
  id: string; case_id: string; user_id: string; submitted_at: string; taken_at: string; accuracy_m: number | null;
  kinds: string; amount: DebrisAmount; access: DebrisAccess; photo_path: string | null;
}

const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(',');

function casesIn(db: DB, scope: DebrisDeskScope, statuses: readonly DebrisCaseStatus[]): DebrisDeskCase[] {
  if (scope.length === 0) return [];
  const found = rows<CaseRow>(db.prepare(
    `SELECT ${CASE_COLUMNS} FROM debris_cases
     WHERE area IN (${placeholders(scope.length)}) AND status IN (${placeholders(statuses.length)})`,
  ).all(...scope, ...statuses));
  if (found.length === 0) return [];
  // Joined on the same filter rather than passed the case ids: a long queue
  // would otherwise run into SQLite's limit on bound parameters.
  const reports = rows<ReportRow>(db.prepare(
    `SELECT r.id, r.case_id, r.user_id, r.submitted_at, r.taken_at, r.accuracy_m, r.kinds, r.amount, r.access, r.photo_path
     FROM debris_reports r JOIN debris_cases c ON c.id = r.case_id
     WHERE c.area IN (${placeholders(scope.length)}) AND c.status IN (${placeholders(statuses.length)})`,
  ).all(...scope, ...statuses));
  return found.map((c) => summarise(c, reports.filter((r) => r.case_id === c.id)));
}

/*
  A follow-up case starts with no reports of its own: what was left after a
  part-collection. It carries the officer's word for how much is left, the
  original's way in, and the original's count of people, so it ranks on the
  queue where it belongs instead of at zero. New reports there add to it.
*/
function summarise(c: CaseRow, reports: ReportRow[]): DebrisDeskCase {
  const amount = largestDebrisAmount([...reports.map((r) => r.amount), ...(c.carried_amount ? [c.carried_amount] : [])]);
  const access = hardestDebrisAccess([...reports.map((r) => r.access), ...(c.carried_access ? [c.carried_access] : [])]);
  const reporters = new Set(reports.map((r) => r.user_id)).size + (c.carried_reporters ?? 0);
  const seen = new Set(reports.flatMap((r) => JSON.parse(r.kinds) as DebrisKind[]));
  return {
    id: c.id, number: c.number, area: c.area, lat: c.lat, lng: c.lng, status: c.status,
    openedAt: c.opened_at, lastReportAt: c.last_report_at,
    reporters, reportCount: reports.length, amount, access,
    kinds: DEBRIS_KINDS.filter((k) => seen.has(k)),
    priority: debrisPriority({ amount, access, reporters }),
  };
}

/* -------------------------------------------------------------- funnel -- */

export interface DebrisFunnel {
  /** The island's calendar day this counts, `YYYY-MM-DD`. */
  day: string;
  received: number;
  merged: number;
  opened: number;
  rejected: Record<DebrisRejectReason, number>;
}

const BANGKOK_OFFSET_MS = 7 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

/** A refusal from just off the island is the island's to count; one from another island is not. */
const NEARBY_M = 20_000;

function islandDay(now: Date): { day: string; from: string; to: string } {
  const local = new Date(now.getTime() + BANGKOK_OFFSET_MS);
  const day = local.toISOString().slice(0, 10);
  const from = new Date(Date.parse(`${day}T00:00:00.000Z`) - BANGKOK_OFFSET_MS);
  return { day, from: from.toISOString(), to: new Date(from.getTime() + DAY_MS).toISOString() };
}

function funnelOf(db: DB, scope: DebrisDeskScope, now: Date): DebrisFunnel {
  const { day, from, to } = islandDay(now);
  const funnel: DebrisFunnel = { day, received: 0, merged: 0, opened: 0, rejected: { mocked: 0, outside_area: 0, stale: 0 } };
  if (scope.length === 0) return funnel;
  const today = rows<{ verdict: 'opened' | 'merged' | 'rejected'; reject_reason: DebrisRejectReason | null; lat: number; lng: number; area: AreaKey | null }>(
    db.prepare(
      `SELECT r.verdict, r.reject_reason, r.lat, r.lng, c.area FROM debris_reports r
       LEFT JOIN debris_cases c ON c.id = r.case_id
       WHERE r.submitted_at >= ? AND r.submitted_at < ?`,
    ).all(from, to),
  );
  const centres = AREAS.filter((a) => scope.includes(a.key)).map((a) => a.center);
  for (const r of today) {
    const ours = r.verdict === 'rejected'
      ? r.reject_reason === 'outside_area'
        ? centres.some((c) => metresBetween(c, r) <= NEARBY_M)
        : scope.includes(debrisAreaOf(r) as AreaKey)
      : r.area !== null && scope.includes(r.area);
    if (!ours) continue;
    funnel.received += 1;
    if (r.verdict === 'rejected' && r.reject_reason) funnel.rejected[r.reject_reason] += 1;
    else if (r.verdict === 'merged') funnel.merged += 1;
    else if (r.verdict === 'opened') funnel.opened += 1;
  }
  return funnel;
}

/* ---------------------------------------------------------------- desk -- */

export interface DebrisDesk {
  funnel: DebrisFunnel;
  /** Open cases a truck or people on foot can reach, highest priority first. */
  land: DebrisDeskCase[];
  /** Open cases only a boat reaches: the boat team's list, not the truck run. */
  boat: DebrisDeskCase[];
  /** Cases somebody has been sent to, oldest first. */
  assigned: DebrisDeskCase[];
}

export function debrisDesk(db: DB, scope: DebrisDeskScope, now = new Date()): DebrisDesk {
  const open = casesIn(db, scope, ['open']);
  const byPriority = (a: DebrisDeskCase, b: DebrisDeskCase) =>
    b.priority - a.priority || b.reporters - a.reporters || a.openedAt.localeCompare(b.openedAt);
  return {
    funnel: funnelOf(db, scope, now),
    land: open.filter((c) => c.access !== 'boat_only').sort(byPriority),
    boat: open.filter((c) => c.access === 'boat_only').sort((a, b) => b.reporters - a.reporters || a.openedAt.localeCompare(b.openedAt)),
    assigned: casesIn(db, scope, ['assigned']).sort((a, b) => a.openedAt.localeCompare(b.openedAt)),
  };
}

/* ------------------------------------------------------------ one case -- */

export interface DebrisDeskReport {
  id: string;
  submittedAt: string;
  takenAt: string;
  accuracyM: number | null;
  kinds: DebrisKind[];
  amount: DebrisAmount;
  access: DebrisAccess;
  hasPhoto: boolean;
}

export interface DebrisCaseEvent { at: string; actor: string; action: 'assigned' | 'dismissed' | 'closed'; note: string }

export interface DebrisCaseLink { id: string; number: string }

/** What came off the beach when the case was closed as collected. */
export interface DebrisDeskCollection {
  at: string;
  by: string;
  weightKg: number;
  /** What the officer found, beside what the reporters said. */
  foundKinds: DebrisKind[];
  outcome: 'all' | 'partial';
  afterPhoto: boolean;
  /** The case opened for what was left. */
  followUp: DebrisCaseLink | null;
}

export interface DebrisDeskCaseDetail extends DebrisDeskCase {
  reports: DebrisDeskReport[];
  events: DebrisCaseEvent[];
  collection: DebrisDeskCollection | null;
  /** The case whose part-collection left this one behind. */
  followUpOf: DebrisCaseLink | null;
}

interface CollectionRow {
  at: string; actor: string; weight_kg: number; found_kinds: string; outcome: 'all' | 'partial';
  after_photo_path: string | null; follow_up_id: string | null; follow_up_number: string | null;
}

function collectionOf(db: DB, caseId: string): DebrisDeskCollection | null {
  const k = row<CollectionRow>(db.prepare(
    `SELECT k.at, k.actor, k.weight_kg, k.found_kinds, k.outcome, k.after_photo_path,
            f.id AS follow_up_id, f.number AS follow_up_number
     FROM debris_collections k LEFT JOIN debris_cases f ON f.id = k.follow_up_case_id
     WHERE k.case_id = ?`,
  ).get(caseId));
  if (!k) return null;
  return {
    at: k.at, by: k.actor, weightKg: k.weight_kg, foundKinds: JSON.parse(k.found_kinds) as DebrisKind[],
    outcome: k.outcome, afterPhoto: k.after_photo_path !== null,
    followUp: k.follow_up_id && k.follow_up_number ? { id: k.follow_up_id, number: k.follow_up_number } : null,
  };
}

export function debrisCaseForDesk(db: DB, scope: DebrisDeskScope, caseId: string): DebrisDeskCaseDetail | null {
  if (scope.length === 0) return null;
  const c = row<CaseRow>(db.prepare(
    `SELECT ${CASE_COLUMNS} FROM debris_cases
     WHERE id = ? AND area IN (${placeholders(scope.length)})`,
  ).get(caseId, ...scope));
  if (!c) return null;
  const reports = rows<ReportRow>(db.prepare(
    `SELECT id, case_id, user_id, submitted_at, taken_at, accuracy_m, kinds, amount, access, photo_path
     FROM debris_reports WHERE case_id = ? ORDER BY submitted_at, rowid`,
  ).all(c.id));
  return {
    ...summarise(c, reports),
    reports: reports.map((r) => ({
      id: r.id, submittedAt: r.submitted_at, takenAt: r.taken_at, accuracyM: r.accuracy_m,
      kinds: JSON.parse(r.kinds) as DebrisKind[], amount: r.amount, access: r.access, hasPhoto: r.photo_path !== null,
    })),
    events: rows<DebrisCaseEvent>(db.prepare(
      'SELECT at, actor, action, note FROM debris_case_events WHERE case_id = ? ORDER BY at, rowid',
    ).all(c.id)),
    collection: collectionOf(db, c.id),
    followUpOf: c.follow_up_of
      ? row<DebrisCaseLink>(db.prepare('SELECT id, number FROM debris_cases WHERE id = ?').get(c.follow_up_of)) ?? null
      : null,
  };
}

/* ----------------------------------------------------------- decisions -- */

const NOTE_MAX = 300;
/** Invisible characters out first, so a "reason" of zero-width spaces is no reason; cut by code point. */
const clean = (text: string) => Array.from(text.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim()).slice(0, NOTE_MAX).join('');

function decide(
  db: DB, scope: DebrisDeskScope, caseId: string, from: readonly DebrisCaseStatus[],
  to: 'assigned' | 'dismissed', actor: string, note: string, now: Date,
): DebrisDeskCaseDetail {
  transact(db, () => {
    const current = debrisCaseForDesk(db, scope, caseId);
    if (!current) throw new DebrisDeskError('NOT_FOUND', 'No such case on this desk.');
    if (!from.includes(current.status)) throw new DebrisDeskError('NOT_OPEN', `This case is ${current.status}.`);
    db.prepare('UPDATE debris_cases SET status = ? WHERE id = ?').run(to, caseId);
    db.prepare('INSERT INTO debris_case_events (id, case_id, at, actor, action, note) VALUES (?,?,?,?,?,?)')
      .run(randomUUID(), caseId, now.toISOString(), clean(actor) || 'console', to, clean(note));
  });
  return debrisCaseForDesk(db, scope, caseId)!;
}

/** Somebody is going. The note is for them: who, and when the tide allows. */
export const assignDebrisCase = (db: DB, scope: DebrisDeskScope, caseId: string, actor: string, note: string, now = new Date()) =>
  decide(db, scope, caseId, ['open'], 'assigned', actor, note, now);

/** Closed without collecting. Needs words: the reporter is shown that it was closed. */
export function dismissDebrisCase(db: DB, scope: DebrisDeskScope, caseId: string, actor: string, reason: string, now = new Date()) {
  if (clean(reason) === '') throw new DebrisDeskError('REASON_REQUIRED', 'Say why: the reporter is shown that it was closed.');
  return decide(db, scope, caseId, ['open', 'assigned'], 'dismissed', actor, reason, now);
}

/* ------------------------------------------------------ closing the job -- */

/** A scale on a beach weighs bags, not boats. Past this is a typo, not a collection. */
const MAX_WEIGHT_KG = 1000;

export interface DebrisCloseInput {
  weightKg: unknown;
  foundKinds: unknown;
  outcome: unknown;
  /** How much is left, for a part-collection: the new case starts from it. */
  leftAmount?: unknown;
  afterPhoto: Buffer | null;
}

const readWeight = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.trim()) : NaN;
  return Number.isFinite(n) && n > 0 && n <= MAX_WEIGHT_KG ? Math.round(n * 10) / 10 : null;
};

const readKinds = (v: unknown): DebrisKind[] => {
  const list = Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v];
  return DEBRIS_KINDS.filter((k) => list.includes(k));
};

/**
 * The field team's close (board F7): weighed, what was really there, an after
 * photograph, and whether all of it came away.
 *
 * Only from open or assigned - a dismissed case was decided not to be worth a
 * trip, and closing it as collected would put a kilo on a decision that said
 * nobody went. The after photo lands before the row, like every photo here,
 * and is deleted again if the close is refused.
 */
export async function closeDebrisCase(
  db: DB, scope: DebrisDeskScope, caseId: string, actor: string, input: DebrisCloseInput, now = new Date(),
): Promise<DebrisDeskCaseDetail> {
  const weightKg = readWeight(input.weightKg);
  if (weightKg === null) {
    throw new DebrisDeskError('WEIGHT_REQUIRED', `Weigh it: a weight in kilograms between 0 and ${MAX_WEIGHT_KG}, as the scale read.`);
  }
  if (input.outcome !== 'all' && input.outcome !== 'partial') {
    throw new DebrisDeskError('OUTCOME_REQUIRED', 'Say whether all of it came away.');
  }
  const outcome = input.outcome;
  const left = DEBRIS_AMOUNTS.find((a) => a === input.leftAmount) ?? null;
  if (outcome === 'partial' && !left) {
    throw new DebrisDeskError('LEFT_REQUIRED', 'Say how much is left, so the rest can go back on the queue.');
  }
  const foundKinds = readKinds(input.foundKinds);
  const photo = input.afterPhoto && input.afterPhoto.length > 0 ? input.afterPhoto : null;
  const sniffed = photo ? sniff(photo) : null;
  /*
    Checked BEFORE a byte is written, and again inside the transaction. A
    desk that cannot see the case, or a case already decided, writes nothing
    to storage at all - the second check is only for a race.
  */
  const before = debrisCaseForDesk(db, scope, caseId);
  if (!before) throw new DebrisDeskError('NOT_FOUND', 'No such case on this desk.');
  if (before.status !== 'open' && before.status !== 'assigned') {
    throw new DebrisDeskError('NOT_OPEN', `This case is ${before.status}.`);
  }
  /*
    A key of its own for every attempt. With one key per case, a refused second
    close - a double tap, a retry on a weak signal - overwrote the first close's
    photo and then deleted it, leaving the row pointing at nothing.
  */
  const photoPath = sniffed ? `debris/after/${before.id.slice(0, 2)}/${before.id}-${randomUUID()}.${sniffed.ext}` : null;
  if (photo && photoPath) await blobStore().put(photoPath, photo);
  try {
    transact(db, () => {
      const current = debrisCaseForDesk(db, scope, caseId);
      if (!current) throw new DebrisDeskError('NOT_FOUND', 'No such case on this desk.');
      if (current.status !== 'open' && current.status !== 'assigned') {
        throw new DebrisDeskError('NOT_OPEN', `This case is ${current.status}.`);
      }
      const followUp = outcome === 'partial' && left
        ? openDebrisCase(db, current.area, current, now.toISOString(), now, {
            followUpOf: current.id, amount: left, access: current.access, reporters: current.reporters,
          })
        : null;
      db.prepare(
        `INSERT INTO debris_collections
           (case_id, at, actor, weight_kg, found_kinds, outcome, follow_up_case_id, after_photo_path, after_photo_mime)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      ).run(caseId, now.toISOString(), clean(actor) || 'console', weightKg, JSON.stringify(foundKinds), outcome,
        followUp, photoPath, sniffed?.mime ?? null);
      db.prepare("UPDATE debris_cases SET status = 'closed' WHERE id = ?").run(caseId);
      db.prepare('INSERT INTO debris_case_events (id, case_id, at, actor, action, note) VALUES (?,?,?,?,?,?)')
        .run(randomUUID(), caseId, now.toISOString(), clean(actor) || 'console', 'closed',
          `${weightKg} kg${outcome === 'partial' ? ' · part' : ''}`);
    });
  } catch (err) {
    if (photoPath) await blobStore().delete(photoPath).catch(() => undefined);
    throw err;
  }
  return debrisCaseForDesk(db, scope, caseId)!;
}

/** The field team's after photograph, for the island's desk only. */
export async function readDebrisAfterPhotoForDesk(db: DB, scope: DebrisDeskScope, caseId: string): Promise<PhotoBlob | null> {
  if (scope.length === 0) return null;
  const found = row<{ after_photo_path: string; after_photo_mime: string }>(db.prepare(
    `SELECT k.after_photo_path, k.after_photo_mime FROM debris_collections k JOIN debris_cases c ON c.id = k.case_id
     WHERE k.case_id = ? AND k.after_photo_path IS NOT NULL AND c.area IN (${placeholders(scope.length)})`,
  ).get(caseId, ...scope));
  if (!found) return null;
  const bytes = await blobStore().get(found.after_photo_path);
  return bytes ? { bytes, mime: found.after_photo_mime } : null;
}

/* ---------------------------------------------------------- photograph -- */

/** A report's photograph, for the desk of the island it was taken on and nobody else. */
export async function readDebrisPhotoForDesk(db: DB, scope: DebrisDeskScope, reportId: string): Promise<PhotoBlob | null> {
  if (scope.length === 0) return null;
  const found = row<{ photo_path: string; photo_mime: string }>(db.prepare(
    `SELECT r.photo_path, r.photo_mime FROM debris_reports r JOIN debris_cases c ON c.id = r.case_id
     WHERE r.id = ? AND r.photo_path IS NOT NULL AND c.area IN (${placeholders(scope.length)})`,
  ).get(reportId, ...scope));
  if (!found) return null;
  const bytes = await blobStore().get(found.photo_path);
  return bytes ? { bytes, mime: found.photo_mime } : null;
}
