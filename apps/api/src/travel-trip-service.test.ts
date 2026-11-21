import { strict as assert } from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { bootstrapKohSichangAdventure } from './adventure-bootstrap.ts';
import { setBlobStore, type BlobStore } from './blob-store.ts';
import { openTestDb, type DB } from './db-node.ts';
import { travelJournalFor } from './travel-event-service.ts';
import {
  TravelTripError, addTravelTripPhoto, createTravelTrip, deleteTravelTripPhoto,
  readTravelTripPhoto, updateTravelTrip,
} from './travel-trip-service.ts';
import { awardCheckin } from './wallet-service.ts';
import { recordCheckinTravelCycle } from './travel-event-service.ts';

let db: DB;
const USER = 'trip-user'; const OTHER = 'other-user'; const PLACE = 'sc-palace';
const blobs = new Map<string, Uint8Array>();
const store: BlobStore = {
  async put(key, bytes) { blobs.set(key, bytes); },
  async get(key) { return blobs.get(key) ?? null; },
  async delete(key) { blobs.delete(key); },
};

beforeEach(() => {
  blobs.clear(); setBlobStore(store); db = openTestDb();
  db.prepare('INSERT INTO users (id,display_name,created_at) VALUES (?,?,?)').run(USER, 'Trip traveller', '2026-11-20T00:00:00Z');
  db.prepare('INSERT INTO users (id,display_name,created_at) VALUES (?,?,?)').run(OTHER, 'Other', '2026-11-20T00:00:00Z');
  db.prepare(
    `INSERT INTO places (id,name_en,name_th,short,layer,lat,lng,meta,blurb_en,blurb_th,tags,
     safety_label_en,safety_label_th,crowd_density,aqi,safety_index,walkability)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(PLACE, 'Palace', 'พระราชวัง', 'palace', 'Quest', 13.15, 100.8, 'Koh Sichang', 'Real', 'จริง', '[]', 'Care', 'ระวัง', 1, 20, 8, 7);
  bootstrapKohSichangAdventure(db);
  for (const [dayKey, occurredAt] of [['2026-11-19', '2026-11-19T03:00:00Z'], ['2026-11-20', '2026-11-20T03:00:00Z']] as const) {
    const movement = awardCheckin(db, { userId: USER, placeId: PLACE, placeName: 'Palace', points: 0, dayKey, occurredAt });
    recordCheckinTravelCycle(db, { userId: USER, placeId: PLACE, ledgerSourceRef: movement.entry!.sourceRef });
  }
});

describe('Travel trips', () => {
  test('groups only owned verified entries and derives its dates and summary', () => {
    const entries = travelJournalFor(db, USER, 100);
    const trip = createTravelTrip(db, USER, 'เกาะสีชังครั้งแรก', entries.map((entry) => entry.id));
    assert.equal(trip.visibility, 'private');
    assert.equal(trip.entries.length, entries.length);
    assert.equal(trip.summary.places, 1);
    assert.equal(trip.summary.stories, entries.filter((entry) => entry.kind === 'story_unlock').length);
    assert.ok(trip.summary.petMemories >= 2);
    assert.equal(updateTravelTrip(db, USER, trip.id, { visibility: 'shared' }).visibility, 'shared');
    assert.throws(() => createTravelTrip(db, USER, 'duplicate', [entries[0]!.id]),
      (error: unknown) => error instanceof TravelTripError && error.code === 'TRIP_ENTRY_ASSIGNED');
    assert.throws(() => updateTravelTrip(db, OTHER, trip.id, { name: 'stolen' }),
      (error: unknown) => error instanceof TravelTripError && error.code === 'TRIP_NOT_FOUND');
  });

  test('stores bytes in the existing adapter and enforces photo ownership', async () => {
    const trip = createTravelTrip(db, USER, 'Photo trip', [travelJournalFor(db, USER, 100)[0]!.id]);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const withPhoto = await addTravelTripPhoto(db, USER, trip.id, png, 'ริมทะเล');
    const photo = withPhoto.photos[0]!;
    assert.equal(withPhoto.coverPhotoId, photo.id);
    assert.equal((await readTravelTripPhoto(db, USER, photo.id))?.mime, 'image/png');
    assert.equal(await readTravelTripPhoto(db, OTHER, photo.id), null);
    assert.equal(await deleteTravelTripPhoto(db, OTHER, photo.id), false);
    assert.equal(await deleteTravelTripPhoto(db, USER, photo.id), true);
    assert.equal(blobs.size, 0);
  });
});
