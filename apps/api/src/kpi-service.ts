/**
 * What a quest's agreed indicator actually reads, for a period.
 *
 * `kpi.ts` in core decides what a KPI may be and what it refuses to claim.
 * This is the one place those measures meet the database, and every one of
 * them reads rows that already exist for another reason — approvals, the
 * people behind them, the weight a host entered when passing a proof.
 *
 * REVERSALS ARE OUT, like everywhere else. A submission whose award was taken
 * back is not work, and an indicator that counted it would be the eighth
 * instance of the bug the sprint of 24-25 September cleared out of the rest
 * of this codebase.
 */

import { isQuestMeasure, kpiProgress, type KpiProgress, type KpiMeasure, type QuestKpi } from '@chivago/core';
import { row, type DB } from './db.ts';
import { notReversed } from './ledger-sql.ts';

export interface QuestKpiReading extends KpiProgress {
  questId: string;
}

interface QuestRow {
  kpi_measure: string | null;
  kpi_baseline: number | null;
  kpi_target: number | null;
}

/** The KPI a quest was agreed against, or null when none was, or it is not one a quest can carry. */
export function kpiFor(db: DB, questId: string): QuestKpi | null {
  const q = row<QuestRow>(
    db.prepare('SELECT kpi_measure, kpi_baseline, kpi_target FROM quests WHERE id = ?').get(questId),
  );
  if (!q || q.kpi_measure === null || !isQuestMeasure(q.kpi_measure)) return null;
  return {
    measure: q.kpi_measure as KpiMeasure,
    baseline: q.kpi_baseline ?? null,
    target: q.kpi_target ?? null,
  };
}

/**
 * The observed figure, inclusive of both dates.
 *
 * `verified_at` is the date, as it is for the ESG report and the statement:
 * the work is delivered when somebody stands behind it, not when a traveller
 * joined.
 */
export function observedFor(
  db: DB, questId: string, measure: KpiMeasure, period: { from: string; to: string },
): number {
  const from = `${period.from}T00:00:00.000Z`;
  const to = `${period.to}T23:59:59.999Z`;

  /*
    The award is joined back through `source_ref`, which is how the rest of
    this codebase ties a ledger row to its quest, so a reversal can be seen at
    all. A submission with no award row has nothing to reverse and still
    counts - the host approved it, which is what the measure is about.
  */
  const unreversed = `NOT EXISTS (
     SELECT 1 FROM ledger l
      WHERE l.kind = 'quest_reward' AND l.user_id = qp.user_id
        AND l.source_ref = 'quest:' || qp.quest_id || ':user:' || qp.user_id
        AND NOT (${notReversed('l')}))`;

  const where = `qp.quest_id = ? AND qp.verified_at IS NOT NULL
                 AND qp.verified_at >= ? AND qp.verified_at <= ? AND ${unreversed}`;

  if (measure === 'verified_submissions') {
    return row<{ n: number }>(
      db.prepare(`SELECT COUNT(*) AS n FROM quest_progress qp WHERE ${where}`).get(questId, from, to),
    )?.n ?? 0;
  }
  if (measure === 'distinct_participants') {
    return row<{ n: number }>(
      db.prepare(`SELECT COUNT(DISTINCT qp.user_id) AS n FROM quest_progress qp WHERE ${where}`)
        .get(questId, from, to),
    )?.n ?? 0;
  }
  if (measure === 'weight_kg') {
    // Only weight a host entered on a proof they PASSED. A weight on a proof
    // that was turned down is a number somebody typed, not a measurement
    // anybody stood behind.
    return row<{ n: number }>(
      db.prepare(
        `SELECT COALESCE(SUM(p.weight_kg), 0) AS n
           FROM quest_progress qp
           JOIN proofs p ON p.user_id = qp.user_id AND p.quest_id = qp.quest_id AND p.approved = 1
          WHERE ${where}`,
      ).get(questId, from, to),
    )?.n ?? 0;
  }
  // `voucher_value_thb` cannot reach here: `kpiFor` refuses it, because
  // nothing joins a voucher to the quest whose points paid for it.
  return 0;
}

/** The agreed indicator and what it reads, or null when the quest agreed none. */
export function kpiReading(
  db: DB, questId: string, period: { from: string; to: string },
): QuestKpiReading | null {
  const kpi = kpiFor(db, questId);
  if (kpi === null) return null;
  return { questId, ...kpiProgress(kpi, observedFor(db, questId, kpi.measure, period)) };
}
