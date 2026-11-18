import { strict as assert } from 'node:assert';
import { afterEach, test } from 'node:test';

/*
  The two Google routes, end to end through the app: the redirect out, the
  callback, and the link code it leaves being claimed by /account/claim.
  Google itself is a stub on globalThis.fetch; config is read from the
  environment on every request, so each test sets or clears it.
*/
process.env.CHIVAGO_DB = ':memory:';
const { app, db } = await import('./server-node.ts');

const CLIENT_ID = 'client-under-test.apps.googleusercontent.com';
const configure = () => Object.assign(process.env, {
  CHIVAGO_GOOGLE_CLIENT_ID: CLIENT_ID,
  CHIVAGO_GOOGLE_CLIENT_SECRET: 'secret-under-test',
  CHIVAGO_PUBLIC_URL: 'https://chivargo.com',
});
const realFetch = globalThis.fetch;
afterEach(() => {
  delete process.env.CHIVAGO_GOOGLE_CLIENT_ID;
  delete process.env.CHIVAGO_GOOGLE_CLIENT_SECRET;
  globalThis.fetch = realFetch;
});

const b64u = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
const jwt = (payload: Record<string, unknown>) => [b64u({ alg: 'RS256' }), b64u(payload), 'sig'].join('.');

/** Start a round and return what the browser would carry back. */
async function startRound() {
  const res = await app.request('/auth/google?next=/');
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
  const [state, nonce] = decodeURIComponent(cookie.split('=').slice(1).join('=')).split('|');
  return { res, cookie, state: state!, nonce: nonce! };
}

/** Google's token endpoint, answering with an id_token for `sub`. */
function googleAnswers(sub: string, nonce: string, status = 200) {
  globalThis.fetch = (async (url: Parameters<typeof fetch>[0]) => {
    assert.equal(String(url), 'https://oauth2.googleapis.com/token', 'the only call the callback makes');
    if (status !== 200) return new Response('{"error":"invalid_client"}', { status });
    const exp = Math.floor(Date.now() / 1000) + 3600;
    return new Response(JSON.stringify({ id_token: jwt({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub, exp, nonce }) }));
  }) as typeof fetch;
}

test('not set up: the button comes back to the app with a reason instead of a JSON error page', async () => {
  const res = await app.request('/auth/google?next=/');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/#google=unavailable');
});

test('set up: the browser goes to Google with a state cookie scoped to these two routes', async () => {
  configure();
  const { res, cookie } = await startRound();
  assert.equal(res.status, 302);
  const to = new URL(res.headers.get('location')!);
  assert.equal(to.host, 'accounts.google.com');
  assert.equal(to.searchParams.get('redirect_uri'), 'https://chivargo.com/auth/google/callback');
  assert.equal(to.searchParams.get('scope'), 'openid');
  assert.ok(cookie.startsWith('chivago_google_oauth='));
  const attrs = res.headers.get('set-cookie')!;
  for (const a of ['Path=/auth/google', 'HttpOnly', 'Secure', 'SameSite=Lax']) assert.ok(attrs.includes(a), a);
});

test('an off-site next is refused: an open redirect on a login route is a phishing kit', async () => {
  configure();
  for (const next of ['//evil.example', 'https://evil.example']) {
    const res = await app.request(`/auth/google?next=${encodeURIComponent(next)}`);
    const cookie = decodeURIComponent((res.headers.get('set-cookie') ?? '').split(';')[0]!.split('=').slice(1).join('='));
    assert.equal(cookie.split('|')[2], '/', next);
  }
});

test('a callback with no round, or a cancelled one, says which', async () => {
  configure();
  assert.equal((await app.request('/auth/google/callback?code=c&state=s')).headers.get('location'), '/#google=expired');
  const { cookie } = await startRound();
  const cancelled = await app.request('/auth/google/callback?error=access_denied', { headers: { cookie } });
  assert.equal(cancelled.headers.get('location'), '/#google=cancelled');
});

test('a full sign-in creates a traveller, and the code it leaves claims a device key', async () => {
  configure();
  const { cookie, state, nonce } = await startRound();
  googleAnswers('109876543210', nonce);

  const back = await app.request(`/auth/google/callback?code=the-code&state=${encodeURIComponent(state)}`, { headers: { cookie } });
  assert.equal(back.status, 302);
  const m = /^\/#google=ok\.([^.]+)\.created$/.exec(back.headers.get('location') ?? '');
  assert.ok(m, back.headers.get('location') ?? '');

  globalThis.fetch = realFetch;
  const claim = await app.request('/account/claim', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: m![1], label: 'Google' }),
  });
  const body = await claim.json() as { ok: boolean; data: { userId: string; deviceKey: string } };
  assert.equal(claim.status, 200, JSON.stringify(body));
  assert.ok(body.data.deviceKey);

  const bound = db.prepare('SELECT user_id FROM google_identities WHERE google_sub = ?').get('109876543210') as { user_id: string };
  assert.equal(bound.user_id, body.data.userId);
});

test('Google refusing the exchange is a failed sign-in, not a crash', async () => {
  configure();
  const { cookie, state, nonce } = await startRound();
  googleAnswers('unused', nonce, 401);
  const back = await app.request(`/auth/google/callback?code=c&state=${encodeURIComponent(state)}`, { headers: { cookie } });
  assert.equal(back.headers.get('location'), '/#google=failed');
});

test('a state that does not match the cookie is refused before Google is asked anything', async () => {
  configure();
  const { cookie } = await startRound();
  globalThis.fetch = (async () => assert.fail('Google must not be called')) as typeof fetch;
  const back = await app.request('/auth/google/callback?code=c&state=forged', { headers: { cookie } });
  assert.equal(back.headers.get('location'), '/#google=expired');
});
