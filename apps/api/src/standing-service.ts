/**
 * The standing, read from what actually happened.
 *
 * Both halves come from rows a human action wrote: `quest_progress` carries
 * the timestamp of every stage transition, so `verified` here is the same
 * fact a host clicked Approve on, and the Green totals come from the ledger
 * rather than from a quest's advertised reward — a reward can be edited, a
 * ledger row cannot.
 *
 * Nothing in this file counts Trip Points. That is not an oversight and
 * `standing.ts` in core has no field for them: a table ranked on a
 * self-verified currency ranks willingness to claim.
 */

import { rows, type DB } from './db.ts';
import type { HostStanding, TravellerStanding, HostType } from '@chivago/core';

/**
 * Every host with a quest, and what their reviewing actually produced.
 *
 * LEFT JOIN, not INNER: a host who has posted a quest nobody has done yet
 * belongs in the table at zero. Dropping them would quietly make the board a
 * list of successful hosts and hide the ones who need travellers sent to them,
 * which is the opposite of what this screen is for.
 */
export function hostStandings(db: DB): HostStanding[] {
  const counts = rows<{
    host_id: string; name: string; type: string;
    quests_posted: number; verified: number; pending: number;
  }>(
    db.prepare(
      `SELECT h.id                        AS host_id,
              h.name                      AS name,
              h.type                      AS type,
              COUNT(DISTINCT q.id)        AS quests_posted,
              COUNT(p.verified_at)        AS verified,
              -- Arrived or submitted, and not yet decided either way.
              SUM(CASE WHEN p.verified_at IS NULL AND p.rejected_at IS NULL
                        AND p.proof_submitted_at IS NOT NULL THEN 1 ELSE 0 END) AS pending
       FROM hosts h
       LEFT JOIN quests q         ON q.host_id = h.id
       LEFT JOIN quest_progress p ON p.quest_id = q.id
       GROUP BY h.id`,
    ).all(),
  );

  // Green issued, per host, through the quests they own. Read from the ledger
  // and joined back to the quest by the source_ref this codebase already uses
  // as its idempotency key, so there is no second record of the same award.
  const green = new Map(
    rows<{ host_id: string; total: number }>(
      db.prepare(
        `SELECT q.host_id AS host_id, SUM(l.amount) AS total
         FROM ledger l
         JOIN quests q
           ON q.id = substr(l.source_ref, 7, instr(substr(l.source_ref, 7), ':') - 1)
         WHERE l.kind = 'quest_reward' AND l.currency = 'green' AND l.amount > 0
         GROUP BY q.host_id`,
      ).all(),
    ).map((r) => [r.host_id, r.total]),
  );

  return counts.map((r) => ({
    hostId: r.host_id,
    name: r.name,
    type: r.type as HostType,
    verified: r.verified,
    pending: r.pending,
    questsPosted: r.quests_posted,
    greenIssued: green.get(r.host_id) ?? 0,
  }));
}

/**
 * Every traveller, and the only two figures about them worth ranking.
 *
 * `greenVerified` counts QUEST REWARDS ONLY, and this is the whole point of
 * the function. Summing every positive green row instead looked right and was
 * not: the pilot hands every traveller a 1,240-point opening balance as an
 * `adjustment`, so two thirds of the demo account's "verified" total was a
 * gift the platform gave itself credit for. A board ranked on that ranks who
 * signed up, which is the exact failure this whole feature exists to avoid.
 * `quest_reward` is the only kind a host has to approve.
 *
 * Spending is not subtracted either: a traveller who redeemed a voucher has
 * not undone the work that earned it, and netting it off would rank people on
 * how little they had spent. The wallet balance is a different question and
 * lives elsewhere.
 */
export function travellerStandings(db: DB): TravellerStanding[] {
  return rows<{
    user_id: string; display_name: string; green: number; missions: number;
  }>(
    db.prepare(
      `SELECT u.id           AS user_id,
              u.display_name AS display_name,
              COALESCE(SUM(CASE WHEN l.currency = 'green' AND l.amount > 0
                                 AND l.kind = 'quest_reward'
                                THEN l.amount ELSE 0 END), 0) AS green,
              COUNT(DISTINCT CASE WHEN l.kind = 'quest_reward' AND l.currency = 'green'
                                  THEN l.source_ref END)      AS missions
       FROM users u
       LEFT JOIN ledger l ON l.user_id = u.id
       GROUP BY u.id`,
    ).all(),
  ).map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    greenVerified: r.green,
    missionsVerified: r.missions,
  }));
}
