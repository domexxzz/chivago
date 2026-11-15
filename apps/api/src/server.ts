/**
 * ChivaGo API.
 *
 * Implements the backend surface the design implies (handoff section 6), with
 * the two rules the prototype could not enforce:
 *   - points, quest stages and the ledger are server-owned;
 *   - a live SOS persists across navigation and app restarts.
 */

import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import {
  PartyRefused, activePartyFor, createParty, disbandParty, joinParty, leaveParty, membersOf,
} from './party-service.ts';
import {
  InviteRefused, closeInvite, decideRequest, listingsAt, openInviteCounts,
  openInviteFor, pendingFor, postInvite, requestJoin, requestsBy, withdrawRequest,
} from './party-invite-service.ts';
import { INVITE_DOES_NOT, POST_REFUSAL, REQUEST_REFUSAL, pinLine } from '@chivago/core';
import {
  LINK_CODE_TTL_MS, LinkCodeRefused, claimLinkCode, devicesFor, issueLinkCode,
  // Aliased: `registerDevice` is already the push-token function next door,
  // and two different registrations under one name is how the wrong one gets
  // called at three in the morning.
  registerDevice as registerAccountDevice, resolveDevice, revokeDevice,
} from './account-service.ts';
import { loginUser, registerUser, UserAuthError } from './user-account-service.ts';
import {
  LINE_OAUTH_COOKIE, OAUTH_TTL_MS, authorizeUrl, lineConfig, lineSubFor, packRound, sameToken,
  startRound, unpackRound,
} from './line-auth.ts';
import { resolveLineSignIn } from './line-identity.ts';
import {
  ShopError, deleteReview as deleteShopReview, deleteShop, getShop, listReviews as listShopReviews,
  listShops, ownReview, ownedShop, replyReview, reportShopReview, saveReview as saveShopReview, saveShop,
} from './local-business-service.ts';
import { logger } from 'hono/logger';

import { row, transact, type DB } from './db.ts';
import {
  finishImportRun, importBatch, importBlockers, provisionedUserCount, recordBatch,
  type ImportBatch,
} from './import-service.ts';
import { exportManifest, exportOnePage } from './export-service.ts';

/**
 * Ceilings on one import batch.
 *
 * Bytes because an isolate gets 128 MB and it hosts the whole app; rows
 * because a batch is one synchronous loop the object cannot serve anything
 * else during. Both are deliberately well under what the platform allows, so
 * a too-large batch is a 413 the operator can act on rather than an isolate
 * that died.
 */
const MAX_IMPORT_BYTES = 16 * 1024 * 1024;
const MAX_IMPORT_ROWS = 5_000;

/**
 * How many BYTES a string will be on the wire.
 *
 * `String#length` counts UTF-16 code units, and this database is half Thai -
 * where one unit is three bytes. A ceiling checked against the wrong unit is
 * a ceiling that passes a page three times too big.
 */
const utf8Length = (s: string): number => new TextEncoder().encode(s).byteLength;
import { constantTimeEqual } from './scrypt.ts';
import { BodyTooLarge, boundedForm, fail, handleError, num, ok, userId, type AppEnv } from './http.ts';
import { publicConfig } from './fence.ts';
import { boardFeed, type BoardEntry } from '@chivago/core';
import { monstersInArea } from './monster-service.ts';
import { reportSighting, routesForArea } from './transit-service.ts';
import { reviewsInArea } from './place-review-service.ts';
import { getCourts } from './courts.ts';
import { getStalls } from './stalls.ts';
import { getWeather } from './weather.ts';
import {
  getCommunityImpact, getOffer, getPersonalImpact, getProfile,
  getQuest, getScoredPlace, getShield, listOffers, listQuests, listScoredPlaces,
} from './repo.ts';
import { ensureWallet, getWallet, grantOpeningBalance, spendOnVoucher } from './wallet-service.ts';
import {
  InvalidInquiry, listingCards, sendInquiry, travellerInquiries, withdrawInquiry,
} from './inquiry-service.ts';
import { checkedInToday, checkIn } from './checkin-service.ts';
import { exploredFor, recordSelfVisit, selfReportedProvincesFor, selfVisitsFor } from './visit-service.ts';
import { airHistoryFor, checkinsLastHour } from './crowd-service.ts';
import { readStatement, statementsIncluding } from './statement-service.ts';
import { countersignaturesFor } from './countersign-service.ts';
import {
  STORY_FORM_MAX_BYTES, StoryTooLarge, readStoryMedia, storiesAt, storiesInArea, storiesOpen,
  storyEtag, submitStory,
} from './story-service.ts';
import { AREAS, areaByKey, inArea, isAreaKey } from '@chivago/core';
import { openArea, refreshPhotos } from './area-opening.ts';
import { TEN_PULL_SIZE } from '@chivago/core';
import { isLang } from '@chivago/core';
import { statementMissingPage, verifyPage } from './console/statement.ts';
import { usesOf } from './statement-use-service.ts';
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
import { treeImpactForUser } from './tree-impact-service.ts';
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
import { webhookTransport } from './push/webhook.ts';
import { hostOwnsQuest, resolveSession, readCookie, SESSION_COOKIE } from './host-auth.ts';
import { isPrimary, onPrimary } from './primary.ts';
import { bootstrapKohSichangBusinesses } from './bootstrap-koh-sichang.ts';
import { buildSweeps, startSweepTimers, type Sweep } from './sweeps.ts';
import { MAX_BYTES, MAX_PHOTOS_PER_PROOF, storePhoto, UnsupportedUpload } from './uploads.ts';
import {
  COMMUNITY_MEDIA_MAX_BYTES, addCommunityComment, createCommunityPost, listCommunityFeed,
  readCommunityMedia, recordCommunityShare, toggleCommunityLike,
} from './community-service.ts';
import { FFMPEG, transcoderAvailable } from './transcode.ts';
import {
  collectionFor, fashionFor, forge, historyFor, pull, summonState, verifySummon,
} from './summon-service.ts';
import {
  assistConfig, ffmpegPrepare, requestAssist, type AssistDeps,
} from './assist-service.ts';
import { bedrockModel } from './bedrock.ts';
import type { Voucher, WellnessProfile } from '@chivago/core';

/**
 * The database these routes read, and the sweeps that run against it.
 *
 * `let`, not `const`, and NOT opened here. A Node process opens a file; a
 * Durable Object is handed storage it already has, and cannot open anything at
 * import time. So whichever entry point is running calls `useDatabase` before
 * it serves a single request.
 *
 * The route handlers below close over this BINDING rather than capturing a
 * value, which is what makes a late assignment work at all. `openDb` used to
 * be called here, which meant importing this file touched the disk - and on
 * Workers there is no disk to touch.
 */
let db: DB = undefined as unknown as DB;
let sweeps: Sweep[] = [];

export function useDatabase(handle: DB): void {
  db = handle;
  /*
    Rebuilt here rather than at module scope. `buildSweeps` DESTRUCTURES the
    handle, so a list built before the database existed would hold `undefined`
    for ever - unlike the route closures above, which read the binding each
    time they run.
  */
  sweeps = buildSweeps({ db, oncall, flushNotifications, startAssist });

  /*
    The Ko Sichang bootstrap, which used to run at module scope beside
    `openDb()`. There is no database at import time any more, so it runs here
    instead - once, on whichever entry point supplied the handle.

    WRAPPED, and that is not caution. #196: a throw here used to happen while
    this module was still being imported, so nothing above it could catch one.
    The process ended before a port was open, the health check never answered,
    and `auto_start_machines` woke the machine only to crash it again. On a
    Durable Object the same throw leaves the object unable to construct, which
    is the same outage wearing different clothes. Eight shop rows are not worth
    either.

    `isPrimary()` still guards it: on Node with LiteFS a replica must not write
    to a database it does not own, and with LITEFS_DIR unset - every Worker, and
    any Node process without LiteFS - it answers true without reading a disk.
  */
  if (isPrimary()) {
    try {
      const bootstrapped = bootstrapKohSichangBusinesses(db);
      const planted = bootstrapped.accountCreated
        || bootstrapped.shopsInserted > 0
        || bootstrapped.attractionsInserted > 0;
      if (!bootstrapped.skipped && planted) {
        console.log('[chivago] Ko Sichang content bootstrapped:', bootstrapped);
      }
    } catch (err) {
      console.error('[chivago] Ko Sichang bootstrap failed; starting without it:', err);
    }
  }
}

/** The jobs an alarm or a timer should run. Empty until `useDatabase`. */
export const scheduledSweeps = (): Sweep[] => sweeps;

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
 * A second pair of eyes (docs/64). Off unless CHIVAGO_ASSIST=on with a model
 * and a key; the console then shows the AI check as "off" and nothing else
 * changes. The key is read here and handed to the client, never logged.
 */
const assist = assistConfig(process.env);
const assistDeps: AssistDeps = {
  model: assist.enabled
    ? bedrockModel({ region: assist.region, modelId: assist.modelId!, token: assist.token! })
    : null,
  prepare: ffmpegPrepare(),
  dailyLimit: assist.dailyLimit,
};
console.log(`[chivago] AI host assistant: ${assist.enabled ? `on (${assist.modelId}, ${assist.region})` : 'off'}`);

