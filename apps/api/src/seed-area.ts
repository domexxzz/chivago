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
 * else: see `refreshPhotos`. `--stations` does the same for which Air4Thai
 * station speaks for each place: see `refreshStations`. On Fly, run it as the database's owner, AFTER the
 * deploy that ships the seed - it reads the seed of the image that is running:
 *
 *   fly ssh console -a chivago -u node -C "node --experimental-strip-types apps/api/src/seed-area.ts --area rmutt"
 */

import { parseArgs } from 'node:util';
import {
  AREAS, SAFETY_PHRASES, SEED_PLACES, SEED_QUESTS, areaByKey, inArea, isAreaKey,
  type AreaKey,
} from '@chivago/core';
import { openDb, transact, type DB } from './db-node.ts';
import { generateApiKey, hashApiKey } from './host-auth.ts';

/*
  `seedArea` MOVED to `area-opening.ts` on 13 November 2026 and is re-exported
  here so every existing caller and test keeps working.

  The reason it had to move: this file imports `openDb` from `db-node.ts` for
  its CLI, `db-node.ts` imports `node:sqlite`, and `node:sqlite` does not exist
  on Workers. `POST /internal/open-area` needs the same logic, and a route that
  reached in here would have broken the Worker build. The CLI, `reseedRefusal`
  and the photo/station refreshers stay - they are Node-side tools.
*/
import { refreshPhotos, seedArea } from './area-opening.ts';

export { openArea, refreshPhotos, retireSupersededQuests, seedArea } from './area-opening.ts';
export type { OpenAreaResult, RetireResult, SeedAreaResult } from './area-opening.ts';

/**
 * Bring an area's air stations in line with the seed (`--stations`).
 *
 * Which Air4Thai station speaks for a place is read off the national feed
 * and written in the seed, like a photograph's credit, so for `air_station`
 * the seed is the source of truth. Bangkhen went live with no station and
 * was given one afterwards; the insert-only run cannot carry that across.
 *
 * The card's own words about air move with it, and only those words: a
 * meta line that still ends "Air modelled, not measured" is replaced by the
 * seed's line once the place carries a station. A meta line somebody edited
 * in production does not end that way and is left alone.
 *
 * Returns the ids of the places whose station changed.
 */
export function refreshStations(db: DB, key: AreaKey): string[] {
  if (!isAreaKey(key)) throw new Error(`area must be one of ${AREAS.map((a) => a.key).join(', ')}`);
  const area = areaByKey(key);
  return transact(db, () => {
    const changed: string[] = [];
    for (const p of SEED_PLACES.filter((x) => x.province === area.province)) {
      const station = p.airStation ? JSON.stringify(p.airStation) : null;
      const set = db.prepare('UPDATE places SET air_station = ? WHERE id = ? AND air_station IS NOT ?')
        .run(station, p.id, station);
      if (Number(set.changes ?? 0) > 0) changed.push(p.id);
      if (station) {
        db.prepare("UPDATE places SET meta = ? WHERE id = ? AND meta LIKE '%Air modelled, not measured'")
          .run(p.meta, p.id);
      }
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
  const { values } = parseArgs({ options: { area: { type: 'string' }, photos: { type: 'boolean' }, stations: { type: 'boolean' } } });
  if (!isAreaKey(values.area)) {
    console.error(`usage: seed-area.ts --area <${AREAS.map((a) => a.key).join('|')}> [--photos] [--stations]`);
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
  const stations = values.stations ? refreshStations(db, values.area) : [];
  if (photos.length) console.log(`[chivago] photographs brought in line with the seed: ${photos.join(', ')}.`);
  if (stations.length) console.log(`[chivago] air stations brought in line with the seed: ${stations.join(', ')}.`);
  console.log(photos.length || stations.length
    ? '[chivago] Nothing else that existed was changed.'
    : '[chivago] Nothing that existed was changed.');
  for (const [name, key] of r.keys) {
    console.log(`[chivago] Console access key for ${name} - shown ONCE, hand it over in person:`);
    console.log(`          ${key}`);
  }
}
