/**
 * ChivaGo API.
 *
 * Implements the backend surface the design implies (handoff section 6), with
 * the two rules the prototype could not enforce:
 *   - points, quest stages and the ledger are server-owned;
 *   - a live SOS persists across navigation and app restarts.
 */

import { randomUUID } from 'node:crypto';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  PartyRefused, activePartyFor, createParty, disbandParty, joinParty, leaveParty, membersOf,
} from './party-service.ts';
import {
  LINK_CODE_TTL_MS, LinkCodeRefused, claimLinkCode, devicesFor, issueLinkCode,
  // Aliased: `registerDevice` is already the push-token function next door,
  // and two different registrations under one name is how the wrong one gets
  // called at three in the morning.
  registerDevice as registerAccountDevice, resolveDevice, revokeDevice,
} from './account-service.ts';
import { logger } from 'hono/logger';

import { openDb, row, transact } from './db.ts';
import { BodyTooLarge, boundedForm, fail, handleError, num, ok, userId, type AppEnv } from './http.ts';
import { publicConfig } from './fence.ts';
import { boardFeed, type BoardEntry } from '@chivago/core';
import { reviewsInArea } from './place-review-service.ts';
import {
  getCommunityImpact, getOffer, getPersonalImpact, getProfile,
  getQuest, getScoredPlace, getShield, listOffers, listQuests, listScoredPlaces,
} from './repo.ts';
import { ensureWallet, getWallet, grantOpeningBalance, spendOnVoucher } from './wallet-service.ts';
import { checkedInToday, checkIn } from './checkin-service.ts';
import { exploredFor, recordSelfVisit, selfReportedProvincesFor, selfVisitsFor } from './visit-service.ts';
import { airHistoryFor } from './crowd-service.ts';
import { readStatement, statementsIncluding } from './statement-service.ts';
import {
  STORY_FORM_MAX_BYTES, StoryTooLarge, expireStories, readStoryMedia, storiesAt, storiesInArea, storiesOpen,
  storyEtag, submitStory,
} from './story-service.ts';
import { areaByKey, inArea, isAreaKey } from '@chivago/core';
import { statementMissingPage, verifyPage } from './console/statement.ts';
import { boardPage } from './board.ts';
import { DEFAULT_LOCALE, localeFromAcceptLanguage } from './console/i18n.ts';
import { getQuietPreference, setQuietPreference } from './notification-service.ts';
import {
  appealTakedown, hasVisited, myReviewState, reportedByReader, reportReview,
  reviewsFor, withdrawReview, writeReview,
} from './place-review-service.ts';
import {
  JOIN_REFUSAL, PARTY_DOES_NOT, RANKED_BY, SPECIES_AS_OF, cheapestMonth, collectionSummary, companionsFor, forecastPrice, isRejectionReasonKey, isReportReasonKey, islandDay, outlookAhead, planDay, positionOf, rankHosts, routeBiasFor, smartRoute, statementCsv, statementPdf, summarise, type Fix,
} from '@chivago/core';
import {
  arriveAtQuest, getAllProgress, getProgress, joinQuest, resolveVerification, submitProof,
} from './quest-service.ts';
import { hostStandings, travellerStandings } from './standing-service.ts';
import { medalsFor } from './medal-service.ts';
import { consoleRoutes } from './console/routes.ts';
import {
  UnknownMood, balanceFor, habitatEvidenceFor, latestMood, moodHistory, provinceEvidenceFor, recordMood,
  visitedProvincesFor,
} from './wellness-service.ts';
import {
  disableDevice, dispatch, inbox, InvalidPushToken, markAllRead, markRead,
  registerDevice, unreadCount,
} from './notification-service.ts';
import { expoTransport } from './push/expo.ts';
import {
  activeAlert, addContact, cancelAlert, fireAlert, listContacts,
  publicView, removeContact,
} from './sos-service.ts';
import { recordPositions, type PositionFix, type PositionSource } from './position-service.ts';
import { sosLivePage } from './console/sos-live.ts';
import { sweep } from './escalation-service.ts';
import { sweepOverdue } from './sla-service.ts';
import { webhookTransport } from './push/webhook.ts';
import { hostOwnsQuest, resolveSession, readCookie, SESSION_COOKIE } from './host-auth.ts';
import { MAX_BYTES, MAX_PHOTOS_PER_PROOF, storePhoto, UnsupportedUpload } from './uploads.ts';
import type { Voucher, WellnessProfile } from '@chivago/core';

const db = openDb();
const app = new Hono<AppEnv>();

const push = expoTransport();

/**
 * Send anything queued, without making the caller wait.
 *
 * Fired after a decision so the volunteer hears within seconds, and on a timer
 * so a failed send is retried. Deliberately not awaited by the route that
 * triggered it: a municipal officer's approval must not hang on Expo.
 */
function flushNotifications(): void {
  void dispatch(db, push).catch((err) => {
    // Swallowed on purpose. A dispatcher that throws stops delivering for
    // everybody; the rows stay queued and the next tick tries again.
    console.error('[chivago] notification dispatch failed', err);
  });
}

/**
 * The retry tick. One minute is short enough that a blip clears quickly and
 * long enough that a dead upstream is not hammered.
 */
const DISPATCH_INTERVAL_MS = 60_000;
const dispatchTimer = setInterval(flushNotifications, DISPATCH_INTERVAL_MS);

/**
 * The overdue sweep.
 *
 * Hourly, deliberately slow. It is chasing promises measured in DAYS - a
 * proof unreviewed for 24 hours, an appeal unread for 48 - and running it any
 * faster would burn queries to discover the same nothing.
 *
 * Never flushes. Being told your appeal is still waiting is not urgent enough
 * to jump the dispatch queue, and quiet hours should hold it like anything
 * else.
 */
const SLA_INTERVAL_MS = 3_600_000;
// Seven days on, a story and its files go. Hourly; nobody is waiting on it.
const storyTimer = setInterval(() => {
  try { expireStories(db); } catch (e) { console.error('[chivago] story expiry:', (e as Error).message); }
}, 3_600_000);
storyTimer.unref();

const slaTimer = setInterval(() => {
  try {
    const summary = sweepOverdue(db);
    if (summary.proofsChased + summary.appealsChased > 0) {
      console.warn(
        `[chivago] overdue: ${summary.proofsChased} proofs, ${summary.appealsChased} appeals`,
      );
    }
  } catch (err) {
    // Swallowed like the escalation sweep: a throw here must not stop the
    // process, and the worst case is that somebody is told late twice.
    console.error('[chivago] overdue sweep failed', err);
  }
}, SLA_INTERVAL_MS);
// Never hold the process open just to run the notification loop.
dispatchTimer.unref?.();
slaTimer.unref?.();

const oncall = webhookTransport();

/**
 * The escalation sweep.
 *
 * Every 30 seconds, faster than the notification retry, because the first rung
 * fires at two minutes and a sweep that ran on the same minute-long clock could
 * turn that into three.
 *
 * A fired rung flushes notifications immediately rather than waiting for the
 * next dispatch tick - the whole value of telling someone "nobody has answered,
 * call 1669" is that it arrives while it still matters.
 */
const ESCALATION_INTERVAL_MS = 30_000;
const escalationTimer = setInterval(() => {
  void sweep(db, oncall)
    .then((summary) => {
      if (summary.rungsFired > 0) {
        for (const o of summary.outcomes) {
          console.warn(`[chivago] SOS escalated ${o.alertId} · ${o.rung} · ${o.detail}`);
        }
        flushNotifications();
      }
    })
    .catch((err) => {
      // Swallowed deliberately. A sweep that throws stops escalating for
      // everybody, and breaking silence is this module's entire job.
      console.error('[chivago] escalation sweep failed', err);
    });
}, ESCALATION_INTERVAL_MS);
escalationTimer.unref?.();

app.use('*', logger());

/**
 * The host console is mounted before everything else.
 *
 * It has its own session auth and must NOT pass through the traveller
 * middleware below, which would provision a mobile user for a municipal
 * reviewer and hand them a wallet.
 */
app.route('/console', consoleRoutes(db, {
  // A console approval should reach the volunteer's phone as fast as the
  // automation path does. Without this it waited for the 60-second ticker.
  afterDecision: () => flushNotifications(),
}));

/**
 * The public live-location page.
 *
 * Mounted OUTSIDE the traveller middleware and outside the console's auth: the
 * reader is a family member who has no account and cannot be asked to make one
 * mid-emergency. The 32-byte token in the URL is the entire credential.
 */
