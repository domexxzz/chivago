/**
 * Put the database into a known, demonstrable state.
 *
 * A demo fails in one of two ways. Either the data is stale - yesterday's
 * rehearsal left an SOS live and a wallet already spent - or it is empty, and
 * a screen with nothing to show looks identical to a screen that is broken.
 * This clears the first and refuses to leave the second.
 *
 * WHAT IT DOES NOT DO: write results. Every number the demo shows is computed
 * by the same functions the running app calls, over history seeded by driving
 * the real services on a backdated clock. Nothing here inserts a balance, a
 * companion stage or a Healthy Score. If a service is broken this produces a
 * broken demo rather than papering over it - which is the point, because it
 * runs before the audience arrives rather than in front of them.
 *
 *   pnpm --filter @chivago/api demo:reset
 *   pnpm --filter @chivago/api demo:reset --walk
 *   pnpm --filter @chivago/api demo:reset --area koh-sichang --walk
 *
 * `--walk` reads the seeded state back through the real read paths and exits
 * non-zero naming any screen that would open empty.
 *
 * `--area` picks which area the seeded history happens in. It defaults to
 * `samui`, which is what this script did before the flag existed, so the
 * command without it behaves exactly as it always has. `koh-sichang` is the
 * pilot area: seed that one before a pitch about the island, or the demo
 * opens on five days somebody spent on the wrong island.
 */

import { openDb, type DB } from './db-node.ts';
import { checkIn } from './checkin-service.ts';
import { joinQuest, arriveAtQuest, submitProof, resolveVerification } from './quest-service.ts';
import { issueStatement } from './statement-service.ts';
import { recordMood, balanceFor, habitatEvidenceFor, moodHistory } from './wellness-service.ts';
import {
  ensureWallet, getBalances, getExp, getLedger, grantOpeningBalance,
} from './wallet-service.ts';
import { getPersonalImpact, getShield, listOffers, listQuests } from './repo.ts';
import { travellerStandings } from './standing-service.ts';
import {
  companionsFor, islandDateKey, isRankable, positionOf, SEED_PLACES, SEED_QUESTS, type MoodKey,
} from '@chivago/core';

const USER = process.env.CHIVAGO_DEMO_USER ?? 'demo-user';
const WALK = process.argv.includes('--walk');

/** Read once, so a run near midnight cannot straddle two island days. */
const NOW = new Date();
const daysAgo = (n: number): Date => new Date(NOW.getTime() - n * 86_400_000);

/** Midnight, island time, of the island date a moment falls on. Thailand has no DST. */
const islandMidnight = (d: Date): number => new Date(`${islandDateKey(d)}T00:00:00+07:00`).getTime();

/**
 * When a day's last check-in happened: eight in the evening, island time, on a
 * past day - and now, on today, so nothing seeded is ahead of the clock.
 */
const dayEndsAt = (day: number): Date =>
  new Date(Math.min(islandMidnight(daysAgo(day)) + 20 * 3_600_000, NOW.getTime()));

/**
 * The i-th of n check-ins on a day: two hours apart, ending at the day's last
 * one - unless that is within two hours of island midnight, when the spacing
 * shrinks so every check-in stays on the same island date. Run at half past
 * midnight, the old two-hours-back arithmetic put today's first check-in on
 * yesterday's date, where yesterday had already checked in at that place,
 * and the reset refused itself. Five minutes is the least the second signal
 * (docs/30) will accept between two beaches; closer than that, say so.
 */
const checkInAt = (day: number, n: number, i: number, spacing = 2 * 3_600_000): Date => {
  const end = dayEndsAt(day);
  const room = end.getTime() - islandMidnight(end) - 60_000;
  const gap = Math.min(spacing, Math.floor(room / Math.max(1, n - 1)));
  if (n > 1 && gap < 5 * 60_000) {
    throw new Error(`too close to island midnight to seed ${n} check-ins on one day - run the reset after 00:${String(5 * (n - 1) + 1).padStart(2, '0')} island time`);
  }
  return new Date(end.getTime() - (n - 1 - i) * gap);
};

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

