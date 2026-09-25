import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, type DB } from './db.ts';
import { companionsFor } from '@chivago/core';
import {
  balanceFor, habitatEvidenceFor, latestMood, moodHistory, provinceEvidenceFor,
  recordMood, UnknownMood,
} from './wellness-service.ts';
import {
  awardQuestReward, awardWalk, ensureWallet, reverseMovement,
} from './wallet-service.ts';

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
  place('lamai', 'Wellness', 28, 0.5);
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
    checkin('lamai', '2026-08-30');
    checkin('chaweng', '2026-08-31');
    const b = balanceFor(db, 'u1', NOW);
    assert.ok(b.total !== null, 'three check-ins should be enough to score');
    assert.equal(b.components.length, 5);
  });

  test('a check-in outside the window does not count', () => {
    seedThree();
    checkin('namuang', '2026-08-01');
    checkin('lamai', '2026-08-02');
    checkin('chaweng', '2026-08-03');
    assert.equal(balanceFor(db, 'u1', NOW).total, null, 'a trip from three weeks ago is not this trip');
  });

  test('how someone felt moves the number', () => {
    seedThree();
    checkin('namuang', '2026-08-29');
    checkin('lamai', '2026-08-30');
    checkin('chaweng', '2026-08-31');
    const before = balanceFor(db, 'u1', NOW).total!;
    recordMood(db, 'u1', { mood: 'drained' }, NOW);
    const after = balanceFor(db, 'u1', NOW).total!;
    assert.ok(after < before, `${after} should be under ${before}`);
  });

  test('the self-reported part is labelled as such', () => {
    seedThree();
    checkin('namuang', '2026-08-29');
    checkin('lamai', '2026-08-30');
    checkin('chaweng', '2026-08-31');
    const b = balanceFor(db, 'u1', NOW);
    const rest = b.components.find((c) => c.key === 'rest')!;
    assert.equal(rest.source, 'self-reported');
    assert.equal(b.components.filter((c) => c.source === 'measured').length, 4);
  });

  test('one person\'s trip does not score another\'s', () => {
    checkin('namuang', '2026-08-29');
    checkin('lamai', '2026-08-30');
    checkin('chaweng', '2026-08-31');
    assert.equal(balanceFor(db, 'u2', NOW).total, null);
  });
});

/**
 * The evidence behind the companion collection.
 *
 * Read from the ledger like everything else, so these tests write ledger rows
 * and ask what the query makes of them - never a companions table, which does
 * not exist and must not start existing.
 */
