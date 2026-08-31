import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, type DB } from './db.ts';
import { applyMovement, ensureWallet, getBalances, getLedger } from './wallet-service.ts';
import { inbox } from './notification-service.ts';
import {
  arriveAtQuest,
  distanceMetres,
  getProgress,
  InvalidTransition,
  joinQuest,
  OutsideGeofence,
  resolveVerification,
  submitProof,
} from './quest-service.ts';

let db: DB;
const USER = 'u1';
const QUEST = 'q1';
/** Chaweng Beach - the real site for BC-04. */
const SITE = { lat: 9.5357, lng: 100.0617 };
const PHOTO = [{ uri: 'file://p1.jpg', lat: SITE.lat, lng: SITE.lng, takenAt: '2026-10-14T03:00:00Z' }];

beforeEach(() => {
  db = openTestDb();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)').run(USER, 'John', now);
  ensureWallet(db, USER);
  // Opening balance goes through the ledger like every other movement, so
  // the fixture exercises the same path production does.
  applyMovement(db, {
    userId: USER, label: 'Opening', host: 'Test', amount: 1240,
    currency: 'green', kind: 'adjustment', sourceRef: `test:opening:${USER}`,
  });
  db.prepare('INSERT INTO hosts (id, name, type) VALUES (?,?,?)').run(
    'h1', 'Samui Municipality', 'municipality');
  db.prepare(
    `INSERT INTO quests (id, code, name_en, name_th, where_label, duration, reward_points,
       host_id, kind, lat, lng, geofence_radius_m)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(QUEST, 'BC-04', 'Beach Cleanup', 'x', 'Chaweng Beach', '45 min', 150,
        'h1', 'today', SITE.lat, SITE.lng, 250);
});

const runToVerification = () => {
  joinQuest(db, USER, QUEST);
  arriveAtQuest(db, USER, QUEST, SITE);
  return submitProof(db, USER, QUEST, { photos: PHOTO, weightKg: 4.2 });
};

/**
 * The ledger without the fixture's opening grant.
 *
 * The opening balance is a real movement now, so it writes a real row. These
 * tests are about what the code under test added, not about the fixture.
 */
const movements = (user = USER) =>
  getLedger(db, user).filter((e) => !e.sourceRef.startsWith('test:opening'));
describe('haversine distance', () => {
  test('zero for the same point', () => {
    assert.equal(Math.round(distanceMetres(SITE, SITE)), 0);
  });

  test('matches a known Samui separation', () => {
    // Chaweng Beach to Fisherman's Village is roughly 2.4 km.
    const d = distanceMetres(SITE, { lat: 9.5573, lng: 100.0596 });
    assert.ok(d > 2200 && d < 2600, `got ${Math.round(d)} m`);
  });

  test('is symmetric', () => {
    const a = { lat: 9.5357, lng: 100.0617 };
    const b = { lat: 9.4611, lng: 99.9908 };
    assert.ok(Math.abs(distanceMetres(a, b) - distanceMetres(b, a)) < 0.001);
  });
});

describe('the happy path', () => {
  test('join -> arrive -> proof -> verified -> points', () => {
    const joined = joinQuest(db, USER, QUEST);
    assert.equal(joined.stage, 'joined');
    assert.ok(joined.joinedAt);

    const arrived = arriveAtQuest(db, USER, QUEST, SITE);
    assert.equal(arrived.stage, 'arrived');

    const { progress, proofId } = submitProof(db, USER, QUEST, { photos: PHOTO, weightKg: 4.2 });
    assert.equal(progress.stage, 'host_verification');

    assert.equal(getBalances(db, USER).green, 1240, 'no points before the host verifies');

    const result = resolveVerification(db, {
      userId: USER, questId: QUEST, proofId, approved: true,
    });
    assert.equal(result.progress.stage, 'complete');
    assert.equal(result.pointsAwarded, 150);
    assert.equal(getBalances(db, USER).green, 1390);
    assert.equal(getLedger(db, USER)[0]!.host, 'Samui Municipality');
  });
});

describe('the client cannot award itself points', () => {
  test('submitting proof alone pays nothing', () => {
    runToVerification();
    assert.equal(getBalances(db, USER).green, 1240);
    assert.equal(movements().length, 0);
  });

  test('a repeated host callback pays once', () => {
    const { proofId } = runToVerification();
    const args = { userId: USER, questId: QUEST, proofId, approved: true };
    const first = resolveVerification(db, args);
    assert.equal(first.pointsAwarded, 150);
    // A second callback is now an invalid transition out of `complete`.
    assert.throws(() => resolveVerification(db, args), InvalidTransition);
    assert.equal(getBalances(db, USER).green, 1390, 'paid exactly once');
  });
});

describe('geofence', () => {
  test('arrival inside the radius succeeds', () => {
    joinQuest(db, USER, QUEST);
    // ~100 m north of the site.
    const nearby = { lat: SITE.lat + 0.0009, lng: SITE.lng };
    assert.equal(arriveAtQuest(db, USER, QUEST, nearby).stage, 'arrived');
  });

  test('arrival from the other side of the island is refused', () => {
    joinQuest(db, USER, QUEST);
    const namuang = { lat: 9.4611, lng: 99.9908 };
    assert.throws(() => arriveAtQuest(db, USER, QUEST, namuang), OutsideGeofence);
    assert.equal(getProgress(db, USER, QUEST)!.stage, 'joined', 'stage unchanged');
  });

  test('the refusal names the distance so the UI can explain it', () => {
    joinQuest(db, USER, QUEST);
    try {
      arriveAtQuest(db, USER, QUEST, { lat: 9.4611, lng: 99.9908 });
      assert.fail('should have thrown');
    } catch (err) {
      assert.ok(err instanceof OutsideGeofence);
      assert.equal(err.radiusM, 250);
      assert.ok(err.distanceM > 250);
    }
  });
});

describe('illegal transitions are refused', () => {
  test('cannot arrive without joining', () => {
    assert.throws(() => arriveAtQuest(db, USER, QUEST, SITE), InvalidTransition);
  });

  test('cannot submit proof without arriving', () => {
    joinQuest(db, USER, QUEST);
    assert.throws(
      () => submitProof(db, USER, QUEST, { photos: PHOTO, weightKg: 1 }),
      InvalidTransition,
    );
  });

  test('cannot verify a quest that was never submitted', () => {
    joinQuest(db, USER, QUEST);
    assert.throws(
      () => resolveVerification(db, { userId: USER, questId: QUEST, proofId: 'x', approved: true }),
      InvalidTransition,
    );
    assert.equal(getBalances(db, USER).green, 1240);
  });

  test('proof with no photos is refused', () => {
    joinQuest(db, USER, QUEST);
    arriveAtQuest(db, USER, QUEST, SITE);
    assert.throws(
      () => submitProof(db, USER, QUEST, { photos: [], weightKg: 4.2 }),
      /at least one photo/,
    );
  });
});

describe('rejection - the path the design omits', () => {
  test('a rejected proof returns the user to arrived, with a reason', () => {
    const { proofId } = runToVerification();
    const result = resolveVerification(db, {
      userId: USER, questId: QUEST, proofId, approved: false,
      reasonKey: 'not_at_site',
    });
    assert.equal(result.progress.stage, 'arrived');
    assert.equal(result.pointsAwarded, null);
    // The reason comes back BILINGUAL: the reviewer chose in their language,
    // the volunteer reads it in theirs.
    assert.match(result.progress.rejectionReason!.en, /not taken at the quest site/);
    assert.ok(/[฀-๿]/.test(result.progress.rejectionReason!.th), 'Thai missing');
    assert.equal(getBalances(db, USER).green, 1240, 'nothing paid');
  });

  test('the user can resubmit after a rejection and then be paid', () => {
    const first = runToVerification();
    resolveVerification(db, {
      userId: USER, questId: QUEST, proofId: first.proofId, approved: false,
      reasonKey: 'no_work_shown',
    });

    const second = submitProof(db, USER, QUEST, { photos: PHOTO, weightKg: 4.2 });
    assert.equal(second.progress.stage, 'host_verification');
    assert.equal(second.progress.rejectionReason, null, 'stale rejection cleared');

    const ok = resolveVerification(db, {
      userId: USER, questId: QUEST, proofId: second.proofId, approved: true,
    });
    assert.equal(ok.pointsAwarded, 150);
    assert.equal(getBalances(db, USER).green, 1390, 'paid once, after the successful resubmit');
  });

  test('an arrival is not revoked by a rejection - they really were there', () => {
    const { proofId } = runToVerification();
    resolveVerification(db, {
      userId: USER, questId: QUEST, proofId, approved: false, reasonKey: 'no_work_shown',
    });
    assert.ok(getProgress(db, USER, QUEST)!.arrivedAt, 'arrival timestamp kept');
  });
});

describe('joining is idempotent', () => {
  test('re-joining does not reset progress', () => {
    joinQuest(db, USER, QUEST);
    arriveAtQuest(db, USER, QUEST, SITE);
    const again = joinQuest(db, USER, QUEST);
    assert.equal(again.stage, 'arrived', 'still at the site, not reset to joined');
  });
});

describe('notifying the volunteer — the loop this closes', () => {
  test('approval queues a notification in the SAME transaction as the award', () => {
    const { proofId } = runToVerification();
    resolveVerification(db, { userId: USER, questId: QUEST, proofId, approved: true });

    const items = inbox(db, USER);
    assert.equal(items.length, 1);
    assert.equal(items[0]!.kind, 'quest_approved');
    // Bilingual, and carrying the facts the volunteer needs.
    assert.ok(items[0]!.body.en.includes('150'), items[0]!.body.en);
    assert.ok(items[0]!.body.en.includes('Samui Municipality'));
    assert.ok(/[฀-๿]/.test(items[0]!.body.th), 'no Thai');
    assert.equal(items[0]!.data.screen, 'wallet');
  });

  test('a paid user is never an unnotified user', () => {
    // The failure this whole feature exists to prevent: points released and
    // nobody told. Both happen in one transaction or neither does.
    const { proofId } = runToVerification();
    resolveVerification(db, { userId: USER, questId: QUEST, proofId, approved: true });
    assert.equal(getBalances(db, USER).green, 1390, 'paid');
    assert.equal(inbox(db, USER).length, 1, 'and told');
  });

  test('rejection queues a notification pointing back at the quest', () => {
    const { proofId } = runToVerification();
    resolveVerification(db, {
      userId: USER, questId: QUEST, proofId, approved: false, reasonKey: 'not_at_site',
    });
    const items = inbox(db, USER);
    assert.equal(items[0]!.kind, 'quest_rejected');
    assert.equal(items[0]!.data.screen, 'quest');
    assert.equal(items[0]!.data.questId, QUEST);
  });

  test('a retried host callback does not notify twice', () => {
    const { proofId } = runToVerification();
    const args = { userId: USER, questId: QUEST, proofId, approved: true };
    resolveVerification(db, args);
    assert.throws(() => resolveVerification(db, args), InvalidTransition);
    assert.equal(inbox(db, USER).length, 1, 'notified exactly once');
  });

  test('submitting proof alone notifies nobody', () => {
    runToVerification();
    assert.equal(inbox(db, USER).length, 0);
  });

  test('a rejected then approved quest produces both notifications', () => {
    const first = runToVerification();
    resolveVerification(db, {
      userId: USER, questId: QUEST, proofId: first.proofId, approved: false,
      reasonKey: 'no_work_shown',
    });
    const second = submitProof(db, USER, QUEST, { photos: PHOTO, weightKg: 4.2 });
    resolveVerification(db, {
      userId: USER, questId: QUEST, proofId: second.proofId, approved: true,
    });

    const kinds = inbox(db, USER).map((i) => i.kind);
    assert.deepEqual(kinds, ['quest_approved', 'quest_rejected'], 'newest first');
  });
});
