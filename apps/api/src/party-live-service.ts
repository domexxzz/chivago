import { randomUUID } from 'node:crypto';
import {
  PARTY_CHAT_MAX_LENGTH, PARTY_LOCATION_STALE_MS,
  type PartyItineraryItem, type PartyLiveMember, type PartyMeetingPoint,
  type PartyMessage, type PartyPingKind, type PartyTripSummary,
} from '@chivago/core';
import { row, rows, transact, type DB } from './db.ts';
import { activePartyFor, disbandParty } from './party-service.ts';

export class PartyLiveError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message); this.name = 'PartyLiveError';
    this.code = code;
    this.status = status;
  }
}

const requireParty = (db: DB, userId: string) => {
  const party = activePartyFor(db, userId);
  if (!party) throw new PartyLiveError('NO_PARTY', 'Join a party first.', 404);
  return party;
};

const finite = (value: unknown, name: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new PartyLiveError('INVALID_LOCATION', `${name} must be a finite number.`);
  return value;
};

const coordinates = (latitude: unknown, longitude: unknown) => {
  const lat = finite(latitude, 'latitude'); const lng = finite(longitude, 'longitude');
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new PartyLiveError('INVALID_LOCATION', 'Coordinates are outside the valid range.');
  return { lat, lng };
};

const optionalNumber = (value: unknown, min: number, max: number): number | null => {
  if (value === undefined || value === null) return null;
  const n = finite(value, 'location value');
  return Math.min(max, Math.max(min, n));
};

const haversine = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180; const earth = 6_371_000;
  const dLat = (b.lat - a.lat) * r; const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(h));
};

export function setPartyPhoto(db: DB, userId: string, mime: string, bytes: Uint8Array): string {
  const party = requireParty(db, userId);
  if (party.createdBy !== userId) throw new PartyLiveError('NOT_OWNER', 'Only the party owner can change its picture.', 403);
  if (!/^image\/(jpeg|png|webp)$/.test(mime)) throw new PartyLiveError('INVALID_IMAGE', 'Use a JPEG, PNG or WebP image.');
  if (bytes.byteLength > 3 * 1024 * 1024) throw new PartyLiveError('IMAGE_TOO_LARGE', 'Party pictures must be 3 MB or smaller.', 413);
  db.prepare('UPDATE parties SET photo_mime=?,photo_bytes=? WHERE id=?').run(mime, bytes, party.id);
  return `/party/${party.id}/photo`;
}

export function readPartyPhoto(db: DB, partyId: string): { mime: string; bytes: Uint8Array } | null {
  return row<{ mime: string; bytes: Uint8Array }>(db.prepare(
    'SELECT photo_mime AS mime,photo_bytes AS bytes FROM parties WHERE id=? AND disbanded_at IS NULL AND photo_bytes IS NOT NULL',
  ).get(partyId)) ?? null;
}

export function setLocationSharing(db: DB, userId: string, enabled: boolean, now = new Date()): boolean {
  const party = requireParty(db, userId);
  return transact(db, () => {
    const result = db.prepare('UPDATE party_members SET sharing_enabled=?,last_seen_at=? WHERE party_id=? AND user_id=? AND left_at IS NULL')
      .run(enabled ? 1 : 0, now.toISOString(), party.id, userId);
    if (!enabled) db.prepare('DELETE FROM party_locations WHERE party_id=? AND user_id=?').run(party.id, userId);
    return Number(result.changes ?? 0) > 0;
  });
}

