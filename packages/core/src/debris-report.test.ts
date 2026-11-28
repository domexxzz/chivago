import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import {
  DEBRIS_MERGE_RADIUS_M,
  DEBRIS_REJECT_REASON,
  debrisAreaOf,
  debrisCaseNumber,
  debrisPriority,
  hardestDebrisAccess,
  largestDebrisAmount,
  readDebrisReport,
  triageDebrisReport,
  type DebrisReportInput,
  type OpenDebrisCase,
} from './debris-report.ts';
import { metresBetween } from './presence.ts';

const NOW = new Date('2026-11-23T03:30:00.000Z'); // 10:30 on the island
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

// Tham Phang beach, where seed.ts puts it.
const THAM_PHANG = { lat: 13.1454, lng: 100.806835 };
// Si Racha's waterfront, eleven kilometres east across the channel.
const SI_RACHA = { lat: 13.1676, lng: 100.9253 };
/** A point `m` metres due north of `at`. */
const north = (at: { lat: number; lng: number }, m: number) => ({ lat: at.lat + m / 111_195, lng: at.lng });

const report = (over: Partial<DebrisReportInput> = {}): DebrisReportInput => ({
  ...THAM_PHANG, accuracyM: 8, mocked: false, takenAt: hoursAgo(0.1),
  kinds: ['foam'], amount: 'strand', access: 'climb', ...over,
});

const openCase = (id: string, at: { lat: number; lng: number }, lastReportAt: string): OpenDebrisCase =>
  ({ id, lat: at.lat, lng: at.lng, lastReportAt });

describe('reading what the phone sent', () => {
  const raw = {
    position: { lat: THAM_PHANG.lat, lng: THAM_PHANG.lng, accuracyM: 8 },
    takenAt: hoursAgo(0.1), kinds: ['foam', 'net_rope', 'foam'], amount: 'pile', access: 'walk',
  };

  test('a full report reads, and a kind ticked twice counts once', () => {
    const read = readDebrisReport(raw, NOW);
    assert.equal(read.ok, true);
    if (!read.ok) return;
    assert.deepEqual(read.value.kinds, ['foam', 'net_rope']);
    assert.equal(read.value.mocked, false);
    assert.equal(read.value.accuracyM, 8);
  });

  test('what was seen is optional - the photograph already shows it', () => {
    const read = readDebrisReport({ ...raw, kinds: undefined }, NOW);
    assert.equal(read.ok, true);
    if (read.ok) assert.deepEqual(read.value.kinds, []);
  });

  test('how much and how to reach it are not optional, and every problem comes back at once', () => {
    const read = readDebrisReport({ ...raw, amount: 'loads', access: undefined, kinds: ['treasure'] }, NOW);
    assert.equal(read.ok, false);
    if (!read.ok) assert.deepEqual([...read.problems].sort(), ['access', 'amount', 'kinds']);
  });

  test('no position, no report: the coordinate is the whole point', () => {
    const read = readDebrisReport({ ...raw, position: { lat: '13.1', lng: 100.8 } }, NOW);
    assert.equal(read.ok, false);
    if (!read.ok) assert.deepEqual(read.problems, ['position']);
  });

  test('a photograph dated in the future is refused rather than trusted', () => {
    const tomorrow = new Date(NOW.getTime() + 24 * 3_600_000).toISOString();
    const read = readDebrisReport({ ...raw, takenAt: tomorrow }, NOW);
    assert.equal(read.ok, false);
    if (!read.ok) assert.deepEqual(read.problems, ['taken_at']);
  });

  test('a phone clock a minute fast is not a lie', () => {
    const aMinuteAhead = new Date(NOW.getTime() + 60_000).toISOString();
    assert.equal(readDebrisReport({ ...raw, takenAt: aMinuteAhead }, NOW).ok, true);
  });

  test('kinds may arrive as a JSON list or as one bare word; a broken list is a problem, not silence', () => {
    const bare = readDebrisReport({ ...raw, kinds: 'foam' }, NOW);
    assert.equal(bare.ok && bare.value.kinds.join(), 'foam');
    const listed = readDebrisReport({ ...raw, kinds: '["glass","foam"]' }, NOW);
    assert.equal(listed.ok && listed.value.kinds.join(), 'foam,glass');
    const broken = readDebrisReport({ ...raw, kinds: '["foam"' }, NOW);
    assert.equal(broken.ok, false);
  });

  test('the position may arrive as the JSON string a multipart form carries', () => {
    const read = readDebrisReport({ ...raw, position: JSON.stringify(raw.position) }, NOW);
    assert.equal(read.ok, true);
  });
});

describe('which island a report belongs to', () => {
  test('Tham Phang is Ko Sichang', () => {
    assert.equal(debrisAreaOf(THAM_PHANG), 'koh-sichang');
  });

  test('a boat a kilometre off the west coast is still Ko Sichang - "seen from the boat" is an answer', () => {
    assert.equal(debrisAreaOf({ lat: 13.1454, lng: 100.7880 }), 'koh-sichang');
  });

  test('Si Racha is not, and neither is Samui, which takes no reports yet', () => {
    assert.equal(debrisAreaOf(SI_RACHA), null);
    assert.equal(debrisAreaOf({ lat: 9.5120, lng: 100.0136 }), null);
  });
});

