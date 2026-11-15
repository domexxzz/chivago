/**
 * `POST /internal/open-area`, over HTTP.
 *
 * `area-opening.test.ts` proves what the function does to a database. This
 * proves the part that is only true through the middleware: that an operator
 * secret is required, that a wrong one is refused the same as none, and that
 * the console keys a new host is issued do not come back in the response.
 *
 * The app is imported, not spawned - `server-node.ts` only listens when it is
 * the entry point, so `app.request()` drives the real chain.
 */

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { ACTIVE_QUESTS, areaByKey, inArea } from '@chivago/core';

/** Its own database, set before server-node.ts is imported and opens one. */
process.env.CHIVAGO_DB = ':memory:';
process.env.CHIVAGO_HOST_SECRET = 'test-operator-secret';

const { app, db } = await import('./server-node.ts');

const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const SECRET = { 'x-host-secret': 'test-operator-secret' };
/** What the opener seeds: the published five, not the historical catalogue. */
const seededSichang = ACTIVE_QUESTS.filter((q) => inArea(areaByKey('koh-sichang'), q));

describe('POST /internal/open-area', () => {
  test('refuses a caller with no secret', async () => {
    const res = await post('/internal/open-area', { area: 'koh-sichang' });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, 'FORBIDDEN');
  });

  test('refuses a caller with the wrong secret', async () => {
    const res = await post('/internal/open-area', { area: 'koh-sichang' }, { 'x-host-secret': 'guess' });
    assert.equal(res.status, 403, 'a wrong secret is not better than none');
  });

  test('refuses an area that is not one of ours', async () => {
    const res = await post('/internal/open-area', { area: 'atlantis' }, SECRET);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, 'BAD_AREA');
    assert.match(body.error, /koh-sichang/, 'the refusal names what IS allowed');
  });

  test('refuses a body with no area rather than guessing one', async () => {
    const res = await post('/internal/open-area', {}, SECRET);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, 'BAD_AREA');
  });

  test('opens the area and reports what the screen will now show', async () => {
    const res = await post('/internal/open-area', { area: 'koh-sichang' }, SECRET);
    assert.equal(res.status, 200);
    const { data } = await res.json();

    assert.equal(data.questsAdded, seededSichang.length);
    assert.deepEqual(
      data.questsLive.map((q: { id: string }) => q.id).sort(),
      seededSichang.map((q) => q.id).sort(),
    );
  });

  test('never puts a console key in the response', async () => {
    /*
      A new host is issued a key, which the CLI shows once to a person. This
      route is machine-to-machine, and a key in a response body is a key in a
      log, in a proxy and in somebody's shell history.
    */
    const res = await post('/internal/open-area', { area: 'rmutt' }, SECRET);
    assert.equal(res.status, 200);
    const body = await res.text();

    assert.ok(!/chv_/.test(body), 'no key material in the body');
    const { data } = JSON.parse(body);
    assert.equal(data.keys, undefined, 'the keys field is not merely emptied, it is gone');
    assert.equal(typeof data.keysIssued, 'number', 'but the count is reported');
  });

  test('is safe to run twice', async () => {
    await post('/internal/open-area', { area: 'ku-sriracha' }, SECRET);
    const again = await post('/internal/open-area', { area: 'ku-sriracha' }, SECRET);
    const { data } = await again.json();

    assert.equal(data.questsAdded, 0);
    assert.equal(data.placesAdded, 0);
    assert.equal(data.keysIssued, 0);
  });

  /**
   * An operator is not a traveller, and must not have to become one.
   *
   * MEASURED ON PRODUCTION, 15 November: with the correct operator secret in
   * the header this route answered `401 UNAUTHENTICATED — "Sign in on this
   * device to continue"`. The traveller middleware was refusing on the
   * route's behalf, because the caller had no DEVICE KEY - and the only way
   * to get one is to register a phone, which mints an account and a wallet.
   * That is why two accounts called "Operator probe" and "Operator" are on
   * production tonight, and nothing deletes them.
   *
   * The test has to hold a REGISTERED DEVICE for the question to mean
   * anything: the open-identity path is on while `device_keys` is empty, so
   * before the first phone registers every one of these calls sails through
   * for a reason that has nothing to do with operators.
   */
  /**
   * A photograph that arrives after the place did.
   *
   * Koniix went on the Ko Sichang map with none, and the property gave one an
   * hour later. `seedArea` inserts and never asserts, so the row kept its
   * `NULL` - and the tool that refreshes a photograph lived in `seed-area.ts`,
   * behind `node:sqlite`, which a Durable Object cannot load. The picture was
   * in the repository and unreachable by the thing serving the island.
   *
   * It is OPT-IN on purpose. An ordinary run must stay the thing that is safe
   * against a live database; asking for photographs is a second sentence in
   * the body, and the answer says which places changed.
   */
  test('refreshes a photograph only when the body asks, and says which', async () => {
    await post('/internal/open-area', { area: 'koh-sichang' }, SECRET);
    db.prepare('UPDATE places SET photo_url = NULL, photo_credit = NULL WHERE id = ?')
      .run('sc-koniix-garden-cottage');

    const ordinary = await post('/internal/open-area', { area: 'koh-sichang' }, SECRET);
    assert.deepEqual((await ordinary.json()).data.photosRefreshed, [], 'an ordinary run touched a live row');
    const stillBlank = db.prepare('SELECT photo_url FROM places WHERE id = ?')
      .get('sc-koniix-garden-cottage') as unknown as { photo_url: string | null };
    assert.equal(stillBlank.photo_url, null);

    const asked = await post('/internal/open-area', { area: 'koh-sichang', photos: true }, SECRET);
    const { data } = await asked.json();
    assert.ok(
      data.photosRefreshed.includes('sc-koniix-garden-cottage'),
      `the photograph never arrived: ${JSON.stringify(data.photosRefreshed)}`,
    );
    const filled = db.prepare('SELECT photo_url, photo_credit, photo_licence FROM places WHERE id = ?')
      .get('sc-koniix-garden-cottage') as unknown as
        { photo_url: string; photo_credit: string; photo_licence: string };
    assert.match(filled.photo_url, /sc-koniix-garden-cottage\.jpg$/);
    // A picture and what may be said about it are one record.
    assert.ok(filled.photo_credit?.trim(), 'a photograph with no credit cannot be published');
    assert.ok(filled.photo_licence?.trim(), 'nor one with no licence');
  });

  test('reaches the route without a device key, once a phone has registered', async () => {
    const registered = await post('/devices', { displayName: 'A traveller' });
    assert.equal(registered.status, 200, 'a device must register for this test to mean anything');
    assert.ok(
      db.prepare('SELECT 1 FROM device_keys LIMIT 1').get(),
      'the open-identity path is still open, so this test proves nothing yet',
    );

    // No secret: the ROUTE refuses, not the traveller gate.
    const refused = await post('/internal/open-area', { area: 'koh-sichang' });
    assert.equal(refused.status, 403, 'an operator route must answer for itself');
    assert.equal((await refused.json()).code, 'FORBIDDEN');

    // With the secret: through, with no device key anywhere in sight.
    const opened = await post('/internal/open-area', { area: 'koh-sichang' }, SECRET);
    assert.equal(opened.status, 200, await opened.text());
  });
});
