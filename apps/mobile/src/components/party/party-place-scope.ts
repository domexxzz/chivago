import { AREAS, inArea, type ScoredPlace } from '@chivago/core';

const KOH_SICHANG = AREAS.find((area) => area.key === 'koh-sichang');

/** Party discovery is currently an island-only feature. */
export function kohSichangPartyPlaces(places: ScoredPlace[]): ScoredPlace[] {
  if (!KOH_SICHANG) return [];
  return places.filter((place) => inArea(KOH_SICHANG, place));
}
