/**
 * Activities a campus host writes, and the second person who publishes them.
 *
 * `packages/core/src/host-quest.ts` holds the rules; this holds the rows. Two
 * tables on purpose. `host_quests` is the writer's page - drafts, what was sent
 * back and why, who approved it. `quests` is what travellers read, and a row
 * lands there at the moment of approval, in the same transaction, and never
 * before. Nothing else in the application has to learn about drafts.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import {
  hostQuestProblems, type Bilingual, type HostQuestInput, type HostQuestStatus,
} from '@chivago/core';
import { row, rows, transact, type DB } from './db.ts';

export class HostQuestRefused extends Error {
  problems: Bilingual[];
  constructor(problems: Bilingual[]) {
    super(problems.map((p) => p.en).join(' '));
    this.name = 'HostQuestRefused';
    this.problems = problems;
  }
}

/** A join the activity itself turns away: full, over, or closed. */
export class QuestNotJoinable extends Error {
  reason: 'full' | 'ended' | 'closed';
  constructor(reason: 'full' | 'ended' | 'closed') {
    super(`quest not joinable: ${reason}`);
    this.name = 'QuestNotJoinable';
    this.reason = reason;
  }
}

/** A check-in outside the activity's own hours. */
export class OutsideQuestHours extends Error {
  startsAt: string;
  endsAt: string;
  constructor(startsAt: string, endsAt: string) {
    super(`quest runs ${startsAt} to ${endsAt}`);
    this.name = 'OutsideQuestHours';
    this.startsAt = startsAt;
    this.endsAt = endsAt;
  }
}

export interface HostQuest extends HostQuestInput {
  id: string;
  hostId: string;
  hostName: string;
  status: HostQuestStatus;
  writtenBy: string | null;
  reviewedBy: string | null;
  returnReason: string | null;
  /** How many hold a seat. Zero until it is published. */
  taken: number;
}

interface HostQuestRow {
  id: string; host_id: string; host_name: string; area: string; status: string;
  name_en: string; name_th: string; where_en: string; where_th: string;
  minutes: number; reward_points: number; reward_currency: string;
  lat: number; lng: number; radius_m: number; seats: number;
  starts_at: string; ends_at: string;
  written_by: string | null; reviewed_by: string | null; return_reason: string | null;
  taken: number;
}

const SELECT = `
  SELECT hq.*, h.name AS host_name,
         (SELECT COUNT(*) FROM quest_progress qp WHERE qp.quest_id = hq.id) AS taken
    FROM host_quests hq JOIN hosts h ON h.id = hq.host_id`;

const toHostQuest = (r: HostQuestRow): HostQuest => ({
  id: r.id,
  hostId: r.host_id,
  hostName: r.host_name,
  area: r.area,
  status: r.status as HostQuestStatus,
  nameEn: r.name_en,
  nameTh: r.name_th,
  whereEn: r.where_en,
  whereTh: r.where_th,
  minutes: r.minutes,
  rewardPoints: r.reward_points,
  rewardCurrency: r.reward_currency,
  lat: r.lat,
  lng: r.lng,
  radiusM: r.radius_m,
  seats: r.seats,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  writtenBy: r.written_by,
  reviewedBy: r.reviewed_by,
  returnReason: r.return_reason,
  taken: r.taken,
});

const refuse = (en: string, th: string): never => {
  throw new HostQuestRefused([{ en, th }]);
};

export function hostQuestById(db: DB, id: string): HostQuest | null {
  const r = row<HostQuestRow>(db.prepare(`${SELECT} WHERE hq.id = ?`).get(id));
  return r ? toHostQuest(r) : null;
}

/** A host's own, newest first. */
export const hostQuestsOf = (db: DB, hostId: string): HostQuest[] =>
  rows<HostQuestRow>(db.prepare(`${SELECT} WHERE hq.host_id = ? ORDER BY hq.created_at DESC, hq.id`).all(hostId))
    .map(toHostQuest);

