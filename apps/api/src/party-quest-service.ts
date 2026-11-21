import { randomBytes } from 'node:crypto';
import {
  isPartyQuestMode, isPartyQuestType,
  type PartyQuestInstance, type PartyQuestMode, type PartyQuestParticipant,
  type PartyQuestProgressSummary, type PartyQuestType,
} from '@chivago/core';
import { row, rows, transact, type DB } from './db.ts';
import { getQuest } from './repo.ts';
import { getProgress } from './quest-service.ts';
import { applyMovement } from './wallet-service.ts';
import { recordTravelEvent } from './travel-event-service.ts';

export const PARTY_QUEST_RULES_VERSION = 'party-quest-foundation-v1';

export class PartyQuestError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(
    code: string,
    message: string,
    status = 400,
  ) {
    super(message);
    this.name = 'PartyQuestError';
    this.code = code;
    this.status = status;
  }
}

type InstanceRow = {
  id: string; party_id: string; quest_id: string; quest_type: string; quest_mode: string;
  state: string; rules_version: string; quest_snapshot: string; selected_by: string;
  selected_at: string; started_at: string | null; roster_locked_at: string | null;
  cancelled_at: string | null; deadline_at: string | null; completed_at: string | null;
  rewarded_at: string | null; reward_policy_json: string;
};

type ParticipantRow = {
  user_id: string; display_name_snapshot: string; owner_at_start: number;
  membership_status: 'active' | 'left'; rostered_at: string; left_party_at: string | null;
  rejoined_at: string | null; completed_at: string | null;
  assignment: string | null;
};

const participantsFor = (db: DB, instanceId: string): PartyQuestParticipant[] =>
  rows<ParticipantRow>(db.prepare(
    `SELECT p.user_id,p.display_name_snapshot,p.owner_at_start,p.membership_status,
            p.rostered_at,p.left_party_at,p.rejoined_at,p.completed_at,a.assignment
       FROM party_quest_participants p
       LEFT JOIN party_quest_assignments a ON a.party_quest_id=p.party_quest_id AND a.user_id=p.user_id
       WHERE p.party_quest_id=? ORDER BY p.rostered_at,p.user_id`,
  ).all(instanceId)).map((p) => ({
    userId: p.user_id,
    displayName: p.display_name_snapshot,
    ownerAtStart: p.owner_at_start === 1,
    membershipStatus: p.membership_status,
    rosteredAt: p.rostered_at,
    leftPartyAt: p.left_party_at,
    rejoinedAt: p.rejoined_at,
    completedAt: p.completed_at,
    assignment: p.assignment,
  }));

const toInstance = (db: DB, found: InstanceRow): PartyQuestInstance => {
  let snapshot: Record<string, unknown> = {};
  try { snapshot = JSON.parse(found.quest_snapshot) as Record<string, unknown>; } catch { /* stored server JSON */ }
  return {
    id: found.id,
    partyId: found.party_id,
    questId: found.quest_id,
    questType: found.quest_type as PartyQuestType,
    questMode: found.quest_mode as PartyQuestMode,
    state: found.state as PartyQuestInstance['state'],
    rulesVersion: found.rules_version,
    questSnapshot: snapshot,
    selectedBy: found.selected_by,
    selectedAt: found.selected_at,
    startedAt: found.started_at,
    rosterLockedAt: found.roster_locked_at,
    cancelledAt: found.cancelled_at,
    deadlineAt: found.deadline_at,
    completedAt: found.completed_at,
    rewardedAt: found.rewarded_at,
    participants: participantsFor(db, found.id),
  };
};

const activeMembership = (db: DB, userId: string) => row<{ party_id: string; created_by: string }>(db.prepare(
  `SELECT p.id AS party_id,p.created_by FROM parties p
     JOIN party_members m ON m.party_id=p.id
    WHERE m.user_id=? AND m.left_at IS NULL AND p.disbanded_at IS NULL LIMIT 1`,
).get(userId));

