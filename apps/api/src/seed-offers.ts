/**
 * Bring the marketplace's seeded offers onto a database that already exists.
 *
 *   node --experimental-strip-types apps/api/src/seed-offers.ts
 *
 * INSERT-ONLY. An offer the database does not have is added; one it already
 * has is left exactly as it is, so a merchant's edit to a live offer is never
 * overwritten by the seed. That is the difference from seed-db.ts, which
 * re-asserts every row and so may only run on an empty volume.
 *
 * This used to be a loop inside `migrate()`, upserting every seeded offer on
 * every boot. A migration that writes content runs against every database the
 * code ever opens - including a test's empty one, where it collided with the
 * test's own rows - and it rewrote live offers each time the app started.
 */

import { SEED_OFFERS } from '@chivago/core';
import { openDb, type DB } from './db.ts';

export interface SeedOffersResult {
  added: string[];
  kept: number;
}

export function insertMissingOffers(db: DB): SeedOffersResult {
  const added: string[] = [];
  const insert = db.prepare(
    `INSERT INTO offers (id, category, name, merchant, merchant_short, cost_points,
       value_thb, currency, image_url, available, example)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO NOTHING`,
  );
  for (const o of SEED_OFFERS) {
    const r = insert.run(o.id, o.category, o.name, o.merchant, o.merchantShort, o.costPoints,
      o.valueTHB, o.currency, o.imageUrl, o.available ? 1 : 0, o.example ? 1 : 0);
    if (Number(r.changes ?? 0) > 0) added.push(o.id);
  }
  return { added, kept: SEED_OFFERS.length - added.length };
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/seed-offers.ts')) {
  const r = insertMissingOffers(openDb());
  console.log(
    `[chivago] offers added: ${r.added.length ? r.added.join(', ') : 'none'}; `
    + `${r.kept} already there and left as they were.`,
  );
}
