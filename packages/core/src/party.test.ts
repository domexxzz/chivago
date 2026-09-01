import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  JOIN_REFUSAL, MAX_PARTY_SIZE, PARTY_DOES_NOT, PARTY_KIND_LABEL,
  nextTogether, partyKind, summarise, type PartyMember,
} from './party.ts';

const member = (over: Partial<PartyMember> = {}): PartyMember => ({
  userId: 'u1', displayName: 'Ana', missionsVerified: 0, greenEarned: 0,
  provinces: [], you: false, ...over,
});

describe('a party never shares points', () => {
  test('the member shape has nowhere to put a balance', () => {
    // Structural, like SponsorOutcome refusing `reach`. A `balance` field
    // would be filled in by whoever thought the group screen looked empty,
    // and joining a travel group is not consent to show friends your wallet.
    const m = member({ greenEarned: 400 });
    for (const forbidden of ['balance', 'balances', 'green', 'trip', 'wallet', 'spent']) {
      assert.ok(!(forbidden in m), `PartyMember grew a ${forbidden} field`);
    }
  });

  test('the total is the sum of what people separately earned', () => {
    // Aggregation, not redistribution. Nobody's own figure moves.
    const members = [
      member({ userId: 'a', missionsVerified: 3, greenEarned: 610 }),
      member({ userId: 'b', missionsVerified: 1, greenEarned: 150 }),
    ];
    const s = summarise(members);
    assert.equal(s.missionsVerified, 4);
    assert.equal(s.greenEarned, 760);
    assert.equal(s.members.find((m) => m.userId === 'a')!.greenEarned, 610, 'a member’s own total moved');
    assert.equal(s.members.find((m) => m.userId === 'b')!.greenEarned, 150);
  });

  test('a member who has verified nothing contributes nothing', () => {
    // The failure this prevents: joining a party as a way of collecting.
    const s = summarise([
      member({ userId: 'worker', missionsVerified: 4, greenEarned: 800 }),
      member({ userId: 'passenger' }),
    ]);
    assert.equal(s.missionsVerified, 4);
    assert.equal(s.greenEarned, 800);
    assert.equal(s.members.find((m) => m.userId === 'passenger')!.greenEarned, 0);
  });

  test('every summary says what a party does not do', () => {
    assert.ok(PARTY_DOES_NOT.length >= 3);
    const said = PARTY_DOES_NOT.map((d) => d.en).join(' ');
    assert.match(said, /Share points/i);
    assert.match(said, /balance/i);
    for (const d of PARTY_DOES_NOT) {
      assert.match(d.th, /[฀-๿]/, 'a disclosure the Thai reader cannot read is not one');
    }
  });
});

describe('provinces together are counted once each', () => {
  test('two people in different provinces have covered two', () => {
    const s = summarise([
      member({ userId: 'a', provinces: ['TH-84'] }),
      member({ userId: 'b', provinces: ['TH-20'] }),
    ]);
    assert.equal(s.provincesTogether, 2);
  });

  test('two people in the SAME province have covered one, not two', () => {
    // A plain sum would double-count the shared trip, which quietly rewards
    // staying together over splitting up — the opposite of the point.
    const s = summarise([
      member({ userId: 'a', provinces: ['TH-84'] }),
      member({ userId: 'b', provinces: ['TH-84'] }),
    ]);
    assert.equal(s.provincesTogether, 1);
  });

  test('overlapping trips are merged, not added', () => {
    const s = summarise([
      member({ userId: 'a', provinces: ['TH-84', 'TH-20'] }),
      member({ userId: 'b', provinces: ['TH-20'] }),
    ]);
    assert.equal(s.provincesTogether, 2);
  });

  test('an empty party covers nothing and does not throw', () => {
    const s = summarise([]);
    assert.equal(s.provincesTogether, 0);
    assert.equal(s.size, 0);
    assert.equal(s.greenEarned, 0);
  });
});

describe('solo, duo and party are one thing counted', () => {
  test('the kind follows the size', () => {
    assert.equal(partyKind(0), 'solo');
    assert.equal(partyKind(1), 'solo');
    assert.equal(partyKind(2), 'duo');
    assert.equal(partyKind(3), 'party');
    assert.equal(partyKind(MAX_PARTY_SIZE), 'party');
  });

  test('every kind has a label in both languages', () => {
    for (const kind of ['solo', 'duo', 'party'] as const) {
      assert.ok(PARTY_KIND_LABEL[kind].en.length > 0);
      assert.match(PARTY_KIND_LABEL[kind].th, /[฀-๿]/);
    }
  });

  test('a summary of one person is solo, not an error', () => {
    // Everybody starts here, so it is a first-class state rather than an
    // empty version of a real one.
    assert.equal(summarise([member({ you: true })]).kind, 'solo');
  });
});

describe('what the group could still do', () => {
  test('it names how many open provinces nobody has reached', () => {
    const s = summarise([member({ provinces: ['TH-84'] })]);
    assert.match(nextTogether(s, 2)!.en, /^1 open province nobody/);
  });

  test('it pluralises', () => {
    assert.match(nextTogether(summarise([]), 2)!.en, /^2 open provinces/);
  });

  test('a group that has been everywhere open is not nagged', () => {
    // No perpetual "you have not finished" state: a party that has done
    // everything available has not failed at anything.
    const s = summarise([member({ provinces: ['TH-84', 'TH-20'] })]);
    assert.equal(nextTogether(s, 2), null);
    assert.equal(nextTogether(s, 1), null, 'a negative remainder became an invitation');
  });
});

describe('a refused join says which refusal it was', () => {
  test('all four reasons have their own sentence, in both languages', () => {
    // "Could not join" sends somebody to try the same code again. "That party
    // is full" tells them to ask somebody to leave.
    const seen = new Set<string>();
    for (const reason of ['unknown', 'full', 'already-in', 'disbanded'] as const) {
      const said = JOIN_REFUSAL[reason];
      assert.ok(said.en.length > 0);
      assert.match(said.th, /[฀-๿]/);
      seen.add(said.en);
    }
    assert.equal(seen.size, 4, 'two refusals share a sentence');
  });

  test('the full message names the actual limit', () => {
    assert.match(JOIN_REFUSAL.full.en, new RegExp(String(MAX_PARTY_SIZE)));
  });
});
