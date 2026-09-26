import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { esgReport } from '@chivago/core';
import { openTestDb, type DB } from './db.ts';
import { activityInPeriod } from './esg-service.ts';

let db: DB;
const YEAR = { from: '2026-01-01', to: '2026-12-31' };

const addHost = (id: string, name: string) =>
  db.prepare('INSERT INTO hosts (id, name, type) VALUES (?,?,?)').run(id, name, 'ngo');

const addQuest = (id: string, pillar: string | null) => {
  db.prepare(
    `INSERT INTO quests (id, code, name_en, name_th, where_label, duration, reward_points,
       host_id, kind, lat, lng, geofence_radius_m)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(id, id.toUpperCase(), `Quest ${id}`, `ภารกิจ ${id}`, 'Samui', '1 hr', 100,
    'h1', 'today', 9.5, 100.0, 250);
  if (pillar !== null) {
    db.prepare('UPDATE quests SET esg_pillar = ? WHERE id = ?').run(pillar, id);
  }
};

const approvedOn = (userId: string, questId: string, at: string) => {
  db.prepare('INSERT OR IGNORE INTO users (id, display_name, created_at) VALUES (?,?,?)')
    .run(userId, userId, at);
  db.prepare(
    `INSERT INTO quest_progress (user_id, quest_id, stage, joined_at, arrived_at,
       proof_submitted_at, verified_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(userId, questId, 'complete', at, at, at, at);
};

const SP = 'sp1';

/**
 * A funding line, written to the table as well as returned.
 *
 * It used to be a bare object the caller made up, which was fine while the
 * service only read what it was handed. It now looks across `org_sponsorships`
 * to find out who ELSE funds a quest, so a line that exists only in an
 * argument is a line with no funder - and every approval under it would come
 * back `unfunded`.
 */
const funded = (
  questId: string, fundedTHB = 40_000, perVerifiedTHB = 400,
  orgId = SP, startedAt = '2026-01-01T00:00:00.000Z',
) => {
  db.prepare(
    `INSERT OR IGNORE INTO organisations (id, name_en, name_th, kind, created_at)
     VALUES (?,?,?,?,?)`,
  ).run(orgId, orgId, orgId, 'company', startedAt);
  db.prepare(
    `INSERT OR REPLACE INTO org_sponsorships
       (org_id, quest_id, funded_thb, per_verified_thb, basis, started_at)
     VALUES (?,?,?,?,?,?)`,
  ).run(orgId, questId, fundedTHB, perVerifiedTHB, 'signed', startedAt);
  return { questId, fundedTHB, perVerifiedTHB };
};

beforeEach(() => {
  db = openTestDb();
  addHost('h1', 'Samui Green Foundation');
});

describe('the period is the point', () => {
  test('work verified inside the year counts', () => {
    addQuest('q1', 'environmental');
    approvedOn('ana', 'q1', '2026-06-15T04:00:00.000Z');
    const { classified } = activityInPeriod(db, SP, [funded('q1')], YEAR);
    assert.equal(classified[0]!.verified, 1);
  });

  test('work verified before the period does not', () => {
    // A lifetime-to-date figure inside a fiscal-year report is the quiet kind
    // of wrong that survives review.
    addQuest('q1', 'environmental');
    approvedOn('ana', 'q1', '2025-12-31T23:59:59.000Z');
    const { classified } = activityInPeriod(db, SP, [funded('q1')], YEAR);
    assert.equal(classified[0]!.verified, 0);
  });

  test('the last day of the period is inside it', () => {
    // `verified_at` is a timestamp and `to` is a date. Comparing them raw
    // drops everything after midnight on the closing day — a whole day of
    // work, missing from the report, every single year.
    addQuest('q1', 'environmental');
    approvedOn('ana', 'q1', '2026-12-31T16:30:00.000Z');
    const { classified } = activityInPeriod(db, SP, [funded('q1')], YEAR);
    assert.equal(classified[0]!.verified, 1, 'the closing day was dropped');
  });

  test('the first day of the period is inside it too', () => {
    addQuest('q1', 'environmental');
    approvedOn('ana', 'q1', '2026-01-01T00:00:00.000Z');
    assert.equal(activityInPeriod(db, SP, [funded('q1')], YEAR).classified[0]!.verified, 1);
  });

  test('a submission that was never approved is not activity', () => {
    addQuest('q1', 'environmental');
    db.prepare('INSERT OR IGNORE INTO users (id, display_name, created_at) VALUES (?,?,?)')
      .run('ana', 'Ana', '2026-06-01T00:00:00.000Z');
    db.prepare(
      `INSERT INTO quest_progress (user_id, quest_id, stage, joined_at, proof_submitted_at)
       VALUES (?,?,?,?,?)`,
    ).run('ana', 'q1', 'host_verification', '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z');
    assert.equal(activityInPeriod(db, SP, [funded('q1')], YEAR).classified[0]!.verified, 0);
  });
});

describe('an unclassified quest is excluded and said so', () => {
  test('it stays out of every figure', () => {
    addQuest('q1', 'environmental');
    addQuest('q2', null);
    approvedOn('ana', 'q1', '2026-06-01T00:00:00.000Z');
    approvedOn('bo', 'q2', '2026-06-01T00:00:00.000Z');

    const { classified, excludedUnclassified } = activityInPeriod(
      db, SP, [funded('q1'), funded('q2')], YEAR,
    );
    assert.deepEqual(classified.map((a) => a.questId), ['q1']);
    assert.equal(excludedUnclassified, 1);

    const report = esgReport(
      { id: 'sp1', name: { en: 'P', th: 'พ' }, kind: 'ngo' }, YEAR, classified, excludedUnclassified,
    );
    assert.equal(report.verified, 1, 'unclassified work leaked into the total');
    assert.equal(report.excludedUnclassified, 1);
  });

  test('a nonsense pillar is treated as unclassified, not trusted', () => {
    addQuest('q1', 'ethical-vibes');
    approvedOn('ana', 'q1', '2026-06-01T00:00:00.000Z');
    const { classified, excludedUnclassified } = activityInPeriod(db, SP, [funded('q1')], YEAR);
    assert.deepEqual(classified, []);
    assert.equal(excludedUnclassified, 1);
  });

  test('an unclassified quest nobody did is not a scope gap', () => {
    // Nothing was excluded, because there was nothing to exclude. Counting it
    // would put a warning on a report about an empty quest.
    addQuest('q1', null);
    assert.equal(activityInPeriod(db, SP, [funded('q1')], YEAR).excludedUnclassified, 0);
  });
});

describe('people and money', () => {
  test('participants come back as ids so the report can count them once', () => {
    addQuest('q1', 'environmental');
    addQuest('q2', 'social');
    approvedOn('ana', 'q1', '2026-06-01T00:00:00.000Z');
    approvedOn('ana', 'q2', '2026-07-01T00:00:00.000Z');
    approvedOn('bo', 'q2', '2026-07-01T00:00:00.000Z');

    const { classified } = activityInPeriod(db, SP, [funded('q1'), funded('q2')], YEAR);
    const report = esgReport(
      { id: 'sp1', name: { en: 'P', th: 'พ' }, kind: 'ngo' }, YEAR, classified,
    );
    assert.equal(report.verified, 3, 'three approvals happened');
    assert.equal(report.participants, 2, 'Ana was counted twice');
  });

  test('money paid is counted from approvals and capped at what was committed', () => {
    // 5 approvals at 400 is 2,000 against a 1,000 budget. Reporting 2,000
    // describes a debt rather than a contribution.
    addQuest('q1', 'social');
    for (const who of ['a', 'b', 'c', 'd', 'e']) {
      approvedOn(who, 'q1', '2026-06-01T00:00:00.000Z');
    }
    const { classified } = activityInPeriod(db, SP, [funded('q1', 1_000, 400)], YEAR);
    assert.equal(classified[0]!.verified, 5);
    assert.equal(classified[0]!.paidTHB, 1_000);
  });

  test('the host who verified it is named on the activity', () => {
    // The whole assurance claim rests on there being a name.
    addQuest('q1', 'environmental');
    approvedOn('ana', 'q1', '2026-06-01T00:00:00.000Z');
    assert.equal(
      activityInPeriod(db, SP, [funded('q1')], YEAR).classified[0]!.hostName,
      'Samui Green Foundation',
    );
  });

  test('funding nothing returns an empty report rather than throwing', () => {
    assert.deepEqual(activityInPeriod(db, SP, [], YEAR), { classified: [], excludedUnclassified: 0 });
  });
});

/**
 * One activity, one filer.
 *
 * Two companies fund the same cleanup and each writes its report from its own
 * records. Neither is lying and neither can see the other, so the activity is
 * counted twice in the world and once in each filing. It is findable here
 * only because both funded through one ledger — the single thing a shared
 * platform has that a consultant does not.
 */
describe('an approval belongs to one filer, or says that it does not', () => {
  const alsoFundedBy = (questId: string, orgId: string, startedAt: string) =>
    funded(questId, 10_000, 400, orgId, startedAt);

  test('one funder, and every approval is exclusively theirs', () => {
    addQuest('q1', 'environmental');
    approvedOn('ana', 'q1', '2026-06-15T04:00:00.000Z');
    approvedOn('bo', 'q1', '2026-07-15T04:00:00.000Z');

    const { classified } = activityInPeriod(db, SP, [funded('q1')], YEAR);
    assert.deepEqual(
      [classified[0]!.verified, classified[0]!.exclusiveVerified, classified[0]!.sharedVerified],
      [2, 2, 0],
    );
  });

  test('a second funder makes the approvals after it shared', () => {
    addQuest('q1', 'environmental');
    const line = funded('q1');
    alsoFundedBy('q1', 'sp2', '2026-07-01T00:00:00.000Z');
    approvedOn('ana', 'q1', '2026-06-15T04:00:00.000Z');
    approvedOn('bo', 'q1', '2026-08-15T04:00:00.000Z');

    const { classified } = activityInPeriod(db, SP, [line], YEAR);
    assert.deepEqual(
      [classified[0]!.verified, classified[0]!.exclusiveVerified, classified[0]!.sharedVerified],
      [2, 1, 1],
      'work done before the second partner arrived was not kept exclusive',
    );
  });

  test('the report earns the sentence only when nothing is shared', () => {
    addQuest('q1', 'environmental');
    approvedOn('ana', 'q1', '2026-06-15T04:00:00.000Z');

    const clean = esgReport(
      { id: SP, name: { en: 'Acme', th: 'Acme' }, kind: 'company' },
      YEAR,
      activityInPeriod(db, SP, [funded('q1')], YEAR).classified,
    );
    assert.equal(clean.exclusiveVerified, 1);
    assert.equal(clean.sharedVerified, 0);
    assert.match(clean.exclusivity.en, /funded by this partner alone/);

    alsoFundedBy('q1', 'sp2', '2026-01-01T00:00:00.000Z');
    const shared = esgReport(
      { id: SP, name: { en: 'Acme', th: 'Acme' }, kind: 'company' },
      YEAR,
      activityInPeriod(db, SP, [funded('q1')], YEAR).classified,
    );
    assert.equal(shared.sharedVerified, 1);
    assert.ok(
      !/alone/.test(shared.exclusivity.en),
      'the guarantee survived an activity another partner can also report',
    );
  });

  test('BOTH partners are told, not just the one who asked second', () => {
    // The failure that would make this worthless. If exclusivity were decided
    // by who filed first, the earlier report would keep a guarantee it no
    // longer deserves - and the platform would be helping one of them
    // double-count against the other.
    addQuest('q1', 'environmental');
    const mine = funded('q1');
    const theirs = alsoFundedBy('q1', 'sp2', '2026-01-01T00:00:00.000Z');
    approvedOn('ana', 'q1', '2026-06-15T04:00:00.000Z');

    assert.equal(activityInPeriod(db, SP, [mine], YEAR).classified[0]!.sharedVerified, 1);
    assert.equal(activityInPeriod(db, 'sp2', [theirs], YEAR).classified[0]!.sharedVerified, 1);
  });

  test('a top-up from the same partner is not a second funder', () => {
    // Two funding lines from one org on one quest is a top-up, not a
    // co-funding, and the table's primary key does not stop it happening
    // across quests. Counting rows rather than distinct orgs would have
    // called this shared and thrown away a real guarantee.
    addQuest('q1', 'environmental');
    const line = funded('q1');
    approvedOn('ana', 'q1', '2026-06-15T04:00:00.000Z');
    assert.equal(activityInPeriod(db, SP, [line], YEAR).classified[0]!.exclusiveVerified, 1);
  });

  test('an approval nobody was funding yet is in neither count', () => {
    // It still happened, so it stays in `verified`. What it is not is a claim
    // anybody can make - and calling it exclusive would hand it to whichever
    // partner asked for a report first.
    addQuest('q1', 'environmental');
    const line = funded('q1', 40_000, 400, SP, '2026-09-01T00:00:00.000Z');
    approvedOn('ana', 'q1', '2026-06-15T04:00:00.000Z');

    const a = activityInPeriod(db, SP, [line], YEAR).classified[0]!;
    assert.deepEqual([a.verified, a.exclusiveVerified, a.sharedVerified], [1, 0, 0]);
  });
});
