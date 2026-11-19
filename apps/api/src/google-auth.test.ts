import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { openDb } from './db-node.ts';
import { registerDevice } from './account-service.ts';
import { startRound } from './line-auth.ts';
import { googleAuthorizeUrl, googleConfig, googleSubFor } from './google-auth.ts';
import { resolveGoogleSignIn, userForGoogleSub } from './google-identity.ts';

/**
 * Signing in with Google.
 *
 * The real Google is never called: `fetch` is a stand-in. The round trip's
 * state, nonce and cookie are LINE's, unchanged - see line-auth.ts - so what
 * is tested here is what is Google's own: the scope it asks for, the token it
 * is willing to believe, and whose account a sign-in lands on.
 */
process.env.CHIVAGO_DB = ':memory:';

const ENV = {
  CHIVAGO_GOOGLE_CLIENT_ID: 'client-under-test.apps.googleusercontent.com',
  CHIVAGO_GOOGLE_CLIENT_SECRET: 'secret-under-test',
  CHIVAGO_PUBLIC_URL: 'https://chivargo.com',
} as NodeJS.ProcessEnv;

const b64u = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
const jwt = (payload: Record<string, unknown>) => [b64u({ alg: 'RS256', typ: 'JWT' }), b64u(payload), 'signature'].join('.');
const NOW = new Date('2026-11-19T01:00:00Z');
const inAnHour = Math.floor(NOW.getTime() / 1000) + 3600;

