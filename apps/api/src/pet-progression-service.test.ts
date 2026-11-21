import { strict as assert } from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { openTestDb, type DB } from './db-node.ts';
import { recordCheckinTravelCycle } from './travel-event-service.ts';
import { awardCheckin } from './wallet-service.ts';
import {
  PetProgressionError, petProgressionForUser, selectPetGesture,
} from './pet-progression-service.ts';

let db: DB;
const USER = 'pet-user';
const PLACE = 'pet-place';
const AT = '2026-11-20T07:00:00.000Z';

beforeEach(() => {
  db = openTestDb();
  db.prepare('INSERT INTO users (id,display_name,created_at) VALUES (?,?,?)').run(USER, 'Pet traveller', AT);
  db.prepare(
    `INSERT INTO places (id,name_en,name_th,short,layer,lat,lng,meta,blurb_en,blurb_th,tags,
     safety_label_en,safety_label_th,crowd_density,aqi,safety_index,walkability)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(PLACE, 'Pet field', 'ทุ่งเพื่อนร่วมทาง', 'field', 'Quest', 13.15, 100.8, 'Koh Sichang',
    'Real place', 'สถานที่จริง', '[]', 'Care', 'ระวัง', 1, 20, 8, 7);
  const movement = awardCheckin(db, {
    userId: USER, placeId: PLACE, placeName: 'Pet field', points: 0,
    dayKey: '2026-11-20', occurredAt: AT,
  });
  recordCheckinTravelCycle(db, { userId: USER, placeId: PLACE, ledgerSourceRef: movement.entry!.sourceRef });
});

describe('Pet progression service', () => {
  test('derives EXP from verified memories and stores only an unlocked presentation preference', () => {
    const initial = petProgressionForUser(db, USER, 'water-buffalo');
    assert.equal(initial.progression.exp, 20);
    assert.equal(initial.selectedGesture, 'happy');
    const selected = selectPetGesture(db, USER, 'water-buffalo', 'curious');
    assert.equal(selected.selectedGesture, 'curious');
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM pet_preferences').get() as { n: number }).n, 1);
  });

  test('cannot select a locked gesture or a companion another user has not discovered', () => {
    assert.throws(() => selectPetGesture(db, USER, 'water-buffalo', 'celebrate'),
      (error: unknown) => error instanceof PetProgressionError && error.code === 'GESTURE_LOCKED');
    db.prepare('INSERT INTO users (id,display_name,created_at) VALUES (?,?,?)').run('stranger', 'Stranger', AT);
    assert.throws(() => petProgressionForUser(db, 'stranger', 'water-buffalo'),
      (error: unknown) => error instanceof PetProgressionError && error.code === 'PET_NOT_FOUND');
  });
});
