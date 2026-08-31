import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { computeHealthyScore } from './healthy-score.ts';
import { SEED_PLACES } from './seed.ts';
import { ENERGY_KM, distanceKm, planDay } from './trip-planner.ts';
import { WALK_LIMIT_KM } from './smart-route.ts';
import type { Quest, ScoredPlace, WellnessProfile } from './types.ts';

const scored = (): ScoredPlace[] => SEED_PLACES.map((p) => {
  const breakdown = computeHealthyScore(p.metrics);
  return {
    ...p, healthyScore: breakdown.total, breakdown,
    reviews: { count: 0, average: null, distribution: [0, 0, 0, 0, 0] },
  };
});

const profile = (over: Partial<WellnessProfile> = {}): WellnessProfile => ({
  purposes: [], activity: 'moderate', watch: [], completedAt: '2026-08-31T00:00:00.000Z', ...over,
});

const quest = (over: Partial<Quest> = {}): Quest => ({
  id: 'q1', code: 'BC-04',
  name: { en: 'Beach Cleanup', th: 'เก็บขยะชายหาด' },
  where: 'Chaweng Beach', duration: '45 min',
  rewardPoints: 150, rewardCurrency: 'green',
  host: { id: 'h1', name: 'Samui Municipality', type: 'municipality' },
  kind: 'today', lat: 9.5357, lng: 100.0617, geofenceRadiusM: 250,
  ...over,
});