const instanceRow = (db: DB, id: string) => row<InstanceRow>(
  db.prepare('SELECT * FROM party_quest_instances WHERE id=?').get(id),
);

const requireReadable = (db: DB, userId: string, id: string): InstanceRow => {
  const found = row<InstanceRow>(db.prepare(
    `SELECT i.* FROM party_quest_instances i
      WHERE i.id=? AND (
        EXISTS (SELECT 1 FROM party_members m WHERE m.party_id=i.party_id AND m.user_id=? AND m.left_at IS NULL)
        OR EXISTS (SELECT 1 FROM party_quest_participants r WHERE r.party_quest_id=i.id AND r.user_id=?)
      )`,
  ).get(id, userId, userId));
  if (!found) throw new PartyQuestError('PARTY_QUEST_NOT_FOUND', 'Party Quest not found.', 404);
  return found;
};

export function selectPartyQuest(
  db: DB,
  userId: string,
  input: { questId?: unknown; questType?: unknown; questMode?: unknown },
  now = new Date(),
): PartyQuestInstance {
  if (typeof input.questId !== 'string' || !input.questId) throw new PartyQuestError('QUEST_REQUIRED', 'Choose a Quest.');
  if (!isPartyQuestType(input.questType)) throw new PartyQuestError('INVALID_QUEST_TYPE', 'Choose a valid Party Quest type.');
  if (!isPartyQuestMode(input.questMode)) throw new PartyQuestError('INVALID_QUEST_MODE', 'Choose a valid Party Quest mode.');
  const questId = input.questId;
  const questType = input.questType;
  const questMode = input.questMode;
  return transact(db, () => {
    const membership = activeMembership(db, userId);
    if (!membership) throw new PartyQuestError('NO_PARTY', 'You are not in an active party.', 404);
    if (membership.created_by !== userId) throw new PartyQuestError('OWNER_ONLY', 'Only the Party Owner can select a Quest.', 403);
    const quest = getQuest(db, questId);
    if (!quest) throw new PartyQuestError('QUEST_NOT_FOUND', 'That Quest is not available.', 404);
    const active = row<{ id: string }>(db.prepare(
      `SELECT id FROM party_quest_instances WHERE party_id=? AND state IN ('selected','in_progress','verifying') LIMIT 1`,
    ).get(membership.party_id));
    if (active) throw new PartyQuestError('PARTY_QUEST_ACTIVE', 'Finish or cancel the current Party Quest first.', 409);
    const id = `pq_${randomBytes(9).toString('base64url')}`;
    const iso = now.toISOString();
    db.prepare(
      `INSERT INTO party_quest_instances
       (id,party_id,quest_id,quest_type,quest_mode,state,rules_version,quest_snapshot,reward_policy_json,selected_by,selected_at)
       VALUES (?,?,?,?,?,'selected',?,?,?,?,?)`,
    ).run(id, membership.party_id, quest.id, questType, questMode,
      PARTY_QUEST_RULES_VERSION, JSON.stringify(quest), JSON.stringify({
        individualReward: 'existing_quest_ledger',
        teamBonusTripPoints: Math.max(0, Math.floor((quest.rewardPoints ?? 0) * 0.25)),
      }), userId, iso);
    return toInstance(db, instanceRow(db, id)!);
  });
}

