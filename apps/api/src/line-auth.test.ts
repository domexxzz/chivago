import { strict as assert } from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { openDb } from './db-node.ts';
import { registerDevice } from './account-service.ts';
import {
  authorizeUrl, lineConfig, lineSubFor, packRound, sameToken, startRound, unpackRound,
} from './line-auth.ts';
import { resolveLineSignIn, userForLineSub } from './line-identity.ts';

/**
 * Signing in with LINE.
 *
 * The real LINE is never called: `fetch` is a stand-in. What is tested here is
 * the part that decides WHOSE account a sign-in lands on, because that is the
 * part that can lose somebody's trip points.
 */
process.env.CHIVAGO_DB = ':memory:';

const ENV = {
  CHIVAGO_LINE_CHANNEL_ID: '2012285516',
  CHIVAGO_LINE_CHANNEL_SECRET: 'secret-under-test',
  CHIVAGO_PUBLIC_URL: 'https://chivargo.com',
} as NodeJS.ProcessEnv;

describe('lineConfig', () => {
  test('a configured channel gives the callback the console must have registered', () => {
    const cfg = lineConfig(ENV)!;
    assert.ok(cfg);
    assert.equal(cfg.redirectUri, 'https://chivargo.com/auth/line/callback');
    assert.equal(cfg.channelId, '2012285516');
  });

  test('a trailing slash on the site url does not become a double slash', () => {
    assert.equal(
      lineConfig({ ...ENV, CHIVAGO_PUBLIC_URL: 'https://chivargo.com/' })!.redirectUri,
      'https://chivargo.com/auth/line/callback',
    );
  });

  test('anything missing turns LINE sign-in off rather than half on', () => {
    for (const k of ['CHIVAGO_LINE_CHANNEL_ID', 'CHIVAGO_LINE_CHANNEL_SECRET', 'CHIVAGO_PUBLIC_URL']) {
      assert.equal(lineConfig({ ...ENV, [k]: '' }), null, k);
      assert.equal(lineConfig({ ...ENV, [k]: '   ' }), null, `${k} whitespace`);
    }
    assert.equal(lineConfig({}), null);
  });

  test('a secret pasted with a stray newline still works', () => {
    assert.equal(lineConfig({ ...ENV, CHIVAGO_LINE_CHANNEL_SECRET: ' abc\n' })!.channelSecret, 'abc');
  });

  test('a callback this app would not serve is refused', () => {
    for (const bad of ['http://chivargo.com', 'ftp://chivargo.com', 'chivargo.com', 'javascript:x']) {
      assert.equal(lineConfig({ ...ENV, CHIVAGO_PUBLIC_URL: bad }), null, bad);
    }
    // http is allowed on this machine, for development.
    assert.ok(lineConfig({ ...ENV, CHIVAGO_PUBLIC_URL: 'http://localhost:8787' }));
  });
});

describe('the round trip', () => {
  test('the authorize url carries state, nonce and the least scope LINE accepts', () => {
    const round = startRound('/');
    const u = new URL(authorizeUrl(lineConfig(ENV)!, round));
    assert.equal(u.origin + u.pathname, 'https://access.line.me/oauth2/v2.1/authorize');
    assert.equal(u.searchParams.get('state'), round.state);
    assert.equal(u.searchParams.get('nonce'), round.nonce);
    assert.equal(u.searchParams.get('scope'), 'profile openid');
    assert.equal(u.searchParams.get('bot_prompt'), null, 'not asked for unless configured');
  });

  test('bot_prompt is sent only when it is set', () => {
    const cfg = lineConfig({ ...ENV, CHIVAGO_LINE_BOT_PROMPT: 'aggressive' })!;
    assert.equal(new URL(authorizeUrl(cfg, startRound('/'))).searchParams.get('bot_prompt'), 'aggressive');
  });

  test('state and nonce are different every time, and long enough to be unguessable', () => {
    const a = startRound('/');
    const b = startRound('/');
    assert.notEqual(a.state, b.state);
    assert.notEqual(a.state, a.nonce);
    assert.ok(a.state.length >= 30, a.state);
  });

  test('the cookie survives a round trip, and a damaged one is refused', () => {
    const round = startRound('/places/chaweng');
    assert.deepEqual(unpackRound(packRound(round)), round);
    for (const bad of ['', 'one|two', 'a|b|c|d', '|b|c', undefined]) {
      assert.equal(unpackRound(bad as string | undefined), null, String(bad));
    }
  });

  test('token comparison does not fall over on a length mismatch', () => {
    assert.equal(sameToken('abc', 'abc'), true);
    assert.equal(sameToken('abc', 'abcd'), false);
    assert.equal(sameToken('abc', ''), false);
  });
});

