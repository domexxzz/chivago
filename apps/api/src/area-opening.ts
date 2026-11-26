/**
 * Opening an area on a database that is already live.
 *
 * WHY THIS IS NOT IN `seed-area.ts`, which is where it used to be. That file
 * imports `openDb` from `db-node.ts`, which imports `node:sqlite`, which does
 * not exist on Workers. Importing it from a route would break the Worker
 * build. So the logic lives here, against `./db.ts` and nothing Node-only, and
 * `seed-area.ts` keeps the CLI and re-exports this.
 *
 * THE PROBLEM THIS SOLVES, found on 13 November 2026 while re-walking
 * `docs/72`. The field guide replaced Ko Sichang's quests: three became five,
 * 270 Green became 540. The code had them. Production did not - it was still
 * serving two quests worth 180 - and there was no way to get them there.
 * Nothing in the running application could write the `quests` table at all:
 * every writer was a test, or `seed-db.ts` / `seed-area.ts`, which open a
 * local SQLite file and cannot reach a Durable Object. The deploy does not
 * seed, deliberately, and `bootstrapKohSichangBusinesses` writes only
 * `places` and `local_shops`.
 *
 * So on the day, the screen would have shown a number the deck contradicts.
 *
 * NOT ON BOOT, and that is deliberate too. A Durable Object is constructed
 * thousands of times a day, and the outage of 12 November was caused by
 * exactly this reflex - doing setup work on every wake-up. This runs when an
 * operator asks for it and not otherwise. `POST /internal/open-area`.
 */

import {
  ACTIVE_QUESTS, AREAS, RETIRED_CODE_PREFIX, SAFETY_PHRASES, SEED_PLACES,
  areaByKey, inArea, isAreaKey,
  type AreaKey,
} from '@chivago/core';
import { rows, transact, type DB } from './db.ts';
import { generateApiKey, hashApiKey } from './host-auth.ts';
import { invalidatePlaceList } from './place-list-cache.ts';

export interface SeedAreaResult {
  area: AreaKey;
  hostsCreated: string[];
  placesAdded: number;
  placesTotal: number;
  questsAdded: number;
  questsTotal: number;
  /** New console keys, host name first. Shown once; only the hash is stored. */
  keys: [string, string][];
}

/**
 * A code that is no longer the seed's, kept out of the seed's way.
 *
 * `quests.code` is UNIQUE, and the five-quest set reuses SC-01 and SC-02 -
 * which the superseded quests were holding. Inserting over that throws, so the
 * old code has to move before the new one can land.
 */
/*
  The prefix comes from `@chivago/core`, not from here.

  This file defined its own `'X-'` while the branch was open, and `seed.ts`
  then exported `RETIRED_CODE_PREFIX` with `isRetiredQuestCode` beside it —
  two copies of one convention, in the one place where disagreeing about it
  means a retired quest that nothing recognises as retired.
*/
const RETIRED_PREFIX = RETIRED_CODE_PREFIX;

export interface RetireResult {
  /** Superseded quests nobody had started. Gone. */
  deleted: string[];
  /** Superseded quests somebody's work points at. Kept, code freed. */
  kept: string[];
}

/**
 * Get the superseded quests out of the way of the seeded ones.
 *
 * A quest inside the area that the seed no longer lists has been replaced, and
 * what happens to it depends on one question: has anybody started it?
 *
 *   NOBODY HAS → delete it. It is content, it was replaced, and leaving it on
 *   the screen means the app shows more missions than the deck claims.
 *
 *   SOMEBODY HAS → KEEP IT. On 6 November a volunteer walked `q-sc-beach` end
 *   to end and a certificate was issued against that work; `docs/72` tells the
 *   speaker to open it on stage. Deleting the quest would orphan the evidence
 *   behind a certificate we are asking a judge to trust. Evidence is the
 *   product. Only the `code` moves, which frees SC-01/SC-02 for the seed and
 *   changes nothing a traveller sees - the screen shows `name`, not `code`.
 *
 * Returns both lists, because an operator who runs this needs to know a quest
 * was kept: it will still be in the app, and that is a decision somebody may
 * want to take further than this function is allowed to.
 */
