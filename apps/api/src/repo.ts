/**
 * Read models. Turns database rows into the shapes @chivago/core declares.
 *
 * Kept separate from the services so the write paths (points, quest stages)
 * stay small and auditable, and the read paths can be optimised freely.
 */

import type {
  CommunityMetric,
  ImpactStat,
  Offer,
  Place,
  PlacePhoto,
  Quest,
  ScoredPlace,
  ShieldService,
  WellnessProfile,
} from '@chivago/core';
import { ACTIVE_QUEST_CODES, computeHealthyScore, EMPTY_PROFILE, isBookingLink, RETIRED_CODE_PREFIX } from '@chivago/core';
import type { AirStation } from '@chivago/core';
import { row, rows, type DB } from './db.ts';
import { awardStands } from './ledger-sql.ts';
import { getAir } from './air.ts';
import { checkinsLastHour } from './crowd-service.ts';
import { summariesFor } from './place-review-service.ts';
import { communityTreesPlanted, treeImpactForUser } from './tree-impact-service.ts';

interface PlaceRow {
  id: string; name_en: string; name_th: string; short: string; layer: string;
  lat: number; lng: number; meta: string; blurb_en: string; blurb_th: string;
  province: string | null;
  tags: string; photo_url: string | null;
  photo_credit: string | null; photo_licence: string | null; photo_source: string | null;
  photo_kind: string | null; photo_backdrop: string | null;
  safety_label_en: string; safety_label_th: string;
  crowd_density: number; aqi: number; safety_index: number; walkability: number;
  air_station: string | null;
  booking_url: string | null;
}

/*
  What the two newest photograph columns are allowed to say (#169).

  Every other column in this row was written by the seed. These two can also
  have been typed by hand - the project edits place rows on production with
  SQL, and the whole point of the columns is that somebody can mark a picture
  as a logo without a deploy. So they are checked here, at the boundary,
  rather than trusted because they came from our own database.

  An unreadable value is DROPPED, never passed on and never guessed at. The
  screen's defaults are the safe ones: no `kind` means it is treated as a
  photograph, and no `backdrop` means the frame stays the neutral grey. A
  wrong `kind` would credit a business's logo to a photographer who does not
  exist; a wrong `backdrop` would paint the frame whatever the string
  happened to be.
*/
const PHOTO_KINDS = ['photo', 'logo'] as const;
const photoKind = (value: string | null): PlacePhoto['kind'] =>
  ((PHOTO_KINDS as readonly string[]).includes(value ?? '') ? value as PlacePhoto['kind'] : undefined);

/*
  Six digits, because that is what the type says the seed writes (`#rrggbb`)
  and what every value in it is. Three-digit hex is valid CSS and is still
  refused: accepting a shorthand nobody writes would widen what this column
  may contain for no reader that needs it, and the cost of refusing is the
  neutral grey rather than a wrong colour.
*/
const HEX6 = /^#[0-9a-fA-F]{6}$/;
const photoBackdrop = (value: string | null): string | undefined =>
  (value !== null && HEX6.test(value) ? value : undefined);

const toPlace = (r: PlaceRow): Place & { safetyLabel: { en: string; th: string } } => ({
  id: r.id,
  name: { en: r.name_en, th: r.name_th },
  short: r.short,
  layer: r.layer as Place['layer'],
  // Null only for a row written before the column existed. Surat Thani is the
  // pilot, so it is the honest fallback rather than an empty string.
  province: r.province ?? 'TH-84',
  lat: r.lat,
  lng: r.lng,
  meta: r.meta,
  blurb: { en: r.blurb_en, th: r.blurb_th },
  tags: JSON.parse(r.tags) as string[],
  // A photograph is only usable with its credit, so the whole record is
  // present or the whole record is null. Half of one is not shippable.
  photo: r.photo_url && r.photo_credit
    ? {
      url: r.photo_url,
      credit: r.photo_credit,
      licence: r.photo_licence ?? 'Unknown',
      sourceUrl: r.photo_source,
      kind: photoKind(r.photo_kind),
      backdrop: photoBackdrop(r.photo_backdrop),
    }
    : null,
  metrics: {
    crowdDensity: r.crowd_density,
    aqi: r.aqi,
    safetyIndex: r.safety_index,
    walkability: r.walkability,
  },
  airStation: r.air_station ? (JSON.parse(r.air_station) as AirStation) : null,
  // A row edited by hand must not hand a phone a link it should not open.
  bookingUrl: isBookingLink(r.booking_url) ? r.booking_url : null,
  safetyLabel: { en: r.safety_label_en, th: r.safety_label_th },
});