/** Never on a request path: the upload has already answered the volunteer. */
const startAssist = (proofId: string) => {
  void requestAssist(db, proofId, assistDeps).catch((err) => {
    console.error('[chivago] assist failed to start:', (err as Error).message);
  });
};


const oncall = webhookTransport();

/*
  The jobs that run because time passed, not because somebody asked.

  They used to be six `setInterval` calls here. They live in `sweeps.ts` now,
  with their intervals and their reasons, because a Durable Object has no
  process to hold a timer and schedules the same work with an alarm instead.
  The schedule did not change; see the header there.
*/


app.use('*', logger());

/**
 * The host console is mounted before everything else.
 *
 * It has its own session auth and must NOT pass through the traveller
 * middleware below, which would provision a mobile user for a municipal
 * reviewer and hand them a wallet.
 */
app.route('/console', consoleRoutes(() => db, {
  // A console approval should reach the volunteer's phone as fast as the
  // automation path does. Without this it waited for the 60-second ticker.
  afterDecision: () => flushNotifications(),
}));

/**
 * A short link for the form a business fills in (docs/67).
 *
 * The page itself lives under /console because that is where its stylesheet,
 * its locale cookie and the queue behind it already are. But the link is
 * handed to a hotel manager or read off a flyer at a pier, and telling
 * somebody to visit a "console" to apply is telling them it is not for them.
 */
app.get('/apply', (c) => c.redirect('/console/apply', 302));

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

/**
 * Replay a database into this one. OFF unless armed.
 *
 * WHY A ROUTE AT ALL. A Durable Object's SQLite is not a file anyone can
 * upload - there is no `wrangler do import` and the storage is reachable only
 * from inside the object - so the only way to move the pilot's database onto
 * Workers is to send the rows through it. See
 * `docs/71-moving-the-data-to-cloudflare.md`, which calls this the hardest
 * step; `apps/api/src/export-for-import.ts` produces what this consumes.
 *
 * FOUR LOCKS, because this writes to a live database:
 *
 *  1. WITHOUT `CHIVAGO_IMPORT_TOKEN` THE ROUTE DOES NOT EXIST. It answers 404,
 *     not 403 - an unarmed deployment should not even admit the door is there.
 *     That is also what makes "delete it after the migration" a one-line
 *     change somebody can actually be relied on to make: unset the secret.
 *  2. The token, compared in constant time.
 *  3. The database must be EMPTY. An import onto a database with people in it
 *     is the accident that cannot be undone, so `users` having any row at all
 *     refuses the whole request.
 *  4. The batch carries values, never SQL. Table and column names are checked
 *     against the live schema before they reach a statement and every value is
 *     bound - see `import-service.ts`.
 *
 * Registered HERE, before the device-authentication middleware, because it
 * authenticates itself and there is no traveller to be.
 */
app.post('/admin/import/finish', async (c, next) => {
  const token = process.env.CHIVAGO_IMPORT_TOKEN ?? '';
  // Fall THROUGH when unarmed, rather than answering 404 here. A bare
  // `notFound()` from this handler looks different from a genuine unknown
  // path - no CORS header, Hono's plain text body - so the 404 itself
  // announced the route, and 404-versus-403 announced whether it was armed.
  if (token === '') return next();
  const utf8 = new TextEncoder();
  if (!constantTimeEqual(utf8.encode(c.req.header('x-import-token') ?? ''), utf8.encode(token))) {
    return fail(c, 'FORBIDDEN', 'That token is not the one this deployment was armed with.', 403);
  }
  /*
    Said at the end, by the operator, when the counts match - not inferred.
    Until it is said the run stays open, which is what lets an interrupted
    import be continued instead of being refused by the rows it already wrote.
  */
  const closed = finishImportRun(db, 'closed over /admin/import/finish');
  return ok(c, { closed });
});