export function retireSupersededQuests(db: DB, key: AreaKey): RetireResult {
  if (!isAreaKey(key)) throw new Error(`area must be one of ${AREAS.map((a) => a.key).join(', ')}`);
  const area = areaByKey(key);
  /*
    ACTIVE_QUESTS, not SEED_QUESTS, and the difference is the bug this
    function exists for.

    `SEED_QUESTS` is the historical catalogue - it still holds SC-01..SC-03
    beside the SG-01..SG-05 that replaced them, because finished progress and
    ledger rows can still name an older quest. Asking it what is current
    answers "both", so the superseded SC rows would survive the run that was
    meant to supersede them and the island would show more missions than the
    deck claims. `ACTIVE_QUESTS` is the published five.

    Only this area's quests are considered either way - the filter below is
    `inArea` - so Samui's BC-04 and the campuses' KU-01 are never in reach.
  */
  const seeded = new Set(ACTIVE_QUESTS.filter((q) => inArea(area, q)).map((q) => q.id));

  // Not the seed's to retire: a campus host wrote it and a reviewer approved it.
  const written = new Set(rows<{ id: string }>(db.prepare('SELECT id FROM host_quests').all()).map((q) => q.id));

  const live = rows<{ id: string; code: string; lat: number; lng: number }>(
    db.prepare('SELECT id, code, lat, lng FROM quests').all(),
  ).filter((q) => inArea(area, q) && !seeded.has(q.id) && !written.has(q.id));

  const result: RetireResult = { deleted: [], kept: [] };

  for (const q of live) {
    const started = db.prepare('SELECT 1 FROM quest_progress WHERE quest_id = ? LIMIT 1').get(q.id);
    if (!started) {
      db.prepare('DELETE FROM quests WHERE id = ?').run(q.id);
      result.deleted.push(q.id);
      continue;
    }
    // Already moved aside by an earlier run: leave the code alone rather than
    // growing an X-X-X- prefix on every call.
    if (!q.code.startsWith(RETIRED_PREFIX)) {
      db.prepare('UPDATE quests SET code = ? WHERE id = ?').run(RETIRED_PREFIX + q.code, q.id);
    }
    result.kept.push(q.id);
  }

  return result;
}

/**
 * Add an area's hosts, places and quests. INSERT ONLY.
 *
 * Nothing here updates a row that exists. `seed-db.ts` is the one that asserts
 * the seed over a whole database and prunes what it does not list, and it
 * refuses to do that to production for good reason. This is the other shape:
 * safe to run against a database with travellers in it, because the worst it
 * can do is add something that was already there, which it then does not.
 */
export function seedArea(db: DB, key: AreaKey, now = new Date()): SeedAreaResult {
  if (!isAreaKey(key)) throw new Error(`area must be one of ${AREAS.map((a) => a.key).join(', ')}`);
  const area = areaByKey(key);
  const places = SEED_PLACES.filter((p) => p.province === area.province);
  const quests = ACTIVE_QUESTS.filter((q) => inArea(area, q));
  const hosts = [...new Map(quests.map((q) => [q.host.id, q.host])).values()];

  return transact(db, () => {
    const result: SeedAreaResult = {
      area: key, hostsCreated: [], keys: [],
      placesAdded: 0, placesTotal: places.length, questsAdded: 0, questsTotal: quests.length,
    };

    // Hosts first: a quest names its host, and the host must exist to be named.
    for (const host of hosts) {
      const made = db.prepare(
        `INSERT INTO hosts (id, name, type, role, created_at) VALUES (?, ?, ?, 'host', ?)
         ON CONFLICT(id) DO NOTHING`,
      ).run(host.id, host.name, host.type, now.toISOString());
      if (Number(made.changes ?? 0) > 0) result.hostsCreated.push(host.id);

      // A key only for a host that has none. The UPDATE re-checks, so a key
      // issued between the read and the write is never replaced.
      const keyless = db.prepare('SELECT 1 FROM hosts WHERE id = ? AND api_key_hash IS NULL').get(host.id);
      if (keyless) {
        const apiKey = generateApiKey();
        const set = db.prepare('UPDATE hosts SET api_key_hash = ? WHERE id = ? AND api_key_hash IS NULL')
          .run(hashApiKey(apiKey), host.id);
        if (Number(set.changes ?? 0) > 0) result.keys.push([host.name, apiKey]);
      }
    }

    for (const p of places) {
      const safety = SAFETY_PHRASES[p.id]!;
      const added = db.prepare(
        `INSERT INTO places (id, name_en, name_th, short, layer, province, lat, lng, meta,
           blurb_en, blurb_th, tags, photo_url, photo_credit, photo_licence, photo_source,
           photo_kind, photo_backdrop,
           safety_label_en, safety_label_th,
           crowd_density, aqi, safety_index, walkability, air_station, booking_url)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO NOTHING`,
      ).run(
        p.id, p.name.en, p.name.th, p.short, p.layer, p.province, p.lat, p.lng, p.meta,
        p.blurb.en, p.blurb.th, JSON.stringify(p.tags),
        p.photo?.url ?? null, p.photo?.credit ?? null,
        p.photo?.licence ?? null, p.photo?.sourceUrl ?? null,
        p.photo?.kind ?? null, p.photo?.backdrop ?? null,
        safety.en, safety.th,
        p.metrics.crowdDensity, p.metrics.aqi, p.metrics.safetyIndex, p.metrics.walkability,
        p.airStation ? JSON.stringify(p.airStation) : null,
        p.bookingUrl ?? null,
      );
      result.placesAdded += Number(added.changes ?? 0);
    }

    for (const q of quests) {
      const added = db.prepare(
        `INSERT INTO quests (id, code, name_en, name_th, where_label, where_label_th,
           duration, duration_th, reward_points, reward_exp,
           reward_currency, host_id, kind, lat, lng, geofence_radius_m, esg_pillar)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO NOTHING`,
      ).run(
        q.id, q.code, q.name.en, q.name.th, q.where.en, q.where.th,
        q.duration.en, q.duration.th, q.rewardPoints, q.rewardExp ?? null,
        q.rewardCurrency, q.host.id, q.kind, q.lat, q.lng, q.geofenceRadiusM,
        q.esgPillar ?? null,
      );
      result.questsAdded += Number(added.changes ?? 0);
    }

    invalidatePlaceList(db);
    return result;
  });
}

