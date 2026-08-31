/**
 * The position trail behind a live SOS alert.
 *
 * WHY A TRAIL AND NOT JUST A POINT
 * A single "last known position" tells a searcher where a phone stopped
 * transmitting. The trail tells them which way the person was heading, how
 * fast, and whether they had stopped before the signal went - the difference
 * between searching a road and searching a hillside.
 *
 * Points arrive from three places, and the difference matters:
 *  - foreground: the app is open. Frequent, accurate, trustworthy.
 *  - background: the phone is locked. Sparser, and only if the user granted
 *    background permission - see docs/09-background-location.md.
 *  - queued: recorded while offline and flushed later. Genuinely old, and must
 *    never be shown as current.
 */

import { randomUUID } from 'node:crypto';
import { row, rows, transact, type DB } from './db.ts';
import { distanceMetres } from './quest-service.ts';

export type PositionSource = 'foreground' | 'background' | 'queued';

export interface PositionFix {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  /** When the DEVICE recorded it. Not when we received it. */
  recordedAt: string;
  source?: PositionSource;
}

export interface TrailPoint extends PositionFix {
  source: PositionSource;
  receivedAt: string;
  /** Metres from the previous point. Null for the first. */
  movedM: number | null;
}

/**
 * A fix worse than this is not worth plotting: at 500 m accuracy the pin is a
 * neighbourhood, and drawing it as a point invites a searcher to trust it.
 * Stored anyway, so nothing is silently discarded, but never used to move the
 * displayed position.
 */
export const USABLE_ACCURACY_M = 500;

export const isUsable = (p: { accuracyM?: number | null }): boolean =>
  p.accuracyM == null || p.accuracyM <= USABLE_ACCURACY_M;

/**
 * Record fixes against a live alert.
 *
 * Accepts a BATCH, because the device may have been offline in a mangrove for
 * twenty minutes and is flushing a queue. Returns how many were new: the
 * UNIQUE (alert_id, recorded_at) makes a re-sent queue harmless.
 */
export function recordPositions(
  db: DB,
  alertId: string,
  fixes: PositionFix[],
  now = new Date(),
): { recorded: number; duplicates: number; latest: PositionFix | null } {
  if (fixes.length === 0) return { recorded: 0, duplicates: 0, latest: null };

  // Oldest first, so the trail reads in the order it happened whatever order
  // the client flushed it in.
  const ordered = [...fixes].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
  );

  let recorded = 0;
  let duplicates = 0;

  transact(db, () => {
    for (const fix of ordered) {
      try {
        db.prepare(
          `INSERT INTO sos_positions
             (id, alert_id, lat, lng, accuracy_m, source, recorded_at, received_at)
           VALUES (?,?,?,?,?,?,?,?)`,
        ).run(
          randomUUID(), alertId, fix.lat, fix.lng, fix.accuracyM ?? null,
          fix.source ?? 'foreground', fix.recordedAt, now.toISOString(),
        );
        recorded += 1;
      } catch {
        // A re-sent offline queue. Expected, not an error.
        duplicates += 1;
      }
    }

    // The alert carries the newest USABLE fix, so a wildly inaccurate late
    // point cannot drag the displayed position across the island.
    const best = [...ordered].reverse().find(isUsable);
    if (best) {
      const current = row<{ last_position_at: string | null }>(
        db.prepare('SELECT last_position_at FROM sos_alerts WHERE id = ?').get(alertId),
      );
      // Never move the pin backwards in time. A queued point from twenty
      // minutes ago must not overwrite a fresh one that arrived while it was
      // still in flight.
      const stale =
        current?.last_position_at != null &&
        new Date(best.recordedAt) <= new Date(current.last_position_at);
      if (!stale) {
        db.prepare(
          'UPDATE sos_alerts SET last_lat = ?, last_lng = ?, last_position_at = ? WHERE id = ?',
        ).run(best.lat, best.lng, best.recordedAt, alertId);
      }
    }
  });

  return { recorded, duplicates, latest: ordered[ordered.length - 1] ?? null };
}

