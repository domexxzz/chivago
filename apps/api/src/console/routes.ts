/**
 * Host console routes.
 *
 * Mounted at /console. Session-cookie authenticated, host-scoped, and the only
 * human-facing way to release points.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';

import type { DB } from '../db.ts';
import {
  login, logout, pruneSessions, readCookie, resolveSession,
  SESSION_COOKIE, SESSION_TTL_MS, type HostSession,
} from '../host-auth.ts';
import {
  esgReport, isRejectionReasonKey, sponsorOutcome,
  type EsgPeriod, type Sponsor, type Sponsorship,
} from '@chivago/core';
import { listQuests } from '../repo.ts';
import { sponsorPage } from './sponsor.ts';
import { esgPage } from './esg.ts';
import { questsPage } from './quests.ts';
import { reviewDeclaredPage } from './review-declared.ts';
import { kpiReading } from '../kpi-service.ts';
import { statementMissingPage, statementPage } from './statement.ts';
import { storiesPage } from './stories.ts';
import { pendingStories, readStoryMedia, reviewStory, setStoriesOpen, storiesOpen } from '../story-service.ts';
import {
  InvalidPeriod, draftStatement, issueStatement, readStatement, statementsFor,
} from '../statement-service.ts';
import { activityInPeriod } from '../esg-service.ts';
import { evidenceFor } from '../evidence-service.ts';
import { evidenceCsv, evidencePage } from './evidence.ts';
import {
  addOrganisation, addSponsorship, basisFor, InvalidFunding, listOrganisations, organisationById,
  recordPayment, removeSponsorship, sponsorshipsFor, UnknownOrganisation,
} from '../organisation-service.ts';
import { organisationsPage } from './organisations.ts';
import { pendingQueue, queueStats, recentDecisions, reviewItem } from '../review-service.ts';
import {
  DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, localeFromAcceptLanguage, type Locale,
} from './i18n.ts';
import { readPhotoForHost } from '../uploads.ts';
import { questCountsFor, resolveVerification } from '../quest-service.ts';
import { detailPage, historyPage, loginPage, messagePage, queuePage } from './views.ts';
import { sosDeskPage } from './sos-desk.ts';
import { acknowledgeAlert, liveAlerts, recentAlerts, resolveAlert } from '../sos-service.ts';
import { escalationsFor } from '../escalation-service.ts';
import { summarise } from '../position-service.ts';
import {
  declineAppeal, dismissReports, filteredLog, hideReview, moderationCounts,
  moderationQueue, restoreReview,
  type ModerationAction, type ModerationFilter,
} from '../place-review-service.ts';
import { auditLogPage, batchesPage, moderationPage } from './moderation.ts';
import {
  approveBatch, cancelBatch, pendingBatches, previewBatch, proposeBatch,
  SameApprover,
} from '../batch-service.ts';
import {
  BATCH_PREVIEW, isQuestMeasure, parseDeclaredCsv, reconcile, reviewDeclared,
} from '@chivago/core';
import { flaggedModerators, moderatorWatch } from '../moderator-watch.ts';
import { isModerationReasonKey } from '@chivago/core';

/**
 * CSRF token, derived from the session token.
 *
 * The cookie is already SameSite=Strict, which blocks the cross-site form post
 * this defends against. This is the second layer: SameSite is a browser
 * behaviour, and browsers vary.
 */
const csrfFor = (session: HostSession): string =>
  Buffer.from(session.token).toString('base64url').slice(0, 32);

const csrfValid = (session: HostSession, submitted: unknown): boolean => {
  const expected = Buffer.from(csrfFor(session));
  const actual = Buffer.from(String(submitted ?? ''));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

const LOGIN_ATTEMPTS_PER_WINDOW = Number(process.env.CHIVAGO_LOGIN_ATTEMPTS ?? 10);
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map<string, number[]>();

function clientAddress(c: { req: { header: (n: string) => string | undefined } }): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return c.req.header('x-real-ip') ?? 'local';
}

/**
 * FAILED attempts are what is counted. A reviewer who signs in every morning
 * is not the problem; somebody trying keys is, and a correct sign-in clears
 * the slate for its address because the person at the keyboard has just
 * proved who they are.
 */
export function loginBlocked(address: string, now = Date.now()): boolean {
  const recent = (loginAttempts.get(address) ?? []).filter((t) => now - t < LOGIN_WINDOW_MS);
  loginAttempts.set(address, recent);
  return recent.length >= LOGIN_ATTEMPTS_PER_WINDOW;
}

export function noteLoginFailure(address: string, now = Date.now()): void {
  const recent = (loginAttempts.get(address) ?? []).filter((t) => now - t < LOGIN_WINDOW_MS);
  recent.push(now);
  loginAttempts.set(address, recent);
}

export const clearLoginFailures = (address: string): void => { loginAttempts.delete(address); };

/** Test seam: forget every address. */
export const __resetLoginAttemptsForTests = (): void => { loginAttempts.clear(); };

export interface ConsoleHooks {
  /** Runs after a proof decision commits. The server uses it to flush pushes. */
  afterDecision?: () => void;
}

