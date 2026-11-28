/**
 * What the drift model predicted, against what was actually carried off the
 * beach.
 *
 * THE FILE SAYS `calibrated: false`, AND NOTHING IN THIS REPOSITORY HAD EVER
 * TRIED TO CHANGE THAT. The particle run names the shorelines the current
 * pushes floating things toward; the cleanup quests collect rubbish and weigh
 * it, and `proofs.weight_kg` is the only number in the system that came off a
 * scale rather than out of a model. Until this file the two had never met:
 * there was no query anywhere that put a predicted contact count beside a
 * measured kilo.
 *
 * That join is the one thing here that a satellite operator does not have.
 * Imagery and a current model can say where debris ought to land. Only
 * somebody who walked the beach can say how much was there.
 *
 * WHAT THE ATTRIBUTION HONESTLY IS. A proof has no coordinates of its own - it
 * has a `quest_id`, and a quest has one pin and a geofence radius. So a kilo
 * is credited to the shoreline segment nearest that pin, which is an
 * approximation in two ways worth stating plainly rather than burying:
 *
 *   1. the pin is where the quest is, not where each piece was picked up, and
 *      a geofence is often wider than one of the 43 segments;
 *   2. a cleanup that walked two segments is credited entirely to one.
 *
 * That is good enough to rank shorelines and to ask whether the model points
 * anywhere useful. It is not good enough to publish a per-segment mass.
 * `attributionNote` exists so the page cannot forget to say so.
 */

import { rows, type DB } from './db.ts';

/** A published shoreline segment, as the drift sidecar carries it. */
export interface DriftSegment {
  id: number;
  count: number;
  firstHours: number | null;
  near: string | null;
  beach: string | null;
  path: [number, number][];
}

export interface DriftRun {
  model: string | null;
  issued: string | null;
  window: number;
  calibrated: false;
  seeding: string | null;
  source: string;
  segments: DriftSegment[];
}

/** A run with its geometry dropped: what a page needs to describe the run. */
export type DriftRunHeader = Omit<DriftRun, 'segments'>;

export interface SegmentComparison {
  id: number;
  /** The shoreline's own name, in Thai, as the sidecar publishes it. */
  name: string | null;
  /** Simulated shoreline contacts. NEVER a count of rubbish. */
  predicted: number;
  /** Approved, weighed proofs credited to this segment. */
  cleanups: number;
  /** Kilograms off a scale, summed over those proofs. */
  weightKg: number;
  /** How far the nearest quest pin sat, in metres, or null with no cleanups. */
  nearestMetres: number | null;
}

export interface CoastalCalibration {
  run: DriftRunHeader | null;
  /** True when the run has outlived its own window, so the ranking is history. */
  expired: boolean;
  from: string;
  to: string;
  segments: SegmentComparison[];
  totals: { predicted: number; cleanups: number; weightKg: number };
  /**
   * Weighed proofs no segment could claim: from a quest whose pin is further
   * from any shoreline than `MAX_ATTRIBUTION_M`, which on this island mostly
   * means not on it. Shown rather than dropped, because a silent discard is
   * how a total comes to disagree with its own rows.
   */
  unattributed: { cleanups: number; weightKg: number };
  /** Spearman rank correlation, or null when there is too little to rank. */
  agreement: { rho: number; segments: number } | null;
}

/**
 * How far a quest pin may sit from a shoreline segment and still be credited
 * to it.
 *
 * Ko Sichang is about six kilometres long and the published run cuts its coast
 * into 43 segments, so a segment is a few hundred metres. 800 m allows for a
 * pin dropped at a car park or a pier head rather than on the sand, and still
 * refuses a quest inland, which belongs to no shoreline at all.
 */
export const MAX_ATTRIBUTION_M = 800;

/** Fewer ranked shorelines than this and a correlation is a coin toss. */
export const MIN_SEGMENTS_FOR_AGREEMENT = 6;