describe('lineSubFor', () => {
  const cfg = lineConfig(ENV)!;
  const round = startRound('/');

  const fake = (reply: (url: string) => unknown) => (async (url: string | URL | Request) => {
    const body = reply(String(url));
    if (body instanceof Error) throw body;
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  const good = (over: Record<string, unknown> = {}) => (url: string) => (url.includes('/token')
    ? { id_token: 'an.id.token' }
    : { sub: 'U1234', aud: cfg.channelId, nonce: round.nonce, ...over });

  test('a complete exchange gives the LINE user id', async () => {
    assert.equal(await lineSubFor(cfg, 'code', round, { fetchImpl: fake(good()) }), 'U1234');
  });

  test('a token addressed to another channel is refused', async () => {
    assert.equal(await lineSubFor(cfg, 'code', round, { fetchImpl: fake(good({ aud: 'someone-else' })) }), null);
  });

  test('a nonce from another sign-in is refused', async () => {
    assert.equal(await lineSubFor(cfg, 'code', round, { fetchImpl: fake(good({ nonce: 'different' })) }), null);
    assert.equal(await lineSubFor(cfg, 'code', round, { fetchImpl: fake(good({ nonce: undefined })) }), null);
  });

  test('an answer with no subject is refused rather than guessed at', async () => {
    assert.equal(await lineSubFor(cfg, 'code', round, { fetchImpl: fake(good({ sub: undefined })) }), null);
    assert.equal(await lineSubFor(cfg, 'code', round, { fetchImpl: fake(good({ sub: '' })) }), null);
    assert.equal(await lineSubFor(cfg, 'code', round, { fetchImpl: fake(() => ({ no_id_token: true })) }), null);
  });

  test('a LINE that never answers is given up on, not waited for', async () => {
    const hanging = ((_u: string | URL | Request, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    })) as typeof fetch;
    await assert.rejects(() => lineSubFor(cfg, 'code', round, { fetchImpl: hanging, timeoutMs: 20 }));
  });
});

describe('whose account a LINE sign-in lands on', () => {
  let db: ReturnType<typeof openDb>;
  const newUser = () => registerDevice(db).userId;
  /** Give a traveller a history, so the clash rule has something to protect. */
  const earn = (userId: string) => db.prepare(
    `INSERT INTO ledger (id, user_id, label, occurred_at, host, amount, kind, currency, source_ref)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    `l_${Math.random()}`, userId, 'Checked in', new Date().toISOString(), 'test',
    10, 'checkin', 'trip', `ref_${Math.random()}`,
  );

  beforeEach(() => { db = openDb(':memory:'); });

  test('a LINE account nobody has used makes a new traveller', () => {
    const r = resolveLineSignIn(db, 'U_new', null, newUser);
    assert.equal(r.outcome, 'created');
    assert.ok(r.userId);
    assert.equal(userForLineSub(db, 'U_new'), r.userId);
  });

  test('signing in again lands on the same traveller, writing nothing new', () => {
    const first = resolveLineSignIn(db, 'U_same', null, newUser);
    const again = resolveLineSignIn(db, 'U_same', null, newUser);
    assert.equal(again.outcome, 'signed-in');
    assert.equal(again.userId, first.userId);
  });

  test('a phone already signed in KEEPS its traveller and gains a second way in', () => {
    // The whole point: the points earned on this phone must not be left behind.
    const mine = newUser();
    earn(mine);
    const r = resolveLineSignIn(db, 'U_link', mine, newUser);
    assert.equal(r.outcome, 'linked');
    assert.equal(r.userId, mine, 'the traveller must not change');
    assert.equal(userForLineSub(db, 'U_link'), mine);
  });

  test('the same LINE account on a second phone signs in as the first traveller', () => {
    const first = resolveLineSignIn(db, 'U_move', null, newUser);
    earn(first.userId!);
    // A fresh phone with no key at all.
    const second = resolveLineSignIn(db, 'U_move', null, newUser);
    assert.equal(second.outcome, 'signed-in');
    assert.equal(second.userId, first.userId, 'the points follow the LINE account');
  });

  test('a phone with NO history is simply taken over, not called a clash', () => {
    const owner = resolveLineSignIn(db, 'U_owner', null, newUser);
    earn(owner.userId!);
    const emptyPhone = newUser(); // registered, never earned anything
    const r = resolveLineSignIn(db, 'U_owner', emptyPhone, newUser);
    assert.equal(r.outcome, 'signed-in');
    assert.equal(r.userId, owner.userId);
  });

  test('two travellers who BOTH have a history is a clash, and nothing is written', () => {
    const owner = resolveLineSignIn(db, 'U_clash', null, newUser);
    earn(owner.userId!);
    const phone = newUser();
    earn(phone);

    const r = resolveLineSignIn(db, 'U_clash', phone, newUser);
    assert.equal(r.outcome, 'clash');
    assert.equal(r.userId, null, 'nobody is signed in');
    assert.equal(r.deviceUserId, phone);
    assert.equal(r.lineUserId, owner.userId);
    // The binding must be untouched: a clash may not quietly move the account.
    assert.equal(userForLineSub(db, 'U_clash'), owner.userId);
  });

  test('one LINE account cannot end up on two travellers', () => {
    const a = resolveLineSignIn(db, 'U_one', null, newUser);
    const rows = db.prepare('SELECT COUNT(*) AS n FROM line_identities WHERE line_sub = ?').get('U_one') as { n: number };
    assert.equal(rows.n, 1);
    assert.equal(a.outcome, 'created');
  });

  test('a traveller may hold a device key, an email and a LINE account at once', () => {
    const mine = newUser();
    resolveLineSignIn(db, 'U_multi', mine, newUser);
    const n = db.prepare('SELECT COUNT(*) AS n FROM device_keys WHERE user_id = ?').get(mine) as { n: number };
    assert.ok(n.n >= 1, 'the device key survives the link');
    assert.equal(userForLineSub(db, 'U_multi'), mine);
  });
});