interface ProfileRow {
  purposes: string;
  activity: string | null;
  watch: string;
  completed_at: string | null;
}

export function getProfile(db: DB, userId: string): WellnessProfile {
  const r = row<ProfileRow>(
    db
      .prepare('SELECT purposes, activity, watch, completed_at FROM profiles WHERE user_id = ?')
      .get(userId),
  );
  if (!r) return EMPTY_PROFILE;
  return {
    purposes: JSON.parse(r.purposes) as WellnessProfile['purposes'],
    activity: r.activity as WellnessProfile['activity'],
    watch: JSON.parse(r.watch) as WellnessProfile['watch'],
    completedAt: r.completed_at,
  };
}

export interface Bbox {
  minLat: number; maxLat: number; minLng: number; maxLng: number;
}

/**
 * Places with LIVE scores.
 *
 * The AQI stored on the row is only a fallback: each place's air is refreshed
 * from the per-coordinate feed, and the score is then computed against the
 * caller's own profile weighting. Two users can see different numbers for the
 * same place - that is the point of a personalised wellness score - and the
 * breakdown returned alongside says exactly why.
 */
export async function listScoredPlaces(
  db: DB,
  userId: string,
  bbox?: Bbox,
): Promise<ScoredPlace[]> {
  const placeRows = bbox
    ? rows<PlaceRow>(
        db
          .prepare('SELECT * FROM places WHERE admin_hidden_at IS NULL AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?')
          .all(bbox.minLat, bbox.maxLat, bbox.minLng, bbox.maxLng),
      )
    : rows<PlaceRow>(db.prepare('SELECT * FROM places WHERE admin_hidden_at IS NULL').all());

  const profile = getProfile(db, userId);
  // One grouped query for every place on screen. A per-place lookup would
  // turn a map pan into one round trip per pin.
  const reviews = summariesFor(db, placeRows.map((r) => r.id));
  // And one for who is there now, from the ledger.
  const crowds = checkinsLastHour(db, placeRows.map((r) => r.id));

  // Air lookups run concurrently; the cache keeps this to one upstream call per
  // ~1.1 km grid cell, so a full island read is a couple of requests at most.
  return Promise.all(
    placeRows.map(async (r) => {
      const place = toPlace(r);
      const air = await getAir(db, place.lat, place.lng, place.metrics.aqi, undefined, place.airStation);
      const metrics = { ...place.metrics, aqi: air.aqi };
      const breakdown = computeHealthyScore(metrics, {
        profile,
        // The crowd figure is the seed's survey estimate. It was scored as
        // 'live' - the default - for the whole life of this file, which was
        // a lie the score told about itself. Labelled, the score discounts
        // it, and the live count sits beside it as its own fact.
        provenance: { aqi: air.provenance, crowdDensity: 'estimated' },
        safetyPhrase: place.safetyLabel.en,
      });
      return {
        ...place,
        metrics,
        readings: {
          aqi: {
            value: air.aqi,
            provenance: air.provenance,
            observedAt: air.observedAt,
            source: air.source,
          },
          crowdDensity: {
            value: metrics.crowdDensity,
            provenance: 'estimated',
            observedAt: new Date().toISOString(),
            source: 'Seeded survey estimate - no live density feed',
          },
        },
        crowd: crowds.get(place.id)!,
        healthyScore: breakdown.total,
        breakdown,
        reviews: reviews.get(place.id)!,
      } as ScoredPlace;
    }),
  );
}