export const attributionNote = {
  en: 'A kilogram is credited to the shoreline segment nearest its quest pin. The pin is '
    + 'where the quest is, not where each piece was picked up, so this ranks shorelines - '
    + 'it does not measure one.',
  th: 'น้ำหนักถูกนับให้ช่วงชายฝั่งที่ใกล้หมุดเควสที่สุด หมุดคือที่ตั้งเควส ไม่ใช่จุดที่เก็บแต่ละชิ้น '
    + 'ตัวเลขนี้จึงใช้จัดอันดับชายฝั่งได้ แต่ไม่ใช่การวัดน้ำหนักของชายฝั่งนั้น',
} as const;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Validate a sidecar before any of it reaches a figure on a page. */
export function parseDriftRun(value: unknown): DriftRun | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  /*
    `calibrated !== false` is deliberate, and matches the app's own parser: a
    file claiming to be calibrated is a file somebody has to look at by hand
    before a page starts calling it calibrated on their behalf.
  */
  if (row.calibrated !== false || !finite(row.window) || row.window <= 0) return null;
  if (typeof row.source !== 'string' || !Array.isArray(row.segments)) return null;

  const segments: DriftSegment[] = [];
  for (const raw of row.segments) {
    if (!raw || typeof raw !== 'object') return null;
    const seg = raw as Record<string, unknown>;
    if (!finite(seg.id) || !finite(seg.count) || seg.count < 0) return null;
    if (!Array.isArray(seg.path) || seg.path.length === 0) return null;
    const path: [number, number][] = [];
    for (const p of seg.path) {
      if (!Array.isArray(p) || p.length !== 2 || !finite(p[0]) || !finite(p[1])) return null;
      path.push([p[0], p[1]]);
    }
    segments.push({
      id: seg.id,
      count: seg.count,
      firstHours: finite(seg.firstHours) ? seg.firstHours : null,
      near: typeof seg.near === 'string' ? seg.near : null,
      beach: typeof seg.beach === 'string' ? seg.beach : null,
      path,
    });
  }

  return {
    model: typeof row.model === 'string' ? row.model : null,
    issued: typeof row.issued === 'string' ? row.issued : null,
    window: row.window,
    calibrated: false,
    seeding: typeof row.seeding === 'string' ? row.seeding : null,
    source: row.source,
    segments,
  };
}

/** The same freshness rule the app uses, so the two surfaces cannot disagree. */
export function runExpired(run: DriftRun | null, now: number = Date.now()): boolean {
  if (!run?.issued) return true;
  const issued = Date.parse(run.issued);
  if (!Number.isFinite(issued)) return true;
  return now < issued || now - issued > run.window * 3_600_000;
}

/** Metres between two coordinates, which at this scale needs no ellipsoid. */
function metresBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const earth = 6_371_000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const midLat = ((aLat + bLat) / 2) * (Math.PI / 180);
  const x = dLng * Math.cos(midLat);
  return Math.sqrt(dLat * dLat + x * x) * earth;
}

/**
 * Distance to the nearest point of the segment's own path, not to a centroid.
 *
 * A segment is a run of coastline, and some of these bend round a headland.
 * The centroid of such a path can sit in the water, or inland, further from
 * the beach than either end of it.
 */
function metresToSegment(segment: DriftSegment, lat: number, lng: number): number {
  let best = Infinity;
  for (const [pointLng, pointLat] of segment.path) {
    const metres = metresBetween(lat, lng, pointLat, pointLng);
    if (metres < best) best = metres;
  }
  return best;
}

interface WeighedProof {
  weight_kg: number;
  lat: number;
  lng: number;
}

/**
 * Every approved proof carrying a weight, with its quest's pin.
 *
 * `weight_kg IS NOT NULL` is the filter rather than a quest kind, because a
 * weight is what makes a proof evidence of a mass: whatever the quest was
 * called, somebody put the bag on a scale. `approved = 1` because an
 * unreviewed proof is a claim and a rejected one is a claim that failed, and
 * neither belongs in a figure a model is calibrated against.
 *
 * Dated by `reviewed_at` rather than `submitted_at`: the period on the page is
 * the period of evidence that counts, and a proof counts when it is approved.
 */
export function weighedProofs(db: DB, from: string, to: string): WeighedProof[] {
  return rows<WeighedProof>(
    db.prepare(
      'SELECT p.weight_kg AS weight_kg, q.lat AS lat, q.lng AS lng'
      + '  FROM proofs p'
      + '  JOIN quests q ON q.id = p.quest_id'
      + ' WHERE p.approved = 1'
      + '   AND p.weight_kg IS NOT NULL'
      + '   AND p.reviewed_at IS NOT NULL'
      + '   AND date(p.reviewed_at) >= date(?)'
      + '   AND date(p.reviewed_at) <= date(?)',
    ).all(from, to),
  ).filter((r) => finite(r.weight_kg) && r.weight_kg > 0 && finite(r.lat) && finite(r.lng));
}

/**
 * Spearman's rho between predicted contacts and measured weight.
 *
 * RANKS, NOT VALUES, on purpose. A contact count and a kilogram are not the
 * same kind of quantity and no straight line relates them, so a Pearson
 * coefficient here would be arithmetic dressed as a finding. What can be
 * asked honestly is the ordering: does the model put the heavy shorelines near
 * the top?
 *
 * Only segments with a measured weight take part. A segment nobody has cleaned
 * is an absence of evidence, not a zero, and counting it as a zero would let
 * the 21 shorelines the run never reached decide the coefficient.
 */