app.post('/admin/import', async (c, next) => {
  const token = process.env.CHIVAGO_IMPORT_TOKEN ?? '';
  // See the note on /admin/import/finish: unarmed falls through so the
  // response is whatever any other unknown path would have been.
  if (token === '') return next();

  /*
    A short token is not a door, it is a doorway. There is no throttle on this
    route - adding one is a bigger change than this is - so the only thing
    standing between a guesser and every table is the secret's length.
  */
  if (token.length < 32) {
    console.error('[chivago] CHIVAGO_IMPORT_TOKEN is shorter than 32 characters; refusing to import.');
    return fail(c, 'WEAK_IMPORT_TOKEN', 'This deployment’s import token is too short to be used.', 500);
  }

  const offered = c.req.header('x-import-token') ?? '';
  const utf8 = new TextEncoder();
  if (!constantTimeEqual(utf8.encode(offered), utf8.encode(token))) {
    return fail(c, 'FORBIDDEN', 'That token is not the one this deployment was armed with.', 403);
  }

  const blockers = importBlockers(db);
  if (blockers.length > 0) return fail(c, 'DATABASE_NOT_EMPTY', blockers.join(' '), 409);

  /*
    A ceiling, in BYTES, before the body is read.

    `c.req.json()` buffers and parses the whole thing and then `decodeValue`
    copies it again, so a batch of 500 rows of story media can pass Workers'
    request limit and the 128 MB an isolate gets - and that isolate is the
    WHOLE app, not just this request. The exporter chunks by rows, which says
    nothing about bytes, so the limit belongs here as well as there.
  */
  const declared = Number(c.req.header('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_IMPORT_BYTES) {
    return fail(
      c,
      'BATCH_TOO_LARGE',
      `A batch may be at most ${Math.floor(MAX_IMPORT_BYTES / 1024 / 1024)} MB; `
      + 'export with a smaller --chunk.',
      413,
    );
  }

  let batch: ImportBatch;
  try {
    batch = (await c.req.json()) as ImportBatch;
  } catch {
    return fail(c, 'BAD_BATCH', 'The body is not JSON.', 400);
  }
  if (typeof batch?.table !== 'string' || !Array.isArray(batch.columns) || !Array.isArray(batch.values)) {
    return fail(c, 'BAD_BATCH', 'A batch needs a table, columns and values.', 400);
  }
  // One batch is one synchronous insert loop, and the object serves nothing
  // else while it runs.
  if (batch.values.length > MAX_IMPORT_ROWS) {
    return fail(
      c,
      'BATCH_TOO_LARGE',
      `A batch may carry at most ${MAX_IMPORT_ROWS} rows, not ${batch.values.length}.`,
      413,
    );
  }

  try {
    const inserted = importBatch(db, batch);
    /*
      Recorded AFTER the rows land, not before. Before, a token-bearing
      request naming a table that does not exist left an open run behind on an
      untouched database - a door propped open by a typo.
    */
    const run = recordBatch(db);
    const provisioned = provisionedUserCount(db);
    console.log(`[chivago] imported ${inserted} row(s) into ${batch.table} (${run})`);
    return ok(c, { table: batch.table, inserted, run, provisionedUsers: provisioned });
  } catch (err) {
    // The service's messages name the table, the column or the constraint, and
    // whoever is running a migration at two in the morning needs to read them.
    return fail(c, 'IMPORT_FAILED', (err as Error).message, 400);
  }
});

/**
 * Read this database out. OFF unless armed.
 *
 * THE COUNTERPART TO THE IMPORT, AND THE REASON IT EXISTS. A Durable Object's
 * SQLite is reachable only from inside the object: there is no
 * `wrangler do export` and nothing to `sftp get`. Until this route the pilot's
 * only copy of its data was the live object, and the only backups were the
 * ones taken off the Fly volume on 12 November.
 *
 * A PAGE IS AN `ImportBatch`. Same table, same columns, same values, same
 * base64 for a BLOB - so a snapshot replays through `POST /admin/import` with
 * the loop already written in `docs/71`, and there is no format in the middle
 * to get wrong. That is also why a page is returned BARE rather than inside
 * the `{ ok, data }` envelope every other route uses: the file on the laptop
 * has to be the batch, not something a script has to unwrap first.
 *
 * ITS OWN SECRET. `CHIVAGO_EXPORT_TOKEN`, not `CHIVAGO_IMPORT_TOKEN` - the
 * import token is meant to be deleted when a migration ends, and a backup
 * happens again next week. Sharing them would mean arming the write door to
 * take a copy. See the header of `export-service.ts`.
 *
 * THE LOCKS, in the order they apply:
 *
 *  1. WITHOUT `CHIVAGO_EXPORT_TOKEN` THE ROUTE DOES NOT EXIST - the request
 *     falls through to the ordinary pipeline and gets whatever an unknown
 *     path gets, which on the live deployment is the device middleware's 401.
 *     Unsetting the secret is what closes it, with no deploy.
 *  2. A token under 32 characters is refused outright. There is no throttle
 *     here, exactly as on the import, so the secret's length is the whole of
 *     the defence - and this one answers with personal data.
 *  3. The token, compared in constant time.
 *  4. It reads. Nothing on this path writes a row, a counter or a run record.
 *
 * Registered HERE, before the device-authentication middleware, for the same
 * reason the import is: an operator taking a backup is not a traveller and
 * must not be handed an account and a wallet to get at it.
 */
const exportTokenRefusal = (c: Context<AppEnv>): Response | 'unarmed' | null => {
  const token = process.env.CHIVAGO_EXPORT_TOKEN ?? '';
  if (token === '') return 'unarmed';
  if (token.length < 32) {
    // Logged with its LENGTH, never its value - the rule in handoff section 2.
    console.error(
      `[chivago] CHIVAGO_EXPORT_TOKEN is ${token.length} characters; refusing to export.`,
    );
    return fail(
      c,
      'WEAK_EXPORT_TOKEN',
      'This deployment’s export token is too short to be used.',
      500,
    );
  }
  const utf8 = new TextEncoder();
  const offered = c.req.header('x-export-token') ?? '';
  if (!constantTimeEqual(utf8.encode(offered), utf8.encode(token))) {
    return fail(c, 'FORBIDDEN', 'That token is not the one this deployment was armed with.', 403);
  }
  return null;
};

/** Headers for a response that is somebody's personal data in a file. */
const noStore = (c: Context<AppEnv>): void => {
  c.header('cache-control', 'no-store, private');
  c.header('x-robots-tag', 'noindex, nofollow');
  c.header('x-content-type-options', 'nosniff');
};

/**
 * What is here and how much of it: the plan for a snapshot, and the numbers a
 * finished snapshot is checked against.
 *
 * Counts come from the live database at the moment of asking, which is the
 * only check worth having - a truncated download agrees with itself.
 */
app.get('/admin/export', async (c, next) => {
  const refusal = exportTokenRefusal(c);
  if (refusal === 'unarmed') return next();
  if (refusal !== null) return refusal;

  const manifest = exportManifest(db);
  noStore(c);
  console.log(
    `[chivago] export manifest: ${manifest.tables.length} table(s), ${manifest.totalRows} row(s)`,
  );
  return ok(c, manifest);
});

/**
 * One page of one table, as a batch.
 *
 * PAGED BY ROWID, not by offset - see `exportPage`. This reads the pilot while
 * it is serving and the alarm expires rows every thirty seconds, so an offset
 * taken behind a deletion skips a row and says nothing about it.
 */
app.get('/admin/export/batch', async (c, next) => {
  const refusal = exportTokenRefusal(c);
  if (refusal === 'unarmed') return next();
  if (refusal !== null) return refusal;

  const table = c.req.query('table') ?? '';
  const rowsParam = c.req.query('rows');
  const afterParam = c.req.query('after');

  let page;
  try {
    page = exportOnePage(db, table, {
      // `num` would swallow a typo as the default. A backup that silently
      // read 500 rows because `rows=5oo` is a backup with a hole in it.
      limit: rowsParam === undefined ? undefined : Number(rowsParam),
      afterRowid: afterParam === undefined ? undefined : Number(afterParam),
    });
  } catch (err) {
    return fail(c, 'BAD_EXPORT_REQUEST', (err as Error).message, 400);
  }

  /*
    Serialised once, here, so the size that is CHECKED is the size that is
    SENT. The ceiling is the import's: a page too big to be posted back is not
    a backup, it is a file that will be refused on the day it is needed.
  */
  const body = JSON.stringify(page.batch);
  const bytes = utf8Length(body);
  if (bytes > MAX_IMPORT_BYTES) {
    return fail(
      c,
      'BATCH_TOO_LARGE',
      `${table} returned ${Math.round(bytes / 1024 / 1024)} MB in ${page.batch.values.length} `
      + `row(s), over the ${Math.floor(MAX_IMPORT_BYTES / 1024 / 1024)} MB a batch may be. `
      + 'Ask for fewer rows - stories carry video in the row.',
      413,
    );
  }

  noStore(c);
  c.header('x-chivago-export-rows', String(page.batch.values.length));
  /*
    The cursor travels in a HEADER because the body has to stay exactly what
    the import accepts. Absent means this was the last page.
  */
  if (page.nextAfterRowid !== null) {
    c.header('x-chivago-export-next', String(page.nextAfterRowid));
  }
  c.header('content-type', 'application/json; charset=utf-8');
  return c.body(body);
});

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
/**
 * Conclusions recorded against a statement.
 *
 * A SEPARATE ENDPOINT, NOT A FIELD ON THE RECORD. The digest covers the
 * statement body; a signature arrives afterwards and cannot be inside what
 * was signed. Putting it on the statement JSON would leave a reader
 * recomputing the hash with a field to guess about, and guessing is what the
 * digest exists to end.
 *
 * Public and CORS-open like the record it belongs to: a conclusion nobody can
 * fetch is a conclusion nobody can act on.
 */
app.get('/statements/:id/countersignatures', (c) => {
  const statement = readStatement(db, c.req.param('id'));
  c.header('access-control-allow-origin', '*');
  if (!statement) return fail(c, 'NO_STATEMENT', 'No statement has that id.', 404);
  // Not cached like the statement is: a conclusion can be withdrawn, and the
  // record it hangs on cannot.
  c.header('cache-control', 'no-store');
  return ok(c, {
    statementId: statement.id,
    digest: statement.digest,
    countersignatures: countersignaturesFor(db, statement.id),
  });
});

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
/**
 * The sea and the sky above an area, live from Open-Meteo (weather.ts).
 *
 * Its own route rather than a field on the area: the area is read by the map,
 * Home and the planner, and none of those should wait on a forecast. An area
 * with no sea answers a null wave, not a 404 - inland is an answer, and one
 * shape is one shape.
 */
app.get('/areas/:key/weather', async (c) => {
  /*
    This route is registered before the app-wide CORS middleware below.
    Hono applies middleware in registration order, so Expo Web could read
    every other area endpoint but the live weather request was blocked by
    the browser. Weather is public, read-only area data, just like stories
    and transit, and is deliberately readable by the local web client.
  */
  c.header('access-control-allow-origin', '*');
  const key = c.req.param('key');
  if (!isAreaKey(key)) return fail(c, 'NOT_FOUND', 'No such area', 404);
  c.header('cache-control', 'no-store');
  return ok(c, await getWeather(key));
});

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

/**
 * The monsters standing in an area.
 *
 * Public and cross-origin like the board's feed, and read-only by design -
 * see monster-service.ts. The air each one is judged on is the SAME reading
 * the place cards show, taken from the places read rather than fetched
 * again, because two different numbers for one place's air on one screen
 * would be worse than none.
 */
app.get('/areas/:key/monsters', async (c) => {
  c.header('access-control-allow-origin', '*');
  c.header('cache-control', 'no-store');
  const key = c.req.param('key');
  const places = await listScoredPlaces(db, userId(c));
  // `readings` is optional on the type; every place from this read has one,
  // and a place that somehow does not falls back to its seeded figure marked
  // as the estimate it is - which can never summon a monster.
  const air = new Map(places.map((p) => [p.id, p.readings?.aqi
    ? { aqi: p.readings.aqi.value, provenance: p.readings.aqi.provenance }
    : { aqi: p.metrics.aqi, provenance: 'estimated' as const }]));
  return ok(c, {
    monsters: monstersInArea(db, key, (id) => air.get(id) ?? { aqi: 0, provenance: 'estimated' as const }),
  });
});

app.get('/verify/:id', (c) => {
  const id = c.req.param('id');
  const statement = readStatement(db, id);
  const origin = new URL(c.req.url).origin;
  return c.html(
    statement
      ? verifyPage(publicLocale(c), statement, origin,
        countersignaturesFor(db, statement.id), usesOf(db, statement.id))
      : statementMissingPage(publicLocale(c), id),
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
  /*
    A summon receipt is checkable BY A STRANGER or it is not checkable at all
    (docs/68). The route said "public, deliberately" in a comment above it and
    was not in this list, so `/verify/` matched and `/summon/verify/` did not:
    the moment one device registered, anybody holding a receipt got a 401 and
    the promise was only true on an empty database.

    It reads one summon row and recomputes an HMAC from a seed that is already
    published. There is nothing here a traveller account is needed for.
  */
  '/summon/verify/',
  /*
    THE OPERATOR ROUTES AUTHENTICATE THEMSELVES, and must not be asked to be
    a traveller first.

    `/internal/open-area` and `/internal/verify` are machine-to-machine over
    `CHIVAGO_HOST_SECRET`. Behind this middleware they answered 401 to a
    caller holding a perfectly good operator secret, because the caller had
    no device key - so the only way to open an area on production was to
    REGISTER A PHONE first and be handed a wallet on the way in. Two accounts
    named "Operator probe" and "Operator" are on production for that reason,
    and nothing deletes them.

    `/admin/import` avoided this by being registered before the middleware.
    These are listed here instead, which does the same thing without moving
    a points-awarding handler around the file. A caller with no secret still
    gets 403 from the route itself; what changes is that it is the ROUTE
    refusing, rather than the traveller gate refusing on its behalf.
  */
  '/internal/',
  // `/assets/` is Metro's bundle output - the fonts and the JavaScript.
  // `/media/` is the repository's own photographs and illustrations, which
  // moved off `/assets/` because Metro's dev server shadows that prefix and
  // answered every one of them 404. Both must stay unauthenticated: a font
  // or a place photograph behind a 401 is the whole app sitting on LOADING.
  '/_expo/', '/assets/', '/media/', '/shops/media/', '/shops/guide-photos/', '/community/media/',
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
             && !c.req.path.startsWith('/auth/')
             && !openIdentityAllowed()) {
    // Registering and claiming are how a device GETS a key, so they cannot
    // require one. Everything else must now prove who it is.
    return fail(c, 'UNAUTHENTICATED', 'Sign in on this device to continue.', 401);
  }

  if (c.req.path.startsWith('/auth/')) {
    return next();
  }

  const id = userId(c);
  db.prepare('INSERT OR IGNORE INTO users (id, display_name, created_at) VALUES (?,?,?)').run(
    id, 'Traveller', new Date().toISOString());
  ensureWallet(db, id);
  grantOpeningBalance(db, id);
  await next();
});

app.onError((err, c) => err instanceof ShopError ? fail(c, err.code, err.message, err.status) : handleError(c, err));

app.get('/health', (c) => ok(c, { status: 'up', time: new Date().toISOString() }));

// ---------------------------------------------------------------------------
// Community feed
// ---------------------------------------------------------------------------

app.get('/community/feed', (c) => ok(c, {
  posts: listCommunityFeed(db, userId(c), num(c.req.query('limit'), 30)),
}));

app.post('/community/posts', async (c) => {
  if (!(c.req.header('content-type') ?? '').includes('multipart/form-data')) {
    return fail(c, 'MULTIPART_REQUIRED', 'Send the post as multipart/form-data.');
  }
  const form = await boundedForm(c, COMMUNITY_MEDIA_MAX_BYTES + 128 * 1024);
  const body = form.get('body');
  const file = form.get('file');
  return ok(c, createCommunityPost(db, userId(c), {
    body: typeof body === 'string' ? body : '',
    media: file instanceof File ? Buffer.from(await file.arrayBuffer()) : null,
  }));
});

app.post('/community/posts/:id/like', (c) =>
  ok(c, toggleCommunityLike(db, c.req.param('id'), userId(c))));

app.post('/community/posts/:id/comments', async (c) => {
  const body: { body?: unknown } = await c.req.json<{ body?: unknown }>().catch(() => ({}));
  return ok(c, addCommunityComment(
    db, c.req.param('id'), userId(c), typeof body.body === 'string' ? body.body : '',
  ));
});

app.post('/community/posts/:id/share', (c) =>
  ok(c, { shareCount: recordCommunityShare(db, c.req.param('id')) }));

app.get('/community/media/:id', (c) => {
  const media = readCommunityMedia(db, c.req.param('id'));
  if (!media) return fail(c, 'NOT_FOUND', 'This media is no longer available.', 404);
  c.header('content-type', media.mime);
  c.header('cache-control', 'public, max-age=3600');
  c.header('x-content-type-options', 'nosniff');
  return c.body(Buffer.from(media.bytes));
});

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
    locale: isLang(body.locale) ? body.locale : 'en',
  });
  ensureWallet(db, created.userId);
  grantOpeningBalance(db, created.userId);

  // The key is returned HERE and never again. Only its hash is stored.
  return ok(c, created);
});

