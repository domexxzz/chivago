/**
 * Ko Sichang coastal field intelligence.
 *
 * The live current is a small, bounded Open-Meteo reading. The checkpoints
 * are real shoreline segments from electiction/chivargo-sichang's published
 * survey geometry (b0413bf). Neither one is evidence that rubbish is present:
 * the existing geofence/photo/host-review pipeline remains the only path to
 * verified Quest progress and rewards.
 */
import type { CoastalIntelligence, CoastalSurveyZone, Localised } from '@chivago/core';

const MARINE_API = 'https://marine-api.open-meteo.com/v1/marine';
const SOURCE = 'Open-Meteo Marine · Météo-France currents / Copernicus SMOC';
const MODEL = 'sichang-rk2-sensitivity-v2 research context';
const TIMEOUT_MS = 4_000;
const MAX_BODY_BYTES = 16 * 1024;
export const COASTAL_TTL_MS = 15 * 60_000;
export const COASTAL_RETRY_MS = 60_000;
export const COASTAL_STALE_MAX_MS = 3 * 60 * 60_000;

export interface CoastalOptions {
  now?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const ZONES: CoastalSurveyZone[] = [
  {
    id: 'ksc-coast-north-08', segmentId: 8, lat: 13.177361, lng: 100.808091,
    name: { en: 'North coast checkpoint', th: 'จุดสำรวจชายฝั่งเหนือ', zh: '北岸调查点' },
    nearBeach: { en: 'Tham Chok Khok coast', th: 'ชายฝั่งถ้ำจ๊อกค่อก', zh: 'Tham Chok Khok 海岸' },
    purpose: { en: 'Inspect the exposed northern shoreline.', th: 'สำรวจแนวชายฝั่งเหนือที่เปิดรับกระแสน้ำ', zh: '巡查外露的北部海岸线。' },
  },
  {
    id: 'ksc-coast-east-15', segmentId: 15, lat: 13.155608, lng: 100.813619,
    name: { en: 'Tha Wang checkpoint', th: 'จุดสำรวจท่าวัง', zh: 'Tha Wang 调查点' },
    nearBeach: { en: 'Tha Wang coast', th: 'ชายฝั่งท่าวัง', zh: 'Tha Wang 海岸' },
    purpose: { en: 'Record field conditions near the east coast community.', th: 'บันทึกสภาพจริงใกล้ชุมชนชายฝั่งตะวันออก', zh: '记录东岸社区附近的现场情况。' },
  },
  {
    id: 'ksc-coast-south-27', segmentId: 27, lat: 13.128841, lng: 100.812557,
    name: { en: 'South coast checkpoint', th: 'จุดสำรวจชายฝั่งใต้', zh: '南岸调查点' },
    nearBeach: { en: 'Tham Phang coast', th: 'ชายฝั่งถ้ำพัง', zh: 'Tham Phang 海岸' },
    purpose: { en: 'Check the southern approach before planning field work.', th: 'ตรวจแนวชายฝั่งใต้ก่อนวางแผนลงพื้นที่', zh: '现场作业前检查南部近岸。' },
  },
];

let cache: { at: number; value: CoastalIntelligence } | null = null;
let failedAt = -Infinity;
let inFlight: Promise<CoastalIntelligence> | null = null;

export function __resetCoastalIntelligence(): void {
  cache = null;
  failedAt = -Infinity;
  inFlight = null;
}

export const coastalCurrentUrl = (): string =>
  `${MARINE_API}?latitude=13.1599&longitude=100.8096`
  + '&current=ocean_current_velocity,ocean_current_direction'
  + '&models=meteofrance_currents&timezone=Asia%2FBangkok';

async function readCapped(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error('coastal answer too large');
    }
    text += decoder.decode(value, { stream: true });
  }
}

async function fetchCurrent(fetchImpl: typeof fetch, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(coastalCurrentUrl(), {
      signal: controller.signal,
      /*
        'manual', NOT 'error', and the difference is the whole feature.
        Workers refuses 'error' outright - "it does not make sense at the
        edge" - so every call threw, every answer was `unavailable`, and the
        current never once reached a traveller. Node accepts it and the tests
        inject their own fetch, so nothing below production ever ran this line.
        The intent is unchanged: 'manual' hands the 3xx back as a response,
        and `ok` is false for it, so the throw below still refuses a redirect.
      */
      redirect: 'manual',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`upstream ${response.status}`);
    return JSON.parse(await readCapped(response));
  } finally {
    clearTimeout(timer);
  }
}