export function rankAgreement(
  pairs: readonly { predicted: number; weightKg: number }[],
): { rho: number; segments: number } | null {
  const used = pairs.filter((p) => p.weightKg > 0);
  if (used.length < MIN_SEGMENTS_FOR_AGREEMENT) return null;

  const ranked = (values: number[]): number[] => {
    const order = values.map((value, index) => ({ value, index }))
      .sort((a, b) => a.value - b.value);
    const out = new Array<number>(values.length);
    let i = 0;
    while (i < order.length) {
      let j = i;
      while (j + 1 < order.length && order[j + 1]!.value === order[i]!.value) j++;
      /*
        Ties share the mean of the ranks they span. Without this a plateau of
        equal weights - which is what a day of 1 kg bags looks like - would be
        ordered by array position, and the coefficient would be reading the
        order rows came out of SQLite.
      */
      const mean = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) out[order[k]!.index] = mean;
      i = j + 1;
    }
    return out;
  };

  const a = ranked(used.map((p) => p.predicted));
  const b = ranked(used.map((p) => p.weightKg));
  const mean = (xs: number[]): number => xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const meanA = mean(a);
  const meanB = mean(b);
  let product = 0;
  let squaredA = 0;
  let squaredB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]! - meanA;
    const y = b[i]! - meanB;
    product += x * y;
    squaredA += x * x;
    squaredB += y * y;
  }
  // One side with no spread at all - every prediction equal, say - has no
  // ordering to agree or disagree with.
  if (squaredA === 0 || squaredB === 0) return null;
  return {
    rho: Number((product / Math.sqrt(squaredA * squaredB)).toFixed(3)),
    segments: used.length,
  };
}

/** The join: predicted contacts beside measured kilograms, segment by segment. */
export function coastalCalibration(
  db: DB, run: DriftRun | null, from: string, to: string, now: number = Date.now(),
): CoastalCalibration {
  const proofs = weighedProofs(db, from, to);
  const segments: SegmentComparison[] = (run?.segments ?? []).map((segment) => ({
    id: segment.id,
    name: segment.near ?? segment.beach,
    predicted: segment.count,
    cleanups: 0,
    weightKg: 0,
    nearestMetres: null,
  }));
  const byId = new Map(segments.map((segment) => [segment.id, segment]));

  let unattributedCleanups = 0;
  let unattributedWeight = 0;

  for (const proof of proofs) {
    let best: { id: number; metres: number } | null = null;
    for (const segment of run?.segments ?? []) {
      const metres = metresToSegment(segment, proof.lat, proof.lng);
      if (!best || metres < best.metres) best = { id: segment.id, metres };
    }
    const target = best && best.metres <= MAX_ATTRIBUTION_M ? byId.get(best.id) : undefined;
    if (!best || !target) {
      unattributedCleanups += 1;
      unattributedWeight += proof.weight_kg;
      continue;
    }
    target.cleanups += 1;
    target.weightKg = Number((target.weightKg + proof.weight_kg).toFixed(3));
    target.nearestMetres = target.nearestMetres === null
      ? Math.round(best.metres)
      : Math.min(target.nearestMetres, Math.round(best.metres));
  }

  /*
    Heaviest first, because the question the page asks is whether the model
    pointed at the shorelines that turned out to matter. Ties fall back to the
    prediction and then to the id, so it is the same table on every reload.
  */
  const ordered = [...segments].sort(
    (a, b) => b.weightKg - a.weightKg || b.predicted - a.predicted || a.id - b.id,
  );

  const weighed = segments.reduce((sum, s) => sum + s.weightKg, 0) + unattributedWeight;

  return {
    run: run
      ? {
        model: run.model,
        issued: run.issued,
        window: run.window,
        calibrated: false,
        seeding: run.seeding,
        source: run.source,
      }
      : null,
    expired: runExpired(run, now),
    from,
    to,
    segments: ordered,
    totals: {
      predicted: segments.reduce((sum, s) => sum + s.predicted, 0),
      cleanups: segments.reduce((sum, s) => sum + s.cleanups, 0) + unattributedCleanups,
      weightKg: Number(weighed.toFixed(3)),
    },
    unattributed: {
      cleanups: unattributedCleanups,
      weightKg: Number(unattributedWeight.toFixed(3)),
    },
    agreement: rankAgreement(ordered),
  };
}
