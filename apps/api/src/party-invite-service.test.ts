import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { MAX_PARTY_SIZE } from '@chivago/core';
import { openTestDb, type DB } from './db.ts';
import { ensureWallet, applyMovement } from './wallet-service.ts';
import { createParty, joinParty, membersOf } from './party-service.ts';
import {
  InviteRefused, closeInvite, decideRequest, inviteById, listingsAt,
  openInviteCounts, openInviteFor, pendingFor, postInvite, requestJoin,
  requestsBy, withdrawRequest,
} from './party-invite-service.ts';

let db: DB;
const NOW = new Date('2026-09-14T10:00:00.000Z');
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
const iso = (minutes: number) => at(minutes).toISOString();

const addUser = (id: string, name: string) => {
  db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)')
    .run(id, name, NOW.toISOString());
  ensureWallet(db, id);
};

const addPlace = (id: string) => {
  db.prepare(
    `INSERT INTO places (id, name_en, name_th, short, layer, lat, lng, meta,
       blurb_en, blurb_th, safety_label_en, safety_label_th,
       crowd_density, aqi, safety_index, walkability)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(id, id, id, id, 'green', 9.5, 100.0, '{}', '', '', 'ok', 'ok', 0, 0, 0, 0);
};

const verifiedQuest = (userId: string, questId: string) =>
  applyMovement(db, {
    userId, label: questId, host: 'Samui Municipality', amount: 120, currency: 'green',
    kind: 'quest_reward', sourceRef: `quest:${questId}:user:${userId}`,
  });

const goodInvite = { placeId: 'mangrove', from: iso(30), until: iso(180), spaces: 2 };

beforeEach(() => {
  db = openTestDb();
  for (const [id, name] of [['ana', 'Ana'], ['bo', 'Bo'], ['cara', 'Cara'], ['dee', 'Dee']]) {
    addUser(id!, name!);
  }
  addPlace('mangrove');
  addPlace('waterfall');
});

describe('an invitation is posted at a place, never at a person', () => {
  test('no column anywhere holds a position', () => {
    // The structural guard. A lat/lng on either table is how a pin stops
    // being a place and starts being a person.
    for (const table of ['party_invites', 'invite_requests']) {
      const cols = db.prepare(`SELECT name FROM pragma_table_info('${table}')`)
        .all() as { name: string }[];
      for (const forbidden of ['lat', 'lng', 'latitude', 'longitude', 'accuracy_m', 'last_seen']) {
        assert.ok(
          !cols.some((c) => c.name === forbidden),
          `${table} grew a ${forbidden} column`,
        );
      }
    }
  });

  test('what a stranger gets back carries no position and no balance', () => {
    createParty(db, 'ana', 'Two slow walkers', NOW);
    postInvite(db, 'ana', goodInvite, NOW);

    const [listing] = listingsAt(db, 'mangrove', 'bo', NOW);
    assert.ok(listing);
    for (const forbidden of [
      'lat', 'lng', 'position', 'lastSeen',
      'balance', 'green', 'greenEarned', 'trip', 'wallet',
      'members', 'userId', 'displayName', 'provinces',
    ]) {
      assert.ok(!(forbidden in listing), `the listing grew a ${forbidden} field`);
    }
  });

  test('a pin count says how many, never who', () => {
    createParty(db, 'ana', 'Two slow walkers', NOW);
    postInvite(db, 'ana', goodInvite, NOW);

    const counts = openInviteCounts(db, ['mangrove', 'waterfall'], NOW);
    assert.equal(counts.get('mangrove'), 1);
    assert.equal(counts.get('waterfall'), 0);
    assert.equal(typeof counts.get('mangrove'), 'number');
  });
});

describe('posting', () => {
  test('needs a party, even a party of one', () => {
    assert.throws(
      () => postInvite(db, 'ana', goodInvite, NOW),
      (e: InviteRefused) => e.reason === 'no-party',
    );
  });

  test('one invitation at a time', () => {
    createParty(db, 'ana', 'Trip', NOW);
    postInvite(db, 'ana', goodInvite, NOW);
    assert.throws(
      () => postInvite(db, 'ana', goodInvite, NOW),
      (e: InviteRefused) => e.reason === 'already-posted',
    );
  });

  test('closing frees the party to post again', () => {
    createParty(db, 'ana', 'Trip', NOW);
    const first = postInvite(db, 'ana', goodInvite, NOW);
    assert.ok(closeInvite(db, 'ana', first.id, NOW));
    assert.doesNotThrow(() => postInvite(db, 'ana', goodInvite, NOW));
  });

  test('a party cannot offer more spaces than it has room for', () => {
    const { party, code } = createParty(db, 'ana', 'Trip', NOW);
    joinParty(db, 'bo', code, NOW);
    joinParty(db, 'cara', code, NOW);
    assert.equal(membersOf(db, party.id, 'ana').length, 3);
    assert.throws(
      () => postInvite(db, 'ana', { ...goodInvite, spaces: MAX_PARTY_SIZE }, NOW),
      (e: InviteRefused) => e.reason === 'spaces',
    );
    assert.doesNotThrow(() => postInvite(db, 'ana', { ...goodInvite, spaces: 5 }, NOW));
  });

  test('a window past the ceiling is refused with its own reason', () => {
    createParty(db, 'ana', 'Trip', NOW);
    assert.throws(
      () => postInvite(db, 'ana', { ...goodInvite, until: iso(60 * 25) }, NOW),
      (e: InviteRefused) => e.reason === 'window-too-long',
    );
  });

  test('a place that is not on the island cannot be met at', () => {
    createParty(db, 'ana', 'Trip', NOW);
    assert.throws(() => postInvite(db, 'ana', { ...goodInvite, placeId: 'nowhere' }, NOW));
  });

  test('a long note is kept and trimmed, not thrown away', () => {
    createParty(db, 'ana', 'Trip', NOW);
    const invite = postInvite(db, 'ana', { ...goodInvite, note: ' '.repeat(3) + 'x'.repeat(300) }, NOW);
    assert.equal(invite.note?.length, 140);
  });

  test('an empty note is null rather than an empty string', () => {
    createParty(db, 'ana', 'Trip', NOW);
    assert.equal(postInvite(db, 'ana', { ...goodInvite, note: '   ' }, NOW).note, null);
  });
});

describe('expiry needs no cleanup job', () => {
  test('an invitation nobody swept is gone from the map on read', () => {
    createParty(db, 'ana', 'Trip', NOW);
    postInvite(db, 'ana', goodInvite, NOW);

    assert.equal(listingsAt(db, 'mangrove', 'bo', NOW).length, 1);
    // Same rows, later clock.
    assert.equal(listingsAt(db, 'mangrove', 'bo', at(300)).length, 0);
    assert.equal(openInviteCounts(db, ['mangrove'], at(300)).get('mangrove'), 0);
  });

  test('an expired invitation stops blocking a new one', () => {
    createParty(db, 'ana', 'Trip', NOW);
    postInvite(db, 'ana', goodInvite, NOW);
    assert.equal(openInviteFor(db, 'party-does-not-matter', at(300)), null);
    assert.doesNotThrow(
      () => postInvite(db, 'ana', { ...goodInvite, from: iso(330), until: iso(400) }, at(300)),
    );
  });
});

describe('asking, and being answered', () => {
  const post = () => {
    createParty(db, 'ana', 'Two slow walkers', NOW);
    return postInvite(db, 'ana', goodInvite, NOW);
  };

  test('a stranger may ask, and the party sees it', () => {
    const invite = post();
    requestJoin(db, 'bo', invite.id, NOW);

    const waiting = pendingFor(db, 'ana', NOW);
    assert.equal(waiting.length, 1);
    assert.equal(waiting[0]?.userId, 'bo');
    assert.equal(waiting[0]?.displayName, 'Bo');
  });

  test('the party is told what a host verified, and nothing else', () => {
    const invite = post();
    verifiedQuest('bo', 'mangrove-planting');
    verifiedQuest('bo', 'beach-clean');
    requestJoin(db, 'bo', invite.id, NOW);

    const [asker] = pendingFor(db, 'ana', NOW);
    assert.equal(asker?.missionsVerified, 2);
    for (const forbidden of ['balance', 'green', 'trip', 'lat', 'lng', 'provinces', 'email']) {
      assert.ok(!(forbidden in asker!), `the pending request grew a ${forbidden} field`);
    }
  });

  test('you cannot ask to join your own party', () => {
    const invite = post();
    assert.throws(
      () => requestJoin(db, 'ana', invite.id, NOW),
      (e: InviteRefused) => e.reason === 'own-party',
    );
  });

  test('asking twice says so rather than queueing', () => {
    const invite = post();
    requestJoin(db, 'bo', invite.id, NOW);
    assert.throws(
      () => requestJoin(db, 'bo', invite.id, NOW),
      (e: InviteRefused) => e.reason === 'already-asked',
    );
    assert.equal(pendingFor(db, 'ana', NOW).length, 1);
  });

  test('a declined asker may ask again', () => {
    // People change their minds, and the party has the same no available.
    const invite = post();
    requestJoin(db, 'bo', invite.id, NOW);
    decideRequest(db, 'ana', invite.id, 'bo', false, NOW);
    assert.doesNotThrow(() => requestJoin(db, 'bo', invite.id, at(5)));
  });

  test('withdrawing only ever touches your own row', () => {
    const invite = post();
    requestJoin(db, 'bo', invite.id, NOW);
    requestJoin(db, 'cara', invite.id, NOW);
    assert.ok(withdrawRequest(db, 'bo', invite.id, NOW));
    const waiting = pendingFor(db, 'ana', NOW);
    assert.deepEqual(waiting.map((r) => r.userId), ['cara']);
  });

  test('accepting joins them, and the decision is recorded', () => {
    const invite = post();
    requestJoin(db, 'bo', invite.id, NOW);
    assert.equal(decideRequest(db, 'ana', invite.id, 'bo', true, NOW), 'accepted');

    const members = membersOf(db, invite.partyId, 'ana').map((m) => m.userId);
    assert.deepEqual(members.sort(), ['ana', 'bo']);
    assert.equal(requestsBy(db, 'bo')[0]?.outcome, 'accepted');
  });

  test('declining does not join them', () => {
    const invite = post();
    requestJoin(db, 'bo', invite.id, NOW);
    assert.equal(decideRequest(db, 'ana', invite.id, 'bo', false, NOW), 'declined');
    assert.deepEqual(membersOf(db, invite.partyId, 'ana').map((m) => m.userId), ['ana']);
  });

  test('spaces run out, and the next asker is told why', () => {
    const invite = post();
    requestJoin(db, 'bo', invite.id, NOW);
    requestJoin(db, 'cara', invite.id, NOW);
    requestJoin(db, 'dee', invite.id, NOW);
    decideRequest(db, 'ana', invite.id, 'bo', true, NOW);
    decideRequest(db, 'ana', invite.id, 'cara', true, NOW);

    assert.equal(inviteById(db, invite.id)?.accepted, 2);
    assert.throws(
      () => decideRequest(db, 'ana', invite.id, 'dee', true, NOW),
      (e: InviteRefused) => e.reason === 'full',
    );
    assert.equal(listingsAt(db, 'mangrove', 'dee', NOW).length, 0);
  });

  test('somebody already in a party is told to leave it first', () => {
    const invite = post();
    createParty(db, 'bo', 'Bo trip', NOW);
    assert.throws(
      () => requestJoin(db, 'bo', invite.id, NOW),
      (e: InviteRefused) => e.reason === 'in-a-party',
    );
  });

  test('a closed invitation refuses with its own reason', () => {
    const invite = post();
    closeInvite(db, 'ana', invite.id, NOW);
    assert.throws(
      () => requestJoin(db, 'bo', invite.id, NOW),
      (e: InviteRefused) => e.reason === 'closed',
    );
  });

  test('only the party that posted it may answer', () => {
    const invite = post();
    requestJoin(db, 'bo', invite.id, NOW);
    createParty(db, 'cara', 'Somebody else', NOW);
    assert.throws(
      () => decideRequest(db, 'cara', invite.id, 'bo', true, NOW),
      (e: InviteRefused) => e.reason === 'unknown',
    );
  });

  test('anybody in the party may close the invitation, not only its author', () => {
    // Waiting for one person to come back online to stop strangers arriving
    // is the wrong failure mode.
    const { code } = createParty(db, 'ana', 'Trip', NOW);
    joinParty(db, 'bo', code, NOW);
    const invite = postInvite(db, 'ana', goodInvite, NOW);
    assert.ok(closeInvite(db, 'bo', invite.id, NOW));
  });

  test('a stranger cannot close somebody else’s invitation', () => {
    const invite = post();
    createParty(db, 'cara', 'Somebody else', NOW);
    assert.equal(closeInvite(db, 'cara', invite.id, NOW), false);
  });
});

describe('the party figure on a listing is the one the standing uses', () => {
  test('it counts verified missions, not the opening balance', () => {
    const { party, code } = createParty(db, 'ana', 'Two slow walkers', NOW);
    joinParty(db, 'bo', code, NOW);
    applyMovement(db, {
      userId: 'ana', label: 'Pilot opening balance', host: 'ChivaGo', amount: 1240,
      currency: 'green', kind: 'adjustment', sourceRef: `opening:green:ana`,
    });
    verifiedQuest('ana', 'mangrove-planting');
    verifiedQuest('bo', 'beach-clean');
    const invite = postInvite(db, 'ana', goodInvite, NOW);
    assert.equal(invite.partyId, party.id);

    const [listing] = listingsAt(db, 'mangrove', 'cara', NOW);
    assert.equal(listing?.missionsVerified, 2);
  });

  test('your own party’s invitation is marked as yours', () => {
    createParty(db, 'ana', 'Trip', NOW);
    postInvite(db, 'ana', goodInvite, NOW);
    assert.equal(listingsAt(db, 'mangrove', 'ana', NOW)[0]?.yours, true);
    assert.equal(listingsAt(db, 'mangrove', 'bo', NOW)[0]?.yours, false);
    assert.equal(listingsAt(db, 'mangrove', null, NOW)[0]?.yours, false);
  });
});