export function updatePartyLocation(db: DB, userId: string, input: {
  latitude: unknown; longitude: unknown; accuracy?: unknown; heading?: unknown; speed?: unknown;
}, now = new Date()): void {
  const party = requireParty(db, userId); const { lat, lng } = coordinates(input.latitude, input.longitude);
  const member = row<{ sharing_enabled: number }>(db.prepare(
    'SELECT sharing_enabled FROM party_members WHERE party_id=? AND user_id=? AND left_at IS NULL',
  ).get(party.id, userId));
  if (!member?.sharing_enabled) throw new PartyLiveError('SHARING_DISABLED', 'Turn on location sharing first.', 409);
  const previous = row<{ latitude: number; longitude: number; updated_at: string }>(db.prepare(
    'SELECT latitude,longitude,updated_at FROM party_locations WHERE party_id=? AND user_id=?',
  ).get(party.id, userId));
  if (previous && now.getTime() - Date.parse(previous.updated_at) < 1_500) throw new PartyLiveError('LOCATION_RATE_LIMIT', 'Location updates are limited to one every 1.5 seconds.', 429);
  const distance = previous ? haversine({ lat: previous.latitude, lng: previous.longitude }, { lat, lng }) : 0;
  const elapsed = previous ? now.getTime() - Date.parse(previous.updated_at) : 0;
  const credibleDistance = elapsed > 0 && elapsed <= 10 * 60_000 && distance <= Math.max(1_000, elapsed / 3.6) ? distance : 0;
  transact(db, () => {
    db.prepare(`INSERT INTO party_locations(party_id,user_id,latitude,longitude,accuracy,heading,speed,updated_at)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(party_id,user_id) DO UPDATE SET
      latitude=excluded.latitude,longitude=excluded.longitude,accuracy=excluded.accuracy,
      heading=excluded.heading,speed=excluded.speed,updated_at=excluded.updated_at`)
      .run(party.id, userId, lat, lng, optionalNumber(input.accuracy, 0, 100_000), optionalNumber(input.heading, 0, 360), optionalNumber(input.speed, 0, 150), now.toISOString());
    db.prepare('UPDATE party_members SET last_seen_at=?,distance_travelled_m=distance_travelled_m+? WHERE party_id=? AND user_id=?')
      .run(now.toISOString(), credibleDistance, party.id, userId);
  });
}

export function liveMembers(db: DB, userId: string, now = new Date()): PartyLiveMember[] {
  const party = requireParty(db, userId);
  const result = rows<{
    user_id: string; display_name: string; profile_photo_url: string | null; sharing_enabled: number;
    last_seen_at: string | null; latitude: number | null; longitude: number | null; accuracy: number | null;
    heading: number | null; speed: number | null; updated_at: string | null;
  }>(db.prepare(`SELECT m.user_id,u.display_name,pr.profile_photo_url,m.sharing_enabled,m.last_seen_at,
      l.latitude,l.longitude,l.accuracy,l.heading,l.speed,l.updated_at
    FROM party_members m JOIN users u ON u.id=m.user_id LEFT JOIN profiles pr ON pr.user_id=u.id
    LEFT JOIN party_locations l ON l.party_id=m.party_id AND l.user_id=m.user_id
    WHERE m.party_id=? AND m.left_at IS NULL ORDER BY m.joined_at`).all(party.id));
  return result.map((item) => {
    const fresh = item.updated_at !== null && now.getTime() - Date.parse(item.updated_at) <= PARTY_LOCATION_STALE_MS;
    const presence = !item.sharing_enabled ? 'location_disabled' : item.updated_at === null ? 'location_unavailable' : fresh ? 'online' : 'offline';
    return {
      userId: item.user_id, displayName: item.display_name, profilePhotoUrl: item.profile_photo_url,
      you: item.user_id === userId, sharingEnabled: Boolean(item.sharing_enabled), presence,
      latitude: item.sharing_enabled ? item.latitude : null, longitude: item.sharing_enabled ? item.longitude : null,
      accuracy: item.sharing_enabled ? item.accuracy : null, heading: item.sharing_enabled ? item.heading : null,
      speed: item.sharing_enabled ? item.speed : null, updatedAt: item.sharing_enabled ? item.updated_at : null,
    };
  });
}

export function setMeetingPoint(db: DB, userId: string, input: { latitude: unknown; longitude: unknown; label?: unknown }, now = new Date()): PartyMeetingPoint {
  const party = requireParty(db, userId); const { lat, lng } = coordinates(input.latitude, input.longitude);
  const label = typeof input.label === 'string' ? input.label.trim().slice(0, 120) : '';
  const at = now.toISOString();
  db.prepare(`INSERT INTO party_meeting_points(party_id,set_by,latitude,longitude,label,updated_at) VALUES(?,?,?,?,?,?)
    ON CONFLICT(party_id) DO UPDATE SET set_by=excluded.set_by,latitude=excluded.latitude,longitude=excluded.longitude,label=excluded.label,updated_at=excluded.updated_at`)
    .run(party.id, userId, lat, lng, label || 'Meeting point', at);
  return { latitude: lat, longitude: lng, label: label || 'Meeting point', setBy: userId, updatedAt: at };
}

