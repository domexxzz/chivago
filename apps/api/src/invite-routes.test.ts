import { strict as assert } from 'node:assert';
import { test, describe, before } from 'node:test';

/**
 * Invitations, over HTTP.
 *
 * `party-invite-service.test.ts` proves the rules. This proves the wiring, and
 * one thing that only exists at this level: that no route here accepts a
 * position, returns one, or can be persuaded to leak one. A rule enforced in a
 * pure function is a rule a route can still walk around.
 */

delete process.env.CHIVAGO_OPEN_IDENTITY;
process.env.CHIVAGO_DB = ':memory:';

const { app, db } = await import('./server.ts');

type Body = { ok: boolean; data?: any; code?: string; error?: string };
const json = async (res: Response) => (await res.json()) as Body;

const post = (path: string, body: unknown, key?: string) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { 'x-chivago-device-key': key } : {}) },
    body: JSON.stringify(body ?? {}),
  });

const get = (path: string, key: string) =>
  app.request(path, { headers: { 'x-chivago-device-key': key } });

const register = async (label: string) =>
  (await json(await post('/devices', { displayName: label, label }))).data.deviceKey as string;

const inMinutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString();

let ana: string;
let bo: string;
let cara: string;
const placeId = 'p-invite';

before(async () => {
  ana = await register('Ana');
  bo = await register('Bo');
  cara = await register('Cara');
  // One real place on the island, so an invitation has somewhere to be posted at.
  db.prepare(
    `INSERT OR IGNORE INTO places (id, name_en, name_th, short, layer, lat, lng, meta,
       blurb_en, blurb_th, tags, safety_label_en, safety_label_th,
       crowd_density, aqi, safety_index, walkability, province)
     VALUES ('p-invite','Mangrove Walk','x','Mangrove','Green',9.5357,100.0617,'Forest','x','x','[]',
             'Patrolled','x',2,40,7,8,'TH-84')`,
  ).run();
});

/** Ana starts a party and posts an invitation at the seeded place. */
const postInvitation = async (over: Record<string, unknown> = {}) => {
  await post('/party', { name: 'Two slow walkers' }, ana);
  return json(await post('/invites', {
    placeId, from: inMinutes(30), until: inMinutes(180), spaces: 2, ...over,
  }, ana));
};

describe('no route accepts or returns a position', () => {
  test('an invitation posted with coordinates keeps none of them', async () => {
    // The route must not become a place to smuggle a fix in. Extra keys are
    // ignored rather than rejected, and nothing they carried comes back.
    const res = await postInvitation({ lat: 9.51, lng: 100.06, accuracyM: 5 });
    assert.equal(res.ok, true);
    const body = JSON.stringify(res.data.invitation);
    for (const leak of ['9.51', '100.06', 'lat', 'lng', 'accuracy']) {
      assert.ok(!body.includes(leak), `the invitation came back carrying ${leak}`);
    }
    await post(`/invites/${res.data.invitation.id}/close`, {}, ana);
  });

  test('what a stranger reads at a place carries no position and no wallet', async () => {
    const posted = await postInvitation();
    const res = await json(await get(`/invites?place=${placeId}`, bo));
    assert.equal(res.ok, true);
    const listing = res.data.invitations[0];
    assert.ok(listing);
    for (const forbidden of [
      'lat', 'lng', 'position', 'lastSeen', 'balance', 'green', 'greenEarned',
      'trip', 'wallet', 'members', 'userId', 'displayName', 'provinces',
    ]) {
      assert.ok(!(forbidden in listing), `the listing grew a ${forbidden} field`);
    }
    await post(`/invites/${posted.data.invitation.id}/close`, {}, ana);
  });

  test('there is no nearby route to ask with a location', async () => {
    // A client that wants what is near it already knows where it is. It asks
    // /places with a bbox, as it always has, and asks here about what came
    // back — so the server never learns where anybody is standing.
    const res = await app.request('/invites/nearby?lat=9.5&lng=100.0', {
      headers: { 'x-chivago-device-key': bo },
    });
    assert.notEqual(res.status, 200);
  });

  test('what a party is told about an asker is a name and a verified count', async () => {
    const posted = await postInvitation();
    await post(`/invites/${posted.data.invitation.id}/request`, {}, bo);

    const res = await json(await get('/invites/requests', ana));
    const waiting = res.data.waiting[0];
    assert.equal(waiting.displayName, 'Bo');
    assert.equal(typeof waiting.missionsVerified, 'number');
    for (const forbidden of ['lat', 'lng', 'balance', 'green', 'trip', 'email', 'provinces']) {
      assert.ok(!(forbidden in waiting), `the pending request grew a ${forbidden} field`);
    }
    await post(`/invites/${posted.data.invitation.id}/close`, {}, ana);
  });
});

