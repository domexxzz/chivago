/**
 * One colour per zone of a fair (docs/66), shared by the lot list and the
 * map's lot marks, so a lot's badge and its dot read as the same place.
 * By the zone's letter: A, B, C, D, then round again.
 *
 * From the palette's fills that carry a white label, and none of the colours
 * that MEAN something (tokens): not green, which is evidence; not coral, which
 * is danger; not the brand blue, which is selection - the lot asked for wears
 * it as its ring. fair-tones.test.ts holds every one to 4.5:1 under white.
 */
import { color } from '@chivago/tokens';

const ZONE_TONES = [color.paper, color.goldDeep, color.ctaDeep, color.text] as const;

export function zoneTone(zoneCode: string): string {
  const k = (zoneCode.toUpperCase().charCodeAt(0) - 65) % ZONE_TONES.length;
  return ZONE_TONES[k >= 0 ? k : 0]!;
}
