/**
 * The join that turns `calibrated: false` into a question somebody can answer.
 *
 * Three things here are the whole point, so each is pinned:
 *
 *  1. A KILO IS NOT A CONTACT COUNT. The weight comes off a scale and the
 *     prediction comes out of a particle run. The table may put them side by
 *     side; nothing may add them, scale one by the other, or let a segment
 *     nobody cleaned count as a measured zero.
 *  2. NOTHING MAY BE SILENTLY DROPPED. A weighed proof that no shoreline can
 *     claim is reported as unattributed, because a discard is how a total
 *     comes to disagree with its own rows.
 *  3. ONLY APPROVED EVIDENCE COUNTS. An unreviewed proof is a claim and a
 *     rejected one is a claim that failed.
 */

import { strict as assert } from 'node:assert';
import { before, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { URL, fileURLToPath } from 'node:url';

import { openTestDb, type DB } from './db-node.ts';
import {
  MAX_ATTRIBUTION_M, MIN_SEGMENTS_FOR_AGREEMENT, coastalCalibration, parseDriftRun,
  rankAgreement, recordDriftRun, runExpired, runInForceAt, weighedProofs, type DriftRun,
} from './coastal-calibration.ts';

/** The run that shipped, read from the file the app serves. */
const published = parseDriftRun(JSON.parse(readFileSync(
  fileURLToPath(new URL('../../mobile/public/islands/koh-sichang.drift.json', import.meta.url)),
  'utf8',
)) as unknown);

/** A small island of four segments, so every number below can be read by hand. */
const toy: DriftRun = {
  model: 'toy', issued: '2026-11-28T00:00+07:00', window: 6, calibrated: false,
  seeding: 'uniform offshore grid; no observed debris mass', source: 'test',
  segments: [
    { id: 1, count: 80, firstHours: 1, near: 'หาดหนึ่ง', beach: null, path: [[100.800, 13.150]] },
    { id: 2, count: 40, firstHours: 2, near: 'หาดสอง', beach: null, path: [[100.810, 13.150]] },
    { id: 3, count: 10, firstHours: 5, near: null, beach: 'หาดสาม', path: [[100.820, 13.150]] },
    { id: 4, count: 0, firstHours: null, near: 'หาดสี่', beach: null, path: [[100.830, 13.150]] },
  ],
};

const DAY = '2026-11-20';
let db: DB;
let quests = 0;
let users = 0;

/** A quest at a coordinate, and an approved proof of this weight against it. */
function weighed(
  lat: number, lng: number, weightKg: number | null,
  over: { approved?: 0 | 1 | null; reviewedAt?: string | null } = {},
): void {
  const questId = `q-${++quests}`;
  const userId = `u-${++users}`;
  db.prepare(
    `INSERT INTO quests (id, code, name_en, name_th, where_label, duration, reward_points,
       host_id, kind, lat, lng, geofence_radius_m)
     VALUES (?, ?, 'Cleanup', 'เก็บขยะ', 'shore', '1h', 10, 'host-1', 'today', ?, ?, 120)`,
  ).run(questId, `C-${quests}`, lat, lng);
  db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)')
    .run(userId, 'Cleaner', `${DAY}T00:00:00Z`);
  db.prepare(
    `INSERT INTO proofs (id, user_id, quest_id, photos, weight_kg, submitted_at, reviewed_at, approved)
     VALUES (?, ?, ?, '[]', ?, ?, ?, ?)`,
  ).run(
    `p-${quests}`, userId, questId, weightKg, `${DAY}T01:00:00Z`,
    over.reviewedAt === undefined ? `${DAY}T02:00:00Z` : over.reviewedAt,
    over.approved === undefined ? 1 : over.approved,
  );
}

before(() => {
  db = openTestDb();
  db.prepare('INSERT INTO hosts (id, name, type) VALUES (?,?,?)')
    .run('host-1', 'Ko Sichang Municipality', 'municipality');
});