export async function getScoredPlace(
  db: DB,
  userId: string,
  placeId: string,
): Promise<ScoredPlace | null> {
  const found = row<PlaceRow>(db.prepare('SELECT * FROM places WHERE id = ? AND admin_hidden_at IS NULL').get(placeId));
  if (!found) return null;
  const all = await listScoredPlaces(db, userId);
  return all.find((p) => p.id === placeId) ?? null;
}

interface QuestRow {
  id: string; code: string; name_en: string; name_th: string;
  where_label: string; where_label_th: string | null;
  duration: string; duration_th: string | null; reward_points: number; reward_exp: number | null; reward_currency: string; kind: string;
  lat: number; lng: number;
  geofence_radius_m: number; host_id: string; host_name: string; host_type: string;
}

const toQuest = (r: QuestRow): Quest => ({
  id: r.id,
  code: r.code,
  name: { en: r.name_en, th: r.name_th },
  where: { en: r.where_label, th: r.where_label_th ?? r.where_label },
  duration: { en: r.duration, th: r.duration_th ?? r.duration },
  rewardPoints: r.reward_points,
  rewardExp: r.reward_exp ?? undefined,
  rewardCurrency: r.reward_currency as Quest['rewardCurrency'],
  host: { id: r.host_id, name: r.host_name, type: r.host_type as Quest['host']['type'] },
  kind: r.kind as Quest['kind'],
  lat: r.lat,
  lng: r.lng,
  geofenceRadiusM: r.geofence_radius_m,
});

const QUEST_SELECT = `
  SELECT q.id, q.code, q.name_en, q.name_th, q.where_label, q.where_label_th, q.duration, q.duration_th, q.reward_points,
         q.reward_exp, q.reward_currency,
         q.kind, q.lat, q.lng, q.geofence_radius_m,
         h.id AS host_id, h.name AS host_name, h.type AS host_type
  FROM quests q JOIN hosts h ON h.id = q.host_id`;

/**
 * Which quests the app publishes.
 *
 * THE RULE the pilot wants: only the five verified Ko Sichang field-trial
 * quests, so a stale database cannot put a retired quest back on a traveller's
 * screen. `ACTIVE_QUEST_CODES` in the seed is where that list lives.
 *
 * THE HOLE THAT RULE HAD, found on 14 November 2026. Written as a bare
 * allow-list, it hides everything it was not told about - and the live
 * database holds quests this repository's seed has never listed, Samui and the
 * campuses among them. Worse, the five SG rows are not in the live database
 * yet: content reaches a Durable Object only when an operator runs
 * `POST /internal/open-area`. Asked against production, the allow-list alone
 * published **0 of 16 quests**, a week before the finals.
 *
 * So the rule stands and gains one clause: IT MAY NOT PUBLISH NOTHING. When
 * this database has none of the active set in it, the replacements have not
 * arrived, and what is on the island is still the island's. Those are
 * published instead - minus anything explicitly retired, which
 * `retireSupersededQuests` marks in the code itself when it hands a code over.
 *
 * The fallback heals by itself: the moment the active set lands, the first
 * clause takes over again, in the same transaction that retired what it
 * replaced. Nobody has to remember to turn anything off.
 */
const ACTIVE_QUEST_WHERE = `q.code IN (${ACTIVE_QUEST_CODES.map((c) => `'${c}'`).join(',')})`;
const NOT_RETIRED_WHERE = `q.code NOT LIKE '${RETIRED_CODE_PREFIX}%'`;

/**
 * The clause to publish by, decided per call against this database.
 *
 * One `LIMIT 1` on a UNIQUE column, which is the cheapest question SQLite can
 * be asked, and the alternative is an app that shows an empty list and gives
 * nobody a reason why.
 */
