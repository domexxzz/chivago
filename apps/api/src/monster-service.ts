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
import { rows, type DB } from './db.ts';

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
function deedsByPlace(db: DB, since: string): Map<string, Deed[]> {
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
    db.prepare(
      `SELECT l.occurred_at, p.id AS place_id
         FROM ledger l
         JOIN quests q ON q.id = substr(l.source_ref, 7, instr(substr(l.source_ref, 7), ':user:') - 1)
         JOIN places p ON p.lat = q.lat AND p.lng = q.lng
        WHERE l.kind = 'quest_reward' AND l.currency = 'green' AND l.occurred_at >= ?`,
    ).all(since),
  )) {
    add(r.place_id, { kind: 'verifiedQuest', at: r.occurred_at });
  }

  // Legs on foot: `walk:<from>:<to>:user:...`, and both ends count.
  for (const r of rows<{ occurred_at: string; source_ref: string }>(
    db.prepare("SELECT occurred_at, source_ref FROM ledger WHERE kind = 'walk' AND occurred_at >= ?").all(since),
  )) {
    const [, from, to] = r.source_ref.split(':');
    for (const id of [from, to]) if (id) add(id, { kind: 'walkedLeg', at: r.occurred_at });
  }

  return out;
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
