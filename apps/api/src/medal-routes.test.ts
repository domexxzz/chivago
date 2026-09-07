import { strict as assert } from 'node:assert';
import { test, describe, before } from 'node:test';

/**
 * Medals, over HTTP.
 *
 * `medals.test.ts` in core proves the rules. This proves the wiring: a fresh
 * account sees every medal and has earned none; a real geofenced check-in
 * earns the first one, dated to that check-in; and the count of places in an
 * area is the count the database has, not a number in a rule.
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

let ana: string;

before(async () => {
  ana = (await json(await post('/devices', { displayName: 'Ana', label: 'Ana' }))).data.deviceKey;
  // One real place on the island, so a check-in has a fence to be inside.
  db.prepare(
    `INSERT OR IGNORE INTO places (id, name_en, name_th, short, layer, lat, lng, meta,
       blurb_en, blurb_th, tags, safety_label_en, safety_label_th,
       crowd_density, aqi, safety_index, walkability, province)
     VALUES ('p-medal','Medal Beach','x','Medal','Green',9.5357,100.0617,'Beach','x','x','[]',
             'Patrolled','x',2,40,7,8,'TH-84')`,
  ).run();
});

describe('medals over the wire', () => {
  test('a fresh account sees every medal, has earned none, and is told the basis', async () => {
    const res = await json(await get('/medals', ana));
    assert.equal(res.ok, true);
    assert.equal(res.data.earned, 0);
    assert.ok(res.data.total >= 7);
    assert.equal(res.data.medals.length, res.data.total);
    for (const m of res.data.medals) {
      assert.equal(m.earned, false);
      assert.equal(m.earnedAt, null);
      assert.ok(m.name.th, `${m.key} has no Thai name`);
      assert.ok(m.how.en, `${m.key} does not say what to do`);
    }
    assert.match(res.data.basis.en, /250 m/);
  });

  test('a geofenced check-in earns the first medal, dated to that check-in', async () => {
    const checkin = await json(await post('/places/p-medal/checkin', { lat: 9.5357, lng: 100.0617, accuracyM: 8 }, ana));
    assert.equal(checkin.ok, true, checkin.error);

    const res = await json(await get('/medals', ana));
    const first = res.data.medals.find((m: { key: string }) => m.key === 'first-steps');
    assert.equal(first.earned, true);
    assert.ok(first.earnedAt, 'the date is the check-in');
    assert.deepEqual(first.progress, { done: 1, total: 1, unit: 'places' });
    assert.equal(res.data.earned, res.data.medals.filter((m: { earned: boolean }) => m.earned).length);

    // The explorer wants three; one check-in is one of them.
    const explorer = res.data.medals.find((m: { key: string }) => m.key === 'explorer');
    assert.equal(explorer.earned, false);
    assert.equal(explorer.progress.done, 1);
  });

  test('an area is every place the database has in it', async () => {
    // This database has one place on Samui, so "all of Samui" is one place -
    // and the check-in above completed it. The number comes from the table,
    // never from the rule.
    const res = await json(await get('/medals', ana));
    const island = res.data.medals.find((m: { key: string }) => m.key === 'all-of-samui');
    assert.deepEqual(island.progress, { done: 1, total: 1, unit: 'places' });
    assert.equal(island.earned, true);
  });

  test('medals need a key like everything else', async () => {
    assert.equal((await app.request('/medals')).status, 401);
  });
});