function publishedWhere(db: DB): string {
  const hasActive = db.prepare(`SELECT 1 FROM quests q WHERE ${ACTIVE_QUEST_WHERE} LIMIT 1`).get();
  return hasActive ? ACTIVE_QUEST_WHERE : NOT_RETIRED_WHERE;
}

export function listQuests(db: DB, filter?: 'today' | 'weekend'): Quest[] {
  const where = publishedWhere(db);
  const questRows = filter
    ? rows<QuestRow>(
        db.prepare(`${QUEST_SELECT} WHERE ${where} AND q.kind = ? ORDER BY q.reward_points DESC`).all(filter),
      )
    : rows<QuestRow>(db.prepare(`${QUEST_SELECT} WHERE ${where} ORDER BY q.reward_points DESC`).all());
  return questRows.map(toQuest);
}

export function getQuest(db: DB, questId: string): Quest | null {
  const found = row<QuestRow>(
    db.prepare(`${QUEST_SELECT} WHERE q.id = ? AND ${publishedWhere(db)}`).get(questId),
  );
  return found ? toQuest(found) : null;
}

interface OfferRow {
  id: string; category: string; name: string; merchant: string; merchant_short: string;
  cost_points: number; value_thb: number | null; currency: string;
  image_url: string | null; available: number; example?: number;
}

export function listOffers(db: DB): Offer[] {
  const offerRows = rows<OfferRow>(
    db.prepare('SELECT * FROM offers ORDER BY cost_points ASC').all(),
  );
  return offerRows.map((r) => ({
    id: r.id,
    category: r.category,
    name: r.name,
    merchant: r.merchant,
    merchantShort: r.merchant_short,
    costPoints: r.cost_points,
    valueTHB: r.value_thb ?? null,
    currency: r.currency as Offer['currency'],
    imageUrl: r.image_url,
    available: r.available === 1,
    ...(r.example === 1 ? { example: true } : {}),
  }));
}

export function getOffer(db: DB, offerId: string): Offer | null {
  return listOffers(db).find((o) => o.id === offerId) ?? null;
}

/**
 * Personal impact, summed from VERIFIED quests only.
 *
 * The prototype hard-codes 11.4 kg / 34 / 9.5 hr / 6. Deriving them means the
 * number on the impact screen and the number in the ESG report come from the
 * same rows - which is the whole claim the screen is making.
 */
