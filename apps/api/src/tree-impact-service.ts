/**
 * Trees are two records, never one: a signed sponsor's promise per verified
 * quest, and a partner's evidence that a physical planting happened. The
 * first can create a pending count; only the second can create planted trees.
 */
import { randomUUID } from 'node:crypto';
import {
  hasPlantingEvidence, plantingFollowsApproval, treeImpactFor,
  type TreeCommitment, type TreeImpact, type TreePlanting, type VerifiedTreeQuest,
} from '@chivago/core';
import { row, rows, transact, type DB } from './db.ts';
import { awardStands } from './ledger-sql.ts';

export class InvalidTreeRecord extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTreeRecord';
  }
}

interface CommitmentRow {
  org_id: string; quest_id: string; trees_per_verified: number; trees_started_at: string;
}

interface PlantingRow {
  id: string; user_id: string; org_id: string; quest_id: string; trees: number;
  partner: string; planted_at: string; lat: number; lng: number;
  photo_url: string; photo_credit: string; photo_licence: string;
}

export function treeCommitmentsFor(db: DB, sponsorId: string): TreeCommitment[] {
  return rows<CommitmentRow>(db.prepare(
    `SELECT org_id, quest_id, trees_per_verified, trees_started_at
     FROM org_sponsorships WHERE org_id = ? AND basis = 'signed'
       AND trees_per_verified IS NOT NULL AND trees_started_at IS NOT NULL`,
  ).all(sponsorId)).map((r) => ({
    sponsorId: r.org_id, questId: r.quest_id,
    treesPerVerified: r.trees_per_verified, startedAt: r.trees_started_at,
  }));
}

const planting = (r: PlantingRow): TreePlanting => ({
  id: r.id, userId: r.user_id, sponsorId: r.org_id, questId: r.quest_id,
  trees: r.trees, partner: r.partner, plantedAt: r.planted_at,
  lat: r.lat, lng: r.lng,
  photo: { url: r.photo_url, credit: r.photo_credit, licence: r.photo_licence },
});

/** A sponsor ratio is explicit, signed, and effective only for future work. */
export function setTreeCommitment(
  db: DB, sponsorId: string, questId: string, treesPerVerified: number, now = new Date(),
): TreeCommitment {
  if (!Number.isSafeInteger(treesPerVerified) || treesPerVerified <= 0) {
    throw new InvalidTreeRecord('Trees per verified quest must be a positive whole number.');
  }
  const sponsorship = row<{
    basis: string; trees_per_verified: number | null; trees_started_at: string | null;
  }>(db.prepare(
    'SELECT basis, trees_per_verified, trees_started_at FROM org_sponsorships WHERE org_id = ? AND quest_id = ?',
  ).get(sponsorId, questId));
  if (!sponsorship || sponsorship.basis !== 'signed') {
    throw new InvalidTreeRecord('A signed sponsorship for this quest is required before promising trees.');
  }
  if (sponsorship.trees_per_verified !== null) {
    if (sponsorship.trees_per_verified !== treesPerVerified) {
      throw new InvalidTreeRecord('A published tree ratio cannot be changed retroactively.');
    }
    return {
      sponsorId, questId, treesPerVerified,
      startedAt: sponsorship.trees_started_at!,
    };
  }
  const startedAt = now.toISOString();
  db.prepare(
    'UPDATE org_sponsorships SET trees_per_verified = ?, trees_started_at = ? WHERE org_id = ? AND quest_id = ?',
  ).run(treesPerVerified, startedAt, sponsorId, questId);
  return { sponsorId, questId, treesPerVerified, startedAt };
}

