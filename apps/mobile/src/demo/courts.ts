/**
 * The demo build's court counts, answered here rather than captured: a
 * captured count would be replayed as if it were now, and "2 courts free"
 * from the day the snapshot was taken is a court nobody promised.
 *
 * So the venue is named with no count at all ('stale', never read), and the
 * card says the status is not read here and points at the venue's own booking
 * page - the one live thing a static build can honestly offer.
 */

import { NO_COURTS, courtSourceFor, type PlaceCourts } from '@chivago/core';

export function demoCourts(placeId: string): PlaceCourts {
  const src = courtSourceFor(placeId);
  if (!src) return NO_COURTS;
  return {
    provider: src.provider,
    provenance: 'stale',
    observedAt: null,
    source: 'Demo build · the count is not read here',
    // Not known here, so said the way that misleads least: no count, rather
    // than a nought that would read as "every court is taken".
    count: null,
  };
}
