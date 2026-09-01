import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  ESG_PILLARS, NOT_CLAIMABLE, esgHeadline, esgReport,
  type EsgActivity, type EsgPeriod,
} from './esg.ts';
import type { Sponsor } from './sponsorship.ts';

const partner: Sponsor = {
  id: 'sp1',
  name: { en: 'Samui Green Foundation', th: 'มูลนิธิสมุยสีเขียว' },
  kind: 'ngo',
};

const period: EsgPeriod = { from: '2026-01-01', to: '2026-12-31' };

const activity = (over: Partial<EsgActivity> = {}): EsgActivity => ({
  questId: 'q1',
  name: { en: 'Beach Cleanup', th: 'เก็บขยะชายหาด' },
  pillar: 'environmental',
  hostName: 'Samui Municipality',
  verified: 0,
  participants: [],
  fundedTHB: 0,
  paidTHB: 0,
  ...over,
});

describe('people are counted once, however much they did', () => {
  test('somebody who did three activities is one participant', () => {
    // The most common inflation in social reporting, and it is arithmetic
    // rather than dishonesty — which is exactly why it survives review.
    const r = esgReport(partner, period, [
      activity({ questId: 'q1', verified: 1, participants: ['ana'] }),
      activity({ questId: 'q2', verified: 1, participants: ['ana'] }),
      activity({ questId: 'q3', verified: 1, participants: ['ana'] }),
    ]);
    assert.equal(r.participants, 1, 'one person was reported as three');
    assert.equal(r.verified, 3, 'the activity count should still be three');
  });

  test('the total is the union of the pillars, not their sum', () => {
    // Ana did one environmental and one social activity. Two pillars each
    // report one person; the report reports one person, not two.
    const r = esgReport(partner, period, [
      activity({ pillar: 'environmental', verified: 1, participants: ['ana', 'bo'] }),
      activity({ questId: 'q2', pillar: 'social', verified: 1, participants: ['ana'] }),
    ]);
    assert.equal(r.byPillar.environmental.participants, 2);
    assert.equal(r.byPillar.social.participants, 1);
    assert.equal(r.participants, 2, 'the pillars were added instead of merged');
  });

  test('a pillar counts distinctly within itself too', () => {
    const r = esgReport(partner, period, [
      activity({ pillar: 'social', verified: 2, participants: ['ana', 'bo'] }),
      activity({ questId: 'q2', pillar: 'social', verified: 1, participants: ['bo'] }),
    ]);
    assert.equal(r.byPillar.social.participants, 2);
    assert.equal(r.byPillar.social.verified, 3);
    assert.equal(r.byPillar.social.activities, 2);
  });

  test('participant ids never appear in the report itself', () => {
    // They go in so the union can be computed; they must not come out. An ESG
    // report is circulated, and who volunteered is personal data.
    const r = esgReport(partner, period, [
      activity({ verified: 1, participants: ['ana', 'bo'] }),
    ]);
    const serialised = JSON.stringify({
      byPillar: r.byPillar, participants: r.participants, verified: r.verified,
    });
    assert.doesNotMatch(serialised, /ana|bo/, 'a participant id leaked into the totals');
  });
});

describe('the three refusals ship with every report', () => {
  test('carbon, assurance and additionality are all named', () => {
    const r = esgReport(partner, period, [activity({ verified: 4, participants: ['ana'] })]);
    const said = r.notClaimable.map((n) => n.en).join(' ');
    assert.match(said, /Carbon/);
    assert.match(said, /tCO2e/);
    assert.match(said, /ISAE 3000/);
    assert.match(said, /Additionality/);
    assert.equal(r.notClaimable.length, NOT_CLAIMABLE.length);
  });

  test('the Thai reader gets all three too', () => {
    for (const n of NOT_CLAIMABLE) {
      assert.match(n.th, /[฀-๿]/, 'a refusal the Thai reader cannot read is not one');
    }
  });

  test('the report has nowhere to put a carbon number', () => {
    // Structural, like SponsorOutcome refusing `reach`. A `tco2e` field would
    // be filled within a week by whoever needed the deck to look better, and
    // a beach cleanup would quietly become a carbon credit.
    const r = esgReport(partner, period, [activity({ verified: 9, participants: ['ana'] })]);
    for (const forbidden of ['tco2e', 'co2', 'carbon', 'emissions', 'offset', 'sroi']) {
      assert.ok(!(forbidden in r), `EsgReport grew a ${forbidden} field`);
    }
  });

  test('assurance says what the verification actually is', () => {
    const r = esgReport(partner, period, []);
    assert.match(r.assurance.en, /named host/);
    assert.match(r.assurance.en, /cannot be edited/);
  });

  test('the boundary is stated rather than assumed', () => {
    // An unstated boundary is an unbounded claim.
    const r = esgReport(partner, period, []);
    assert.match(r.boundary.en, /between the dates shown/);
    assert.match(r.boundary.en, /funded by others, is excluded/);
    assert.deepEqual(r.period, period, 'the report did not carry its own period');
  });
});