/** The caller's live approvals, not mere joins or awards later reversed. */
export function treeImpactForUser(db: DB, userId: string, now = new Date()): TreeImpact {
  const verified = rows<{ user_id: string; quest_id: string; verified_at: string }>(
    db.prepare(
      `SELECT qp.user_id, qp.quest_id, qp.verified_at FROM quest_progress qp
       WHERE qp.user_id = ? AND qp.verified_at IS NOT NULL AND ${awardStands('qp')}`,
    ).all(userId),
  ).map((r): VerifiedTreeQuest => ({ userId: r.user_id, questId: r.quest_id, verifiedAt: r.verified_at }));
  const commitments = rows<CommitmentRow>(db.prepare(
    `SELECT org_id, quest_id, trees_per_verified, trees_started_at
     FROM org_sponsorships WHERE basis = 'signed'
       AND trees_per_verified IS NOT NULL AND trees_started_at IS NOT NULL`,
  ).all()).map((r): TreeCommitment => ({
    sponsorId: r.org_id, questId: r.quest_id,
    treesPerVerified: r.trees_per_verified, startedAt: r.trees_started_at,
  }));
  const plantings = rows<PlantingRow>(db.prepare(
    `SELECT p.id, a.user_id, p.org_id, p.quest_id, a.trees, p.partner,
            p.planted_at, p.lat, p.lng, p.photo_url, p.photo_credit, p.photo_licence
     FROM tree_attributions a JOIN tree_plantings p ON p.id = a.planting_id
     WHERE a.user_id = ? ORDER BY p.planted_at, p.id`,
  ).all(userId)).map(planting);
  return treeImpactFor(userId, verified, commitments, plantings, now);
}

export interface RecordTreePlanting {
  userId: string;
  sponsorId: string;
  questId: string;
  trees: number;
  partner: string;
  plantedAt: string;
  lat: number;
  lng: number;
  photo: TreePlanting['photo'];
}

/** Moderator-only write. One batch is attributed to one verified traveller. */
export function recordTreePlanting(
  db: DB, input: RecordTreePlanting, by: string | null, now = new Date(),
): TreePlanting {
  return transact(db, () => {
    const proof: TreePlanting = { id: randomUUID(), ...input };
    if (!hasPlantingEvidence(proof, now)) {
      throw new InvalidTreeRecord('Planting requires a real partner, date, coordinates, trees, and a credited HTTPS photo.');
    }
    const liveApproval = row<{ verified_at: string }>(db.prepare(
      `SELECT qp.verified_at FROM quest_progress qp
       WHERE qp.user_id = ? AND qp.quest_id = ? AND qp.verified_at IS NOT NULL
         AND ${awardStands('qp')}`,
    ).get(input.userId, input.questId));
    if (!liveApproval || !plantingFollowsApproval(proof.plantedAt, liveApproval.verified_at)) {
      throw new InvalidTreeRecord('Planting cannot be attributed before a live host approval.');
    }
    const line = treeImpactForUser(db, input.userId, now).lines.find(
      (l) => l.sponsorId === input.sponsorId && l.questId === input.questId,
    );
    if (!line || input.trees > line.pending) {
      throw new InvalidTreeRecord('Planting exceeds the remaining signed tree promise for this approval.');
    }
    db.prepare(
      `INSERT INTO tree_plantings
       (id, org_id, quest_id, trees, partner, planted_at, lat, lng,
        photo_url, photo_credit, photo_licence, created_at, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(proof.id, proof.sponsorId, proof.questId, proof.trees, proof.partner,
      proof.plantedAt, proof.lat, proof.lng, proof.photo.url, proof.photo.credit,
      proof.photo.licence, now.toISOString(), by);
    db.prepare('INSERT INTO tree_attributions (planting_id, user_id, trees) VALUES (?,?,?)')
      .run(proof.id, proof.userId, proof.trees);
    return proof;
  });
}

/** Physical batches remain counted even if a traveller erases their account. */
export function communityTreesPlanted(db: DB, year: number, now = new Date()): number {
  const batches = rows<Omit<PlantingRow, 'user_id'>>(db.prepare(
    `SELECT id, org_id, quest_id, trees, partner, planted_at, lat, lng,
            photo_url, photo_credit, photo_licence FROM tree_plantings
     WHERE planted_at >= ? AND planted_at < ?`,
  ).all(`${year}-01-01`, `${year + 1}-01-01`));
  return batches.reduce((n, r) => n + (hasPlantingEvidence(planting({ ...r, user_id: '' }), now) ? r.trees : 0), 0);
}
