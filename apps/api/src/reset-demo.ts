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
 *
 * `--walk` reads the seeded state back through the real read paths and exits
 * non-zero naming any screen that would open empty.
 */

import { openDb, type DB } from './db.ts';
import { checkIn } from './checkin-service.ts';
import { joinQuest, arriveAtQuest, submitProof, resolveVerification } from './quest-service.ts';
import { issueStatement } from './statement-service.ts';
import { recordMood, balanceFor, habitatEvidenceFor, moodHistory } from './wellness-service.ts';
import {
  ensureWallet, getBalances, getExp, getLedger, grantOpeningBalance,
} from './wallet-service.ts';
import { getPersonalImpact, getShield, listOffers, listQuests } from './repo.ts';
import {
  companionsFor, islandDateKey, SEED_PLACES, SEED_QUESTS, type MoodKey,
} from '@chivago/core';

const USER = process.env.CHIVAGO_DEMO_USER ?? 'demo-user';
const WALK = process.argv.includes('--walk');

/** Read once, so a run near midnight cannot straddle two island days. */
const NOW = new Date();
const daysAgo = (n: number): Date => new Date(NOW.getTime() - n * 86_400_000);

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
const TRAVELLER_TABLES = [
  // Recorded, not scored (docs/29) and the second signal (docs/30): both are
  // the traveller's, and a demo reset starts them from nothing.
  'self_visits', 'last_fix',
  // A statement is the pilot's record ABOUT travellers (docs/31). With the
  // travellers gone it would describe nobody, so it goes with them.
  'statements',
  'ledger', 'wallets', 'profiles',
  'mood_checkins', 'quest_progress', 'proofs', 'proof_files', 'vouchers',
  'place_reviews', 'review_reports', 'review_appeals', 'review_batches',
  'moderation_log', 'notifications', 'push_tokens',
  'sos_alerts', 'sos_dispatch', 'sos_escalations', 'sos_positions',
  'emergency_contacts',
  // Accounts and parties are the traveller's, not the pilot's. Both arrived
  // after this list was written, and the schema guard below did its job: the
  // reset refused to run at all until they were classified.
  'device_keys', 'link_codes', 'party_members', 'parties',
  'users',
] as const;

/**
 * Tables a reset deliberately leaves alone: pilot content, the operator's own
 * console session, and the AQI cache - clearing that last one would force live
 * network calls in the middle of a demo.
 */
const KEPT_TABLES = [
  'places', 'quests', 'offers', 'hosts', 'host_sessions',
  'community_metrics', 'air_cache',
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
function checkSchema(db: DB): void {
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

function reset(db: DB): void {
  checkSchema(db);
  checkContent(db);
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
const HISTORY: { day: number; places: string[]; mood: MoodKey | null }[] = [
  { day: 4, places: ['chaweng', 'namuang'], mood: 'steady' },
  { day: 3, places: ['fisherman', 'lamai'], mood: 'bright' },
  { day: 2, places: ['namuang', 'mangrove'], mood: 'tense' },
  { day: 1, places: ['fisherman', 'chaweng'], mood: 'steady' },
  { day: 0, places: ['chaweng', 'fisherman'], mood: 'bright' },
];

/**
 * Quests taken all the way through host verification.
 *
 * Three green and one trip, because the two currencies are the product's
 * central claim and a demo that can only spend one of them proves half of it.
 * Green Points exist ONLY at the end of this path - joined, arrived, proof
 * submitted, host approved - which is the whole difference between the two.
 */
const VERIFIED_QUESTS = ['q1', 'q2', 'q4', 'q5'] as const;

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
      const at = new Date(daysAgo(day.day).getTime() - (day.places.length - 1 - i) * 2 * 3_600_000);
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

  // One host files its statement (docs/31), so the demo can show a verified
  // quest as being on somebody's record. The municipality, because q1 is the
  // first quest anyone opens. Approval is stamped at reset time, inside the
  // calendar year the statement covers.
  {
    const year = new Date().getUTCFullYear();
    issueStatement(db, quest('q1').host.id, { from: `${year}-01-01`, to: `${year}-12-31` }, 'Demo host');
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
      if (b.green <= 0) throw new Error('no Green Points - the quest never verified');
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
      // All three stages, because the collection only explains itself when the
      // difference between them is visible side by side - and because an egg
      // left unhatched is the one the presenter opens live.
      for (const stage of ['egg', 'hatchling', 'grown'] as const) {
        if (!companions.some((c) => c.stage === stage)) {
          throw new Error(`nothing at the ${stage} stage - that step is undemonstrated`);
        }
      }
      return companions.map((c) => `${c.species.layer}:${c.stage}`).join(' ');
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
      // One in EACH currency. Two currencies that differ by evidence is the
      // central claim, and a demo that can only spend one of them proves half
      // of it - the wrong half, since Green is the one an auditor would ask
      // about.
      for (const currency of ['trip', 'green'] as const) {
        if (afford(currency) === 0) {
          throw new Error(
            `nothing affordable in ${currency} (${balance[currency]} held) - ` +
            'that half of the redeem flow cannot be shown',
          );
        }
      }
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

const db = openDb();
reset(db);
seed(db);

const balances = getBalances(db, USER);
console.log(
  `[chivago] demo reset: ${USER} · ${HISTORY.length} days · ` +
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
