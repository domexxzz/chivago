import { strict as assert } from 'node:assert';
import { test, describe, before, after } from 'node:test';

/**
 * Accounts, over HTTP.
 *
 * `account-service.test.ts` proves the mechanism. This file proves the thing
 * that actually protects somebody: that the old unauthenticated header stops
 * working the moment there is an account to protect, and that it stops working
 * through the real middleware rather than in a unit test's imagination.
 *
 * The app is imported, not spawned — `server.ts` only listens when it is the
 * entry point, so `app.request()` drives the same middleware chain a phone hits.
 */

// The pilot escape hatch must be OFF here, or the auto-close cannot be observed.
delete process.env.CHIVAGO_OPEN_IDENTITY;
// Its OWN database, set before server.ts is imported and opens one. Registering
// a device closes the header path for whatever database it happens to be in,
// so running this against the working copy would silently break the demo
// capture scripts for anybody who ran the tests afterwards.
process.env.CHIVAGO_DB = ':memory:';

const { app, db } = await import('./server.ts');

const json = async (res: Response) => (await res.json()) as { ok: boolean; data?: any; code?: string; error?: string };

const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const get = (path: string, headers: Record<string, string> = {}) =>
  app.request(path, { headers });

/** Whatever the working tree's database holds, these tests own their own rows. */
let key: string;
let user: string;

before(async () => {
  const res = await json(await post('/devices', { displayName: 'Ana', label: 'Ana iPhone' }));
  assert.equal(res.ok, true);
  key = res.data.deviceKey;
  user = res.data.userId;
});

after(() => {
  // Belt and braces. The database is in memory and dies with the process, but
  // an assertion that the rows were ours is cheap and catches the day somebody
  // points CHIVAGO_DB at a file again.
  db.prepare('DELETE FROM device_keys').run();
  db.prepare('DELETE FROM link_codes').run();
});

describe('registering', () => {
  test('a new device is handed a key and a user', () => {
    assert.match(key, /^chvg_dev_/);
    assert.match(user, /^u_/);
  });

  test('the key it was handed actually works', async () => {
    const res = await json(await get('/account', { 'x-chivago-device-key': key }));
    assert.equal(res.ok, true);
    assert.equal(res.data.userId, user);
  });

  test('a new account arrives with a wallet, not a 500', async () => {
    const res = await json(await get('/wallet', { 'x-chivago-device-key': key }));
    assert.equal(res.ok, true);
    assert.equal(typeof res.data.balances.green, 'number');
  });
});

describe('the header hole closes by itself', () => {
  test('claiming to be somebody by header is refused once an account exists', async () => {
    // THE test. Before this feature, `x-chivago-user: <anything>` was accepted
    // and returned that person's wallet. A device is now registered, so there
    // is somebody to protect, and the old path is shut.
    const res = await app.request('/wallet', { headers: { 'x-chivago-user': user } });
    assert.equal(res.status, 401);
    assert.equal((await json(res)).code, 'UNAUTHENTICATED');
  });

  test('sending no identity at all is refused too', async () => {
    const res = await app.request('/wallet');
    assert.equal(res.status, 401);
  });

  test('a made-up device key is refused rather than falling back', async () => {
    // A fallback here would mean a revoked phone kept working simply by
    // dropping its own credential.
    const res = await app.request('/wallet', {
      headers: { 'x-chivago-device-key': 'chvg_dev_madeup', 'x-chivago-user': user },
    });
    assert.equal(res.status, 401);
  });

  test('registering and claiming stay open, because that is how a key is got', async () => {
    // They cannot require the thing they exist to hand out.
    const res = await post('/devices', { label: 'Second traveller' });
    assert.equal(res.status, 200);
    const claim = await post('/account/claim', { code: 'AAAAAAAA' });
    assert.equal(claim.status, 400, 'claim was blocked by auth instead of judging the code');
    assert.equal((await json(claim)).code, 'LINK_UNKNOWN');
  });
});

