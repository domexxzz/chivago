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
  type BalanceInput, type ChivaBalance, type MoodCheckin, type MoodKey,
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