export function meetingPoint(db: DB, userId: string): PartyMeetingPoint | null {
  const party = requireParty(db, userId);
  const found = row<{ latitude: number; longitude: number; label: string; set_by: string; updated_at: string }>(db.prepare(
    'SELECT latitude,longitude,label,set_by,updated_at FROM party_meeting_points WHERE party_id=?',
  ).get(party.id));
  return found ? { latitude: found.latitude, longitude: found.longitude, label: found.label, setBy: found.set_by, updatedAt: found.updated_at } : null;
}

const PINGS = new Set<PartyPingKind>(['come_here', 'wait', 'look_here', 'suggest_place']);
export function addPartyMessage(db: DB, userId: string, input: { body?: unknown; kind?: unknown; pingKind?: unknown; placeId?: unknown }, now = new Date()): PartyMessage {
  const party = requireParty(db, userId); const kind = input.kind === 'ping' ? 'ping' : 'chat';
  const body = typeof input.body === 'string' ? input.body.trim().slice(0, PARTY_CHAT_MAX_LENGTH) : '';
  if (!body) throw new PartyLiveError('MESSAGE_REQUIRED', 'Write a message first.');
  const pingKind = kind === 'ping' && typeof input.pingKind === 'string' && PINGS.has(input.pingKind as PartyPingKind) ? input.pingKind as PartyPingKind : null;
  if (kind === 'ping' && !pingKind) throw new PartyLiveError('INVALID_PING', 'Choose a supported quick ping.');
  const placeId = typeof input.placeId === 'string' && input.placeId ? input.placeId : null;
  if (placeId && !row(db.prepare('SELECT id FROM places WHERE id=?').get(placeId))) throw new PartyLiveError('UNKNOWN_PLACE', 'That place is not in ChivaGo.', 404);
  const id = randomUUID(); const at = now.toISOString();
  db.prepare('INSERT INTO party_messages(id,party_id,user_id,kind,body,ping_kind,place_id,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(id, party.id, userId, kind, body, pingKind, placeId, at);
  return partyMessages(db, userId).find((message) => message.id === id)!;
}

export function partyMessages(db: DB, userId: string, after?: string, limit = 100): PartyMessage[] {
  const party = requireParty(db, userId); const safeLimit = Math.max(1, Math.min(100, limit));
  const values: unknown[] = [party.id]; let cursor = '';
  if (after) { cursor = ' AND pm.created_at > (SELECT created_at FROM party_messages WHERE id=?)'; values.push(after); }
  values.push(safeLimit);
  return rows<{ id: string; party_id: string; user_id: string; display_name: string; profile_photo_url: string | null; kind: 'chat' | 'ping'; body: string; ping_kind: PartyPingKind | null; place_id: string | null; created_at: string }>(db.prepare(
    `SELECT pm.id,pm.party_id,pm.user_id,u.display_name,pr.profile_photo_url,pm.kind,pm.body,pm.ping_kind,pm.place_id,pm.created_at
     FROM party_messages pm JOIN users u ON u.id=pm.user_id LEFT JOIN profiles pr ON pr.user_id=u.id
     WHERE pm.party_id=?${cursor} ORDER BY pm.created_at DESC,pm.id DESC LIMIT ?`,
  ).all(...values)).map((m) => ({
    id: m.id, partyId: m.party_id, authorId: m.user_id, authorName: m.display_name,
    authorPhotoUrl: m.profile_photo_url, kind: m.kind, body: m.body, pingKind: m.ping_kind,
    placeId: m.place_id, createdAt: m.created_at, mine: m.user_id === userId,
  }));
}

export function itinerary(db: DB, userId: string): PartyItineraryItem[] {
  const party = requireParty(db, userId);
  return rows<{ id: string; place_id: string; name_en: string; name_th: string; position: number; added_by: string; created_at: string }>(db.prepare(
    `SELECT i.id,i.place_id,p.name_en,p.name_th,i.position,i.added_by,i.created_at FROM party_itinerary i
     JOIN places p ON p.id=i.place_id WHERE i.party_id=? ORDER BY i.position,i.created_at`,
  ).all(party.id)).map((i) => ({ id: i.id, placeId: i.place_id, placeName: { en: i.name_en, th: i.name_th, zh: i.name_en }, position: i.position, addedBy: i.added_by, createdAt: i.created_at }));
}

export function addItineraryPlace(db: DB, userId: string, placeId: string, now = new Date()): PartyItineraryItem[] {
  const party = requireParty(db, userId);
  if (!row(db.prepare('SELECT id FROM places WHERE id=?').get(placeId))) throw new PartyLiveError('UNKNOWN_PLACE', 'That place is not in ChivaGo.', 404);
  const position = Number(row<{ n: number }>(db.prepare('SELECT COALESCE(MAX(position),-1)+1 AS n FROM party_itinerary WHERE party_id=?').get(party.id))?.n ?? 0);
  try { db.prepare('INSERT INTO party_itinerary(id,party_id,place_id,position,added_by,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(), party.id, placeId, position, userId, now.toISOString()); }
  catch { throw new PartyLiveError('PLACE_ALREADY_ADDED', 'That place is already in this trip.', 409); }
  return itinerary(db, userId);
}

export function removeItineraryPlace(db: DB, userId: string, placeId: string): PartyItineraryItem[] {
  const party = requireParty(db, userId);
  transact(db, () => {
    db.prepare('DELETE FROM party_itinerary WHERE party_id=? AND place_id=?').run(party.id, placeId);
    const ids = rows<{ id: string }>(db.prepare('SELECT id FROM party_itinerary WHERE party_id=? ORDER BY position,created_at').all(party.id));
    ids.forEach((item, index) => db.prepare('UPDATE party_itinerary SET position=? WHERE id=?').run(index, item.id));
  });
  return itinerary(db, userId);
}

export function finishPartyTrip(db: DB, userId: string, now = new Date()): PartyTripSummary {
  const party = requireParty(db, userId);
  if (party.createdBy !== userId) throw new PartyLiveError('NOT_OWNER', 'Only the party owner can end the trip.', 403);
  return transact(db, () => {
    const items = itinerary(db, userId);
    const memberCount = Number(row<{ n: number }>(db.prepare('SELECT COUNT(*) AS n FROM party_members WHERE party_id=? AND left_at IS NULL').get(party.id))?.n ?? 0);
    const messageCount = Number(row<{ n: number }>(db.prepare('SELECT COUNT(*) AS n FROM party_messages WHERE party_id=?').get(party.id))?.n ?? 0);
    const distance = Number(row<{ n: number }>(db.prepare('SELECT COALESCE(SUM(distance_travelled_m),0) AS n FROM party_members WHERE party_id=?').get(party.id))?.n ?? 0);
    const endedAt = now.toISOString(); const route = items.map((i) => ({ placeId: i.placeId, name: i.placeName, position: i.position }));
    db.prepare(`INSERT INTO party_trip_summaries(party_id,party_name,started_at,ended_at,member_count,message_count,itinerary_json,distance_travelled_m)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(party_id) DO UPDATE SET ended_at=excluded.ended_at,member_count=excluded.member_count,
      message_count=excluded.message_count,itinerary_json=excluded.itinerary_json,distance_travelled_m=excluded.distance_travelled_m`)
      .run(party.id, party.name, party.createdAt, endedAt, memberCount, messageCount, JSON.stringify(route), distance);
    db.prepare('DELETE FROM party_locations WHERE party_id=?').run(party.id);
    if (!disbandParty(db, userId, party.id, now)) throw new PartyLiveError('END_FAILED', 'The trip could not be ended.', 409);
    return { partyId: party.id, partyName: party.name, startedAt: party.createdAt, endedAt, memberCount, messageCount, itinerary: route, distanceTravelledM: Math.round(distance) };
  });
}

export function tripSummary(db: DB, userId: string, partyId: string): PartyTripSummary | null {
  const permitted = row(db.prepare('SELECT 1 FROM party_members WHERE party_id=? AND user_id=?').get(partyId, userId));
  if (!permitted) throw new PartyLiveError('NOT_MEMBER', 'This summary belongs to another party.', 403);
  const item = row<{ party_id: string; party_name: string; started_at: string; ended_at: string; member_count: number; message_count: number; itinerary_json: string; distance_travelled_m: number }>(db.prepare('SELECT * FROM party_trip_summaries WHERE party_id=?').get(partyId));
  return item ? { partyId: item.party_id, partyName: item.party_name, startedAt: item.started_at, endedAt: item.ended_at, memberCount: item.member_count, messageCount: item.message_count, itinerary: JSON.parse(item.itinerary_json), distanceTravelledM: Math.round(item.distance_travelled_m) } : null;
}