app.get('/sos/live/:token', (c) => {
  const view = publicView(db, c.req.param('token'));
  return c.html(sosLivePage(view), view ? 200 : 404, {
    'cache-control': 'no-store, private',
    'referrer-policy': 'no-referrer',
    'x-robots-tag': 'noindex, nofollow',
    'x-content-type-options': 'nosniff',
  });
});

/*
  The evidence layer's public half (docs/31). A statement is checkable by
  anyone holding its id: no account, no key, no trust in the hotel that filed
  it. The JSON is the canonical record and the page is the same record laid
  out for a person. Both are immutable once issued, hence cacheable - and
  indexable, because a record nobody can find is not evidence.
*/
const publicLocale = (c: { req: { header: (n: string) => string | undefined } }) =>
  localeFromAcceptLanguage(c.req.header('accept-language')) ?? DEFAULT_LOCALE;

app.get('/statements/:id', (c) => {
  const statement = readStatement(db, c.req.param('id'));
  // Any origin. This route is registered before the CORS middleware on
  // purpose (it must not be provisioned as a traveller), which also meant
  // it carried no CORS header at all - so the verify page's promise that
  // "anyone can fetch this and recompute the digest" was false from a
  // browser on any other origin. A public, read-only, immutable record has
  // nothing to protect from a cross-origin read.
  c.header('access-control-allow-origin', '*');
  if (!statement) return fail(c, 'NO_STATEMENT', 'No statement has that id.', 404);
  c.header('cache-control', 'public, max-age=300');
  return ok(c, statement);
});

/**
 * The same record as a file. CSV for a spreadsheet, PDF for a filing
 * cabinet; both carry the id, the digest and the verify URL, so a forwarded
 * copy still points home. Public and immutable, like the JSON.
 */
app.get('/statements/:id/csv', (c) => {
  const statement = readStatement(db, c.req.param('id'));
  c.header('access-control-allow-origin', '*');
  if (!statement) return fail(c, 'NO_STATEMENT', 'No statement has that id.', 404);
  c.header('cache-control', 'public, max-age=300');
  c.header('content-type', 'text/csv; charset=utf-8');
  c.header('content-disposition', `attachment; filename="${statement.id}.csv"`);
  return c.body(statementCsv(statement, new URL(c.req.url).origin));
});

app.get('/statements/:id/pdf', (c) => {
  const statement = readStatement(db, c.req.param('id'));
  c.header('access-control-allow-origin', '*');
  if (!statement) return fail(c, 'NO_STATEMENT', 'No statement has that id.', 404);
  c.header('cache-control', 'public, max-age=300');
  c.header('content-type', 'application/pdf');
  c.header('content-disposition', `inline; filename="${statement.id}.pdf"`);
  // Hono's body wants an ArrayBuffer; the PDF is a fresh Uint8Array over
  // one, so its buffer is exactly the file.
  return c.body(statementPdf(statement, new URL(c.req.url).origin).buffer as ArrayBuffer);
});

/*
  A story's bytes, public once a host approved it and gone a week later.
  Before the traveller middleware for the same reason the statement is: the
  big screen in the room and a browser on somebody's laptop hold no device
  key. Pending and hidden are 404 here; a reviewing host reads pending
  through the console.
*/
for (const which of ['media', 'poster'] as const) {
  app.get(`/stories/:id/${which}`, (c) => {
    const id = c.req.param('id');
    // Registered before the CORS middleware, like the statement, and public
    // for the same reason: a board on a laptop and the app on another origin
    // both read it, and there is nothing in an approved clip to protect.
    c.header('access-control-allow-origin', '*');
    /*
      Revalidated on every play, never served from a cache on its own.
      The first version gave these five minutes of public cache, which meant
      a clip a host had just hidden could go on playing on the board and in
      any browser that held it for up to five minutes - on stage, the one
      place Hide has to be immediate. The bytes are immutable while a story
      is live, so the tag below answers a revalidation with a 304 and no
      bytes, and with a 404 the moment the story is hidden or expired.
    */
    const tag = storyEtag(db, id, which);
    if (!tag) return fail(c, 'NOT_FOUND', 'No such story.', 404);
    const headers = {
      'access-control-allow-origin': '*',
      'cache-control': 'no-cache',
      etag: tag,
      'content-security-policy': "default-src 'none'",
      'x-content-type-options': 'nosniff',
    };
    if (c.req.header('if-none-match') === tag) return c.body(null, 304, headers);
    const blob = readStoryMedia(db, id, which);
    if (!blob) return fail(c, 'NOT_FOUND', 'No such story.', 404);
    return c.body(new Uint8Array(blob.bytes), 200, { ...headers, 'content-type': blob.mime });
  });
}

/** The board itself: the page on the projector (docs/45). */
app.get('/board/:area', (c) => {
  const key = c.req.param('area');
  if (!isAreaKey(key)) return c.text('No such area', 404);
  return c.html(boardPage(areaByKey(key)), 200, { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
});

/** The board's feed: every approved story in an area. Public, for the screen in the room. */
app.get('/areas/:key/stories', (c) => {
  c.header('access-control-allow-origin', '*');
  c.header('cache-control', 'no-store');
  return ok(c, { open: storiesOpen(db), stories: storiesInArea(db, c.req.param('key')) });
});

/**
 * The board's feed for the app: everything an area has, newest first.
 *
 * Public and cross-origin like the projector's feed, because it is the same
 * material and the same rule - approved stories only - and because the app
 * draws it on Home before anybody has signed in.
 *
 * Two queries and one merge rather than a union in SQL: the two rows have
 * nothing in common but a timestamp and a place, and a SELECT that pretended
 * otherwise would need a column of nulls per side. See packages/core/board.ts.
 */
app.get('/areas/:key/board', (c) => {
  c.header('access-control-allow-origin', '*');
  c.header('cache-control', 'no-store');
  const key = c.req.param('key');
  const stories: BoardEntry[] = storiesInArea(db, key).map((s) => ({
    kind: 'story',
    id: s.id,
    at: s.createdAt,
    placeId: s.placeId,
    placeName: s.placeName,
    media: s.kind === 'video' ? 'video' : 'photo',
    caption: s.caption,
    mediaUrl: s.media,
    posterUrl: s.poster,
  }));
  const reviews: BoardEntry[] = reviewsInArea(db, key).map((r) => ({
    kind: 'review',
    id: r.id,
    at: r.createdAt,
    placeId: r.placeId,
    placeName: r.placeName,
    rating: r.rating,
    body: r.body,
    authorName: r.authorName,
    language: r.language,
  }));
  return ok(c, { open: storiesOpen(db), entries: boardFeed([...stories, ...reviews]) });
});

app.get('/verify/:id', (c) => {
  const id = c.req.param('id');
  const statement = readStatement(db, id);
  const origin = new URL(c.req.url).origin;
  return c.html(
    statement ? verifyPage(publicLocale(c), statement, origin) : statementMissingPage(publicLocale(c), id),
    statement ? 200 : 404,
    { 'x-content-type-options': 'nosniff' },
  );
});
// The mobile client is not a browser origin, but the host console and the
// Expo web target are. Locked to explicit origins in production.
app.use('*', cors({ origin: process.env.CHIVAGO_ORIGINS?.split(',') ?? '*' }));

/**
 * Is the old unauthenticated header path still open?
 *
 * It closes BY ITSELF the moment the first device registers, which is the
 * whole point: an env var somebody has to remember to flip before launch is an
 * env var that ships unflipped. While the database holds no accounts there is
 * nobody to impersonate, so the pilot's header identity is harmless; the
 * instant a real account exists it becomes a way to read that person's wallet,
 * moods and emergency contacts, and it stops working in the same instant.
 *
 * `CHIVAGO_OPEN_IDENTITY=1` forces it open for the demo capture scripts and
 * the contract tests, which drive the API by user id and have no keychain.
 */
function openIdentityAllowed(): boolean {
  if (process.env.CHIVAGO_OPEN_IDENTITY === '1') return true;
  return db.prepare('SELECT 1 FROM device_keys LIMIT 1').get() === undefined;
}

/**
 * Authenticate, then provision.
 *
 * A device key is checked BEFORE the header is read, and a key that does not
 * resolve is refused outright rather than falling back — a fallback would mean
 * a revoked phone silently kept working by dropping its own credential.
 */
/**
 * What needs no traveller.
 *
 * The console and the public live-location page authenticate themselves; a
 * statement, a story's media, an area's feed and the board are public by
 * design. And the web app's own files and the health check, which the first
 * real account must never lock: on the evening of 7 September, the instant
 * the first phone registered on chivago.fly.dev, every font, the stylesheet,
 * the favicon and /health answered 401, the app sat on LOADING for everyone
 * after, and Fly's health check took the machine out of rotation. Nothing in
 * the tests had asked for a font after registering.
 */
const PUBLIC_PREFIXES = [
  '/console', '/sos/live/', '/verify/', '/statements/', '/stories/', '/areas/', '/board/',
  '/_expo/', '/assets/',
];
const PUBLIC_PATHS = new Set(['/', '/index.html', '/favicon.ico', '/metadata.json', '/health', '/config']);
const isPublicPath = (path: string): boolean =>
  PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p));

