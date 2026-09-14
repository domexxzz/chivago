import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  INVITE_DOES_NOT, INVITE_MAX_HOURS, INVITE_MAX_SPACES, INVITE_MIN_MINUTES,
  INVITE_STATE_LABEL, POST_REFUSAL, REQUEST_OUTCOME_LABEL, REQUEST_REFUSAL,
  inviteIsOpen, inviteState, minutesLeft, pinLine, requestRefusal,
  spacesLeft, spacesRefusal, windowRefusal,
  type InviteListing, type PartyInvite,
} from './party-invites.ts';
import { MAX_PARTY_SIZE } from './party.ts';

const NOW = new Date('2026-09-14T10:00:00.000Z');
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

const invite = (over: Partial<PartyInvite> = {}): PartyInvite => ({
  id: 'i1',
  partyId: 'p1',
  placeId: 'place-mangrove',
  from: at(30),
  until: at(180),
  spacesOffered: 2,
  accepted: 0,
  note: null,
  closedAt: null,
  ...over,
});

describe('an invitation is posted at a place, never at a person', () => {
  test('the invitation has nowhere to put a position', () => {
    // Structural, like PartyMember refusing a balance. A lat/lng here is how
    // a pin stops being a place and becomes a person, and it would be added
    // by whoever thought the map looked empty.
    const i = invite();
    for (const forbidden of [
      'lat', 'lng', 'latitude', 'longitude', 'coords', 'position',
      'userId', 'memberId', 'lastSeen', 'lastSeenAt', 'accuracyM',
    ]) {
      assert.ok(!(forbidden in i), `PartyInvite grew a ${forbidden} field`);
    }
  });

  test('the stranger-facing listing refuses more than the party-facing one', () => {
    // A party member chose their party. A stranger scrolling a map chose
    // nothing, so the audience is wider and the refusal has to be stricter.
    const listing: InviteListing = {
      id: 'i1',
      placeId: 'place-mangrove',
      from: at(30),
      until: at(180),
      spacesLeft: 2,
      note: null,
      state: 'open',
      partyName: 'Two slow walkers',
      missionsVerified: 4,
      yours: false,
    };
    for (const forbidden of [
      'lat', 'lng', 'position', 'coords', 'lastSeen',
      'balance', 'balances', 'green', 'greenEarned', 'trip', 'wallet', 'spent',
      'members', 'memberNames', 'userId', 'realName', 'email', 'phone',
      'provinces', 'route', 'history',
    ]) {
      assert.ok(!(forbidden in listing), `InviteListing grew a ${forbidden} field`);
    }
  });

  test('the listing identifies a party, not a member', () => {
    // partyName is the group's chosen name. The moment this becomes a member
    // name, one person is findable by strangers and the design is gone.
    const listing = { partyName: 'Two slow walkers' };
    assert.ok('partyName' in listing);
    assert.ok(!('displayName' in listing));
  });

  test('what it does not do travels with it, in both languages', () => {
    // On the screen rather than in a help page: "can people see where I am"
    // is the first question anybody asks about a feature like this.
    assert.ok(INVITE_DOES_NOT.length >= 3);
    for (const line of INVITE_DOES_NOT) {
      assert.ok(line.en.length > 0 && line.th.length > 0);
    }
    assert.ok(
      INVITE_DOES_NOT.some((l) => /where you are/i.test(l.en)),
      'the first refusal should be about location',
    );
  });
});

describe('state is derived from the clock, never stored', () => {
  test('open while there is time and a space', () => {
    assert.equal(inviteState(invite(), NOW), 'open');
    assert.ok(inviteIsOpen(invite(), NOW));
  });

  test('full when the spaces are taken', () => {
    assert.equal(inviteState(invite({ spacesOffered: 2, accepted: 2 }), NOW), 'full');
    assert.equal(spacesLeft(invite({ spacesOffered: 2, accepted: 2 })), 0);
  });

  test('spaces left never goes negative', () => {
    // Over-acceptance is a bug somewhere else; it must not surface as "−1 left".
    assert.equal(spacesLeft(invite({ spacesOffered: 1, accepted: 3 })), 0);
  });

  test('expired once the window has passed, whoever is left', () => {
    const past = invite({ from: at(-300), until: at(-60) });
    assert.equal(inviteState(past, NOW), 'expired');
  });

  test('closed beats expired, and expired beats full', () => {
    // A party that shut its invitation should read that it is shut, not that
    // it ran out of time; and a window that has passed is over whether or not
    // somebody took the last space.
    const closedAndExpired = invite({ until: at(-60), closedAt: at(-90) });
    assert.equal(inviteState(closedAndExpired, NOW), 'closed');

    const expiredAndFull = invite({ until: at(-60), spacesOffered: 1, accepted: 1 });
    assert.equal(inviteState(expiredAndFull, NOW), 'expired');
  });

  test('every state has a sentence in both languages', () => {
    for (const [key, label] of Object.entries(INVITE_STATE_LABEL)) {
      assert.ok(label.en.length > 0, `${key} has no English`);
      assert.ok(label.th.length > 0, `${key} has no Thai`);
    }
  });
});