/**
 * Everything that records what a PERSON did. Content is not listed here.
 *
 * Enumerated rather than discovered from sqlite_master, because a table added
 * later should force a decision about whether a demo reset ought to clear it.
 * A wildcard would silently start deleting places the day somebody adds one.
 *
 * ORDER MATTERS: deleted top to bottom, so `users` is last - everything else
 * references it, and a foreign key error is a better outcome than an orphan.
 */
export const TRAVELLER_TABLES = [
  // Recorded, not scored (docs/29) and the second signal (docs/30): both are
  // the traveller's, and a demo reset starts them from nothing.
  'self_visits', 'last_fix',
  // A statement is the pilot's record ABOUT travellers (docs/31). With the
  // travellers gone it would describe nobody, so it goes with them.
  'statements',
  // Stories are the traveller's too (docs/44).
  'stories',
  // An inquiry is the traveller's question to an operator (docs/61): theirs,
  // like a story. The listing it was about is content, and stays.
  'inquiries',
  // The door (docs/46) is operational state, not the pilot's: a reset shuts
  // it, so a day starts with a moderator opening it on purpose.
  'settings',
  'ledger', 'wallets', 'profiles',
  // The AI's opinion on a proof (docs/64) goes before the proof it is about.
  'proof_assists',
  'mood_checkins', 'quest_progress', 'proofs', 'proof_files', 'vouchers',
  'place_reviews', 'review_reports', 'review_appeals', 'review_batches',
  'moderation_log', 'notifications', 'push_tokens',
  'sos_alerts', 'sos_dispatch', 'sos_escalations', 'sos_positions',
  'emergency_contacts',
  // The community is user-authored too. Reactions and replies point at posts,
  // so they leave first; the posts then leave before their authors.
  'community_comments', 'community_likes', 'community_posts',
  // Administrative state attached to a traveller cannot outlive that
  // traveller. Grants and status rows both carry a real user foreign key, so
  // clear them explicitly before users rather than relying on a cascade to
  // hide an unclassified table from the schema guard.
  'admin_inventory_grants', 'admin_user_status',
  // Accounts and parties are the traveller's, not the pilot's. Both arrived
  // after this list was written, and the schema guard below did its job: the
  // reset refused to run at all until they were classified.
  // A LINE sign-in is a fourth way into a traveller's account, alongside the
  // three above, so it is cleared with them: a reset that left the binding
  // behind would sign the next person in as a traveller who no longer exists.
  'user_accounts', 'device_keys', 'link_codes', 'line_identities',
  // A party's invitations and the requests to join them go with the party -
  // children first, so the foreign keys never see an orphan.
  'invite_requests', 'party_invites', 'party_members', 'parties',
  // A sighting is the rider's, like a check-in: it is their report that
  // they saw a bus, and a demo starts with nobody having seen one.
  'transit_sightings',
  // Summoned spirits are the traveller's collection (docs/68), and the
  // charms behind them are derived from a ledger this reset clears - so
  // leaving the rolls would hand the next demo a collection with no
  // earnings behind it. The epochs are NOT here: see KEPT_TABLES.
  'summons',
  // Trees credited to a traveller. The planting they were credited from is a
  // partner's evidence and is kept; the credit to a person goes with them.
  'tree_attributions',
  // Local business profiles, reviews, photos and reports (PR #146). Children
  // go first so the foreign keys never see an orphan, and shops before users.
  //
  // A guide's licence document and profile photo (PR #153) hang off the same
  // `local_shops` row and go with it. The licence image especially: it is a
  // person's identity document, uploaded for one pilot, and leaving it in the
  // database through a demo reset would keep a scan of somebody's card for a
  // shop that no longer exists.
  'local_guide_documents', 'local_guide_profile_photos',
  'local_shop_media', 'local_shop_review_reports', 'local_shop_reviews', 'local_shops',
  'users',
] as const;