app.use('*', async (c, next) => {
  // None of these should be handed a traveller account and a wallet.
  if (isPublicPath(c.req.path)) return next();

  const key = c.req.header('x-chivago-device-key');
  if (key !== undefined) {
    const resolved = resolveDevice(db, key);
    if (resolved === null) {
      return fail(c, 'UNAUTHENTICATED', 'This device is not signed in.', 401);
    }
    c.set('userId', resolved);
  } else if (!c.req.path.startsWith('/devices') && !c.req.path.startsWith('/account/claim')
             && !openIdentityAllowed()) {
    // Registering and claiming are how a device GETS a key, so they cannot
    // require one. Everything else must now prove who it is.
    return fail(c, 'UNAUTHENTICATED', 'Sign in on this device to continue.', 401);
  }

  const id = userId(c);
  db.prepare('INSERT OR IGNORE INTO users (id, display_name, created_at) VALUES (?,?,?)').run(
    id, 'Traveller', new Date().toISOString());
  ensureWallet(db, id);
  grantOpeningBalance(db, id);
  await next();
});

app.onError((err, c) => handleError(c, err));

app.get('/health', (c) => ok(c, { status: 'up', time: new Date().toISOString() }));

// ---------------------------------------------------------------------------
// Accounts
//
// No password and no email anywhere below. A device is handed a random key
// once, and a person moves their account to a second phone by reading eight
// characters off the first. The least personal data is the safest amount, and
// a credential that was never collected cannot leak.
// ---------------------------------------------------------------------------

/**
 * How many registrations one address may make per rolling hour.
 *
 * An opening balance is real money the moment a marketplace accepts it, and
 * the first version of this route granted one to anybody who asked, as often
 * as they asked: minting accounts was minting vouchers. The limit is per
 * client address because that is the only handle an unauthenticated request
 * has. It is generous - a family registering four phones on one hotel wifi
 * fits with room to spare - and a script does not.
 */
/**
 * How many new accounts one address may open in an hour. ZERO MEANS NO LIMIT.
 *
 * Read at call time rather than at import, so a deployment can change it
 * without a rebuild and so a test can set it either way.
 *
 * Zero is the right setting for an event, and only there. A hundred people
 * on one hall's wifi share one address, so any per-address limit refuses the
 * back half of the room - which at a pitch looks exactly like the app being
 * broken. It is safe to turn off HERE because the opening balance on this
 * deployment is zero (fly.toml), so minting an account mints nothing; on a
 * deployment that hands out points, a script minting accounts is a script
 * minting vouchers and this must stay switched on.
 */
