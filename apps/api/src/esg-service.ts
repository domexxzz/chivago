/**
 * ESG activity, bounded by a period.
 *
 * The difference from `questCountsFor` next door is the two words that make an
 * ESG report an ESG report: BETWEEN DATES. A sponsor asks what their money has
 * done; a partner filing a report asks what it did in the year they are
 * filing for, and a lifetime-to-date figure in a fiscal-year report is the
 * quiet kind of wrong that survives review.
 *
 * `verified_at` is the date used — the day a host approved the submission, not
 * the day the traveller joined. The work is delivered when somebody stands
 * behind it.
 */

import { rows, type DB } from './db.ts';
import type { EsgActivity, EsgPillar, EsgPeriod } from '@chivago/core';

const PILLARS = new Set<string>(['environmental', 'social', 'governance']);

export interface PeriodActivity {
  classified: EsgActivity[];
  /** Funded quests with activity in the period and no pillar set. */
  excludedUnclassified: number;
}

/**
 * What each funded quest produced inside the period.
 *
 * Participant IDs come back as a list rather than a count, because the report
 * has to count PEOPLE distinctly across activities — somebody who did three
 * cleanups is one person, and summing per-quest counts is how a report says it
 * reached three times as many people as it did.
 */
export function activityInPeriod(
  db: DB,
  funded: { questId: string; fundedTHB: number; perVerifiedTHB: number }[],
  period: EsgPeriod,
): PeriodActivity {
  if (funded.length === 0) return { classified: [], excludedUnclassified: 0 };

  const holes = funded.map(() => '?').join(',');
  const ids = funded.map((f) => f.questId);

  // The period is inclusive of both dates. `verified_at` is an ISO timestamp
  // and `to` is a date, so the upper bound compares against the end of that
  // day — otherwise a report "to 31 December" silently drops 31 December.
  const from = `${period.from}T00:00:00.000Z`;
  const to = `${period.to}T23:59:59.999Z`;

  const quests = new Map(
    rows<{
      id: string; name_en: string; name_th: string; pillar: string | null; host_name: string;
    }>(
      db.prepare(
        `SELECT q.id AS id, q.name_en AS name_en, q.name_th AS name_th,
                q.esg_pillar AS pillar, h.name AS host_name
         FROM quests q
         LEFT JOIN hosts h ON h.id = q.host_id
         WHERE q.id IN (${holes})`,
      ).all(...ids),
    ).map((q) => [q.id, q]),
  );

  const approvals = new Map<string, string[]>();
  for (const r of rows<{ quest_id: string; user_id: string }>(
    db.prepare(
      `SELECT quest_id, user_id FROM quest_progress
       WHERE quest_id IN (${holes}) AND verified_at IS NOT NULL
         AND verified_at >= ? AND verified_at <= ?`,
    ).all(...ids, from, to),
  )) {
    approvals.set(r.quest_id, [...(approvals.get(r.quest_id) ?? []), r.user_id]);
  }

  const classified: EsgActivity[] = [];
  let excludedUnclassified = 0;

  for (const f of funded) {
    const q = quests.get(f.questId);
    const people = approvals.get(f.questId) ?? [];
    if (!q) continue;

    if (q.pillar === null || !PILLARS.has(q.pillar)) {
      // Only counts as an exclusion if it actually had activity to exclude. A
      // funded quest nobody did is not a scope gap, it is an empty quest.
      if (people.length > 0) excludedUnclassified += 1;
      continue;
    }

    classified.push({
      questId: f.questId,
      name: { en: q.name_en, th: q.name_th },
      pillar: q.pillar as EsgPillar,
      hostName: q.host_name ?? 'Unnamed host',
      verified: people.length,
      participants: people,
      fundedTHB: f.fundedTHB,
      // Counted from approvals and capped at what was committed, exactly as
      // the sponsor report does it. A quest cannot pay a host more than its
      // partner put in.
      paidTHB: Math.min(people.length * f.perVerifiedTHB, f.fundedTHB),
    });
  }

  return { classified, excludedUnclassified };
}
