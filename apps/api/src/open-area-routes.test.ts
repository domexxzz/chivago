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

import { SEED_QUESTS, areaByKey, inArea } from '@chivago/core';

/** Its own database, set before server-node.ts is imported and opens one. */
process.env.CHIVAGO_DB = ':memory:';
process.env.CHIVAGO_HOST_SECRET = 'test-operator-secret';

const { app } = await import('./server-node.ts');

const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const SECRET = { 'x-host-secret': 'test-operator-secret' };
const seededSichang = SEED_QUESTS.filter((q) => inArea(areaByKey('koh-sichang'), q));

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
});
