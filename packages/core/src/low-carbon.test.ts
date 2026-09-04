import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { LEG_MAX_MIN, LEG_MIN_M, LOW_CARBON_TRIP_POINTS, WALK_MAX_KM_H, lowCarbonLeg } from './low-carbon.ts';
import { CHECKIN_TRIP_POINTS } from './seed.ts';

const chaweng = { placeId: 'chaweng', lat: 9.5357, lng: 100.0617 };
const fisherman = { placeId: 'fisherman', lat: 9.5573, lng: 100.0449 };
const at = (min: number) => new Date(Date.UTC(2026, 8, 5, 2, min));

describe('a leg on foot', () => {
  test('Chaweng to Fisherman\'s Village in two hours is a walk', () => {
    const leg = lowCarbonLeg({ ...chaweng, at: at(0) }, { ...fisherman, at: at(120) });
    assert.equal(leg.qualifies, true);
    assert.ok(leg.metres > 2000 && leg.metres < 3500, `${leg.metres} m`);
    assert.ok(leg.kmPerHour < 2);
  });

  test('the same distance in ten minutes was a vehicle', () => {
    const leg = lowCarbonLeg({ ...chaweng, at: at(0) }, { ...fisherman, at: at(10) });
    assert.equal(leg.qualifies, false);
    assert.equal(leg.verdict, 'too-fast');
    assert.ok(leg.kmPerHour > WALK_MAX_KM_H);
  });

  test('the same beach twice is not a journey', () => {
    const leg = lowCarbonLeg({ ...chaweng, at: at(0) }, { ...chaweng, at: at(60) });
    assert.equal(leg.verdict, 'same-place');
  });

  test('a few hundred metres is the same place with a different pin', () => {
    const near = { placeId: 'x', lat: chaweng.lat + 0.003, lng: chaweng.lng };
    assert.equal(lowCarbonLeg({ ...chaweng, at: at(0) }, { ...near, at: at(30) }).verdict, 'too-short');
    assert.ok(LEG_MIN_M >= 500);
  });

  test('half a day between check-ins says nothing about how they travelled', () => {
    const leg = lowCarbonLeg({ ...chaweng, at: at(0) }, { ...fisherman, at: at(LEG_MAX_MIN + 1) });
    assert.equal(leg.verdict, 'too-long');
  });

  test('a check-in before the previous one is out of order, not infinitely fast', () => {
    assert.equal(lowCarbonLeg({ ...chaweng, at: at(60) }, { ...fisherman, at: at(0) }).verdict, 'out-of-order');
  });

  test('it pays the self-verified currency, more than a check-in and less than a quest', () => {
    assert.ok(LOW_CARBON_TRIP_POINTS > CHECKIN_TRIP_POINTS && LOW_CARBON_TRIP_POINTS < 100);
  });
});