export function startPartyQuest(db: DB, userId: string, id: string, now = new Date()): PartyQuestInstance {
  return transact(db, () => {
    const found = instanceRow(db, id);
    if (!found) throw new PartyQuestError('PARTY_QUEST_NOT_FOUND', 'Party Quest not found.', 404);
    const membership = activeMembership(db, userId);
    if (!membership || membership.party_id !== found.party_id) throw new PartyQuestError('PARTY_QUEST_NOT_FOUND', 'Party Quest not found.', 404);
    if (membership.created_by !== userId) throw new PartyQuestError('OWNER_ONLY', 'Only the Party Owner can start a Quest.', 403);
    if (found.state === 'in_progress') return toInstance(db, found);
    if (found.state !== 'selected') throw new PartyQuestError('INVALID_QUEST_STATE', 'This Party Quest cannot be started.', 409);

    const roster = rows<{ user_id: string; display_name: string }>(db.prepare(
      `SELECT m.user_id,u.display_name FROM party_members m JOIN users u ON u.id=m.user_id
        WHERE m.party_id=? AND m.left_at IS NULL ORDER BY m.joined_at,m.user_id`,
    ).all(found.party_id));
    if (roster.length === 0) throw new PartyQuestError('EMPTY_PARTY', 'The party has no active members.', 409);
    const iso = now.toISOString();
    for (const member of roster) {
      db.prepare(
        `INSERT INTO party_quest_participants
         (party_quest_id,user_id,display_name_snapshot,owner_at_start,membership_status,rostered_at)
         VALUES (?,?,?,?, 'active',?)`,
      ).run(id, member.user_id, member.display_name, member.user_id === membership.created_by ? 1 : 0, iso);
    }
    const deadline = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();
    const changed = db.prepare(
      `UPDATE party_quest_instances SET state='in_progress',started_at=?,roster_locked_at=?,deadline_at=?
        WHERE id=? AND state='selected'`,
    ).run(iso, iso, deadline, id);
    if (Number(changed.changes ?? 0) !== 1) throw new PartyQuestError('INVALID_QUEST_STATE', 'This Party Quest cannot be started.', 409);
    return toInstance(db, instanceRow(db, id)!);
  });
}

export function cancelPartyQuest(db: DB, userId: string, id: string, now = new Date()): PartyQuestInstance {
  return transact(db, () => {
    const found = instanceRow(db, id);
    if (!found) throw new PartyQuestError('PARTY_QUEST_NOT_FOUND', 'Party Quest not found.', 404);
    const membership = activeMembership(db, userId);
    if (!membership || membership.party_id !== found.party_id) throw new PartyQuestError('PARTY_QUEST_NOT_FOUND', 'Party Quest not found.', 404);
    if (membership.created_by !== userId) throw new PartyQuestError('OWNER_ONLY', 'Only the Party Owner can cancel a Quest.', 403);
    if (!['selected', 'in_progress'].includes(found.state)) throw new PartyQuestError('INVALID_QUEST_STATE', 'This Party Quest cannot be cancelled.', 409);
    db.prepare(`UPDATE party_quest_instances SET state='cancelled',cancelled_at=? WHERE id=?`).run(now.toISOString(), id);
    return toInstance(db, instanceRow(db, id)!);
  });
}

export function getPartyQuest(db: DB, userId: string, id: string): PartyQuestInstance {
  return toInstance(db, requireReadable(db, userId, id));
}

/**
 * Project the locked Party Quest roster onto the existing, server-owned Quest
 * state machine. No parallel progress table and no client-authored percentage.
 */