describe('the published run still parses, and still says it is uncalibrated', () => {
  test('it has its 43 shorelines and refuses to claim calibration', () => {
    assert.ok(published, 'the file the app serves must parse here too');
    assert.equal(published.segments.length, 43);
    assert.equal(published.calibrated, false);
    assert.match(String(published.seeding), /no observed debris mass/);
  });

  test('a file claiming to be calibrated is refused rather than believed', () => {
    const raw = { ...toy, calibrated: true };
    assert.equal(parseDriftRun(raw), null,
      'a page would have started calling it calibrated on somebody else’s behalf');
  });

  test('the freshness rule is the same one the app applies', () => {
    const issued = Date.parse(toy.issued!);
    assert.equal(runExpired(toy, issued + 3_600_000), false);
    assert.equal(runExpired(toy, issued + 7 * 3_600_000), true);
    assert.equal(runExpired({ ...toy, issued: null }), true);
    assert.equal(runExpired(null), true);
  });
});

describe('a weighed proof is credited to the nearest shoreline', () => {
  test('and only approved, reviewed, weighed proofs are counted at all', () => {
    weighed(13.1501, 100.8001, 12);          // segment 1
    weighed(13.1500, 100.8100, 5);           // segment 2
    weighed(13.1500, 100.8102, 2.5);         // segment 2 as well
    weighed(13.1500, 100.8200, 9, { approved: 0 });        // rejected
    weighed(13.1500, 100.8200, 9, { approved: null, reviewedAt: null }); // pending
    weighed(13.1500, 100.8200, null);        // no scale reading
    const found = weighedProofs(db, DAY, DAY);
    assert.equal(found.length, 3, 'a claim or an unweighed proof reached the figures');

    const result = coastalCalibration(db, toy, DAY, DAY, Date.parse(toy.issued!));
    const byId = new Map(result.segments.map((s) => [s.id, s]));
    assert.equal(byId.get(1)!.weightKg, 12);
    assert.equal(byId.get(1)!.cleanups, 1);
    assert.equal(byId.get(2)!.weightKg, 7.5);
    assert.equal(byId.get(2)!.cleanups, 2);
    // Segment 3's only proofs were a rejection, a pending review and an
    // unweighed submission, so it has no measured weight - which is NOT a
    // measured zero, and the agreement below must not treat it as one.
    assert.equal(byId.get(3)!.weightKg, 0);
    assert.equal(byId.get(3)!.cleanups, 0);
  });

  test('the heaviest shoreline is first, whatever the model said', () => {
    const result = coastalCalibration(db, toy, DAY, DAY, Date.parse(toy.issued!));
    assert.deepEqual(result.segments.map((s) => s.id), [1, 2, 3, 4]);
    // Segment 4 was never reached by the run and never cleaned; it stays in
    // the table as a shoreline with no evidence either way.
    assert.equal(result.segments.at(-1)!.predicted, 0);
    assert.equal(result.segments.at(-1)!.weightKg, 0);
  });

  test('it reports how far the pin was, because that is the error bar', () => {
    const result = coastalCalibration(db, toy, DAY, DAY, Date.parse(toy.issued!));
    const first = result.segments.find((s) => s.id === 1)!;
    assert.ok(first.nearestMetres !== null);
    assert.ok(first.nearestMetres < 50, 'a pin on the segment should read as metres, not hundreds');
    assert.equal(result.segments.find((s) => s.id === 4)!.nearestMetres, null);
  });
});