/**
 * Real database user registration.
 */
/*
  Signing in with LINE (line-auth.ts, line-identity.ts).

  Two routes and no new secret-passing scheme. `/auth/line` sends the browser
  to LINE with a state and a nonce in a short-lived cookie; the callback checks
  both, asks LINE to verify its own id_token, and then hands the browser an
  ORDINARY LINK CODE in the URL fragment. The page claims it through
  `/account/claim`, which is how every other second device already gets a key.

  A fragment, not a query string: fragments are never sent to a server, so the
  code stays out of access logs and `Referer` headers.

  With no channel configured both routes answer 404, exactly as if LINE login
  had not been built.
*/
app.get('/auth/line', (c) => {
  const cfg = lineConfig();
  if (!cfg) return fail(c, 'NOT_FOUND', 'LINE sign-in is not set up on this server', 404);
  // Only ever back to this app. An open redirect on a login route hands a
  // phisher a link that starts on the real domain.
  const raw = c.req.query('next') ?? '/';
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
  const round = startRound(next);
  c.header('set-cookie', [
    `${LINE_OAUTH_COOKIE}=${encodeURIComponent(packRound(round))}`,
    'Path=/auth/line', 'HttpOnly', 'SameSite=Lax', 'Secure',
    `Max-Age=${Math.floor(OAUTH_TTL_MS / 1000)}`,
  ].join('; '));
  c.header('cache-control', 'no-store');
  return c.redirect(authorizeUrl(cfg, round), 302);
});

app.get('/auth/line/callback', async (c) => {
  const cfg = lineConfig();
  if (!cfg) return fail(c, 'NOT_FOUND', 'LINE sign-in is not set up on this server', 404);

  const round = unpackRound(
    (() => {
      const v = readCookie(c.req.header('cookie'), LINE_OAUTH_COOKIE);
      try { return v === undefined ? undefined : decodeURIComponent(v); } catch { return undefined; }
    })(),
  );
  // The cookie is spent whatever happens next, so a failed round cannot be replayed.
  c.header('set-cookie', `${LINE_OAUTH_COOKIE}=; Path=/auth/line; HttpOnly; SameSite=Lax; Secure; Max-Age=0`);
  c.header('cache-control', 'no-store');

  const back = (reason: string) => c.redirect(`${round?.next ?? '/'}#line=${reason}`, 302);

  // LINE says no when the traveller cancels. That is not an error to shout about.
  if (c.req.query('error')) return back('cancelled');
  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!round || !code || !state || !sameToken(state, round.state)) return back('expired');

  let sub: string | null = null;
  try {
    sub = await lineSubFor(cfg, code, round);
  } catch (e) {
    console.warn(`[line] ${e instanceof Error ? e.message : String(e)}`);
    return back('failed');
  }
  if (!sub) return back('failed');

  const deviceUserId = resolveDevice(db, c.req.header('x-chivago-device-key'));
  const seen = resolveLineSignIn(db, sub, deviceUserId, () => registerAccountDevice(db).userId);
  if (seen.outcome === 'clash' || !seen.userId) return back('clash');

  // The same single-use, ten-minute code the second-phone flow already uses.
  return back(`ok.${issueLinkCode(db, seen.userId)}.${seen.outcome}`);
});

