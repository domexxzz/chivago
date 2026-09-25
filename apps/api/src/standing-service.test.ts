import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, type DB } from './db.ts';
import {
  applyMovement, awardQuestReward, ensureWallet, reverseMovement,
} from './wallet-service.ts';
import { hostStandings, travellerStandings } from './standing-service.ts';

let db: DB;
const NOW = '2026-09-01T00:00:00.000Z';

const addUser = (id: string, name: string) => {
  db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)').run(id, name, NOW);
  ensureWallet(db, id);
};

const addHost = (id: string, name: string, type = 'community') =>
  db.prepare('INSERT INTO hosts (id, name, type) VALUES (?,?,?)').run(id, name, type);

const addQuest = (id: string, hostId: string, currency: 'green' | 'trip' = 'green') =>
  db.prepare(
    `INSERT INTO quests (id, code, name_en, name_th, where_label, duration, reward_points,
       host_id, kind, lat, lng, geofence_radius_m, reward_currency)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(id, id.toUpperCase(), id, id, 'Somewhere', '30 min', 100, hostId, 'today', 9.5, 100.0, 250, currency);

/** A submission a host approved. */
const approve = (userId: string, questId: string) =>
  db.prepare(
    `INSERT INTO quest_progress (user_id, quest_id, stage, joined_at, arrived_at,
       proof_submitted_at, verified_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(userId, questId, 'complete', NOW, NOW, NOW, NOW);

/** A submission sitting in the host's queue. */
const awaiting = (userId: string, questId: string) =>
  db.prepare(
    `INSERT INTO quest_progress (user_id, quest_id, stage, joined_at, arrived_at, proof_submitted_at)
     VALUES (?,?,?,?,?,?)`,
  ).run(userId, questId, 'host_verification', NOW, NOW, NOW);

const reward = (userId: string, questId: string, amount: number, currency: 'green' | 'trip') =>
  applyMovement(db, {
    userId, label: questId, host: 'h', amount, currency,
    kind: 'quest_reward', sourceRef: `quest:${questId}:user:${userId}`,
  });

beforeEach(() => {
  db = openTestDb();
});

describe('a platform gift is not verified work', () => {
  test('the opening balance does not count towards a traveller’s standing', () => {
    // THE bug this file exists to hold shut. Every pilot traveller is handed
    // 1,240 Green as an `adjustment`, and summing "positive green rows" made
    // two thirds of the demo account's total a gift the platform had given
    // itself credit for. A board ranked on that ranks who signed up.
    addUser('u1', 'Ana');
    applyMovement(db, {
      userId: 'u1', label: 'Pilot opening balance', host: 'ChivaGo', amount: 1240,
      currency: 'green', kind: 'adjustment', sourceRef: 'opening:green:u1',
    });
    addHost('h1', 'Samui Municipality');
    addQuest('q1', 'h1');
    reward('u1', 'q1', 150, 'green');

    const [me] = travellerStandings(db);
    assert.equal(me!.greenVerified, 150, 'the opening balance leaked into the ranking');
    assert.equal(me!.missionsVerified, 1);
  });

  test('self-verified points never reach the standing at all', () => {
    addUser('u1', 'Ana');
    addHost('h1', 'A'); addQuest('q1', 'h1', 'trip');
    reward('u1', 'q1', 500, 'trip');
    applyMovement(db, {
      userId: 'u1', label: 'Check-in', host: 'ChivaGo', amount: 20,
      currency: 'trip', kind: 'checkin', sourceRef: 'checkin:p1:u1:2026-09-01',
    });

    const [me] = travellerStandings(db);
    assert.equal(me!.greenVerified, 0, 'a self-verified currency entered the ranking');
    assert.equal(me!.missionsVerified, 0);
  });

  test('spending points does not undo the work that earned them', () => {
    addUser('u1', 'Ana');
    addHost('h1', 'A'); addQuest('q1', 'h1');
    reward('u1', 'q1', 600, 'green');
    applyMovement(db, {
      userId: 'u1', label: 'Longtail trip', host: 'Co-op', amount: -600,
      currency: 'green', kind: 'redemption', sourceRef: 'voucher:v1:u1',
    });

    // Netting it off would rank travellers on how little they had redeemed,
    // which would make the marketplace something to avoid.
    assert.equal(travellerStandings(db)[0]!.greenVerified, 600);
  });

  test('a traveller who has verified nothing is present at zero, not absent', () => {
    // They still belong in the list; `participants` in core is what decides
    // whether a ranking may be drawn, and it counts non-zero rows.
    addUser('u1', 'Ana');
    const [me] = travellerStandings(db);
    assert.equal(me!.greenVerified, 0);
    assert.equal(me!.displayName, 'Ana');
  });
});

describe('hosts are counted on what they approved', () => {
  beforeEach(() => {
    addUser('u1', 'Ana'); addUser('u2', 'Bo');
    addHost('busy', 'Samui Green', 'ngo');
    addHost('quiet', 'Ocean Lab', 'hotel');
    addQuest('q1', 'busy'); addQuest('q2', 'busy');
    addQuest('q9', 'quiet');
  });

  test('approvals and the Green they issued are both counted', () => {
    approve('u1', 'q1'); approve('u2', 'q1'); approve('u1', 'q2');
    reward('u1', 'q1', 400, 'green');
    reward('u2', 'q1', 400, 'green');
    reward('u1', 'q2', 150, 'green');

    const busy = hostStandings(db).find((h) => h.hostId === 'busy')!;
    assert.equal(busy.verified, 3);
    assert.equal(busy.greenIssued, 950);
    assert.equal(busy.questsPosted, 2);
  });

  test('a host who has posted and approved nothing is still in the table', () => {
    // LEFT JOIN, deliberately. Dropping them makes the board a list of
    // successful hosts and hides the ones who need travellers sent to them.
    const quiet = hostStandings(db).find((h) => h.hostId === 'quiet');
    assert.ok(quiet, 'a host with no activity vanished from the standing');
    assert.equal(quiet.verified, 0);
    assert.equal(quiet.questsPosted, 1);
  });

  test('an unreviewed submission is pending, not verified', () => {
    awaiting('u1', 'q9');
    const quiet = hostStandings(db).find((h) => h.hostId === 'quiet')!;
    assert.equal(quiet.pending, 1);
    assert.equal(quiet.verified, 0, 'a submission nobody looked at counted as approved');
  });

  test('one host’s approvals do not land on another host’s row', () => {
    approve('u1', 'q1');
    reward('u1', 'q1', 400, 'green');
    const quiet = hostStandings(db).find((h) => h.hostId === 'quiet')!;
    assert.equal(quiet.verified, 0);
    assert.equal(quiet.greenIssued, 0);
  });

  test('quests posted counts quests, not submissions against them', () => {
    // COUNT(DISTINCT q.id): the row multiplies once per progress row, and a
    // popular quest would otherwise report itself as several quests.
    approve('u1', 'q1'); approve('u2', 'q1');
    assert.equal(hostStandings(db).find((h) => h.hostId === 'busy')!.questsPosted, 2);
  });
});

/**
 * An award taken back is not a standing.
 *
 * A standing is public and ranked — `ProfileScreen` prints it beside a name —
 * so it is the last place that should go on crediting work a host withdrew.
 * Nothing in the app calls `reverseMovement` yet, so no table on anybody's
 * screen has been wrong; the first clawback anybody runs would have been.
 *
 * Awarded and reversed through the REAL functions rather than by writing the
 * two rows by hand. A test that hand-wrote `reversal:…` would go on passing on
 * the day `reverseMovement` changed how it writes, which is the failure this
 * whole sprint exists to clear up.
 */
describe('a reversed award leaves no standing behind', () => {
  const award = (userId: string, questId: string) => awardQuestReward(db, {
    userId, questId, questName: questId, host: 'Host', points: 100, currency: 'green',
  });
  const takeBack = (userId: string, questId: string) => reverseMovement(db, {
    userId, originalSourceRef: `quest:${questId}:user:${userId}`, reason: 'proof was not what it claimed',
  });

  test('a host is not credited with green they had to claw back', () => {
    addHost('h1', 'Beach team');
    addQuest('q1', 'h1');
    addQuest('q2', 'h1');
    addUser('ana', 'Ana');
    approve('ana', 'q1');
    approve('ana', 'q2');
    award('ana', 'q1');
    award('ana', 'q2');
    assert.equal(hostStandings(db)[0]!.greenIssued, 200);

    takeBack('ana', 'q1');
    assert.equal(hostStandings(db)[0]!.greenIssued, 100, 'the clawed-back award still counted');
  });

  test('a traveller loses the points and the mission, not one or the other', () => {
    // Two numbers, two queries, and only one of them was a SUM. A fix that
    // reached the money and not the count would leave a profile reading
    // "2 missions, 100 green" for one mission's work.
    addHost('h1', 'Beach team');
    addQuest('q1', 'h1');
    addQuest('q2', 'h1');
    addUser('ana', 'Ana');
    award('ana', 'q1');
    award('ana', 'q2');
    const before = travellerStandings(db).find((t) => t.userId === 'ana')!;
    assert.deepEqual([before.greenVerified, before.missionsVerified], [200, 2]);

    takeBack('ana', 'q1');
    const after = travellerStandings(db).find((t) => t.userId === 'ana')!;
    assert.deepEqual([after.greenVerified, after.missionsVerified], [100, 1]);
  });

  test('a traveller whose every award was taken back is listed at zero, not dropped', () => {
    // The LEFT JOIN carries the reversal filter, so this is the case that
    // proves the filter did not turn it into an inner join. Somebody who
    // vanishes from a ranking is harder to question than somebody at zero.
    addHost('h1', 'Beach team');
    addQuest('q1', 'h1');
    addUser('ana', 'Ana');
    award('ana', 'q1');
    takeBack('ana', 'q1');

    const ana = travellerStandings(db).find((t) => t.userId === 'ana');
    assert.ok(ana, 'the traveller disappeared from the standings');
    assert.deepEqual([ana.greenVerified, ana.missionsVerified], [0, 0]);
  });

  test('the opening balance is not a reversal, and is still not a standing', () => {
    // `grantOpeningBalance` writes `kind = 'adjustment'` too. A fix that had
    // excluded every adjustment would have looked right on the two tests above
    // and quietly changed what an opening balance means.
    addHost('h1', 'Beach team');
    addQuest('q1', 'h1');
    addUser('ana', 'Ana');
    applyMovement(db, {
      userId: 'ana', label: 'Welcome', host: 'ChivaGo', amount: 1240, currency: 'green',
      kind: 'adjustment', sourceRef: 'opening:green:user:ana',
    });
    award('ana', 'q1');

    const ana = travellerStandings(db).find((t) => t.userId === 'ana')!;
    assert.deepEqual(
      [ana.greenVerified, ana.missionsVerified], [100, 1],
      'a gift counted as verified work, or the award stopped counting',
    );
  });
});
