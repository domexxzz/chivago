/**
 * The island's clock, shared by everything that is lit by it.
 *
 * The companion room and the map are both drawn under the sun at Koh Samui,
 * and they must agree about where it is: a langur in golden evening light
 * over a map at flat noon would be two islands. So the sunrise, the sunset,
 * the shape of the day, the colour mixer and the `?hour=` override all live
 * here, once, with no renderer and no window - which is also what lets a
 * test hold them.
 */

/** Island time. Sun up at six, down at half past six; close enough at 9°N all year. */
export const SUNRISE = 6;
export const SUNSET = 18.5;

export interface DayArc {
  /** Whether the sun is up at all. */
  day: boolean;
  /** 0 at the horizon, 1 at noon; 0 all night. */
  arc: number;
  /** 1 at the horizon, fading to 0 by mid-morning; the warm edges of the day. */
  golden: number;
}

/** Where the day is, for an hour 0–24 (wrapping). */
export function dayArc(hour: number): DayArc {
  const h = ((hour % 24) + 24) % 24;
  const day = h >= SUNRISE && h < SUNSET;
  const arc = day ? Math.sin(((h - SUNRISE) / (SUNSET - SUNRISE)) * Math.PI) : 0;
  const golden = day ? Math.max(0, 1 - arc * 2.2) : 0;
  return { day, arc, golden };
}

/** `a` blended toward `b` by `k` in 0–1, as a six-digit hex colour. */
export const mix = (a: string, b: string, k: number): string => {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - k) + ((pb >> shift) & 255) * k);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
};

/** Hue in degrees, 0–360, for holding one green apart from another. */
export function hueOf(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
}

/** Relative luminance, 0–1, for saying "darker" in a test. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/**
 * `?hour=14` on the URL: the island at that hour, for looking at it, and for
 * a demo given at midnight that wants to show the beach in daylight.
 *
 * Takes the search string rather than reading `window`, so the parse is the
 * same in a test as in a browser. Anything that is not a finite number is
 * "no override", not "hour zero": a typo must not turn the island to night.
 */
export function hourFrom(search: string): number | null {
  const raw = new URLSearchParams(search).get('hour');
  if (raw === null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
