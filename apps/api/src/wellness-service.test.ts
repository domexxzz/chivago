import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, type DB } from './db.ts';
import { balanceFor, latestMood, moodHistory, recordMood, UnknownMood } from './wellness-service.ts';

let db: DB;
const NOW = new Date('2026-08-31T06:00:00.000Z');

/** A place the check-in can point at. Balance reads air and crowding from here. */
const place = (id: string, layer: string, aqi = 30, crowd = 0.8) => {
  db.prepare(
    `INSERT INTO places (id, name_en, name_th, short, layer, lat, lng, meta,
       blurb_en, blurb_th, safety_label_en, safety_label_th,
       crowd_density, aqi, safety_index, walkability)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(id, id, id, id, layer, 9.5, 100.0, 'meta', 'en', 'th', 'safe', 'ปลอดภัย',
    crowd, aqi, 8, 8);
};

const checkin = (placeId: string, day: string) => {
  db.prepare(
    `INSERT INTO ledger (id, user_id, label, occurred_at, host, amount, currency, exp, kind, source_ref)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    `l-${placeId}-${day}`, 'u1', 'Checked in', `${day}T03:00:00.000Z`, 'ChivaGo',
    20, 'trip', 20, 'checkin', `checkin:${placeId}:u1:${day}`,
  );
};

const seedThree = () => {
  place('namuang', 'Green', 24, 0.6);
  place('shala', 'Wellness', 28, 0.5);
  place('chaweng', 'Safe', 42, 1.9);
};

beforeEach(() => {
  db = openTestDb();
  // The ledger has a foreign key to users; a check-in belongs to somebody.
  for (const id of ['u1', 'u2']) {
    db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)')
      .run(id, id, NOW.toISOString());
  }
});

describe('mood check-ins', () => {
  test('a mood is appended, never overwritten', () => {
    // The sequence is the point. One overwritten value cannot tell a bad
    // afternoon from a bad week.
    recordMood(db, 'u1', { mood: 'drained' }, new Date('2026-08-30T02:00:00.000Z'));
    recordMood(db, 'u1', { mood: 'bright' }, new Date('2026-08-31T02:00:00.000Z'));
    assert.equal(moodHistory(db, 'u1').length, 2);
    assert.equal(latestMood(db, 'u1')?.mood, 'bright');
  });

  test('a mood the app does not know is refused, not stored', () => {
    assert.throws(() => recordMood(db, 'u1', { mood: 'ecstatic' }), UnknownMood);
    assert.equal(moodHistory(db, 'u1').length, 0);
  });

  test('the note is kept verbatim and never interpreted', () => {
    const m = recordMood(db, 'u1', { mood: 'tense', note: '  ferry was late  ' }, NOW);
    assert.equal(m.note, 'ferry was late');
  });

  test('an empty note is null, not an empty string', () => {
    assert.equal(recordMood(db, 'u1', { mood: 'steady', note: '   ' }, NOW).note, null);
  });

  test('one person cannot read another person\'s moods', () => {
    recordMood(db, 'u1', { mood: 'drained' }, NOW);
    assert.equal(moodHistory(db, 'u2').length, 0);
  });
});

describe('Chiva Balance, from what actually happened', () => {
  test('a trip with nothing in it scores nothing, and says why', () => {
    const b = balanceFor(db, 'u1', NOW);
    assert.equal(b.total, null);
    assert.ok(b.note);
  });

  test('visits come from the ledger, not a second table that could disagree', () => {
    seedThree();
    checkin('namuang', '2026-08-29');
    checkin('shala', '2026-08-30');
    checkin('chaweng', '2026-08-31');
    const b = balanceFor(db, 'u1', NOW);
    assert.ok(b.total !== null, 'three check-ins should be enough to score');
    assert.equal(b.components.length, 5);
  });

  test('a check-in outside the window does not count', () => {
    seedThree();
    checkin('namuang', '2026-08-01');
    checkin('shala', '2026-08-02');
    checkin('chaweng', '2026-08-03');
    assert.equal(balanceFor(db, 'u1', NOW).total, null, 'a trip from three weeks ago is not this trip');
  });

  test('how someone felt moves the number', () => {
    seedThree();
    checkin('namuang', '2026-08-29');
    checkin('shala', '2026-08-30');
    checkin('chaweng', '2026-08-31');
    const before = balanceFor(db, 'u1', NOW).total!;
    recordMood(db, 'u1', { mood: 'drained' }, NOW);
    const after = balanceFor(db, 'u1', NOW).total!;
    assert.ok(after < before, `${after} should be under ${before}`);
  });

  test('the self-reported part is labelled as such', () => {
    seedThree();
    checkin('namuang', '2026-08-29');
    checkin('shala', '2026-08-30');
    checkin('chaweng', '2026-08-31');
    const b = balanceFor(db, 'u1', NOW);
    const rest = b.components.find((c) => c.key === 'rest')!;
    assert.equal(rest.source, 'self-reported');
    assert.equal(b.components.filter((c) => c.source === 'measured').length, 4);
  });

  test('one person\'s trip does not score another\'s', () => {
    checkin('namuang', '2026-08-29');
    checkin('shala', '2026-08-30');
    checkin('chaweng', '2026-08-31');
    assert.equal(balanceFor(db, 'u2', NOW).total, null);
  });
});