const directionLabel = (degrees: number): Localised => {
  const labels: Localised[] = [
    { en: 'North', th: 'ทิศเหนือ', zh: '北' }, { en: 'Northeast', th: 'ตะวันออกเฉียงเหนือ', zh: '东北' },
    { en: 'East', th: 'ทิศตะวันออก', zh: '东' }, { en: 'Southeast', th: 'ตะวันออกเฉียงใต้', zh: '东南' },
    { en: 'South', th: 'ทิศใต้', zh: '南' }, { en: 'Southwest', th: 'ตะวันตกเฉียงใต้', zh: '西南' },
    { en: 'West', th: 'ทิศตะวันตก', zh: '西' }, { en: 'Northwest', th: 'ตะวันตกเฉียงเหนือ', zh: '西北' },
  ];
  return labels[Math.round(degrees / 45) % 8]!;
};

function empty(status: 'stale' | 'unavailable'): CoastalIntelligence {
  return {
    area: 'koh-sichang', status, observedAt: null, fetchedAt: null, source: SOURCE,
    current: { speedKmh: null, directionDeg: null, directionLabel: null },
    model: {
      name: MODEL, resolutionKm: 9, calibrated: false,
      notice: {
        en: 'Research guidance only. It is not a calibrated debris probability.',
        th: 'ใช้ประกอบการวางแผนสำรวจเท่านั้น ไม่ใช่ความน่าจะเป็นของขยะที่ผ่านการสอบเทียบ',
        zh: '仅供调查规划参考，并非经过校准的垃圾概率。',
      },
    },
    zones: ZONES,
    safetyNotice: {
      en: 'Check weather, waves and local safety advice before field work.',
      th: 'ตรวจอากาศ คลื่น และคำแนะนำความปลอดภัยในพื้นที่ก่อนลงสำรวจ',
      zh: '现场调查前请检查天气、海浪和当地安全提示。',
    },
  };
}

function parse(payload: unknown, fetchedAt: string): CoastalIntelligence | null {
  if (!payload || typeof payload !== 'object') return null;
  const current = (payload as { current?: unknown }).current;
  if (!current || typeof current !== 'object') return null;
  const row = current as Record<string, unknown>;
  const speed = row.ocean_current_velocity;
  const direction = row.ocean_current_direction;
  const time = row.time;
  if (typeof speed !== 'number' || !Number.isFinite(speed) || speed < 0) return null;
  if (typeof direction !== 'number' || !Number.isFinite(direction) || direction < 0 || direction > 360) return null;
  if (typeof time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(time)) return null;
  return {
    ...empty('unavailable'), status: 'live', observedAt: `${time}+07:00`, fetchedAt,
    current: { speedKmh: speed, directionDeg: direction, directionLabel: directionLabel(direction) },
  };
}

export async function getCoastalIntelligence(opts: CoastalOptions = {}): Promise<CoastalIntelligence> {
  const now = opts.now ?? Date.now();
  if (cache && now - cache.at < COASTAL_TTL_MS) return cache.value;
  const stale = (): CoastalIntelligence => cache && now - cache.at < COASTAL_STALE_MAX_MS
    ? { ...cache.value, status: 'stale' }
    : empty('unavailable');
  if (now - failedAt < COASTAL_RETRY_MS) return stale();
  if (inFlight) return inFlight;
  const run = (async () => {
    try {
      const fetchedAt = new Date(now).toISOString();
      const parsed = parse(await fetchCurrent(opts.fetchImpl ?? fetch, opts.timeoutMs ?? TIMEOUT_MS), fetchedAt);
      if (!parsed) throw new Error('invalid current reading');
      cache = { at: now, value: parsed };
      failedAt = -Infinity;
      return parsed;
    } catch (error) {
      failedAt = now;
      console.warn(`[coastal] koh-sichang: ${error instanceof Error ? error.message : String(error)}`);
      return stale();
    } finally {
      inFlight = null;
    }
  })();
  inFlight = run;
  return run;
}