/** What a reviewer may decide: submitted, and written by somebody else's host. Oldest first. */
export const hostQuestsToReview = (db: DB, reviewerHostId: string): HostQuest[] =>
  rows<HostQuestRow>(
    db.prepare(`${SELECT} WHERE hq.status = 'submitted' AND hq.host_id <> ? ORDER BY hq.submitted_at, hq.id`)
      .all(reviewerHostId),
  ).map(toHostQuest);

const clean = (input: HostQuestInput): HostQuestInput => ({
  ...input,
  nameEn: input.nameEn.trim(),
  nameTh: input.nameTh.trim(),
  whereEn: input.whereEn.trim(),
  whereTh: input.whereTh.trim(),
});

const values = (q: HostQuestInput) => [
  q.area, q.nameEn, q.nameTh, q.whereEn, q.whereTh, q.minutes, q.rewardPoints, q.rewardCurrency,
  q.lat, q.lng, q.radiusM, q.seats,
  // Stored as UTC so that dates compare as text.
  new Date(q.startsAt).toISOString(), new Date(q.endsAt).toISOString(),
] as const;

function checked(input: HostQuestInput, now: Date): HostQuestInput {
  const q = clean(input);
  const problems = hostQuestProblems(q, now);
  if (problems.length > 0) throw new HostQuestRefused(problems);
  return q;
}