describe('what the report leaves out, it says it left out', () => {
  test('unclassified activity is reported, not absorbed', () => {
    // Guessing a pillar from whatever else the record holds mis-files an
    // activity in a document somebody signs. A visible scope exclusion is
    // worth more than a total that quietly swallowed it.
    const r = esgReport(partner, period, [activity({ verified: 2, participants: ['a'] })], 3);
    assert.equal(r.excludedUnclassified, 3);
    assert.equal(r.verified, 2, 'excluded activity leaked into the total');
  });

  test('nothing excluded reports zero, not absence', () => {
    assert.equal(esgReport(partner, period, []).excludedUnclassified, 0);
  });
});

describe('the totals', () => {
  test('money is added across activities', () => {
    const r = esgReport(partner, period, [
      activity({ fundedTHB: 40_000, paidTHB: 1_200, verified: 3, participants: ['a'] }),
      activity({ questId: 'q2', fundedTHB: 25_000, paidTHB: 600, verified: 2, participants: ['b'] }),
    ]);
    assert.equal(r.fundedTHB, 65_000);
    assert.equal(r.paidTHB, 1_800);
    assert.equal(r.verified, 5);
    assert.equal(r.participants, 2);
  });

  test('a pillar with nothing in it reports zero, not undefined', () => {
    const r = esgReport(partner, period, [activity({ pillar: 'environmental', verified: 1 })]);
    for (const pillar of ESG_PILLARS) {
      assert.equal(typeof r.byPillar[pillar].verified, 'number');
      assert.equal(typeof r.byPillar[pillar].participants, 'number');
    }
    assert.equal(r.byPillar.governance.verified, 0);
    assert.equal(r.byPillar.governance.activities, 0);
  });

  test('an empty period is a report, not a crash', () => {
    const r = esgReport(partner, period, []);
    assert.equal(r.verified, 0);
    assert.equal(r.participants, 0);
    assert.equal(r.notClaimable.length, 3, 'an empty report dropped its disclosures');
  });
});

describe('the headline survives being copied out of context', () => {
  test('it says who verified, inside the sentence', () => {
    // It will be pasted into a slide with no caption. A headline that needs
    // its surroundings to stay honest is a headline that will stop being one.
    const r = esgReport(partner, period, [
      activity({ verified: 9, paidTHB: 3_600, participants: ['a', 'b', 'c'] }),
    ]);
    const said = esgHeadline(r).en;
    assert.match(said, /verified by named hosts/);
    assert.match(said, /9 activities/);
    assert.match(said, /3 people/);
    assert.match(said, /3,600 THB/);
  });

  test('one person is a person', () => {
    const r = esgReport(partner, period, [activity({ verified: 1, participants: ['a'] })]);
    assert.match(esgHeadline(r).en, /1 person\b/);
  });

  test('nothing verified says nothing, rather than dressing up a zero', () => {
    const r = esgReport(partner, period, [
      activity({ verified: 0, fundedTHB: 40_000, participants: ['a', 'b'] }),
    ]);
    assert.match(esgHeadline(r).en, /^No activity has been verified/);
    assert.doesNotMatch(esgHeadline(r).en, /40,000/, 'money spent was offered as an outcome');
    assert.match(esgHeadline(r).th, /[฀-๿]/);
  });
});
