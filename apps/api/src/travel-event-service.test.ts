import { strict as assert } from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { bootstrapKohSichangAdventure } from './adventure-bootstrap.ts';
import { openTestDb, type DB } from './db-node.ts';
import {
  petMemoriesFor, recordCheckinTravelCycle, travelEventsFor, travelJournalFor,
  updateTravelJournalEntry,
} from './travel-event-service.ts';
import { awardCheckin, reverseMovement } from './wallet-service.ts';

let db: DB;
const USER = 'journey-user';
const AT = '2026-11-20T03:00:00.000Z';
const placeIds = [
  'sc-palace', 'sc-atsadang-bridge', 'sc-chong-khao-khat', 'sc-chao-pho-khao-yai', 'sc-thamphang',
];

beforeEach(() => {
  db = openTestDb();
  db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)')
    .run(USER, 'Journey traveller', AT);
  const insert = db.prepare(
    `INSERT INTO places
     (id,name_en,name_th,short,layer,lat,lng,meta,blurb_en,blurb_th,tags,
      safety_label_en,safety_label_th,crowd_density,aqi,safety_index,walkability,photo_url)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  placeIds.forEach((id, index) => insert.run(
    id, `Place ${index + 1}`, `สถานที่ ${index + 1}`, id, 'Quest', 13.15 + index / 1000,
    100.8 + index / 1000, 'Koh Sichang', 'A real place', 'สถานที่จริง', '[]',
    'Use care', 'เดินทางอย่างระมัดระวัง', 1, 20, 8, 7, `/media/places/${id}.jpg`,
  ));
  bootstrapKohSichangAdventure(db);
});

const checkin = (placeId = placeIds[0]!) => awardCheckin(db, {
  userId: USER,
  placeId,
  placeName: placeId,
  points: 10,
  dayKey: '2026-11-20',
  occurredAt: AT,
});

describe('verified travel event cycle', () => {
  test('one standing check-in creates audit events, story, pet memory and private journal entries', () => {
    const movement = checkin();
    const result = recordCheckinTravelCycle(db, {
      userId: USER,
      placeId: placeIds[0]!,
      ledgerSourceRef: movement.entry!.sourceRef,
    });

    assert.deepEqual(result.events.map((event) => event.type), [
      'CHECK_IN_VERIFIED', 'LOCATION_VISITED', 'STORY_UNLOCKED', 'PET_MEMORY_CREATED', 'PET_MEMORY_CREATED',
    ]);
    assert.equal(result.storyNodeIds.length, 1);
    assert.equal(result.petMemories.length, 2);
    assert.deepEqual(new Set(result.petMemories.map((memory) => memory.memoryType)), new Set(['verified_visit', 'story_unlock']));
    assert.equal(result.petMemories[0]?.companionKey, 'water-buffalo');
    const journal = travelJournalFor(db, USER);
    assert.deepEqual(journal.map((entry) => entry.kind).sort(), ['story_unlock', 'verified_visit']);
    assert.ok(journal.every((entry) => entry.visibility === 'private'));
  });

  test('retrying the same source returns the same records and never duplicates consequences', () => {
    const movement = checkin();
    const args = { userId: USER, placeId: placeIds[0]!, ledgerSourceRef: movement.entry!.sourceRef };
    const first = recordCheckinTravelCycle(db, args);
    const second = recordCheckinTravelCycle(db, args);

    assert.deepEqual(second.events.map((event) => event.id), first.events.map((event) => event.id));
    assert.equal(travelEventsFor(db, USER).length, 5);
    assert.equal(petMemoriesFor(db, USER).length, 2);
    assert.equal(travelJournalFor(db, USER).length, 2);
  });

  test('cannot manufacture a journey without a standing ledger source', () => {
    assert.throws(() => recordCheckinTravelCycle(db, {
      userId: USER,
      placeId: placeIds[0]!,
      ledgerSourceRef: `checkin:${placeIds[0]}:user:${USER}:2026-11-20`,
    }), /standing check-in ledger row/);
    assert.equal(travelEventsFor(db, USER).length, 0);
  });

  test('a later place remains a real visit but cannot unlock story out of order', () => {
    const movement = checkin(placeIds[1]);
    const result = recordCheckinTravelCycle(db, {
      userId: USER,
      placeId: placeIds[1]!,
      ledgerSourceRef: movement.entry!.sourceRef,
    });
    assert.equal(result.storyNodeIds.length, 0);
    assert.ok(result.events.some((event) => event.type === 'LOCATION_VISITED'));
    assert.equal(travelJournalFor(db, USER).filter((entry) => entry.kind === 'story_unlock').length, 0);
  });

  test('a ledger reversal preserves audit events but withdraws memory and journal projections', () => {
    const movement = checkin();
    recordCheckinTravelCycle(db, {
      userId: USER,
      placeId: placeIds[0]!,
      ledgerSourceRef: movement.entry!.sourceRef,
    });
    reverseMovement(db, {
      userId: USER,
      originalSourceRef: movement.entry!.sourceRef,
      reason: 'verification withdrawn',
    });

    assert.equal(travelEventsFor(db, USER).length, 5, 'audit history remains');
    assert.ok(travelEventsFor(db, USER).every((event) => event.invalidatedAt !== null));
    assert.equal(petMemoriesFor(db, USER).length, 0);
    assert.equal(travelJournalFor(db, USER).length, 0);
  });

  test('journal notes and sharing can only update an owned verified entry', () => {
    const movement = checkin();
    recordCheckinTravelCycle(db, {
      userId: USER,
      placeId: placeIds[0]!,
      ledgerSourceRef: movement.entry!.sourceRef,
    });
    const entry = travelJournalFor(db, USER)[0]!;
    const updated = updateTravelJournalEntry(db, USER, entry.id, {
      note: 'สิ่งที่ฉันอยากจำจากทริปนี้',
      visibility: 'shared',
    });
    assert.equal(updated?.note, 'สิ่งที่ฉันอยากจำจากทริปนี้');
    assert.equal(updated?.visibility, 'shared');
    assert.equal(updateTravelJournalEntry(db, 'somebody-else', entry.id, { note: 'steal' }), null);
  });
});
