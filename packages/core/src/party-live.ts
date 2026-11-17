import type { Bilingual } from './types.ts';

export type PartyMemberPresence = 'online' | 'offline' | 'location_disabled' | 'location_unavailable';

export interface PartyLiveMember {
  userId: string;
  displayName: string;
  profilePhotoUrl: string | null;
  you: boolean;
  sharingEnabled: boolean;
  presence: PartyMemberPresence;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  updatedAt: string | null;
}

export interface PartyMeetingPoint {
  latitude: number;
  longitude: number;
  label: string;
  setBy: string;
  updatedAt: string;
}

export type PartyMessageKind = 'chat' | 'ping';
export type PartyPingKind = 'come_here' | 'wait' | 'look_here' | 'suggest_place';

export interface PartyMessage {
  id: string;
  partyId: string;
  authorId: string;
  authorName: string;
  authorPhotoUrl: string | null;
  kind: PartyMessageKind;
  body: string;
  pingKind: PartyPingKind | null;
  placeId: string | null;
  createdAt: string;
  mine: boolean;
}

export interface PartyItineraryItem {
  id: string;
  placeId: string;
  placeName: Bilingual;
  position: number;
  addedBy: string;
  createdAt: string;
}

export interface PartyTripSummary {
  partyId: string;
  partyName: string;
  startedAt: string;
  endedAt: string;
  memberCount: number;
  messageCount: number;
  itinerary: { placeId: string; name: Bilingual; position: number }[];
  /** Aggregate distance only. Raw GPS history is never retained. */
  distanceTravelledM: number;
}

export const PARTY_LOCATION_STALE_MS = 90_000;
export const PARTY_CHAT_MAX_LENGTH = 1_000;
