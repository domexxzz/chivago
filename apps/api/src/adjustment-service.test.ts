import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { adjustedClaimState, esgReport, type Funder } from '@chivago/core';
import { openTestDb, type DB } from './db.ts';
import {
  InvalidAdjustment, adjustmentById, adjustmentsFor, adjustmentsForQuests,
  resumeClaim, standDown, voidAdjustment,
} from './adjustment-service.ts';
import { activityInPeriod } from './esg-service.ts';

/**
 * A partner standing down, met by the database.
 *
 * The assertions that carry weight are the ones about what the record refuses
 * to hold — a stand-down by somebody who never funded the quest, or one
 * back-dated past their own funding — and the one at the bottom, where a
 * stand-down reaches the report and the report declines to call the work
 * this partner's own funding.
 */

let db: DB;
const JAN = '2026-01-01T00:00:00.000Z';
const JUN = '2026-06-01T00:00:00.000Z';
const NOV = new Date('2026-11-01T00:00:00.000Z');
const YEAR = { from: '2026-01-01', to: '2026-12-31' };

const org = (id: string, en: string, th: string) =>
  db.prepare(
    "INSERT OR IGNORE INTO organisations (id,name_en,name_th,kind,created_at) VALUES (?,?,?,'company',?)",
  ).run(id, en, th, JAN);

const quest = (id: string, pillar: string | null = 'environmental') => {
  db.prepare(
    `INSERT INTO quests (id, code, name_en, name_th, where_label, duration, reward_points,
       host_id, kind, lat, lng, geofence_radius_m)
     VALUES (?,?,?,?,'Samui','1 hr',100,'h1','today',9.5,100.0,250)`,
  ).run(id, id.toUpperCase(), `Quest ${id}`, `ภารกิจ ${id}`);
  if (pillar !== null) db.prepare('UPDATE quests SET esg_pillar = ? WHERE id = ?').run(pillar, id);
};

const funds = (orgId: string, questId: string, startedAt = JAN) => {
  org(orgId, orgId, orgId);
  db.prepare(
    `INSERT OR REPLACE INTO org_sponsorships
       (org_id, quest_id, funded_thb, per_verified_thb, basis, started_at)
     VALUES (?,?,40000,400,'signed',?)`,
  ).run(orgId, questId, startedAt);
};

const approvedOn = (userId: string, questId: string, at: string) => {
  db.prepare('INSERT OR IGNORE INTO users (id,display_name,created_at) VALUES (?,?,?)')
    .run(userId, userId, at);
  db.prepare(
    `INSERT INTO quest_progress (user_id, quest_id, stage, joined_at, arrived_at,
       proof_submitted_at, verified_at)
     VALUES (?,?,'complete',?,?,?,?)`,
  ).run(userId, questId, at, at, at, at);
};

beforeEach(() => {
  db = openTestDb();
  db.prepare("INSERT INTO hosts (id,name,type) VALUES ('h1','Samui Municipality','ngo')").run();
});

describe('what the record refuses to hold', () => {
  test('A STAND-DOWN BY SOMEBODY WHO NEVER FUNDED THE QUEST', () => {
    // There is nothing to give up, and a row saying otherwise would look
    // like a concession to anybody reading the list.
    quest('q1');
    org('org-ghost', 'Ghost Co', 'โกสต์');
    assert.throws(
      () => standDown(db, { orgId: 'org-ghost', questId: 'q1', recordedBy: 'Nok' }, NOV),
      InvalidAdjustment,
    );
    assert.equal(adjustmentsFor(db, 'q1').length, 0);
  });

  test('ONE BACK-DATED PAST THE PARTNER’S OWN FUNDING', () => {
    // Otherwise it reads as covering approvals the partner never had a claim
    // on, which overstates what was conceded.
    quest('q1');
    funds('org-ptt', 'q1', JUN);
    assert.throws(
      () => standDown(db, {
        orgId: 'org-ptt', questId: 'q1', effectiveFrom: JAN, recordedBy: 'Nok',
      }, NOV),
      InvalidAdjustment,
    );
  });

  test('a date that is not a date', () => {
    quest('q1');
    funds('org-ptt', 'q1');
    assert.throws(
      () => standDown(db, {
        orgId: 'org-ptt', questId: 'q1', effectiveFrom: 'sometime', recordedBy: 'Nok',
      }, NOV),
      InvalidAdjustment,
    );
  });

  test('the effective date defaults to when their funding began', () => {
    quest('q1');
    funds('org-ptt', 'q1', JUN);
    assert.equal(standDown(db, { orgId: 'org-ptt', questId: 'q1', recordedBy: 'Nok' }, NOV)
      .effectiveFrom, JUN);
  });

  test('standing down twice is the same stand-down', () => {
    quest('q1');
    funds('org-ptt', 'q1');
    const first = standDown(db, { orgId: 'org-ptt', questId: 'q1', recordedBy: 'Nok' }, NOV);
    const again = standDown(db, {
      orgId: 'org-ptt', questId: 'q1', reason: 'different words', recordedBy: 'Nok',
    }, NOV);
    assert.equal(again.id, first.id);
    assert.equal(adjustmentsFor(db, 'q1').length, 1);
  });
});

