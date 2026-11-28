import type { Localised } from '@chivago/core';

/**
 * A published, uncalibrated particle-run used to decide where a field team
 * should look first.  `count` is a simulation contact count, never a litter
 * count and never verified Quest evidence.
 */
export interface CoastalDriftFile {
  model: string | null;
  issued: string | null;
  window: number;
  calibrated: false;
  seeding: string | null;
  sensitivityMeaning: string | null;
  simulations: number | null;
  contacts: number | null;
  afloat: number | null;
  outOfArea: number | null;
  max: number;
  source: string;
  segments: CoastalDriftSegment[];
}
export interface CoastalDriftSegment {
  id: number;
  count: number;
  firstHours: number | null;
  arrivalP10: number | null;
  arrivalP90: number | null;
  low: number | null;
  high: number | null;
  beach: string | null;
  near: string | null;
  path: [number, number][];
}

export type CoastalSide = 'north' | 'east' | 'south' | 'west';
export type CoastalAttention = 'higher' | 'watch' | 'lower';

export interface CoastalDriftPoint extends CoastalDriftSegment {
  rank: number;
  lat: number;
  lng: number;
  side: CoastalSide;
  sideLabel: Localised;
  attention: CoastalAttention;
  attentionLabel: Localised;
  locationLabel: Localised;
}

const SIDE_LABELS: Record<CoastalSide, Localised> = {
  north: { en: 'North coast', th: 'ชายฝั่งเหนือ', zh: '北岸' },
  east: { en: 'East coast', th: 'ชายฝั่งตะวันออก', zh: '东岸' },
  south: { en: 'South coast', th: 'ชายฝั่งใต้', zh: '南岸' },
  west: { en: 'West coast', th: 'ชายฝั่งตะวันตก', zh: '西岸' },
};

const ATTENTION_LABELS: Record<CoastalAttention, Localised> = {
  higher: { en: 'Survey first', th: 'ควรสำรวจก่อน', zh: '优先巡查' },
  watch: { en: 'Keep watch', th: 'เฝ้าระวัง', zh: '持续观察' },
  lower: { en: 'Lower model contact', th: 'แนวโน้มต่ำกว่า', zh: '模型触岸较少' },
};

/**
 * The published sidecar predates app localisation and stores Thai shoreline
 * names. Keep that source value intact, but never leak it into English or
 * Chinese UI. Unknown future names remain visible in Thai and fall back to a
 * truthful island-shoreline label in the other languages.
 */
const COAST_LOCATION_LABELS: Record<string, Localised> = {
  'หาดถ้ำจ๊อกค่อก': { en: 'Tham Chok Khok Beach', th: 'หาดถ้ำจ๊อกค่อก', zh: '汤乔克海滩' },
  'หาดท่าวัง': { en: 'Tha Wang Beach', th: 'หาดท่าวัง', zh: '塔旺海滩' },
  'หาดถ้ำพัง': { en: 'Tham Phang Beach', th: 'หาดถ้ำพัง', zh: '探蓬海滩' },
};

function coastalLocationLabel(raw: string | null): Localised {
  if (raw && COAST_LOCATION_LABELS[raw]) return COAST_LOCATION_LABELS[raw];
  return {
    en: 'Ko Sichang shoreline',
    th: raw || 'ชายฝั่งเกาะสีชัง',
    zh: '锡昌岛海岸',
  };
}

/** Side names follow the 43 published shoreline segments, not a guessed pin. */
export function coastalSide(segmentId: number): CoastalSide {
  if (segmentId >= 2 && segmentId <= 12) return 'north';
  if (segmentId >= 13 && segmentId <= 23) return 'east';
  if (segmentId >= 24 && segmentId <= 32) return 'south';
  return 'west';
}

const finiteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function validSegment(value: unknown): value is CoastalDriftSegment {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return Number.isInteger(row.id)
    && finiteNumber(row.count) && row.count >= 0
    && Array.isArray(row.path) && row.path.length > 1
    && row.path.every((p) => Array.isArray(p) && p.length === 2
      && finiteNumber(p[0]) && finiteNumber(p[1])
      && p[0] >= 100.75 && p[0] <= 100.86 && p[1] >= 13.08 && p[1] <= 13.22);
}

/** Validate the sidecar before any coordinate reaches the map. */
export function parseCoastalDrift(value: unknown): CoastalDriftFile | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (row.calibrated !== false || !finiteNumber(row.window) || row.window <= 0
    || !finiteNumber(row.max) || row.max < 0 || typeof row.source !== 'string'
    || !Array.isArray(row.segments) || !row.segments.every(validSegment)) return null;
  return value as CoastalDriftFile;
}

export async function loadCoastalDrift(url: string): Promise<CoastalDriftFile | null> {
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    return parseCoastalDrift(await response.json());
  } catch {
    return null;
  }
}

/**
 * Whether the run has outlived the window it forecasts.
 *
 * MEASURED ON THE LIVE SITE ON 28 NOVEMBER 2026: the published run was issued
 * on 17 November with `window: 6`, so it was 279 hours - eleven and a half
 * days - past the six hours it claimed to describe, sitting behind a tab
 * labelled "พยากรณ์ขยะลอย". Nothing failed and nothing warned, because a
 * stale file parses exactly as well as a fresh one and `issued` was only ever
 * printed as a date, never compared against the clock.
 *
 * A drift run is a statement about a particular tide and a particular wind.
 * Past its window it is not a weaker forecast, it is a different sea, and the
 * honest thing to show is the empty state this screen already has.
 *
 * A file with no `issued` is expired too. Freshness cannot be shown, and a
 * planning model that will not say when it was computed has not earned the
 * word forecast. `parseCoastalDrift` does not require the field, so this is
 * where the absence has to be answered.
 */
export function coastalDriftExpired(file: CoastalDriftFile | null, now: number = Date.now()): boolean {
  if (!file) return true;
  if (!file.issued) return true;
  const issued = Date.parse(file.issued);
  if (!Number.isFinite(issued)) return true;
  // A run issued in the future is a clock nobody can trust either way.
  return now < issued || now - issued > file.window * 3_600_000;
}

/** How far past its window the run is, in whole hours, or null if it is not. */
export function coastalDriftStaleHours(
  file: CoastalDriftFile | null, now: number = Date.now(),
): number | null {
  if (!file?.issued) return null;
  const issued = Date.parse(file.issued);
  if (!Number.isFinite(issued) || now < issued) return null;
  const over = (now - issued) / 3_600_000 - file.window;
  return over > 0 ? Math.floor(over) : null;
}

/**
 * Rank only segments reached by the research run.  Zero-contact segments are
 * retained in the file and its methodology, but do not become orange dots
 * that could be mistaken for a detected item of rubbish.
 */
export function coastalDriftPoints(file: CoastalDriftFile | null): CoastalDriftPoint[] {
  if (!file) return [];
  const reached = file.segments.filter((segment) => segment.count > 0)
    .sort((a, b) => b.count - a.count || a.id - b.id);
  return reached.map((segment, index) => {
    const lng = segment.path.reduce((sum, point) => sum + point[0], 0) / segment.path.length;
    const lat = segment.path.reduce((sum, point) => sum + point[1], 0) / segment.path.length;
    const ratio = file.max > 0 ? segment.count / file.max : 0;
    const attention: CoastalAttention = ratio >= 0.6 ? 'higher' : ratio >= 0.2 ? 'watch' : 'lower';
    const side = coastalSide(segment.id);
    return {
      ...segment,
      rank: index + 1,
      lat,
      lng,
      side,
      sideLabel: SIDE_LABELS[side],
      attention,
      attentionLabel: ATTENTION_LABELS[attention],
      locationLabel: coastalLocationLabel(segment.near ?? segment.beach),
    };
  });
}
