import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';
import { randomUUID } from 'node:crypto';

import {
  WATCH_ABSOLUTE, WATCH_MIN_BASELINE_DAYS, WATCH_OVERTURN_MIN, WATCH_SPIKE_FLOOR,
} from '@chivago/core';
import { openTestDb, type DB } from './db.ts';
import { flaggedModerators, moderatorWatch } from './moderator-watch.ts';

let db: DB;
const NOW = new Date('2026-08-31T12:00:00Z');
/**
 * Strictly OLDER than the recent window.
 *
 * The recent lower bound is inclusive, so exactly 24h ago still counts as
 * recent. A fixture that writes baseline days at daysAgo(1) puts them on both
 * sides of the line.
 */
const daysAgo = (d: number) => new Date(NOW.getTime() - (d + 1) * 86_400_000);
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

beforeEach(() => { db = openTestDb(); });

/** Write straight to the log: this module reads history, it does not make it. */
const act = (
  action: string, moderator: string, at: Date, reviewId = randomUUID(),
) => {
  db.prepare(
    `INSERT INTO moderation_log (id, action, review_id, place_id, moderator, acted_at)
     VALUES (?,?,?,?,?,?)`,
  ).run(randomUUID(), action, reviewId, 'chaweng', moderator, at.toISOString());
  return reviewId;
};

const hidesOn = (moderator: string, at: Date, count: number) => {
  for (let i = 0; i < count; i += 1) act('hide', moderator, at);
};

const watchFor = (moderator: string) =>
  moderatorWatch(db, NOW).find((m) => m.moderator === moderator)!;

describe('a busy moderator is not a suspicious one', () => {
  test('someone who always takes down a lot does NOT trip the spike rule', () => {
    // Twenty a day for a fortnight, and twenty again today. Nothing changed,
    // so nothing should fire - the old fixed threshold flagged this person
    // every single day until the flag meant nothing.
    for (let d = 1; d <= WATCH_MIN_BASELINE_DAYS + 3; d += 1) hidesOn('Ploy', daysAgo(d), 20);
    hidesOn('Ploy', hoursAgo(2), 20);

    const w = watchFor('Ploy');
    assert.equal(w.baselineMedian, 20);
    assert.ok(!w.reasons.includes('spike'), 'their normal is their normal');
  });

  test('but a lot is still a lot - the absolute backstop remains', () => {
    for (let d = 1; d <= WATCH_MIN_BASELINE_DAYS + 3; d += 1) hidesOn('Ploy', daysAgo(d), 20);
    hidesOn('Ploy', hoursAgo(2), 20);
    // Somebody whose normal is already very high never spikes, and twenty
    // take-downs in a day is worth knowing about even when it is routine.
    assert.ok(watchFor('Ploy').reasons.includes('absolute'));
  });
});

describe('a quiet moderator who suddenly is not', () => {
  test('a spike against their own normal is caught', () => {
    // Two a day for a fortnight, twelve today. Far below the fixed threshold
    // that used to be the only rule, and the case actually worth catching.
    for (let d = 1; d <= WATCH_MIN_BASELINE_DAYS + 3; d += 1) hidesOn('Anan', daysAgo(d), 2);
    hidesOn('Anan', hoursAgo(3), 12);

    const w = watchFor('Anan');
    assert.equal(w.baselineMedian, 2);
    assert.equal(w.recentHides, 12);
    assert.ok(w.reasons.includes('spike'));
    assert.ok(!w.reasons.includes('absolute'), 'twelve is under the absolute rule');
  });

  test('a small rise over a tiny baseline is not a spike', () => {
    // Normal is one a day; today is two. Three times the baseline, and not
    // news about anything - which is what the floor is for.
    for (let d = 1; d <= WATCH_MIN_BASELINE_DAYS + 2; d += 1) hidesOn('Nok', daysAgo(d), 1);
    hidesOn('Nok', hoursAgo(1), 2);
    assert.ok(watchFor('Nok').recentHides < WATCH_SPIKE_FLOOR);
    assert.deepEqual(watchFor('Nok').reasons, []);
  });

  test('the baseline excludes today, so a spike cannot raise its own bar', () => {
    for (let d = 1; d <= WATCH_MIN_BASELINE_DAYS + 2; d += 1) hidesOn('Anan', daysAgo(d), 2);
    hidesOn('Anan', hoursAgo(3), 30);
    assert.equal(watchFor('Anan').baselineMedian, 2, 'today is not in the baseline');
    assert.ok(watchFor('Anan').reasons.includes('spike'));
  });

  test('the baseline is a MEDIAN, so one bulk day cannot hide the rest', () => {
    // One legitimate cleanup of forty, then two a day. A mean would be about
    // seven and would swallow a later spike of eight entirely.
    hidesOn('Anan', daysAgo(9), 40);
    for (let d = 1; d <= WATCH_MIN_BASELINE_DAYS + 2; d += 1) hidesOn('Anan', daysAgo(d), 2);
    hidesOn('Anan', hoursAgo(2), 8);

    const w = watchFor('Anan');
    assert.equal(w.baselineMedian, 2);
    assert.ok(w.reasons.includes('spike'));
  });
});

