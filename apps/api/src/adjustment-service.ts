/**
 * Recording that a partner is not claiming a quest's activity.
 *
 * See `packages/core/src/adjustment.ts` for what this is, what it refuses,
 * and why the borrowed name is handed back at the door. The rules that live
 * HERE are the ones only the database can hold:
 *
 *   THE PARTNER MUST HAVE FUNDED THE QUEST. A stand-down by an organisation
 *   that never funded it is not a concession, it is noise on the record - and
 *   worse, it is noise that LOOKS like a concession to anyone reading the
 *   list. There is nothing to give up, so there is nothing to record.
 *
 *   THE EFFECTIVE DATE IS NOT BEFORE THE FUNDING. A partner cannot stand down
 *   from a period in which they were not yet a funder. Left unchecked, a
 *   back-dated stand-down would read as covering approvals the partner never
 *   had a claim on, which overstates what was conceded.
 *
 *   RESUMING AND VOIDING ARE DIFFERENT OPERATIONS AND STAY THAT WAY. Resuming
 *   is a partner claiming again from now on; voiding is the record being
 *   wrong from the start. Collapsing them would either strip a claim forever
 *   over a typo, or retroactively break a filing somebody already made.
 */

import { randomUUID } from 'node:crypto';
import type { ClaimAdjustment } from '@chivago/core';
import { row, rows, type DB } from './db.ts';

export class InvalidAdjustment extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAdjustment';
  }
}

interface Row {
  id: string; org_id: string; quest_id: string; effective_from: string;
  reason: string | null; channel: string; recorded_at: string; recorded_by: string | null;
  resumed_at: string | null; resumed_reason: string | null;
  voided_at: string | null; voided_reason: string | null;
}

const fromRow = (r: Row): ClaimAdjustment => ({
  id: r.id,
  orgId: r.org_id,
  questId: r.quest_id,
  effectiveFrom: r.effective_from,
  reason: r.reason,
  channel: 'entered_by_staff',
  recordedAt: r.recorded_at,
  recordedBy: r.recorded_by,
  resumedAt: r.resumed_at,
  resumedReason: r.resumed_reason,
  voidedAt: r.voided_at,
  voidedReason: r.voided_reason,
});

/** Every stand-down against this quest, oldest first, ended ones included. */
export function adjustmentsFor(db: DB, questId: string): ClaimAdjustment[] {
  return rows<Row>(
    db.prepare(
      'SELECT * FROM claim_adjustments WHERE quest_id = ? ORDER BY effective_from, id',
    ).all(questId),
  ).map(fromRow);
}

/** Every stand-down across these quests, for a report that spans many. */
export function adjustmentsForQuests(db: DB, questIds: readonly string[]): ClaimAdjustment[] {
  if (questIds.length === 0) return [];
  const holes = questIds.map(() => '?').join(',');
  return rows<Row>(
    db.prepare(
      `SELECT * FROM claim_adjustments WHERE quest_id IN (${holes}) ORDER BY effective_from, id`,
    ).all(...questIds),
  ).map(fromRow);
}

export function adjustmentById(db: DB, id: string): ClaimAdjustment | null {
  const r = row<Row>(db.prepare('SELECT * FROM claim_adjustments WHERE id = ?').get(id));
  return r ? fromRow(r) : null;
}

/** The earliest moment this organisation was funding this quest, if ever. */
function fundedFrom(db: DB, orgId: string, questId: string): string | null {
  return row<{ started_at: string }>(
    db.prepare(
      'SELECT MIN(started_at) AS started_at FROM org_sponsorships WHERE org_id = ? AND quest_id = ?',
    ).get(orgId, questId),
  )?.started_at ?? null;
}

export function standDown(
  db: DB,
  args: {
    orgId: string;
    questId: string;
    /** ISO-8601. Defaults to the moment the funding started. */
    effectiveFrom?: string;
    reason?: string | null;
    recordedBy: string | null;
  },
  now = new Date(),
): ClaimAdjustment {
  const started = fundedFrom(db, args.orgId, args.questId);
  if (started === null) {
    throw new InvalidAdjustment(
      'That organisation does not fund that quest, so it has no claim to stand down from.',
    );
  }

  // Default to the funding start: standing down from "all of it" is the
  // common case, and making the operator retype a date they already agreed to
  // is how the wrong date gets typed.
  const from = (args.effectiveFrom ?? started).trim() || started;
  if (Number.isNaN(Date.parse(from))) {
    throw new InvalidAdjustment(`${from} is not a date this records.`);
  }
  if (Date.parse(from) < Date.parse(started)) {
    throw new InvalidAdjustment(
      'A partner cannot stand down from a period before their funding began.',
    );
  }

  const standing = row<Row>(
    db.prepare(
      `SELECT * FROM claim_adjustments
        WHERE org_id = ? AND quest_id = ? AND resumed_at IS NULL AND voided_at IS NULL`,
    ).get(args.orgId, args.questId),
  );
  if (standing) return fromRow(standing);

  const id = randomUUID();
  db.prepare(
    `INSERT INTO claim_adjustments
       (id, org_id, quest_id, effective_from, reason, channel, recorded_at, recorded_by)
     VALUES (?,?,?,?,?,'entered_by_staff',?,?)`,
  ).run(id, args.orgId, args.questId, from, (args.reason ?? '').trim() || null,
        now.toISOString(), args.recordedBy);

  return adjustmentById(db, id)!;
}

/**
 * A partner claiming again, from now on.
 *
 * NOT retroactive, and idempotent on the first resumption: approvals inside
 * the window that has passed stay given up, because somebody filed on them.
 */
export function resumeClaim(
  db: DB, id: string, reason: string, now = new Date(),
): ClaimAdjustment {
  const held = adjustmentById(db, id);
  if (held === null) throw new InvalidAdjustment(`No stand-down has the id ${id}.`);
  if (held.voidedAt !== null) {
    throw new InvalidAdjustment('That record was voided, so there is nothing to resume.');
  }
  if (held.resumedAt === null) {
    db.prepare('UPDATE claim_adjustments SET resumed_at = ?, resumed_reason = ? WHERE id = ?')
      .run(now.toISOString(), reason.trim() || null, id);
  }
  return adjustmentById(db, id)!;
}

/**
 * The record was wrong and never applied to anything.
 *
 * Retroactive, and deliberately separate from resuming. A wrong organisation
 * id entered once must not cost that partner its claim for the rest of time,
 * and the only honest way to say that is to say the record never held.
 *
 * A resumed stand-down can still be voided: finding out in December that the
 * whole thing was entered against the wrong quest does not become untrue
 * because somebody resumed in June.
 */
export function voidAdjustment(
  db: DB, id: string, reason: string, now = new Date(),
): ClaimAdjustment {
  const held = adjustmentById(db, id);
  if (held === null) throw new InvalidAdjustment(`No stand-down has the id ${id}.`);
  if (held.voidedAt === null) {
    db.prepare('UPDATE claim_adjustments SET voided_at = ?, voided_reason = ? WHERE id = ?')
      .run(now.toISOString(), reason.trim() || null, id);
  }
  return adjustmentById(db, id)!;
}
