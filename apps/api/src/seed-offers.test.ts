import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { SEED_OFFERS } from '@chivago/core';
import { openTestDb } from './db.ts';
import { insertMissingOffers } from './seed-offers.ts';
import { getShield, listOffers } from './repo.ts';

/**
 * Bringing the seeded offers onto a live database: insert what is missing,
 * touch nothing that is there, and keep the samples labelled as samples.
 */
describe('seed-offers', () => {
  test('an empty database gets every seeded offer', () => {
    const db = openTestDb();
    const r = insertMissingOffers(db);
    assert.equal(r.added.length, SEED_OFFERS.length);
    assert.equal(listOffers(db).length, SEED_OFFERS.length);
  });

  test('an offer that is already there is left exactly as it was', () => {
    const db = openTestDb();
    db.exec(`INSERT INTO offers (id, category, name, merchant, merchant_short, cost_points)
             VALUES ('o1','Café','A merchant''s own edit','Shop','Shop',99)`);
    const r = insertMissingOffers(db);
    assert.ok(!r.added.includes('o1'));
    const o1 = listOffers(db).find((o) => o.id === 'o1')!;
    assert.equal(o1.name, "A merchant's own edit");
    assert.equal(o1.costPoints, 99);
  });

  test('running it twice adds nothing the second time', () => {
    const db = openTestDb();
    insertMissingOffers(db);
    assert.deepEqual(insertMissingOffers(db).added, []);
  });

  test('a sample offer comes back marked as one, and a real one does not', () => {
    const db = openTestDb();
    insertMissingOffers(db);
    const offers = listOffers(db);
    const samples = SEED_OFFERS.filter((o) => o.example).map((o) => o.id);
    assert.ok(samples.length > 0, 'the seed has samples to test');
    for (const o of offers) assert.equal(o.example === true, samples.includes(o.id), o.id);
  });
});

describe('the anti-scam count on the safety screen', () => {
  test('counts real merchants only - a sample offer is not a verified merchant', () => {
    const db = openTestDb();
    insertMissingOffers(db);
    const real = SEED_OFFERS.filter((o) => o.available && !o.example).length;
    const note = getShield(db, 'nobody').find((s) => s.key === 'antiScam')!.note.en;
    assert.match(note, new RegExp(`^${real} QR merchants verified`), note);
  });
});