export function createHostQuest(
  db: DB, hostId: string, writtenBy: string | null, input: HostQuestInput, now = new Date(),
): HostQuest {
  const q = checked(input, now);
  const id = `hq-${randomUUID()}`;
  db.prepare(
    `INSERT INTO host_quests (id, host_id, status, written_by, created_at, updated_at,
       area, name_en, name_th, where_en, where_th, minutes, reward_points, reward_currency,
       lat, lng, radius_m, seats, starts_at, ends_at)
     VALUES (?, ?, 'draft', ?, ?, ?, ?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(id, hostId, writtenBy, now.toISOString(), now.toISOString(), ...values(q));
  return hostQuestById(db, id)!;
}

/** Only while it is the writer's to change: a draft, or one sent back. */
export function editHostQuest(
  db: DB, hostId: string, id: string, input: HostQuestInput, now = new Date(),
): HostQuest {
  const q = checked(input, now);
  const done = db.prepare(
    `UPDATE host_quests SET updated_at = ?, area = ?, name_en = ?, name_th = ?, where_en = ?, where_th = ?,
       minutes = ?, reward_points = ?, reward_currency = ?, lat = ?, lng = ?, radius_m = ?, seats = ?,
       starts_at = ?, ends_at = ?
     WHERE id = ? AND host_id = ? AND status IN ('draft', 'returned')`,
  ).run(now.toISOString(), ...values(q), id, hostId);
  if (Number(done.changes) === 0) {
    refuse('This can no longer be edited.', 'แก้ไขรายการนี้ไม่ได้แล้ว');
  }
  return hostQuestById(db, id)!;
}

export function submitHostQuest(db: DB, hostId: string, id: string, now = new Date()): HostQuest {
  const found = hostQuestById(db, id);
  if (!found || found.hostId !== hostId) return refuse('No such activity.', 'ไม่พบกิจกรรมนี้');
  checked(found, now);
  const done = db.prepare(
    `UPDATE host_quests SET status = 'submitted', submitted_at = ?, updated_at = ?, return_reason = NULL
     WHERE id = ? AND host_id = ? AND status IN ('draft', 'returned')`,
  ).run(now.toISOString(), now.toISOString(), id, hostId);
  if (Number(done.changes) === 0) return refuse('This has already been sent.', 'ส่งรายการนี้ไปแล้ว');
  return hostQuestById(db, id)!;
}

export interface Reviewer {
  hostId: string;
  name: string | null;
}

function underReview(db: DB, reviewer: Reviewer, id: string): HostQuest {
  const found = hostQuestById(db, id);
  if (!found || found.status !== 'submitted') return refuse('This is not waiting for approval.', 'รายการนี้ไม่ได้รออนุมัติ');
  if (found.hostId === reviewer.hostId) {
    return refuse('Somebody from another host has to approve this.', 'ต้องให้ผู้อนุมัติจากหน่วยงานอื่นเป็นผู้อนุมัติ');
  }
  return found;
}

/** Short, unambiguous, and never one the seed uses. */
const questCode = (): string => `H-${randomBytes(3).toString('hex').toUpperCase()}`;

/** Approve and publish. The one place a host's words become something to join. */
export function publishHostQuest(db: DB, reviewer: Reviewer, id: string, now = new Date()): HostQuest {
  return transact(db, () => {
    const q = underReview(db, reviewer, id);
    checked(q, now);
    db.prepare(
      `UPDATE host_quests SET status = 'published', reviewed_by_host = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
       WHERE id = ? AND status = 'submitted'`,
    ).run(reviewer.hostId, reviewer.name, now.toISOString(), now.toISOString(), id);
    db.prepare(
      `INSERT INTO quests (id, code, name_en, name_th, where_label, where_label_th, duration, duration_th,
         reward_points, reward_currency, host_id, kind, lat, lng, geofence_radius_m)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,'today',?,?,?)`,
    ).run(
      q.id, questCode(), q.nameEn, q.nameTh, q.whereEn, q.whereTh,
      // English is the half the ESG hours are parsed from; see types.ts.
      `${q.minutes} min`, `${q.minutes} นาที`,
      q.rewardPoints, q.rewardCurrency, q.hostId, q.lat, q.lng, q.radiusM,
    );
    return hostQuestById(db, id)!;
  });
}

export function returnHostQuest(
  db: DB, reviewer: Reviewer, id: string, reason: string, now = new Date(),
): HostQuest {
  const why = reason.trim().slice(0, 300);
  if (why.length < 3) return refuse('Say why it is sent back.', 'ระบุเหตุผลที่ส่งกลับ');
  underReview(db, reviewer, id);
  db.prepare(
    `UPDATE host_quests SET status = 'returned', return_reason = ?, reviewed_by_host = ?, reviewed_by = ?,
       reviewed_at = ?, updated_at = ? WHERE id = ? AND status = 'submitted'`,
  ).run(why, reviewer.hostId, reviewer.name, now.toISOString(), now.toISOString(), id);
  return hostQuestById(db, id)!;
}

/** No new people. Whoever is already in it can finish, and their work is still verified. */
export function closeHostQuest(db: DB, hostId: string, id: string, now = new Date()): HostQuest {
  const done = db.prepare(
    `UPDATE host_quests SET status = 'closed', closed_at = ?, updated_at = ?
     WHERE id = ? AND host_id = ? AND status = 'published'`,
  ).run(now.toISOString(), now.toISOString(), id, hostId);
  if (Number(done.changes) === 0) return refuse('Only a published activity can be closed.', 'ปิดได้เฉพาะกิจกรรมที่เผยแพร่แล้ว');
  return hostQuestById(db, id)!;
}

/** Throw away a draft nobody has approved. */
export function discardHostQuest(db: DB, hostId: string, id: string): void {
  const done = db.prepare(
    "DELETE FROM host_quests WHERE id = ? AND host_id = ? AND status IN ('draft', 'returned')",
  ).run(id, hostId);
  if (Number(done.changes) === 0) refuse('Only a draft can be discarded.', 'ลบได้เฉพาะฉบับร่าง');
}

export interface QuestWindow {
  status: 'published' | 'closed';
  startsAt: string;
  endsAt: string;
  seats: number;
  taken: number;
}

/** The dates and seats of a host's activity, or null for every other quest. */
export function questWindow(db: DB, questId: string): QuestWindow | null {
  const r = row<{ status: string; starts_at: string; ends_at: string; seats: number; taken: number }>(
    db.prepare(
      `SELECT status, starts_at, ends_at, seats,
              (SELECT COUNT(*) FROM quest_progress qp WHERE qp.quest_id = host_quests.id) AS taken
         FROM host_quests WHERE id = ? AND status IN ('published', 'closed')`,
    ).get(questId),
  );
  return r
    ? { status: r.status as QuestWindow['status'], startsAt: r.starts_at, endsAt: r.ends_at, seats: r.seats, taken: r.taken }
    : null;
}
