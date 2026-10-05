/**
 * One colour per zone of a fair (docs/66), shared by the lot list and the
 * map's lot marks, so a lot's badge and its dot read as the same place.
 * By the zone's letter: A, B, C, D, then round again.
 */
const ZONE_TONES = ['#2f7d4f', '#b8650f', '#c2412d', '#6b4fa3'] as const;

export function zoneTone(zoneCode: string): string {
  const k = (zoneCode.toUpperCase().charCodeAt(0) - 65) % ZONE_TONES.length;
  return ZONE_TONES[k >= 0 ? k : 0]!;
}