describe('nothing weighed is quietly dropped', () => {
  test('a cleanup too far from any shoreline is reported, not discarded', () => {
    // Twelve kilometres east: the Si Racha mainland, which is no shoreline of
    // this island. Far outside MAX_ATTRIBUTION_M by any reading.
    weighed(13.1500, 100.9400, 30);
    const result = coastalCalibration(db, toy, DAY, DAY, Date.parse(toy.issued!));
    assert.equal(result.unattributed.cleanups, 1);
    assert.equal(result.unattributed.weightKg, 30);

    // And the total still equals the rows plus what no row could claim.
    const inRows = result.segments.reduce((sum, s) => sum + s.weightKg, 0);
    assert.equal(
      Number((inRows + result.unattributed.weightKg).toFixed(3)), result.totals.weightKg,
      'the total disagrees with its own table',
    );
    const cleanupsInRows = result.segments.reduce((sum, s) => sum + s.cleanups, 0);
    assert.equal(cleanupsInRows + result.unattributed.cleanups, result.totals.cleanups);
  });

  test('with no run at all, every weighed proof is unattributed rather than lost', () => {
    const result = coastalCalibration(db, null, DAY, DAY);
    assert.equal(result.segments.length, 0);
    assert.equal(result.run, null);
    assert.equal(result.expired, true, 'no run cannot read as a current one');
    assert.equal(result.unattributed.cleanups, result.totals.cleanups);
    assert.equal(result.unattributed.weightKg, result.totals.weightKg);
    assert.ok(result.totals.weightKg > 0, 'the weights vanished with the run');
  });

  test('the period is the period of approval, and it bounds the figures', () => {
    const empty = coastalCalibration(db, toy, '2026-01-01', '2026-01-02');
    assert.equal(empty.totals.weightKg, 0);
    assert.equal(empty.totals.cleanups, 0);
    assert.ok(empty.segments.length > 0, 'the shorelines went away with the evidence');
  });
});

describe('the agreement between the model and the scale', () => {
  test('it refuses to report a coefficient off too few shorelines', () => {
    const few = Array.from({ length: MIN_SEGMENTS_FOR_AGREEMENT - 1 }, (_, i) => ({
      predicted: i * 10, weightKg: i + 1,
    }));
    assert.equal(rankAgreement(few), null);
  });

  test('a segment with no cleanup is an absence of evidence, not a zero', () => {
    // Eight ranked shorelines, plus fifty the run never reached. If the empty
    // ones counted as measured zeroes they would dominate the coefficient.
    const ranked = Array.from({ length: 8 }, (_, i) => ({ predicted: i * 10, weightKg: i + 1 }));
    const padded = [...ranked, ...Array.from({ length: 50 }, () => ({ predicted: 0, weightKg: 0 }))];
    assert.deepEqual(rankAgreement(padded), rankAgreement(ranked));
    assert.equal(rankAgreement(ranked)!.segments, 8);
  });

  test('perfect order reads as 1, reversed as -1', () => {
    const rising = Array.from({ length: 8 }, (_, i) => ({ predicted: i, weightKg: i + 1 }));
    assert.equal(rankAgreement(rising)!.rho, 1);
    const falling = rising.map((p, i) => ({ predicted: p.predicted, weightKg: 8 - i }));
    assert.equal(rankAgreement(falling)!.rho, -1);
  });

  test('a plateau of equal weights does not invent an ordering', () => {
    // Every bag weighed 1 kg. There is no ordering in the weights, so there is
    // nothing for the prediction to agree with, and the honest answer is none
    // rather than a number read off the row order.
    const flat = Array.from({ length: 8 }, (_, i) => ({ predicted: i * 3, weightKg: 1 }));
    assert.equal(rankAgreement(flat), null);
  });

  test('ties share a rank rather than taking array position', () => {
    const a = [
      { predicted: 5, weightKg: 1 }, { predicted: 5, weightKg: 2 },
      { predicted: 9, weightKg: 3 }, { predicted: 1, weightKg: 4 },
      { predicted: 7, weightKg: 5 }, { predicted: 3, weightKg: 6 },
    ];
    const swapped = [a[1]!, a[0]!, ...a.slice(2)];
    assert.equal(rankAgreement(a)!.rho, rankAgreement(swapped)!.rho);
  });
});

