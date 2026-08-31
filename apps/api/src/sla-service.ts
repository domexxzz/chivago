/**
 * Promises we made about time, and admitting when we have broken them.
 *
 * Two of them, swept together because they are the same failure: a person
 * waiting on a decision, hearing nothing, and reasonably concluding that nobody
 * is coming.
 *
 *  - A proof sitting in `host_verification` past the 24h the design promises.
 *  - An appeal sitting unread past 48h.
 *
 * `quest_review_delayed` has existed as a template since the notification work
 * and was never sent by anything - a promise with no mechanism behind it, which
 * is worse than no promise. This is that mechanism.
 *
 * Nothing here decides anything or moves any state. It only tells the person
 * waiting that they are still waiting, which is the least we owe them.
 */

import { APPEAL_SLA_HOURS, PROOF_SLA_HOURS } from '@chivago/core';
import { rows, type DB } from './db.ts';
import { enqueue } from './notification-service.ts';

export interface SlaSummary {
  /** Volunteers told their proof is still being reviewed. */
  proofsChased: number;
  /** Authors told their appeal is still waiting. */
  appealsChased: number;
}

/**
 * Sweep both. Idempotent: the dedupe key carries the proof or appeal id, so a
 * ticker running every minute chases each one exactly once however long it
 * stays overdue.
 *
 * That is deliberate. A daily reminder that we are still late is nagging, not
 * accountability - and the desk, not the notification, is where the backlog is
 * supposed to be visible.
 */
export function sweepOverdue(db: DB, now = new Date()): SlaSummary {
  const summary: SlaSummary = { proofsChased: 0, appealsChased: 0 };

  const proofCutoff = new Date(now.getTime() - PROOF_SLA_HOURS * 3_600_000).toISOString();
  const overdueProofs = rows<{
    proof_id: string; user_id: string; quest_name: string; host_name: string;
  }>(
    db
      .prepare(
        `SELECT p.id AS proof_id, p.user_id, q.name_en AS quest_name, h.name AS host_name
         FROM proofs p
         JOIN quests q ON q.id = p.quest_id
         JOIN hosts h ON h.id = q.host_id
         WHERE p.reviewed_at IS NULL AND p.submitted_at <= ?`,
      )
      .all(proofCutoff),
  );

  for (const p of overdueProofs) {
    const { created } = enqueue(db, {
      userId: p.user_id,
      kind: 'quest_review_delayed',
      params: { host: p.host_name, quest: p.quest_name },
      data: { screen: 'wallet' },
      dedupeKey: `proof-delayed:${p.proof_id}`,
      now,
    });
    if (created) summary.proofsChased += 1;
  }

  const appealCutoff = new Date(now.getTime() - APPEAL_SLA_HOURS * 3_600_000).toISOString();
  const overdueAppeals = rows<{ appeal_id: string; author_id: string; place_name: string }>(
    db
      .prepare(
        `SELECT a.id AS appeal_id, a.author_id, pl.name_en AS place_name
         FROM review_appeals a
         JOIN place_reviews r ON r.id = a.review_id
         JOIN places pl ON pl.id = r.place_id
         WHERE a.resolved_at IS NULL AND a.created_at <= ?`,
      )
      .all(appealCutoff),
  );

  for (const a of overdueAppeals) {
    const { created } = enqueue(db, {
      userId: a.author_id,
      kind: 'appeal_still_open',
      params: { place: a.place_name },
      data: { screen: 'place' },
      dedupeKey: `appeal-late:${a.appeal_id}`,
      now,
    });
    if (created) summary.appealsChased += 1;
  }

  return summary;
}

/** Appeals past their window, for the desk. The backlog belongs on a screen. */
export function overdueAppealIds(db: DB, now = new Date()): Set<string> {
  const cutoff = new Date(now.getTime() - APPEAL_SLA_HOURS * 3_600_000).toISOString();
  return new Set(
    rows<{ review_id: string }>(
      db
        .prepare(
          `SELECT review_id FROM review_appeals
           WHERE resolved_at IS NULL AND created_at <= ?`,
        )
        .all(cutoff),
    ).map((r) => r.review_id),
  );
}