export function partyQuestProgress(db: DB, userId: string, id: string): PartyQuestProgressSummary {
  const found = requireReadable(db, userId, id);
  const instance = toInstance(db, found);
  const participants = instance.participants.map((participant) => {
    const progress = getProgress(db, participant.userId, instance.questId);
    if (progress?.stage === 'complete' && participant.completedAt === null) {
      db.prepare('UPDATE party_quest_participants SET completed_at=? WHERE party_quest_id=? AND user_id=? AND completed_at IS NULL')
        .run(progress.verifiedAt ?? new Date().toISOString(), id, participant.userId);
    }
    return {
      userId: participant.userId,
      displayName: participant.displayName,
      membershipStatus: participant.membershipStatus,
      stage: progress?.stage ?? null,
      verifiedAt: progress?.verifiedAt ?? null,
      verifiedWeightKg: progress?.stage === 'complete' ? (progress.weightKg ?? null) : null,
      assignment: participant.assignment,
      contribution: progress?.stage === 'complete' ? (progress.weightKg ?? 1) : 0,
    };
  });
  const completedCount = participants.filter((participant) => participant.stage === 'complete').length;
  const pendingReviewCount = participants.filter((participant) => participant.stage === 'host_verification').length;
  const weights = participants
    .map((participant) => participant.verifiedWeightKg)
    .filter((weight): weight is number => weight !== null);
  const allComplete = participants.length > 0 && completedCount === participants.length;
  const cooperativeReady = allComplete && participants.every((participant) => participant.assignment !== null);
  const snapshotTarget = typeof instance.questSnapshot.kpiTarget === 'number' ? instance.questSnapshot.kpiTarget : null;
  const collectiveReady = snapshotTarget !== null && weights.length > 0
    ? weights.reduce((sum, weight) => sum + weight, 0) >= snapshotTarget : allComplete;
  const completionReady = instance.questMode === 'collective' ? collectiveReady
    : instance.questMode === 'cooperative' ? cooperativeReady : allComplete;
  return {
    partyQuestId: instance.id,
    questId: instance.questId,
    rosterSize: participants.length,
    completedCount,
    pendingReviewCount,
    progressPercent: participants.length === 0 ? 0 : Math.round((completedCount / participants.length) * 100),
    totalVerifiedWeightKg: weights.length > 0 ? Number(weights.reduce((sum, weight) => sum + weight, 0).toFixed(2)) : null,
    completionReady,
    deadlineAt: instance.deadlineAt,
    participants,
  };
}

/** Owner assigns distinct responsibilities; only locked roster members are eligible. */
export function assignPartyQuestMember(
  db: DB, userId: string, id: string, memberId: string, assignment: unknown, now = new Date(),
): PartyQuestInstance {
  const found = requireReadable(db, userId, id);
  const membership = activeMembership(db, userId);
  if (!membership || membership.party_id !== found.party_id || membership.created_by !== userId) {
    throw new PartyQuestError('OWNER_ONLY', 'Only the Party Owner can assign work.', 403);
  }
  if (found.state !== 'in_progress') throw new PartyQuestError('INVALID_QUEST_STATE', 'Assignments require an active Party Quest.', 409);
  if (typeof assignment !== 'string' || assignment.trim().length < 1 || assignment.trim().length > 120) {
    throw new PartyQuestError('ASSIGNMENT_INVALID', 'Assignment must be 1–120 characters.');
  }
  if (!row(db.prepare('SELECT user_id FROM party_quest_participants WHERE party_quest_id=? AND user_id=?').get(id, memberId))) {
    throw new PartyQuestError('PARTICIPANT_NOT_FOUND', 'That member is not in the locked roster.', 404);
  }
  db.prepare(
    `INSERT INTO party_quest_assignments (party_quest_id,user_id,assignment,assigned_by,assigned_at)
     VALUES (?,?,?,?,?) ON CONFLICT(party_quest_id,user_id) DO UPDATE SET
       assignment=excluded.assignment,assigned_by=excluded.assigned_by,assigned_at=excluded.assigned_at`,
  ).run(id, memberId, assignment.trim(), userId, now.toISOString());
  return toInstance(db, instanceRow(db, id)!);
}

