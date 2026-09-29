import { strict as assert } from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { openTestDb, type DB } from './db.ts';
import { migrate } from './migrations.ts';
import { addOrganisation, addSponsorship, InvalidFunding, removeSponsorship } from './organisation-service.ts';
import {
  communityTreesPlanted, InvalidTreeRecord, recordTreePlanting, setTreeCommitment,
  treeImpactForUser,
} from './tree-impact-service.ts';
import { awardQuestReward, ensureWallet, reverseMovement } from './wallet-service.ts';

let db: DB;
const before = new Date('2026-09-01T00:00:00.000Z');
const promised = new Date('2026-09-10T00:00:00.000Z');
const approved = '2026-09-11T00:00:00.000Z';
const now = new Date('2026-09-30T00:00:00.000Z');
let sponsorId: string;

const approval = (userId = 'ana', at = approved) => {
  db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)')
    .run(userId, userId, at);
  ensureWallet(db, userId);
  db.prepare(
    `INSERT INTO quest_progress (user_id, quest_id, stage, joined_at, arrived_at,
      proof_submitted_at, verified_at) VALUES (?,?,'complete',?,?,?,?)`,
  ).run(userId, 'q1', at, at, at, at);
  awardQuestReward(db, {
    userId, questId: 'q1', questName: 'Cleanup', host: 'Local host', points: 100, currency: 'green',
  });
};

const evidence = (over: Partial<Parameters<typeof recordTreePlanting>[1]> = {}) => ({
  userId: 'ana', sponsorId, questId: 'q1', trees: 2,
  partner: 'Test planting partner', plantedAt: '2026-09-20T00:00:00.000Z',
  lat: 9.51, lng: 100.01,
  photo: { url: 'https://example.org/plant.jpg', credit: 'Test photographer', licence: 'CC BY 4.0' },
  ...over,
});

