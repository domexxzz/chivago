import { randomUUID } from 'node:crypto';
import type { JournalVisibility, TravelTrip, TravelTripPhoto, TravelTripSummary } from '@chivago/core';
import { blobStore } from './blob-store.ts';
import { row, rows, transact, type DB } from './db.ts';
import { sniff, type PhotoBlob } from './uploads.ts';
import { travelJournalFor } from './travel-event-service.ts';

export class TravelTripError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message); this.name = 'TravelTripError'; this.code = code; this.status = status;
  }
}

interface TripRow {
  id: string; name: string; visibility: JournalVisibility; start_at: string | null; end_at: string | null;
  cover_photo_id: string | null; created_at: string; updated_at: string;
}

const ownedTrip = (db: DB, userId: string, tripId: string): TripRow => {
  const found = row<TripRow>(db.prepare(
    `SELECT id,name,visibility,start_at,end_at,cover_photo_id,created_at,updated_at
     FROM travel_trips WHERE id=? AND user_id=?`,
  ).get(tripId, userId));
  if (!found) throw new TravelTripError('TRIP_NOT_FOUND', 'No such trip.', 404);
  return found;
};

const photosFor = (db: DB, tripId: string): TravelTripPhoto[] => rows<{
  id: string; caption: string | null; sort_order: number; created_at: string;
}>(db.prepare(
  'SELECT id,caption,sort_order,created_at FROM travel_trip_photos WHERE trip_id=? ORDER BY sort_order,created_at,id',
).all(tripId)).map((photo) => ({
  id: photo.id, url: `/travel/photos/${photo.id}`, caption: photo.caption,
  sortOrder: photo.sort_order, createdAt: photo.created_at,
}));

const summaryFor = (db: DB, userId: string, tripId: string, startAt: string | null, endAt: string | null): TravelTripSummary => {
  const base = row<{ places: number; quests: number; stories: number; stamps: number; parties: number }>(db.prepare(
    `SELECT COUNT(DISTINCT j.place_id) AS places,
            COUNT(DISTINCT CASE WHEN e.quest_id IS NOT NULL THEN e.quest_id END) AS quests,
            SUM(CASE WHEN j.kind='story_unlock' THEN 1 ELSE 0 END) AS stories,
            SUM(CASE WHEN e.type='STAMP_EARNED' THEN 1 ELSE 0 END) AS stamps,
            COUNT(DISTINCT e.party_id) AS parties
     FROM travel_trip_entries te
     JOIN travel_journal_entries j ON j.id=te.journal_entry_id AND j.user_id=?
     JOIN travel_events e ON e.id=j.travel_event_id AND e.invalidated_at IS NULL
     WHERE te.trip_id=?`,
  ).get(userId, tripId)) ?? { places: 0, quests: 0, stories: 0, stamps: 0, parties: 0 };
  const petMemories = startAt && endAt ? (row<{ n: number }>(db.prepare(
    `SELECT COUNT(*) AS n FROM pet_memories m JOIN travel_events e ON e.id=m.travel_event_id
     WHERE m.user_id=? AND e.invalidated_at IS NULL AND m.occurred_at BETWEEN ? AND ?`,
  ).get(userId, startAt, endAt))?.n ?? 0) : 0;
  return {
    places: base.places, quests: base.quests, stories: base.stories,
    petMemories, stamps: base.stamps, partyMembers: base.parties,
  };
};

const toTrip = (db: DB, userId: string, found: TripRow): TravelTrip => ({
  id: found.id, name: found.name, visibility: found.visibility, startAt: found.start_at, endAt: found.end_at,
  coverPhotoId: found.cover_photo_id, entries: travelJournalFor(db, userId, 100, found.id),
  photos: photosFor(db, found.id), summary: summaryFor(db, userId, found.id, found.start_at, found.end_at),
  createdAt: found.created_at, updatedAt: found.updated_at,
});

export function travelTripsFor(db: DB, userId: string, limit = 20): TravelTrip[] {
  return rows<TripRow>(db.prepare(
    `SELECT id,name,visibility,start_at,end_at,cover_photo_id,created_at,updated_at
     FROM travel_trips WHERE user_id=? ORDER BY COALESCE(start_at,created_at) DESC,id DESC LIMIT ?`,
  ).all(userId, Math.max(1, Math.min(50, limit)))).map((found) => toTrip(db, userId, found));
}

export const travelTripFor = (db: DB, userId: string, tripId: string): TravelTrip =>
  toTrip(db, userId, ownedTrip(db, userId, tripId));

