import { strict as assert } from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { openTestDb, type DB } from './db-node.ts';
import { createParty, joinParty, leaveParty, transferPartyOwnership } from './party-service.ts';
import {
  PartyQuestError, assignPartyQuestMember, completePartyQuest, currentPartyQuest,
  getPartyQuest, partyQuestHistory, partyQuestProgress, selectPartyQuest, startPartyQuest,
} from './party-quest-service.ts';

let db: DB;
const at = (second: number) => new Date(`2026-11-17T00:00:${String(second).padStart(2, '0')}.000Z`);

const user = (id: string, name: string) =>
  db.prepare('INSERT INTO users (id,display_name,created_at) VALUES (?,?,?)').run(id, name, at(0).toISOString());

beforeEach(() => {
  db = openTestDb();
  user('owner', 'Owner'); user('member', 'Member'); user('late', 'Late'); user('outside', 'Outside');
  db.prepare("INSERT INTO hosts (id,name,type) VALUES ('host','Host','community')").run();
  db.prepare(
    `INSERT INTO quests
     (id,code,name_en,name_th,where_label,duration,reward_points,host_id,kind,lat,lng,geofence_radius_m)
     VALUES ('quest','TQ-01','Explore','สำรวจ','Island','45 min',100,'host','today',13.1,100.8,100)`,
  ).run();
});

