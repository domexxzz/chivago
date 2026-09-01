/**
 * Load the Koh Samui pilot content into the database. Idempotent - safe to
 * re-run after a schema change or a content edit.
 */

import { openDb, rows } from './db.ts';
import { generateApiKey, hashApiKey } from './host-auth.ts';
import {
  RANKS, SEED_HOSTS, SEED_OFFERS, SEED_PLACES, SEED_QUESTS, SAFETY_PHRASES,
} from '@chivago/core';

const db = openDb();

/**
 * Hosts, each with a console access key.
 *
 * The key is shown ONCE, here, and only its hash is stored. A key that already
 * exists is left alone - re-seeding to update content must not silently lock a
 * municipality out of the console mid-pilot.
 */
const issued: [string, string][] = [];

for (const host of Object.values(SEED_HOSTS)) {
  // Only the platform host moderates reviews. A municipality, an NGO and a
  // hotel partner all have a stake in what is said about places near them,
  // and none of them should be able to take a rival's bad review down.
  // Granting this to a real operator is a deliberate UPDATE, not a default.
  const role = host.id === SEED_HOSTS.platform!.id ? 'moderator' : 'host';
  db.prepare(
    `INSERT INTO hosts (id, name, type, role, created_at) VALUES (?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type,
       role = excluded.role`,
  ).run(host.id, host.name, host.type, role, new Date().toISOString());

  const existing = db
    .prepare('SELECT api_key_hash FROM hosts WHERE id = ?')
    .get(host.id) as unknown as { api_key_hash: string | null } | undefined;

  if (!existing?.api_key_hash) {
    const key = generateApiKey();
    db.prepare('UPDATE hosts SET api_key_hash = ? WHERE id = ?').run(hashApiKey(key), host.id);
    issued.push([host.name, key]);
  }
}

for (const p of SEED_PLACES) {
  const safety = SAFETY_PHRASES[p.id]!;
  db.prepare(
    `INSERT INTO places (id, name_en, name_th, short, layer, province, lat, lng, meta,
       blurb_en, blurb_th, tags, photo_url, photo_credit, photo_licence, photo_source,
       safety_label_en, safety_label_th,
       crowd_density, aqi, safety_index, walkability)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       name_en=excluded.name_en, name_th=excluded.name_th, short=excluded.short,
       layer=excluded.layer, province=excluded.province, lat=excluded.lat, lng=excluded.lng, meta=excluded.meta,
       blurb_en=excluded.blurb_en, blurb_th=excluded.blurb_th, tags=excluded.tags,
       photo_url=excluded.photo_url, photo_credit=excluded.photo_credit,
       photo_licence=excluded.photo_licence, photo_source=excluded.photo_source,
       safety_label_en=excluded.safety_label_en, safety_label_th=excluded.safety_label_th,
       crowd_density=excluded.crowd_density, aqi=excluded.aqi,
       safety_index=excluded.safety_index, walkability=excluded.walkability`,
  ).run(
    p.id, p.name.en, p.name.th, p.short, p.layer, p.province, p.lat, p.lng, p.meta,
    p.blurb.en, p.blurb.th, JSON.stringify(p.tags),
    p.photo?.url ?? null, p.photo?.credit ?? null,
    p.photo?.licence ?? null, p.photo?.sourceUrl ?? null,
    safety.en, safety.th,
    p.metrics.crowdDensity, p.metrics.aqi, p.metrics.safetyIndex, p.metrics.walkability,
  );
}

for (const q of SEED_QUESTS) {
  db.prepare(
    `INSERT INTO quests (id, code, name_en, name_th, where_label, duration, reward_points,
       reward_currency, host_id, kind, lat, lng, geofence_radius_m, esg_pillar)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       code=excluded.code, name_en=excluded.name_en, name_th=excluded.name_th,
       where_label=excluded.where_label, duration=excluded.duration,
       reward_points=excluded.reward_points, reward_currency=excluded.reward_currency,
       host_id=excluded.host_id, kind=excluded.kind,
       lat=excluded.lat, lng=excluded.lng, geofence_radius_m=excluded.geofence_radius_m,
       esg_pillar=excluded.esg_pillar`,
  ).run(q.id, q.code, q.name.en, q.name.th, q.where, q.duration, q.rewardPoints,
        q.rewardCurrency, q.host.id, q.kind, q.lat, q.lng, q.geofenceRadiusM,
        q.esgPillar ?? null);
}