export interface OpenAreaResult extends SeedAreaResult {
  retired: RetireResult;
  /** Every quest the area has once this has run, newest set first. */
  questsLive: { id: string; code: string; rewardPoints: number }[];
}

/*
  MOVED HERE on 15 November 2026, from `seed-area.ts`, for the reason that
  file records about `seedArea` before it: the CLI half imports `node:sqlite`,
  which does not exist on Workers, so a route reaching in there breaks the
  build.

  WHAT MADE IT URGENT. Koniix Garden Cottage went on the Ko Sichang map with
  no photograph, the property gave one an hour later, and nothing running
  inside a Durable Object could attach it: `seedArea` inserts and never
  asserts, and the one tool that refreshes a photograph was on the Node side
  of the wall. A pilot whose pictures can only be fixed by rebuilding the
  database is a pilot that ships its first omission for ever.

  Unchanged otherwise, and `seed-area.ts` re-exports it so the CLI and its
  tests still call the same function.
*/
/**
 * Bring an area's place photographs in line with the seed: the one thing this
 * script changes on a row that exists, and only when asked (`--photos`).
 *
 * A photograph is a file in this repository (apps/mobile/public/media/places)
 * with its credit and licence written beside it in the seed, so for these four
 * columns the seed IS the source of truth, as it is not for a place's scores
 * or a host's name. They are set to exactly what the seed says, null included:
 * a photograph taken out of the seed - somebody in frame took back their
 * consent - comes off the live place as well. Nothing else in the row moves.
 *
 * Returns the ids of the places whose photograph changed.
 */
export function refreshPhotos(db: DB, key: AreaKey): string[] {
  if (!isAreaKey(key)) throw new Error(`area must be one of ${AREAS.map((a) => a.key).join(', ')}`);
  const area = areaByKey(key);
  return transact(db, () => {
    const changed: string[] = [];
    for (const p of SEED_PLACES.filter((x) => x.province === area.province)) {
      /*
        Six fields, not four (#169). `kind` and `backdrop` say whether the
        picture is a photograph or the venue's own logo, and what colour the
        frame around a logo should be - facts the seed has carried since
        Badminton@Sinthani was added and the database had nowhere to put.

        They travel with the url for the same reason the credit does: a
        picture and what may be said about it are one record, and bringing
        half of it in line is how a logo ends up credited to a photographer.
      */
      const photo = [
        p.photo?.url ?? null, p.photo?.credit ?? null, p.photo?.licence ?? null, p.photo?.sourceUrl ?? null,
        p.photo?.kind ?? null, p.photo?.backdrop ?? null,
      ];
      // `IS` compares null to null as equal, so a row already in line is not
      // written and not reported.
      const set = db.prepare(
        `UPDATE places SET photo_url = ?, photo_credit = ?, photo_licence = ?, photo_source = ?,
                           photo_kind = ?, photo_backdrop = ?
         WHERE id = ? AND NOT (photo_url IS ? AND photo_credit IS ? AND photo_licence IS ? AND photo_source IS ?
                               AND photo_kind IS ? AND photo_backdrop IS ?)`,
      ).run(...photo, p.id, ...photo);
      if (Number(set.changes ?? 0) > 0) changed.push(p.id);
    }
    invalidatePlaceList(db);
    return changed;
  });
}

