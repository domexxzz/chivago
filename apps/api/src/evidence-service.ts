/**
 * The rows behind a statement, as they are now.
 *
 * `statement-service.ts` next door issues a record that cannot change. This
 * reads what is under it TODAY, so the two can be compared - see
 * `packages/core/src/evidence.ts` for why that comparison is the point rather
 * than a nicety.
 *
 * NOT PUBLIC, AND THAT IS NOT AN OVERSIGHT. `GET /statements/:id` is open to
 * anyone holding the id because the statement carries counts and no people.
 * This carries a row per approval, with a reviewer's name and a photograph
 * count, and a row per approval is a person's day even without their name on
 * it. It is read through the host console, by the host whose statement it is.
 */

import { createHash } from 'node:crypto';
import { rows, type DB } from './db.ts';
import { attainedLevel, isEvidenceLevel } from '@chivago/core';
import type { EvidenceItem, EvidenceLevel, EvidenceStanding } from '@chivago/core';

/**
 * A participant reference: stable inside one statement, worthless outside it.
 *
 * The statement id goes into the hash, so the same traveller appearing in two
 * statements gets two unrelated references and the two packs cannot be joined.
 * That is the property the document promises, so it is the one the code has to
 * actually have - a plain hash of the user id would read the same on the page
 * and quietly allow exactly the matching it says is impossible.
 */
const refFor = (statementId: string, userId: string): string =>
  `P-${createHash('sha256').update(`${statementId}\u0000${userId}`).digest('hex').slice(0, 8).toUpperCase()}`;

interface Row {
  quest_id: string;
  name_en: string;
  name_th: string;
  user_id: string;
  verified_at: string | null;
  reviewed_by: string | null;
  approved: number | null;
  weight_kg: number | null;
  photos: number;
  evidence_level: number | null;
  fence_enforced: number | null;
}

/**
 * Every approval the statement's period and host covers, with what is left of
 * its evidence.
 *
 * Read from `proofs` outward rather than from `quest_progress`, because the
 * proof is where the withdrawal shows: a host who takes an approval back sets
 * `approved = 0` on the proof, and `quest_progress.verified_at` can still be
 * sitting there from the day it was first passed. Starting at the progress row
 * would report a withdrawn approval as standing, which is the one answer this
 * whole file exists to get right.
 */
export function evidenceFor(
  db: DB,
  statementId: string,
  hostId: string,
  period: { from: string; to: string },
): EvidenceItem[] {
  const from = `${period.from}T00:00:00.000Z`;
  const to = `${period.to}T23:59:59.999Z`;

  return rows<Row>(
    db.prepare(
      `SELECT qp.quest_id, q.name_en, q.name_th, qp.user_id, qp.verified_at,
              q.evidence_level AS evidence_level, qp.fence_enforced AS fence_enforced,
              p.reviewed_by AS reviewed_by, p.approved AS approved, p.weight_kg AS weight_kg,
              (SELECT COUNT(*) FROM proof_files f WHERE f.proof_id = p.id) AS photos
         FROM quest_progress qp
         JOIN quests q ON q.id = qp.quest_id
         LEFT JOIN proofs p ON p.user_id = qp.user_id AND p.quest_id = qp.quest_id
        WHERE q.host_id = ? AND qp.verified_at IS NOT NULL
          AND qp.verified_at >= ? AND qp.verified_at <= ?
        ORDER BY qp.verified_at, qp.quest_id`,
    ).all(hostId, from, to),
  ).map((r) => ({
    questId: r.quest_id,
    questName: { en: r.name_en, th: r.name_th },
    day: (r.verified_at ?? '').slice(0, 10),
    verifiedAt: r.verified_at ?? '',
    reviewedBy: r.reviewed_by,
    participantRef: refFor(statementId, r.user_id),
    photos: r.photos ?? 0,
    weightKg: r.weight_kg ?? null,
    standing: standingOf(r),
    requiredLevel: r.evidence_level !== null && isEvidenceLevel(r.evidence_level)
      ? (r.evidence_level as EvidenceLevel)
      : null,
    attainedLevel: attainedLevel({
      submitted: true,
      /*
        ONLY when the row says the fence was checked.

        `CHIVAGO_FENCE_OFF` opens the geofence for a whole deployment and
        production has had it open since the pitch, so an arrival on its own
        proves nothing about where anybody was. Rows written before that was
        recorded are NULL, and unknown does not earn a rung.
      */
      geofencedArrival: r.fence_enforced === 1,
      photos: r.photos ?? 0,
      partnerApproved: r.approved === 1,
      reviewerNamed: r.reviewed_by !== null,
    }),
  }));
}

/**
 * Three answers, and the difference between the last two matters.
 *
 * `withdrawn` is a decision a named person made and can be asked about.
 * `gone` is a row that is not there - a proof deleted, a quest removed - which
 * is a different conversation and a worse one. Collapsing them into "not
 * standing" would hide which of the two an assurer is looking at.
 */
function standingOf(r: Row): EvidenceStanding {
  if (r.approved === null) return 'gone';
  return r.approved === 1 ? 'approved' : 'withdrawn';
}