describe('the real island, with real geometry', () => {
  test('a cleanup at Tham Phang beach lands on a Tham Phang segment', () => {
    assert.ok(published);
    const fresh = { ...published, issued: new Date().toISOString() };
    const scratch = openTestDb();
    scratch.prepare('INSERT INTO hosts (id, name, type) VALUES (?,?,?)')
      .run('host-1', 'Ko Sichang Municipality', 'municipality');
    scratch.prepare(
      `INSERT INTO quests (id, code, name_en, name_th, where_label, duration, reward_points,
         host_id, kind, lat, lng, geofence_radius_m)
       VALUES ('q-tp', 'TP-1', 'Cleanup', 'เก็บขยะ', 'Tham Phang', '1h', 10, 'host-1', 'today',
         13.1454, 100.806835, 150)`,
    ).run();
    scratch.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)')
      .run('u-tp', 'Cleaner', `${DAY}T00:00:00Z`);
    scratch.prepare(
      `INSERT INTO proofs (id, user_id, quest_id, photos, weight_kg, submitted_at, reviewed_at, approved)
       VALUES ('p-tp', 'u-tp', 'q-tp', '[]', 18.5, ?, ?, 1)`,
    ).run(`${DAY}T01:00:00Z`, `${DAY}T02:00:00Z`);

    const result = coastalCalibration(scratch, fresh, DAY, DAY);
    assert.equal(result.expired, false);
    assert.equal(result.unattributed.cleanups, 0,
      'a cleanup on the island’s own beach found no shoreline to belong to');
    const credited = result.segments.find((s) => s.cleanups === 1)!;
    assert.equal(credited.weightKg, 18.5);
    assert.ok(credited.nearestMetres !== null && credited.nearestMetres <= MAX_ATTRIBUTION_M);
    // One weighed proof is nowhere near enough to rank anything.
    assert.equal(result.agreement, null);
  });
});

/*
  THE ARCHIVE, AND WHY `calibrated: false` COULD NEVER HAVE CHANGED WITHOUT IT.

  A run is published as one file and the next run overwrites it. So a cleanup
  on 5 December could never be compared with the prediction that was standing
  on 5 December - by the 6th that prediction did not exist anywhere, in this
  repository or out of it. Calibration was never blocked on evidence alone.
*/
describe('every run we see is kept, because the next one overwrites the file', () => {
  const RUN_AT = '2026-11-28T06:00:00.000Z';
  let archive: DB;

  const earlier: DriftRun = {
    ...toy, model: 'sichang-rk2-sensitivity-v2', issued: '2026-11-28T00:00:00.000Z', window: 6,
  };
  const later: DriftRun = { ...earlier, issued: '2026-11-28T12:00:00.000Z' };

  before(() => {
    archive = openTestDb();
    recordDriftRun(archive, earlier, RUN_AT);
    recordDriftRun(archive, later, RUN_AT);
  });

  test('seeing the same run again is free and changes nothing', () => {
    recordDriftRun(archive, earlier, '2026-11-29T00:00:00.000Z');
    recordDriftRun(archive, earlier, '2026-11-30T00:00:00.000Z');
    const kept = archive.prepare('SELECT COUNT(*) AS n FROM drift_runs').all() as { n: number }[];
    assert.equal(kept[0]!.n, 2, 'the console reads this file on every page load');
  });

  test('a run with no issue time is not kept, because it cannot be found again', () => {
    const scratch = openTestDb();
    recordDriftRun(scratch, { ...earlier, issued: null }, RUN_AT);
    const none = scratch.prepare('SELECT COUNT(*) AS n FROM drift_runs').all() as { n: number }[];
    assert.equal(none[0]!.n, 0);
    recordDriftRun(scratch, null, RUN_AT);
    const still = scratch.prepare('SELECT COUNT(*) AS n FROM drift_runs').all() as { n: number }[];
    assert.equal(still[0]!.n, 0);
  });

  test('the run standing at a moment is the one whose window covers it', () => {
    assert.equal(runInForceAt(archive, '2026-11-28T03:00:00.000Z')?.issued, earlier.issued);
    assert.equal(runInForceAt(archive, '2026-11-28T15:00:00.000Z')?.issued, later.issued);
    // Its segments come back with it: a prediction with no numbers is not one.
    assert.equal(runInForceAt(archive, '2026-11-28T03:00:00.000Z')?.segments.length, 4);
  });

  test('a moment no kept run covers is unpaired, not quietly given the nearest run', () => {
    // Nine hours after the earlier run issued, three before the later one:
    // nothing was standing. A fallback to the newest run would produce a
    // calibration figure out of two things that never met.
    assert.equal(runInForceAt(archive, '2026-11-28T09:00:00.000Z'), null);
    // And before anything at all was ever issued.
    assert.equal(runInForceAt(archive, '2026-11-01T00:00:00.000Z'), null);
  });
});