describe('an invitation cannot outlive its own sentence', () => {
  test('a window longer than the ceiling is refused', () => {
    assert.equal(windowRefusal(at(0), at(INVITE_MAX_HOURS * 60 + 1), NOW), 'window-too-long');
  });

  test('a window at the ceiling is allowed', () => {
    assert.equal(windowRefusal(at(0), at(INVITE_MAX_HOURS * 60), NOW), null);
  });

  test('a window shorter than the floor is refused', () => {
    assert.equal(windowRefusal(at(0), at(INVITE_MIN_MINUTES - 1), NOW), 'window-too-short');
  });

  test('a window already past is refused before anything else', () => {
    assert.equal(windowRefusal(at(-600), at(-60), NOW), 'window-past');
  });

  test('unparseable dates are refused rather than thrown on', () => {
    assert.equal(windowRefusal('not a date', at(180), NOW), 'window-past');
    assert.equal(windowRefusal(at(0), 'not a date', NOW), 'window-past');
  });

  test('expiry needs no cleanup job to be true', () => {
    // The point of deriving it: a row nobody swept is still expired on read.
    const stale = invite({ from: at(-2000), until: at(-1000) });
    assert.equal(inviteState(stale, NOW), 'expired');
    assert.equal(minutesLeft(stale, NOW), null);
  });

  test('minutes left is null rather than negative', () => {
    assert.equal(minutesLeft(invite({ until: at(-1) }), NOW), null);
    assert.equal(minutesLeft(invite({ until: at(90) }), NOW), 90);
  });
});

describe('spaces are bounded by the party, not only by the form', () => {
  test('a full party has nothing to offer', () => {
    assert.equal(spacesRefusal(1, MAX_PARTY_SIZE), 'party-full');
  });

  test('a party cannot offer more spaces than it has room for', () => {
    // Six already travelling means two places, not the form's maximum.
    assert.equal(spacesRefusal(3, 6), 'spaces');
    assert.equal(spacesRefusal(2, 6), null);
  });

  test('zero, fractions and negatives are refused', () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      assert.equal(spacesRefusal(bad, 1), 'spaces', `${bad} was allowed`);
    }
  });

  test('the ceiling leaves room for the party itself', () => {
    assert.equal(INVITE_MAX_SPACES, MAX_PARTY_SIZE - 1);
    assert.equal(spacesRefusal(INVITE_MAX_SPACES + 1, 1), 'spaces');
  });
});

describe('asking to join', () => {
  const asker = { partyId: null, alreadyAsked: false };

  test('an invitation that is gone reads as gone', () => {
    assert.equal(requestRefusal(null, NOW, asker), 'unknown');
  });

  test('your own party is named before anything else about the invitation', () => {
    // "You are already in this" answers the question; "somebody took the last
    // space" would send the reader looking for another one.
    const full = invite({ spacesOffered: 1, accepted: 1 });
    assert.equal(
      requestRefusal(full, NOW, { partyId: 'p1', alreadyAsked: false }),
      'own-party',
    );
  });

  test('being in another party is refused with its own sentence', () => {
    assert.equal(
      requestRefusal(invite(), NOW, { partyId: 'p9', alreadyAsked: false }),
      'in-a-party',
    );
  });

  test('asking twice says so instead of queueing', () => {
    assert.equal(
      requestRefusal(invite(), NOW, { partyId: null, alreadyAsked: true }),
      'already-asked',
    );
  });

  test('closed, expired and full each get their own reason', () => {
    assert.equal(requestRefusal(invite({ closedAt: at(-5) }), NOW, asker), 'closed');
    assert.equal(requestRefusal(invite({ until: at(-5) }), NOW, asker), 'expired');
    assert.equal(
      requestRefusal(invite({ spacesOffered: 2, accepted: 2 }), NOW, asker),
      'full',
    );
  });

  test('an open invitation from a stranger is allowed', () => {
    assert.equal(requestRefusal(invite(), NOW, asker), null);
  });

  test('every refusal and outcome has both languages', () => {
    for (const [key, line] of Object.entries(REQUEST_REFUSAL)) {
      assert.ok(line.en.length > 0 && line.th.length > 0, `${key} is half-translated`);
    }
    for (const [key, line] of Object.entries(POST_REFUSAL)) {
      assert.ok(line.en.length > 0 && line.th.length > 0, `${key} is half-translated`);
    }
    for (const [key, line] of Object.entries(REQUEST_OUTCOME_LABEL)) {
      assert.ok(line.en.length > 0 && line.th.length > 0, `${key} is half-translated`);
    }
  });

  test('withdrawn and declined are not the same sentence', () => {
    // One is the asker changing their mind, the other is being turned down.
    assert.notEqual(REQUEST_OUTCOME_LABEL.withdrawn.th, REQUEST_OUTCOME_LABEL.declined.th);
  });
});

describe('a pin says two kinds of fact and never adds them', () => {
  test('a counted crowd and a typed plan are said separately', () => {
    const line = pinLine(2, 3);
    assert.match(line.en, /3 checked in/);
    assert.match(line.en, /2 parties are looking/);
    assert.ok(!/5/.test(line.en), 'the two counts were summed');
  });

  test('zero crowd says zero rather than becoming quiet', () => {
    // crowd.ts already refuses this: an unvisited beach is not a quiet one,
    // it is one nobody counted at.
    const line = pinLine(0, 0);
    assert.match(line.en, /Nobody has checked in/);
    assert.match(line.th, /ยังไม่มีใครเช็กอิน/);
  });

  test('a place with invitations but no crowd does not invent a crowd', () => {
    const line = pinLine(1, 0);
    assert.ok(!/checked in/.test(line.en));
    assert.match(line.en, /1 party is looking/);
  });

  test('one party reads as singular', () => {
    assert.match(pinLine(1, 0).en, /1 party is/);
    assert.match(pinLine(2, 0).en, /2 parties are/);
  });
});