/**
 * Tables a reset deliberately leaves alone: pilot content, the operator's own
 * console session, and the AQI cache - clearing that last one would force live
 * network calls in the middle of a demo.
 */
export const KEPT_TABLES = [
  'places', 'quests', 'offers', 'hosts', 'host_sessions',
  'community_metrics', 'air_cache', 'air_history',
  // An operator's listings are content, like a place (docs/61).
  'listings',
  // The organisations, what they fund, and what their staff recorded about
  // it. A planting is a partner's photographed, append-only evidence, never a
  // traveller's to lose; a quest's locked plan belongs to the quest.
  'organisations', 'org_sponsorships', 'claim_adjustments', 'tree_plantings', 'quest_plan_locks',
  // Kept, and a reset never reaches them: it refuses to run while either has
  // a row. See checkNothingCited.
  'statement_countersignatures', 'statement_uses',
  /*
    Businesses that asked to list (docs/67). Not a traveller's doing, and an
    approved one is the only record of WHY a kept `hosts` row exists -
    clearing it would leave an operator account with no provenance, which is
    the opposite of what this product is for. A refusal is the record of a
    decision somebody made about a real business, and is kept for the same
    reason the audit log is.
  */
  'operator_applications',
  /*
    Where this database's contents came from.

    An import run is not a traveller's doing and not a partner's record - it is
    the provenance of the DATABASE, written once when a snapshot was replayed
    into it (see `import-service.ts`). A demo reset clears what a traveller
    did; erasing the row that says the data was imported, and when, would
    leave the pilot unable to answer where its own contents came from. That is
    the opposite of what this product asks of everything else.

    It also matters mechanically: clearing it would reopen the import guard on
    a database full of seeded content, which is precisely the state an import
    must refuse.
  */
  'import_runs',
  /*
    The summoning's commit-reveal (docs/68).

    An epoch is a PUBLISHED promise - its commitment hash is out in the world
    the moment it opens, and a revealed seed proves what every past roll had
    to be. Deleting that on a demo morning would quietly destroy the only
    evidence that the rolls were not chosen after the fact, which is the one
    claim this mechanic makes. The rolls themselves go with the traveller;
    the promise about them stays.
  */
  'summon_epochs',
  // The audit trail records what an administrator did. It is operational
  // evidence, not traveller state, and deliberately survives a demo reset.
  'admin_audit_log',
] as const;

/**
 * Fail before deleting anything if the schema has moved.
 *
 * Two ways it can drift, and both are silent without this. A renamed table
 * stops being cleared and the demo shows yesterday's data; a NEW table nobody
 * classified stops being cleared for the same reason, except nobody even knows
 * to look. Neither is worth discovering on stage, and a half-finished DELETE
 * loop is worse than either, so this runs first and aborts the whole run.
 */
export function checkSchema(db: DB): void {
  const present = new Set(
    (db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    ).all() as unknown as { name: string }[]).map((r) => r.name),
  );

  const missing = TRAVELLER_TABLES.filter((t) => !present.has(t));
  if (missing.length > 0) {
    throw new Error(
      `reset-demo expects tables that no longer exist: ${missing.join(", ")}. ` +
      'Renamed or dropped? Update TRAVELLER_TABLES.',
    );
  }

  const known = new Set<string>([...TRAVELLER_TABLES, ...KEPT_TABLES]);
  const unclassified = [...present].filter((t) => !known.has(t)).sort();
  if (unclassified.length > 0) {
    throw new Error(
      `reset-demo does not know what to do with: ${unclassified.join(", ")}. ` +
      'Add each to TRAVELLER_TABLES (cleared) or KEPT_TABLES (kept).',
    );
  }
}

/**
 * The pilot content has to be there before a traveller can be seeded onto it.
 *
 * Without this the first failure is "check-in at chaweng was refused outright",
 * which is true and useless: the check-in was refused because the place does
 * not exist, and the operator reading it at eight in the morning needs to be
 * told to run the content seed, not to debug a geofence.
 */
