/**
 * Healthy Score - the composite 0-100 figure that drives the whole map.
 *
 * WHY THIS FILE EXISTS
 * The design handoff lists this as open question 2: "Healthy Score formula and
 * weighting - undefined; blocks the score everywhere." The prototype simply
 * hard-codes 74 / 91 / 82 / 88 / 79. Nothing can ship on hard-coded numbers, so
 * this module defines the formula explicitly, in one place, with the
 * normalisation curves written down and unit-tested.
 *
 * DESIGN PRINCIPLES
 * 1. Explainable. Every score returns a breakdown naming each component, its
 *    normalised sub-score, and the weight applied. The UI renders that verbatim
 *    under "How is this calculated?". A black-box wellness score aimed at
 *    tourists is a trust and (potentially) a consumer-protection problem.
 * 2. Personalised weighting, fixed sub-scores. The user profile shifts WEIGHTS
 *    only. A place's air sub-score is the same number for everyone; what
 *    changes is how much air matters to you. This keeps places comparable and
 *    stops the score drifting into a recommendation engine.
 * 3. Bounded and monotone. Every normaliser is clamped to 0-100 and is
 *    monotone in the good direction, so the score can never be gamed by an
 *    out-of-range reading.
 * 4. Honest about staleness. A stale reading is downweighted, not silently
 *    treated as fresh.
 *
 * CALIBRATION NOTE
 * The breakpoints below were chosen to reproduce the five seed places in the
 * design within +/- 2 points, so the pilot demo matches the approved comps.
 * They are a starting calibration, NOT ground truth - the data owner must
 * confirm them against real Samui observations before public launch.
 */

import type {
  Bilingual,
  PlaceMetrics,
  Provenance,
  ScoreBreakdown,
  ScoreComponent,
  WellnessProfile,
} from './types.ts';

/** Clamp to a closed interval. */
export const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, n));

/**
 * Piecewise-linear interpolation across a table of [input, output] breakpoints.
 * Breakpoints must be sorted ascending by input. Values outside the table clamp
 * to the nearest endpoint, which is what makes every normaliser bounded.
 */
export function interpolate(x: number, table: readonly (readonly [number, number])[]): number {
  if (table.length === 0) throw new Error('interpolate: empty table');
  const first = table[0]!;
  const last = table[table.length - 1]!;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 0; i < table.length - 1; i += 1) {
    const [x0, y0] = table[i]!;
    const [x1, y1] = table[i + 1]!;
    if (x >= x0 && x <= x1) {
      const span = x1 - x0;
      if (span === 0) return y1;
      return y0 + ((x - x0) / span) * (y1 - y0);
    }
  }
  return last[1];
}

// ---------------------------------------------------------------------------
// Normalisers - raw signal to a 0-100 sub-score
// ---------------------------------------------------------------------------

/**
 * Air. US AQI, lower is better.
 * Anchored on the US EPA AQI category boundaries: 0-50 Good, 51-100 Moderate,
 * 101-150 Unhealthy for Sensitive Groups, 151-200 Unhealthy, 201+ Very
 * Unhealthy. We map category boundaries onto round sub-score steps so the
 * curve is defensible to a regulator rather than invented.
 */
export const AQI_CURVE = [
  [0, 100],
  [25, 92],
  [50, 80],
  [100, 55],
  [150, 35],
  [200, 15],
  [300, 0],
] as const;

export const airSubScore = (aqi: number): number =>
  clamp(interpolate(aqi, AQI_CURVE), 0, 100);

/**
 * Crowd. People per 100 sq m, lower is better.
 * Thresholds follow pedestrian level-of-service research (Fruin LOS A-F):
 * under 0.3 p/100sqm is free flow, ~2.0 is constrained, ~5.0 is a crush.
 * ChivaGo is a wellness product - "quiet, away from crowds" is an explicit
 * onboarding answer - so the curve punishes density harder than a transport
 * model would.
 */
export const CROWD_CURVE = [
  [0, 100],
  [0.3, 95],
  [1.0, 80],
  [2.0, 60],
  [3.5, 40],
  [5.0, 20],
  [8.0, 0],
] as const;

export const crowdSubScore = (density: number): number =>
  clamp(interpolate(density, CROWD_CURVE), 0, 100);

/**
 * Safety. A 0-10 index from the safety pipeline (patrol coverage, lighting,
 * incident history), higher is better.
 *
 * Not linear. A place with no rating should not read as actively dangerous, and
 * the top of the scale compresses: the difference between 9.0 and 10.0 is not
 * worth as much as the difference between 4.0 and 5.0.
 */
export const SAFETY_CURVE = [
  [0, 10],
  [4, 45],
  [6, 70],
  [7.5, 85],
  [9, 96],
  [10, 100],
] as const;

export const safetySubScore = (index: number): number =>
  clamp(interpolate(index, SAFETY_CURVE), 0, 100);

