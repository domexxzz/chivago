/**
 * Signing in with LINE.
 *
 * WHY THIS IS NOT A FOURTH KIND OF ACCOUNT. `users.id` is the anchor of this
 * product: a device key points at one, an email and password point at one, and
 * an 8-digit link code moves one onto a second phone. LINE joins that list as
 * another credential pointing at the SAME row, so a traveller who signs in
 * with LINE on a new phone finds the trip points they already earned rather
 * than an empty wallet.
 *
 * WHAT IT STORES, AND WHAT IT REFUSES TO. Only LINE's `sub` - the opaque user
 * id - and nothing else. Not the display name, not the picture, not the email
 * LINE would hand over for the asking. The rest of this server collects the
 * least personal data it can (see `device_keys`, which does not even require a
 * label) and a login is no reason to start collecting more. The scope asked
 * for is `profile openid` because LINE requires `profile`; the profile is read
 * and thrown away.
 *
 * HOW THE KEY GETS BACK TO THE BROWSER. Not in a query string, which lands in
 * server logs and `Referer` headers. The callback issues an ordinary link code
 * - the same single-use, ten-minute code the "move to a new phone" flow
 * already uses - and puts it in the URL FRAGMENT, which browsers never send to
 * a server. The page claims it through `POST /account/claim`, the one endpoint
 * that already turns a code into a device key, and clears the fragment. No new
 * secret-passing scheme, and nothing to get wrong twice.
 *
 * OFF UNLESS CONFIGURED. With no channel id or secret, `lineConfig()` is null
 * and every route below answers as if LINE login did not exist. A missing
 * secret must never become a half-working sign-in.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';

const AUTHORIZE = 'https://access.line.me/oauth2/v2.1/authorize';
const TOKEN = 'https://api.line.me/oauth2/v2.1/token';
const VERIFY = 'https://api.line.me/oauth2/v2.1/verify';

/** The cookie that carries state and nonce across the round trip to LINE. */
export const LINE_OAUTH_COOKIE = 'chivago_line_oauth';
/** A sign-in that takes longer than this was abandoned. */
export const OAUTH_TTL_MS = 10 * 60_000;
/** LINE is a third party on the open internet: never let it hang a request. */
const TIMEOUT_MS = 6000;

export interface LineConfig {
  channelId: string;
  channelSecret: string;
  /** Must match a Callback URL registered in the LINE Developers Console, exactly. */
  redirectUri: string;
  /** 'aggressive' asks the traveller to add the LINE official account as a friend. */
  botPrompt?: string;
}

/**
 * The channel this deployment signs in with, or null when LINE login is not
 * set up. Trimmed: a secret pasted with a stray newline fails LINE's check and
 * the error it returns says nothing useful.
 */
export function lineConfig(env: NodeJS.ProcessEnv = process.env): LineConfig | null {
  const channelId = env.CHIVAGO_LINE_CHANNEL_ID?.trim();
  const channelSecret = env.CHIVAGO_LINE_CHANNEL_SECRET?.trim();
  const base = env.CHIVAGO_PUBLIC_URL?.trim();
  if (!channelId || !channelSecret || !base) return null;
  let origin: string;
  try {
    const u = new URL(base);
    // A callback this app would not serve is a callback LINE must not be told.
    if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') return null;
    origin = `${u.origin}${u.pathname}`.replace(/\/+$/, '');
  } catch {
    return null;
  }
  return {
    channelId,
    channelSecret,
    redirectUri: `${origin}/auth/line/callback`,
    botPrompt: env.CHIVAGO_LINE_BOT_PROMPT?.trim() || undefined,
  };
}

export const isLineLoginEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => lineConfig(env) !== null;

/** One round trip's secrets. Held in a cookie, never in the database: it is worth ten minutes. */
export interface OauthRound {
  state: string;
  nonce: string;
  /** Where to send the browser once the sign-in finishes. Same origin only. */
  next: string;
}

const token = (): string => randomBytes(24).toString('base64url');

export const startRound = (next: string): OauthRound => ({ state: token(), nonce: token(), next });

/** The cookie's body. Three fields, newline-free, so parsing cannot be tricked by a value. */
export const packRound = (r: OauthRound): string => [r.state, r.nonce, r.next].join('|');

export function unpackRound(raw: string | undefined): OauthRound | null {
  if (!raw) return null;
  const parts = raw.split('|');
  if (parts.length !== 3) return null;
  const [state, nonce, next] = parts as [string, string, string];
  if (!state || !nonce) return null;
  return { state, nonce, next };
}

/** Constant-time, because a state check that leaks its answer by timing is not a check. */
export function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

/**
 * Where to send the browser to sign in.
 *
 * `scope=profile openid` is the minimum LINE accepts for an id_token; nothing
 * from the profile is kept (see the file header).
 */
export function authorizeUrl(cfg: LineConfig, round: OauthRound): string {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.channelId,
    redirect_uri: cfg.redirectUri,
    state: round.state,
    scope: 'profile openid',
    nonce: round.nonce,
  });
  if (cfg.botPrompt) p.set('bot_prompt', cfg.botPrompt);
  return `${AUTHORIZE}?${p.toString()}`;
}

/** A third-party call that cannot be allowed to hang. */
async function post(url: string, body: URLSearchParams, fetchImpl: typeof fetch, timeoutMs: number): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      signal: ctl.signal,
      // 'manual', never 'error': workerd refuses 'error' outright, which made every
      // LINE login throw before the request left. A 3xx has ok === false and is
      // refused by the check below.
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: body.toString(),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`line ${res.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

export interface LineOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * The traveller's LINE user id for this round, or null when the exchange did
 * not produce one this server is willing to trust.
 *
 * Both halves are checked. The code is exchanged for an id_token, and that
 * token is then verified BY LINE against this channel - the documented
 * `/oauth2/v2.1/verify` - rather than decoded here and believed. The nonce
 * that comes back must be the one this round sent, or the token belongs to
 * somebody else's sign-in.
 */
export async function lineSubFor(
  cfg: LineConfig, code: string, round: OauthRound, opts: LineOptions = {},
): Promise<string | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;

  const tokens = await post(TOKEN, new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: cfg.redirectUri,
    client_id: cfg.channelId,
    client_secret: cfg.channelSecret,
  }), fetchImpl, timeoutMs) as { id_token?: unknown };

  const idToken = tokens.id_token;
  if (typeof idToken !== 'string' || idToken.length === 0) return null;

  const claims = await post(VERIFY, new URLSearchParams({
    id_token: idToken,
    client_id: cfg.channelId,
  }), fetchImpl, timeoutMs) as { sub?: unknown; nonce?: unknown; aud?: unknown };

  if (typeof claims.sub !== 'string' || claims.sub.length === 0) return null;
  // LINE checks `aud` itself when given client_id, but a server that reads the
  // answer should still refuse one addressed elsewhere.
  if (claims.aud !== undefined && claims.aud !== cfg.channelId) return null;
  if (typeof claims.nonce !== 'string' || !sameToken(claims.nonce, round.nonce)) return null;
  return claims.sub;
}