function checkContent(db: DB): void {
  const empty = (['places', 'quests', 'offers'] as const).filter(
    (t) => (db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as unknown as { n: number }).n === 0,
  );
  if (empty.length > 0) {
    throw new Error(
      `no ${empty.join(", ")} in this database. Run the content seed first:
` +
      '  pnpm --filter @chivago/api seed',
    );
  }
}

/**
 * A statement somebody outside has relied on is not demo data any more.
 *
 * A reset deletes every statement. An auditor's countersignature, or an
 * organisation's declared use of one in its report, points at a statement
 * from outside this database, and deleting it would leave a published report
 * citing nothing. So the reset refuses, before it deletes anything. The
 * foreign keys would refuse as well, but only once the deletes had begun.
 */
function checkNothingCited(db: DB): void {
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as unknown as { n: number }).n;
  const signed = count('statement_countersignatures');
  const used = count('statement_uses');
  if (signed + used > 0) {
    throw new Error(
      `reset-demo refused: ${signed} countersignature(s) and ${used} declared use(s) point at statements ` +
      'this reset would delete. A demo reset is for a database nobody outside relies on yet.',
    );
  }
}

export function reset(db: DB): void {
  checkSchema(db);
  checkContent(db);
  checkNothingCited(db);
  for (const table of TRAVELLER_TABLES) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
}

// ---------------------------------------------------------------------------
// Seed, by doing rather than writing
// ---------------------------------------------------------------------------

const place = (id: string) => {
  const p = SEED_PLACES.find((x) => x.id === id);
  if (!p) throw new Error(`seed place ${id} is gone - reset-demo needs updating`);
  return p;
};

const quest = (id: string) => {
  const q = SEED_QUESTS.find((x) => x.id === id);
  if (!q) throw new Error(`seed quest ${id} is gone - reset-demo needs updating`);
  return q;
};

/**
 * Five days on the island, ending today.
 *
 * The shape matters more than the volume, and every part of it is doing a job:
 *
 *  - Habitats visited on more than one day, so companions can hatch. Safe and
 *    Food three days, Green two, Wellness ONE - which puts an egg, a hatchling
 *    and a grown companion on screen together. The single Wellness day is
 *    deliberate: it leaves the presenter an egg to hatch live by checking in
 *    at Lamai, which is the one moment in the demo where the mechanic is shown
 *    working rather than described.
 *  - Enough days for the Healthy Score to hold a baseline. Below that it shows
 *    its "too short to judge" state, which is correct and undemonstrative.
 *  - Enough Trip Points to actually redeem something. A marketplace nobody can
 *    afford is a screen you can open and not use.
 *
 * Typed against the real mood union, so a key the app does not have fails at
 * the typecheck rather than three days before the demo.
 */
interface Plan {
  /** The area this history happens in, for the line the script prints. */
  area: string;
  days: { day: number; places: string[]; mood: MoodKey | null; rode?: true }[];
  /**
   * Quests taken all the way through host verification.
   *
   * Green Points exist ONLY at the end of this path - joined, arrived, proof
   * submitted, host approved - which is the whole difference between the two
   * currencies.
   */
  verifiedQuests: string[];
  /** The quest the second traveller does, so the standing has two names in it. */
  secondQuest: string;
  /** The quest whose host files a statement (docs/31). */
  statementQuest: string;
  /** The second traveller's shorter history. */
  secondDays: { day: number; places: string[] }[];
}

/**
 * Five days in the area, ending today.
 *
 * The shape matters more than the volume, and every part of it is doing a job:
 *
 *  - Habitats visited on more than one day, so companions can hatch. One
 *    habitat three days, another two, and one visited ONCE - which puts an
 *    egg, a hatchling and a grown companion on screen together. The single
 *    day is deliberate: it leaves the presenter an egg to hatch live, which
 *    is the one moment in the demo where the mechanic is shown working
 *    rather than described.
 *  - Enough days for the Healthy Score to hold a baseline. Below that it shows
 *    its "too short to judge" state, which is correct and undemonstrative.
 *  - Enough Trip Points to actually redeem something. A marketplace nobody can
 *    afford is a screen you can open and not use.
 *
 * Typed against the real mood union, so a key the app does not have fails at
 * the typecheck rather than three days before the demo.
 */