/** The trail, oldest first, with per-leg distance. */
export function trail(db: DB, alertId: string, limit = 200): TrailPoint[] {
  const points = rows<{
    lat: number; lng: number; accuracy_m: number | null;
    source: string; recorded_at: string; received_at: string;
  }>(
    db
      .prepare(
        `SELECT lat, lng, accuracy_m, source, recorded_at, received_at
         FROM sos_positions WHERE alert_id = ?
         ORDER BY recorded_at ASC LIMIT ?`,
      )
      .all(alertId, limit),
  );

  // Distance is measured between USABLE fixes only, while every fix stays in
  // the trail. A 2 km-accuracy reading is real data worth keeping, but letting
  // it into the maths turned a 400 m walk into "20 km travelled" on the desk -
  // which would send a searcher to the wrong side of the island.
  let lastUsable: { lat: number; lng: number } | null = null;

  return points.map((p) => {
    const usable = p.accuracy_m == null || p.accuracy_m <= USABLE_ACCURACY_M;
    const movedM =
      usable && lastUsable ? Math.round(distanceMetres(lastUsable, p)) : null;
    if (usable) lastUsable = { lat: p.lat, lng: p.lng };

    return {
      lat: p.lat,
      lng: p.lng,
      accuracyM: p.accuracy_m,
      source: p.source as PositionSource,
      recordedAt: p.recorded_at,
      receivedAt: p.received_at,
      movedM,
    };
  });
}

export interface TrailSummary {
  points: number;
  /** Straight-line metres between the first and last fix. */
  netDisplacementM: number;
  /** Sum of every leg. Larger than displacement when they doubled back. */
  travelledM: number;
  /** Seconds since the most recent fix. Drives the "gone quiet" warning. */
  silentForSeconds: number | null;
  lastSource: PositionSource | null;
  movingAwayFromStart: boolean;
}

/**
 * What a searcher needs at a glance.
 *
 * `silentForSeconds` is the one that matters most. A trail that stops updating
 * means a dead battery, no signal, or a person who can no longer hold a phone -
 * and the desk must say so rather than showing a stale pin as though it were
 * live. A confident-looking dot is worse than an honest gap.
 */
export function summarise(db: DB, alertId: string, now = new Date()): TrailSummary {
  const points = trail(db, alertId);
  if (points.length === 0) {
    return {
      points: 0, netDisplacementM: 0, travelledM: 0,
      silentForSeconds: null, lastSource: null, movingAwayFromStart: false,
    };
  }

  // Displacement is measured between usable fixes too. Falling back to the full
  // set only when nothing is usable, so a trail of poor fixes still reports
  // something rather than silently reading as no movement.
  const usable = points.filter(isUsable);
  const measured = usable.length > 0 ? usable : points;
  const first = measured[0]!;
  const last = points[points.length - 1]!;
  const lastMeasured = measured[measured.length - 1]!;

  const travelled = points.reduce((acc, p) => acc + (p.movedM ?? 0), 0);
  const net = Math.round(distanceMetres(first, lastMeasured));

  // Clamped at zero. A device with a skewed clock can report a fix stamped in
  // the future, and "last fix -176s ago" is both nonsense on the desk and
  // would keep hasGoneQuiet() false forever.
  const silent = Math.max(
    0,
    Math.floor((now.getTime() - new Date(last.recordedAt).getTime()) / 1000),
  );

  return {
    points: points.length,
    netDisplacementM: net,
    travelledM: travelled,
    silentForSeconds: silent,
    lastSource: last.source,
    // 50 m clears ordinary GPS jitter from someone standing still.
    movingAwayFromStart: net > 50,
  };
}

/**
 * How long before a silent trail is worth flagging.
 *
 * Background updates are deliberately sparse to save battery, so a two-minute
 * gap is normal and a five-minute one is not.
 */
export const SILENCE_WARNING_SECONDS = 300;

export const hasGoneQuiet = (summary: TrailSummary): boolean =>
  summary.silentForSeconds !== null && summary.silentForSeconds > SILENCE_WARNING_SECONDS;