describe('resuming and voiding are different operations', () => {
  const standing = () => {
    quest('q1');
    funds('org-ptt', 'q1');
    return standDown(db, { orgId: 'org-ptt', questId: 'q1', recordedBy: 'Nok' }, NOV);
  };

  test('RESUMING LEAVES THE WINDOW THAT PASSED GIVEN UP', () => {
    const a = resumeClaim(db, standing().id, 'claiming again from FY2027', NOV);
    assert.equal(a.resumedAt, NOV.toISOString());
    assert.equal(a.voidedAt, null);
    // Inside the window: still given up. After it: claimed again.
    assert.equal(adjustedClaimState(
      [{ sponsorId: 'org-ptt', startedAt: JAN }] as Funder[], [a], JUN,
    ), 'relinquished');
    assert.equal(adjustedClaimState(
      [{ sponsorId: 'org-ptt', startedAt: JAN }] as Funder[], [a],
      '2026-12-01T00:00:00.000Z',
    ), 'exclusive');
  });

  test('VOIDING UNDOES IT FROM THE START, SO A TYPO IS NOT PERMANENT', () => {
    const a = voidAdjustment(db, standing().id, 'entered against the wrong quest', NOV);
    assert.equal(a.voidedAt, NOV.toISOString());
    assert.equal(adjustedClaimState(
      [{ sponsorId: 'org-ptt', startedAt: JAN }] as Funder[], [a], JUN,
    ), 'exclusive');
  });

  test('a resumed stand-down can still be voided', () => {
    // Finding out in December that it was entered against the wrong quest
    // does not become untrue because somebody resumed in June.
    const a = standing();
    resumeClaim(db, a.id, 'resumed', NOV);
    const voided = voidAdjustment(db, a.id, 'wrong quest all along', NOV);
    assert.notEqual(voided.resumedAt, null);
    assert.notEqual(voided.voidedAt, null);
  });

  test('a voided stand-down cannot be resumed', () => {
    const a = standing();
    voidAdjustment(db, a.id, 'wrong quest', NOV);
    assert.throws(() => resumeClaim(db, a.id, 'x', NOV), InvalidAdjustment);
  });

  test('the first resumption is the one that stands', () => {
    const a = standing();
    resumeClaim(db, a.id, 'first', NOV);
    const twice = resumeClaim(db, a.id, 'second', new Date('2027-01-01T00:00:00.000Z'));
    assert.equal(twice.resumedAt, NOV.toISOString());
    assert.equal(twice.resumedReason, 'first');
  });

  test('a partner who resumed can stand down again, and both windows are kept', () => {
    const a = standing();
    resumeClaim(db, a.id, 'resumed', NOV);
    const second = standDown(db, {
      orgId: 'org-ptt', questId: 'q1', effectiveFrom: '2027-01-01T00:00:00.000Z',
      recordedBy: 'Nok',
    }, new Date('2027-01-01T00:00:00.000Z'));
    assert.notEqual(second.id, a.id);
    assert.equal(adjustmentsFor(db, 'q1').length, 2);
  });

  test('two standing stand-downs by one partner cannot be forced in', () => {
    standing();
    assert.throws(
      () => db.prepare(
        `INSERT INTO claim_adjustments (id, org_id, quest_id, effective_from, channel, recorded_at)
         VALUES ('forced','org-ptt','q1',?,'entered_by_staff',?)`,
      ).run(JAN, NOV.toISOString()),
      /UNIQUE/,
    );
  });

  test('a stand-down is appended, never edited', () => {
    const a = standing();
    for (const sql of [
      "UPDATE claim_adjustments SET org_id = 'org-siam' WHERE id = ?",
      "UPDATE claim_adjustments SET quest_id = 'q2' WHERE id = ?",
      "UPDATE claim_adjustments SET effective_from = '2020-01-01T00:00:00.000Z' WHERE id = ?",
    ]) {
      assert.throws(() => db.prepare(sql).run(a.id), /append-only/, sql);
    }
  });

  test('resuming or voiding something that does not exist is refused', () => {
    assert.throws(() => resumeClaim(db, 'nope', 'x', NOV), InvalidAdjustment);
    assert.throws(() => voidAdjustment(db, 'nope', 'x', NOV), InvalidAdjustment);
  });
});

describe('reading them back', () => {
  test('across several quests in one call', () => {
    quest('q1'); quest('q2'); quest('q3');
    funds('org-ptt', 'q1'); funds('org-ptt', 'q2');
    standDown(db, { orgId: 'org-ptt', questId: 'q1', recordedBy: 'Nok' }, NOV);
    standDown(db, { orgId: 'org-ptt', questId: 'q2', recordedBy: 'Nok' }, NOV);
    assert.equal(adjustmentsForQuests(db, ['q1', 'q2', 'q3']).length, 2);
    assert.equal(adjustmentsForQuests(db, []).length, 0);
    assert.equal(adjustmentById(db, 'nope'), null);
  });
});

