import { strict as assert } from 'node:assert';
import { test, describe, before } from 'node:test';

/**
 * The bus routes, over HTTP.
 *
 * `transit-service.test.ts` proves the mechanism. This proves the thing that
 * only the real middleware chain can show: that a sighting is filed under the
 * rider who tapped.
 *
 * IT WAS NOT. The first version registered the write beside the read route,
 * two hundred lines above `app.use('*', auth)`, and Hono matches in
 * registration order - so the write never passed through authentication and
 * every sighting landed on the fallback account. Two riders at one stop then
 * looked like one rider pressing twice, and the second one was turned away.
 * Nothing in the unit tests could see it, because the service was right.
 */

delete process.env.CHIVAGO_OPEN_IDENTITY;
process.env.CHIVAGO_DB = ':memory:';

const { app } = await import('./server.ts');

const json = async (res: Response | Promise<Response>) =>
  (await (await res).json()) as { ok: boolean; data?: any; code?: string };

const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const register = async (label: string): Promise<string> => {
  const res = await json(await post('/devices', { label }));
  assert.ok(res.ok, `could not register ${label}`);
  return res.data.deviceKey as string;
};

const tap = (key: string, route = 'smartbus-538', stopId = 'rmutt-gate3') =>
  json(post(`/transit/${route}/seen`, { stopId }, { 'x-chivago-device-key': key }));

let riderA = '';
let riderB = '';

before(async () => {
  riderA = await register('rider-a');
  riderB = await register('rider-b');
});

describe('what the campus can ride', () => {
  test('the read is public, like the rest of an area feed', async () => {
    const res = await json(app.request('/areas/rmutt/transit'));
    assert.ok(res.ok);
    assert.equal(res.data.routes.length, 1);
    assert.equal(res.data.routes[0].schedule, 'unpublished');
    assert.deepEqual(res.data.campus, [], 'the university has published no shuttle');
  });

  test('an area that is not an area is a 404, not an empty list', async () => {
    const res = await json(app.request('/areas/not-a-campus/transit'));
    assert.equal(res.ok, false);
    assert.equal(res.code, 'NOT_FOUND');
  });
});

describe('a sighting belongs to the device that reported it', () => {
  test('two riders at one bus are two reports, and one vehicle', async () => {
    // The regression. If this fails with "already-reported" on rider B, the
    // write has drifted back above the authentication middleware and every
    // sighting is being filed under one account again.
    const first = await tap(riderA);
    assert.ok(first.ok);
    assert.equal(first.data.recorded, true, 'the first rider was not recorded');

    const second = await tap(riderB);
    assert.ok(second.ok);
    assert.equal(second.data.recorded, true, 'the second rider was treated as the first pressing twice');
    assert.equal(second.data.headway.reports, 2);
    assert.equal(second.data.headway.vehicles, 1, 'they saw one bus between them');
  });

  test('the same rider pressing again is a double-tap, and is not an error', async () => {
    const again = await tap(riderA);
    assert.ok(again.ok, 'a second press must not be a red message');
    assert.equal(again.data.recorded, false);
    assert.equal(again.data.because, 'already-reported');
  });

  test('a device that is not signed in cannot report at all', async () => {
    const res = await json(post('/transit/smartbus-538/seen', { stopId: 'rmutt-gate3' }));
    assert.equal(res.ok, false);
    assert.equal(res.code, 'UNAUTHENTICATED');
  });

  test('a missing stopId is a named 400, never a 500', async () => {
    const res = await json(post('/transit/smartbus-538/seen', {}, { 'x-chivago-device-key': riderA }));
    assert.equal(res.ok, false);
    assert.equal(res.code, 'BAD_REQUEST');
  });
});
