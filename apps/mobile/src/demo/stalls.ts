/**
 * The demo build's stalls (docs/65), answered here rather than captured: a
 * captured wait would be replayed as if it were now. Each stall is named with
 * no status at all ('stale', never read), and its button opens the real
 * สั่งก่อน - the one live thing a static build can honestly offer.
 */

import { NO_STALLS, isExampleStall, stallSourceFor, type PlaceStalls } from '@chivago/core';

/**
 * สั่งก่อน's names for the stalls the demo lists. The live API reads them from
 * the service; a stall added to PLACE_STALLS needs its name here too, or the
 * demo shows its slug.
 */
export const DEMO_STALL_NAMES: Readonly<Record<string, string>> = { demo: 'บะหมี่หน้าหอ (ร้านตัวอย่าง)' };

export function demoStalls(placeId: string): PlaceStalls {
  const src = stallSourceFor(placeId);
  if (!src) return NO_STALLS;
  return {
    provider: src.provider,
    provenance: 'stale',
    observedAt: null,
    source: 'Demo build · the status is not read here',
    stalls: src.slugs.map((slug) => ({
      slug,
      name: DEMO_STALL_NAMES[slug] ?? slug,
      example: isExampleStall(slug),
      // Not known here, so said the way that misleads least: shut, not open and ordering.
      open: false, opensAt: null, accepting: false, payReady: false, waitMin: null,
      orderUrl: `https://sangkon.fly.dev/s/${slug}`,
    })),
  };
}