const registrationsPerHour = (): number => {
  const raw = Number(process.env.CHIVAGO_REGISTRATIONS_PER_HOUR ?? 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : 10;
};
const REGISTRATION_WINDOW_MS = 60 * 60 * 1000;
const registrations = new Map<string, number[]>();

function clientAddress(c: { req: { header: (n: string) => string | undefined } }): string {
  // Fly and every reverse proxy set this; the first hop is the client.
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return c.req.header('x-real-ip') ?? 'local';
}

/** True if this address may register now; records the attempt if so. */
export function allowRegistration(address: string, now = Date.now()): boolean {
  const limit = registrationsPerHour();
  // No limit at all, and nothing recorded either: a room of five hundred
  // people would otherwise fill a map with timestamps nobody reads.
  if (limit === 0) return true;
  const recent = (registrations.get(address) ?? []).filter((t) => now - t < REGISTRATION_WINDOW_MS);
  if (recent.length >= limit) {
    registrations.set(address, recent);
    return false;
  }
  recent.push(now);
  registrations.set(address, recent);
  return true;
}

/** Test seam: forget every address. */
export const __resetRegistrationsForTests = (): void => { registrations.clear(); };

/**
 * A new traveller on a new phone.
 *
 * Unauthenticated by necessity: this is how a device gets its first key.
 * Rate-limited per address (above), because it hands out an opening balance
 * and "a script can mint accounts" turned out to mean "a script can mint
 * vouchers". The limit is a speed bump, not a wall: a pool of addresses
 * defeats it, and the production answer is `CHIVAGO_OPENING_GREEN=0` and
 * `CHIVAGO_OPENING_TRIP=0` in the deployment, which fly.toml now sets.
 */
app.post('/devices', async (c) => {
  if (!allowRegistration(clientAddress(c))) {
    return fail(c, 'TOO_MANY_REGISTRATIONS', 'Too many new accounts from this connection. Try again in an hour.', 429);
  }
  const body = await c.req.json<{ displayName?: string; label?: string; locale?: string }>()
    .catch(() => ({} as { displayName?: string; label?: string; locale?: string }));

  const created = registerAccountDevice(db, {
    displayName: body.displayName?.trim() || undefined,
    label: body.label?.trim() || undefined,
    locale: body.locale === 'th' ? 'th' : 'en',
  });
  ensureWallet(db, created.userId);
  grantOpeningBalance(db, created.userId);

  // The key is returned HERE and never again. Only its hash is stored.
  return ok(c, created);
});

/** Who this device is signed in as, and which phones share the account. */
app.get('/account', (c) => ok(c, {
  userId: userId(c),
  devices: devicesFor(db, userId(c), c.req.header('x-chivago-device-key')),
}));

/**
 * A code to put this account on another phone.
 *
 * Ten minutes, single use, and issuing a new one kills the old — so a person
 * tapping the button four times leaves one live credential, not four.
 */
app.post('/account/link-code', (c) => {
  const code = issueLinkCode(db, userId(c));
  return ok(c, { code, expiresInMs: LINK_CODE_TTL_MS });
});

/**
 * Join this device to the account that issued the code.
 *
 * Unauthenticated, like registration, because the new phone has no key yet —
 * the CODE is the credential, which is why it is short-lived and single use.
 */
app.post('/account/claim', async (c) => {
  const body = await c.req.json<{ code?: string; label?: string }>()
    .catch(() => ({} as { code?: string; label?: string }));
  if (!body.code) return fail(c, 'CODE_REQUIRED', 'Enter the code shown on your other phone.');

  try {
    return ok(c, claimLinkCode(db, body.code, { label: body.label?.trim() || undefined }));
  } catch (err) {
    if (err instanceof LinkCodeRefused) {
      // Three different sentences, because they need three different actions.
      const said = {
        unknown: 'That code is not one of ours. Check the characters and try again.',
        expired: 'That code has expired. Ask your other phone for a new one.',
        used: 'That code has already been used. Ask your other phone for a new one.',
      }[err.reason];
      return fail(c, `LINK_${err.reason.toUpperCase()}`, said, 400);
    }
    throw err;
  }
});

/** Stop trusting a phone. Revoked rather than deleted, so the record survives. */
app.post('/account/devices/revoke', async (c) => {
  const body = await c.req.json<{ label?: string }>()
    .catch(() => ({} as { label?: string }));
  if (!body.label) return fail(c, 'LABEL_REQUIRED', 'Which phone should be removed?');
  const removed = revokeDevice(db, userId(c), body.label);
  if (removed === 0) return fail(c, 'NO_SUCH_DEVICE', 'No phone by that name is on this account.', 404);
  return ok(c, { removed });
});

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

app.get('/profile', (c) => ok(c, getProfile(db, userId(c))));

/**
 * Save the wellness profile.
 *
 * PDPA: consent is recorded WITH the notice version, so we can later prove what
 * the user actually agreed to - not merely that a box was ticked.
 */
app.put('/profile', async (c) => {
  const id = userId(c);
  const raw = (await c.req.json().catch(() => null)) as unknown;
  if (!raw || typeof raw !== 'object') return fail(c, 'INVALID_PROFILE', 'A profile is an object.');
  const body = raw as Partial<WellnessProfile> & { consentVersion?: unknown };
  const isStringList = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((x) => typeof x === 'string');
  if (body.purposes !== undefined && !isStringList(body.purposes)) {
    return fail(c, 'INVALID_PROFILE', 'purposes must be a list of keys.');
  }
  if (body.watch !== undefined && !isStringList(body.watch)) {
    return fail(c, 'INVALID_PROFILE', 'watch must be a list of keys.');
  }
  if (body.activity !== undefined && body.activity !== null && typeof body.activity !== 'string') {
    return fail(c, 'INVALID_PROFILE', 'activity must be a key or null.');
  }
  if (body.consentVersion !== undefined && typeof body.consentVersion !== 'string') {
    return fail(c, 'INVALID_PROFILE', 'consentVersion must be a string.');
  }
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO profiles (user_id, purposes, activity, watch, completed_at, consent_version, consented_at)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET
       purposes = excluded.purposes, activity = excluded.activity, watch = excluded.watch,
       completed_at = excluded.completed_at, consent_version = excluded.consent_version,
       consented_at = excluded.consented_at`,
  ).run(
    id,
    JSON.stringify(body.purposes ?? []),
    body.activity ?? null,
    JSON.stringify(body.watch ?? []),
    now,
    body.consentVersion ?? null,
    body.consentVersion ? now : null,
  );
  return ok(c, getProfile(db, id));
});

/** PDPA right to erasure. Deleting the user cascades to every table. */
app.delete('/profile', (c) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(userId(c));
  return ok(c, { deleted: true });
});

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

app.get('/places', async (c) => {
  const q = c.req.query();
  const bbox = q.bbox
    ? (() => {
        const [minLng, minLat, maxLng, maxLat] = q.bbox!.split(',').map(Number);
        return { minLat: minLat!, maxLat: maxLat!, minLng: minLng!, maxLng: maxLng! };
      })()
    : undefined;
  const places = await listScoredPlaces(db, userId(c), bbox);
  return ok(c, places, { total: places.length });
});

/**
 * The air over a place, by island day, as this server recorded it. Starts
 * the day recording started and says so; nothing is invented backwards.
 */
app.get('/places/:id/history', (c) => {
  const place = row<{ lat: number; lng: number }>(db.prepare('SELECT lat, lng FROM places WHERE id = ?').get(c.req.param('id')));
  if (!place) return fail(c, 'NOT_FOUND', 'No such place', 404);
  return ok(c, airHistoryFor(db, place.lat, place.lng));
});

app.get('/places/:id', async (c) => {
  const place = await getScoredPlace(db, userId(c), c.req.param('id'));
  return place ? ok(c, place) : fail(c, 'NOT_FOUND', 'No such place', 404);
});

/**
 * Check in at a place. Awards Trip Points, once per place per island day.
 *
 * Returns 200 with `awarded: false` when they are here but already checked in
 * today. That is not an error - coming back to a beach you like is the
 * behaviour the product wants, and answering it in red would be a rebuke.
 */
app.post('/places/:id/checkin', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    lat?: number; lng?: number; accuracyM?: number | null; mocked?: boolean;
  };
  if (typeof body.lat !== 'number' || typeof body.lng !== 'number') {
    return fail(c, 'BAD_REQUEST', 'lat and lng are required');
  }
  // The whole fix, not just the point: the second signal (docs/30) reads
  // accuracy and the mock flag, and a route that dropped them would leave
  // the service checking nothing. Caught live, not by the unit tests.
  const result = checkIn(db, {
    userId: userId(c), placeId: c.req.param('id'),
    ...readFix({ lat: body.lat, lng: body.lng, accuracyM: body.accuracyM, mocked: body.mocked }),
  });
  return result ? ok(c, result) : fail(c, 'NOT_FOUND', 'No such place', 404);
});

/** Places already checked in today, so the app can show the state on return. */
app.get('/checkins/today', (c) => ok(c, checkedInToday(db, userId(c))));

/**
 * What the app needs to describe itself honestly, before anybody signs in.
 *
 * Public on purpose: the band that says presence is not being checked has to
 * be drawn on the first screen, and the first screen is drawn before a device
 * has a key. See fence.ts for why the app is REQUIRED to draw it.
 */
app.get('/config', (c) => ok(c, publicConfig()));

/**
 * A visit the phone could not prove. Recorded, not scored - see
 * packages/core/src/visits.ts. It pays nothing and unlocks nothing; the
 * passport shows it as what it is. The one refusal is the year's quota,
 * mapped in http.ts with every other domain error.
 */
app.post('/places/:id/visits', (c) => {
  const result = recordSelfVisit(db, { userId: userId(c), placeId: c.req.param('id') });
  return result ? ok(c, result) : fail(c, 'NOT_FOUND', 'No such place', 404);
});

/** The traveller's self-issued stamps, so the place screen can say so on return. */
app.get('/visits/self', (c) => ok(c, selfVisitsFor(db, userId(c))));

/**
 * Where this traveller has been - check-ins from the ledger, stamps from
 * their own word - so the map can lift its mist from the places they have
 * actually reached. Read-only and derived; nothing writes here.
 */
app.get('/explored', (c) => ok(c, exploredFor(db, userId(c))));

/**
 * Medals, for going to places. Computed here from the check-ins, never on
 * the phone - the phone compares two of these answers to know what a
 * check-in just finished, and that is the whole of its arithmetic.
 */
app.get('/medals', (c) => ok(c, medalsFor(db, userId(c))));

// ---------------------------------------------------------------------------
// Reviews
//
// The whole list is verified, because writeReview refuses anyone who has not
// checked in. There is no unverified review in the table to filter out.
// ---------------------------------------------------------------------------

app.get('/places/:id/reviews', (c) => {
  const placeId = c.req.param('id');
  const reviews = reviewsFor(db, placeId);
  return ok(
    c,
    {
      reviews,
      // The AUTHOR sees their own review even when it is hidden, plus why and
      // what they can do about it. A review that silently vanishes from your
      // own screen is the worst version of this.
      mine: myReviewState(db, userId(c), placeId),
      // EVER, not today. The check-in that unlocks a review does not expire.
      canReview: hasVisited(db, userId(c), placeId),
      // So the app can mark what this reader has already flagged rather than
      // letting them press it again and be told off.
      reported: reportedByReader(db, userId(c), placeId),
    },
    { total: reviews.length },
  );
});

/**
 * Write or update your review. Idempotent per (place, user) by construction:
 * the row is unique on that pair, so a retry edits rather than duplicates.
 */
app.post('/places/:id/reviews', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    rating?: unknown; body?: unknown; language?: unknown;
  };
  // A body that is not text is a client bug, and a 400 says so; the first
  // version let an object through to `.trim()` and answered 500.
  if (body.body !== undefined && body.body !== null && typeof body.body !== 'string') {
    return fail(c, 'INVALID_BODY', 'A review body is text.');
  }
  const result = writeReview(db, {
    userId: userId(c),
    placeId: c.req.param('id'),
    rating: Number(body.rating),
    body: typeof body.body === 'string' ? body.body : null,
    language: typeof body.language === 'string' ? body.language.slice(0, 16) : undefined,
  });
  return ok(c, result);
});

app.delete('/places/:id/reviews', (c) => {
  const removed = withdrawReview(db, userId(c), c.req.param('id'));
  return ok(c, { removed });
});

/**
 * Report a review.
 *
 * Open to ANY reader, checked in or not: the person most likely to spot a
 * review naming their child is a local reading it, not a tourist who happened
 * to be on that beach.
 *
 * This hides NOTHING. It puts the review in front of a moderator. No count in
 * the system trips a switch, which is what stops a coordinated pile-on being a
 * censorship tool.
 */
app.post('/reviews/:id/report', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { reason?: unknown; note?: unknown };
  if (!isReportReasonKey(body.reason)) {
    return fail(c, 'INVALID_REASON', 'Pick a reason for the report.');
  }
  if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') {
    return fail(c, 'INVALID_NOTE', 'A note is text.');
  }
  const report = reportReview(db, {
    reviewId: c.req.param('id'),
    reporterId: userId(c),
    reasonKey: body.reason,
    note: typeof body.note === 'string' ? body.note : null,
  });
  return report ? ok(c, report) : fail(c, 'NOT_FOUND', 'No such review', 404);
});

/**
 * Appeal a take-down.
 *
 * The other direction of the accountability. We tell an author their words
 * came down; this is how they answer.
 */
app.post('/reviews/:id/appeal', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { message?: unknown };
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (message.length < 10) {
    return fail(c, 'APPEAL_TOO_SHORT', 'Tell the moderator what you think they got wrong.');
  }
  const appeal = appealTakedown(db, {
    reviewId: c.req.param('id'),
    authorId: userId(c),
    message,
  });
  return ok(c, appeal);
});

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------

app.get('/quests', (c) => {
  const filter = c.req.query('filter');
  const kind = filter === 'today' || filter === 'weekend' ? filter : undefined;
  const quests = listQuests(db, kind);
  // Progress ships with the list so the quest rows can show "in progress"
  // without an N+1 of per-quest lookups.
  return ok(c, { quests, progress: getAllProgress(db, userId(c)) }, { total: quests.length });
});

app.get('/quests/:id', (c) => {
  const quest = getQuest(db, c.req.param('id'));
  if (!quest) return fail(c, 'NOT_FOUND', 'No such quest', 404);
  return ok(c, { quest, progress: getProgress(db, userId(c), quest.id) });
});

app.post('/quests/:id/join', (c) =>
  ok(c, joinQuest(db, userId(c), c.req.param('id'))));

/**
 * The fix a client sends, with the two fields the second signal reads. A
 * client that sends neither is an older one and is still accepted.
 */
function readFix(body: { lat: number; lng: number; accuracyM?: number | null; mocked?: boolean }): Fix {
  return {
    lat: body.lat,
    lng: body.lng,
    accuracyM: typeof body.accuracyM === 'number' ? body.accuracyM : null,
    mocked: body.mocked === true,
  };
}

/** Arrival is geofence-verified, not taken on trust. */
app.post('/quests/:id/arrive', async (c) => {
  const body = (await c.req.json()) as { lat?: number; lng?: number; accuracyM?: number | null; mocked?: boolean };
  if (typeof body.lat !== 'number' || typeof body.lng !== 'number') {
    return fail(c, 'LOCATION_REQUIRED', 'Your location is needed to check in at the site.');
  }
  return ok(c, arriveAtQuest(db, userId(c), c.req.param('id'),
    readFix({ lat: body.lat, lng: body.lng, accuracyM: body.accuracyM, mocked: body.mocked })));
});

/**
 * Submit proof. Returns immediately with the quest in `host_verification` -
 * review can legitimately take up to 24h, so the client must not block.
 */
app.post('/quests/:id/proof', async (c) => {
  const id = userId(c);
  const questId = c.req.param('id');
  const contentType = c.req.header('content-type') ?? '';

  // Two shapes accepted:
  //  - multipart/form-data with real image files (what the app sends), so the
  //    host console has something a reviewer can actually look at;
  //  - JSON metadata only, kept for tests and for a client that has already
  //    uploaded out of band.
  if (contentType.includes('multipart/form-data')) {
    // Read with a ceiling - three photos at the photo limit, plus the form
    // around them - so an oversize is refused before it is in memory.
    const form = await boundedForm(c, MAX_PHOTOS_PER_PROOF * MAX_BYTES + 64 * 1024);
    const files = form.getAll('photo').filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return fail(c, 'PHOTO_REQUIRED', 'At least one photo is needed as proof.');
    }
    if (files.length > MAX_PHOTOS_PER_PROOF) {
      return fail(c, 'TOO_MANY_PHOTOS', `At most ${MAX_PHOTOS_PER_PROOF} photos.`);
    }

    // EXIF is read on the device, where the original file still has it, and
    // sent alongside. Re-encoding on the phone routinely strips it.
    let meta: { lat: number | null; lng: number | null; takenAt: string | null }[];
    try {
      const parsed: unknown = JSON.parse(String(form.get('meta') ?? '[]'));
      if (!Array.isArray(parsed)) throw new Error('meta is not a list');
      meta = parsed.map((m: unknown) => {
        const o = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
        return {
          lat: typeof o.lat === 'number' ? o.lat : null,
          lng: typeof o.lng === 'number' ? o.lng : null,
          takenAt: typeof o.takenAt === 'string' ? o.takenAt : null,
        };
      });
    } catch {
      // Malformed metadata is the client's mistake and gets a 400 that names
      // it, not the 500 the first version answered with.
      return fail(c, 'INVALID_META', 'Photo metadata must be a JSON list of {lat, lng, takenAt}.');
    }
    const weightRaw = form.get('weightKg');
    const weightKg = typeof weightRaw === 'string' && weightRaw ? Number(weightRaw) : null;

    // Where the volunteer is now - the second in-fence sample. Required:
    // a shape without it would be the weaker path a tampered client picks.
    const position = parsePosition(form.get('position'));
    if (!position) return fail(c, 'LOCATION_REQUIRED', 'Your location is needed to submit proof.');

    // The state machine runs first: an invalid transition must not leave
    // orphaned files on disk.
    const result = submitProof(db, id, questId, {
      photos: files.map((f, i) => ({
        uri: f.name,
        lat: meta[i]?.lat ?? null,
        lng: meta[i]?.lng ?? null,
        takenAt: meta[i]?.takenAt ?? null,
      })),
      weightKg: Number.isFinite(weightKg) ? weightKg : null,
      position,
    });

    try {
      for (const [i, file] of files.entries()) {
        storePhoto(db, {
          proofId: result.proofId,
          bytes: Buffer.from(await file.arrayBuffer()),
          lat: meta[i]?.lat ?? null,
          lng: meta[i]?.lng ?? null,
          takenAt: meta[i]?.takenAt ?? null,
        });
      }
    } catch (err) {
      if (err instanceof UnsupportedUpload) {
        return fail(c, 'UNSUPPORTED_UPLOAD', err.message, 415);
      }
      throw err;
    }

    return ok(c, result);
  }

  const body = (await c.req.json()) as {
    photos?: { uri: string; lat: number | null; lng: number | null; takenAt: string | null }[];
    weightKg?: number | null;
    position?: unknown;
  };
  const position = parsePosition(body.position);
  if (!position) return fail(c, 'LOCATION_REQUIRED', 'Your location is needed to submit proof.');
  return ok(
    c,
    submitProof(db, id, questId, {
      photos: body.photos ?? [],
      weightKg: body.weightKg ?? null,
      position,
    }),
  );
});

/** A position from a form field (JSON string) or a JSON body. Null when absent or malformed. */
function parsePosition(raw: unknown): Fix | null {
  let v: unknown = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return null; } }
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.lat !== 'number' || typeof o.lng !== 'number') return null;
  return readFix({ lat: o.lat, lng: o.lng, accuracyM: typeof o.accuracyM === 'number' ? o.accuracyM : null, mocked: o.mocked === true });
}

/**
 * The host's verification decision.
 *
 * THE ONLY ENDPOINT THAT AWARDS POINTS. Guarded by a shared secret rather than
 * the user header, because the caller is the host console, not the traveller.
 * Replace with signed webhooks or mTLS before public launch.
 */
app.post('/internal/verify', async (c) => {
  const secret = process.env.CHIVAGO_HOST_SECRET;
  if (!secret || c.req.header('x-host-secret') !== secret) {
    return fail(c, 'FORBIDDEN', 'Host credentials required', 403);
  }
  const body = (await c.req.json()) as {
    userId: string; questId: string; proofId: string; approved: boolean;
    reason?: string; hostId?: string;
  };

  // Scope the machine path the same way the console is scoped. The shared
  // secret is an operator credential, not a licence to approve another host's
  // work - callers MUST name the host they are acting for. The first version
  // only checked the host when one was given, so omitting it was a way round
  // the check; the comment above it said "must" and the code said "may".
  if (typeof body.hostId !== 'string' || !body.hostId) {
    return fail(c, 'HOST_REQUIRED', 'Name the host you are acting for.', 400);
  }
  if (!hostOwnsQuest(db, body.hostId, body.questId)) {
    return fail(c, 'FORBIDDEN', 'That quest belongs to another host', 403);
  }
  if (body.reason !== undefined && !isRejectionReasonKey(body.reason)) {
    return fail(c, 'INVALID_REASON', 'Not a rejection reason this app knows.', 400);
  }

  const result = resolveVerification(db, { ...body, reviewedBy: body.hostId });
  flushNotifications();
  return ok(c, result);
});

// ---------------------------------------------------------------------------
// Wallet + marketplace
// ---------------------------------------------------------------------------

app.get('/wallet', (c) => ok(c, getWallet(db, userId(c))));

app.get('/offers', (c) => {
  const offers = listOffers(db);
  return ok(c, offers, { total: offers.length });
});

/**
 * Redeem an offer.
 *
 * Handoff open question 4, resolved: this issues a real voucher (code, expiry,
 * merchant settlement record), debits inside one transaction with its ledger
 * row, and returns the voucher for the app to display as a QR.
 */
app.post('/offers/:id/redeem', (c) => {
  const id = userId(c);
  const offer = getOffer(db, c.req.param('id'));
  if (!offer) return fail(c, 'NOT_FOUND', 'No such offer', 404);
  if (!offer.available) return fail(c, 'UNAVAILABLE', 'This offer is not currently available');

  const voucherId = randomUUID();
  const now = new Date();
  // 30 days is long enough for a two-week holiday plus a change of plan, short
  // enough that the merchant's liability does not run indefinitely.
  const expires = new Date(now.getTime() + 30 * 86_400_000);

  const voucher = transact(db, () => {
    // The debit runs first: if the balance is short it throws and the voucher
    // is never written, so there is no unpaid voucher to reconcile.
    spendOnVoucher(db, {
      userId: id, voucherId, offerName: offer.name,
      merchant: offer.merchantShort, costPoints: offer.costPoints,
      // From the OFFER. A Green reward must not be buyable with sightseeing
      // points, or host-verified work stops being worth more than a walk.
      currency: offer.currency,
    });
    const code = `CG-${voucherId.slice(0, 8).toUpperCase()}`;
    db.prepare(
      `INSERT INTO vouchers (id, offer_id, user_id, merchant, code, cost_points,
         issued_at, expires_at, status)
       VALUES (?,?,?,?,?,?,?,?,'active')`,
    ).run(voucherId, offer.id, id, offer.merchant, code, offer.costPoints,
          now.toISOString(), expires.toISOString());
    return {
      id: voucherId, offerId: offer.id, userId: id, merchant: offer.merchant,
      code, costPoints: offer.costPoints, issuedAt: now.toISOString(),
      expiresAt: expires.toISOString(), redeemedAt: null, status: 'active' as const,
    };
  });

  return ok(c, { voucher, balances: getWallet(db, id).balances });
});

/**
 * Vouchers.
 *
 * `SELECT *` returned raw DB rows, so this one endpoint answered in
 * snake_case while every other answered in camelCase - and the mobile client
 * declared the result as `Voucher[]`, whose fields are `costPoints` and
 * `offerId`. TypeScript believed the annotation, nothing ever read the
 * fields, and the lie survived. Found by capturing the contract for a second
 * client, which is the entire argument for capturing it.
 */
app.get('/vouchers', (c) => {
  const rows = db
    .prepare('SELECT * FROM vouchers WHERE user_id = ? ORDER BY issued_at DESC')
    .all(userId(c)) as unknown as {
      id: string; offer_id: string; user_id: string; merchant: string; code: string;
      cost_points: number; issued_at: string; expires_at: string;
      redeemed_at: string | null; status: string;
    }[];
  const vouchers: Voucher[] = rows.map((r) => ({
    id: r.id,
    offerId: r.offer_id,
    userId: r.user_id,
    merchant: r.merchant,
    code: r.code,
    costPoints: r.cost_points,
    issuedAt: r.issued_at,
    expiresAt: r.expires_at,
    redeemedAt: r.redeemed_at,
    status: r.status as Voucher['status'],
  }));
  return ok(c, vouchers, { total: vouchers.length });
});

/** The merchant marks a voucher used. Idempotent - scanning twice is harmless. */
app.post('/vouchers/:code/redeem', (c) => {
  const code = c.req.param('code');
  const row = db.prepare('SELECT * FROM vouchers WHERE code = ?').get(code) as
    | { status: string; expires_at: string }
    | undefined;
  if (!row) return fail(c, 'NOT_FOUND', 'Unknown voucher', 404);
  if (row.status === 'redeemed') return ok(c, { alreadyRedeemed: true });
  if (new Date(row.expires_at) < new Date()) {
    db.prepare("UPDATE vouchers SET status = 'expired' WHERE code = ?").run(code);
    return fail(c, 'EXPIRED', 'This voucher has expired', 410);
  }
  db.prepare("UPDATE vouchers SET status = 'redeemed', redeemed_at = ? WHERE code = ?").run(
    new Date().toISOString(), code);
  return ok(c, { alreadyRedeemed: false });
});

// ---------------------------------------------------------------------------
// Companions
// ---------------------------------------------------------------------------

/**
 * One creature per habitat, at the stage this traveller's evidence has reached.
 *
 * Derived on read from the ledger, never stored: the collection IS the
 * evidence, so there is nothing to keep in sync and nothing that can be
 * granted by any route.
 */
/**
 * The passport: which provinces have been visited, out of all 77.
 *
 * The client owns the province list and the arithmetic — it is pure and it
 * ships in core. The server owns the one thing only it knows: where this
 * traveller has actually been.
 */
/**
 * Statements a host filed that include this traveller's verified work - the
 * guest-facing half of the evidence layer (docs/31). The hotel's record is
 * something the guest whose work it counts can see and point at.
 */
app.get('/me/statements', (c) => ok(c, { statements: statementsIncluding(db, userId(c)) }));

// ---------------------------------------------------------------------------
// Stories (docs/44)
// ---------------------------------------------------------------------------

/** What is on the pin: approved, unexpired, newest first - and whether the door is open. */
app.get('/places/:id/stories', (c) => ok(c, { open: storiesOpen(db), stories: storiesAt(db, c.req.param('id')) }));

/**
 * Tell one. Multipart: `file` (a clip or a photograph), `caption`, and
 * `position` as JSON - the fix the fence and the second signal judge.
 * Pending until a host approves; the reply says so.
 */
app.post('/places/:id/stories', async (c) => {
  const contentType = c.req.header('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return fail(c, 'MULTIPART_REQUIRED', 'Send the story as multipart/form-data with a file.');
  }
  // The ceiling is applied while the body arrives, not after it is in memory:
  // the first version parsed first and measured second, which on the day
  // would have let anyone with the QR code fill the API's RAM with one file.
  let form: FormData;
  try {
    form = await boundedForm(c, STORY_FORM_MAX_BYTES);
  } catch (err) {
    if (err instanceof BodyTooLarge) throw new StoryTooLarge();
    throw err;
  }
  const file = form.get('file');
  if (!(file instanceof File)) return fail(c, 'FILE_REQUIRED', 'A clip or a photograph is needed.');
  const position = parsePosition(form.get('position'));
  if (!position) return fail(c, 'LOCATION_REQUIRED', 'Your location is needed to tell a story here.');
  const caption = form.get('caption');
  const event = form.get('event');
  const story = await submitStory(db, {
    userId: userId(c),
    placeId: c.req.param('id'),
    bytes: Buffer.from(await file.arrayBuffer()),
    caption: typeof caption === 'string' ? caption : '',
    fix: position,
    // The token from the QR code, when the deployment set one (docs/46).
    event: typeof event === 'string' ? event : null,
  });
  return ok(c, story);
});

app.get('/passport', (c) => ok(c, {
  visited: visitedProvincesFor(db, userId(c)),
  // Drawn as a different stamp. Never merged into `visited`: a self-issued
  // stamp must not look like a geofenced one anywhere downstream.
  selfReported: selfReportedProvincesFor(db, userId(c)),
  /*
    Only the provinces this traveller has evidence in — one or two rows, not
    77. The full country and the species list are static core data the client
    already ships, so `provinceCompanions` assembles the other seventy-five
    sealed eggs locally rather than being told about them over a beach
    connection on every request.
  */
  evidence: provinceEvidenceFor(db, userId(c)),
}));

/**
 * The standing.
 *
 * Hosts ranked by approvals, and the caller's OWN record — never a list of
 * other travellers' names. That is a deliberate omission twice over:
 *
 *  - there is one traveller on this island, so a ranking of them would be a
 *    mirror, and `isRankable` in core makes the screen say so;
 *  - publishing a Thai user's name and activity beside a leaderboard is a
 *    PDPA question this product has not asked anybody yet, and the honest
 *    default until it does is not to publish it. `participants` is a count,
 *    which needs no consent to state.
 */
app.get('/standing', (c) => {
  const me = userId(c);
  const travellers = travellerStandings(db);
  const mine = travellers.find((t) => t.userId === me) ?? null;

  return ok(c, {
    hosts: rankHosts(hostStandings(db)),
    you: mine,
    participants: travellers.filter((t) => t.greenVerified > 0).length,
    // The caller's own place in the table, and nobody else's: the profile
    // shows "#2 of 5" without a single other name leaving the server.
    position: positionOf(travellers, me),
    rankedBy: RANKED_BY,
  });
});

// ---------------------------------------------------------------------------
// Parties
//
// A party is a VIEW over what its members separately earned. There is no
// shared wallet and no transfer route below, and there never will be: Green
// means a named host checked the work, so it cannot arrive by standing next to
// somebody who did it.
// ---------------------------------------------------------------------------

/** Who I am travelling with, and what we have done between us. */
app.get('/party', (c) => {
  const me = userId(c);
  const party = activePartyFor(db, me);
  if (!party) {
    // Solo is a real state, not an empty one - it is what everybody starts as.
    return ok(c, { party: null, summary: summarise([]), doesNot: PARTY_DOES_NOT });
  }
  return ok(c, {
    party,
    summary: summarise(membersOf(db, party.id, me)),
    doesNot: PARTY_DOES_NOT,
  });
});

/** Start one. The code is returned here and only its hash is stored. */
app.post('/party', async (c) => {
  const body = await c.req.json<{ name?: string }>().catch(() => ({} as { name?: string }));
  const { party, code } = createParty(db, userId(c), body.name ?? '');
  return ok(c, { party, code });
});

app.post('/party/join', async (c) => {
  const body = await c.req.json<{ code?: string }>().catch(() => ({} as { code?: string }));
  if (!body.code) return fail(c, 'CODE_REQUIRED', 'Enter the code from whoever started the group.');
  try {
    return ok(c, { party: joinParty(db, userId(c), body.code) });
  } catch (err) {
    if (err instanceof PartyRefused) {
      // Four reasons, four sentences. "Could not join" sends somebody to
      // retype a code that was never the problem.
      return fail(c, `PARTY_${err.reason.toUpperCase().replace('-', '_')}`,
        JOIN_REFUSAL[err.reason].en, 400);
    }
    throw err;
  }
});

app.post('/party/leave', (c) => ok(c, { left: leaveParty(db, userId(c)) > 0 }));

/** Only the founder may disband; the party survives anyone else leaving. */
app.post('/party/disband', (c) => {
  const party = activePartyFor(db, userId(c));
  if (!party) return fail(c, 'NO_PARTY', 'You are not in a group.', 404);
  if (!disbandParty(db, userId(c), party.id)) {
    return fail(c, 'NOT_YOURS', 'Only whoever started this group can disband it.', 403);
  }
  return ok(c, { disbanded: true });
});

app.get('/companions', (c) => {
  const evidence = habitatEvidenceFor(db, userId(c));
  const companions = companionsFor(evidence);
  return ok(c, { companions, summary: collectionSummary(companions), speciesAsOf: SPECIES_AS_OF });
});

// ---------------------------------------------------------------------------
// Price Forecast
// ---------------------------------------------------------------------------

/**
 * A price BAND for a date, plus the months ahead.
 *
 * Server-side so the seasonality model and its dated constants live in one
 * place: a client that carried its own copy would keep quoting last year's
 * festival calendar after the server had moved on.
 */
app.post('/prices', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const asked = body?.category;
  const category = ['stay', 'ferry', 'flight', 'scooter'].includes(asked) ? asked : 'stay';
  const now = new Date();
  const date = typeof body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    ? body.date
    : islandDay(now);

  const outlook = outlookAhead(category, now, 6);
  return ok(c, {
    today: forecastPrice(category, date, now),
    outlook,
    cheapest: cheapestMonth(outlook),
  });
});

// ---------------------------------------------------------------------------
// Smart Route
// ---------------------------------------------------------------------------

/**
 * How to get from one place to another, leg by leg.
 *
 * Both endpoints are place ids rather than raw coordinates: routing between
 * arbitrary points would imply a road network this does not have, and naming
 * the places keeps the answer honest about what it knows.
 */
app.post('/route', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const places = await listScoredPlaces(db, userId(c));
  const at = (id: unknown) => places.find((p) => p.id === id);
  const from = at(body?.from);
  const to = at(body?.to);
  if (!from || !to) {
    return fail(c, 'UNKNOWN_PLACE', 'Both ends of a journey have to be places we know.');
  }
  const way = (p: typeof from) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng });
  // Every coastal place doubles as its own pier at pilot scale; when real
  // pier data lands this becomes a lookup rather than a coastline guess.
  return ok(c, smartRoute(way(from), way(to), places.map(way)));
});

// ---------------------------------------------------------------------------
// Wellness Engine
// ---------------------------------------------------------------------------

/** Record how someone says they feel. Appends; never overwrites. */
app.post('/wellness/mood', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  try {
    return ok(c, recordMood(db, userId(c), { mood: String(body?.mood ?? ''), note: body?.note }));
  } catch (err) {
    if (err instanceof UnknownMood) {
      return fail(c, 'UNKNOWN_MOOD', 'That is not one of the four moods.');
    }
    throw err;
  }
});

app.get('/wellness/mood', (c) => ok(c, moodHistory(db, userId(c))));

/**
 * Chiva Balance.
 *
 * Server-side because it reads the whole visit history and the air measured
 * at those places. Returns a null total with a reason when the trip is too
 * short to say anything - see `chivaBalance`.
 */
app.get('/wellness/balance', (c) => ok(c, balanceFor(db, userId(c))));

// ---------------------------------------------------------------------------
// Trip planner
// ---------------------------------------------------------------------------

/**
 * Plan one day on the island.
 *
 * Server-side because the inputs are: the traveller's stored profile, live air
 * per place, and the quest list with its geofences. A client that planned its
 * own day would be planning from whatever it last cached.
 *
 * `energy` overrides the profile's activity level for this one plan, so a
 * traveller can ask for a gentle day without changing who they are.
 */
app.post('/trip/plan', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const asked = body?.energy;
  const energy = asked === 'gentle' || asked === 'moderate' || asked === 'full' ? asked : undefined;

  const [places, profile] = [await listScoredPlaces(db, userId(c)), getProfile(db, userId(c))];
  // A day is planned in one area. The client says which; an older client
  // that says nothing gets everything, as before.
  const framed = isAreaKey(body?.area) ? areaByKey(body.area) : null;
  const inFrame = <T extends { lat: number; lng: number }>(list: T[]): T[] =>
    framed ? list.filter((x) => inArea(framed, x)) : list;
  // The last mood check-in shapes the day unless the traveller asked for
  // something else out loud. That is the deck's "เส้นทางบรรโลงใจ".
  const mood = latestMood(db, userId(c));
  return ok(c, planDay({
    profile,
    places: inFrame(places),
    quests: inFrame(listQuests(db)),
    energy,
    bias: mood ? routeBiasFor(mood.mood) : undefined,
  }));
});

// ---------------------------------------------------------------------------
// Impact
// ---------------------------------------------------------------------------

app.get('/impact/me', (c) => ok(c, getPersonalImpact(db, userId(c))));

/**
 * Community totals AND their targets.
 *
 * The design's bar percentages (83%, 67%, 74%, 50%, 40%) are placeholders. The
 * client computes actual/target from this payload, so correcting a target is a
 * database update, not an app release.
 */
app.get('/impact/community', (c) => {
  const year = num(c.req.query('year'), new Date().getFullYear());
  return ok(c, { year, metrics: getCommunityImpact(db, year) });
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * Register this device for push.
 *
 * PDPA: the client only calls this AFTER the OS permission prompt is granted,
 * so arriving here is itself the consent signal. Revoking is a DELETE below,
 * and takes effect immediately.
 */
app.post('/notifications/device', async (c) => {
  const body = (await c.req.json()) as {
    token?: string; locale?: string; platform?: string;
  };
  try {
    registerDevice(db, {
      userId: userId(c),
      token: String(body.token ?? ''),
      locale: body.locale === 'th' ? 'th' : 'en',
      platform: body.platform ?? null,
    });
  } catch (err) {
    if (err instanceof InvalidPushToken) {
      return fail(c, 'INVALID_PUSH_TOKEN', 'That is not a valid device token.');
    }
    throw err;
  }
  return ok(c, { registered: true });
});

/** Turn push off for this device. The in-app inbox keeps working. */
app.delete('/notifications/device', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { token?: string };
  if (body.token) disableDevice(db, body.token);
  return ok(c, { disabled: true });
});

/** The in-app inbox. Bilingual, because inside the app there is room for both. */
app.get('/notifications', (c) => {
  const id = userId(c);
  return ok(c, { items: inbox(db, id), unread: unreadCount(db, id) });
});

app.post('/notifications/:id/read', (c) => {
  const id = userId(c);
  markRead(db, id, c.req.param('id'));
  return ok(c, { unread: unreadCount(db, id) });
});

app.post('/notifications/read-all', (c) => {
  const id = userId(c);
  markAllRead(db, id);
  return ok(c, { unread: 0 });
});

/**
 * Quiet hours, per person.
 *
 * The island default suits most people and not a night-shift worker, nor
 * somebody who would rather be woken than miss a quest result. SOS ignores
 * this setting entirely and always will.
 */
app.get('/notifications/quiet', (c) => ok(c, getQuietPreference(db, userId(c))));

app.put('/notifications/quiet', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    enabled?: boolean; from?: number; until?: number;
  };
  return ok(c, setQuietPreference(db, userId(c), body));
});

// ---------------------------------------------------------------------------
// Safety Shield + SOS
// ---------------------------------------------------------------------------

app.get('/shield', (c) => ok(c, getShield(db, userId(c))));

/**
 * The app polls this on launch and on every screen change, so a live alert
 * survives navigation, a crash and a reinstall.
 */
app.get('/sos', (c) => ok(c, activeAlert(db, userId(c))));

app.post('/sos', async (c) => {
  const id = userId(c);
  const body = (await c.req.json().catch(() => ({}))) as {
    lat?: unknown; lng?: unknown; note?: unknown;
  };
  // No fix is recorded as no fix. The first version substituted Bophut, and
  // the desk could not tell that pin from a real one.
  const hasFix = typeof body.lat === 'number' && Number.isFinite(body.lat)
    && typeof body.lng === 'number' && Number.isFinite(body.lng);
  const lat = hasFix ? (body.lat as number) : null;
  const lng = hasFix ? (body.lng as number) : null;

  const alert = fireAlert(db, {
    userId: id,
    lat,
    lng,
    locationLabel: hasFix ? nearestArea(lat!, lng!) : 'Position unknown · ไม่ทราบตำแหน่ง',
    note: typeof body.note === 'string' ? body.note.slice(0, 500) : null,
  });
  // Push to contacts NOW rather than on the next dispatch tick. Up to a minute
  // of latency is acceptable for a quest approval; it is not for this.
  flushNotifications();
  return ok(c, alert);
});

/**
 * Live position while an alert runs.
 *
 * Accepts a single fix OR a batch. The batch exists because a phone in a
 * mangrove loses signal for twenty minutes and then flushes everything it
 * recorded while offline; sending those one at a time over a returning
 * connection is how you lose half of them.
 */
app.post('/sos/position', async (c) => {
  const body = (await c.req.json()) as {
    lat?: number; lng?: number; accuracyM?: number; recordedAt?: string;
    source?: PositionSource;
    fixes?: { lat: number; lng: number; accuracyM?: number; recordedAt: string; source?: PositionSource }[];
  };

  const alert = activeAlert(db, userId(c));
  if (!alert) return fail(c, 'NO_ACTIVE_ALERT', 'No alert is running.', 404);

  const fixes: PositionFix[] = body.fixes?.length
    ? body.fixes
    : typeof body.lat === 'number' && typeof body.lng === 'number'
      ? [{
          lat: body.lat, lng: body.lng,
          accuracyM: body.accuracyM ?? null,
          recordedAt: body.recordedAt ?? new Date().toISOString(),
          source: body.source ?? 'foreground',
        }]
      : [];

  if (fixes.length === 0) return fail(c, 'LOCATION_REQUIRED', 'A position is required.');

  const result = recordPositions(db, alert.id, fixes);
  return ok(c, {
    alert: activeAlert(db, userId(c)),
    recorded: result.recorded,
    duplicates: result.duplicates,
  });
});

app.delete('/sos', (c) => {
  cancelAlert(db, userId(c));
  return ok(c, { cancelled: true });
});

// -- Emergency contacts -----------------------------------------------------

app.get('/sos/contacts', (c) => ok(c, listContacts(db, userId(c))));

app.post('/sos/contacts', async (c) => {
  const body = (await c.req.json()) as {
    name?: string; phone?: string; relationship?: string; linkedUserId?: string;
  };
  const name = String(body.name ?? '').trim();
  if (!name) return fail(c, 'NAME_REQUIRED', 'A contact needs a name.');
  return ok(
    c,
    addContact(db, {
      userId: userId(c),
      name,
      phone: body.phone,
      relationship: body.relationship,
      linkedUserId: body.linkedUserId,
    }),
  );
});

app.delete('/sos/contacts/:id', (c) => {
  removeContact(db, userId(c), c.req.param('id'));
  return ok(c, { removed: true });
});

/**
 * Coarse reverse geocode against the island's main areas.
 * A real build uses a geocoder; this keeps the dispatch panel truthful offline,
 * which is exactly when an emergency is most likely.
 */
function nearestArea(lat: number, lng: number): string {
  const areas = [
    { name: 'Bophut', lat: 9.5573, lng: 100.0596 },
    { name: 'Chaweng', lat: 9.5357, lng: 100.0617 },
    { name: 'Lamai', lat: 9.4693, lng: 100.0446 },
    { name: 'Maenam', lat: 9.5701, lng: 99.9964 },
    { name: 'Thong Krut', lat: 9.4179, lng: 99.9433 },
    { name: 'Na Muang', lat: 9.4611, lng: 99.9908 },
    // The campus (docs/43), and the town it sits in.
    { name: 'KU Sriracha', lat: 13.1205, lng: 100.9205 },
    { name: 'Si Racha', lat: 13.1737, lng: 100.9312 },
  ];
  let best = areas[0]!;
  let bestD = Infinity;
  for (const a of areas) {
    const d = (a.lat - lat) ** 2 + (a.lng - lng) ** 2;
    if (d < bestD) { bestD = d; best = a; }
  }
  // Rough metres, good enough for "Bophut, 400 m".
  const metres = Math.round(Math.sqrt(bestD) * 111_000);
  return `${best.name}, ${metres < 1000 ? `${metres} m` : `${(metres / 1000).toFixed(1)} km`}`;
}

// ---------------------------------------------------------------------------

/**
 * Listen only when this file IS the program.
 *
 * Importing it used to bind a port as a side effect, which meant the app
 * could not be exercised in-process - every test had to spawn a real server
 * on a real port and hope nothing else held it. The contract capture needs
 * exactly that in-process access, and so would any future route test.
 */
/**
 * Serve the built web app from the API itself, when there is one to serve.
 *
 * ONE ORIGIN, and that is the whole point. A tunnel gives out a fresh random
 * hostname every run, so a web build with the API baked into it would have to
 * be rebuilt and redeployed before every demo - and would be wrong the moment
 * the tunnel reconnected. Served from here, the app talks to the origin it was
 * loaded from: no rebuild, no CORS, no stale hostname, one link to hand over.
 *
 * Mounted LAST so it can never shadow an API route, and only when the
 * directory actually exists - `pnpm --filter @chivago/api start` on a dev
 * machine with no web build should still be an API, not a 500.
 *
 * Set CHIVAGO_WEB_DIR to point at the export. Nothing is served without it.
 */
const webDir = process.env.CHIVAGO_WEB_DIR;

if (webDir !== undefined && existsSync(join(webDir, 'index.html'))) {
  // `serveStatic` resolves `root` against the process cwd, which is not where
  // this file lives and not where the build lands. Relative-ise it once here
  // rather than depending on how the server happened to be launched.
  const root = relative(process.cwd(), webDir).split(sep).join('/') || '.';

  app.get('/', serveStatic({ path: `${root}/index.html` }));
  app.use('/_expo/*', serveStatic({ root }));
  app.use('/assets/*', serveStatic({ root }));
  app.get('/favicon.ico', serveStatic({ path: `${root}/favicon.ico` }));

  console.log(`[chivago] serving the web app from ${webDir}`);
}

const isEntryPoint = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  const port = Number(process.env.PORT ?? 8787);
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[chivago] API listening on http://localhost:${info.port}`);
  });
}

export { app, db };