describe('habitat evidence, counted in island days', () => {
  const found = (layer: string) =>
    habitatEvidenceFor(db, 'u1').find((e) => e.layer === layer);

  test('one check-in is one day', () => {
    place('namuang', 'Green');
    checkin('namuang', '2026-08-29');
    assert.equal(found('Green')?.visitDays, 1);
  });

  test('coming back to the same place on another day counts twice', () => {
    // This is the whole fix. The island has one place per habitat, so if a
    // return visit did not count, no egg could ever hatch.
    place('namuang', 'Green');
    checkin('namuang', '2026-08-29');
    checkin('namuang', '2026-08-30');
    assert.equal(found('Green')?.visitDays, 2);
  });

  test('two places in one habitat on one day is still one day', () => {
    // The anti-loitering rule, unchanged in intent: a day out is a day out,
    // however many stops it had.
    place('namuang', 'Green');
    place('secret-falls', 'Green');
    checkin('namuang', '2026-08-29');
    checkin('secret-falls', '2026-08-29');
    assert.equal(found('Green')?.visitDays, 1);
  });

  test('habitats are counted apart from each other', () => {
    place('namuang', 'Green');
    place('chaweng', 'Safe');
    checkin('namuang', '2026-08-29');
    checkin('chaweng', '2026-08-29');
    checkin('chaweng', '2026-08-30');
    assert.equal(found('Green')?.visitDays, 1);
    assert.equal(found('Safe')?.visitDays, 2);
  });

  test('somebody else\'s days are not yours', () => {
    place('namuang', 'Green');
    checkin('namuang', '2026-08-29');
    db.prepare(
      `INSERT INTO ledger (id, user_id, label, occurred_at, host, amount, currency, exp, kind, source_ref)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run('l-u2', 'u2', 'Checked in', '2026-08-30T03:00:00.000Z', 'ChivaGo',
      20, 'trip', 20, 'checkin', 'checkin:namuang:u2:2026-08-30');
    assert.equal(found('Green')?.visitDays, 1);
  });

  test('a habitat nobody has been to does not appear at all', () => {
    place('namuang', 'Green');
    place('chaweng', 'Safe');
    checkin('namuang', '2026-08-29');
    assert.equal(found('Safe'), undefined, 'an absent habitat is absent, not zero');
  });

  /*
    The one-day event.

    The hackathon on 11 September is a single day, and at KU Sriracha only two
    of the five habitats have a quest a host could verify — so Safe, Food and
    Wellness could reach nothing past `egg` while telling every attendee to
    come back tomorrow. A measured walk leg is the same-day way out.
  */
  test('a walked leg hatches the egg on a single day', () => {
    place('namuang', 'Green');
    checkin('namuang', '2026-09-11');
    db.prepare(
      `INSERT INTO ledger (id, user_id, label, occurred_at, host, amount, kind, currency, source_ref)
       VALUES ('l-walk-1', 'u1', 'Walked leg', '2026-09-11T04:00:00.000Z', 'ChivaGo', 20,
               'walk', 'trip', 'walk:namuang:chaweng:user:u1:2026-09-11')`,
    ).run();

    const companion = companionsFor(habitatEvidenceFor(db, 'u1'))
      .find((c) => c.species.layer === 'Green');
    assert.equal(companion?.stage, 'hatchling', 'one day plus one walked leg must hatch it');
  });

  test('a check-in alone on one day is still only an egg', () => {
    // The walk is the second signal, not a replacement for the first: standing
    // somewhere once still buys exactly what it always did.
    place('namuang', 'Green');
    checkin('namuang', '2026-09-11');
    const companion = companionsFor(habitatEvidenceFor(db, 'u1'))
      .find((c) => c.species.layer === 'Green');
    assert.equal(companion?.stage, 'egg');
  });

  test('two days at one place hatches the egg end to end', () => {
    // The query, the threshold and the stage rule together, on the island as
    // it is actually seeded: one place in the habitat, visited twice.
    place('namuang', 'Green');
    checkin('namuang', '2026-08-29');
    checkin('namuang', '2026-08-30');
    const companion = companionsFor(habitatEvidenceFor(db, 'u1'))
      .find((c) => c.species.layer === 'Green');
    assert.equal(companion?.stage, 'hatchling');
  });
});

describe('erasure actually erases', () => {
  test('deleting a user takes their mood history with them', () => {
    // PDPA. `mood_checkins` shipped with no foreign key while every other
    // user-owned table cascaded, so DELETE /profile removed the wallet, the
    // ledger and the emergency contacts — and left behind how somebody said
    // they felt, free-text note included, still keyed to the deleted id.
    const db = openTestDb();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)')
      .run('ana', 'Ana', now);
    db.prepare('INSERT INTO mood_checkins (id, user_id, mood, note, at) VALUES (?,?,?,?,?)')
      .run('m1', 'ana', 'anxious', 'felt unwell after the boat', now);

    db.prepare('DELETE FROM users WHERE id = ?').run('ana');

    const left = db.prepare('SELECT COUNT(*) AS c FROM mood_checkins').get() as { c: number };
    assert.equal(left.c, 0, 'a deleted traveller kept a record of how they felt');
  });

  test('the index survived the table being rebuilt', () => {
    // The migration drops and recreates the table. An index quietly lost in a
    // rebuild is a slow query nobody attributes to a migration months later.
    const db = openTestDb();
    const idx = db.prepare(
      "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='index' AND name='idx_mood_user_at'",
    ).get() as { c: number };
    assert.equal(idx.c, 1);
  });
});

/**
 * A province mascot grows on verified work, so withdrawn work must not grow it.
 *
 * `provinceEvidenceFor` feeds `GET /passport`, and `provinceLevelFor` in core
 * turns `questsVerified` into the level of that province's animal. A level is
 * the most visible claim in the game layer — it is printed beside the mascot
 * on `PassportScreen` and again on the seventy-seven — and a level standing on
 * a quest a host withdrew is the game asserting something the ledger stopped
 * saying.
 *
 * Awarded and unwound through the real functions, so the day `reverseMovement`
 * changes how it writes, this fails instead of passing on a fiction.
 */
describe('a province mascot does not grow on work that was taken back', () => {
  const HOST = 'h-surat';
  const SITE = { lat: 9.132, lng: 99.333 };

  const provinceSite = (placeId: string, province: string) => {
    db.prepare(
      `INSERT INTO places (id, name_en, name_th, short, layer, province, lat, lng, meta,
         blurb_en, blurb_th, safety_label_en, safety_label_th,
         crowd_density, aqi, safety_index, walkability)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(placeId, placeId, placeId, placeId, 'Green', province, SITE.lat, SITE.lng,
      'meta', 'en', 'th', 'safe', 'ปลอดภัย', 0.5, 24, 8, 8);
    db.prepare('INSERT OR IGNORE INTO hosts (id, name, type) VALUES (?,?,?)')
      .run(HOST, 'Surat team', 'community');
  };

  const quest = (questId: string) =>
    db.prepare(
      `INSERT INTO quests (id, code, name_en, name_th, where_label, duration, reward_points,
         host_id, kind, lat, lng, geofence_radius_m)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(questId, questId.toUpperCase(), questId, questId, 'Ban Na San', '1 hr', 40,
      HOST, 'today', SITE.lat, SITE.lng, 250);

  const award = (questId: string) => awardQuestReward(db, {
    userId: 'u1', questId, questName: questId, host: 'Surat team', points: 40, currency: 'green',
  });
  const takeBack = (questId: string) => reverseMovement(db, {
    userId: 'u1', originalSourceRef: `quest:${questId}:user:u1`,
    reason: 'proof was not what it claimed',
  });
  const verifiedIn = (province: string) =>
    provinceEvidenceFor(db, 'u1').find((e) => e.code === province)?.questsVerified ?? 0;

  test('a withdrawn quest stops counting towards the province', () => {
    provinceSite('bannasan', 'TH-84');
    quest('q1');
    quest('q2');
    ensureWallet(db, 'u1');
    award('q1');
    award('q2');
    assert.equal(verifiedIn('TH-84'), 2);

    takeBack('q1');
    assert.equal(verifiedIn('TH-84'), 1, 'the mascot kept a level it no longer had the work for');
  });

  test('a province whose only quest was withdrawn drops to zero, not out of the list', () => {
    // The row survives because the check-in half of this function is
    // untouched: somebody who stood there still stood there. What goes is the
    // claim about work, which is the only thing a level is built on.
    provinceSite('bannasan', 'TH-84');
    quest('q1');
    ensureWallet(db, 'u1');
    award('q1');
    checkin('bannasan', '2026-08-30');
    takeBack('q1');

    const evidence = provinceEvidenceFor(db, 'u1').find((e) => e.code === 'TH-84');
    assert.ok(evidence, 'the province vanished from the passport');
    assert.equal(evidence.questsVerified, 0);
    assert.equal(evidence.visitDays, 1, 'the visit was thrown away with the quest');
  });

  test('one province’s reversal leaves another province alone', () => {
    provinceSite('bannasan', 'TH-84');
    quest('q1');
    ensureWallet(db, 'u1');
    award('q1');

    // A second province, at its own coordinates.
    db.prepare(
      `INSERT INTO places (id, name_en, name_th, short, layer, province, lat, lng, meta,
         blurb_en, blurb_th, safety_label_en, safety_label_th,
         crowd_density, aqi, safety_index, walkability)
       VALUES ('sriracha','sriracha','sriracha','sriracha','Green','TH-20',13.12,100.92,
               'meta','en','th','safe','ปลอดภัย',0.5,24,8,8)`,
    ).run();
    db.prepare(
      `INSERT INTO quests (id, code, name_en, name_th, where_label, duration, reward_points,
         host_id, kind, lat, lng, geofence_radius_m)
       VALUES ('q9','Q9','q9','q9','Si Racha','1 hr',40,?,'today',13.12,100.92,250)`,
    ).run(HOST);
    award('q9');

    takeBack('q1');
    assert.equal(verifiedIn('TH-84'), 0);
    assert.equal(verifiedIn('TH-20'), 1, 'a reversal in one province emptied another');
  });
});

/**
 * A companion that hatched on a walk somebody took back.
 *
 * `habitatEvidenceFor` feeds `GET /companions`, which `HomeScreen` and
 * `GameScreen` both open on. Two thresholds in `packages/core/src/companions.ts`
 * sit on it and both are ONE: a single measured leg hatches an egg
 * (`walkedLegs >= 1`), and a single verified quest grows the creature
 * (`questsVerified > 0`).
 *
 * That is what makes this the sharpest of the seven. Elsewhere a reversal
 * moves a number by one. Here it is the difference between a companion
 * existing and not — so the walk is filtered in SQL rather than counted in JS
 * and corrected afterwards.
 */
describe('a companion does not hatch or grow on work that was taken back', () => {
  const walk = (from: string, to: string, day: string) => awardWalk(db, {
    userId: 'u1', fromId: from, fromName: from, toId: to, toName: to,
    points: 30, dayKey: day, occurredAt: `${day}T04:00:00.000Z`,
  });
  const takeBackWalk = (from: string, to: string, day: string) => reverseMovement(db, {
    userId: 'u1', originalSourceRef: `walk:${from}:${to}:user:u1:${day}`,
    reason: 'the trace was not a walk',
  });
  const legsIn = (layer: string) =>
    habitatEvidenceFor(db, 'u1').find((h) => h.layer === layer)?.walkedLegs ?? 0;

  test('a withdrawn leg un-hatches the egg it hatched', () => {
    // The one that would have been noticed last and mattered most: a creature
    // on the home screen with nothing behind it.
    seedThree();
    ensureWallet(db, 'u1');
    walk('namuang', 'lamai', '2026-08-30');
    assert.equal(legsIn('Green'), 1, 'the leg did not count in the first place');

    takeBackWalk('namuang', 'lamai', '2026-08-30');
    assert.equal(legsIn('Green'), 0, 'the egg stayed hatched on a walk that was taken back');
  });

  test('a leg counts at both ends, and stops counting at both', () => {
    // `walk:<from>:<to>` is read at both habitats, so a reversal that only
    // reached one end would leave the creature standing in the other.
    seedThree();
    ensureWallet(db, 'u1');
    walk('namuang', 'lamai', '2026-08-30');
    assert.deepEqual([legsIn('Green'), legsIn('Wellness')], [1, 1]);

    takeBackWalk('namuang', 'lamai', '2026-08-30');
    assert.deepEqual([legsIn('Green'), legsIn('Wellness')], [0, 0]);
  });

  test('one withdrawn leg does not take the others with it', () => {
    seedThree();
    ensureWallet(db, 'u1');
    walk('namuang', 'lamai', '2026-08-30');
    walk('namuang', 'chaweng', '2026-08-31');
    assert.equal(legsIn('Green'), 2);

    takeBackWalk('namuang', 'lamai', '2026-08-30');
    assert.equal(legsIn('Green'), 1);
    assert.equal(legsIn('Safe'), 1, 'an untouched leg was dropped');
    assert.equal(legsIn('Wellness'), 0);
  });

  test('a withdrawn quest stops growing the creature', () => {
    seedThree();
    ensureWallet(db, 'u1');
    db.prepare('INSERT OR IGNORE INTO hosts (id, name, type) VALUES (?,?,?)')
      .run('h-samui', 'Samui team', 'community');
    db.prepare(
      `INSERT INTO quests (id, code, name_en, name_th, where_label, duration, reward_points,
         host_id, kind, lat, lng, geofence_radius_m)
       VALUES ('q1','Q1','q1','q1','Na Muang','1 hr',40,'h-samui','today',9.5,100.0,250)`,
    ).run();
    awardQuestReward(db, {
      userId: 'u1', questId: 'q1', questName: 'q1', host: 'Samui team',
      points: 40, currency: 'green',
    });
    const grown = () =>
      habitatEvidenceFor(db, 'u1').find((h) => h.layer === 'Green')?.questsVerified ?? 0;
    assert.equal(grown(), 1);

    reverseMovement(db, {
      userId: 'u1', originalSourceRef: 'quest:q1:user:u1', reason: 'proof was not what it claimed',
    });
    assert.equal(grown(), 0, 'the creature kept growing on a quest that was withdrawn');
  });

  test('a check-in is not a walk, and is left where it is', () => {
    // The third read in this function counts check-ins, and it stays as it
    // was: that is #58's question, and the passport has to answer it the same
    // way or the two will disagree about the same person. Locked so the
    // untouched half is a decision rather than an oversight.
    seedThree();
    ensureWallet(db, 'u1');
    walk('namuang', 'lamai', '2026-08-30');
    checkin('namuang', '2026-08-29');
    takeBackWalk('namuang', 'lamai', '2026-08-30');

    const green = habitatEvidenceFor(db, 'u1').find((h) => h.layer === 'Green')!;
    assert.equal(green.walkedLegs, 0);
    assert.equal(green.visitDays, 1, 'the visit went with the walk');
  });
});