/**
 * Bring an area's place WORDING in line with the seed (`{ "text": true }`).
 *
 * The sibling of `refreshPhotos`, and it exists for the same reason: Koniix
 * was planted as a stay and the owner then asked for it to read as
 * accommodation, and there was no way to say so to a row that was already
 * live. A pilot that can never correct a sentence ships its first wording
 * for ever.
 *
 * WHICH COLUMNS, AND WHY THESE. `admin-service.ts` lets an operator edit a
 * place's NAME, short name, layer, province and position. Nothing in the
 * application can edit its meta line, its blurb, its tags or its safety
 * phrase - so the seed may own the second set outright while the first stays
 * the operator's. The line is checkable rather than a feeling: if an admin
 * path ever learns to edit a blurb, this list must shrink the same day.
 *
 * OPT-IN, like the photographs. An ordinary `openArea` inserts and never
 * asserts, which is what makes it safe to run against a database with
 * travellers in it; changing the words on live rows is a thing somebody asks
 * for out loud, and the answer says which places changed.
 *
 * Returns the ids of the places whose wording changed.
 */
export function refreshText(db: DB, key: AreaKey): string[] {
  if (!isAreaKey(key)) throw new Error(`area must be one of ${AREAS.map((a) => a.key).join(', ')}`);
  const area = areaByKey(key);
  return transact(db, () => {
    const changed: string[] = [];
    // The same selection `seedArea` uses for places - by province, not by
    // bounding box - so the two can never disagree about which rows an area
    // owns. It is why opening Ko Sichang also reaches the Si Racha campus:
    // both are TH-20, and that is this file's convention rather than a slip.
    for (const p of SEED_PLACES.filter((x) => x.province === area.province)) {
      const safety = SAFETY_PHRASES[p.id];
      if (!safety) continue; // a place with no phrase is not the seed's to assert
      const text = [p.meta, p.blurb.en, p.blurb.th, JSON.stringify(p.tags), safety.en, safety.th];
      const set = db.prepare(
        `UPDATE places SET meta = ?, blurb_en = ?, blurb_th = ?, tags = ?,
                           safety_label_en = ?, safety_label_th = ?
         WHERE id = ? AND NOT (meta IS ? AND blurb_en IS ? AND blurb_th IS ? AND tags IS ?
                               AND safety_label_en IS ? AND safety_label_th IS ?)`,
      ).run(...text, p.id, ...text);
      if (Number(set.changes ?? 0) > 0) changed.push(p.id);
    }
    invalidatePlaceList(db);
    return changed;
  });
}


/**
 * Retire what the seed replaced, then add what the seed has. One transaction.
 *
 * Both halves together, because half of this is worse than neither: codes
 * freed but the new quests not inserted leaves an area with nothing, and
 * inserting without freeing throws on the UNIQUE code and rolls back anyway.
 *
 * The result carries the quests the area ENDS UP WITH, not only what changed,
 * because the question an operator actually has is "what will the screen show
 * now" - and after a kept-but-retired quest the answer is not simply the seed.
 */
export function openArea(db: DB, key: AreaKey, now = new Date()): OpenAreaResult {
  if (!isAreaKey(key)) throw new Error(`area must be one of ${AREAS.map((a) => a.key).join(', ')}`);
  const area = areaByKey(key);

  return transact(db, () => {
    const retired = retireSupersededQuests(db, key);
    const seeded = seedArea(db, key, now);
    const questsLive = rows<{ id: string; code: string; reward_points: number; lat: number; lng: number }>(
      db.prepare('SELECT id, code, reward_points, lat, lng FROM quests ORDER BY code').all(),
    )
      .filter((q) => inArea(area, q))
      .map((q) => ({ id: q.id, code: q.code, rewardPoints: q.reward_points }));

    return { ...seeded, retired, questsLive };
  });
}