export function consoleRoutes(db: DB, hooks: ConsoleHooks = {}): Hono {
  const app = new Hono();

  /** The Modernist stylesheet, so the console looks like the product. */
  app.get('/assets/modernist.css', (c) => {
    const css = readFileSync(join(process.cwd(), 'public', 'modernist.css'), 'utf8');
    return c.body(css, 200, { 'content-type': 'text/css; charset=utf-8' });
  });

  const currentSession = (c: { req: { header: (n: string) => string | undefined } }) =>
    resolveSession(db, readCookie(c.req.header('cookie'), SESSION_COOKIE));

  /** Whether to draw the Reviews tab at all. Hidden, not disabled. */
  const canModerate = (s: HostSession) => s.role === 'moderator';

  /**
   * A reporting period, from a query string or a form. Defaults to the
   * current calendar year, which is what an annual report is filed against;
   * a fiscal year that is not January to December overrides it.
   */
  const readPeriod = (from: unknown, to: unknown): EsgPeriod => {
    const year = new Date().getUTCFullYear();
    const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
    return {
      from: isDate(from) ? from : `${year}-01-01`,
      to: isDate(to) ? to : `${year}-12-31`,
    };
  };

  /**
   * Which language to render in.
   *
   * An explicit choice wins and persists. Failing that, honour the browser's
   * Accept-Language rather than forcing Thai on a hotel partner in Singapore.
   * Only then fall back to the default.
   */
  const localeFor = (c: { req: { header: (n: string) => string | undefined } }): Locale => {
    const chosen = readCookie(c.req.header('cookie'), LOCALE_COOKIE);
    if (isLocale(chosen)) return chosen;
    return localeFromAcceptLanguage(c.req.header('accept-language')) ?? DEFAULT_LOCALE;
  };

  /**
   * The language switcher.
   *
   * A GET that sets a cookie, which is unusual - but this changes nothing about
   * the user's data, only how a page is drawn, and a form POST for a two-item
   * switcher would be heavier for no safety gained. The redirect target is
   * validated below so it cannot become an open redirect.
   */
  app.get('/lang/:locale', (c) => {
    const chosen = c.req.param('locale');
    if (!isLocale(chosen)) return c.redirect('/console', 303);

    const requested = c.req.query('to') ?? '/console';
    // Only same-origin console paths. Without this, /console/lang/th?to=https://
    // evil.example would hand an attacker a redirect off our own domain.
    const safe = requested.startsWith('/console') && !requested.startsWith('//')
      ? requested
      : '/console';

    c.header(
      'set-cookie',
      [
        `${LOCALE_COOKIE}=${chosen}`,
        'Path=/console',
        'SameSite=Strict',
        'Max-Age=31536000',
        process.env.CHIVAGO_SECURE_COOKIES === '1' ? 'Secure' : '',
      ].filter(Boolean).join('; '),
    );
    return c.redirect(safe, 303);
  });

  // -- Sign in ------------------------------------------------------------

  app.get('/login', (c) => c.html(loginPage(localeFor(c))));

  app.post('/login', async (c) => {
    // Every attempt costs a scrypt derivation PER HOST (the check is
    // timing-uniform on purpose), so an unmetered login form was a CPU
    // denial-of-service that needed no key at all. Ten tries a quarter hour
    // is more than any person mistyping a 20-character key needs.
    const address = clientAddress(c);
    if (loginBlocked(address)) {
      return c.text('Too many sign-in attempts from this connection. Try again in 15 minutes.', 429);
    }
    const form = await c.req.parseBody();
    const key = String(form.key ?? '').trim();
    const reviewer = String(form.reviewer ?? '').trim() || null;

    pruneSessions(db);
    const session = login(db, key, reviewer);
    if (session) clearLoginFailures(address);
    else noteLoginFailure(address);
    if (!session) {
      // Deliberately vague: naming which half was wrong helps an attacker
      // enumerate valid keys.
      return c.html(loginPage(localeFor(c), true), 401);
    }

    c.header(
      'set-cookie',
      [
        `${SESSION_COOKIE}=${session.token}`,
        'Path=/console',
        'HttpOnly',
        'SameSite=Strict',
        `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
        // Secure is omitted on plain HTTP so the pilot works over a LAN; set
        // CHIVAGO_SECURE_COOKIES=1 the moment this is behind TLS.
        process.env.CHIVAGO_SECURE_COOKIES === '1' ? 'Secure' : '',
      ]
        .filter(Boolean)
        .join('; '),
    );
    return c.redirect('/console', 303);
  });

  app.get('/logout', (c) => {
    logout(db, readCookie(c.req.header('cookie'), SESSION_COOKIE));
    c.header('set-cookie', `${SESSION_COOKIE}=; Path=/console; HttpOnly; Max-Age=0`);
    return c.redirect('/console/login', 303);
  });

  // -- Everything below requires a session --------------------------------

  app.use('*', async (c, next) => {
    if (
      c.req.path.endsWith('/login') ||
      c.req.path.endsWith('/assets/modernist.css') ||
      c.req.path.includes('/lang/')
    ) {
      return next();
    }
    if (!currentSession(c)) return c.redirect('/console/login', 303);
    return next();
  });

  app.get('/', (c) => {
    const session = currentSession(c)!;
    const items = pendingQueue(db, session.hostId);
    const stats = queueStats(db, session.hostId);
    return c.html(
      queuePage(
        localeFor(c), session.hostName, session.reviewer, items, stats,
        canModerate(session),
      ),
    );
  });

  /**
   * The queue's count, for the page to poll. A host reviewing from a phone
   * between two other things sees the badge and the tab title move without
   * reloading, and - if they said yes to it - a notification when a new
   * proof lands. Nothing more than the number: the proofs are behind the
   * session like everything else.
   */
  app.get('/pending', (c) => {
    const session = currentSession(c)!;
    c.header('cache-control', 'no-store');
    return c.json({ pending: queueStats(db, session.hostId).pending });
  });

  app.get('/history', (c) => {
    const session = currentSession(c)!;
    return c.html(
      historyPage(
        localeFor(c),
        session.hostName,
        session.reviewer,
        recentDecisions(db, session.hostId),
        queueStats(db, session.hostId).pending,
        canModerate(session),
      ),
    );
  });

  app.get('/proof/:id', (c) => {
    const session = currentSession(c)!;
    // reviewItem is host-scoped, so another host's proof id 404s rather than
    // leaking that it exists.
    const item = reviewItem(db, session.hostId, c.req.param('id'));
    if (!item) {
      return c.html(messagePage(localeFor(c), 'notFound', 'notInYourQueue'), 404);
    }
    return c.html(
      detailPage(
        localeFor(c),
        session.hostName,
        session.reviewer,
        item,
        queueStats(db, session.hostId).pending,
        csrfFor(session),
        canModerate(session),
      ),
    );
  });

  /** Photo bytes. Authorisation is enforced in the SQL, not here. */
  app.get('/photo/:id', (c) => {
    const session = currentSession(c)!;
    const blob = readPhotoForHost(db, session.hostId, c.req.param('id'));
    if (!blob) return c.text('Not found', 404);
    // Hono wants a plain Uint8Array; a Node Buffer's backing store is
    // typed loosely enough that TypeScript rejects it.
    return c.body(new Uint8Array(blob.bytes), 200, {
      'content-type': blob.mime,
      // Photos of volunteers are personal data. Never let a shared proxy hold
      // one, and never let a browser keep it after sign-out.
      'cache-control': 'private, no-store',
      'content-security-policy': "default-src 'none'",
      'x-content-type-options': 'nosniff',
    });
  });

  // -- The decision -------------------------------------------------------

  /**
   * The duty desk.
   *
   * NOT host-scoped, unlike everything else in this console. An emergency does
   * not belong to whichever municipality posted the quest someone was doing at
   * the time, and scoping it would mean an alert nobody is looking at.
   *
   * That is a deliberate widening of access and it needs a matching operational
   * rule: only issue keys to organisations that have agreed to watch this
   * screen. See docs/08-sos-dispatch.md.
   */
  /**
   * The sponsor's view of their own money.
   *
   * PILOT SHAPE. There is no sponsors table yet, because there are no
   * contracts yet — so the funding is declared here, in one visible constant,
   * rather than in a database that would imply an agreement nobody has signed.
   * The COUNTS underneath it are real: read from quest_progress and the
   * ledger, the same rows a host's Approve click writes.
   *
   * When the first sponsor actually signs, this constant becomes a table and
   * nothing else on this page changes.
   */
  app.get('/sponsor', (c) => {
    const session = currentSession(c)!;

    /*
      Which organisation. `?org=` names one; with none named the first is
      shown, and with none at all the page says so rather than inventing a
      funder. That last case is the shipped default: the table starts empty.
    */
    const organisations = listOrganisations(db);
    const asked = c.req.query('org');
    const sponsor = asked
      ? organisationById(db, asked)
      : organisations[0];
    if (!sponsor) {
      return c.html(sponsorPage(localeFor(c), session.hostName, session.reviewer, null, [], [], 'declared'));
    }

    const sponsorships = sponsorshipsFor(db, sponsor.id);
    const counts = questCountsFor(db, sponsorships.map((s) => s.questId));
    const outcome = sponsorOutcome(sponsor, sponsorships, counts);

    const names = new Map(listQuests(db).map((q) => [q.id, q.name.en]));
    const rows = sponsorships.map((s) => {
      const found = counts.find((x) => x.questId === s.questId);
      return {
        questId: s.questId,
        name: names.get(s.questId) ?? s.questId,
        joined: found?.joined ?? 0,
        verified: found?.verified ?? 0,
        fundedTHB: s.fundedTHB,
      };
    });

    return c.html(sponsorPage(
      localeFor(c), session.hostName, session.reviewer, outcome, rows, organisations, basisFor(db, sponsor.id),
    ));
  });

  /**
   * The same funding, read as an ESG filing rather than a sponsor update.
   *
   * PILOT SHAPE, like the sponsor page: the partner and the funding are
   * constants here because no contract exists yet, and a table would imply an
   * agreement nobody has signed. The ACTIVITY underneath is real, read from
   * quest_progress inside the stated period.
   *
   * The period defaults to the current calendar year, which is the one an
   * annual report is filed against. `?from=&to=` overrides it, because a
   * partner's fiscal year is very often not January to December.
   */
  app.get('/esg', (c) => {
    const session = currentSession(c)!;

    // Same organisations as the sponsor page, read the same way. An empty
    // table is a page that says nothing has been funded, not a page with an
    // invented partner on it.
    const organisations = listOrganisations(db);
    const asked = c.req.query('org');
    const partner = asked ? organisationById(db, asked) : organisations[0];
    if (!partner) {
      return c.html(esgPage(localeFor(c), session.hostName, session.reviewer, null, [], 'declared'));
    }

    const funded = sponsorshipsFor(db, partner.id).map((s) => ({
      questId: s.questId, fundedTHB: s.fundedTHB, perVerifiedTHB: s.perVerifiedTHB,
    }));
    const period = readPeriod(c.req.query('from'), c.req.query('to'));

    const { classified, excludedUnclassified } = activityInPeriod(db, partner.id, funded, period);
    const report = esgReport(partner, period, classified, excludedUnclassified);

    return c.html(esgPage(
      localeFor(c), session.hostName, session.reviewer, report, organisations, basisFor(db, partner.id),
    ));
  });

  /**
   * The statement of verified activity (docs/31): what THIS host approved,
   * for a period, drafted free and issued on purpose. Scoped by session -
   * a host can only ever state its own quests.
   */
  app.get('/statement', (c) => {
    const session = currentSession(c)!;
    const period = readPeriod(c.req.query('from'), c.req.query('to'));
    if (period.from > period.to) {
      return c.html(messagePage(localeFor(c), 'statement', 'periodOutOfOrder', '/console/statement'), 400);
    }
    // `readPeriod` checks the shape, `draftStatement` checks the calendar:
    // `2026-13-01` passed the first and threw out of the second, which the
    // POST caught and this GET answered with a 500.
    let draft;
    try {
      draft = draftStatement(db, session.hostId, period, new Date(), session.reviewer);
    } catch (e) {
      if (e instanceof InvalidPeriod) {
        return c.html(messagePage(localeFor(c), 'statement', 'periodOutOfOrder', '/console/statement'), 400);
      }
      throw e;
    }
    return c.html(statementPage({
      locale: localeFor(c),
      hostName: session.hostName,
      reviewer: session.reviewer,
      canModerate: canModerate(session),
      draft,
      issued: statementsFor(db, session.hostId),
      csrf: csrfFor(session),
      origin: new URL(c.req.url).origin,
      justIssued: c.req.query('issued') ?? null,
    }));
  });

  /**
   * The evidence pack behind one issued statement.
   *
   * NOT PUBLIC, unlike the statement it belongs to. `/statements/:id` is open
   * to anyone holding the id because it carries counts and no people; this
   * carries a row per approval, and a row per approval is a person's day even
   * with a reference where the name would be.
   *
   * Scoped to the host whose statement it is. A moderator is not given a way
   * in here either: cross-host reading is the rule this console exists to
   * enforce, and an evidence pack is the last place to make an exception.
   */
  app.get('/evidence', (c) => {
    const session = currentSession(c)!;
    const id = c.req.query('id') ?? '';
    const statement = readStatement(db, id);
    // Same answer for "no such statement" and "not yours": telling a host
    // which ids exist elsewhere is itself a cross-host leak.
    if (!statement || statement.host.id !== session.hostId) {
      return c.html(statementMissingPage(localeFor(c), id), 404);
    }

    const items = evidenceFor(db, statement.id, session.hostId, statement.period);
    const reconciliation = reconcile(statement, items);
    const origin = new URL(c.req.url).origin;

    if (c.req.query('format') === 'csv') {
      c.header('content-type', 'text/csv; charset=utf-8');
      c.header('content-disposition', `attachment; filename="${statement.id}-evidence.csv"`);
      // Never cached: unlike the statement, this changes as the rows under it
      // do, and a stale copy is the one thing it exists to prevent.
      c.header('cache-control', 'no-store');
      return c.body(evidenceCsv(statement, items, reconciliation, origin));
    }

    c.header('cache-control', 'no-store');
    return c.html(evidencePage({
      locale: localeFor(c),
      hostName: session.hostName,
      statement,
      items,
      reconciliation,
      origin,
    }));
  });

  /**
   * Stories waiting for this host (docs/44). A host reviews where it hosts;
   * a moderator anywhere. The page reloads itself, because it is open on a
   * phone on a stage.
   */
  /*
    The host's own quests, and what each was agreed to be measured by.

    Scoped by `host_id` like every other read in this console. A moderator
    sees the same page for the host they are signed in as, plus the form to
    agree an indicator - setting one is an act with a partner behind it, the
    same shape as funding.
  */
  app.get('/quests', (c) => {
    const session = currentSession(c)!;
    const period = readPeriod(c.req.query('from'), c.req.query('to'));
    const rows_ = db.prepare(
      'SELECT id, name_en, name_th FROM quests WHERE host_id = ? ORDER BY name_en',
    ).all(session.hostId) as unknown as { id: string; name_en: string; name_th: string }[];

    return c.html(questsPage({
      locale: localeFor(c),
      hostName: session.hostName,
      canModerate: canModerate(session),
      csrf: csrfFor(session),
      period,
      quests: rows_.map((q) => ({
        questId: q.id,
        nameEn: q.name_en,
        nameTh: q.name_th,
        reading: kpiReading(db, q.id, period),
      })),
    }));
  });

  app.post('/quests/kpi', async (c) => {
    const session = currentSession(c)!;
    if (!canModerate(session)) return c.text('Not found', 404);
    const form = await c.req.parseBody();
    if (!csrfValid(session, form.csrf)) {
      return c.html(messagePage(localeFor(c), 'sessionExpired', 'signInAgain', '/console/quests'), 403);
    }

    const questId = String(form.questId ?? '');
    // Scoped, like every write in this console: a moderator signed in as one
    // host does not agree indicators on another host's quests.
    const owned = db.prepare('SELECT id FROM quests WHERE id = ? AND host_id = ?')
      .get(questId, session.hostId);
    if (!owned) return c.redirect('/console/quests', 303);

    const measure = String(form.measure ?? '');
    if (measure === '') {
      // Clearing it clears the target with it. A baseline and a target with
      // nothing to measure them in are two numbers nobody can read.
      db.prepare(
        'UPDATE quests SET kpi_measure = NULL, kpi_baseline = NULL, kpi_target = NULL WHERE id = ?',
      ).run(questId);
      return c.redirect('/console/quests', 303);
    }
    if (!isQuestMeasure(measure)) return c.redirect('/console/quests', 303);

    const number = (v: unknown): number | null => {
      const n = Number(v);
      return typeof v === 'string' && v.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null;
    };
    db.prepare('UPDATE quests SET kpi_measure = ?, kpi_baseline = ?, kpi_target = ? WHERE id = ?')
      .run(measure, number(form.baseline), number(form.target), questId);
    return c.redirect('/console/quests', 303);
  });

  /*
    Side A: reviewing a file a partner who already files sends in.

    Moderator only. This is ChivaGo's own judgement applied to somebody
    else's data, not a self-service check a host runs on themselves - and the
    page it produces is a REVIEW, never a statement. See
    `packages/core/src/declared.ts` for why that distinction is the feature.

    Nothing is stored. The sheet is read, reported on, and dropped: an
    imported file sitting in this database would be a second, unverified
    record of somebody's activity inside a system whose whole claim is that
    its records are verified.
  */
  const reviewForm = (c: Parameters<typeof localeFor>[0], session: ReturnType<typeof currentSession>,
    period: { from: string; to: string }, pasted: string, statedTotal: string,
    review: ReturnType<typeof reviewDeclared> | null, missing: string[]) =>
    reviewDeclaredPage({
      locale: localeFor(c), hostName: session!.hostName, csrf: csrfFor(session!),
      period, pasted, statedTotal, review, missing,
    });

  app.get('/review', (c) => {
    const session = currentSession(c)!;
    if (!canModerate(session)) return c.text('Not found', 404);
    const period = readPeriod(c.req.query('from'), c.req.query('to'));
    return c.html(reviewForm(c, session, period, '', '', null, []));
  });

  app.post('/review', async (c) => {
    const session = currentSession(c)!;
    if (!canModerate(session)) return c.text('Not found', 404);
    const form = await c.req.parseBody();
    if (!csrfValid(session, form.csrf)) {
      return c.html(messagePage(localeFor(c), 'sessionExpired', 'signInAgain', '/console/review'), 403);
    }

    const period = readPeriod(form.from, form.to);
    const pasted = String(form.sheet ?? '');
    const statedTotalRaw = String(form.statedTotal ?? '');
    const statedTotal = statedTotalRaw.trim() === '' || !Number.isFinite(Number(statedTotalRaw))
      ? null
      : Number(statedTotalRaw);

    const sheet = parseDeclaredCsv(pasted);
    if (sheet.missing.length > 0) {
      return c.html(reviewForm(c, session, period, pasted, statedTotalRaw, null, sheet.missing));
    }
    const review = reviewDeclared(sheet.rows, period, statedTotal);
    return c.html(reviewForm(c, session, period, pasted, statedTotalRaw, review, []));
  });

  app.get('/stories', (c) => {
    const session = currentSession(c)!;
    return c.html(storiesPage({
      locale: localeFor(c),
      hostName: session.hostName,
      reviewer: session.reviewer,
      canModerate: canModerate(session),
      pending: pendingStories(db, session.hostId),
      csrf: csrfFor(session),
      open: storiesOpen(db),
    }));
  });

  /**
   * The door (docs/46). A moderator opens it when the first guest scans and
   * shuts it when the talk ends, from the phone on the stage; a host that
   * is not a moderator does not have the handle, and is not shown it.
   */
  /**
   * Organisations, and what they funded. Moderator only.
   *
   * A host who runs one quest must not be able to set the funding their own
   * work is measured against, so this is behind the same gate the review
   * moderation is, and the tab is hidden rather than disabled for everybody
   * else.
   */
  app.get('/organisations', (c) => {
    const session = currentSession(c)!;
    if (!canModerate(session)) return c.text('Not found', 404);
    return c.html(organisationsPage({
      locale: localeFor(c),
      hostName: session.hostName,
      reviewer: session.reviewer,
      csrf: csrfFor(session),
      views: listOrganisations(db).map((org) => ({
        org,
        sponsorships: sponsorshipsFor(db, org.id),
        basis: basisFor(db, org.id),
      })),
      quests: listQuests(db).map((q) => ({ id: q.id, name: q.name.en })),
      error: c.req.query('error') ?? null,
      notice: c.req.query('notice') ?? null,
    }));
  });

  app.post('/organisations', async (c) => {
    const session = currentSession(c)!;
    if (!canModerate(session)) return c.text('Not found', 404);
    const form = await c.req.parseBody();
    if (!csrfValid(session, form.csrf)) {
      return c.html(messagePage(localeFor(c), 'sessionExpired', 'signInAgain', '/console/organisations'), 403);
    }
    try {
      addOrganisation(
        db,
        {
          name: String(form.name ?? ''),
          nameTh: typeof form.nameTh === 'string' ? form.nameTh : null,
          kind: String(form.kind ?? ''),
        },
        session.reviewer ?? session.hostName,
      );
    } catch (err) {
      if (err instanceof InvalidFunding) return c.redirect(`/console/organisations?error=${encodeURIComponent(err.message)}`, 303);
      throw err;
    }
    return c.redirect('/console/organisations', 303);
  });

  app.post('/organisations/:id/fund', async (c) => {
    const session = currentSession(c)!;
    if (!canModerate(session)) return c.text('Not found', 404);
    const form = await c.req.parseBody();
    if (!csrfValid(session, form.csrf)) {
      return c.html(messagePage(localeFor(c), 'sessionExpired', 'signInAgain', '/console/organisations'), 403);
    }
    try {
      addSponsorship(
        db,
        {
          orgId: c.req.param('id'),
          questId: String(form.questId ?? ''),
          fundedTHB: Number(form.fundedTHB),
          perVerifiedTHB: Number(form.perVerifiedTHB),
          // Unticked is the default, and the default is the cautious one: a
          // figure nobody claimed was signed is declared.
          basis: form.basis === 'signed' ? 'signed' : 'declared',
        },
        session.reviewer ?? session.hostName,
      );
    } catch (err) {
      if (err instanceof InvalidFunding || err instanceof UnknownOrganisation) {
        return c.redirect(`/console/organisations?error=${encodeURIComponent(err.message)}`, 303);
      }
      throw err;
    }
    return c.redirect('/console/organisations', 303);
  });

  /*
    Money that arrived, recorded separately from the money that was agreed.

    A separate route and a separate form, not a fourth field on the funding
    one. Agreeing an amount and receiving it are different acts, usually days
    apart and often by different people, and a single form that took both
    would invite the figure to be typed once and then read as cash.
  */
  app.post('/organisations/:id/paid', async (c) => {
    const session = currentSession(c)!;
    if (!canModerate(session)) return c.text('Not found', 404);
    const form = await c.req.parseBody();
    if (!csrfValid(session, form.csrf)) {
      return c.html(messagePage(localeFor(c), 'sessionExpired', 'signInAgain', '/console/organisations'), 403);
    }
    try {
      recordPayment(db, {
        orgId: c.req.param('id'),
        questId: String(form.questId ?? ''),
        receivedTHB: Number(form.receivedTHB),
      });
    } catch (err) {
      if (err instanceof InvalidFunding || err instanceof UnknownOrganisation) {
        return c.redirect(`/console/organisations?error=${encodeURIComponent(err.message)}`, 303);
      }
      throw err;
    }
    return c.redirect('/console/organisations', 303);
  });

  app.post('/organisations/:id/unfund', async (c) => {
    const session = currentSession(c)!;
    if (!canModerate(session)) return c.text('Not found', 404);
    const form = await c.req.parseBody();
    if (!csrfValid(session, form.csrf)) {
      return c.html(messagePage(localeFor(c), 'sessionExpired', 'signInAgain', '/console/organisations'), 403);
    }
    removeSponsorship(db, c.req.param('id'), String(form.questId ?? ''));
    return c.redirect('/console/organisations', 303);
  });

  app.post('/stories/door', async (c) => {
    const session = currentSession(c)!;
    if (!canModerate(session)) return c.text('Not found', 404);
    const form = await c.req.parseBody();
    if (!csrfValid(session, form.csrf)) {
      return c.html(messagePage(localeFor(c), 'sessionExpired', 'signInAgain', '/console/stories'), 403);
    }
    setStoriesOpen(db, form.open === '1', session.reviewer ?? session.hostName);
    return c.redirect('/console/stories', 303);
  });

  for (const which of ['media', 'poster'] as const) {
    app.get(`/stories/:id/${which}`, (c) => {
      const session = currentSession(c)!;
      const blob = readStoryMedia(db, c.req.param('id'), which, { forHost: session.hostId });
      if (!blob) return c.text('Not found', 404);
      return c.body(new Uint8Array(blob.bytes), 200, {
        'content-type': blob.mime,
        'cache-control': 'private, no-store',
        'content-security-policy': "default-src 'none'",
        'x-content-type-options': 'nosniff',
      });
    });
  }

  app.post('/stories/:id/:decision', async (c) => {
    const session = currentSession(c)!;
    const form = await c.req.parseBody();
    if (!csrfValid(session, form.csrf)) {
      return c.html(messagePage(localeFor(c), 'sessionExpired', 'signInAgain', '/console/stories'), 403);
    }
    const decision = c.req.param('decision');
    if (decision !== 'approve' && decision !== 'hide') return c.text('Not found', 404);
    try {
      reviewStory(db, { hostId: session.hostId, storyId: c.req.param('id'), decision, reviewer: session.reviewer });
    } catch (e) {
      if ((e as Error).name === 'StoryNotFound') {
        return c.html(messagePage(localeFor(c), 'notFound', 'notInYourQueue', '/console/stories'), 404);
      }
      throw e;
    }
    return c.redirect('/console/stories', 303);
  });

  app.post('/statement', async (c) => {
    const session = currentSession(c)!;
    const form = await c.req.parseBody();
    if (!csrfValid(session, form.csrf)) {
      return c.html(messagePage(localeFor(c), 'sessionExpired', 'signInAgain', '/console/statement'), 403);
    }
    // The period comes from the form, not the query string: what is issued
    // is what was on screen when the button was pressed.
    const period = readPeriod(form.from, form.to);
    try {
      const issued = issueStatement(db, session.hostId, period, session.reviewer);
      return c.redirect(`/console/statement?issued=${encodeURIComponent(issued.id)}`, 303);
    } catch (e) {
      if (e instanceof InvalidPeriod) {
        return c.html(messagePage(localeFor(c), 'statement', 'periodOutOfOrder', '/console/statement'), 400);
      }
      throw e;
    }
  });

  app.get('/sos', (c) => {
    const session = currentSession(c)!;
    const live = liveAlerts(db);
    // An escalated alert is one the system has already told the traveller
    // nobody answered. The desk must show that louder than anything else.
    const escalations = Object.fromEntries(
      live.map((a) => [a.id, escalationsFor(db, a.id)]),
    );
    // The trail matters more than the pin: a phone that stopped reporting looks
    // identical to a live one unless the desk is told otherwise.
    const trails = Object.fromEntries(live.map((a) => [a.id, summarise(db, a.id)]));
    return c.html(
      sosDeskPage(
        localeFor(c), session.hostName, session.reviewer,
        live, recentAlerts(db, 20), escalations, trails, canModerate(session),
        csrfFor(session),
      ),
    );
  });

  // Both carry the CSRF token, like every other state change on this console.
  // They were the two that did not, on the theory that SameSite=Strict was
  // enough - and a forged "acknowledge" is the worst forgery this system
  // has, because it tells someone in trouble that a named human has them.
  app.post('/sos/:id/acknowledge', async (c) => {
    const session = currentSession(c)!;
    const form = await c.req.parseBody();
    if (!csrfValid(session, form.csrf)) {
      return c.html(messagePage(localeFor(c), 'sessionExpired', 'signInAgain', '/console/sos'), 403);
    }
    // The operator's NAME goes to the person in trouble, not "an operator".
    // Being told a human has you is the point.
    acknowledgeAlert(db, c.req.param('id'), session.reviewer ?? session.hostName);
    return c.redirect('/console/sos', 303);
  });

  app.post('/sos/:id/resolve', async (c) => {
    const session = currentSession(c)!;
    const form = await c.req.parseBody();
    if (!csrfValid(session, form.csrf)) {
      return c.html(messagePage(localeFor(c), 'sessionExpired', 'signInAgain', '/console/sos'), 403);
    }
    resolveAlert(db, c.req.param('id'), session.reviewer ?? session.hostName);
    return c.redirect('/console/sos', 303);
  });

  // -- Review moderation --------------------------------------------------
  //
  // ROLE-gated, not host-scoped. Reviews are about places, which no host
  // owns, so there is nothing to scope by - and a hotel partner able to hide
  // a bad review of a rival's beach is a conflict the proof queue never has.
  // See docs/13-review-moderation.md.

  /** Refuse anything under /reviews to a non-moderator, in one place. */
  const requireModerator = (c: { req: { header: (n: string) => string | undefined } }) => {
    const session = currentSession(c)!;
    return session.role === 'moderator' ? session : null;
  };

  app.get('/reviews', (c) => {
    const session = requireModerator(c);
    if (!session) {
      return c.html(
        messagePage(localeFor(c), 'moderatorsOnly', 'moderatorsOnlyBlurb'),
        403,
      );
    }
    const raw = c.req.query('filter');
    const counts = moderationCounts(db);
    // The desk opens on the most urgent thing that exists: an author
    // answering us, then a reader flagging somebody, then the low-star lens.
    // It never opens on an empty page.
    const fallback: ModerationFilter =
      counts.appeals > 0 ? 'appeals' : counts.reported > 0 ? 'reported' : 'low';
    const filter: ModerationFilter =
      raw === 'appeals' || raw === 'reported' || raw === 'all' || raw === 'visible'
      || raw === 'hidden' || raw === 'low'
        ? raw
        : fallback;
    return c.html(
      moderationPage(
        localeFor(c), session.hostName, session.reviewer,
        moderationQueue(db, filter), counts, filter,
        csrfFor(session), queueStats(db, session.hostId).pending,
        flaggedModerators(db).length,
        pendingBatches(db).length,
      ),
    );
  });

  app.post('/reviews/:id/hide', async (c) => {
    const session = requireModerator(c);
    if (!session) return c.html(messagePage(localeFor(c), 'moderatorsOnly', 'moderatorsOnlyBlurb'), 403);

    const form = await c.req.parseBody();
    if (!csrfValid(session, form.csrf)) {
      return c.html(messagePage(localeFor(c), 'sessionExpired', 'signInAgain'), 403);
    }

    // A KEY, not a sentence. The moderator picks in their language and the
    // author reads it in theirs. A take-down with no recorded reason is
    // unaccountable, so an unknown key is a refusal rather than a null.
    const rawReason = String(form.reason ?? '');
    if (!isModerationReasonKey(rawReason)) {
      return c.html(messagePage(localeFor(c), 'reasonRequired', 'reasonRequiredBlurb', '/console/reviews'), 400);
    }

    hideReview(db, {
      reviewId: c.req.param('id'),
      reasonKey: rawReason,
      moderator: session.reviewer ?? session.hostName,
      note: String(form.note ?? '').trim() || null,
    });
    return c.redirect('/console/reviews', 303);
  });

  app.post('/reviews/:id/restore', async (c) => {
    const session = requireModerator(c);
    if (!session) return c.html(messagePage(localeFor(c), 'moderatorsOnly', 'moderatorsOnlyBlurb'), 403);

    const form = await c.req.parseBody();
    if (!csrfValid(session, form.csrf)) {
      return c.html(messagePage(localeFor(c), 'sessionExpired', 'signInAgain'), 403);
    }
    restoreReview(db, c.req.param('id'), session.reviewer ?? session.hostName);
    return c.redirect('/console/reviews?filter=hidden', 303);
  });

  /**
   * "Looked at it, it is fine."
   *
   * The third outcome. Without it a moderator can only hide or ignore, and
   * ignoring leaves the row at the top of the queue until someone hides it to
   * make it go away - which turns a report into a slow removal.
   */
  app.post('/reviews/:id/dismiss', async (c) => {
    const session = requireModerator(c);
    if (!session) return c.html(messagePage(localeFor(c), 'moderatorsOnly', 'moderatorsOnlyBlurb'), 403);

    const form = await c.req.parseBody();
    if (!csrfValid(session, form.csrf)) {
      return c.html(messagePage(localeFor(c), 'sessionExpired', 'signInAgain'), 403);
    }
    dismissReports(db, c.req.param('id'), session.reviewer ?? session.hostName);
    return c.redirect('/console/reviews', 303);
  });

  /**
   * Refuse an appeal. There is no matching "uphold" route: upholding is
   * restore, which already exists. Two routes that both restore would be two
   * chances to forget one of them.
   */
  app.post('/reviews/:id/appeal/decline', async (c) => {
    const session = requireModerator(c);
    if (!session) return c.html(messagePage(localeFor(c), 'moderatorsOnly', 'moderatorsOnlyBlurb'), 403);

    const form = await c.req.parseBody();
    if (!csrfValid(session, form.csrf)) {
      return c.html(messagePage(localeFor(c), 'sessionExpired', 'signInAgain'), 403);
    }
    declineAppeal(db, {
      reviewId: c.req.param('id'),
      moderator: session.reviewer ?? session.hostName,
    });
    return c.redirect('/console/reviews?filter=appeals', 303);
  });

  /** What has been decided, and by whom. Moderators only, like the desk. */
  /**
   * Propose a batch.
   *
   * Registered BEFORE `/reviews/:id/...` so `batches` is never mistaken for a
   * review id — Hono matches in registration order, and a route that shadows
   * another is the kind of bug that only shows up with real data.
   */
  app.post('/reviews/batches/propose', async (c) => {
    const session = requireModerator(c);
    if (!session) return c.html(messagePage(localeFor(c), 'moderatorsOnly', 'moderatorsOnlyBlurb'), 403);

    const form = await c.req.parseBody({ all: true });
    if (!csrfValid(session, form.csrf)) {
      return c.html(messagePage(localeFor(c), 'sessionExpired', 'signInAgain'), 403);
    }

    const raw = form.reviewId;
    const reviewIds = Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : [];
    const reason = String(form.reason ?? '');
    if (reviewIds.length === 0 || !isModerationReasonKey(reason)) {
      return c.html(
        messagePage(localeFor(c), 'reasonRequired', 'reasonRequiredBlurb', '/console/reviews'),
        400,
      );
    }

    proposeBatch(db, {
      reviewIds,
      reasonKey: reason,
      note: String(form.note ?? '').trim() || null,
      proposedBy: session.reviewer ?? session.hostName,
    });
    return c.redirect('/console/reviews/batches', 303);
  });

  /** Proposals waiting for a second pair of eyes. */
  app.get('/reviews/batches', (c) => {
    const session = requireModerator(c);
    if (!session) {
      return c.html(messagePage(localeFor(c), 'moderatorsOnly', 'moderatorsOnlyBlurb'), 403);
    }
    const batches = pendingBatches(db).map((batch) => ({
      batch,
      preview: previewBatch(db, batch, BATCH_PREVIEW),
    }));
    return c.html(
      batchesPage(
        localeFor(c), session.hostName, session.reviewer, batches,
        csrfFor(session), queueStats(db, session.hostId).pending,
      ),
    );
  });

  app.post('/reviews/batches/:id/approve', async (c) => {
    const session = requireModerator(c);
    if (!session) return c.html(messagePage(localeFor(c), 'moderatorsOnly', 'moderatorsOnlyBlurb'), 403);

    const form = await c.req.parseBody();
    if (!csrfValid(session, form.csrf)) {
      return c.html(messagePage(localeFor(c), 'sessionExpired', 'signInAgain'), 403);
    }
    try {
      approveBatch(db, {
        batchId: c.req.param('id'),
        approver: session.reviewer ?? session.hostName,
      });
    } catch (err) {
      // The one refusal a moderator will actually hit, and it needs to say
      // WHY rather than 500 at them.
      if (err instanceof SameApprover) {
        return c.html(
          messagePage(localeFor(c), 'filterBatches', 'batchOwnProposal', '/console/reviews/batches'),
          403,
        );
      }
      throw err;
    }
    return c.redirect('/console/reviews/batches', 303);
  });

  app.post('/reviews/batches/:id/cancel', async (c) => {
    const session = requireModerator(c);
    if (!session) return c.html(messagePage(localeFor(c), 'moderatorsOnly', 'moderatorsOnlyBlurb'), 403);

    const form = await c.req.parseBody();
    if (!csrfValid(session, form.csrf)) {
      return c.html(messagePage(localeFor(c), 'sessionExpired', 'signInAgain'), 403);
    }
    cancelBatch(db, c.req.param('id'));
    return c.redirect('/console/reviews/batches', 303);
  });

  app.get('/reviews/log', (c) => {

    const session = requireModerator(c);
    if (!session) {
      return c.html(messagePage(localeFor(c), 'moderatorsOnly', 'moderatorsOnlyBlurb'), 403);
    }
    const moderator = c.req.query('moderator') || undefined;
    const rawAction = c.req.query('action');
    const action: ModerationAction | undefined =
      rawAction === 'hide' || rawAction === 'restore' || rawAction === 'dismiss'
      || rawAction === 'appeal_declined'
        ? rawAction
        : undefined;
    return c.html(
      auditLogPage(
        localeFor(c), session.hostName, session.reviewer,
        filteredLog(db, { moderator, action }),
        queueStats(db, session.hostId).pending,
        moderatorWatch(db),
        { moderator, action },
      ),
    );
  });

  app.post('/decide', async (c) => {
    const session = currentSession(c)!;
    const form = await c.req.parseBody();

    if (!csrfValid(session, form.csrf)) {
      return c.html(messagePage(localeFor(c), 'sessionExpired', 'signInAgain'), 403);
    }

    const proofId = String(form.proofId ?? '');
    const approved = String(form.decision ?? '') === 'approve';
    // A KEY, not a sentence: the reviewer picks in their language, the
    // volunteer reads it in theirs.
    const rawReason = String(form.reason ?? '').trim();
    const reasonKey = isRejectionReasonKey(rawReason) ? rawReason : null;
    const note = String(form.note ?? '').trim().slice(0, 500);

    const item = reviewItem(db, session.hostId, proofId);
    if (!item) {
      return c.html(messagePage(localeFor(c), 'notFound', 'notInYourQueue'), 404);
    }

    // A rejection with no explanation is a dead end for the volunteer: they
    // cannot fix what they were not told about.
    if (!approved && !reasonKey && !note) {
      return c.html(
        messagePage(
          localeFor(c), 'reasonRequired', 'reasonRequiredBlurb', `/console/proof/${proofId}`,
        ),
        400,
      );
    }

    resolveVerification(db, {
      userId: item.userId,
      questId: item.questId,
      proofId,
      approved,
      reasonKey,
      reviewedBy: session.reviewer,
      reviewNote: note || null,
    });
    hooks.afterDecision?.();

    return c.redirect('/console', 303);
  });

  return app;
}

/** Exposed for tests. */
export const __csrfFor = csrfFor;
