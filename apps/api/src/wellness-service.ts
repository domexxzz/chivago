/**
 * Wellness Engine, server side.
 *
 * Balance is computed here, not on the phone, for the same reason the trip
 * plan is: the inputs are the traveller's whole visit history and the air
 * that was actually measured at those places. A client would be scoring
 * whatever it last cached.
 */

import { randomUUID } from 'node:crypto';
import {
  chivaBalance, isMoodKey,
  type BalanceInput, type ChivaBalance, type HabitatEvidence, type ProvinceEvidence,
  type MoodCheckin, type MoodKey,
} from '@chivago/core';
import { rows, type DB } from './db.ts';

/** How far back Balance looks. A trip, not a lifetime. */
export const BALANCE_WINDOW_DAYS = 14;

export class UnknownMood extends Error {}

/** Record how someone says they feel. Never overwritten; the sequence is the point. */
export function recordMood(
  db: DB,
  userId: string,
  input: { mood: string; note?: string | null },
  now = new Date(),
): MoodCheckin {
  if (!isMoodKey(input.mood)) throw new UnknownMood(input.mood);
  const note = (input.note ?? '').trim().slice(0, 280) || null;
  const at = now.toISOString();
  db.prepare(
    'INSERT INTO mood_checkins (id, user_id, mood, note, at) VALUES (?,?,?,?,?)',
  ).run(randomUUID(), userId, input.mood, note, at);
  return { at, mood: input.mood as MoodKey, note };
}

export function moodHistory(db: DB, userId: string, limit = 30): MoodCheckin[] {
  return rows<{ mood: string; note: string | null; at: string }>(
    db.prepare('SELECT mood, note, at FROM mood_checkins WHERE user_id = ? ORDER BY at DESC LIMIT ?')
      .all(userId, limit),
  ).map((r) => ({ at: r.at, mood: r.mood as MoodKey, note: r.note }));
}

/** The most recent mood, or null if they have never said. */
export function latestMood(db: DB, userId: string): MoodCheckin | null {
  return moodHistory(db, userId, 1)[0] ?? null;
}

/**
 * Everything Balance is computed from, read straight out of what happened.
 *
 * Visits come from the LEDGER, not from a visits table: a check-in already
 * writes a ledger row, and a second record of the same fact is a second thing
 * that can disagree with the first.
 */
export function balanceInputFor(
  db: DB,
  userId: string,
  now = new Date(),
): BalanceInput {
  const since = new Date(now.getTime() - BALANCE_WINDOW_DAYS * 864e5).toISOString();

  const checkins = rows<{ source_ref: string; occurred_at: string }>(
    db.prepare(
      `SELECT source_ref, occurred_at FROM ledger
       WHERE user_id = ? AND kind = 'checkin' AND occurred_at >= ?
       ORDER BY occurred_at ASC`,
    ).all(userId, since),
  );

  // `checkin:<placeId>:<user>:<day>` - the place is the second segment.
  const placeIds = checkins.map((c) => c.source_ref.split(':')[1] ?? '');
  const places = placeIds.length === 0 ? [] : rows<{ id: string; layer: string; aqi: number; crowd_density: number }>(
    db.prepare(
      `SELECT id, layer, aqi, crowd_density FROM places WHERE id IN (${placeIds.map(() => '?').join(',')})`,
    ).all(...placeIds),
  );
  const byId = new Map(places.map((p) => [p.id, p]));

  const visits = checkins.flatMap((c, i) => {
    const place = byId.get(placeIds[i]!);
    return place
      ? [{ at: c.occurred_at, layer: place.layer, aqi: place.aqi, crowdDensity: place.crowd_density }]
      : [];
  });

  // One entry per island day that had any activity. Days with none are not
  // zero-walking days - they are days this app knows nothing about, and
  // averaging them in would invent a sedentary trip.
  const perDay = new Map<string, number>();
  for (const v of visits) {
    const day = v.at.slice(0, 10);
    perDay.set(day, (perDay.get(day) ?? 0) + ESTIMATED_KM_PER_STOP);
  }

  return { moods: moodHistory(db, userId), visits, walkedKmPerDay: [...perDay.values()] };
}

/**
 * Kilometres assumed walked per stop.
 *
 * A stand-in until the phone reports real distance: the app has background
 * location for SOS only, and turning it on to count steps would be a
 * disproportionate thing to do for a wellbeing number. Named and constant so
 * nobody mistakes it for a measurement.
 */
export const ESTIMATED_KM_PER_STOP = 1.4;

export function balanceFor(db: DB, userId: string, now = new Date()): ChivaBalance {
  return chivaBalance(balanceInputFor(db, userId, now));
}

/**
 * What somebody has done, per habitat, for the companion collection.
 *
 * Read from the LEDGER, like every other derived fact in this service. A
 * companions table would be a second record of things the ledger already
 * holds, and two records of one fact eventually disagree.
 *
 * `visitDays` counts DISTINCT island days: checking in twice at the same beach
 * in one afternoon is one day, so the collection rewards coming back rather
 * than loitering. `questsVerified` counts only quests a host approved, which
 * is the same standard Green Points are held to.
 *
 * The day is read from the source_ref, not recomputed from occurred_at. The
 * check-in's idempotency key already ends in the island date it was written
 * against; deriving a second day here - with a hardcoded +7, say - would be a
 * second definition of "day" that can disagree with the first.
 */
/**
 * Provinces this traveller has actually set foot in.
 *
 * Read from the ledger through the place they checked in at, like every other
 * derived fact here. A passport keeping its own list of provinces would be a
 * second record of the same journey, and two records of one fact eventually
 * disagree — the mistake this codebase has now avoided the same way three
 * times: visits, companions, and now this.
 */