export function getPersonalImpact(db: DB, userId: string): ImpactStat[] {
  const totals = row<{ waste_kg: number; quests_verified: number }>(
    db
      .prepare(
        `SELECT
           COALESCE(SUM(p.weight_kg), 0)   AS waste_kg,
           COUNT(DISTINCT qp.quest_id)     AS quests_verified
         FROM quest_progress qp
         LEFT JOIN proofs p
           ON p.quest_id = qp.quest_id AND p.user_id = qp.user_id AND p.approved = 1
         WHERE qp.user_id = ? AND qp.stage = 'complete'`,
      )
      .get(userId),
  ) ?? { waste_kg: 0, quests_verified: 0 };

  // Volunteer hours still come from quest metadata in the pilot. A planted
  // tree cannot be inferred from a quest code; it needs partner evidence.
  const detail = rows<{ duration: string }>(
    db
      .prepare(
          `SELECT q.duration FROM quest_progress qp
         JOIN quests q ON q.id = qp.quest_id
         WHERE qp.user_id = ? AND qp.stage = 'complete'`,
      )
      .all(userId),
  );

  const hours = detail.reduce((acc, q) => acc + parseDurationHours(q.duration), 0);
  const treesPlanted = treeImpactForUser(db, userId).planted;

  return [
    { key: 'wasteCollected', label: { en: 'Waste collected', th: 'ขยะที่เก็บได้', zh: '收集的垃圾' }, value: round1(totals.waste_kg), unit: 'kg' },
    { key: 'treesPlanted', label: { en: 'Trees planted', th: 'ต้นไม้ที่ปลูก', zh: '种下的树' }, value: treesPlanted, unit: '' },
    { key: 'volunteerTime', label: { en: 'Volunteer time', th: 'เวลาอาสาสมัคร', zh: '志愿服务时长' }, value: round1(hours), unit: 'hr' },
    { key: 'questsVerified', label: { en: 'Quests verified', th: 'ภารกิจที่ผ่านการตรวจ', zh: '已核实的任务' }, value: totals.quests_verified, unit: '' },
  ];
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * "45 min" / "2 hr" / "90 min" / "Daily" -> hours.
 *
 * Reads the ENGLISH duration, always, and the query above selects that column
 * by name rather than whatever the reader's language is. This number becomes
 * volunteer hours in an ESG report; a Thai numeral or unit would parse as zero
 * and quietly shrink a figure somebody signs.
 */
function parseDurationHours(duration: string): number {
  const min = /(\d+(?:\.\d+)?)\s*min/i.exec(duration);
  if (min) return Number(min[1]) / 60;
  const hr = /(\d+(?:\.\d+)?)\s*hr/i.exec(duration);
  if (hr) return Number(hr[1]);
  return 0;
}

/**
 * A person the app itself signed up. Every real account is created as `u_…`
 * (account-service.ts, user-account-service.ts); the demo scripts insert fixed
 * ids such as `demo-user` and `showcase-demo`, whose seeded approvals are not
 * work anybody did and must not reach a community total.
 */
const signedUp = (alias: string): string => `${alias}.user_id LIKE 'u\\_%' ESCAPE '\\'`;

/**
 * The year's community actuals, counted from approvals that stand.
 *
 * The same rows the ESG report reads: a host approved the submission
 * (`verified_at`, which also dates it), and its award was not taken back
 * (`awardStands`). Kilograms are the approved proofs' own weights, hours the
 * quest's stated duration - the rule `getPersonalImpact` uses - and an
 * activity is one approved completion.
 */
function communityActuals(db: DB, year: number): Record<string, number> {
  const done = rows<{ user_id: string; duration: string; kg: number }>(
    db.prepare(
      `SELECT qp.user_id AS user_id, q.duration AS duration,
              (SELECT COALESCE(SUM(p.weight_kg), 0) FROM proofs p
                WHERE p.quest_id = qp.quest_id AND p.user_id = qp.user_id AND p.approved = 1) AS kg
         FROM quest_progress qp
         JOIN quests q ON q.id = qp.quest_id
        WHERE qp.verified_at IS NOT NULL
          AND qp.verified_at >= ? AND qp.verified_at < ?
          AND ${awardStands('qp')}
          AND ${signedUp('qp')}`,
    ).all(`${year}-01-01T00:00:00.000Z`, `${year + 1}-01-01T00:00:00.000Z`),
  );
  return {
    wasteCollected: round1(done.reduce((n, d) => n + d.kg, 0)),
    volunteerHours: round1(done.reduce((n, d) => n + parseDurationHours(d.duration), 0)),
    participants: new Set(done.map((d) => d.user_id)).size,
    activities: done.length,
    // Trees need partner evidence; a quest code cannot plant one.
    treesPlanted: communityTreesPlanted(db, year),
  };
}

/**
 * Community totals with their targets. The UI computes actual/target itself.
 *
 * ONLY THE TARGET AND THE LABEL COME FROM `community_metrics`. Its `actual`
 * column held the design's placeholders (2,500 kg, 1,200 hours, 500 people,
 * 20 activities) and the app showed them as achievements. Every actual is now
 * counted, and a metric nothing counts reads zero rather than a stored guess.
 */
export function getCommunityImpact(db: DB, year: number): CommunityMetric[] {
  const metrics = db
    .prepare('SELECT key, label_en, label_th, target, unit FROM community_metrics WHERE year = ?')
    .all(year) as
    { key: string; label_en: string; label_th: string; target: number; unit: string }[];
  if (metrics.length === 0) return [];
  const actual = communityActuals(db, year);
  return metrics.map((r) => ({
    key: r.key,
    label: { en: r.label_en, th: r.label_th },
    actual: actual[r.key] ?? 0,
    target: r.target,
    unit: r.unit,
  }));
}

/**
 * Safety Shield status.
 *
 * Static for the pilot, but shaped as a read model so the live services
 * (tracking session, verified-merchant count, nearest hospital distance) can be
 * wired in one at a time without changing the client.
 */
export function getShield(db: DB, userId: string): ShieldService[] {
  // COUNTED, like the SOS panel. The first version said "Shared with 2 family
  // contacts" for everybody, including a traveller who had added none - the
  // exact placeholder the dispatch panel was stripped of, surviving one screen
  // over. Tracking is 'ready' with contacts and 'off' without, because it
  // only ever runs during an alert and "on" would claim otherwise.
  const contacts = (db.prepare('SELECT COUNT(*) AS n FROM emergency_contacts WHERE user_id = ?')
    .get(userId) as { n: number }).n;
  const verifiedMerchants = db.prepare('SELECT COUNT(*) AS n FROM offers WHERE available = 1 AND COALESCE(example, 0) = 0').get() as { n: number };
  return [
    {
      key: 'tracking',
      label: { en: 'Live Tracking', th: 'ติดตามตำแหน่งสด', zh: '实时位置追踪' },
      note: contacts > 0
        ? { en: `Shared with ${contacts} ${contacts === 1 ? 'contact' : 'contacts'} during an SOS`, th: `แชร์กับผู้ติดต่อ ${contacts} คนเมื่อกด SOS`, zh: `触发 SOS 时与 ${contacts} 位联系人共享` }
        : { en: 'Add an emergency contact to share your position', th: 'เพิ่มผู้ติดต่อฉุกเฉินเพื่อแชร์ตำแหน่ง', zh: '添加紧急联系人以共享你的位置' },
      state: contacts > 0 ? 'ready' : 'off',
    },
    { key: 'safePath', label: { en: 'Safe Path', th: 'เส้นทางปลอดภัย', zh: '安全路线' }, note: { en: 'Night routing avoids 3 unlit stretches', th: 'เส้นทางกลางคืนเลี่ยงช่วงไม่มีไฟ 3 จุด', zh: '夜间路线会避开 3 段无照明路段' }, state: 'on' },
    { key: 'antiScam', label: { en: 'Anti-Scam', th: 'ป้องกันการหลอกลวง', zh: '防诈骗' }, note: { en: `${verifiedMerchants.n} QR merchants verified this trip`, th: `ตรวจสอบร้านค้า QR แล้ว ${verifiedMerchants.n} ร้านในทริปนี้`, zh: `本次行程已验证 ${verifiedMerchants.n} 家 QR 商家` }, state: 'on' },
    // No invented distance. The hospital is named; how far it is depends on
    // where the traveller is, which this read model does not know.
    { key: 'emergency', label: { en: 'Emergency Assistance', th: 'ความช่วยเหลือฉุกเฉิน', zh: '紧急援助' }, note: { en: '1669 · Koh Sichang Hospital', th: '1669 · โรงพยาบาลเกาะสีชัง', zh: '1669 · 锡昌岛医院' }, state: 'ready' },
    { key: 'language', label: { en: 'Language Help', th: 'ช่วยเหลือด้านภาษา', zh: '语言帮助' }, note: { en: 'Thai↔English interpreter on call', th: 'ล่ามไทย-อังกฤษพร้อมให้บริการ', zh: '泰语↔英语口译随时待命' }, state: 'ready' },
  ];
}