export function createTravelTrip(db: DB, userId: string, name: unknown, entryIds: unknown): TravelTrip {
  if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 100) {
    throw new TravelTripError('TRIP_NAME_INVALID', 'Trip name must be 1–100 characters.');
  }
  if (!Array.isArray(entryIds) || entryIds.length === 0 || entryIds.length > 100 || entryIds.some((id) => typeof id !== 'string')) {
    throw new TravelTripError('TRIP_ENTRIES_INVALID', 'Choose 1–100 verified journal entries.');
  }
  const unique = [...new Set(entryIds as string[])];
  return transact(db, () => {
    const owned = rows<{ id: string; occurred_at: string }>(db.prepare(
      `SELECT j.id,e.occurred_at FROM travel_journal_entries j
       JOIN travel_events e ON e.id=j.travel_event_id AND e.invalidated_at IS NULL
       WHERE j.user_id=? AND j.id IN (${unique.map(() => '?').join(',')})`,
    ).all(userId, ...unique));
    if (owned.length !== unique.length) throw new TravelTripError('TRIP_ENTRY_FORBIDDEN', 'A selected entry is unavailable.', 403);
    const already = row<{ id: string }>(db.prepare(
      `SELECT journal_entry_id AS id FROM travel_trip_entries WHERE journal_entry_id IN (${unique.map(() => '?').join(',')}) LIMIT 1`,
    ).get(...unique));
    if (already) throw new TravelTripError('TRIP_ENTRY_ASSIGNED', 'A selected entry already belongs to a trip.', 409);
    const timestamps = owned.map((entry) => entry.occurred_at).sort();
    const id = randomUUID(); const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO travel_trips (id,user_id,name,visibility,start_at,end_at,created_at,updated_at)
       VALUES (?,?,?,'private',?,?,?,?)`,
    ).run(id, userId, name.trim(), timestamps[0]!, timestamps.at(-1)!, now, now);
    const insert = db.prepare('INSERT INTO travel_trip_entries (trip_id,journal_entry_id,added_at) VALUES (?,?,?)');
    unique.forEach((entryId) => insert.run(id, entryId, now));
    return travelTripFor(db, userId, id);
  });
}

export function updateTravelTrip(
  db: DB, userId: string, tripId: string,
  patch: { name?: unknown; visibility?: unknown; coverPhotoId?: unknown },
): TravelTrip {
  const current = ownedTrip(db, userId, tripId);
  const name = patch.name === undefined ? current.name : typeof patch.name === 'string' ? patch.name.trim() : '';
  if (name.length < 1 || name.length > 100) throw new TravelTripError('TRIP_NAME_INVALID', 'Trip name must be 1–100 characters.');
  const visibility = patch.visibility === undefined ? current.visibility : patch.visibility;
  if (visibility !== 'private' && visibility !== 'shared') throw new TravelTripError('TRIP_VISIBILITY_INVALID', 'Invalid trip visibility.');
  let cover = patch.coverPhotoId === undefined ? current.cover_photo_id : patch.coverPhotoId;
  if (cover !== null && typeof cover !== 'string') throw new TravelTripError('TRIP_COVER_INVALID', 'Invalid cover photo.');
  if (typeof cover === 'string' && !row(db.prepare('SELECT id FROM travel_trip_photos WHERE id=? AND trip_id=? AND user_id=?').get(cover, tripId, userId))) {
    throw new TravelTripError('TRIP_COVER_FORBIDDEN', 'That photo does not belong to this trip.', 403);
  }
  db.prepare('UPDATE travel_trips SET name=?,visibility=?,cover_photo_id=?,updated_at=? WHERE id=? AND user_id=?')
    .run(name, visibility, cover, new Date().toISOString(), tripId, userId);
  return travelTripFor(db, userId, tripId);
}

export async function addTravelTripPhoto(
  db: DB, userId: string, tripId: string, bytes: Buffer, caption: unknown,
): Promise<TravelTrip> {
  ownedTrip(db, userId, tripId);
  const { mime, ext } = sniff(bytes); const id = randomUUID();
  const path = `travel-journal/${tripId.slice(0, 2)}/${id}.${ext}`;
  await blobStore().put(path, bytes);
  const order = row<{ n: number }>(db.prepare('SELECT COUNT(*) AS n FROM travel_trip_photos WHERE trip_id=?').get(tripId))?.n ?? 0;
  try {
    db.prepare(
      `INSERT INTO travel_trip_photos (id,trip_id,user_id,storage_path,mime_type,byte_size,caption,sort_order,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(id, tripId, userId, path, mime, bytes.length, typeof caption === 'string' ? caption.trim().slice(0, 300) || null : null, order, new Date().toISOString());
  } catch (error) { await blobStore().delete(path); throw error; }
  if (order === 0) db.prepare('UPDATE travel_trips SET cover_photo_id=? WHERE id=?').run(id, tripId);
  return travelTripFor(db, userId, tripId);
}

export async function deleteTravelTripPhoto(db: DB, userId: string, photoId: string): Promise<boolean> {
  const found = row<{ trip_id: string; storage_path: string }>(db.prepare(
    'SELECT trip_id,storage_path FROM travel_trip_photos WHERE id=? AND user_id=?',
  ).get(photoId, userId));
  if (!found) return false;
  db.prepare('DELETE FROM travel_trip_photos WHERE id=? AND user_id=?').run(photoId, userId);
  db.prepare('UPDATE travel_trips SET cover_photo_id=NULL WHERE id=? AND cover_photo_id=?').run(found.trip_id, photoId);
  await blobStore().delete(found.storage_path);
  return true;
}

export async function readTravelTripPhoto(db: DB, userId: string, photoId: string): Promise<PhotoBlob | null> {
  const found = row<{ storage_path: string; mime_type: string }>(db.prepare(
    `SELECT p.storage_path,p.mime_type FROM travel_trip_photos p
     JOIN travel_trips t ON t.id=p.trip_id WHERE p.id=? AND (p.user_id=? OR t.visibility='shared')`,
  ).get(photoId, userId));
  if (!found) return null;
  const bytes = await blobStore().get(found.storage_path);
  return bytes ? { bytes, mime: found.mime_type } : null;
}
