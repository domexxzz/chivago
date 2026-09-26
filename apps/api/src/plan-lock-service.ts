/**
 * Fixing a quest's measurement plan, and counting what had already happened.
 *
 * See `packages/core/src/validation.ts` for the distinction this implements
 * and what a lock declines to claim. The rules that live HERE are the two the
 * database has to hold:
 *
 *   THE COUNT IS TAKEN AT THE MOMENT OF LOCKING, from the same rows the KPI
 *   reads, reversals excluded. It is never passed in. A caller who could
 *   supply the count could supply a zero, and a zero is the entire strong
 *   claim.
 *
 *   THE PLAN IS READ OFF THE QUEST, never from a form, for the same reason a
 *   countersignature's digest is read off the statement. What is sealed has
 *   to be what is there.
 *
 * A plan with no measure is not a plan and is refused: a lock over four nulls
 * would show up as "fixed before results" and mean nothing at all.
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  isEvidenceLevel, isQuestMeasure, planBytes,
  type EvidenceLevel, type KpiMeasure, type MeasurementPlan, type PlanLock,
} from '@chivago/core';
import { row, rows, type DB } from './db.ts';
import { notReversed } from './ledger-sql.ts';

export class InvalidPlanLock extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPlanLock';
  }
}

interface LockRow {
  id: string; quest_id: string; digest: string; verified_at_lock: number;
  locked_at: string; locked_by: string | null;
  superseded_at: string | null; superseded_reason: string | null;
}

const fromRow = (r: LockRow): PlanLock => ({
  id: r.id,
  questId: r.quest_id,
  digest: r.digest,
  verifiedAtLock: r.verified_at_lock,
  lockedAt: r.locked_at,
  lockedBy: r.locked_by,
  supersededAt: r.superseded_at,
  supersededReason: r.superseded_reason,
});

export const planDigest = (plan: MeasurementPlan): string =>
  createHash('sha256').update(planBytes(plan)).digest('hex');

interface QuestPlanRow {
  kpi_measure: string | null;
  kpi_baseline: number | null;
  kpi_target: number | null;
  evidence_level: number | null;
}

/**
 * The plan as the quest's columns currently hold it.
 *
 * `null` when there is no measure, or the stored one is not a measure a quest
 * can carry. A quest measured by something this platform will not compute has
 * no plan to fix, and saying so is better than sealing a blank.
 */
export function planOf(db: DB, questId: string): MeasurementPlan | null {
  const q = row<QuestPlanRow>(
    db.prepare(
      'SELECT kpi_measure, kpi_baseline, kpi_target, evidence_level FROM quests WHERE id = ?',
    ).get(questId),
  );
  if (!q || q.kpi_measure === null || !isQuestMeasure(q.kpi_measure)) return null;
  return {
    measure: q.kpi_measure as KpiMeasure,
    baseline: q.kpi_baseline ?? null,
    target: q.kpi_target ?? null,
    requiredLevel: q.evidence_level !== null && isEvidenceLevel(q.evidence_level)
      ? (q.evidence_level as EvidenceLevel)
      : null,
  };
}

/**
 * How many of this quest's activities have been verified, ever.
 *
 * No period: the question a lock answers is whether ANY result existed when
 * the plan was chosen, and a period would let a late lock look early by
 * pointing at a window with nothing in it.
 *
 * Reversals are out, the same as in `kpi-service.ts`. An award that was taken
 * back is not a result somebody could have been reacting to.
 */
export function verifiedSoFar(db: DB, questId: string): number {
  const unreversed = `NOT EXISTS (
     SELECT 1 FROM ledger l
      WHERE l.kind = 'quest_reward' AND l.user_id = qp.user_id
        AND l.source_ref = 'quest:' || qp.quest_id || ':user:' || qp.user_id
        AND NOT (${notReversed('l')}))`;
  return row<{ n: number }>(
    db.prepare(
      `SELECT COUNT(*) AS n FROM quest_progress qp
        WHERE qp.quest_id = ? AND qp.verified_at IS NOT NULL AND ${unreversed}`,
    ).get(questId),
  )?.n ?? 0;
}

/** The lock that currently stands for this quest, if any. */
export function lockFor(db: DB, questId: string): PlanLock | null {
  const r = row<LockRow>(
    db.prepare(
      'SELECT * FROM quest_plan_locks WHERE quest_id = ? AND superseded_at IS NULL',
    ).get(questId),
  );
  return r ? fromRow(r) : null;
}

/** Every lock this quest has had, oldest first, superseded ones included. */
export function locksFor(db: DB, questId: string): PlanLock[] {
  return rows<LockRow>(
    db.prepare('SELECT * FROM quest_plan_locks WHERE quest_id = ? ORDER BY locked_at, id').all(questId),
  ).map(fromRow);
}

export function lockPlan(
  db: DB, questId: string, lockedBy: string | null, now = new Date(),
): PlanLock {
  const quest = row<{ id: string }>(db.prepare('SELECT id FROM quests WHERE id = ?').get(questId));
  if (!quest) throw new InvalidPlanLock(`No quest has the id ${questId}.`);

  const plan = planOf(db, questId);
  if (plan === null) {
    throw new InvalidPlanLock(
      'This quest has no measure to fix. Set the KPI before locking the plan.',
    );
  }
  if (lockFor(db, questId) !== null) {
    throw new InvalidPlanLock(
      'This quest already has a plan locked. Supersede it before locking another.',
    );
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO quest_plan_locks
       (id, quest_id, digest, verified_at_lock, locked_at, locked_by)
     VALUES (?,?,?,?,?,?)`,
    // The count is taken here, from the rows, and never accepted from above.
  ).run(id, questId, planDigest(plan), verifiedSoFar(db, questId), now.toISOString(), lockedBy);

  return lockFor(db, questId)!;
}

/**
 * Set a plan aside so a different one can be fixed.
 *
 * Idempotent, and the FIRST supersession stands: a later call must not rewrite
 * the date on which the plan stopped applying. The row is kept, because the
 * quest really was measured that way for a while, and a report covering that
 * period needs to be able to say so.
 */
export function supersedePlan(
  db: DB, questId: string, reason: string, now = new Date(),
): PlanLock {
  const standing = lockFor(db, questId);
  if (standing === null) throw new InvalidPlanLock(`No plan is locked for the quest ${questId}.`);
  db.prepare(
    'UPDATE quest_plan_locks SET superseded_at = ?, superseded_reason = ? WHERE id = ?',
  ).run(now.toISOString(), reason.trim() || null, standing.id);
  return fromRow(
    row<LockRow>(db.prepare('SELECT * FROM quest_plan_locks WHERE id = ?').get(standing.id))!,
  );
}
