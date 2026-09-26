import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { planStanding } from '@chivago/core';
import { openTestDb, type DB } from './db.ts';
import {
  InvalidPlanLock, lockFor, lockPlan, locksFor, planDigest, planOf, supersedePlan, verifiedSoFar,
} from './plan-lock-service.ts';
import { awardQuestReward, ensureWallet, reverseMovement } from './wallet-service.ts';

/**
 * Fixing a plan before the results, met by the database.
 *
 * The assertions that carry weight are about the COUNT: that it is taken from
 * the rows rather than from a caller, that a reversed award is not a result
 * somebody could have been reacting to, and that a locked plan cannot then be
 * rewritten behind the seal.
 */

let db: DB;
const AT = '2026-06-15T04:00:00.000Z';
const LOCKED = new Date('2026-09-27T00:00:00.000Z');
const LATER = new Date('2026-11-01T00:00:00.000Z');

const quest = (id: string, kpi?: {
  measure?: string; baseline?: number | null; target?: number | null; level?: number | null;
}) => {
  db.prepare(
    `INSERT INTO quests (id, code, name_en, name_th, where_label, duration, reward_points,
       host_id, kind, lat, lng, geofence_radius_m)
     VALUES (?,?,?,?,?,?,?,'h1','today',9.5,100.0,250)`,
  ).run(id, id.toUpperCase(), id, id, 'Samui', '1 hr', 100);
  if (kpi) {
    db.prepare(
      'UPDATE quests SET kpi_measure = ?, kpi_baseline = ?, kpi_target = ?, evidence_level = ? WHERE id = ?',
    ).run(kpi.measure ?? 'verified_submissions', kpi.baseline ?? null,
          kpi.target ?? null, kpi.level ?? null, id);
  }
};

const approved = (userId: string, questId: string, opts: { award?: boolean } = {}) => {
  db.prepare('INSERT OR IGNORE INTO users (id, display_name, created_at) VALUES (?,?,?)')
    .run(userId, userId, AT);
  ensureWallet(db, userId);
  db.prepare(
    `INSERT OR REPLACE INTO quest_progress (user_id, quest_id, stage, joined_at, arrived_at,
       proof_submitted_at, verified_at)
     VALUES (?,?,'complete',?,?,?,?)`,
  ).run(userId, questId, AT, AT, AT, AT);
  if (opts.award !== false) {
    awardQuestReward(db, {
      userId, questId, questName: questId, host: 'Host', points: 100, currency: 'green',
    });
  }
};

beforeEach(() => {
  db = openTestDb();
  db.prepare("INSERT INTO hosts (id, name, type) VALUES ('h1','Samui Municipality','municipality')").run();
});

describe('the plan a quest currently carries', () => {
  test('all four fields come off the quest', () => {
    quest('q1', { measure: 'weight_kg', baseline: 10, target: 400, level: 3 });
    assert.deepEqual(planOf(db, 'q1'), {
      measure: 'weight_kg', baseline: 10, target: 400, requiredLevel: 3,
    });
  });

  test('a quest with no measure has no plan to fix', () => {
    quest('q1');
    assert.equal(planOf(db, 'q1'), null);
  });

  test('A MEASURE THIS PLATFORM WILL NOT COMPUTE IS NOT A PLAN', () => {
    // `voucher_value_thb` is refused as a quest KPI because nothing joins a
    // voucher to the quest whose points paid for it. Sealing it would seal a
    // blank.
    quest('q1', { measure: 'voucher_value_thb' });
    assert.equal(planOf(db, 'q1'), null);
  });

  test('an evidence level outside the ladder reads as none agreed', () => {
    quest('q1', { level: 9 });
    assert.equal(planOf(db, 'q1')!.requiredLevel, null);
  });
});

describe('counting what had already happened', () => {
  test('nothing verified is zero', () => {
    quest('q1', {});
    assert.equal(verifiedSoFar(db, 'q1'), 0);
  });

  test('an approval counts', () => {
    quest('q1', {});
    approved('u1', 'q1');
    approved('u2', 'q1');
    assert.equal(verifiedSoFar(db, 'q1'), 2);
  });

  test('A REVERSED AWARD IS NOT A RESULT ANYBODY COULD HAVE REACTED TO', () => {
    quest('q1', {});
    approved('u1', 'q1');
    approved('u2', 'q1');
    reverseMovement(db, {
      userId: 'u1', originalSourceRef: 'quest:q1:user:u1', reason: 'withdrawn',
    });
    assert.equal(verifiedSoFar(db, 'q1'), 1);
  });

  test('another quest’s activity is not this quest’s', () => {
    quest('q1', {});
    quest('q2', {});
    approved('u1', 'q2');
    assert.equal(verifiedSoFar(db, 'q1'), 0);
  });
});

