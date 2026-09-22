/**
 * The island's monsters, read off rows that already exist.
 *
 * Nothing here writes. A monster is summoned by a measurement or by a host's
 * open clean-up, and pushed back by deeds the ledger already holds - a
 * verified quest, a measured leg on foot. There is no monster table, no
 * "attack" endpoint and no counter to keep in step with reality, because
 * every number is derived the moment it is asked for. A hidden or reversed
 * deed simply stops counting the next time anybody looks.
 *
 * That is not tidiness for its own sake. A stored HP figure would be a
 * second place where the truth lives, and the first thing anybody would do
 * on a demo day is find the request that decrements it.
 */

import {
  areaByKey, inArea, isAreaKey, monsterState, monstersAt,
  type Deed, type MonsterKey,
} from '@chivago/core';
import type { Bilingual } from '@chivago/core';
import { row, rows, type DB } from './db.ts';

export interface StandingMonster {
  key: MonsterKey;
  placeId: string;
  placeName: Bilingual;
  /** The measurement or record that put it here. Printed beside it. */
  because: Bilingual;
  progress: number;
  needed: number;
  restingUntil: string | null;
}

interface PlaceRow {
  id: string; name_en: string; name_th: string; lat: number; lng: number; aqi: number;
}

/**
 * The deeds done at a place inside the window, from the ledger.
 *
 * A quest counts where its SITE is the place, not where the traveller was
 * standing when the host approved it - the work happened at the site. A leg
 * on foot counts at both ends, because walking from a place is as much a
 * choice not to ride as walking to one.
 *
 * A check-in is deliberately absent. Standing next to a problem is not doing
 * anything about it, and letting it fill the bar would make the bar a lie.
 */
/*
  The two reads behind every monster on the map, as named constants.

  Exported so `monster-service.test.ts` can put EXPLAIN QUERY PLAN in front of
  the exact text that runs. A test carrying its own copy of the SQL would go on
  passing while the query it was written to protect drifted away from it, which
  is precisely the failure that let these two scan the whole ledger unnoticed
  for as long as they did.
*/

/**
 * Verified quests, by the place their quest sits at.
 *
 * `currency = 'green'` is not in the index and does not need to be: `kind` is
 * already selective enough that the currency filter runs over a handful of
 * rows. Putting it in the middle of the index would serve this query and stop
 * serving the one below, which has no currency filter at all.
 */
export const VERIFIED_QUEST_DEEDS_SQL = `SELECT l.occurred_at, p.id AS place_id
   FROM ledger l
   JOIN quests q ON q.id = substr(l.source_ref, 7, instr(substr(l.source_ref, 7), ':user:') - 1)
   JOIN places p ON p.lat = q.lat AND p.lng = q.lng
  WHERE l.kind = 'quest_reward' AND l.currency = 'green' AND l.occurred_at >= ?`;

/** Legs on foot. */
export const WALKED_LEG_DEEDS_SQL =
  "SELECT occurred_at, source_ref FROM ledger WHERE kind = 'walk' AND occurred_at >= ?";

function readDeedsByPlace(db: DB, since: string): Map<string, Deed[]> {
  const out = new Map<string, Deed[]>();
  const add = (placeId: string, deed: Deed) => {
    const list = out.get(placeId);
    if (list) list.push(deed);
    else out.set(placeId, [deed]);
  };

  // Verified quests: the ledger row's source_ref carries the quest id, and
  // the quest carries the site. Green currency only - a Trip-paying quest is
  // self-reported, and self-reported work must not push a monster back.
  for (const r of rows<{ occurred_at: string; place_id: string }>(
    db.prepare(VERIFIED_QUEST_DEEDS_SQL).all(since),
  )) {
    add(r.place_id, { kind: 'verifiedQuest', at: r.occurred_at });
  }

  // Legs on foot: `walk:<from>:<to>:user:...`, and both ends count.
  for (const r of rows<{ occurred_at: string; source_ref: string }>(
    db.prepare(WALKED_LEG_DEEDS_SQL).all(since),
  )) {
    const [, from, to] = r.source_ref.split(':');
    for (const id of [from, to]) if (id) add(id, { kind: 'walkedLeg', at: r.occurred_at });
  }

  return out;
}


