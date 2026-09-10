/**
 * One demo account with all five companions, seeded in place.
 *
 * `reset-demo.ts` also produces a demonstrable traveller, but it empties
 * every table in TRAVELLER_TABLES first - users, device keys, reviews,
 * stories. On the pilot server that would delete the reviews and clips real
 * people have already posted at KU Sriracha. This adds one account and
 * touches nothing else: no DELETE anywhere in this file.
 *
 * WHAT IT WRITES, SAID PLAINLY
 *
 * Check-ins that did not physically happen, on a backdated clock, in the same
 * ledger as the ones that did. That is the cost of what it buys, so it comes
 * with three conditions:
 *
 *   1. The account SAYS it is a demo, in its display name, where anyone
 *      reading the table or the traveller standings will see it.
 *   2. One fixed user id. Re-running tops up what is missing and writes for
 *      nobody else.
 *   3. Every row goes through the real `checkIn`, geofence and all. A
 *      coordinate the app itself would refuse throws here instead of becoming
 *      a row nobody can account for.
 *
 * WHAT IT WILL NOT WRITE: a verified quest. Green Points exist only where a
 * named host approved something, and no script is a host - so this leaves
 * five hatchlings and no grown companion. Raising one is done by a host
 * approving a real quest, which is the whole point of the mechanic.
 *
 * The honest way to the same screen is to walk the campus with a phone on two
 * days. This exists for when there is not time to.
 *
 *   node --experimental-strip-types apps/api/src/seed-showcase.ts
 */

import { openDb, row, rows } from './db.ts';
import { checkIn } from './checkin-service.ts';
import { ensureWallet, grantOpeningBalance } from './wallet-service.ts';
import { habitatEvidenceFor } from './wellness-service.ts';
import { issueLinkCode, LINK_CODE_TTL_MS } from './account-service.ts';
import {
  areaByKey, collectionSummary, companionsFor, inArea, islandDateKey, LAYERS_WITH_SPECIES,
} from '@chivago/core';

const USER = process.env.CHIVAGO_SHOWCASE_USER ?? 'showcase-demo';
/** Read by anybody looking at the standings. It has to give itself away. */
const NAME = 'DEMO · seeded, not walked';
/** Where the demo is given. Its places are the ones the audience can walk to. */
const AREA = areaByKey('ku-sriracha');

const db = openDb();
const NOW = new Date();

/**
 * Two island days, both entirely in the past.
 *
 * Two because `HATCH_AT_DAYS` is two: one visit leaves an egg. Both past
 * because a timestamp in the future puts `last_fix` ahead of the clock, and
 * every real check-in until it catches up is then "older than the last one
 * known" - unjudged by the travel check and silently unrecorded. A seeding
 * script that broke the second signal for the rest of the morning would be a
 * bad trade for a screenshot.
 */
const DAYS_AGO = [2, 1];
/** Enough apart that the second signal reads a walk between them, not a jump. */
const MINUTES_APART = 20;

const at = (daysAgo: number, i: number): Date =>
  new Date(new Date(`${islandDateKey(new Date(NOW.getTime() - daysAgo * 86_400_000))}T09:00:00+07:00`).getTime()
    + i * MINUTES_APART * 60_000);

// ---------------------------------------------------------------------------
// One place per habitat, from the database rather than a list
// ---------------------------------------------------------------------------

const here = rows<{ id: string; layer: string; lat: number; lng: number; name_en: string }>(
  db.prepare('SELECT id, layer, lat, lng, name_en FROM places ORDER BY id').all(),
).filter((p) => inArea(AREA, p));

if (here.length === 0) {
  throw new Error(
    `no ${AREA.key} places in this database. Run the content seed first:\n`
    + '  pnpm --filter @chivago/api seed',
  );
}

/** First place found in each habitat. A companion needs somewhere to come from. */
const perHabitat = new Map<string, typeof here[number]>();
for (const p of here) if (!perHabitat.has(p.layer)) perHabitat.set(p.layer, p);

const missing = LAYERS_WITH_SPECIES.filter((l) => !perHabitat.has(l));
if (missing.length > 0) {
  throw new Error(
    `${AREA.key} has no place in ${missing.join(', ')}, so those companions cannot appear. `
    + 'Seeding four of five would be worse than seeding none: nobody looks twice.',
  );
}

// ---------------------------------------------------------------------------
// The account
// ---------------------------------------------------------------------------

if (!row(db.prepare('SELECT id FROM users WHERE id = ?').get(USER))) {
  db.prepare('INSERT INTO users (id, display_name, locale, created_at) VALUES (?,?,?,?)')
    .run(USER, NAME, 'en', at(DAYS_AGO[0]!, 0).toISOString());
  console.log(`[showcase] created "${USER}" — ${NAME}`);
} else {
  console.log(`[showcase] "${USER}" already exists; topping it up`);
}
// Exactly as the server provisions anybody: it does both of these on every
// request, so doing them here only moves the moment, never the numbers.
ensureWallet(db, USER);
grantOpeningBalance(db, USER);

// ---------------------------------------------------------------------------
// The visits, through the real service
// ---------------------------------------------------------------------------

const places = [...perHabitat.values()];
let written = 0;
for (const daysAgo of DAYS_AGO) {
  for (const [i, p] of places.entries()) {
    const when = at(daysAgo, i);
    const result = checkIn(db, { userId: USER, placeId: p.id, lat: p.lat, lng: p.lng, now: when });
    if (result === null) throw new Error(`${p.id} is not a place this database knows`);
    if (result.awarded) written += 1;
    else console.log(`[showcase] ${p.id} on ${islandDateKey(when)} was already there`);
  }
}

// ---------------------------------------------------------------------------
// What that produced, read back the way the app reads it
// ---------------------------------------------------------------------------

const companions = companionsFor(habitatEvidenceFor(db, USER));
const summary = collectionSummary(companions);

console.log(`\n[showcase] ${written} new check-ins across ${places.length} habitats`);
for (const c of companions) {
  console.log(`  ${c.species.layer.padEnd(9)} ${c.stage.padEnd(10)} ${c.species.name.en}`);
}
console.log(`[showcase] ${summary.found} / ${summary.total} found · ${summary.grown} grown`);

if (summary.found < summary.total) {
  throw new Error(
    `only ${summary.found} of ${summary.total} companions appeared. Something refused a check-in `
    + 'quietly - read the list above for the habitat that is missing.',
  );
}

// ---------------------------------------------------------------------------
// Getting it onto a phone
// ---------------------------------------------------------------------------

/*
  The same single-use code a traveller uses to add a second handset. No device
  key is printed or written here: the key is issued once, by `claimLinkCode`,
  to the phone that claims it. A key on a terminal is a key in a scrollback.
*/
const code = issueLinkCode(db, USER, NOW);
console.log(`\n[showcase] claim it on a phone: Wallet → Your account → add a phone`);
console.log(`[showcase] code ${code} — one use, ${LINK_CODE_TTL_MS / 60_000} minutes.`);