describe('locking a plan', () => {
  test('a plan fixed with nothing verified is the strong case', () => {
    quest('q1', { target: 100, level: 3 });
    const lock = lockPlan(db, 'q1', 'Nok', LOCKED);
    assert.equal(lock.verifiedAtLock, 0);
    assert.equal(lock.digest, planDigest(planOf(db, 'q1')!));
    assert.equal(planStanding(lock, planDigest(planOf(db, 'q1')!)), 'fixed_before');
  });

  test('THE COUNT IS TAKEN FROM THE ROWS, NOT FROM THE CALLER', () => {
    // A caller who could supply the count could supply a zero, and the zero
    // is the entire strong claim.
    quest('q1', { target: 100 });
    approved('u1', 'q1');
    approved('u2', 'q1');
    approved('u3', 'q1');
    const lock = lockPlan(db, 'q1', 'Nok', LOCKED);
    assert.equal(lock.verifiedAtLock, 3);
    assert.equal(planStanding(lock, planDigest(planOf(db, 'q1')!)), 'fixed_after');
  });

  test('a quest with no measure is refused rather than sealed blank', () => {
    quest('q1');
    assert.throws(() => lockPlan(db, 'q1', 'Nok', LOCKED), InvalidPlanLock);
    assert.equal(lockFor(db, 'q1'), null);
  });

  test('a quest that does not exist is refused', () => {
    assert.throws(() => lockPlan(db, 'nope', 'Nok', LOCKED), InvalidPlanLock);
  });

  test('locking twice is refused, so the second is not mistaken for the first', () => {
    quest('q1', {});
    lockPlan(db, 'q1', 'Nok', LOCKED);
    assert.throws(() => lockPlan(db, 'q1', 'Nok', LATER), InvalidPlanLock);
    assert.equal(locksFor(db, 'q1').length, 1);
  });
});

describe('a locked plan does not change behind the seal', () => {
  test('THE QUEST’S PLAN COLUMNS REFUSE TO MOVE WHILE A LOCK STANDS', () => {
    // Without this the digest would be a seal on a door that still opens.
    quest('q1', { target: 100, level: 3 });
    lockPlan(db, 'q1', 'Nok', LOCKED);
    for (const sql of [
      "UPDATE quests SET kpi_measure = 'distinct_participants' WHERE id = 'q1'",
      'UPDATE quests SET kpi_target = 1 WHERE id = ?',
      'UPDATE quests SET kpi_baseline = 5 WHERE id = ?',
      'UPDATE quests SET evidence_level = 1 WHERE id = ?',
    ]) {
      assert.throws(
        () => (sql.includes('?') ? db.prepare(sql).run('q1') : db.prepare(sql).run()),
        /locked measurement plan/,
        sql,
      );
    }
  });

  test('everything else about the quest still moves', () => {
    // The lock is over the plan, not over the quest. A host renaming their
    // own quest is not tampering with a measurement.
    quest('q1', {});
    lockPlan(db, 'q1', 'Nok', LOCKED);
    db.prepare("UPDATE quests SET name_en = 'Beach clean, Saturday' WHERE id = 'q1'").run();
    assert.equal(lockFor(db, 'q1')!.digest, planDigest(planOf(db, 'q1')!));
  });

  test('a superseded lock releases the columns again', () => {
    quest('q1', { target: 100 });
    lockPlan(db, 'q1', 'Nok', LOCKED);
    supersedePlan(db, 'q1', 'the partner changed the target', LATER);
    db.prepare('UPDATE quests SET kpi_target = 250 WHERE id = ?').run('q1');
    assert.equal(planOf(db, 'q1')!.target, 250);
  });

  test('a lock is appended, never edited', () => {
    quest('q1', {});
    const lock = lockPlan(db, 'q1', 'Nok', LOCKED);
    assert.throws(
      () => db.prepare('UPDATE quest_plan_locks SET verified_at_lock = 0 WHERE id = ?').run(lock.id),
      /append-only/,
    );
    assert.throws(
      () => db.prepare("UPDATE quest_plan_locks SET digest = 'other' WHERE id = ?").run(lock.id),
      /append-only/,
    );
  });
});

describe('superseding a plan', () => {
  test('the row is kept, because the quest really was measured that way', () => {
    quest('q1', { target: 100 });
    lockPlan(db, 'q1', 'Nok', LOCKED);
    const gone = supersedePlan(db, 'q1', 'target renegotiated', LATER);
    assert.equal(gone.supersededAt, LATER.toISOString());
    assert.equal(gone.supersededReason, 'target renegotiated');
    assert.equal(locksFor(db, 'q1').length, 1);
    assert.equal(lockFor(db, 'q1'), null);
  });

  test('THE FIRST SUPERSESSION IS THE ONE THAT STANDS', () => {
    quest('q1', {});
    lockPlan(db, 'q1', 'Nok', LOCKED);
    supersedePlan(db, 'q1', 'target renegotiated', LATER);
    assert.throws(() => supersedePlan(db, 'q1', 'again', LATER), InvalidPlanLock);
    assert.equal(locksFor(db, 'q1')[0]!.supersededAt, LATER.toISOString());
  });

  test('a second plan can then be locked, and both are on the record', () => {
    quest('q1', { target: 100 });
    lockPlan(db, 'q1', 'Nok', LOCKED);
    supersedePlan(db, 'q1', 'target renegotiated', LATER);
    db.prepare('UPDATE quests SET kpi_target = 250 WHERE id = ?').run('q1');
    approved('u1', 'q1');
    const second = lockPlan(db, 'q1', 'Nok', LATER);

    const all = locksFor(db, 'q1');
    assert.equal(all.length, 2);
    assert.notEqual(all[0]!.digest, all[1]!.digest);
    // And the second one carries the count that makes it late.
    assert.equal(second.verifiedAtLock, 1);
    assert.equal(planStanding(second, planDigest(planOf(db, 'q1')!)), 'fixed_after');
  });

  test('superseding when nothing is locked is refused', () => {
    quest('q1', {});
    assert.throws(() => supersedePlan(db, 'q1', 'x', LATER), InvalidPlanLock);
  });

  test('two standing locks cannot be forced in', () => {
    quest('q1', {});
    lockPlan(db, 'q1', 'Nok', LOCKED);
    assert.throws(
      () => db.prepare(
        `INSERT INTO quest_plan_locks (id, quest_id, digest, verified_at_lock, locked_at)
         VALUES ('forced','q1','abc',0,?)`,
      ).run(LATER.toISOString()),
      /UNIQUE/,
    );
  });
});