describe('what reaches the report', () => {
  /* Two partners fund one quest; one of them stands down. */
  const coFunded = () => {
    quest('q1');
    funds('org-siam', 'q1');
    funds('org-ptt', 'q1');
    approvedOn('u1', 'q1', JUN);
    approvedOn('u2', 'q1', JUN);
  };
  const reportFor = (orgId: string) => {
    const { classified, excludedUnclassified } = activityInPeriod(db, orgId, [{
      questId: 'q1', fundedTHB: 40_000, perVerifiedTHB: 400,
    }], YEAR);
    return esgReport(
      { id: orgId, name: { en: orgId, th: orgId }, kind: 'company' },
      YEAR, classified, excludedUnclassified,
    );
  };

  test('co-funded and nobody standing down reads as shared, as it always did', () => {
    coFunded();
    const r = reportFor('org-siam');
    assert.equal(r.sharedVerified, 2);
    assert.equal(r.byAdjustment, 0);
    assert.equal(r.exclusiveVerified, 0);
    assert.match(r.exclusivity.en, /2 of these 2 approvals were co-funded/);
  });

  test('ONE PARTNER STANDS DOWN AND THE WORK IS NOT CALLED THE OTHER’S OWN FUNDING', () => {
    // The failure this guards: the adjustment quietly lands in
    // `exclusiveVerified` and the report says "funded by this partner alone"
    // about work a co-funder paid for.
    coFunded();
    standDown(db, { orgId: 'org-ptt', questId: 'q1', recordedBy: 'Nok' }, NOV);

    const r = reportFor('org-siam');
    assert.equal(r.byAdjustment, 2);
    assert.equal(r.exclusiveVerified, 0);
    assert.equal(r.sharedVerified, 0);
    assert.doesNotMatch(r.exclusivity.en, /Every one of these/);
    assert.match(r.exclusivity.en, /A further 2 were co-funded/);
    assert.match(r.exclusivity.en, /not witnessed by ChivaGo/);
  });

  test('BOTH PARTNERS STANDING DOWN LEAVES THE WORK IN NOBODY’S COLUMN', () => {
    coFunded();
    standDown(db, { orgId: 'org-ptt', questId: 'q1', recordedBy: 'Nok' }, NOV);
    standDown(db, { orgId: 'org-siam', questId: 'q1', recordedBy: 'Nok' }, NOV);

    const r = reportFor('org-siam');
    assert.equal(r.exclusiveVerified, 0);
    assert.equal(r.sharedVerified, 0);
    assert.equal(r.byAdjustment, 0);
    // The work still happened, and the report still says so.
    assert.equal(r.verified, 2);
  });

  test('a sole funder standing down does not hand the work to anybody', () => {
    quest('q1');
    funds('org-siam', 'q1');
    approvedOn('u1', 'q1', JUN);
    standDown(db, { orgId: 'org-siam', questId: 'q1', recordedBy: 'Nok' }, NOV);
    const r = reportFor('org-siam');
    assert.equal(r.exclusiveVerified, 0);
    assert.equal(r.byAdjustment, 0);
    assert.equal(r.verified, 1);
  });

  test('a stand-down that begins mid-year splits the year at that date', () => {
    quest('q1');
    funds('org-siam', 'q1');
    funds('org-ptt', 'q1');
    approvedOn('u1', 'q1', JAN);
    approvedOn('u2', 'q1', '2026-09-01T00:00:00.000Z');
    standDown(db, {
      orgId: 'org-ptt', questId: 'q1', effectiveFrom: JUN, recordedBy: 'Nok',
    }, NOV);

    const r = reportFor('org-siam');
    assert.equal(r.sharedVerified, 1, 'the January approval was still co-funded');
    assert.equal(r.byAdjustment, 1, 'the September one was conceded');
    assert.match(r.exclusivity.en, /The remaining 1 is still shared/);
  });

  test('THE PARTNER WHO STOOD DOWN DOES NOT COUNT THE WORK IN THEIR OWN REPORT', () => {
    // The inversion this whole mechanism exists to prevent. Before
    // stand-downs a funder was always a claimant, so nothing had to ask.
    coFunded();
    standDown(db, { orgId: 'org-ptt', questId: 'q1', recordedBy: 'Nok' }, NOV);

    const theirs = reportFor('org-ptt');
    assert.equal(theirs.exclusiveVerified, 0);
    assert.equal(theirs.sharedVerified, 0);
    assert.equal(theirs.byAdjustment, 0, 'the partner who conceded counted it anyway');

    // And the other partner does have it, so nothing was lost in the process.
    assert.equal(reportFor('org-siam').byAdjustment, 2);
  });

  test('a voided stand-down leaves the report exactly as it was', () => {
    coFunded();
    const a = standDown(db, { orgId: 'org-ptt', questId: 'q1', recordedBy: 'Nok' }, NOV);
    voidAdjustment(db, a.id, 'wrong quest', NOV);
    const r = reportFor('org-siam');
    assert.equal(r.sharedVerified, 2);
    assert.equal(r.byAdjustment, 0);
  });
});
