import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACCEPTS_LABEL,
  DROP_OFF_POINTS,
  DROP_OFF_QUEST_GREEN,
  DROP_OFF_QUEST_MINUTES,
  dropOffDistanceLabel,
  dropOffQuest,
  dropOffQuests,
  dropOffsNearest,
  type DropOffPoint,
} from './drop-off.ts';
import { QUEST_RADIUS_MAX_M } from './presence.ts';
import { SEED_PLACES } from './seed.ts';

/*
  A point that exists only here, so the tests describe the shape without
  asserting that any particular bin is on the island. The day a real one is
  seeded these tests keep passing and the ones over `DROP_OFF_POINTS` start
  carrying weight.
*/
const SAMPLE: DropOffPoint = {
  id: 'do-sample',
  name: { en: 'Sample point', th: 'จุดตัวอย่าง', zh: '示例点' },
  where: { en: 'Tha Lang pier', th: 'ท่าล่าง', zh: '塔朗码头' },
  lat: 13.161443,
  lng: 100.810441,
  host: { id: 'h-sample', name: 'Sample host', type: 'community' },
  accepts: ['plastic', 'can'],
  hours: '08:00-17:00',
  source: 'sample, for tests only',
};

test('ships empty, because no shop on the island has agreed to be one yet', () => {
  assert.equal(DROP_OFF_POINTS.length, 0);
});

test('no drop-off points means no drop-off quests', () => {
  assert.deepEqual(dropOffQuests(), []);
});

test('every seeded point carries a source somebody can be asked about', () => {
  for (const point of DROP_OFF_POINTS) {
    assert.ok(point.source.trim().length > 0, `${point.id}: no source`);
    assert.ok(point.host.name.trim().length > 0, `${point.id}: no named host`);
    assert.ok(point.accepts.length > 0, `${point.id}: says nothing about what it takes`);
  }
});

test('a drop-off point is not a place, so it cannot be checked in at for points', () => {
  const placeIds = new Set(SEED_PLACES.map((p) => p.id));
  for (const point of DROP_OFF_POINTS) {
    assert.ok(!placeIds.has(point.id), `${point.id} is also a place - a bin would pay check-in points`);
  }
});

test('the quest is fifteen minutes, in digits and English, so ESG hours parse', () => {
  const quest = dropOffQuest(SAMPLE, 0);
  assert.equal(quest.duration.en, '15 min');
  assert.match(quest.duration.en, /^\d+ min$/);
  assert.equal(DROP_OFF_QUEST_MINUTES, 15);
});

test('the quest pays green, inside the rate the seeded island quests already use', () => {
  const quest = dropOffQuest(SAMPLE, 0);
  assert.equal(quest.rewardCurrency, 'green');
  assert.equal(quest.rewardPoints, DROP_OFF_QUEST_GREEN);
  const perMinute = DROP_OFF_QUEST_GREEN / DROP_OFF_QUEST_MINUTES;
  // 90 green / 30 min and 120 green / 45 min are the two seeded rates.
  assert.ok(perMinute <= 3 && perMinute >= 120 / 45, `${perMinute} green a minute is outside the seeded band`);
});

test('the quest reports under the environmental pillar and sits on the point', () => {
  const quest = dropOffQuest(SAMPLE, 0);
  assert.equal(quest.esgPillar, 'environmental');
  assert.equal(quest.lat, SAMPLE.lat);
  assert.equal(quest.lng, SAMPLE.lng);
  assert.equal(quest.geofenceRadiusM, QUEST_RADIUS_MAX_M);
  assert.equal(quest.host, SAMPLE.host);
});

test('the code is positional, so a point and its quest cannot drift apart', () => {
  assert.equal(dropOffQuest(SAMPLE, 0).code, 'DO-01');
  assert.equal(dropOffQuest(SAMPLE, 9).code, 'DO-10');
});

test('metres under a kilometre, rounded to ten, because the fix does not know the last digit', () => {
  assert.equal(dropOffDistanceLabel(183).en, '180 m');
  assert.equal(dropOffDistanceLabel(4).en, '10 m');
  assert.equal(dropOffDistanceLabel(1_500).en, '1.5 km');
  // 999 rounds to 1000, which is a kilometre spelled the long way.
  assert.equal(dropOffDistanceLabel(999).en, '1.0 km');
});

test('the distance label is readable in all three languages', () => {
  const label = dropOffDistanceLabel(200);
  for (const key of ['en', 'th', 'zh'] as const) {
    const text = label[key];
    assert.ok(text != null && text.length > 0, `${key} missing`);
  }
});

test('every accepts key has a label in all three languages', () => {
  for (const [key, label] of Object.entries(ACCEPTS_LABEL)) {
    for (const lang of ['en', 'th', 'zh'] as const) {
      const text = label[lang];
      assert.ok(text != null && text.trim().length > 0, `${key}.${lang} missing`);
    }
  }
});

test('with no position the list keeps its own order rather than inventing one', () => {
  const far: DropOffPoint = { ...SAMPLE, id: 'do-far', lat: 13.2, lng: 100.9 };
  const given = [far, SAMPLE];
  assert.deepEqual(dropOffsNearest(null, given).map((p) => p.id), ['do-far', 'do-sample']);
});

test('with a position the nearest point comes first', () => {
  const far: DropOffPoint = { ...SAMPLE, id: 'do-far', lat: 13.2, lng: 100.9 };
  const here = { lat: 13.1615, lng: 100.8105 };
  assert.deepEqual(dropOffsNearest(here, [far, SAMPLE]).map((p) => p.id), ['do-sample', 'do-far']);
});

test('sorting does not mutate the seeded list', () => {
  const given = [SAMPLE];
  const sorted = dropOffsNearest({ lat: 13.1, lng: 100.8 }, given);
  assert.notEqual(sorted, given);
});
