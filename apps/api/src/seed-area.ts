/**
 * Open one area on a database that is already running: its places, its
 * quests and the hosts of those quests, from the core seed - INSERT ONLY.
 *
 *   node --experimental-strip-types apps/api/src/seed-area.ts --area rmutt
 *
 * WHY NOT seed-db.ts. That script is for an empty database. It re-asserts
 * every seeded row - a host's role, a place's scores, the community figures
 * somebody corrected by UPDATE - and it PRUNES every place and quest the seed
 * does not list. Run against production to add one campus, it would quietly
 * undo every correction made there and delete whatever was added since. So
 * nobody ran it, and RMUTT's chip opened onto an empty campus in production
 * for weeks: the only tool that could add the places was one that must not
 * be run there.
 *
 * This adds the rows that are missing and touches nothing that exists. A new
 * host gets a console key, printed ONCE, exactly as add-host.ts prints one -
 * and a host that already has a key keeps it.
 *
 *   ... seed-area.ts --area ku-sriracha --photos
 *
 * also brings the area's place photographs in line with the seed, and nothing
 * else: see `refreshPhotos`. On Fly, run it as the database's owner, AFTER the
 * deploy that ships the seed - it reads the seed of the image that is running:
 *
 *   fly ssh console -a chivago -u node -C "node --experimental-strip-types apps/api/src/seed-area.ts --area rmutt"
 */

import { parseArgs } from 'node:util';
import {
  AREAS, SAFETY_PHRASES, SEED_PLACES, SEED_QUESTS, areaByKey, inArea, isAreaKey,
  type AreaKey,
} from '@chivago/core';
import { openDb, transact, type DB } from './db.ts';
import { generateApiKey, hashApiKey } from './host-auth.ts';

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

export function seedArea(db: DB, key: AreaKey, now = new Date()): SeedAreaResult {
  if (!isAreaKey(key)) throw new Error(`area must be one of ${AREAS.map((a) => a.key).join(', ')}`);
  const area = areaByKey(key);
  const places = SEED_PLACES.filter((p) => p.province === area.province);
  const quests = SEED_QUESTS.filter((q) => inArea(area, q));
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
           safety_label_en, safety_label_th,
           crowd_density, aqi, safety_index, walkability, air_station)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO NOTHING`,
      ).run(
        p.id, p.name.en, p.name.th, p.short, p.layer, p.province, p.lat, p.lng, p.meta,
        p.blurb.en, p.blurb.th, JSON.stringify(p.tags),
        p.photo?.url ?? null, p.photo?.credit ?? null,
        p.photo?.licence ?? null, p.photo?.sourceUrl ?? null,
        safety.en, safety.th,
        p.metrics.crowdDensity, p.metrics.aqi, p.metrics.safetyIndex, p.metrics.walkability,
        p.airStation ? JSON.stringify(p.airStation) : null,
      );
      result.placesAdded += Number(added.changes ?? 0);
    }

    for (const q of quests) {
      const added = db.prepare(
        `INSERT INTO quests (id, code, name_en, name_th, where_label, where_label_th,
           duration, duration_th, reward_points,
           reward_currency, host_id, kind, lat, lng, geofence_radius_m, esg_pillar)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO NOTHING`,
      ).run(
        q.id, q.code, q.name.en, q.name.th, q.where.en, q.where.th,
        q.duration.en, q.duration.th, q.rewardPoints,
        q.rewardCurrency, q.host.id, q.kind, q.lat, q.lng, q.geofenceRadiusM,
        q.esgPillar ?? null,
      );
      result.questsAdded += Number(added.changes ?? 0);
    }

    return result;
  });
}

/**
 * Bring an area's place photographs in line with the seed: the one thing this
 * script changes on a row that exists, and only when asked (`--photos`).
 *
 * A photograph is a file in this repository (apps/mobile/public/assets/places)
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
      const photo = [p.photo?.url ?? null, p.photo?.credit ?? null, p.photo?.licence ?? null, p.photo?.sourceUrl ?? null];
      // `IS` compares null to null as equal, so a row already in line is not
      // written and not reported.
      const set = db.prepare(
        `UPDATE places SET photo_url = ?, photo_credit = ?, photo_licence = ?, photo_source = ?
         WHERE id = ? AND NOT (photo_url IS ? AND photo_credit IS ? AND photo_licence IS ? AND photo_source IS ?)`,
      ).run(...photo, p.id, ...photo);
      if (Number(set.changes ?? 0) > 0) changed.push(p.id);
    }
    return changed;
  });
}

/**
 * Why seed-db.ts must not run here, or null when it may.
 *
 * It may on an empty database - the first-run step in fly.toml and docs/46 -
 * and anywhere that is not production. On a production database that already
 * has places it would re-assert every seeded row and delete every place and
 * quest the seed does not list, and that has to be asked for out loud.
 */
export function reseedRefusal(args: {
  env: string | undefined; places: number; argv: readonly string[];
}): string | null {
  if (args.env !== 'production' || args.places === 0 || args.argv.includes('--reseed-production')) return null;
  return 'seed-db refused: this production database already has places. Re-seeding re-asserts every seeded '
    + 'row and DELETES every place and quest the seed does not list. To open an area, run '
    + 'seed-area.ts --area <key>. To re-seed anyway, pass --reseed-production.';
}

// CLI entry. Guarded so the test harness can import `seedArea` without running it.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('/seed-area.ts')) {
  const { values } = parseArgs({ options: { area: { type: 'string' }, photos: { type: 'boolean' } } });
  if (!isAreaKey(values.area)) {
    console.error(`usage: seed-area.ts --area <${AREAS.map((a) => a.key).join('|')}> [--photos]`);
    process.exit(2);
  }
  const db = openDb();
  const r = seedArea(db, values.area);
  console.log(
    `[chivago] area ${r.area}: places ${r.placesAdded} of ${r.placesTotal} added, `
    + `quests ${r.questsAdded} of ${r.questsTotal} added, `
    + `hosts created ${r.hostsCreated.length ? r.hostsCreated.join(', ') : 'none'}.`,
  );
  const photos = values.photos ? refreshPhotos(db, values.area) : [];
  console.log(photos.length
    ? `[chivago] photographs brought in line with the seed: ${photos.join(', ')}. Nothing else that existed was changed.`
    : '[chivago] Nothing that existed was changed.');
  for (const [name, key] of r.keys) {
    console.log(`[chivago] Console access key for ${name} - shown ONCE, hand it over in person:`);
    console.log(`          ${key}`);
  }
}