beforeEach(() => {
  db = openTestDb();
  db.prepare('INSERT INTO hosts (id, name, type) VALUES (?,?,?)').run('host', 'Local host', 'community');
  db.prepare(
    `INSERT INTO quests (id, code, name_en, name_th, where_label, duration,
      reward_points, host_id, kind, lat, lng, geofence_radius_m)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run('q1', 'Q1', 'Cleanup', 'Cleanup', 'Somewhere', '1 hr', 100, 'host', 'today', 9.51, 100.01, 100);
  sponsorId = addOrganisation(db, { name: 'Test sponsor', kind: 'ngo' }, 'moderator', before).id;
});

describe('a sponsor promise is not a planting', () => {
  test('an empty deployment has no trees and no partner', () => {
    approval();
    assert.deepEqual(treeImpactForUser(db, 'ana', now), { pending: 0, planted: 0, lines: [] });
    assert.equal(communityTreesPlanted(db, 2026, now), 0);
  });

  test('declared funding cannot promise trees, and the ratio is never guessed', () => {
    addSponsorship(db, { orgId: sponsorId, questId: 'q1', fundedTHB: 1000,
      perVerifiedTHB: 100, basis: 'declared' }, 'moderator', before);
    assert.throws(() => setTreeCommitment(db, sponsorId, 'q1', 3, promised), InvalidTreeRecord);
    approval();
    assert.equal(treeImpactForUser(db, 'ana', now).pending, 0);
  });

  test('a signed ratio applies to later approvals and cannot change retroactively', () => {
    addSponsorship(db, { orgId: sponsorId, questId: 'q1', fundedTHB: 1000,
      perVerifiedTHB: 100, basis: 'signed' }, 'moderator', before);
    assert.throws(() => setTreeCommitment(db, sponsorId, 'q1', 0, promised), InvalidTreeRecord);
    assert.equal(setTreeCommitment(db, sponsorId, 'q1', 3, promised).treesPerVerified, 3);
    assert.equal(setTreeCommitment(db, sponsorId, 'q1', 3, now).startedAt, promised.toISOString());
    assert.throws(() => setTreeCommitment(db, sponsorId, 'q1', 4, now), InvalidTreeRecord);
    approval();
    assert.deepEqual([treeImpactForUser(db, 'ana', now).pending, treeImpactForUser(db, 'ana', now).planted], [3, 0]);
  });

  test('approval before the tree promise does not become a retroactive claim', () => {
    approval('ana', before.toISOString());
    addSponsorship(db, { orgId: sponsorId, questId: 'q1', fundedTHB: 1000,
      perVerifiedTHB: 100, basis: 'signed' }, 'moderator', before);
    setTreeCommitment(db, sponsorId, 'q1', 3, promised);
    assert.equal(treeImpactForUser(db, 'ana', now).pending, 0);
  });

  test('a published tree promise cannot be silently downgraded or removed', () => {
    addSponsorship(db, { orgId: sponsorId, questId: 'q1', fundedTHB: 1000,
      perVerifiedTHB: 100, basis: 'signed' }, 'moderator', before);
    setTreeCommitment(db, sponsorId, 'q1', 3, promised);
    assert.throws(() => addSponsorship(db, { orgId: sponsorId, questId: 'q1',
      fundedTHB: 1000, perVerifiedTHB: 100, basis: 'declared' }, 'moderator', now), InvalidFunding);
    assert.throws(() => removeSponsorship(db, sponsorId, 'q1'), InvalidFunding);
    approval();
    assert.equal(treeImpactForUser(db, 'ana', now).pending, 3);
  });
});

describe('physical planting needs proof and a live approval', () => {
  beforeEach(() => {
    addSponsorship(db, { orgId: sponsorId, questId: 'q1', fundedTHB: 1000,
      perVerifiedTHB: 100, basis: 'signed' }, 'moderator', before);
    setTreeCommitment(db, sponsorId, 'q1', 3, promised);
    approval();
  });

  test('credited planting moves only its actual trees from pending to planted', () => {
    recordTreePlanting(db, evidence(), 'moderator', now);
    const impact = treeImpactForUser(db, 'ana', now);
    assert.deepEqual([impact.pending, impact.planted], [1, 2]);
    assert.equal(impact.lines[0]?.evidence[0]?.partner, 'Test planting partner');
    assert.equal(communityTreesPlanted(db, 2026, now), 2);
    assert.equal(communityTreesPlanted(db, 2025, now), 0);
  });

  test('a planting evidence row cannot be updated, even after migrating again', () => {
    recordTreePlanting(db, evidence(), 'moderator', now);
    const rewrite = () => db.prepare('UPDATE tree_plantings SET partner = ?').run('Changed partner');
    assert.throws(rewrite, /tree plantings are append-only/);
    migrate(db);
    assert.throws(rewrite, /tree plantings are append-only/);
    const kept = db.prepare('SELECT partner FROM tree_plantings').get() as { partner: string };
    assert.equal(kept.partner, 'Test planting partner');
  });

  test('a date-only planting on the approval day is accepted, but an earlier day is not', () => {
    assert.throws(() => recordTreePlanting(db, evidence({ plantedAt: '2026-09-10' }), 'moderator', now),
      InvalidTreeRecord);
    recordTreePlanting(db, evidence({ plantedAt: '2026-09-11' }), 'moderator', now);
    assert.equal(treeImpactForUser(db, 'ana', now).planted, 2);
  });

  test('missing evidence, pre-approval planting and over-attribution are refused', () => {
    assert.throws(() => recordTreePlanting(db, evidence({ partner: '' }), 'moderator', now), InvalidTreeRecord);
    assert.throws(() => recordTreePlanting(db, evidence({ photo: { url: '', credit: '', licence: '' } }), 'moderator', now), InvalidTreeRecord);
    assert.throws(() => recordTreePlanting(db, evidence({ plantedAt: before.toISOString() }), 'moderator', now), InvalidTreeRecord);
    assert.throws(() => recordTreePlanting(db, evidence({ trees: 4 }), 'moderator', now), InvalidTreeRecord);
    assert.equal(communityTreesPlanted(db, 2026, now), 0);
  });

  test('reversal removes personal attribution, not a tree already in the ground', () => {
    recordTreePlanting(db, evidence(), 'moderator', now);
    reverseMovement(db, {
      userId: 'ana', originalSourceRef: 'quest:q1:user:ana', reason: 'local test reversal',
    });
    assert.deepEqual(treeImpactForUser(db, 'ana', now), { pending: 0, planted: 0, lines: [] });
    assert.equal(communityTreesPlanted(db, 2026, now), 2);
  });

  test('account erasure removes the attribution but not the physical record', () => {
    recordTreePlanting(db, evidence(), 'moderator', now);
    db.prepare('DELETE FROM users WHERE id = ?').run('ana');
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM tree_attributions').get() as { n: number }).n, 0);
    assert.equal(communityTreesPlanted(db, 2026, now), 2);
  });
});
