import { strict as assert } from 'node:assert';
import { test, describe, before } from 'node:test';

/**
 * The standing, over HTTP.
 *
 * `standing.test.ts` in core proves the ordering. This proves what leaves the
 * server: the caller's own record and own position, the count of
 * participants, the basis of the ranking - and not one other traveller's
 * name, which is the PDPA question nobody has asked yet.
 */

delete process.env.CHIVAGO_OPEN_IDENTITY;
process.env.CHIVAGO_DB = ':memory:';

const { app } = await import('./server.ts');

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

let ana: string;

before(async () => {
  ana = await register('Ana');
});

describe('what the standing says about the caller', () => {
  test('a fresh account has a record, no position, and the basis of the ranking', async () => {
    const res = await json(await get('/standing', ana));
    assert.equal(res.ok, true);
    assert.equal(res.data.you.displayName, 'Ana');
    assert.equal(res.data.you.greenVerified, 0);
    // No verified work yet, so no place in the table - not last place.
    assert.equal(res.data.position, null);
    assert.equal(typeof res.data.participants, 'number');
    assert.match(res.data.rankedBy.en, /verified approvals only/i);
  });

  test('no other traveller leaves the server', async () => {
    const res = await json(await get('/standing', ana));
    assert.ok(!('travellers' in res.data), 'a list of travellers is a list of names');
    for (const host of res.data.hosts) {
      assert.ok(!('displayName' in host), 'a host row grew a person’s name');
    }
  });

  test('the standing needs a key like everything else', async () => {
    const res = await app.request('/standing');
    assert.equal(res.status, 401);
  });
});