describe('the trip planner', () => {
  test('it plans a real day from real places', () => {
    const plan = planDay({ profile: profile(), places: scored(), quests: [] });
    assert.ok(plan.items.length >= 2, 'a day with one stop is not a plan');
    assert.ok(plan.items.every((i) => /^\d{2}:\d{2}$/.test(i.time)), 'every stop has a clock time');
    assert.ok(plan.items[0]!.time >= '06:30', 'the island day starts early, not at midnight');
  });

  test('every item says WHY, in both languages', () => {
    // The whole claim of this planner is that it can be argued with. An item
    // with no reason is an item nobody can correct.
    const plan = planDay({ profile: profile(), places: scored(), quests: [quest()] });
    for (const item of plan.items) {
      assert.ok(item.why.en.length > 12, `${item.name.en} has no English reason`);
      assert.ok(item.why.th.length > 8, `${item.name.en} has no Thai reason`);
      assert.notEqual(item.why.en, item.why.th, 'one language substituted for two');
    }
  });

  test('a gentle day never walks a full day\'s distance', () => {
    const gentle = planDay({ profile: profile({ activity: 'gentle' }), places: scored(), quests: [] });
    const full = planDay({ profile: profile({ activity: 'full' }), places: scored(), quests: [] });
    assert.ok(gentle.walkingKm <= ENERGY_KM.gentle, `gentle walked ${gentle.walkingKm} km`);
    assert.ok(full.walkingKm <= ENERGY_KM.full);
    assert.ok(gentle.walkingKm <= full.walkingKm, 'gentle must not out-walk full');
  });

  test('two travellers asking for the same island get different days', () => {
    // If the profile does not change the plan, the profile is decoration.
    const nature = planDay({ profile: profile({ purposes: ['nature'] }), places: scored(), quests: [] });
    const food = planDay({ profile: profile({ purposes: ['food'] }), places: scored(), quests: [] });
    assert.notDeepEqual(
      nature.items.map((i) => i.placeId),
      food.items.map((i) => i.placeId),
    );
  });

  test('what it drops, it says out loud', () => {
    // Silence about a dropped place is indistinguishable from not knowing
    // about it. Someone who asked us to watch the air must be told when the
    // air is why they are not going somewhere.
    const smoggy = scored().map((p) => ({ ...p, metrics: { ...p.metrics, aqi: 140 } }));
    const plan = planDay({ profile: profile({ watch: ['air'] }), places: smoggy, quests: [] });
    assert.ok(plan.dropped.length > 0, 'a day of bad air dropped nothing');
    assert.match(plan.dropped[0]!.reason.en, /AQI/);
    assert.ok(plan.dropped[0]!.reason.th.length > 8, 'the reason must reach a Thai reader too');
  });

  test('a quest is only offered where the traveller already is', () => {
    // The point of the quest layer is that doing good is convenient. A quest
    // 12 km off the route is a chore, not a nudge.
    const plan = planDay({ profile: profile(), places: scored(), quests: [quest()] });
    const questItem = plan.items.find((i) => i.questId);
    if (questItem) {
      const stops = plan.items.filter((i) => i.kind !== 'transit');
      const before = stops[stops.indexOf(questItem) - 1];
      assert.ok(before?.placeId, 'a quest must follow a place, not open the day');
      const place = scored().find((p) => p.id === before!.placeId)!;
      assert.ok(distanceKm(place, quest()) < 1.5, 'the quest was not near the stop before it');
    }
  });

  test('nothing is scheduled twice', () => {
    const plan = planDay({ profile: profile(), places: scored(), quests: [quest()] });
    // Transit legs carry no id by design, so they are not part of this claim.
    const ids = plan.items
      .filter((i) => i.kind !== 'transit')
      .map((i) => i.placeId ?? i.questId);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('the day ends before the island does', () => {
    const plan = planDay({ profile: profile({ activity: 'full' }), places: scored(), quests: [quest()] });
    const last = plan.items[plan.items.length - 1]!;
    assert.ok(last.time <= '20:00', `last stop at ${last.time}`);
  });

  test('no profile at all still produces a usable day', () => {
    // Onboarding can be skipped, and a skipped profile must not mean no plan.
    const plan = planDay({ profile: null, places: scored(), quests: [] });
    assert.ok(plan.items.length >= 2);
    assert.equal(plan.energy, 'moderate', 'the safe default, not the most demanding one');
  });
});

describe('getting between stops', () => {
  test('a long hop is a ride, not a walk', () => {
    // Charging a 6 km district hop against a walking budget ended a
    // "moderate" day after two stops, which is not a day.
    const plan = planDay({ profile: profile(), places: scored(), quests: [] });
    const legs = plan.items.filter((i) => i.kind === 'transit');
    assert.ok(legs.length > 0, 'a plan across the island has no legs at all');
    for (const leg of legs) {
      const far = (leg.km ?? 0) > WALK_LIMIT_KM;
      assert.equal(far, leg.mode !== 'walk', `${leg.km} km went by ${leg.mode}`);
    }
  });

  test('walking counts the stops as well as the legs between them', () => {
    // Every hop on Samui is longer than the walk limit, so if only the legs
    // counted, walkingKm would be zero on every plan and the energy budget
    // would be decoration. What tires a traveller is the waterfall trail.
    const plan = planDay({ profile: profile(), places: scored(), quests: [] });
    const legsOnFoot = plan.items
      .filter((i) => i.kind === 'transit' && i.mode === 'walk')
      .reduce((n, i) => n + (i.km ?? 0), 0);
    assert.ok(plan.walkingKm > legsOnFoot, 'the walking at each stop was not counted');
    assert.ok(plan.totalKm >= plan.walkingKm, 'total cannot be under the walked part');
  });

  test('a gentle day visits fewer places than a full one', () => {
    const stops = (e: 'gentle' | 'full') => planDay({
      profile: profile(), places: scored(), quests: [], energy: e,
    }).items.filter((i) => i.kind === 'place').length;
    assert.ok(stops('gentle') < stops('full'), 'energy made no difference to the day');
  });

  test('separating transit from walking fills the day it used to end early', () => {
    const plan = planDay({ profile: profile(), places: scored(), quests: [quest()] });
    const stops = plan.items.filter((i) => i.kind !== 'transit');
    assert.ok(stops.length >= 4, `only ${stops.length} stops — the day is still ending early`);
  });

  test('every leg names its mode in both languages', () => {
    const plan = planDay({ profile: profile(), places: scored(), quests: [] });
    for (const leg of plan.items.filter((i) => i.kind === 'transit')) {
      assert.ok(leg.name.th.length > 2, 'a Thai reader must be told how they are travelling');
      assert.ok((leg.minutes ?? 0) >= 5, 'no instantaneous journeys');
    }
  });
});