describe('party quest foundation', () => {
  test('only the owner selects and starts, and type is independent from mode', () => {
    const { code } = createParty(db, 'owner', 'Crew', at(1));
    joinParty(db, 'member', code, at(2));
    assert.throws(
      () => selectPartyQuest(db, 'member', { questId: 'quest', questType: 'eco', questMode: 'collective' }, at(3)),
      (error: unknown) => error instanceof PartyQuestError && error.code === 'OWNER_ONLY',
    );
    const selected = selectPartyQuest(db, 'owner', {
      questId: 'quest', questType: 'exploration', questMode: 'all_members',
    }, at(3));
    assert.equal(selected.state, 'selected');
    assert.equal(selected.questType, 'exploration');
    assert.equal(selected.questMode, 'all_members');
    assert.throws(
      () => startPartyQuest(db, 'member', selected.id, at(4)),
      (error: unknown) => error instanceof PartyQuestError && error.code === 'OWNER_ONLY',
    );
  });

  test('start atomically locks every active member and excludes later joins', () => {
    const { code } = createParty(db, 'owner', 'Crew', at(1));
    joinParty(db, 'member', code, at(2));
    const selected = selectPartyQuest(db, 'owner', {
      questId: 'quest', questType: 'eco', questMode: 'collective',
    }, at(3));
    const started = startPartyQuest(db, 'owner', selected.id, at(4));
    assert.equal(started.state, 'in_progress');
    assert.deepEqual(started.participants.map((p) => p.userId).sort(), ['member', 'owner']);
    assert.equal(started.participants.find((p) => p.userId === 'owner')!.ownerAtStart, true);
    joinParty(db, 'late', code, at(5));
    assert.deepEqual(getPartyQuest(db, 'late', started.id).participants.map((p) => p.userId).sort(), ['member', 'owner']);
  });

  test('leaving preserves the roster and rejoining restores participation', () => {
    const { code } = createParty(db, 'owner', 'Crew', at(1));
    joinParty(db, 'member', code, at(2));
    const selected = selectPartyQuest(db, 'owner', {
      questId: 'quest', questType: 'boss', questMode: 'all_members',
    }, at(3));
    startPartyQuest(db, 'owner', selected.id, at(4));
    leaveParty(db, 'member', at(5));
    assert.equal(getPartyQuest(db, 'member', selected.id).participants.find((p) => p.userId === 'member')!.membershipStatus, 'left');
    joinParty(db, 'member', code, at(6));
    const resumed = currentPartyQuest(db, 'member')!;
    assert.equal(resumed.participants.find((p) => p.userId === 'member')!.membershipStatus, 'active');
    assert.equal(resumed.participants.length, 2);
  });

  test('an owner transfers before leaving and remains in the original roster', () => {
    const { code } = createParty(db, 'owner', 'Crew', at(1));
    joinParty(db, 'member', code, at(2));
    const selected = selectPartyQuest(db, 'owner', {
      questId: 'quest', questType: 'boss', questMode: 'all_members',
    }, at(3));
    startPartyQuest(db, 'owner', selected.id, at(4));
    transferPartyOwnership(db, 'owner', 'member', at(5));
    leaveParty(db, 'owner', at(6));
    const current = currentPartyQuest(db, 'member')!;
    assert.equal(current.participants.length, 2);
    assert.equal(current.participants.find((p) => p.userId === 'owner')!.membershipStatus, 'left');
    assert.equal(current.participants.find((p) => p.userId === 'owner')!.ownerAtStart, true);
  });

  test('cross-party users cannot read an instance and roster members keep history', () => {
    createParty(db, 'owner', 'Crew', at(1));
    const selected = selectPartyQuest(db, 'owner', {
      questId: 'quest', questType: 'local', questMode: 'individual',
    }, at(2));
    startPartyQuest(db, 'owner', selected.id, at(3));
    assert.throws(
      () => getPartyQuest(db, 'outside', selected.id),
      (error: unknown) => error instanceof PartyQuestError && error.code === 'PARTY_QUEST_NOT_FOUND',
    );
    assert.equal(partyQuestHistory(db, 'owner')[0]!.id, selected.id);
  });

  test('progress is projected from verified legacy Quest facts and never client percentages', () => {
    const { code } = createParty(db, 'owner', 'Eco crew', at(1));
    joinParty(db, 'member', code, at(2));
    const selected = selectPartyQuest(db, 'owner', {
      questId: 'quest', questType: 'eco', questMode: 'collective',
    }, at(3));
    startPartyQuest(db, 'owner', selected.id, at(4));
    db.prepare(
      `INSERT INTO quest_progress (user_id,quest_id,stage,joined_at,verified_at)
       VALUES ('owner','quest','complete',?,?)`,
    ).run(at(5).toISOString(), at(8).toISOString());
    db.prepare(
      `INSERT INTO proofs (id,user_id,quest_id,photos,weight_kg,submitted_at,reviewed_at,approved)
       VALUES ('proof-owner','owner','quest','[]',2.75,?,?,1)`,
    ).run(at(6).toISOString(), at(8).toISOString());
    db.prepare(
      `INSERT INTO quest_progress (user_id,quest_id,stage,joined_at,proof_submitted_at)
       VALUES ('member','quest','host_verification',?,?)`,
    ).run(at(5).toISOString(), at(7).toISOString());

    const progress = partyQuestProgress(db, 'member', selected.id);
    assert.equal(progress.rosterSize, 2);
    assert.equal(progress.completedCount, 1);
    assert.equal(progress.pendingReviewCount, 1);
    assert.equal(progress.progressPercent, 50);
    assert.equal(progress.totalVerifiedWeightKg, 2.75);
    assert.equal(progress.participants.find((p) => p.userId === 'owner')?.verifiedWeightKg, 2.75);
    assert.throws(
      () => partyQuestProgress(db, 'outside', selected.id),
      (error: unknown) => error instanceof PartyQuestError && error.code === 'PARTY_QUEST_NOT_FOUND',
    );
  });

  test('cooperative work requires a server-stored assignment for every locked member', () => {
    const { code } = createParty(db, 'owner', 'Co-op crew', at(1));
    joinParty(db, 'member', code, at(2));
    const selected = selectPartyQuest(db, 'owner', {
      questId: 'quest', questType: 'local', questMode: 'cooperative',
    }, at(3));
    startPartyQuest(db, 'owner', selected.id, at(4));
    for (const id of ['owner', 'member']) {
      db.prepare(`INSERT INTO quest_progress (user_id,quest_id,stage,joined_at,verified_at) VALUES (?,'quest','complete',?,?)`)
        .run(id, at(5).toISOString(), at(6).toISOString());
    }
    assert.equal(partyQuestProgress(db, 'member', selected.id).completionReady, false);
    assignPartyQuestMember(db, 'owner', selected.id, 'owner', 'Interview the host', at(7));
    assignPartyQuestMember(db, 'owner', selected.id, 'member', 'Record the place', at(8));
    const progress = partyQuestProgress(db, 'member', selected.id);
    assert.equal(progress.completionReady, true);
    assert.equal(progress.participants.find((p) => p.userId === 'member')?.assignment, 'Record the place');
    assert.throws(
      () => assignPartyQuestMember(db, 'member', selected.id, 'member', 'Change it', at(9)),
      (error: unknown) => error instanceof PartyQuestError && error.code === 'OWNER_ONLY',
    );
  });

  test('completion gives each snapshot member one idempotent team reward and one Travel Event', () => {
    const { code } = createParty(db, 'owner', 'Reward crew', at(1));
    joinParty(db, 'member', code, at(2));
    const selected = selectPartyQuest(db, 'owner', {
      questId: 'quest', questType: 'exploration', questMode: 'all_members',
    }, at(3));
    startPartyQuest(db, 'owner', selected.id, at(4));
    for (const id of ['owner', 'member']) {
      db.prepare(`INSERT INTO quest_progress (user_id,quest_id,stage,joined_at,verified_at) VALUES (?,'quest','complete',?,?)`)
        .run(id, at(5).toISOString(), at(6).toISOString());
    }
    const completed = completePartyQuest(db, 'member', selected.id, at(7));
    assert.equal(completed.state, 'rewarded');
    assert.equal(completed.rewardedAt, at(7).toISOString());
    completePartyQuest(db, 'owner', selected.id, at(8));
    const rewards = db.prepare("SELECT user_id,amount,kind,source_ref FROM ledger WHERE kind='party_reward' ORDER BY user_id").all() as Array<Record<string, unknown>>;
    assert.equal(rewards.length, 2);
    assert.deepEqual(rewards.map((entry) => entry.amount), [25, 25]);
    assert.equal(new Set(rewards.map((entry) => entry.source_ref)).size, 2);
    const events = db.prepare("SELECT user_id FROM travel_events WHERE type='PARTY_QUEST_COMPLETED' AND source_kind='party_quest'").all() as Array<{ user_id: string }>;
    assert.deepEqual(events.map((event) => event.user_id).sort(), ['member', 'owner']);
  });

  test('a deadline is enforced by the server before reward distribution', () => {
    createParty(db, 'owner', 'Late crew', at(1));
    const selected = selectPartyQuest(db, 'owner', {
      questId: 'quest', questType: 'local', questMode: 'individual',
    }, at(2));
    startPartyQuest(db, 'owner', selected.id, at(3));
    db.prepare(`INSERT INTO quest_progress (user_id,quest_id,stage,joined_at,verified_at) VALUES ('owner','quest','complete',?,?)`)
      .run(at(4).toISOString(), at(5).toISOString());
    assert.throws(
      () => completePartyQuest(db, 'owner', selected.id, new Date('2026-11-21T00:00:00.000Z')),
      (error: unknown) => error instanceof PartyQuestError && error.code === 'PARTY_QUEST_EXPIRED',
    );
    assert.equal(getPartyQuest(db, 'owner', selected.id).state, 'expired');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE kind='party_reward'").get()!.n, 0);
  });
});
