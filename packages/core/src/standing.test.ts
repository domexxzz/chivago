import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  MIN_FOR_RANKING, isRankable, positionOf, rankHosts, rankTravellers, standingFrom,
  type HostStanding, type TravellerStanding,
} from './standing.ts';

const host = (over: Partial<HostStanding> = {}): HostStanding => ({
  hostId: 'h1', name: 'Samui Municipality', type: 'municipality',
  verified: 0, pending: 0, questsPosted: 1, greenIssued: 0, ...over,
});

const traveller = (over: Partial<TravellerStanding> = {}): TravellerStanding => ({
  userId: 'u1', displayName: 'Traveller', greenVerified: 0, missionsVerified: 0, ...over,
});

describe('a ranking on self-reported points pays people to lie', () => {
  test('the traveller row has nowhere to put a self-verified figure', () => {
    // Structural, not stylistic — the same refusal SponsorOutcome makes about
    // `reach`. A `tripPoints` field would be filled in by whoever wanted the
    // table to look busier, and a ranking containing one unchecked number is
    // a ranking of who is most willing to claim.
    const t = traveller({ greenVerified: 400 });
    for (const forbidden of ['tripPoints', 'trip', 'totalPoints', 'points', 'score']) {
      assert.ok(!(forbidden in t), `TravellerStanding grew a ${forbidden} field`);
    }
  });

  test('travellers sort on verified points, and ties break totally', () => {
    const ranked = rankTravellers([
      traveller({ userId: 'c', displayName: 'Cara', greenVerified: 100, missionsVerified: 1 }),
      traveller({ userId: 'a', displayName: 'Ana', greenVerified: 400, missionsVerified: 2 }),
      traveller({ userId: 'b', displayName: 'Bo', greenVerified: 100, missionsVerified: 3 }),
    ]);
    assert.deepEqual(ranked.map((t) => t.userId), ['a', 'b', 'c']);
  });

  test('a completely tied table still has one stable order', () => {
    // An unstable sort reshuffles on every refresh and makes somebody look
    // like they moved when nothing happened.
    const rows = [
      traveller({ userId: 'z', displayName: 'Zoe' }),
      traveller({ userId: 'a', displayName: 'Ada' }),
    ];
    assert.deepEqual(rankTravellers(rows).map((t) => t.userId), ['a', 'z']);
    assert.deepEqual(rankTravellers([...rows].reverse()).map((t) => t.userId), ['a', 'z']);
  });
});

describe('one traveller is not a ranking', () => {
  test('a single participant is not rankable', () => {
    // The real state of the island today. A podium with one step on it
    // implies a crowd that does not exist.
    assert.equal(isRankable(1), false);
    assert.equal(isRankable(0), false);
    assert.equal(isRankable(MIN_FOR_RANKING), true);
  });

  test('participants counts who has verified something, not who signed up', () => {
    // Counting registrations would inflate the one number that decides
    // whether the table is honest.
    const s = standingFrom([], [
      traveller({ userId: 'a', greenVerified: 400 }),
      traveller({ userId: 'b', greenVerified: 0 }),
      traveller({ userId: 'c', greenVerified: 0 }),
    ]);
    assert.equal(s.travellers.length, 3);
    assert.equal(s.participants, 1);
    assert.equal(isRankable(s.participants), false, 'three signups became a ranking of one');
  });

  test('every standing carries the basis it was ranked on', () => {
    const s = standingFrom([host()], [traveller()]);
    assert.match(s.rankedBy.en, /verified/i);
    assert.match(s.rankedBy.en, /not counted/i, 'it does not say what is excluded');
    assert.match(s.rankedBy.th, /[฀-๿]/, 'a disclosure the Thai reader cannot read is not one');
  });
});

describe('hosts are ranked on work done, not points claimed', () => {
  test('most approvals first', () => {
    const ranked = rankHosts([
      host({ hostId: 'a', name: 'Ocean Lab', verified: 2 }),
      host({ hostId: 'b', name: 'Samui Green', verified: 9 }),
      host({ hostId: 'c', name: 'Fisherman’s Village', verified: 5 }),
    ]);
    assert.deepEqual(ranked.map((h) => h.hostId), ['b', 'c', 'a']);
  });

  test('a host with many quests and no approvals does not outrank one with approvals', () => {
    // Posting is not doing. A host can list twenty quests in an afternoon;
    // approving one submission means somebody looked at a photograph.
    const ranked = rankHosts([
      host({ hostId: 'poster', name: 'A', questsPosted: 20, verified: 0 }),
      host({ hostId: 'worker', name: 'B', questsPosted: 1, verified: 1 }),
    ]);
    assert.equal(ranked[0]!.hostId, 'worker');
  });

  test('equal approvals break on Green issued, then on name', () => {
    const ranked = rankHosts([
      host({ hostId: 'x', name: 'Xylo', verified: 3, greenIssued: 100 }),
      host({ hostId: 'y', name: 'Alpha', verified: 3, greenIssued: 900 }),
      host({ hostId: 'z', name: 'Beta', verified: 3, greenIssued: 100 }),
    ]);
    assert.deepEqual(ranked.map((h) => h.hostId), ['y', 'z', 'x']);
  });

  test('pending work is carried but never ranked on', () => {
    // A queue of unreviewed submissions is a host's backlog, not their
    // achievement. Ranking on it would reward the slowest reviewer.
    const ranked = rankHosts([
      host({ hostId: 'slow', name: 'A', verified: 1, pending: 50 }),
      host({ hostId: 'fast', name: 'B', verified: 2, pending: 0 }),
    ]);
    assert.equal(ranked[0]!.hostId, 'fast');
    assert.equal(ranked[1]!.pending, 50, 'the backlog was dropped rather than shown');
  });

  test('an empty island ranks nothing and does not throw', () => {
    const s = standingFrom([], []);
    assert.deepEqual(s.hosts, []);
    assert.equal(s.participants, 0);
  });
});

describe('a position is counted among participants, from the top', () => {
  test('the most verified traveller is first, and ties follow the table', () => {
    const rows = [
      traveller({ userId: 'c', displayName: 'Cara', greenVerified: 100, missionsVerified: 1 }),
      traveller({ userId: 'a', displayName: 'Ana', greenVerified: 400, missionsVerified: 2 }),
      traveller({ userId: 'b', displayName: 'Bo', greenVerified: 100, missionsVerified: 3 }),
    ];
    assert.equal(positionOf(rows, 'a'), 1);
    assert.equal(positionOf(rows, 'b'), 2);
    assert.equal(positionOf(rows, 'c'), 3);
  });

  test('no verified points is no position, not last place', () => {
    // "4th of 3" is the number a screen invents when it is not told this.
    const rows = [
      traveller({ userId: 'a', displayName: 'Ana', greenVerified: 400 }),
      traveller({ userId: 'z', displayName: 'Zoe', greenVerified: 0 }),
    ];
    assert.equal(positionOf(rows, 'z'), null);
    assert.equal(positionOf(rows, 'nobody'), null);
    assert.equal(positionOf([], 'a'), null);
  });

  test('one participant is first of one; whether to say so is isRankable’s call', () => {
    assert.equal(positionOf([traveller({ userId: 'a', greenVerified: 10 })], 'a'), 1);
    assert.equal(isRankable(1), false);
  });
});
