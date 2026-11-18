import type { Localised } from './types.ts';

/**
 * A real shoreline checkpoint imported from the Ko Sichang research map.
 * These are survey locations, not claims that debris is present.
 */
export interface CoastalSurveyZone {
  id: string;
  segmentId: number;
  name: Localised;
  nearBeach: Localised;
  lat: number;
  lng: number;
  purpose: Localised;
}

export type CoastalDataStatus = 'live' | 'stale' | 'unavailable';

/**
 * Operational context for field teams. Forecast figures are intentionally
 * separate from verified Quest evidence and can never award points.
 */
export interface CoastalIntelligence {
  area: 'koh-sichang';
  status: CoastalDataStatus;
  observedAt: string | null;
  fetchedAt: string | null;
  source: string;
  current: {
    speedKmh: number | null;
    directionDeg: number | null;
    directionLabel: Localised | null;
  };
  model: {
    name: string;
    resolutionKm: number;
    calibrated: false;
    notice: Localised;
  };
  zones: CoastalSurveyZone[];
  safetyNotice: Localised;
}
