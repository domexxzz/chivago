/**
 * Signing in with Google - the half that talks to Google.
 *
 * READ line-auth.ts FIRST. This is the same round trip: a state and a nonce
 * in a short-lived cookie, a code exchanged server to server, and a link code
 * handed back in the URL fragment for `/account/claim`. The round's helpers
 * (`startRound`, `packRound`, `unpackRound`, `sameToken`) are LINE's, used
 * unchanged, because none of them was ever about LINE.
 *
 * WHAT IS GOOGLE'S OWN, and is therefore here:
 *
 *  - SCOPE `openid` AND NOTHING ELSE. That is enough for a stable subject id,
 *    which is all this server keeps (google_identities holds the `sub`, never
 *    an email, a name or a picture). Under PDPA the least personal data is
 *    the safest amount, and `openid` alone is a non-sensitive scope, so the
 *    consent screen can be published without Google reviewing the app.
 *
 *  - HOW THE id_token IS BELIEVED. LINE offers a verify endpoint and line-auth
 *    uses it. Google's equivalent (tokeninfo) is documented as a debugging aid,
 *    and the alternative is checking an RS256 signature against Google's
 *    rotating keys. Neither is needed here: OpenID Connect Core 3.1.3.7 lets a
 *    client that received the id_token DIRECTLY from the token endpoint over
 *    TLS - which is exactly this exchange, server to server, with our secret -
 *    rely on TLS in place of the signature. What it may NOT skip, and this
 *    does not, is checking the claims: issuer, audience, expiry, and the nonce
 *    this round sent.
 */

import { sameToken, type OauthRound } from './line-auth.ts';

const AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
/** Google writes its issuer both ways, and both are documented as valid. */
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

/** The cookie that carries state and nonce across the round trip to Google. */
export const GOOGLE_OAUTH_COOKIE = 'chivago_google_oauth';
/** Google is a third party on the open internet: never let it hang a request. */
const TIMEOUT_MS = 6000;

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  /** Must match an Authorized redirect URI in the Google Cloud console, exactly. */
  redirectUri: string;
}

/**
 * The client this deployment signs in with, or null when Google sign-in is
 * not set up. Trimmed, for the same reason line-auth trims: a secret pasted
 * with a stray newline fails Google's check with an error that says nothing.
 */
export function googleConfig(env: NodeJS.ProcessEnv = process.env): GoogleConfig | null {
  const clientId = env.CHIVAGO_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.CHIVAGO_GOOGLE_CLIENT_SECRET?.trim();
  const base = env.CHIVAGO_PUBLIC_URL?.trim();
  if (!clientId || !clientSecret || !base) return null;
  let origin: string;
  try {
    const u = new URL(base);
    // A redirect this app would not serve is a redirect Google must not be told.
    if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') return null;
    origin = `${u.origin}${u.pathname}`.replace(/\/+$/, '');
  } catch {
    return null;
  }
  return { clientId, clientSecret, redirectUri: `${origin}/auth/google/callback` };
}

/**
 * Where to send the browser to sign in.
 *
 * `prompt=select_account` because a phone shared by a family is common here,
 * and silently signing in as whoever used Google last on it is the wrong default.
 */
export function googleAuthorizeUrl(cfg: GoogleConfig, round: OauthRound): string {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: 'openid',
    state: round.state,
    nonce: round.nonce,
    prompt: 'select_account',
  });
  return `${AUTHORIZE}?${p.toString()}`;
}

export interface GoogleOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** The clock the expiry is checked against. */
  now?: Date;
}

/** The claims of a JWT, or null when it is not one. The signature is not read: see the header. */
function claimsOf(idToken: string): Record<string, unknown> | null {
  const parts = idToken.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const json = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as unknown;
    return json && typeof json === 'object' && !Array.isArray(json) ? json as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/**
 * The traveller's Google subject id for this round, or null when the exchange
 * did not produce one this server is willing to trust.
 *
 * Throws when Google itself refuses the exchange (a wrong secret, a reused
 * code), so the route logs what Google said - that is how a misconfigured
 * client gets found, as `invalid client_secret` was for LINE.
 */
export async function googleSubFor(
  cfg: GoogleConfig, code: string, round: OauthRound, opts: GoogleOptions = {},
): Promise<string | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? TIMEOUT_MS);
  let tokens: { id_token?: unknown };
  try {
    const res = await fetchImpl(TOKEN, {
      method: 'POST',
      signal: ctl.signal,
      // 'manual', never 'error': workerd refuses 'error' before the request
      // leaves (scripts/edge-fetch.test.mjs). A 3xx has ok === false below.
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: cfg.redirectUri,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      }).toString(),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`google ${res.status}: ${text.slice(0, 200)}`);
    tokens = JSON.parse(text) as { id_token?: unknown };
  } finally {
    clearTimeout(timer);
  }

  if (typeof tokens.id_token !== 'string' || tokens.id_token.length === 0) return null;
  const claims = claimsOf(tokens.id_token);
  if (!claims) return null;

  const nowSec = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  if (typeof claims.iss !== 'string' || !ISSUERS.has(claims.iss)) return null;
  if (claims.aud !== cfg.clientId) return null;
  if (typeof claims.exp !== 'number' || claims.exp <= nowSec) return null;
  // The token must belong to THIS sign-in, not to one replayed from elsewhere.
  if (typeof claims.nonce !== 'string' || !sameToken(claims.nonce, round.nonce)) return null;
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) return null;
  return claims.sub;
}