describe('triage: the four rules that keep the queue honest', () => {
  test('a position the phone itself calls simulated is refused before anything else is read', () => {
    assert.deepEqual(triageDebrisReport(report({ mocked: true }), [], NOW), { verdict: 'rejected', reason: 'mocked' });
  });

  test('a photograph from Si Racha is sent back, not queued', () => {
    assert.deepEqual(triageDebrisReport(report(SI_RACHA), [], NOW), { verdict: 'rejected', reason: 'outside_area' });
  });

  test('a photograph older than a day is sent back: that rubbish has had two tides since', () => {
    assert.deepEqual(triageDebrisReport(report({ takenAt: hoursAgo(25) }), [], NOW), { verdict: 'rejected', reason: 'stale' });
  });

  test('a fresh report with nothing open nearby opens a case on its island', () => {
    assert.deepEqual(triageDebrisReport(report(), [], NOW), { verdict: 'opened', area: 'koh-sichang' });
  });

  test('forty metres from an open case, an hour after its last report, is the same pile', () => {
    const near = north(THAM_PHANG, 40);
    const verdict = triageDebrisReport(report(near), [openCase('c1', THAM_PHANG, hoursAgo(1))], NOW);
    assert.equal(verdict.verdict, 'merged');
    if (verdict.verdict === 'merged') {
      assert.equal(verdict.caseId, 'c1');
      assert.ok(Math.abs(verdict.distanceM - 40) < 1, `${verdict.distanceM} m`);
    }
  });

  test('sixty metres away is a different place on the beach', () => {
    const verdict = triageDebrisReport(report(north(THAM_PHANG, 60)), [openCase('c1', THAM_PHANG, hoursAgo(1))], NOW);
    assert.deepEqual(verdict, { verdict: 'opened', area: 'koh-sichang' });
  });

  test('the same spot four hours later is a different tide, so a different case', () => {
    const verdict = triageDebrisReport(report(), [openCase('c1', THAM_PHANG, hoursAgo(4.2))], NOW);
    assert.deepEqual(verdict, { verdict: 'opened', area: 'koh-sichang' });
  });

  test('a report that arrives late still joins the case it was taken beside', () => {
    // Taken at 08:00, sent at 10:30 after the boat; the case's last report was 09:00.
    const verdict = triageDebrisReport(report({ takenAt: hoursAgo(2.5) }), [openCase('c1', THAM_PHANG, hoursAgo(1.5))], NOW);
    assert.equal(verdict.verdict, 'merged');
  });

  test('between two open cases it joins the nearer one', () => {
    const at = north(THAM_PHANG, 20);
    const verdict = triageDebrisReport(report(at), [
      openCase('far', north(THAM_PHANG, -25), hoursAgo(1)),
      openCase('near', north(THAM_PHANG, 30), hoursAgo(1)),
    ], NOW);
    assert.equal(verdict.verdict === 'merged' && verdict.caseId, 'near');
  });

  test('the merge radius is the one the triage board promises', () => {
    assert.equal(DEBRIS_MERGE_RADIUS_M, 50);
    const edge = north(THAM_PHANG, 49.5);
    assert.ok(metresBetween(edge, THAM_PHANG) <= DEBRIS_MERGE_RADIUS_M);
    assert.equal(triageDebrisReport(report(edge), [openCase('c1', THAM_PHANG, hoursAgo(1))], NOW).verdict, 'merged');
  });

  test('every refusal has a sentence the reporter can read in all three languages', () => {
    for (const reason of ['mocked', 'outside_area', 'stale'] as const) {
      const said = DEBRIS_REJECT_REASON[reason];
      assert.ok(said.en.length > 10 && said.th.length > 10 && (said.zh ?? '').length > 4, reason);
    }
  });
});

describe('which case goes first', () => {
  test('severity times people times access: a long tideline four people saw outranks one bag', () => {
    const big = debrisPriority({ amount: 'strand', access: 'walk', reporters: 4 });
    const small = debrisPriority({ amount: 'bag', access: 'walk', reporters: 1 });
    assert.ok(big > small);
    assert.equal(big, 3 * 4 * 1);
  });

  test('steps or rocks rank below the same pile on open sand: it needs two people and takes longer', () => {
    assert.ok(debrisPriority({ amount: 'pile', access: 'walk', reporters: 2 })
      > debrisPriority({ amount: 'pile', access: 'climb', reporters: 2 }));
  });

  test('a pile only a boat reaches has no place on the truck run at all', () => {
    assert.equal(debrisPriority({ amount: 'strand', access: 'boat_only', reporters: 9 }), 0);
  });

  test('when reporters disagree, the case is planned for the hardest way in and the biggest pile', () => {
    assert.equal(hardestDebrisAccess(['walk', 'climb', 'walk']), 'climb');
    assert.equal(hardestDebrisAccess(['walk', 'boat_only']), 'boat_only');
    assert.equal(largestDebrisAmount(['bag', 'strand', 'pile']), 'strand');
  });
});

describe('case numbers', () => {
  test('KS, the year and month on the island, and a four-digit running number', () => {
    assert.equal(debrisCaseNumber('KS', new Date('2026-11-23T03:31:00.000Z'), 142), 'KS-2611-0142');
  });

  test('the month turns at midnight in Bangkok, not in London', () => {
    // 01:00 on 1 December on the island is still 30 November in UTC.
    assert.equal(debrisCaseNumber('KS', new Date('2026-11-30T18:00:00.000Z'), 1), 'KS-2612-0001');
  });
});