for (const o of SEED_OFFERS) {
  db.prepare(
    `INSERT INTO offers (id, category, name, merchant, merchant_short, cost_points,
       currency, image_url, available)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       category=excluded.category, name=excluded.name, merchant=excluded.merchant,
       merchant_short=excluded.merchant_short, cost_points=excluded.cost_points,
       currency=excluded.currency,
       available=excluded.available`,
  ).run(o.id, o.category, o.name, o.merchant, o.merchantShort, o.costPoints,
        o.currency, o.imageUrl, o.available ? 1 : 0);
}

/**
 * Community targets for the pilot year.
 *
 * PROVISIONAL. The design's bar percentages imply these targets, but handoff
 * open question 3 says the real numbers must come from the ESG owner. They live
 * in the database precisely so correcting them is an UPDATE, not a release.
 */
const YEAR = 2026;
const COMMUNITY: [string, string, string, number, number, string][] = [
  ['wasteCollected', 'Waste collected', 'ขยะที่เก็บได้', 2500, 3000, 'kg'],
  ['treesPlanted', 'Trees planted', 'ต้นไม้ที่ปลูก', 1000, 1500, ''],
  ['volunteerHours', 'Volunteer hours', 'ชั่วโมงอาสาสมัคร', 1200, 1620, 'hr'],
  ['participants', 'Participants', 'ผู้เข้าร่วม', 500, 1000, ''],
  ['activities', 'Community activities', 'กิจกรรมชุมชน', 20, 50, ''],
];

for (const [key, en, th, actual, target, unit] of COMMUNITY) {
  db.prepare(
    `INSERT INTO community_metrics (key, label_en, label_th, actual, target, unit, year)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(key) DO UPDATE SET
       label_en=excluded.label_en, label_th=excluded.label_th,
       actual=excluded.actual, target=excluded.target, unit=excluded.unit, year=excluded.year`,
  ).run(key, en, th, actual, target, unit, YEAR);
}

/**
 * Content removed from the seed is removed from the database.
 *
 * Without this the seed can only ever ADD. Renaming a place - which happened
 * when the fictional "Lamai Yoga Shala" became the real Lamai Beach - left the
 * old row behind forever, and the app served six places from a seed of five.
 * A ghost that only appears in the running system and never in the source is
 * the hardest kind of wrong to notice.
 *
 * `ON DELETE CASCADE` on place_reviews means a pruned place takes its reviews
 * with it, which is correct: they are reviews of somewhere that is no longer
 * in the pilot.
 *
 * Reported rather than silent. Deleting content is not a thing to do quietly.
 */
function prune(table: string, keep: string[]): void {
  const holes = keep.map(() => '?').join(',');
  const gone = rows<{ id: string }>(
    db.prepare(`SELECT id FROM ${table} WHERE id NOT IN (${holes})`).all(...keep),
  );
  if (gone.length === 0) return;
  db.prepare(`DELETE FROM ${table} WHERE id NOT IN (${holes})`).run(...keep);
  console.log(`[chivago] pruned ${gone.length} ${table} no longer in the seed: ${gone.map((g) => g.id).join(', ')}`);
}

prune('places', SEED_PLACES.map((p) => p.id));
prune('quests', SEED_QUESTS.map((q) => q.id));
prune('offers', SEED_OFFERS.map((o) => o.id));

const counts = {
  hosts: (db.prepare('SELECT COUNT(*) n FROM hosts').get() as { n: number }).n,
  places: (db.prepare('SELECT COUNT(*) n FROM places').get() as { n: number }).n,
  quests: (db.prepare('SELECT COUNT(*) n FROM quests').get() as { n: number }).n,
  offers: (db.prepare('SELECT COUNT(*) n FROM offers').get() as { n: number }).n,
  communityMetrics: (db.prepare('SELECT COUNT(*) n FROM community_metrics').get() as { n: number }).n,
};

console.log('[chivago] seeded', counts);

if (issued.length > 0) {
  console.log('');
  console.log('[chivago] Host console access keys — shown ONCE, store them now:');
  console.log('          http://localhost:8787/console/login');
  console.log('');
  for (const [name, key] of issued) {
    console.log(`          ${key}   ${name}`);
  }
  console.log('');
  console.log('          Only the hash is stored. To rotate a lost key, clear');
  console.log('          hosts.api_key_hash for that host and re-run the seed.');
  console.log('');
}
console.log('[chivago] ranks:', RANKS.map((r) => `${r.index} ${r.label.en} @L${r.fromLevel}`).join(' · '));