describe('one account, two phones', () => {
  test('a claimed code puts the second phone on the first phone’s account', async () => {
    const issued = await json(await post('/account/link-code', undefined, { 'x-chivago-device-key': key }));
    assert.equal(issued.ok, true);
    assert.match(issued.data.code, /^[2-9A-HJKMNP-Z]{8}$/);

    const claimed = await json(await post('/account/claim', { code: issued.data.code, label: 'Ana iPad' }));
    assert.equal(claimed.ok, true);
    assert.equal(claimed.data.userId, user, 'the second phone became a different person');
    assert.notEqual(claimed.data.deviceKey, key);

    // And the points follow the person, which is the entire point.
    const wallet = await json(await get('/wallet', { 'x-chivago-device-key': claimed.data.deviceKey }));
    assert.equal(wallet.ok, true);
    assert.equal(wallet.data.balances.green, (await json(await get('/wallet', { 'x-chivago-device-key': key }))).data.balances.green);
  });

  test('both phones are listed, and the caller can tell which one it is', async () => {
    const res = await json(await get('/account', { 'x-chivago-device-key': key }));
    const labels = res.data.devices.map((d: { label: string }) => d.label);
    assert.deepEqual(labels.sort(), ['Ana iPad', 'Ana iPhone']);
    assert.equal(res.data.devices.find((d: any) => d.label === 'Ana iPhone').current, true);
  });

  test('no device key is ever handed back out', async () => {
    const res = await get('/account', { 'x-chivago-device-key': key });
    assert.doesNotMatch(await res.text(), /chvg_dev_/, 'a key came back from the device list');
  });

  test('a used code is refused with a sentence that says so', async () => {
    const issued = await json(await post('/account/link-code', undefined, { 'x-chivago-device-key': key }));
    await post('/account/claim', { code: issued.data.code });
    const again = await json(await post('/account/claim', { code: issued.data.code }));
    assert.equal(again.code, 'LINK_USED');
    assert.match(again.error!, /already been used/);
  });

  test('a missing code is a sentence, not a stack trace', async () => {
    const res = await json(await post('/account/claim', {}));
    assert.equal(res.code, 'CODE_REQUIRED');
    assert.match(res.error!, /other phone/);
  });
});

describe('removing a phone', () => {
  test('a revoked phone stops working immediately', async () => {
    const registered = await json(await post('/devices', { label: 'Lost phone' }));
    const lost = registered.data.deviceKey as string;
    assert.equal((await get('/account', { 'x-chivago-device-key': lost })).status, 200);

    const revoked = await json(await post('/account/devices/revoke', { label: 'Lost phone' }, { 'x-chivago-device-key': lost }));
    assert.equal(revoked.ok, true);
    assert.equal((await get('/account', { 'x-chivago-device-key': lost })).status, 401);
  });

  test('revoking a phone that is not on this account says so', async () => {
    const res = await json(await post('/account/devices/revoke', { label: 'Not mine' }, { 'x-chivago-device-key': key }));
    assert.equal(res.code, 'NO_SUCH_DEVICE');
  });
});

describe('minting accounts is rate-limited per address', () => {
  // The opening balance is real money the moment the marketplace accepts it.
  // Before this, "a script can mint accounts" meant "a script can mint
  // vouchers", and the README said it bought nothing.
  const from = (address: string) => ({ 'x-forwarded-for': address });

  test('the eleventh registration from one address in an hour is refused', async () => {
    for (let i = 0; i < 10; i += 1) {
      const res = await json(await post('/devices', { label: `phone ${i}` }, from('203.0.113.7')));
      assert.equal(res.ok, true, `registration ${i + 1} should be allowed`);
    }
    const raw = await post('/devices', { label: 'phone 11' }, from('203.0.113.7'));
    assert.equal(raw.status, 429);
    const res = await json(raw);
    assert.equal(res.code, 'TOO_MANY_REGISTRATIONS');
  });

  test('another address is not punished for it', async () => {
    const res = await json(await post('/devices', { label: 'elsewhere' }, from('203.0.113.8')));
    assert.equal(res.ok, true);
    assert.match(res.data.deviceKey, /^chvg_dev_/);
  });

  test('a refused registration hands out no key and creates no user', async () => {
    const before = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
    const raw = await post('/devices', { label: 'phone 12' }, from('203.0.113.7'));
    assert.equal(raw.status, 429);
    const after = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
    assert.equal(after, before, 'a refused registration must not provision anything');
  });
});

describe('what stays public once a real account exists', () => {
  // Caught live on chivago.fly.dev on the evening of 7 September: the moment
  // the first phone registered, the header hole closed - correctly - and took
  // the web app's fonts, its stylesheet, the favicon and /health with it. The
  // app sat on LOADING for everyone after, and Fly's health check pulled the
  // machine. A device exists in this database (the `before` above), so every
  // path here is asked for the way a browser asks: with no key at all.
  test('the health check answers without a key', async () => {
    const res = await app.request('/health');
    assert.equal(res.status, 200);
  });

  test('the web app\'s own files are never refused for want of a key', async () => {
    // No web export is mounted in the tests, so these fall through to a 404
    // - which is not a 401. The point is that authentication is not what
    // stands between a browser and a font.
    for (const path of ['/', '/index.html', '/favicon.ico', '/metadata.json',
      '/_expo/static/js/web/index-abc.js', '/assets/fonts/Anuphan_600SemiBold.ttf']) {
      const res = await app.request(path);
      assert.notEqual(res.status, 401, `${path} was refused for want of a key`);
    }
  });

  test('and the wallet still is', async () => {
    const res = await app.request('/wallet');
    assert.equal(res.status, 401);
  });
});