/**
 * Walkability. A 0-10 index, higher is better.
 *
 * This is the one metric where a low value is not necessarily bad - a mangrove
 * boardwalk scores 5.2 because it is remote, not because it is unpleasant. So
 * the curve has a lifted floor: remoteness costs you, but does not tank a
 * wellness score. The profile weighting does the rest - a "gentle" walker
 * weights walkability up, a "full days" walker weights it down.
 */
export const WALK_CURVE = [
  [0, 20],
  [3, 40],
  [5, 60],
  [7, 80],
  [8.5, 92],
  [10, 100],
] as const;

export const walkabilitySubScore = (index: number): number =>
  clamp(interpolate(index, WALK_CURVE), 0, 100);

// ---------------------------------------------------------------------------
// Weighting
// ---------------------------------------------------------------------------

export type WeightVector = Record<keyof PlaceMetrics, number>;

/**
 * Baseline weights, used when the user skipped onboarding.
 * Air and crowd lead because they are the two LIVE signals and the two the
 * product promises to watch; safety and walkability are daily composites.
 */
export const BASE_WEIGHTS: WeightVector = {
  aqi: 0.3,
  crowdDensity: 0.25,
  safetyIndex: 0.25,
  walkability: 0.2,
};

/**
 * Profile nudges. Each onboarding answer adds a delta to one or more weights;
 * the vector is renormalised to sum to 1 afterwards. Deltas are deliberately
 * small (max 0.10) so personalisation tilts the ranking without letting two
 * users see wildly different numbers for the same place.
 */
const PURPOSE_DELTAS: Record<string, Partial<WeightVector>> = {
  wellness: { aqi: 0.05, crowdDensity: 0.05 },
  nature: { aqi: 0.08, crowdDensity: 0.04 },
  food: { walkability: 0.06, safetyIndex: 0.02 },
  volunteering: { safetyIndex: 0.04 },
  quiet: { crowdDensity: 0.1 },
};

const ACTIVITY_DELTAS: Record<string, Partial<WeightVector>> = {
  /** Short walks: the quality of the footpath matters most. */
  gentle: { walkability: 0.08 },
  moderate: {},
  /** Long days: you will walk regardless, so air load matters more. */
  full: { aqi: 0.05, walkability: -0.05 },
};

const WATCH_DELTAS: Record<string, Partial<WeightVector>> = {
  air: { aqi: 0.06 },
  crowd: { crowdDensity: 0.06 },
  scam: { safetyIndex: 0.04 },
  location: { safetyIndex: 0.04 },
  language: {},
};

/**
 * Staleness handling. A reading the pipeline has flagged as stale or merely
 * estimated contributes less; the weight it loses is redistributed across the
 * fresh components. This is why a missing AQI feed degrades the score's
 * confidence instead of silently reporting yesterday as today.
 */
const PROVENANCE_TRUST: Record<Provenance, number> = {
  live: 1,
  daily: 1,
  estimated: 0.7,
  stale: 0.4,
};

/** Sum the values of a weight vector. */
const sumWeights = (w: WeightVector): number =>
  w.aqi + w.crowdDensity + w.safetyIndex + w.walkability;

/** Renormalise so the vector sums to exactly 1. */
export function normaliseWeights(w: WeightVector): WeightVector {
  const total = sumWeights(w);
  if (total <= 0) return { ...BASE_WEIGHTS };
  return {
    aqi: w.aqi / total,
    crowdDensity: w.crowdDensity / total,
    safetyIndex: w.safetyIndex / total,
    walkability: w.walkability / total,
  };
}

const applyDeltas = (into: WeightVector, deltas: Partial<WeightVector> | undefined): void => {
  if (!deltas) return;
  for (const key of Object.keys(deltas) as (keyof WeightVector)[]) {
    into[key] = Math.max(0.02, into[key] + (deltas[key] ?? 0));
  }
};

/**
 * Build the weight vector for a user. Pure: same profile in, same weights out.
 * Never mutates the profile or the base weights.
 */
export function weightsForProfile(profile: WellnessProfile | null): WeightVector {
  const w: WeightVector = { ...BASE_WEIGHTS };
  if (!profile) return normaliseWeights(w);

  for (const p of profile.purposes) applyDeltas(w, PURPOSE_DELTAS[p]);
  if (profile.activity) applyDeltas(w, ACTIVITY_DELTAS[profile.activity]);
  for (const watch of profile.watch) applyDeltas(w, WATCH_DELTAS[watch]);

  return normaliseWeights(w);
}

/** A short human label naming which weighting produced a score. */
export function describeProfile(profile: WellnessProfile | null): string {
  if (!profile || profile.completedAt === null) return 'Island baseline';
  const bits: string[] = [];
  if (profile.purposes.length > 0) bits.push(profile.purposes.join(' + '));
  if (profile.activity) bits.push(profile.activity);
  return bits.length > 0 ? `Your profile (${bits.join(', ')})` : 'Island baseline';
}

// ---------------------------------------------------------------------------
// Display formatting
// ---------------------------------------------------------------------------