const PLAN: Plan = {
  area: 'Koh Sichang',
  days: [
    { day: 4, places: ['sc-hospital', 'sc-thamphang'], mood: 'steady' },
    { day: 3, places: ['sc-palace'], mood: 'bright' },
    { day: 2, places: ['sc-thamphang', 'sc-pier'], mood: 'tense' },
    { day: 1, places: ['sc-shops', 'sc-hospital'], mood: 'steady' },
    { day: 0, places: ['sc-hospital', 'sc-shops'], mood: 'bright' },
  ],
  verifiedQuests: [
    'q-sg-explorer',
    'q-sg-secret-recipe',
    'q-sg-trash-hero',
    'q-sg-local-treasure',
    'q-sg-green-journey',
  ],
  secondQuest: 'q-sg-explorer',
  statementQuest: 'q-sg-trash-hero',
  secondDays: [
    { day: 3, places: ['sc-shops'] },
    { day: 2, places: ['sc-hospital', 'sc-shops'] },
  ],
};

const HISTORY = PLAN.days;
const VERIFIED_QUESTS = PLAN.verifiedQuests;

function seed(db: DB): void {
  db.prepare('INSERT INTO users (id, display_name, locale, created_at) VALUES (?,?,?,?)')
    .run(USER, 'Demo Traveller', 'en', daysAgo(5).toISOString());

  /*
   * Provisioned exactly as the server provisions it.
   *
   * The pilot has no sign-up, so `server.ts` does these two on EVERY request
   * for whoever is asking. That means the opening balance lands the moment the
   * app makes its first call - and since this script empties the ledger, it
   * empties the grant's own idempotency record too, so the grant comes back.
   *
   * Doing it here rather than leaving it to the first request is the whole
   * point: otherwise --walk passes on a wallet nobody will ever see, and the
   * first number on stage is 640/1850 against a script that just said
   * 320/610. A check that validates a state the app immediately changes is
   * worse than no check, because it is trusted.
   */
  ensureWallet(db, USER);
  grantOpeningBalance(db, USER);

  // Onboarding, so the Healthy Score has a profile to weight itself by.
  db.prepare(
    `INSERT INTO profiles (user_id, purposes, activity, watch, completed_at,
       consent_version, consented_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(
    USER, JSON.stringify(['nature', 'food']), 'moderate', JSON.stringify(['air']),
    daysAgo(5).toISOString(), '2026-01', daysAgo(5).toISOString(),
  );

  // Check-ins through the real geofenced service, at the real coordinates. A
  // quietly refused one would leave a seeded state the app cannot produce, so
  // anything short of an award is fatal rather than skipped.
  // Two hours between places on a day. The second signal (docs/30) refuses
  // two beaches in the same instant as teleporting, and it is right to: a
  // history the machine would refuse is not a history worth showing.
  for (const day of HISTORY) {
    const dayAt = daysAgo(day.day);
    for (const [i, id] of day.places.entries()) {
      // Two hours apart, ending AT the day's timestamp rather than starting
      // from it. Counting forward put today's second check-in two hours into
      // the future, so `last_fix.at` was ahead of the clock and every live
      // check-in in the next two hours was "older than the last one known":
      // unjudged by the travel check and never recorded. The demo of the
      // second signal could not trip the second signal.
      const at = checkInAt(day.day, day.places.length, i, day.rode ? 3_600_000 : undefined);
      const p = place(id);
      const result = checkIn(db, { userId: USER, placeId: id, lat: p.lat, lng: p.lng, now: at });
      if (result === null) throw new Error(`check-in at ${id} was refused outright`);
      if (!result.awarded) {
        throw new Error(`check-in at ${id} on ${islandDateKey(at)} awarded nothing`);
      }
    }
    if (day.mood) recordMood(db, USER, { mood: day.mood }, dayAt);
  }

  // Each quest driven through the real state machine at the real coordinates.
  // An invalid transition or a failed geofence throws, which is the point: a
  // seeded state the app itself could not produce is not worth demonstrating.
  // Each quest three hours apart, and proof forty-five minutes after arrival:
  // the second signal (docs/30) refuses two sites in the same minute and a
  // proof filed on arrival, and a demo the machine would refuse is not worth
  // showing.
  for (const [i, id] of VERIFIED_QUESTS.entries()) {
    const q = quest(id);
    // Afternoon of the day before, three hours apart, clear of that day's
    // morning check-ins.
    const arrivedAt = new Date(daysAgo(1).getTime() + (8 + i * 3) * 3_600_000);
    const provedAt = new Date(arrivedAt.getTime() + 45 * 60_000);
    const here = { lat: q.lat, lng: q.lng, accuracyM: 8 };
    joinQuest(db, USER, q.id);
    arriveAtQuest(db, USER, q.id, here, arrivedAt);
    const { proofId } = submitProof(db, USER, q.id, {
      photos: [{
        uri: `demo://proof/${q.id}.jpg`,
        lat: q.lat,
        lng: q.lng,
        takenAt: provedAt.toISOString(),
      }],
      weightKg: 3.2,
      position: here,
    }, provedAt);
    resolveVerification(db, {
      userId: USER, questId: q.id, proofId, approved: true,
      reviewedBy: 'Demo host', reviewNote: null,
    });
  }

  /*
   * A second traveller, so the standing is a ranking and not a mirror.
   *
   * One participant is not a ranking (standing.ts), and the profile says so
   * rather than drawing a podium with one step. For the demo to show a
   * position at all there has to be somebody else whose work a host has
   * checked - so here is somebody else: two days on the island and one quest
   * taken all the way through the municipality's approval, driven through
   * the same services as everything above. Less than the demo traveller on
   * purpose, so the presenter's own record is the one on top; and nothing of
   * theirs but a count ever reaches a screen.
   */
  seedSecondTraveller(db);

  // One host files its statement (docs/31), so the demo can show a verified
  // quest as being on somebody's record. The Koh Sichang pilot host owns the
  // active catalogue. Approval is stamped at reset time, inside the calendar
  // year the statement covers.
  {
    const year = new Date().getUTCFullYear();
    issueStatement(db, quest(PLAN.statementQuest).host.id, { from: `${year}-01-01`, to: `${year}-12-31` }, 'Demo host');
  }

  // Contacts, so the SOS panel reports a real reached-count rather than the
  // prototype's fixed copy.
  //
  // The numbers are deliberately, visibly invented - repeated digits on the
  // mobile prefix. This snapshot is captured into a PUBLIC demo build, and a
  // plausible-looking Samui landline on a page anybody can open is somebody
  // else's phone ringing. Thailand has no reserved test range, so obviousness
  // is the whole safeguard.
  const contacts: [string, string, string][] = [
    ['Mae', '+66811111111', 'Mother'],
    ['Somchai', '+66822222222', 'Friend'],
    ['Hotel front desk', '+66833333333', 'Accommodation'],
  ];
  for (const [name, phone, relationship] of contacts) {
    db.prepare(
      `INSERT INTO emergency_contacts (id, user_id, name, phone, relationship, created_at)
       VALUES (?,?,?,?,?,?)`,
    ).run(
      `ec-${name.toLowerCase().replace(/\W+/g, '-')}`, USER, name, phone, relationship,
      daysAgo(3).toISOString(),
    );
  }
}