app.post('/auth/register', async (c) => {
  if (!allowRegistration(clientAddress(c))) {
    return fail(c, 'TOO_MANY_REGISTRATIONS', 'Too many registration attempts. Please try again later.', 429);
  }

  const body = await c.req.json<{
    fullName?: string;
    email?: string;
    phone?: string;
    password?: string;
    accountType?: 'traveller' | 'operator';
    businessName?: string;
    locale?: 'th' | 'en';
  }>().catch(() => ({} as {
    fullName?: string;
    email?: string;
    phone?: string;
    password?: string;
    accountType?: 'traveller' | 'operator';
    businessName?: string;
    locale?: 'th' | 'en';
  }));

  try {
    const result = registerUser(db, {
      fullName: body.fullName ?? '',
      email: body.email ?? '',
      phone: body.phone ?? '',
      password: body.password ?? '',
      accountType: body.accountType,
      businessName: body.businessName,
      locale: isLang(body.locale) ? body.locale : 'en',
    });
    return ok(c, result);
  } catch (err) {
    if (err instanceof UserAuthError) {
      return fail(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * Real database user login with email/phone and password.
 */
app.post('/auth/login', async (c) => {
  const body = await c.req.json<{
    identifier?: string;
    password?: string;
    label?: string;
    accountType?: 'traveller' | 'operator';
  }>().catch(() => ({} as {
    identifier?: string;
    password?: string;
    label?: string;
    accountType?: 'traveller' | 'operator';
  }));

  try {
    const result = loginUser(db, {
      identifier: body.identifier ?? '',
      password: body.password ?? '',
      label: body.label?.trim() || undefined,
      accountType: body.accountType,
    });
    return ok(c, result);
  } catch (err) {
    if (err instanceof UserAuthError) {
      return fail(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/** Who this device is signed in as, and which phones share the account. */
app.get('/account', (c) => {
  const uid = userId(c);
  const userAccount = db.prepare(`
    SELECT a.account_type, a.business_name, u.display_name AS full_name, a.email, a.phone,
      p.bio, p.profile_photo_url,
      lower(substr(a.email, 1, instr(a.email, '@') - 1)) AS username
    FROM user_accounts a
    JOIN users u ON u.id = a.id
    LEFT JOIN profiles p ON p.user_id = a.id
    WHERE a.id = ?
  `).get(uid) as {
    account_type: string;
    business_name: string | null;
    full_name: string;
    email: string;
    phone: string;
    username: string;
    bio: string | null;
    profile_photo_url: string | null;
  } | undefined;

  return ok(c, {
    userId: uid,
    accountType: (userAccount?.account_type ?? 'traveller') as 'traveller' | 'operator',
    businessName: userAccount?.business_name ?? null,
    fullName: userAccount?.full_name ?? null,
    email: userAccount?.email ?? null,
    phone: userAccount?.phone ?? null,
    username: userAccount?.username ?? '',
    bio: userAccount?.bio ?? null,
    profilePhotoUrl: userAccount?.profile_photo_url ?? null,
    devices: devicesFor(db, uid, c.req.header('x-chivago-device-key')),
  });
});

app.post('/account/profile/photo', async (c) => {
  const contentType = c.req.header('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) return fail(c, 'MULTIPART_REQUIRED', 'Send the profile photo as multipart/form-data.', 400);
  const form = await boundedForm(c, 6 * 1024 * 1024);
  const file = form.get('photo');
  if (!(file instanceof File)) return fail(c, 'FILE_REQUIRED', 'เลือกรูปโปรไฟล์ก่อน', 400);
  if (!file.type.startsWith('image/')) return fail(c, 'INVALID_FILE', 'ไฟล์โปรไฟล์ต้องเป็นรูปภาพ', 415);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > 5 * 1024 * 1024) return fail(c, 'FILE_TOO_LARGE', 'รูปโปรไฟล์ต้องมีขนาดไม่เกิน 5MB', 413);
  const photo = `data:${file.type};base64,${bytes.toString('base64')}`;
  const uid = userId(c);
  db.prepare('INSERT INTO profiles (user_id, profile_photo_url) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET profile_photo_url = excluded.profile_photo_url').run(uid, photo);
  return ok(c, { profilePhotoUrl: photo });
});

app.put('/account/profile', async (c) => {
  const uid = userId(c);
  const account = db.prepare('SELECT account_type, business_name FROM user_accounts WHERE id = ?').get(uid) as { account_type: string; business_name: string | null } | undefined;
  if (!account) return fail(c, 'LOGIN_REQUIRED', 'เข้าสู่ระบบก่อนแก้ไขข้อมูล', 401);
  const body: { fullName?: string; businessName?: string; email?: string; phone?: string; bio?: string; profilePhotoUrl?: string | null } = await c.req.json<{ fullName?: string; businessName?: string; email?: string; phone?: string; bio?: string; profilePhotoUrl?: string | null }>().catch(() => ({} as { fullName?: string; businessName?: string; email?: string; phone?: string; bio?: string; profilePhotoUrl?: string | null }));
  const fullName = String(body.fullName ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const phone = String(body.phone ?? '').trim().replace(/[-\s]/g, '');
  if (fullName.length < 2) return fail(c, 'NAME_INVALID', 'กรุณากรอกชื่อ-นามสกุล', 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(c, 'EMAIL_INVALID', 'รูปแบบอีเมลไม่ถูกต้อง', 400);
  if (!/^\+?[0-9]{8,15}$/.test(phone)) return fail(c, 'PHONE_INVALID', 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง', 400);
  const duplicate = db.prepare('SELECT id FROM user_accounts WHERE (lower(email) = ? OR phone = ?) AND id <> ?').get(email, phone, uid) as { id: string } | undefined;
  if (duplicate) return fail(c, 'CONTACT_EXISTS', 'อีเมลหรือเบอร์โทรนี้ถูกใช้งานแล้ว', 409);
  db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(fullName, uid);
  const businessName = String(body.businessName ?? '').trim();
  db.prepare('UPDATE user_accounts SET business_name = CASE WHEN account_type = \'operator\' AND ? <> \'\' THEN ? ELSE business_name END WHERE id = ?').run(businessName, businessName, uid);
  db.prepare('UPDATE user_accounts SET email = ?, phone = ?, updated_at = ? WHERE id = ?').run(email, phone, new Date().toISOString(), uid);
  db.prepare('INSERT INTO profiles (user_id, bio, profile_photo_url) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET bio = excluded.bio, profile_photo_url = COALESCE(excluded.profile_photo_url, profiles.profile_photo_url)').run(uid, body.bio?.trim() ?? null, body.profilePhotoUrl ?? null);
  const refreshed = db.prepare('SELECT account_type, business_name FROM user_accounts WHERE id = ?').get(uid) as { account_type: string; business_name: string | null };
  const profile = db.prepare('SELECT bio, profile_photo_url FROM profiles WHERE user_id = ?').get(uid) as { bio: string | null; profile_photo_url: string | null } | undefined;
  return ok(c, { userId: uid, accountType: refreshed.account_type as 'traveller' | 'operator', businessName: refreshed.business_name, fullName, email, phone, username: email.split('@')[0], bio: profile?.bio ?? null, profilePhotoUrl: profile?.profile_photo_url ?? null });
});

// A shop is owned by the signed-in operator account. The client never supplies owner_id.
app.get('/shops', (c) => {
  const q = c.req.query();
  if (q.area && !isAreaKey(q.area)) return fail(c, 'INVALID_AREA', 'ไม่พบพื้นที่นี้', 400);
  const minRating = q.minRating ? Number(q.minRating) : 0;
  if (!Number.isFinite(minRating) || minRating < 0 || minRating > 5) return fail(c, 'INVALID_RATING', 'คะแนนขั้นต่ำต้องเป็น 0–5', 400);
  const data = listShops(db, q, userId(c));
  return ok(c, data, { total: data.length });
});
app.get('/shops/media/:id', (c) => {
  const media = row<{ mime_type: string; bytes: Uint8Array; review_id: string | null }>(db.prepare(`SELECT m.mime_type,m.bytes,m.review_id FROM local_shop_media m
    LEFT JOIN local_shop_reviews r ON r.id=m.review_id WHERE m.id=? AND (m.review_id IS NULL OR r.hidden_at IS NULL)`).get(c.req.param('id')));
  if (!media) return fail(c, 'NOT_FOUND', 'ไม่พบรูปภาพ', 404);
  c.header('content-type', media.mime_type);
  c.header('cache-control', media.review_id ? 'no-store' : 'public, max-age=3600');
  c.header('x-content-type-options', 'nosniff');
  return c.body(Buffer.from(media.bytes));
});
app.get('/shops/guide-photos/:id', (c) => {
  /* A guide profile photo is public while the guide profile is active. */
  const photo = row<{ mime_type: string; bytes: Uint8Array; owner_id: string; active: number; guide_status: string }>(
    db.prepare(`SELECT p.mime_type, p.bytes, s.owner_id, s.active, s.guide_status
      FROM local_guide_profile_photos p JOIN local_shops s ON s.id = p.shop_id WHERE p.id = ?`).get(c.req.param('id')),
  );
  if (!photo) return fail(c, 'NOT_FOUND', 'ไม่พบรูปโปรไฟล์', 404);
  /*
   * The key is resolved here rather than read from the context, because this
   * is a public path: the auth middleware returns early on those, so it never
   * sets `userId`, and `userId(c)` would fall back to 'demo-user' and match
   * nobody. An owner looking at their own pending profile would have been
   * refused their own photograph.
   */
  const key = c.req.header('x-chivago-device-key');
  const viewer = key === undefined ? null : resolveDevice(db, key);
  if (!photo.active && photo.owner_id !== viewer) {
    return fail(c, 'NOT_FOUND', 'ไม่พบรูปโปรไฟล์', 404);
  }
  c.header('content-type', photo.mime_type);
  c.header('cache-control', 'no-store');
  c.header('x-content-type-options', 'nosniff');
  return c.body(Buffer.from(photo.bytes));
});
app.get('/shops/:id', (c) => {
  const shop = getShop(db, c.req.param('id'), userId(c));
  return shop ? ok(c, shop) : fail(c, 'NOT_FOUND', 'ไม่พบร้านค้า', 404);
});
app.post('/shops', async (c) => ok(c, saveShop(db, userId(c), await c.req.json<Record<string, unknown>>().catch(() => ({})))));
app.put('/shops/:id', async (c) => ok(c, saveShop(db, userId(c), await c.req.json<Record<string, unknown>>().catch(() => ({})), c.req.param('id'))));
app.delete('/shops/:id', (c) => { deleteShop(db, userId(c), c.req.param('id')); return ok(c, { deleted: true }); });
app.post('/shops/:id/guide-document', async (c) => {
  const shopId = c.req.param('id');
  ownedShop(db, userId(c), shopId);
  const shop = row<{ service_type: string }>(db.prepare('SELECT service_type FROM local_shops WHERE id=?').get(shopId));
  if (shop?.service_type !== 'guide') return fail(c, 'GUIDE_PROFILE_REQUIRED', 'เอกสารนี้ใช้ได้กับโปรไฟล์ไกด์เท่านั้น', 400);
  if (!(c.req.header('content-type') ?? '').includes('multipart/form-data')) return fail(c, 'MULTIPART_REQUIRED', 'ส่งเอกสารแบบ multipart', 400);
  const form = await boundedForm(c, 5 * 1024 * 1024 + 64 * 1024);
  const file = form.get('photo');
  if (!(file instanceof File)) return fail(c, 'DOCUMENT_REQUIRED', 'กรุณาเลือกภาพใบอนุญาตมัคคุเทศก์', 400);
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? 'image/jpeg'
    : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : null;
  if (!mime || bytes.length > 5 * 1024 * 1024) return fail(c, 'INVALID_DOCUMENT', 'ใช้ไฟล์ JPG, PNG หรือ WebP ไม่เกิน 5MB', 415);
  const id = randomUUID();
  transact(db, () => {
    db.prepare('INSERT INTO local_guide_documents(id,shop_id,mime_type,bytes,uploaded_at) VALUES(?,?,?,?,?) ON CONFLICT(shop_id) DO UPDATE SET id=excluded.id,mime_type=excluded.mime_type,bytes=excluded.bytes,uploaded_at=excluded.uploaded_at')
      .run(id, shopId, mime, bytes, new Date().toISOString());
    db.prepare("UPDATE local_shops SET guide_status='pending',guide_reviewed_at=NULL,guide_reviewed_by=NULL,updated_at=? WHERE id=?").run(new Date().toISOString(), shopId);
  });
  return ok(c, { uploaded: true, reviewStatus: 'pending' });
});
app.post('/shops/:id/guide-photo', async (c) => {
  const shopId = c.req.param('id');
  ownedShop(db, userId(c), shopId);
  const shop = row<{ service_type: string }>(db.prepare('SELECT service_type FROM local_shops WHERE id=?').get(shopId));
  if (shop?.service_type !== 'guide') return fail(c, 'GUIDE_PROFILE_REQUIRED', 'รูปโปรไฟล์ใช้ได้กับไกด์เท่านั้น', 400);
  if (!(c.req.header('content-type') ?? '').includes('multipart/form-data')) return fail(c, 'MULTIPART_REQUIRED', 'ส่งรูปภาพแบบ multipart', 400);
  const form = await boundedForm(c, 5 * 1024 * 1024 + 64 * 1024);
  const file = form.get('photo');
  if (!(file instanceof File)) return fail(c, 'PHOTO_REQUIRED', 'เลือกรูปโปรไฟล์ก่อน', 400);
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? 'image/jpeg'
    : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : null;
  if (!mime || bytes.length > 5 * 1024 * 1024) return fail(c, 'INVALID_PHOTO', 'ใช้ไฟล์ JPG, PNG หรือ WebP ไม่เกิน 5MB', 415);
  const id = randomUUID();
  const now = new Date().toISOString();
  transact(db, () => {
    db.prepare('INSERT INTO local_guide_profile_photos(id,shop_id,mime_type,bytes,uploaded_at) VALUES(?,?,?,?,?) ON CONFLICT(shop_id) DO UPDATE SET id=excluded.id,mime_type=excluded.mime_type,bytes=excluded.bytes,uploaded_at=excluded.uploaded_at')
      .run(id, shopId, mime, bytes, now);
    db.prepare("UPDATE local_shops SET guide_status='pending',guide_reviewed_at=NULL,guide_reviewed_by=NULL,updated_at=? WHERE id=?").run(now, shopId);
  });
  return ok(c, { id, url: `/shops/guide-photos/${id}` });
});
app.delete('/shops/:id/guide-photo', (c) => {
  const shopId = c.req.param('id');
  ownedShop(db, userId(c), shopId);
  const now = new Date().toISOString();
  transact(db, () => {
    db.prepare('DELETE FROM local_guide_profile_photos WHERE shop_id=?').run(shopId);
    db.prepare("UPDATE local_shops SET guide_status='pending',guide_reviewed_at=NULL,guide_reviewed_by=NULL,updated_at=? WHERE id=? AND service_type='guide'").run(now, shopId);
  });
  return ok(c, { deleted: true });
});
app.post('/shops/:id/images', async (c) => {
  const shopId = c.req.param('id');
  const kind = c.req.query('kind');
  const reviewId = kind === 'review'
    ? row<{ id: string }>(db.prepare('SELECT id FROM local_shop_reviews WHERE shop_id=? AND user_id=?').get(shopId, userId(c)))?.id
    : null;
  if (kind === 'review' && !reviewId) return fail(c, 'REVIEW_REQUIRED', 'เขียนรีวิวก่อนเพิ่มรูป', 403);
  if (kind !== 'review') {
    ownedShop(db, userId(c), shopId);
    if (kind !== 'cover' && kind !== 'interior') return fail(c, 'INVALID_KIND', 'ชนิดรูปภาพไม่ถูกต้อง', 400);
  }
  if (!(c.req.header('content-type') ?? '').includes('multipart/form-data')) return fail(c, 'MULTIPART_REQUIRED', 'ส่งรูปภาพแบบ multipart', 400);
  const form = await boundedForm(c, 5 * 1024 * 1024 + 64 * 1024);
  const file = form.get('photo');
  if (!(file instanceof File)) return fail(c, 'PHOTO_REQUIRED', 'เลือกรูปภาพก่อน', 400);
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? 'image/jpeg'
    : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : null;
  if (!mime || bytes.length > 5 * 1024 * 1024) return fail(c, 'INVALID_PHOTO', 'ใช้ไฟล์ JPG, PNG หรือ WebP ไม่เกิน 5MB', 415);
  if (kind === 'interior') {
    const count = row<{ count: number }>(db.prepare("SELECT COUNT(*) AS count FROM local_shop_media WHERE shop_id=? AND kind='interior'").get(shopId))?.count ?? 0;
    if (count >= 12) return fail(c, 'PHOTO_LIMIT', 'รูปภายในร้านได้สูงสุด 12 รูป', 400);
  }
  const id = randomUUID();
  transact(db, () => {
    if (kind === 'cover' || kind === 'review') db.prepare('DELETE FROM local_shop_media WHERE shop_id=? AND kind=? AND review_id IS ?').run(shopId, kind, reviewId ?? null);
    db.prepare('INSERT INTO local_shop_media(id,shop_id,review_id,kind,mime_type,bytes,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(id, shopId, reviewId ?? null, kind ?? '', mime, bytes, new Date().toISOString());
  });
  return ok(c, { id, url: `/shops/media/${id}` });
});
app.delete('/shops/:id/images/:imageId', (c) => {
  const shopId = c.req.param('id');
  const media = row<{ review_id: string | null }>(db.prepare('SELECT review_id FROM local_shop_media WHERE id=? AND shop_id=?').get(c.req.param('imageId'), shopId));
  if (!media) return fail(c, 'NOT_FOUND', 'ไม่พบรูปภาพ', 404);
  if (media.review_id) {
    if (!row(db.prepare('SELECT 1 FROM local_shop_reviews WHERE id=? AND user_id=?').get(media.review_id, userId(c))))
      return fail(c, 'FORBIDDEN', 'ลบได้เฉพาะรูปรีวิวของตนเอง', 403);
  } else ownedShop(db, userId(c), shopId);
  db.prepare('DELETE FROM local_shop_media WHERE id=?').run(c.req.param('imageId'));
  return ok(c, { deleted: true });
});
app.get('/shops/:id/reviews', (c) => ok(c, listShopReviews(db, c.req.param('id'), c.req.query('cursor'), userId(c))));
app.get('/shops/:id/reviews/mine', (c) => ok(c, { review: ownReview(db, c.req.param('id'), userId(c)) }));
app.put('/shops/:id/reviews/mine', async (c) => {
  const body = await c.req.json<{ rating?: unknown; body?: unknown }>().catch(() => ({} as { rating?: unknown; body?: unknown }));
  return ok(c, { id: saveShopReview(db, userId(c), c.req.param('id'), body.rating, body.body) });
});
app.delete('/shops/:id/reviews/mine', (c) => ok(c, { deleted: deleteShopReview(db, userId(c), c.req.param('id')) }));
app.put('/shops/:id/reviews/:reviewId/reply', async (c) => {
  const body = await c.req.json<{ reply?: unknown }>().catch(() => ({} as { reply?: unknown }));
  replyReview(db, userId(c), c.req.param('id'), c.req.param('reviewId'), body.reply);
  return ok(c, { replied: true });
});
app.post('/shops/:id/reviews/:reviewId/reports', async (c) => {
  const body = await c.req.json<{ reason?: unknown }>().catch(() => ({} as { reason?: unknown }));
  reportShopReview(db, userId(c), c.req.param('id'), c.req.param('reviewId'), body.reason);
  return ok(c, { reported: true });
});

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

/**
 * A rider saw one.
 *
 * MUST BE DECLARED BELOW THE AUTHENTICATION MIDDLEWARE. Hono matches in
 * registration order, so a write registered above it never passes through
 * it: the first version of this sat beside the read route two hundred lines
 * up, every sighting was filed under the fallback account instead of the
 * rider who tapped, and the second rider at a stop therefore looked like the
 * first one pressing twice. Found by tapping it twice from two devices.
 *
 * Refusals are not errors: an unknown route is a 404 because the client asked
 * about something that does not exist, but a double-tap inside the
 * same-vehicle window comes back 200 with `recorded: false`, because nothing
 * went wrong - the app should simply show the same headway again rather than
 * a red message for a second press.
 */
app.post('/transit/:routeId/seen', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { stopId?: unknown };
  if (typeof body.stopId !== 'string') return fail(c, 'BAD_REQUEST', 'stopId is required', 400);
  const result = reportSighting(db, {
    userId: userId(c), routeId: c.req.param('routeId'), stopId: body.stopId,
  });
  if (result.because === 'unknown-route') return fail(c, 'NOT_FOUND', 'No such route', 404);
  if (result.because === 'unknown-stop') return fail(c, 'NOT_FOUND', 'That stop is not on this route', 404);
  return ok(c, result);
});

/**
 * What runs to this area, and what riders have said about it today.
 *
 * BELOW THE CORS MIDDLEWARE, like every route a browser calls. The first
 * version sat with the other `/areas/` routes a hundred lines up, above
 * `app.use('*', cors())` - Hono matches in registration order, so the reply
 * carried no allow-origin header, the web app's request failed before it
 * arrived, and the card simply never drew. `/areas/:key/monsters` survives up
 * there only because it sets the header by hand.
 *
 * It stays PUBLIC without doing anything: `/areas/` is a public prefix, so
 * the authentication middleware waves it through.
 *
 * The routes are seed content read from OpenStreetMap; the headway is the
 * only part this server computes, and it is computed from reports rather
 * than from a timetable, because nobody publishes one. The wording that
 * keeps those apart lives in core (`sayHeadway`), not here.
 */
app.get('/areas/:key/transit', (c) => {
  const key = c.req.param('key');
  if (!isAreaKey(key)) return fail(c, 'NOT_FOUND', 'No such area', 404);
  const routes = routesForArea(db, key);
  return ok(c, { routes, campus: routes.filter((r) => r.kind === 'campus') }, { total: routes.length });
});

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
 * The stalls at a place that take orders ahead, live from สั่งก่อน (docs/65).
 *
 * Its own route rather than a field on the place: the place is scored for the
 * map, the planner and the monsters, and none of those should wait on a
 * kitchen queue. A place without stalls answers an empty list, not a 404 -
 * the screen only asks for places that have them, and one shape is one shape.
 */
app.get('/places/:id/stalls', async (c) => {
  const id = c.req.param('id');
  if (!row(db.prepare('SELECT 1 AS one FROM places WHERE id = ?').get(id))) return fail(c, 'NOT_FOUND', 'No such place', 404);
  return ok(c, await getStalls(id));
});

/**
 * How many courts are free at a place you book before you go, live from the
 * venue's own booking system (courts.ts).
 *
 * Its own route, for the same reason the stalls have one: the place is scored
 * for the map, the planner and the monsters, and none of those should wait on
 * someone else's booking system. A place without courts answers a null count,
 * not a 404 - the screen only asks for places that have them, and one shape is
 * one shape.
 */
app.get('/places/:id/courts', async (c) => {
  const id = c.req.param('id');
  if (!row(db.prepare('SELECT 1 AS one FROM places WHERE id = ?').get(id))) return fail(c, 'NOT_FOUND', 'No such place', 404);
  return ok(c, await getCourts(id));
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
        await storePhoto(db, {
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

    startAssist(result.proofId);
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
/**
 * Open an area on the database this process is talking to.
 *
 * THE ONLY WAY CONTENT REACHES A DURABLE OBJECT. `seed-db.ts` and the
 * `seed-area.ts` CLI both open a local SQLite file, so on Cloudflare there was
 * no way to get a quest in at all - which is how production spent a week
 * serving two Ko Sichang quests while the code, the deck and the field guide
 * all said five. See the note at the top of `area-opening.ts`.
 *
 * INSERT ONLY, plus retiring the quests the seed replaced. It never asserts
 * the seed over a row that exists and never touches another area, so it is
 * safe against a database with travellers in it - which `seed-db.ts`, with its
 * prune, is not, and says so by refusing.
 *
 * Guarded by the same operator secret as `/internal/verify`, and for the same
 * stated reason: replace with something better before public launch.
 */
app.post('/internal/open-area', async (c) => {
  const secret = process.env.CHIVAGO_HOST_SECRET;
  if (!secret || c.req.header('x-host-secret') !== secret) {
    return fail(c, 'FORBIDDEN', 'Host credentials required', 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as { area?: unknown; photos?: unknown };
  if (!isAreaKey(body.area)) {
    return fail(c, 'BAD_AREA', `area must be one of ${AREAS.map((a) => a.key).join(', ')}`);
  }
  const result = openArea(db, body.area);
  /*
    `{ "photos": true }`, and only then.

    Opening an area INSERTS and never asserts the seed over a row that is
    already live - that is the promise which makes this route safe to run
    against a database with travellers in it. Photographs are the one
    exception the seed owns outright (the file is in this repository and its
    credit and licence are beside it), so `refreshPhotos` brings them in line
    - but it is a separate thing to ask for, said out loud in the body, and
    it reports which places changed rather than claiming the run was ordinary.

    It exists because Koniix went on the map with no photograph and one
    arrived an hour later: `seedArea` could not attach it, and the tool that
    could was on the Node side of a wall a Durable Object cannot cross.
  */
  const photosRefreshed = body.photos === true ? refreshPhotos(db, body.area) : [];
  console.log(
    `[chivago] area ${result.area}: +${result.questsAdded}/${result.questsTotal} quests, `
    + `+${result.placesAdded}/${result.placesTotal} places, `
    + `retired ${result.retired.deleted.length} deleted / ${result.retired.kept.length} kept`,
  );
  /*
    The console keys a new host is issued are shown ONCE, by the CLI, to a
    person. This route is machine-to-machine over a shared secret, so it says
    how many were issued and not what they are - a key in a response body is a
    key in a log, in a proxy and in somebody's shell history.
  */
  return ok(c, {
    ...result, keys: undefined, keysIssued: result.keys.length, photosRefreshed,
  });
});

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
      // `value_thb` is SNAPSHOT here, not joined on read: a merchant
      // repricing next year must not reprice the voucher already in
      // somebody's phone. Null stays null - unpriced is not zero.
      `INSERT INTO vouchers (id, offer_id, user_id, merchant, code, cost_points,
         value_thb, issued_at, expires_at, status)
       VALUES (?,?,?,?,?,?,?,?,?,'active')`,
    ).run(voucherId, offer.id, id, offer.merchant, code, offer.costPoints,
          offer.valueTHB, now.toISOString(), expires.toISOString());
    return {
      id: voucherId, offerId: offer.id, userId: id, merchant: offer.merchant,
      code, costPoints: offer.costPoints, valueTHB: offer.valueTHB, issuedAt: now.toISOString(),
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
      cost_points: number; value_thb: number | null; issued_at: string; expires_at: string;
      redeemed_at: string | null; status: string;
    }[];
  const vouchers: Voucher[] = rows.map((r) => ({
    id: r.id,
    offerId: r.offer_id,
    userId: r.user_id,
    merchant: r.merchant,
    code: r.code,
    costPoints: r.cost_points,
    valueTHB: r.value_thb ?? null,
    issuedAt: r.issued_at,
    expiresAt: r.expires_at,
    redeemedAt: r.redeemed_at,
    status: r.status as Voucher['status'],
  }));
  return ok(c, vouchers, { total: vouchers.length });
});

// ---------------------------------------------------------------------------
// Listings and inquiries — docs/61. A question, not a booking.
// ---------------------------------------------------------------------------

/**
 * What operators offer, for anybody using the app.
 *
 * Behind a device key, exactly as `/offers` is - NOT on the public list. Every
 * phone running the app has a key, so nobody using it is shut out; putting
 * listings on PUBLIC_PATHS would be a decision to show them to the open web,
 * and that is a separate decision from building them.
 */
app.get('/listings', (c) => {
  const listings = listingCards(db);
  return ok(c, listings, { total: listings.length });
});

/**
 * Ask an operator a question.
 *
 * Every problem with the inquiry comes back at once rather than one per
 * attempt: named in the message, which is what the phone shows, and as a list
 * for a client that wants to place each one beside its field.
 */
app.post('/listings/:id/inquiries', async (c) => {
  const body = await c.req.json().catch(() => ({})) as {
    forDate?: unknown; partySize?: unknown; message?: unknown;
  };
  try {
    const inquiry = sendInquiry(db, {
      listingId: c.req.param('id'),
      userId: userId(c),
      forDate: String(body.forDate ?? ''),
      partySize: Number(body.partySize),
      message: String(body.message ?? ''),
    });
    return ok(c, inquiry);
  } catch (err) {
    if (err instanceof InvalidInquiry) {
      return c.json({ ok: false, code: 'INVALID_INQUIRY', error: err.message, problems: err.problems }, 400);
    }
    throw err;
  }
});

/** A traveller's own questions, newest first, each with its derived state. */
app.get('/inquiries', (c) => {
  const inquiries = travellerInquiries(db, userId(c));
  return ok(c, inquiries, { total: inquiries.length });
});

app.post('/inquiries/:id/withdraw', (c) => {
  try {
    return ok(c, withdrawInquiry(db, userId(c), c.req.param('id')));
  } catch (err) {
    if (err instanceof InvalidInquiry) return fail(c, 'INVALID_INQUIRY', err.message, 400);
    throw err;
  }
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
 * Post one. Multipart: `file` (a clip or a photograph) and `caption`.
 * This is social content about a place, not proof of presence, so it does
 * not accept or store a location.
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
  const caption = form.get('caption');
  const story = await submitStory(db, {
    userId: userId(c),
    placeId: c.req.param('id'),
    bytes: Buffer.from(await file.arrayBuffer()),
    caption: typeof caption === 'string' ? caption : '',
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

// ---------------------------------------------------------------------------
// Party invitations
//
// The discovery layer, and the one rule that shapes every route below: an
// invitation is posted at a PLACE, never at a person. No route here accepts a
// position, returns one, or could be made to leak one — `InviteListing` has
// nowhere to put it and this file never builds anything else.
//
// So there is deliberately no `GET /invites/nearby?lat=&lng=`. A client that
// wants to know what is near it already knows where it is; it asks `/places`
// with a bounding box, as it always has, and asks here about the places that
// came back. The server never learns where anybody is standing.
// ---------------------------------------------------------------------------

/** How many parties are asking at each place. A count, never a name. */
app.get('/invites/pins', (c) => {
  const ids = (c.req.query('places') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const counts = openInviteCounts(db, ids);
  const crowd = checkinsLastHour(db, ids);
  // Two kinds of fact, said separately and never added. The crowd figure is
  // history the island produced; the invitation count is a plan somebody
  // typed. `pinLine` keeps them apart in both languages.
  return ok(c, {
    pins: ids.map((id) => {
      const invitesOpen = counts.get(id) ?? 0;
      const checked = crowd.get(id)?.checkinsLastHour ?? 0;
      return { placeId: id, invitesOpen, checkinsLastHour: checked, line: pinLine(invitesOpen, checked) };
    }),
  });
});

/** The open invitations at one place, as a stranger may see them. */
app.get('/invites', (c) => {
  const placeId = c.req.query('place');
  if (!placeId) return fail(c, 'PLACE_REQUIRED', 'Ask about a place.');
  return ok(c, {
    invitations: listingsAt(db, placeId, userId(c)),
    doesNot: INVITE_DOES_NOT,
  });
});

/** What my own party currently has up, so a screen can offer to close it. */
app.get('/invites/mine', (c) => {
  const party = activePartyFor(db, userId(c));
  return ok(c, {
    invitation: party ? openInviteFor(db, party.id) : null,
    requests: requestsBy(db, userId(c)),
    doesNot: INVITE_DOES_NOT,
  });
});

/** Requests my party has to answer. Name and verified count, nothing else. */
app.get('/invites/requests', (c) => ok(c, { waiting: pendingFor(db, userId(c)) }));

/**
 * Post one.
 *
 * Eight refusals, eight sentences. A single "could not post" would send
 * somebody to change the wrong field — the same reason the join route below
 * has four.
 */
app.post('/invites', async (c) => {
  type PostBody = { placeId?: string; from?: string; until?: string; spaces?: number; note?: string };
  const body = await c.req.json<PostBody>().catch(() => ({} as PostBody));
  if (!body.placeId || !body.from || !body.until) {
    return fail(c, 'INVITE_INCOMPLETE', 'A place and a time are both needed.');
  }
  try {
    const invitation = postInvite(db, userId(c), {
      placeId: body.placeId,
      from: body.from,
      until: body.until,
      spaces: body.spaces ?? 1,
      note: body.note ?? null,
    });
    return ok(c, { invitation, doesNot: INVITE_DOES_NOT });
  } catch (err) {
    if (err instanceof InviteRefused) {
      const line = POST_REFUSAL[err.reason as keyof typeof POST_REFUSAL];
      return fail(c, `INVITE_${err.reason.toUpperCase().replaceAll('-', '_')}`,
        line?.en ?? 'That invitation cannot be posted.', 400);
    }
    throw err;
  }
});

/** Close it. Anybody in the party may, not only whoever posted it. */
app.post('/invites/:id/close', (c) =>
  ok(c, { closed: closeInvite(db, userId(c), c.req.param('id')) }));

/** Ask to come along. Writes a request; a human in the party decides. */
app.post('/invites/:id/request', (c) => {
  try {
    requestJoin(db, userId(c), c.req.param('id'));
    return ok(c, { asked: true });
  } catch (err) {
    if (err instanceof InviteRefused) {
      const line = REQUEST_REFUSAL[err.reason as keyof typeof REQUEST_REFUSAL];
      return fail(c, `REQUEST_${err.reason.toUpperCase().replaceAll('-', '_')}`,
        line?.en ?? 'That invitation cannot be joined.', 400);
    }
    throw err;
  }
});

/** Take it back. Only ever touches the asker's own row. */
app.post('/invites/:id/withdraw', (c) =>
  ok(c, { withdrawn: withdrawRequest(db, userId(c), c.req.param('id')) }));

/**
 * Say yes or no.
 *
 * Accepting joins them through the same checks a code join runs, so a party
 * that filled up between the ask and the answer refuses here rather than
 * growing to nine.
 */
app.post('/invites/:id/decide', async (c) => {
  type DecideBody = { userId?: string; accept?: boolean };
  const body = await c.req.json<DecideBody>().catch(() => ({} as DecideBody));
  if (!body.userId || typeof body.accept !== 'boolean') {
    return fail(c, 'DECISION_INCOMPLETE', 'Say who, and yes or no.');
  }
  try {
    const outcome = decideRequest(db, userId(c), c.req.param('id'), body.userId, body.accept);
    return ok(c, { outcome });
  } catch (err) {
    if (err instanceof InviteRefused) {
      const line = REQUEST_REFUSAL[err.reason as keyof typeof REQUEST_REFUSAL];
      return fail(c, `DECIDE_${err.reason.toUpperCase().replaceAll('-', '_')}`,
        line?.en ?? 'That request cannot be answered.', 400);
    }
    throw err;
  }
});

app.get('/companions', (c) => {
  const evidence = habitatEvidenceFor(db, userId(c));
  const companions = companionsFor(evidence);
  return ok(c, { companions, summary: collectionSummary(companions), speciesAsOf: SPECIES_AS_OF });
});

// ---------------------------------------------------------------------------
// The Summoning (docs/68)
//
// A charm, earned, becomes a spirit - and nothing else. No route below
// touches `wallets`, writes to `ledger`, issues a voucher or grants EXP, and
// none of them takes a payment of any kind. That is not an omission; it is
// the line that keeps this a collection rather than a draw (docs/58).
// ---------------------------------------------------------------------------

/** The state, the collection counts, the live epoch's commitment and the published table. */
app.get('/summon', (c) => ok(c, summonState(db, userId(c))));

/** Every spirit; the unmet ones as a silhouette with a rarity and a court. */
app.get('/summon/collection', (c) => ok(c, {
  spirits: collectionFor(db, userId(c)),
  // The fashion that went into the same box, so the guide shows the whole
  // thing rather than the two thirds of it that are spirits.
  fashion: fashionFor(db, userId(c)),
}));

/** The traveller's own receipts, newest first. */
app.get('/summon/history', (c) => ok(c, { summons: historyFor(db, userId(c), num(c.req.query('limit'), 50)) }));

/**
 * Recheck one roll against the published seed.
 *
 * Public, deliberately, and by summon id alone: the point of a receipt is
 * that somebody who does not have an account can be handed one and check it.
 * It reveals a spirit key and two integers, which is what the receipt says
 * anyway, and no traveller's name.
 */
app.get('/summon/verify/:id', (c) => ok(c, verifySummon(db, c.req.param('id'))));

/**
 * One pull, or ten.
 *
 * `pulls` is 1 or 10 and nothing else: the ten has a published price and a
 * number in between would need one of its own. Anything unrecognised is read
 * as one rather than refused, so an older client that sends no body at all
 * keeps working.
 */
app.post('/summon', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    category?: unknown; quantity?: unknown; pulls?: unknown; idempotencyKey?: unknown;
  };
  if (body.category !== 'mascot' && body.category !== 'fashion') {
    return fail(c, 'BAD_REQUEST', 'Category must be mascot or fashion.');
  }
  const quantity = body.quantity ?? body.pulls;
  if (quantity !== 1 && quantity !== TEN_PULL_SIZE) {
    return fail(c, 'BAD_REQUEST', 'Quantity must be 1 or 10.');
  }
  if (typeof body.idempotencyKey !== 'string' || body.idempotencyKey.length < 8 || body.idempotencyKey.length > 128) {
    return fail(c, 'BAD_REQUEST', 'A unique idempotency key is required.');
  }
  return ok(c, pull(db, userId(c), {
    category: body.category,
    quantity,
    idempotencyKey: body.idempotencyKey,
  }));
});

/**
 * Choose one outright, for stardust. The door with no luck in it - see
 * `forge` in summon-service.ts for why it has to exist.
 */
app.post('/summon/forge', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { spirit?: string };
  if (typeof body.spirit !== 'string' || body.spirit === '') {
    return fail(c, 'BAD_REQUEST', 'Name the spirit to forge.');
  }
  return ok(c, forge(db, userId(c), body.spirit));
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

/** A traveller's own tree promise and proof, never another person's record. */
app.get('/impact/trees', (c) => {
  const impact = treeImpactForUser(db, userId(c));
  return ok(c, {
    ...impact,
    lines: impact.lines.map((line) => {
      const sponsor = row<{ name_en: string; name_th: string }>(
        db.prepare('SELECT name_en, name_th FROM organisations WHERE id = ?').get(line.sponsorId),
      );
      const quest = row<{ name_en: string; name_th: string }>(
        db.prepare('SELECT name_en, name_th FROM quests WHERE id = ?').get(line.questId),
      );
      return {
        ...line,
        sponsorName: { en: sponsor?.name_en ?? line.sponsorId, th: sponsor?.name_th ?? line.sponsorId },
        questName: { en: quest?.name_en ?? line.questId, th: quest?.name_th ?? line.questId },
      };
    }),
  });
});

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
      locale: isLang(body.locale) ? body.locale : 'en',
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

export { app, db };