describe('the calibration set is counted, and it starts at zero', () => {
  /** A cleanup submitted at a given instant, approved at another. */
  const cleanup = (
    into: DB, id: string, submittedAt: string, weightKg: number, reviewedAt = submittedAt,
  ): void => {
    into.prepare(
      `INSERT INTO quests (id, code, name_en, name_th, where_label, duration, reward_points,
         host_id, kind, lat, lng, geofence_radius_m)
       VALUES (?, ?, 'Cleanup', 'x', 'shore', '1h', 10, 'host-1', 'today', 13.150, 100.800, 120)`,
    ).run(`q-${id}`, `C-${id}`);
    into.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)')
      .run(`u-${id}`, 'Cleaner', submittedAt);
    into.prepare(
      `INSERT INTO proofs (id, user_id, quest_id, photos, weight_kg, submitted_at,
         reviewed_at, approved) VALUES (?, ?, ?, '[]', ?, ?, ?, 1)`,
    ).run(`p-${id}`, `u-${id}`, `q-${id}`, weightKg, submittedAt, reviewedAt);
  };

  const host = (into: DB): void => {
    into.prepare('INSERT INTO hosts (id, name, type) VALUES (?,?,?)')
      .run('host-1', 'Ko Sichang Municipality', 'municipality');
  };

  const RUN: DriftRun = {
    ...toy, model: 'sichang-rk2-sensitivity-v2', issued: '2026-11-28T00:00:00.000Z', window: 6,
  };

  let fresh: DB;
  before(() => {
    fresh = openTestDb();
    host(fresh);
  });

  test('with no archive, nothing is paired however much was collected', () => {
    cleanup(fresh, 'a', '2026-11-28T03:00:00.000Z', 10);
    cleanup(fresh, 'b', '2026-11-28T04:00:00.000Z', 12);
    const report = coastalCalibration(fresh, RUN, '2026-11-28', '2026-11-28');
    assert.equal(report.calibrationSet.runsKept, 0);
    assert.equal(report.calibrationSet.paired, 0,
      'a cleanup was paired with a run that was never kept');
    assert.equal(report.calibrationSet.unpaired, 2);
    assert.equal(report.calibrationSet.archiveFrom, null);
    // The weights are still there; only the pairing is missing.
    assert.equal(report.totals.weightKg, 22);
  });

  test('once the run is kept, the cleanups inside its window pair with it', () => {
    recordDriftRun(fresh, RUN, '2026-11-28T00:00:00.000Z');
    // Outside the six-hour window: collected nine hours after it was issued.
    cleanup(fresh, 'c', '2026-11-28T09:00:00.000Z', 5);
    const report = coastalCalibration(fresh, RUN, '2026-11-28', '2026-11-28');
    assert.equal(report.calibrationSet.runsKept, 1);
    assert.equal(report.calibrationSet.paired, 2, 'the two inside the window did not pair');
    assert.equal(report.calibrationSet.unpaired, 1, 'the one outside it was paired anyway');
    assert.equal(report.calibrationSet.archiveFrom, RUN.issued);
  });

  test('pairing follows the submission, not the approval', () => {
    /*
      The period on the page is bounded by approval, because that is when
      evidence counts. The pairing has to use the submission, because that is
      when somebody was standing on the sand - and a host who approves a week
      later must not move the cleanup into a different run, or out of every
      run there is.
    */
    const late = openTestDb();
    host(late);
    recordDriftRun(late, RUN, '2026-11-28T00:00:00.000Z');
    cleanup(late, 'l', '2026-11-28T03:00:00.000Z', 8, '2026-12-05T10:00:00.000Z');
    const report = coastalCalibration(late, RUN, '2026-12-05', '2026-12-05');
    assert.equal(report.totals.weightKg, 8, 'the period should count it by its approval');
    assert.equal(report.calibrationSet.paired, 1,
      'approving a week later moved the cleanup out of the run it actually tested');
  });
});
