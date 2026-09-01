import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  UNMEASURED, sponsorHeadline, sponsorOutcome,
  type QuestCounts, type Sponsor, type Sponsorship,
} from './sponsorship.ts';

const sponsor: Sponsor = {
  id: 'sp1',
  name: { en: 'Samui Green Foundation', th: 'มูลนิธิสมุยสีเขียว' },
  kind: 'ngo',
};

const funding = (over: Partial<Sponsorship> = {}): Sponsorship => ({
  sponsorId: 'sp1', questId: 'q1', fundedTHB: 10_000, perVerifiedTHB: 200,
  startedAt: '2026-08-01T00:00:00.000Z', ...over,
});

const counts = (over: Partial<QuestCounts> = {}): QuestCounts => ({
  questId: 'q1', joined: 0, arrived: 0, verified: 0, rejected: 0, greenPointsIssued: 0, ...over,
});

describe('a join is not an outcome', () => {
  test('forty joins and no approvals is reported as nothing delivered', () => {
    // The single easiest lie in this product. Forty people tapped Join, the
    // sponsor has been charged nothing and received nothing, and a dashboard
    // leading with "40" would be selling them their own optimism.
    const o = sponsorOutcome(sponsor, [funding()], [counts({ joined: 40, arrived: 12 })]);
    assert.equal(o.verified, 0);
    assert.equal(o.toCommunityTHB, 0);
    assert.equal(o.unspentTHB, 10_000);
    assert.match(sponsorHeadline(o).en, /^Nothing verified yet/);
    assert.match(sponsorHeadline(o).th, /^ยังไม่มีภารกิจที่ผ่านการตรวจ/);
  });

  test('the headline leads with verified and puts joins last', () => {
    const o = sponsorOutcome(sponsor, [funding()], [counts({ joined: 40, arrived: 30, verified: 12 })]);
    const said = sponsorHeadline(o).en;
    assert.ok(said.indexOf('12 verified') < said.indexOf('40 started'), 'joins came first');
  });

  test('completion rate is reported, including when it is bad', () => {
    // A quest everyone starts and nobody finishes needs changing. Hiding the
    // ratio is how a platform keeps billing for it.
    const o = sponsorOutcome(sponsor, [funding()], [counts({ joined: 100, verified: 3 })]);
    assert.equal(o.completionRate, 0.03);
  });
});

describe('money is counted from approvals, never from budget', () => {
  test('what reached hosts is verified x rate, not the amount funded', () => {
    const o = sponsorOutcome(sponsor, [funding()], [counts({ joined: 20, verified: 12 })]);
    assert.equal(o.toCommunityTHB, 2_400);
    assert.equal(o.unspentTHB, 7_600);
    assert.equal(o.costPerVerifiedTHB, 200);
  });

  test('a quest cannot pay out more than its sponsor put in', () => {
    // 80 approvals at 200 is 16,000 against a 10,000 budget. Reporting 16,000
    // would describe a debt rather than a contribution.
    const o = sponsorOutcome(sponsor, [funding()], [counts({ joined: 90, verified: 80 })]);
    assert.equal(o.toCommunityTHB, 10_000);
    assert.equal(o.unspentTHB, 0);
  });

  test('cost per verified is null rather than a division by zero', () => {
    const o = sponsorOutcome(sponsor, [funding()], [counts({ joined: 5 })]);
    assert.equal(o.costPerVerifiedTHB, null);
    // 0 and null mean different things and both are useful: five people
    // started and none finished is a completion rate of zero, which is a
    // real and damning number. null is reserved for nobody having started.
    assert.equal(o.completionRate, 0);
    assert.equal(sponsorOutcome(sponsor, [funding()], []).completionRate, null);
  });

  test('several quests add up, and each is capped on its own budget', () => {
    const o = sponsorOutcome(
      sponsor,
      [funding(), funding({ questId: 'q2', fundedTHB: 5_000, perVerifiedTHB: 500 })],
      [counts({ verified: 10, joined: 15 }), counts({ questId: 'q2', verified: 20, joined: 25 })],
    );
    assert.equal(o.fundedTHB, 15_000);
    // q1: 10 x 200 = 2,000. q2: 20 x 500 = 10,000, capped at its 5,000 budget.
    assert.equal(o.toCommunityTHB, 7_000);
    assert.equal(o.verified, 30);
  });
});

describe('it stays inside what the ledger knows', () => {
  test('another sponsor’s quests are not counted', () => {
    const o = sponsorOutcome(
      sponsor,
      [funding(), funding({ sponsorId: 'sp2', questId: 'q9', fundedTHB: 99_000 })],
      [counts({ verified: 5 }), counts({ questId: 'q9', verified: 500 })],
    );
    assert.equal(o.fundedTHB, 10_000);
    assert.equal(o.verified, 5);
  });

  test('a funded quest with no activity yet contributes nothing, not undefined', () => {
    const o = sponsorOutcome(sponsor, [funding()], []);
    assert.equal(o.verified, 0);
    assert.equal(o.fundedTHB, 10_000, 'the money was still committed');
  });

  test('every report says what it does not measure', () => {
    const o = sponsorOutcome(sponsor, [funding()], [counts({ verified: 3, joined: 4 })]);
    assert.equal(o.notMeasured.length, UNMEASURED.length);
    const said = o.notMeasured.map((n) => n.en).join(' ');
    assert.match(said, /Reach and impressions/);
    assert.match(said, /Sales attributed/);
    assert.match(said, /sentiment/i);
    for (const n of o.notMeasured) {
      assert.match(n.th, /[฀-๿]/, 'a disclosure the Thai reader cannot read is not a disclosure');
    }
  });

  test('the shape has nowhere to put a number nobody measured', () => {
    // Structural, not stylistic. A `reach` field would be filled within a
    // week by whoever needed the deck to look better.
    const o = sponsorOutcome(sponsor, [funding()], [counts({ verified: 1 })]);
    for (const forbidden of ['reach', 'impressions', 'views', 'sentiment', 'estimatedValue']) {
      assert.ok(!(forbidden in o), `SponsorOutcome grew a ${forbidden} field`);
    }
  });
});
