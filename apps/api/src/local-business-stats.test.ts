/**
 * What a shop owner gets to see, and what we refuse to store to give it.
 *
 * The deck sells "สถิติร้าน" on every paid tier. Before this there was nothing
 * behind that word: the platform generated a profile view every time a tourist
 * opened a shop and threw it away.
 *
 * The shape of the store is the decision worth defending. This counts into a
 * DAILY ROLLUP - one row per shop per day per kind - and never writes a row
 * per event and never records who the viewer was. Two reasons, and both of
 * them bite:
 *
 *   1. Every table in this pilot lives in ONE Durable Object, and a
 *      SQLite-backed object stops accepting writes at 10 GB. A row per view
 *      is a table that grows without a ceiling inside a database that has
 *      one; the rollup is 3 rows per shop per day no matter how busy it gets.
 *   2. A shop does not need to know WHICH tourist looked at it, and the
 *      moment we store that we are holding personal data we did not need and
 *      cannot explain.
 *
 * So the owner learns how many, never who.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

process.env.CHIVAGO_DB = ':memory:';
const { app } = await import('./server-node.ts');

const parse = async (res: Response): Promise<any> => res.json();

const register = async (suffix: string, accountType: 'operator' | 'traveller') => {
  const res = await app.request('/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fullName: `Stats ${suffix}`,
      email: `stats${suffix}@example.com`,
      phone: `0820000${suffix.padStart(3, '0')}`,
      password: 'password123',
      accountType,
      businessName: accountType === 'operator' ? `Stats Shop ${suffix}` : undefined,
    }),
  });
  const body = await parse(res);
  assert.equal(res.status, 200, JSON.stringify(body));
  return { 'x-chivago-device-key': body.data.deviceKey };
};

const request = (path: string, method: string, key: Record<string, string>, body?: unknown) =>
  app.request(path, {
    method,
    headers: { ...key, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const makeShop = async (owner: Record<string, string>, name: string) => {
  const created = await parse(await request('/shops', 'POST', owner, {
    name, category: 'ร้านอาหาร', areaKey: 'koh-sichang', description: 'counted',
    address: 'Tha Lang', lat: 13.1599, lng: 100.8096, phone: '0811111111',
    email: 'counted@example.com', openingHours: '09:00-18:00', amenities: [], active: true,
  }));
  assert.equal(created.ok, true, JSON.stringify(created));
  return created.data.id as string;
};

test('a visitor opening a shop is counted; the owner opening it is not', async () => {
  const owner = await register('901', 'operator');
  const traveller = await register('902', 'traveller');
  const id = await makeShop(owner, 'Counted Cafe');

  const empty = await parse(await request(`/shops/${id}/stats`, 'GET', owner));
  assert.equal(empty.ok, true, JSON.stringify(empty));
  assert.equal(empty.data.totals.view, 0, 'a shop nobody opened has no views');

  await request(`/shops/${id}`, 'GET', traveller);
  await request(`/shops/${id}`, 'GET', traveller);

  const seen = await parse(await request(`/shops/${id}/stats`, 'GET', owner));
  assert.equal(seen.data.totals.view, 2, 'each visitor open counts once');

  /*
    The owner checking their own listing is the single most common way a
    counter like this turns into a lie: the shop refreshes its page all day and
    then tells the sales meeting it had forty visitors.
  */
  await request(`/shops/${id}`, 'GET', owner);
  await request(`/shops/${id}`, 'GET', owner);
  const afterOwner = await parse(await request(`/shops/${id}/stats`, 'GET', owner));
  assert.equal(afterOwner.data.totals.view, 2, 'the owner looking at their own shop is not a visitor');
});

test('taps are counted per kind, accumulate, and refuse anything unknown', async () => {
  const owner = await register('903', 'operator');
  const traveller = await register('904', 'traveller');
  const id = await makeShop(owner, 'Tapped Cafe');

  assert.equal((await request(`/shops/${id}/tap`, 'POST', traveller, { kind: 'phone' })).status, 200);
  assert.equal((await request(`/shops/${id}/tap`, 'POST', traveller, { kind: 'phone' })).status, 200);
  assert.equal((await request(`/shops/${id}/tap`, 'POST', traveller, { kind: 'route' })).status, 200);

  const stats = await parse(await request(`/shops/${id}/stats`, 'GET', owner));
  assert.equal(stats.data.totals.phone, 2);
  assert.equal(stats.data.totals.route, 1);

  /*
    An open counter endpoint is an invitation to write junk into the database.
    Only the three kinds the product shows are accepted.
  */
  /* The owner pressing their own Call button is testing it, not buying. */
  assert.equal((await request(`/shops/${id}/tap`, 'POST', owner, { kind: 'phone' })).status, 200);
  assert.equal((await parse(await request(`/shops/${id}/stats`, 'GET', owner))).data.totals.phone, 2);

  const bogus = await request(`/shops/${id}/tap`, 'POST', traveller, { kind: 'drop-table' });
  assert.equal(bogus.status, 400);
  const missing = await request(`/shops/${id}/tap`, 'POST', traveller, {});
  assert.equal(missing.status, 400);
  assert.equal((await request(`/shops/unknown-shop/tap`, 'POST', traveller, { kind: 'phone' })).status, 404);
});

test('stats belong to the owner, and arrive grouped by day', async () => {
  const owner = await register('905', 'operator');
  const other = await register('906', 'operator');
  const traveller = await register('907', 'traveller');
  const id = await makeShop(owner, 'Private Numbers');

  await request(`/shops/${id}`, 'GET', traveller);
  await request(`/shops/${id}/tap`, 'POST', traveller, { kind: 'route' });

  assert.equal((await request(`/shops/${id}/stats`, 'GET', other)).status, 403, 'another operator cannot read it');
  assert.equal((await request(`/shops/${id}/stats`, 'GET', traveller)).status, 403, 'a traveller cannot read it');

  const stats = await parse(await request(`/shops/${id}/stats`, 'GET', owner));
  assert.equal(stats.data.windowDays, 30);
  assert.equal(stats.data.days.length, 1, 'one day of activity is one row');
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(stats.data.days[0].day, today);
  assert.equal(stats.data.days[0].view, 1);
  assert.equal(stats.data.days[0].route, 1);
  assert.equal(stats.data.days[0].phone, 0, 'a kind with no activity reads zero, not missing');

  /*
    The promise this file exists to keep. Nothing in the store may identify a
    viewer, so there is no column that could.
  */
  const { db } = await import('./server-node.ts');
  const columns = db.prepare("SELECT name FROM pragma_table_info('local_shop_daily_stats')").all() as { name: string }[];
  assert.deepEqual(
    columns.map((c) => c.name).sort(),
    ['count', 'day', 'kind', 'shop_id'],
    'the rollup holds counts and nothing that points at a person',
  );
});