describe('when there is nothing to compare against', () => {
  test('a brand new moderator acting a lot says so, rather than pretending', () => {
    hidesOn('Fresh', hoursAgo(2), WATCH_ABSOLUTE);
    const w = watchFor('Fresh');
    assert.equal(w.baselineDays, 0);
    // Not a suspicion. It says we have no basis for judgement, which is itself
    // a reason for a human to look.
    assert.ok(w.reasons.includes('no_baseline'));
    assert.ok(!w.reasons.includes('spike'), 'a ratio from no data is not maths');
  });

  test('too few days of history falls back to the absolute rule', () => {
    for (let d = 1; d < WATCH_MIN_BASELINE_DAYS; d += 1) hidesOn('Fresh', daysAgo(d), 1);
    hidesOn('Fresh', hoursAgo(2), 9);
    const w = watchFor('Fresh');
    assert.ok(w.baselineDays < WATCH_MIN_BASELINE_DAYS);
    // Nine is a big jump from one, but three data points is noise in the
    // costume of statistics - and nine is under the absolute rule, so nothing
    // fires and the desk is not told a story the data cannot support.
    assert.deepEqual(w.reasons, []);
  });

  test('a new moderator doing very little is not flagged at all', () => {
    hidesOn('Fresh', hoursAgo(2), 2);
    assert.deepEqual(watchFor('Fresh').reasons, []);
  });
});

describe('reversals say more than volume', () => {
  /** A take-down that somebody later put back. */
  const overturnedHide = (moderator: string, at: Date) => {
    const id = act('hide', moderator, at);
    act('restore', 'Anan', new Date(at.getTime() + 3_600_000), id);
  };

  test('a moderator whose calls keep being reversed is flagged on nothing else', () => {
    // Five take-downs, three put back. Nowhere near any volume rule - and this
    // is the one that matters: volume says BUSY, reversals say WRONG.
    for (let i = 0; i < 3; i += 1) overturnedHide('Ploy', daysAgo(3));
    hidesOn('Ploy', daysAgo(3), 2);

    const w = watchFor('Ploy');
    assert.equal(w.totalHides, 5);
    assert.equal(w.overturned, 3);
    assert.ok(w.overturnRate >= 0.6);
    assert.deepEqual(w.reasons, ['overturned'], 'no volume rule fired');
  });

  test('a couple of reversals out of many is normal, not a flag', () => {
    for (let i = 0; i < 2; i += 1) overturnedHide('Ploy', daysAgo(3));
    hidesOn('Ploy', daysAgo(3), 30);
    const w = watchFor('Ploy');
    assert.ok(w.overturnRate < 0.3);
    assert.ok(!w.reasons.includes('overturned'));
  });

  test('two reversals out of two is not a verdict on anybody', () => {
    // 100% overturned, and on a sample of two. Below the volume minimum the
    // rate is arithmetic, not evidence.
    for (let i = 0; i < 2; i += 1) overturnedHide('Fresh', daysAgo(3));
    const w = watchFor('Fresh');
    assert.equal(w.overturnRate, 1);
    assert.ok(w.totalHides < WATCH_OVERTURN_MIN);
    assert.ok(!w.reasons.includes('overturned'), 'a rate needs a denominator');
  });

  test('a restore BEFORE the take-down does not count as reversing it', () => {
    const id = act('hide', 'Ploy', daysAgo(3));
    act('restore', 'Anan', daysAgo(5), id);
    // Hidden, restored, hidden again: the earlier restore reversed an earlier
    // decision, not this one. Ordering has to be respected or every repeat
    // offender looks like a bad moderator.
    assert.equal(watchFor('Ploy').overturned, 0);
  });
});

describe('the flag has to explain itself', () => {
  test('every flagged moderator carries at least one reason', () => {
    hidesOn('Fresh', hoursAgo(2), WATCH_ABSOLUTE);
    for (const m of flaggedModerators(db, NOW)) {
      // A warning that cannot say which rule fired is an accusation. The
      // reader needs to know whether it means "unusual for them" or "a lot in
      // absolute terms" before acting on it.
      assert.ok(m.reasons.length > 0, `${m.moderator} flagged with no reason`);
    }
  });

  test('an unremarkable moderator is not in the flagged list at all', () => {
    hidesOn('Nok', hoursAgo(2), 1);
    assert.deepEqual(flaggedModerators(db, NOW), []);
  });

  test('flagged moderators sort to the top', () => {
    hidesOn('Quiet', hoursAgo(2), 1);
    hidesOn('Fresh', hoursAgo(2), WATCH_ABSOLUTE);
    const all = moderatorWatch(db, NOW);
    assert.equal(all[0]!.moderator, 'Fresh', 'anyone worth a look leads');
  });

  test('a moderator with no history at all does not appear', () => {
    hidesOn('Ploy', hoursAgo(2), 1);
    assert.equal(moderatorWatch(db, NOW).length, 1);
  });
});
