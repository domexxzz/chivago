import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, type DB } from './db.ts';
import { kpiFor, kpiReading, observedFor } from './kpi-service.ts';
import { awardQuestReward, ensureWallet, reverseMovement } from './wallet-service.ts';

/**
 * The agreed indicator, met by the database.
 *
 * `kpi.ts` in core decides what a KPI may claim. This is about the rows: that
 * the figure counts approvals and not joins, weight a host PASSED and not
 * weight somebody typed, and that a reversed award drops out like everywhere
 * else in this codebase.
 */

let db: DB;
const PERIOD = { from: '2026-01-01', to: '2026-12-31' };
const AT = '2026-06-15T04:00:00.000Z';

const quest = (id: string, kpi?: { measure: string; baseline?: number; target?: number }) => {
  db.prepare(
    `INSERT INTO quests (id, code, name_en, name_th, where_label, duration, reward_points,
       host_id, kind, lat, lng, geofence_radius_m)
     VALUES (?,?,?,?,?,?,?,'h1','today',9.5,100.0,250)`,
  ).run(id, id.toUpperCase(), id, id, 'Samui', '1 hr', 100);
  if (kpi) {
    db.prepare('UPDATE quests SET kpi_measure = ?, kpi_baseline = ?, kpi_target = ? WHERE id = ?')
      .run(kpi.measure, kpi.baseline ?? null, kpi.target ?? null, id);
  }
};

const approved = (userId: string, questId: string, opts: {
  weightKg?: number | null; passed?: boolean; at?: string; award?: boolean;
} = {}) => {
  const at = opts.at ?? AT;
  db.prepare('INSERT OR IGNORE INTO users (id, display_name, created_at) VALUES (?,?,?)')
    .run(userId, userId, at);
  ensureWallet(db, userId);
  db.prepare(
    `INSERT OR REPLACE INTO quest_progress (user_id, quest_id, stage, joined_at, arrived_at,
       proof_submitted_at, verified_at)
     VALUES (?,?,'complete',?,?,?,?)`,
  ).run(userId, questId, at, at, at, at);
  db.prepare(
    `INSERT OR REPLACE INTO proofs (id, user_id, quest_id, photos, weight_kg, submitted_at,
       reviewed_at, approved, reviewed_by)
     VALUES (?,?,?,'[]',?,?,?,?,'Nok')`,
  ).run(`pr-${userId}-${questId}`, userId, questId, opts.weightKg ?? null, at, at,
        opts.passed === false ? 0 : 1);
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

describe('the indicator a quest was agreed against', () => {
  test('a quest with no KPI has none, rather than a default one', () => {
    quest('q1');
    assert.equal(kpiFor(db, 'q1'), null);
    assert.equal(kpiReading(db, 'q1', PERIOD), null);
  });

  test('a measure a quest cannot carry is refused, not stored and served', () => {
    // Nothing joins a voucher to the quest whose points paid for it. A row
    // that says otherwise is a row somebody wrote by hand, and it must not
    // come back as a reading.
    quest('q1');
    db.prepare("UPDATE quests SET kpi_measure = 'voucher_value_thb' WHERE id = 'q1'").run();
    assert.equal(kpiFor(db, 'q1'), null);
  });

  test('a measure outside the vocabulary entirely is refused too', () => {
    quest('q1');
    db.prepare("UPDATE quests SET kpi_measure = 'carbon_tco2e' WHERE id = 'q1'").run();
    assert.equal(kpiFor(db, 'q1'), null);
  });
});

describe('what the rows read', () => {
  test('submissions count approvals, and people count people', () => {
    quest('q1', { measure: 'verified_submissions' });
    approved('ana', 'q1');
    approved('bo', 'q1');
    assert.equal(observedFor(db, 'q1', 'verified_submissions', PERIOD), 2);
    assert.equal(observedFor(db, 'q1', 'distinct_participants', PERIOD), 2);
  });

  test('weight sums only proofs a host PASSED', () => {
    // A weight on a proof that was turned down is a number somebody typed,
    // not a measurement anybody stood behind.
    quest('q1', { measure: 'weight_kg' });
    approved('ana', 'q1', { weightKg: 12.5 });
    approved('bo', 'q1', { weightKg: 40, passed: false });
    assert.equal(observedFor(db, 'q1', 'weight_kg', PERIOD), 12.5);
  });

  test('work outside the period is outside the figure', () => {
    quest('q1', { measure: 'verified_submissions' });
    approved('ana', 'q1', { at: '2025-06-15T04:00:00.000Z' });
    assert.equal(observedFor(db, 'q1', 'verified_submissions', PERIOD), 0);
  });

  test('another quest’s work is not this quest’s figure', () => {
    quest('q1', { measure: 'verified_submissions' });
    quest('q2');
    approved('ana', 'q2');
    assert.equal(observedFor(db, 'q1', 'verified_submissions', PERIOD), 0);
  });

  test('A REVERSED AWARD DROPS OUT OF THE INDICATOR', () => {
    // The eighth instance of the bug the sprint of 24-25 September cleared
    // out of the rest of this codebase, caught before it shipped.
    quest('q1', { measure: 'weight_kg' });
    approved('ana', 'q1', { weightKg: 10 });
    approved('bo', 'q1', { weightKg: 20 });
    assert.equal(observedFor(db, 'q1', 'weight_kg', PERIOD), 30);

    reverseMovement(db, {
      userId: 'bo', originalSourceRef: 'quest:q1:user:bo', reason: 'proof was not what it claimed',
    });
    assert.equal(observedFor(db, 'q1', 'weight_kg', PERIOD), 10, 'a clawed-back submission still counted');
    assert.equal(observedFor(db, 'q1', 'verified_submissions', PERIOD), 1);
  });

  test('a submission with no award row still counts', () => {
    // Nothing to reverse is not the same as reversed. The host approved it,
    // which is what the measure is about.
    quest('q1', { measure: 'verified_submissions' });
    approved('ana', 'q1', { award: false });
    assert.equal(observedFor(db, 'q1', 'verified_submissions', PERIOD), 1);
  });
});

describe('the reading a partner is handed', () => {
  test('it carries the target, the movement and what neither of them proves', () => {
    quest('q1', { measure: 'weight_kg', baseline: 100, target: 200 });
    approved('ana', 'q1', { weightKg: 185 });

    const r = kpiReading(db, 'q1', PERIOD)!;
    assert.equal(r.observed, 185);
    assert.equal(r.movedBy, 85);
    assert.equal(r.ofTarget, 0.925);
    assert.ok(r.notes.some((n) => /not attribution/.test(n.en)));
    assert.ok(r.notes.some((n) => /Not a carbon figure/.test(n.en)));
  });
});