/**
 * The deed sweep, remembered between readers.
 *
 * WHY THIS IS SAFE HERE AND WOULD NOT BE ANYWHERE ELSE IN THIS FILE. The
 * point of deriving a monster is that no second copy of the truth exists to
 * drift; a cache is a second copy, so it is only allowed where it cannot
 * drift silently. This one cannot, because its KEY IS THE TRUTH: the highest
 * ledger rowid, plus the minute the seven-day window starts in. ANY new
 * ledger row changes the first - the table is append-only, nothing in this
 * codebase deletes from it, and a reversal is itself an insert - while the
 * clock changes the second. Either one and the sweep is done again.
 *
 * `MAX(rowid)` is why this needs no hook in the write path. Nothing in
 * `wallet-service.ts` has to remember to call an invalidate, so nothing can
 * forget to; and a row written by another process is noticed just the same.
 *
 * WHAT IT IS WORTH. `deedsByPlace` reads every walk and quest reward in the
 * window across the WHOLE COUNTRY and then the caller throws away the places
 * outside the area being drawn - so the answer is identical for every reader
 * on the island, and before this each of them paid for it again. Measured at
 * a million ledger rows with a busy week in them: 122 ms a call, six calls a
 * second on one core, and `node:sqlite` is synchronous - so that was 122 ms
 * everybody else spent waiting too.
 *
 * WHAT IT COSTS. Up to a minute of staleness at the window's trailing edge:
 * a deed done eight days ago may keep counting for up to 60 s past its
 * expiry. Nothing at the leading edge, which is the end that matters - the
 * traveller whose quest was just approved is the one most likely to look, and
 * their approval wrote a ledger row, which changed the key.
 *
 * Keyed by `db` in a WeakMap rather than by nothing, because the test suite
 * opens a fresh `:memory:` database per test and two of them would otherwise
 * share one entry - same rowid, different island.
 */
const SWEEP_BUCKET_MS = 60_000;

interface Sweep { key: string; deeds: Map<string, Deed[]> }
const sweeps = new WeakMap<DB, Sweep>();

/** The clock and the ledger, as one string. Cheap: MAX(rowid) is an O(1) read. */
function sweepKey(db: DB, since: string): string {
  const high = row<{ high: number | null }>(
    db.prepare('SELECT MAX(rowid) AS high FROM ledger').get(),
  );
  const bucket = Math.floor(Date.parse(since) / SWEEP_BUCKET_MS);
  return `${bucket}:${high?.high ?? 0}`;
}

function deedsByPlace(db: DB, since: string): Map<string, Deed[]> {
  const key = sweepKey(db, since);
  const held = sweeps.get(db);
  if (held && held.key === key) return held.deeds;
  const deeds = readDeedsByPlace(db, since);
  sweeps.set(db, { key, deeds });
  return deeds;
}

/**
 * Forget everything. For tests that need to prove the sweep ran, and for
 * nothing else - production has no reason to call it, because the key already
 * says when the answer changed.
 */
export function forgetDeedSweeps(db: DB): void {
  sweeps.delete(db);
}

/** Places in this area with a host's clean-up open on them right now. */
function cleanupPlaces(db: DB): Set<string> {
  return new Set(
    rows<{ place_id: string }>(
      db.prepare(
        `SELECT DISTINCT p.id AS place_id
           FROM quests q JOIN places p ON p.lat = q.lat AND p.lng = q.lng
          WHERE q.esg_pillar = 'environmental'`,
      ).all(),
    ).map((r) => r.place_id),
  );
}

/**
 * Every monster standing in an area, newest reading first.
 *
 * `aqiFor` is passed in rather than fetched here so the caller can hand over
 * the same live reading the place cards are already showing. Two different
 * numbers for one place's air on one screen would be worse than none.
 */
export function monstersInArea(
  db: DB,
  areaKey: string,
  aqiFor: (placeId: string) => { aqi: number; provenance: 'live' | 'daily' | 'estimated' | 'stale' },
  now = new Date(),
): StandingMonster[] {
  if (!isAreaKey(areaKey)) return [];
  const area = areaByKey(areaKey);
  const since = new Date(now.getTime() - 7 * 24 * 3_600_000).toISOString();
  const deeds = deedsByPlace(db, since);
  const cleanups = cleanupPlaces(db);

  const places = rows<PlaceRow>(
    db.prepare('SELECT id, name_en, name_th, lat, lng, aqi FROM places').all(),
  ).filter((p) => inArea(area, p));

  const out: StandingMonster[] = [];
  for (const place of places) {
    const air = aqiFor(place.id);
    const standing = monstersAt({
      placeId: place.id,
      aqi: air.aqi,
      aqiProvenance: air.provenance,
      hasOpenCleanup: cleanups.has(place.id),
    });
    for (const m of standing) {
      const state = monsterState(deeds.get(place.id) ?? [], now);
      out.push({
        key: m.key,
        placeId: place.id,
        placeName: { en: place.name_en, th: place.name_th },
        because: m.because,
        ...state,
      });
    }
  }
  return out;
}