const SECOND = 'demo-traveller-2';

/** Two days on the island, both before the demo traveller's last two. */
const SECOND_HISTORY = PLAN.secondDays;

function seedSecondTraveller(db: DB): void {
  db.prepare('INSERT INTO users (id, display_name, locale, created_at) VALUES (?,?,?,?)')
    .run(SECOND, 'Demo Traveller 2', 'th', daysAgo(4).toISOString());
  // A wallet to credit, and no opening balance: a gift is not verified work
  // and would not count anyway, but a second traveller who never opened the
  // app has not been given one.
  ensureWallet(db, SECOND);

  // Check-ins through the real geofenced service, two hours apart, at the
  // real coordinates. The second signal is per traveller, so these need no
  // clearance from the demo traveller's.
  for (const day of SECOND_HISTORY) {
    for (const [i, id] of day.places.entries()) {
      const at = checkInAt(day.day, day.places.length, i);
      const p = place(id);
      const result = checkIn(db, { userId: SECOND, placeId: id, lat: p.lat, lng: p.lng, now: at });
      if (result === null || !result.awarded) {
        throw new Error(`second traveller: check-in at ${id} on ${islandDateKey(at)} was refused`);
      }
    }
  }

  // Sichang Explorer, all the way through the pilot host's approval: one
  // verified mission and its EXP - a participant, and second to the presenter.
  const q = quest(PLAN.secondQuest);
  const arrivedAt = new Date(daysAgo(2).getTime() + 6 * 3_600_000);
  const provedAt = new Date(arrivedAt.getTime() + 50 * 60_000);
  const here = { lat: q.lat, lng: q.lng, accuracyM: 9 };
  joinQuest(db, SECOND, q.id);
  arriveAtQuest(db, SECOND, q.id, here, arrivedAt);
  const { proofId } = submitProof(db, SECOND, q.id, {
    photos: [{ uri: `demo://proof/${q.id}-second.jpg`, lat: q.lat, lng: q.lng, takenAt: provedAt.toISOString() }],
    weightKg: 1.8,
    position: here,
  }, provedAt);
  resolveVerification(db, {
    userId: SECOND, questId: q.id, proofId, approved: true,
    reviewedBy: 'Demo host', reviewNote: null,
  });
}