const LABELS: Record<keyof PlaceMetrics, Bilingual> = {
  crowdDensity: { en: 'Crowd level', th: 'ความหนาแน่น' },
  aqi: { en: 'Air quality', th: 'คุณภาพอากาศ' },
  safetyIndex: { en: 'Safety', th: 'ความปลอดภัย' },
  walkability: { en: 'Walkability', th: 'การเดินเท้า' },
};

/**
 * Crowd is shown as a word, not a number - "High" reads faster than "3.4
 * p/100sqm" and the underlying figure is an estimate anyway. Bands match the
 * CROWD_CURVE knees so the label and the sub-score never disagree.
 */
export function crowdLabel(density: number): Bilingual {
  if (density < 0.6) return { en: 'Low', th: 'น้อย' };
  if (density < 2.0) return { en: 'Medium', th: 'ปานกลาง' };
  if (density < 4.0) return { en: 'High', th: 'มาก' };
  return { en: 'Very high', th: 'มากที่สุด' };
}

const formatDisplay = (
  key: keyof PlaceMetrics,
  m: PlaceMetrics,
  safetyPhrase?: string,
): string => {
  switch (key) {
    case 'aqi':
      return `${Math.round(m.aqi)} AQI`;
    case 'crowdDensity':
      return crowdLabel(m.crowdDensity).en;
    case 'safetyIndex':
      // The phrase ('Patrolled', 'Ranger post') is place data, not derived from
      // the index - see Place.safetyLabel. Callers pass it via ScoreOptions.
      return safetyPhrase ?? `${m.safetyIndex.toFixed(1)} / 10`;
    case 'walkability':
      return `${m.walkability.toFixed(1)} / 10`;
  }
};

// ---------------------------------------------------------------------------
// The score itself
// ---------------------------------------------------------------------------

const SUB_SCORERS: Record<keyof PlaceMetrics, (m: PlaceMetrics) => number> = {
  aqi: (m) => airSubScore(m.aqi),
  crowdDensity: (m) => crowdSubScore(m.crowdDensity),
  safetyIndex: (m) => safetySubScore(m.safetyIndex),
  walkability: (m) => walkabilitySubScore(m.walkability),
};

const METRIC_KEYS: (keyof PlaceMetrics)[] = ['crowdDensity', 'aqi', 'safetyIndex', 'walkability'];

export interface ScoreOptions {
  profile?: WellnessProfile | null;
  /** Per-metric provenance. Missing entries are treated as fresh. */
  provenance?: Partial<Record<keyof PlaceMetrics, Provenance>>;
  /** The place's own safety phrase, e.g. "Patrolled". Shown instead of a number. */
  safetyPhrase?: string;
}

/**
 * Compute a place Healthy Score and the breakdown the UI shows.
 *
 * Returns an integer 0-100 plus every intermediate value, so the app can render
 * the calculation rather than assert it. Pure - no clock, no I/O, no mutation.
 */
export function computeHealthyScore(
  metrics: PlaceMetrics,
  options: ScoreOptions = {},
): ScoreBreakdown {
  const profile = options.profile ?? null;
  const provenance = options.provenance ?? {};
  const base = weightsForProfile(profile);

  // Downweight anything the pipeline flagged as stale or estimated, then
  // renormalise so the surviving components still carry the full weight.
  const trusted: WeightVector = {
    aqi: base.aqi * PROVENANCE_TRUST[provenance.aqi ?? 'live'],
    crowdDensity: base.crowdDensity * PROVENANCE_TRUST[provenance.crowdDensity ?? 'live'],
    safetyIndex: base.safetyIndex * PROVENANCE_TRUST[provenance.safetyIndex ?? 'daily'],
    walkability: base.walkability * PROVENANCE_TRUST[provenance.walkability ?? 'daily'],
  };
  const weights = normaliseWeights(trusted);

  const components: ScoreComponent[] = METRIC_KEYS.map((key) => ({
    key,
    label: LABELS[key],
    display: formatDisplay(key, metrics, options.safetyPhrase),
    subScore: Math.round(SUB_SCORERS[key](metrics) * 10) / 10,
    weight: Math.round(weights[key] * 1000) / 1000,
    provenance: provenance[key] ?? (key === 'aqi' || key === 'crowdDensity' ? 'live' : 'daily'),
  }));

  const total = components.reduce((acc, c) => acc + c.subScore * c.weight, 0);

  return {
    total: clamp(Math.round(total), 0, 100),
    components,
    profileApplied: describeProfile(profile),
  };
}

/** Convenience wrapper when only the number is needed. */
export const healthyScore = (metrics: PlaceMetrics, options?: ScoreOptions): number =>
  computeHealthyScore(metrics, options).total;

/**
 * The design threshold: a pin at 85+ inverts to an accent fill.
 * Kept here rather than inline in the UI so the map, the feed bar and the
 * place header can never drift apart.
 */
export const HIGH_SCORE_THRESHOLD = 85;
export const isHighScore = (score: number): boolean => score >= HIGH_SCORE_THRESHOLD;
