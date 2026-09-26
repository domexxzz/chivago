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
import { claimState, type Funder } from '@chivago/core';
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
  /** Whose report this is. Needed to ask who ELSE was funding. */
  sponsorId: string,
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

  /*
    The approval's DATE comes back now, because exclusivity is decided per
    submission rather than per quest. A quest funded by one partner in January
    and co-funded from March has exclusive January approvals and shared ones
    after - and deciding it per quest would retroactively make a filed claim
    shared because somebody else turned up afterwards.
  */
  interface Approval { userId: string; verifiedAt: string }
  const approvals = new Map<string, Approval[]>();
  for (const r of rows<{ quest_id: string; user_id: string; verified_at: string }>(
    db.prepare(
      `SELECT quest_id, user_id, verified_at FROM quest_progress
       WHERE quest_id IN (${holes}) AND verified_at IS NOT NULL
         AND verified_at >= ? AND verified_at <= ?`,
    ).all(...ids, from, to),
  )) {
    approvals.set(r.quest_id, [
      ...(approvals.get(r.quest_id) ?? []),
      { userId: r.user_id, verifiedAt: r.verified_at },
    ]);
  }

  /*
    EVERY funder of these quests, not only the one asking for the report.

    This is the whole feature. Two companies funding the same cleanup each
    write their report from their own records; neither is lying and neither
    can see the other. It is findable here because both funded through one
    ledger, and this query is the only place that looks across them.
  */
  const funders = new Map<string, Funder[]>();
  for (const r of rows<{ quest_id: string; org_id: string; started_at: string }>(
    db.prepare(
      `SELECT quest_id, org_id, started_at FROM org_sponsorships WHERE quest_id IN (${holes})`,
    ).all(...ids),
  )) {
    funders.set(r.quest_id, [
      ...(funders.get(r.quest_id) ?? []),
      { sponsorId: r.org_id, startedAt: r.started_at },
    ]);
  }

  const classified: EsgActivity[] = [];
  let excludedUnclassified = 0;

  for (const f of funded) {
    const q = quests.get(f.questId);
    const done = approvals.get(f.questId) ?? [];
    const people = done.map((a) => a.userId);
    if (!q) continue;

    if (q.pillar === null || !PILLARS.has(q.pillar)) {
      // Only counts as an exclusion if it actually had activity to exclude. A
      // funded quest nobody did is not a scope gap, it is an empty quest.
      if (people.length > 0) excludedUnclassified += 1;
      continue;
    }

    /*
      An approval nobody was funding at the time is neither exclusive nor
      shared, and is left out of both counts rather than pushed into one. It
      still appears in `verified`, because the work happened - what it is not
      is a claim this partner can make, and `exclusive + shared` is therefore
      the number the exclusivity sentence is written about.
    */
    const mine = funders.get(f.questId) ?? [];
    let exclusiveVerified = 0;
    let sharedVerified = 0;
    for (const a of done) {
      const state = claimState(mine, a.verifiedAt);
      if (state === 'exclusive') exclusiveVerified += 1;
      else if (state === 'shared') sharedVerified += 1;
    }

    classified.push({
      questId: f.questId,
      name: { en: q.name_en, th: q.name_th },
      pillar: q.pillar as EsgPillar,
      hostName: q.host_name ?? 'Unnamed host',
      verified: people.length,
      exclusiveVerified,
      sharedVerified,
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