// ---------------------------------------------------------------------------
// Walk
// ---------------------------------------------------------------------------

interface Check {
  screen: string;
  /** What must be true. Returns what it found, or throws saying what is wrong. */
  run: (db: DB) => string;
}

/**
 * One check per screen the demo opens, asserting it has something to show.
 *
 * Deliberately shallow: this is not a test suite, it is the thing that stops
 * somebody presenting an empty Wallet. Each check reads through the SAME
 * function the HTTP route calls, so a read path that returns nothing cannot
 * pass here and then fail on stage.
 */
const CHECKS: Check[] = [
  {
    screen: 'Wallet',
    run: (db) => {
      const b = getBalances(db, USER);
      if (b.trip <= 0) throw new Error('no Trip Points');
      const exp = getExp(db, USER);
      if (exp <= 0) throw new Error('no EXP, so the rank is level 1 with nothing behind it');
      return `${b.trip} trip · ${b.green} green · ${exp} exp`;
    },
  },
  {
    screen: 'Wallet history',
    run: (db) => {
      const entries = getLedger(db, USER);
      if (entries.length < 5) throw new Error(`only ${entries.length} ledger entries`);
      return `${entries.length} entries`;
    },
  },
  {
    screen: 'Chiva Balance',
    run: (db) => {
      const b = balanceFor(db, USER, NOW);
      if (b.total === null) {
        throw new Error('not enough history to score - it opens on the "too short" state');
      }
      if (b.components.length === 0) throw new Error('a score with no breakdown explains nothing');
      return `${b.total} from ${b.components.length} components`;
    },
  },
  {
    screen: 'Mood history',
    run: (db) => {
      const moods = moodHistory(db, USER);
      if (moods.length === 0) throw new Error('no mood check-ins');
      return `${moods.length} check-ins`;
    },
  },
  {
    screen: 'Companions',
    run: (db) => {
      const companions = companionsFor(habitatEvidenceFor(db, USER));
      if (companions.length === 0) throw new Error('no companions at all');
      // The active Koh Sichang quests may advance every visible companion.
      // Requiring an egg here would force us to withhold real progress just
      // to make the demo look staged; the collection only needs real evidence
      // and at least one companion to be demonstrable.
      return companions.map((c) => `${c.species.layer}:${c.stage}`).join(' ');
    },
  },
  {
    screen: 'Standing',
    run: (db) => {
      const travellers = travellerStandings(db);
      const participants = travellers.filter((t) => t.greenVerified > 0).length;
      if (!isRankable(participants)) {
        return `${participants} ranked participant(s) · ranking correctly unavailable`;
      }
      const position = positionOf(travellers, USER);
      if (position !== 1) throw new Error(`the demo traveller is #${position}, not on top`);
      return `#${position} of ${participants}`;
    },
  },
  {
    screen: 'Impact',
    run: (db) => {
      const stats = getPersonalImpact(db, USER);
      const moved = stats.filter((s) => s.value > 0);
      if (moved.length === 0) throw new Error('every impact figure is zero');
      return `${moved.length}/${stats.length} figures above zero`;
    },
  },
  {
    screen: 'Safety',
    run: (db) => {
      const shield = getShield(db, USER);
      if (shield.length === 0) throw new Error('no shield services');
      const live = db.prepare(
        `SELECT COUNT(*) n FROM sos_alerts
         WHERE user_id = ? AND status IN ('dispatching','acknowledged')`,
      ).get(USER) as unknown as { n: number };
      if (live.n > 0) throw new Error(`${live.n} SOS alert(s) still live from a previous run`);
      const contacts = db.prepare('SELECT COUNT(*) n FROM emergency_contacts WHERE user_id = ?')
        .get(USER) as unknown as { n: number };
      if (contacts.n === 0) throw new Error('no emergency contacts, so dispatch reaches nobody');
      return `${shield.length} services · ${contacts.n} contacts · no live alert`;
    },
  },
  {
    screen: 'Quests',
    run: (db) => {
      const all = listQuests(db);
      if (all.length === 0) throw new Error('no quests - has the content seed been run?');
      const today = listQuests(db, 'today');
      if (today.length === 0) throw new Error('nothing on today');
      return `${all.length} quests, ${today.length} today`;
    },
  },
  {
    screen: 'Marketplace',
    run: (db) => {
      const offers = listOffers(db);
      const available = offers.filter((o) => o.available);
      if (available.length === 0) throw new Error('nothing available to redeem');
      const balance = getBalances(db, USER);
      const afford = (c: 'trip' | 'green') => available.filter(
        (o) => o.currency === c && balance[c] >= o.costPoints,
      ).length;
      // Koh Sichang pilot quests award EXP, not spendable currency. The shop
      // must still have real inventory, but the reset must not invent Green
      // Points merely to make every offer affordable.
      return `${afford('trip')} trip · ${afford('green')} green affordable of ${offers.length}`;
    },
  },
];

function walk(db: DB): boolean {
  let failed = 0;
  for (const check of CHECKS) {
    try {
      console.log(`  PASS  ${check.screen.padEnd(16)} ${check.run(db)}`);
    } catch (error) {
      failed += 1;
      console.log(`  FAIL  ${check.screen.padEnd(16)} ${(error as Error).message}`);
    }
  }
  return failed === 0;
}

// ---------------------------------------------------------------------------

// CLI entry. Guarded so a test can import the classification without
// resetting anything.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('/reset-demo.ts')) {
  const db = openDb();
  reset(db);
  seed(db);

  const balances = getBalances(db, USER);
  console.log(
    `[chivago] demo reset: ${PLAN.area} · ${USER} · ${HISTORY.length} days · ` +
    `${balances.trip} trip · ${balances.green} green`,
  );

  if (WALK) {
    console.log('');
    console.log('[chivago] walking the demo:');
    if (!walk(db)) {
      console.log('');
      console.error('[chivago] the demo would open empty somewhere. Fix it before presenting.');
      process.exit(1);
    }
    console.log('');
    console.log('[chivago] every screen has something to show.');
  }
}