/** A token endpoint that records what it was sent and answers `reply`. */
function tokenEndpoint(reply: unknown, status = 200) {
  const calls: { url: string; init: RequestInit; body: URLSearchParams }[] = [];
  const fetchImpl = (async (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    calls.push({ url: String(url), init: init ?? {}, body: new URLSearchParams(String(init?.body ?? '')) });
    return new Response(JSON.stringify(reply), { status });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe('googleConfig', () => {
  test('a configured client gives the redirect URI the console must have registered', () => {
    const cfg = googleConfig(ENV)!;
    assert.ok(cfg);
    assert.equal(cfg.redirectUri, 'https://chivargo.com/auth/google/callback');
    assert.equal(cfg.clientId, 'client-under-test.apps.googleusercontent.com');
  });

  test('anything missing turns Google sign-in off rather than half on', () => {
    for (const k of ['CHIVAGO_GOOGLE_CLIENT_ID', 'CHIVAGO_GOOGLE_CLIENT_SECRET', 'CHIVAGO_PUBLIC_URL']) {
      assert.equal(googleConfig({ ...ENV, [k]: '' }), null, k);
      assert.equal(googleConfig({ ...ENV, [k]: '  \n' }), null, `${k} whitespace`);
    }
    assert.equal(googleConfig({}), null);
  });

  test('a secret pasted with a stray newline still works', () => {
    assert.equal(googleConfig({ ...ENV, CHIVAGO_GOOGLE_CLIENT_SECRET: ' abc\n' })!.clientSecret, 'abc');
  });

  test('a redirect this app would not serve is refused', () => {
    for (const bad of ['http://chivargo.com', 'ftp://chivargo.com', 'chivargo.com', 'javascript:x']) {
      assert.equal(googleConfig({ ...ENV, CHIVAGO_PUBLIC_URL: bad }), null, bad);
    }
    assert.ok(googleConfig({ ...ENV, CHIVAGO_PUBLIC_URL: 'http://localhost:8787' }));
  });
});

describe('googleAuthorizeUrl', () => {
  test('asks for openid and nothing else: no email, no name, no picture', () => {
    const round = startRound('/');
    const url = new URL(googleAuthorizeUrl(googleConfig(ENV)!, round));
    assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
    assert.equal(url.searchParams.get('scope'), 'openid', 'the least personal data is the safest amount');
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.equal(url.searchParams.get('client_id'), ENV.CHIVAGO_GOOGLE_CLIENT_ID);
    assert.equal(url.searchParams.get('redirect_uri'), 'https://chivargo.com/auth/google/callback');
    assert.equal(url.searchParams.get('state'), round.state);
    assert.equal(url.searchParams.get('nonce'), round.nonce);
  });
});

describe('googleSubFor', () => {
  const cfg = googleConfig(ENV)!;
  const round = startRound('/');
  const good = { iss: 'https://accounts.google.com', aud: cfg.clientId, sub: '109876543210', exp: inAnHour, nonce: round.nonce };

  test('exchanges the code at the token endpoint and returns the sub of a token addressed to us', async () => {
    const google = tokenEndpoint({ id_token: jwt(good) });
    assert.equal(await googleSubFor(cfg, 'the-code', round, { fetchImpl: google.fetchImpl, now: NOW }), '109876543210');
    const [call] = google.calls;
    assert.equal(call!.url, 'https://oauth2.googleapis.com/token');
    assert.equal(call!.init.method, 'POST');
    assert.equal(call!.init.redirect, 'manual', 'never error: workerd refuses it');
    assert.equal(call!.body.get('grant_type'), 'authorization_code');
    assert.equal(call!.body.get('code'), 'the-code');
    assert.equal(call!.body.get('redirect_uri'), cfg.redirectUri);
    assert.equal(call!.body.get('client_id'), cfg.clientId);
    assert.equal(call!.body.get('client_secret'), cfg.clientSecret);
  });

  test('accepts the issuer written without its scheme, which Google also uses', async () => {
    const google = tokenEndpoint({ id_token: jwt({ ...good, iss: 'accounts.google.com' }) });
    assert.equal(await googleSubFor(cfg, 'c', round, { fetchImpl: google.fetchImpl, now: NOW }), '109876543210');
  });

  test('refuses a token it should not believe', async () => {
    const cases: [string, Record<string, unknown>][] = [
      ['addressed to another client', { ...good, aud: 'someone-else.apps.googleusercontent.com' }],
      ['from another issuer', { ...good, iss: 'https://evil.example' }],
      ['already expired', { ...good, exp: Math.floor(NOW.getTime() / 1000) - 1 }],
      ['from another sign-in', { ...good, nonce: 'not-this-round' }],
      ['with no nonce', { ...good, nonce: undefined }],
      ['with no subject', { ...good, sub: '' }],
    ];
    for (const [why, payload] of cases) {
      const google = tokenEndpoint({ id_token: jwt(payload) });
      assert.equal(await googleSubFor(cfg, 'c', round, { fetchImpl: google.fetchImpl, now: NOW }), null, why);
    }
  });

  test('a missing or malformed id_token is not a sign-in', async () => {
    for (const reply of [{}, { id_token: '' }, { id_token: 'not.a.jwt.at.all' }, { id_token: 'a.!!!.c' }]) {
      const google = tokenEndpoint(reply);
      assert.equal(await googleSubFor(cfg, 'c', round, { fetchImpl: google.fetchImpl, now: NOW }), null, JSON.stringify(reply));
    }
  });

  test('a refusal from Google is an error the route can log, not a silent null', async () => {
    const google = tokenEndpoint({ error: 'invalid_client' }, 401);
    await assert.rejects(googleSubFor(cfg, 'c', round, { fetchImpl: google.fetchImpl, now: NOW }), /google 401/);
  });
});

describe('resolveGoogleSignIn', () => {
  test('created, then signed in, then linked from a phone that already had a traveller', () => {
    const db = openDb(':memory:');
    const fresh = () => registerDevice(db).userId;

    const first = resolveGoogleSignIn(db, 'g-1', null, fresh);
    assert.equal(first.outcome, 'created');
    assert.equal(userForGoogleSub(db, 'g-1'), first.userId);

    assert.deepEqual(resolveGoogleSignIn(db, 'g-1', null, fresh), { outcome: 'signed-in', userId: first.userId });

    const phone = registerDevice(db).userId;
    const linked = resolveGoogleSignIn(db, 'g-2', phone, fresh);
    assert.equal(linked.outcome, 'linked');
    assert.equal(linked.userId, phone, 'the same traveller gaining a second way in');
  });

  test('two travellers who both have a history are a clash, and nothing is written', () => {
    const db = openDb(':memory:');
    const owner = registerDevice(db).userId;
    resolveGoogleSignIn(db, 'g-3', owner, () => assert.fail('no new traveller'));
    const other = registerDevice(db).userId;
    // A history for both, the same way line-auth.test.ts gives one.
    for (const user of [owner, other]) {
      db.prepare(`INSERT INTO ledger (id, user_id, label, occurred_at, host, amount, kind, currency, source_ref)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(`l-${user}`, user, 'Checked in', new Date().toISOString(), 'test', 10, 'checkin', 'trip', `ref-${user}`);
    }
    const clash = resolveGoogleSignIn(db, 'g-3', other, () => assert.fail('no new traveller'));
    assert.equal(clash.outcome, 'clash');
    assert.equal(clash.userId, null);
    assert.equal(userForGoogleSub(db, 'g-3'), owner, 'still bound to the first traveller');
  });
});