describe('the pin route counts, and never names', () => {
  test('a pin carries two separate facts and no identity', async () => {
    const posted = await postInvitation();
    const res = await json(await get(`/invites/pins?places=${placeId}`, bo));
    const pin = res.data.pins[0];

    assert.equal(pin.placeId, placeId);
    assert.equal(pin.invitesOpen, 1);
    assert.equal(typeof pin.checkinsLastHour, 'number');
    // Two kinds of fact, said separately and never summed.
    assert.ok(pin.line.en.length > 0 && pin.line.th.length > 0);
    for (const forbidden of ['users', 'members', 'names', 'userId', 'lat', 'lng']) {
      assert.ok(!(forbidden in pin), `the pin grew a ${forbidden} field`);
    }
    await post(`/invites/${posted.data.invitation.id}/close`, {}, ana);
  });

  test('a place nobody is asking at reports zero rather than being absent', async () => {
    const res = await json(await get('/invites/pins?places=not-a-place', bo));
    assert.equal(res.data.pins[0].invitesOpen, 0);
  });
});

describe('refusals arrive as their own sentences', () => {
  test('posting without a party says to start one', async () => {
    const res = await json(await post('/invites', {
      placeId, from: inMinutes(30), until: inMinutes(180), spaces: 1,
    }, cara));
    assert.equal(res.ok, false);
    assert.equal(res.code, 'INVITE_NO_PARTY');
    assert.match(res.error!, /party/i);
  });

  test('a window past the ceiling is named as the window', async () => {
    const res = await postInvitation({ until: inMinutes(60 * 30) });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'INVITE_WINDOW_TOO_LONG');
  });

  test('an incomplete post is refused before any rule is consulted', async () => {
    await post('/party', { name: 'Trip' }, ana);
    const res = await json(await post('/invites', { placeId }, ana));
    assert.equal(res.code, 'INVITE_INCOMPLETE');
  });

  test('asking for your own party is told so, not told it is full', async () => {
    const posted = await postInvitation();
    const res = await json(await post(`/invites/${posted.data.invitation.id}/request`, {}, ana));
    assert.equal(res.code, 'REQUEST_OWN_PARTY');
    await post(`/invites/${posted.data.invitation.id}/close`, {}, ana);
  });

  test('a decision without a name is refused', async () => {
    const posted = await postInvitation();
    const res = await json(await post(`/invites/${posted.data.invitation.id}/decide`, { accept: true }, ana));
    assert.equal(res.code, 'DECISION_INCOMPLETE');
    await post(`/invites/${posted.data.invitation.id}/close`, {}, ana);
  });
});

describe('the round trip', () => {
  test('ask, accept, and the party has two people in it', async () => {
    const posted = await postInvitation();
    const id = posted.data.invitation.id as string;

    assert.equal((await json(await post(`/invites/${id}/request`, {}, bo))).data.asked, true);

    const decided = await json(await post(`/invites/${id}/decide`, { userId: undefined, accept: true }, ana));
    assert.equal(decided.code, 'DECISION_INCOMPLETE');

    const waiting = (await json(await get('/invites/requests', ana))).data.waiting[0];
    const yes = await json(await post(`/invites/${id}/decide`, { userId: waiting.userId, accept: true }, ana));
    assert.equal(yes.data.outcome, 'accepted');

    const party = await json(await get('/party', ana));
    assert.equal(party.data.summary.size, 2);
    assert.equal(party.data.summary.kind, 'duo');

    // And the thing that has never changed: nobody's points moved.
    for (const line of party.data.doesNot as { en: string }[]) {
      assert.ok(line.en.length > 0);
    }
  });

  test('what it does not do travels with every read', async () => {
    const res = await json(await get('/invites/mine', ana));
    assert.ok(Array.isArray(res.data.doesNot));
    assert.ok(res.data.doesNot.some((l: { en: string }) => /where you are/i.test(l.en)));
  });
});