/** Validate team completion, distribute one idempotent bonus, then close it. */
export function completePartyQuest(db: DB, userId: string, id: string, now = new Date()): PartyQuestInstance {
  const before = requireReadable(db, userId, id);
  if (before.state === 'in_progress' && before.deadline_at && now.toISOString() > before.deadline_at) {
    db.prepare("UPDATE party_quest_instances SET state='expired' WHERE id=? AND state='in_progress'").run(id);
    throw new PartyQuestError('PARTY_QUEST_EXPIRED', 'This Party Quest deadline has passed.', 409);
  }
  return transact(db, () => {
    const found = requireReadable(db, userId, id);
    if (!['in_progress', 'completed', 'rewarded'].includes(found.state)) {
      throw new PartyQuestError('INVALID_QUEST_STATE', 'This Party Quest cannot be completed.', 409);
    }
    if (found.state === 'rewarded') return toInstance(db, found);
    if (found.deadline_at && now.toISOString() > found.deadline_at) {
      throw new PartyQuestError('PARTY_QUEST_EXPIRED', 'This Party Quest deadline has passed.', 409);
    }
    const progress = partyQuestProgress(db, userId, id);
    if (!progress.completionReady) throw new PartyQuestError('PARTY_QUEST_INCOMPLETE', 'The team requirements are not complete.', 409);
    const completedAt = found.completed_at ?? now.toISOString();
    db.prepare("UPDATE party_quest_instances SET state='completed',completed_at=? WHERE id=? AND state='in_progress'")
      .run(completedAt, id);
    let policy: { teamBonusTripPoints?: number } = {};
    try { policy = JSON.parse(found.reward_policy_json) as { teamBonusTripPoints?: number }; } catch { /* fail to zero */ }
    const bonus = Number.isInteger(policy.teamBonusTripPoints) && (policy.teamBonusTripPoints ?? 0) > 0 ? policy.teamBonusTripPoints! : 0;
    for (const participant of participantsFor(db, id)) {
      if (bonus > 0) applyMovement(db, {
        userId: participant.userId, label: 'Party Quest team completion', subject: String(JSON.parse(found.quest_snapshot).name?.en ?? found.quest_id),
        host: 'ChivaGo Party', amount: bonus, currency: 'trip', exp: bonus,
        kind: 'party_reward', sourceRef: `party-quest:${id}:user:${participant.userId}`, occurredAt: completedAt,
      });
      recordTravelEvent(db, {
        userId: participant.userId, type: 'PARTY_QUEST_COMPLETED', sourceKind: 'party_quest',
        sourceRef: `${id}:user:${participant.userId}`, questId: found.quest_id, partyId: found.party_id,
        occurredAt: completedAt, metadata: { mode: found.quest_mode, contribution: progress.participants.find((p) => p.userId === participant.userId)?.contribution ?? 0 },
      });
    }
    db.prepare("UPDATE party_quest_instances SET state='rewarded',rewarded_at=? WHERE id=?")
      .run(now.toISOString(), id);
    return toInstance(db, instanceRow(db, id)!);
  });
}

export function currentPartyQuest(db: DB, userId: string): PartyQuestInstance | null {
  const membership = activeMembership(db, userId);
  if (!membership) return null;
  const found = row<InstanceRow>(db.prepare(
    `SELECT * FROM party_quest_instances WHERE party_id=?
      AND state IN ('selected','in_progress','verifying') ORDER BY selected_at DESC LIMIT 1`,
  ).get(membership.party_id));
  return found ? toInstance(db, found) : null;
}

export function partyQuestHistory(db: DB, userId: string): PartyQuestInstance[] {
  return rows<InstanceRow>(db.prepare(
    `SELECT DISTINCT i.* FROM party_quest_instances i
       LEFT JOIN party_quest_participants r ON r.party_quest_id=i.id
      WHERE i.selected_by=? OR r.user_id=? ORDER BY i.selected_at DESC LIMIT 100`,
  ).all(userId, userId)).map((found) => toInstance(db, found));
}

/** Membership hooks preserve a locked roster without admitting late joiners. */
export function markPartyQuestMemberLeft(db: DB, partyId: string, userId: string, now = new Date()): void {
  db.prepare(
    `UPDATE party_quest_participants SET membership_status='left',left_party_at=?
      WHERE user_id=? AND party_quest_id IN (
        SELECT id FROM party_quest_instances WHERE party_id=? AND state IN ('in_progress','verifying')
      )`,
  ).run(now.toISOString(), userId, partyId);
}

export function resumePartyQuestMember(db: DB, partyId: string, userId: string, now = new Date()): void {
  db.prepare(
    `UPDATE party_quest_participants SET membership_status='active',rejoined_at=?
      WHERE user_id=? AND party_quest_id IN (
        SELECT id FROM party_quest_instances WHERE party_id=? AND state IN ('in_progress','verifying')
      )`,
  ).run(now.toISOString(), userId, partyId);
}