export function visitedProvincesFor(db: DB, userId: string): string[] {
  const found = rows<{ province: string }>(
    db.prepare(
      `SELECT DISTINCT p.province AS province
       FROM ledger l
       JOIN places p ON p.id = substr(l.source_ref, 9, instr(substr(l.source_ref, 9), ':') - 1)
       WHERE l.user_id = ? AND l.kind = 'checkin' AND p.province IS NOT NULL`,
    ).all(userId),
  );
  return found.map((r) => r.province);
}

/**
 * The same evidence, split by PROVINCE as well as habitat.
 *
 * One companion per province needs to know not just what somebody did but
 * where in the country they did it, so this is `habitatEvidenceFor` with one
 * more column in the GROUP BY. It is deliberately not a second source of
 * truth: both read the same ledger rows through the same source_ref, so the
 * island totals and the per-province totals cannot disagree.
 *
 * Only provinces with evidence come back. The other seventy-something are
 * supplied by `provinceCompanions` in core, which owns the full list of 77 —
 * sending 77 mostly-empty rows over a beach connection to say "nothing here"
 * would be paying for the app's own static data on every request.
 */
export function provinceEvidenceFor(db: DB, userId: string): ProvinceEvidence[] {
  const checkins = rows<{ code: string; layer: string; days: number }>(
    db.prepare(
      `SELECT p.province AS code, p.layer AS layer,
              COUNT(DISTINCT substr(l.source_ref, -10)) AS days
       FROM ledger l
       JOIN places p ON p.id = substr(l.source_ref, 9, instr(substr(l.source_ref, 9), ':') - 1)
       WHERE l.user_id = ? AND l.kind = 'checkin' AND p.province IS NOT NULL
       GROUP BY p.province, p.layer`,
    ).all(userId),
  );

  const quests = rows<{ code: string; layer: string; verified: number }>(
    db.prepare(
      `SELECT p.province AS code, p.layer AS layer, COUNT(DISTINCT q.id) AS verified
       FROM ledger l
       JOIN quests q ON q.id = substr(l.source_ref, 7, instr(substr(l.source_ref, 7), ':') - 1)
       JOIN places p ON p.lat = q.lat AND p.lng = q.lng
       WHERE l.user_id = ? AND l.kind = 'quest_reward' AND p.province IS NOT NULL
       GROUP BY p.province, p.layer`,
    ).all(userId),
  );

  const byKey = new Map<string, ProvinceEvidence>();
  const at = (code: string, layer: string) => {
    const key = `${code}|${layer}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        code, layer: layer as ProvinceEvidence['layer'], visitDays: 0, questsVerified: 0,
      });
    }
    return byKey.get(key)!;
  };
  for (const r of checkins) at(r.code, r.layer).visitDays = r.days;
  for (const r of quests) at(r.code, r.layer).questsVerified = r.verified;
  return [...byKey.values()];
}

export function habitatEvidenceFor(db: DB, userId: string): HabitatEvidence[] {
  const checkins = rows<{ layer: string; days: number }>(
    db.prepare(
      `SELECT p.layer AS layer, COUNT(DISTINCT substr(l.source_ref, -10)) AS days
       FROM ledger l
       JOIN places p ON p.id = substr(l.source_ref, 9, instr(substr(l.source_ref, 9), ':') - 1)
       WHERE l.user_id = ? AND l.kind = 'checkin'
       GROUP BY p.layer`,
    ).all(userId),
  );

  const quests = rows<{ layer: string; verified: number }>(
    db.prepare(
      `SELECT p.layer AS layer, COUNT(DISTINCT q.id) AS verified
       FROM ledger l
       JOIN quests q ON q.id = substr(l.source_ref, 7, instr(substr(l.source_ref, 7), ':') - 1)
       JOIN places p ON p.lat = q.lat AND p.lng = q.lng
       WHERE l.user_id = ? AND l.kind = 'quest_reward'
       GROUP BY p.layer`,
    ).all(userId),
  );

  /*
    Legs walked, counted at BOTH ends.

    `walk:<from>:<to>:user:...` — walking away from a habitat is as much a
    choice not to ride as walking into one, which is the same reading the
    monster mechanic takes of the same rows.
  */
  const walks = rows<{ source_ref: string }>(
    db.prepare("SELECT source_ref FROM ledger WHERE user_id = ? AND kind = 'walk'").all(userId),
  );
  const layerOfPlace = new Map(
    rows<{ id: string; layer: string }>(db.prepare('SELECT id, layer FROM places').all())
      .map((r) => [r.id, r.layer]),
  );

  const byLayer = new Map<string, HabitatEvidence>();
  const at = (layer: string) => {
    if (!byLayer.has(layer)) {
      byLayer.set(layer, {
        layer: layer as HabitatEvidence['layer'], visitDays: 0, questsVerified: 0, walkedLegs: 0,
      });
    }
    return byLayer.get(layer)!;
  };
  for (const r of checkins) at(r.layer).visitDays = r.days;
  for (const r of quests) at(r.layer).questsVerified = r.verified;
  for (const w of walks) {
    const [, from, to] = w.source_ref.split(':');
    for (const id of new Set([from, to])) {
      const layer = id ? layerOfPlace.get(id) : undefined;
      if (layer) { const e = at(layer); e.walkedLegs = (e.walkedLegs ?? 0) + 1; }
    }
  }
  return [...byLayer.values()];
}
