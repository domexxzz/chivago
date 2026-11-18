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
