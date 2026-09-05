import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  airSubScore,
  clamp,
  computeHealthyScore,
  crowdLabel,
  crowdSubScore,
  healthyScore,
  HIGH_SCORE_THRESHOLD,
  interpolate,
  isHighScore,
  normaliseWeights,
  safetySubScore,
  walkabilitySubScore,
  weightsForProfile,
  BASE_WEIGHTS,
} from './healthy-score.ts';
import { SEED_PLACES } from './seed.ts';
import type { PlaceMetrics, WellnessProfile } from './types.ts';

const sum = (ns: number[]): number => ns.reduce((a, b) => a + b, 0);

describe('interpolate', () => {
  test('clamps below the first breakpoint', () => {
    assert.equal(interpolate(-5, [[0, 10], [10, 20]]), 10);
  });

  test('clamps above the last breakpoint', () => {
    assert.equal(interpolate(999, [[0, 10], [10, 20]]), 20);
  });

  test('interpolates linearly between breakpoints', () => {
    assert.equal(interpolate(5, [[0, 0], [10, 100]]), 50);
  });

  test('throws on an empty table rather than returning a silent zero', () => {
    assert.throws(() => interpolate(1, []), /empty table/);
  });
});

describe('normalisers are bounded and monotone', () => {
  test('air: cleaner air always scores at least as well', () => {
    for (let aqi = 0; aqi < 400; aqi += 7) {
      const here = airSubScore(aqi);
      const worse = airSubScore(aqi + 7);
      assert.ok(here >= worse, `AQI ${aqi} (${here}) should beat ${aqi + 7} (${worse})`);
      assert.ok(here >= 0 && here <= 100);
    }
  });

  test('crowd: emptier always scores at least as well', () => {
    for (let d = 0; d < 12; d += 0.25) {
      assert.ok(crowdSubScore(d) >= crowdSubScore(d + 0.25));
      assert.ok(crowdSubScore(d) >= 0 && crowdSubScore(d) <= 100);
    }
  });

  test('safety and walkability: higher index always scores at least as well', () => {
    for (let i = 0; i <= 10; i += 0.5) {
      assert.ok(safetySubScore(i) >= safetySubScore(i - 0.5));
      assert.ok(walkabilitySubScore(i) >= walkabilitySubScore(i - 0.5));
    }
  });

  test('out-of-range readings cannot push a sub-score out of 0-100', () => {
    assert.equal(clamp(airSubScore(-50), 0, 100), airSubScore(-50));
    assert.equal(safetySubScore(99), 100);
    assert.equal(safetySubScore(-99), 10);
    assert.equal(crowdSubScore(1e9), 0);
  });
});

describe('weighting', () => {
  test('base weights sum to 1', () => {
    assert.ok(Math.abs(sum(Object.values(BASE_WEIGHTS)) - 1) < 1e-9);
  });

  test('a null profile yields the island baseline', () => {
    assert.deepEqual(weightsForProfile(null), normaliseWeights(BASE_WEIGHTS));
  });

  test('every profile still produces weights summing to 1', () => {
    const profile: WellnessProfile = {
      purposes: ['quiet', 'nature', 'wellness', 'food', 'volunteering'],
      activity: 'full',
      watch: ['air', 'crowd', 'scam', 'location', 'language'],
      completedAt: new Date(0).toISOString(),
    };
    assert.ok(Math.abs(sum(Object.values(weightsForProfile(profile))) - 1) < 1e-9);
  });

  test('quiet, away from crowds raises the crowd weight', () => {
    const base = weightsForProfile(null);
    const quiet = weightsForProfile({
      purposes: ['quiet'],
      activity: null,
      watch: [],
      completedAt: new Date(0).toISOString(),
    });
    assert.ok(quiet.crowdDensity > base.crowdDensity);
  });

  test('personalisation tilts the ranking without rewriting it', () => {
    // Two very different profiles must not disagree by more than a few points
    // on the same place, or the score stops being comparable between users.
    const busyButPleasant: PlaceMetrics = {
      aqi: 40, crowdDensity: 3.0, safetyIndex: 8.0, walkability: 9.0,
    };
    const quiet = healthyScore(busyButPleasant, {
      profile: { purposes: ['quiet'], activity: 'gentle', watch: ['crowd'], completedAt: 'x' },
    });
    const active = healthyScore(busyButPleasant, {
      profile: { purposes: ['food'], activity: 'full', watch: ['air'], completedAt: 'x' },
    });
    assert.ok(Math.abs(quiet - active) <= 8, `spread was ${Math.abs(quiet - active)}`);
  });
});

describe('staleness', () => {
  const metrics: PlaceMetrics = { aqi: 20, crowdDensity: 0.4, safetyIndex: 8, walkability: 8 };

  test('a stale reading is downweighted, not treated as fresh', () => {
    const fresh = computeHealthyScore(metrics);
    const stale = computeHealthyScore(metrics, { provenance: { aqi: 'stale' } });
    const freshAir = fresh.components.find((c) => c.key === 'aqi')!;
    const staleAir = stale.components.find((c) => c.key === 'aqi')!;
    assert.ok(staleAir.weight < freshAir.weight);
    assert.equal(staleAir.provenance, 'stale');
  });

  test('weight lost to staleness is redistributed, never dropped', () => {
    const stale = computeHealthyScore(metrics, { provenance: { aqi: 'stale' } });
    assert.ok(Math.abs(sum(stale.components.map((c) => c.weight)) - 1) < 0.01);
  });
});

describe('breakdown is explainable', () => {
  const metrics: PlaceMetrics = { aqi: 42, crowdDensity: 3.0, safetyIndex: 6.77, walkability: 8.1 };

  test('names every component with a bilingual label and a display value', () => {
    const b = computeHealthyScore(metrics, { safetyPhrase: 'Patrolled' });
    assert.equal(b.components.length, 4);
    for (const c of b.components) {
      assert.ok(c.label.en.length > 0, 'missing EN label');
      assert.ok(c.label.th.length > 0, 'missing TH label');
      assert.ok(c.display.length > 0, 'missing display value');
    }
  });

  test('shows the place safety phrase rather than a bare index', () => {
    const b = computeHealthyScore(metrics, { safetyPhrase: 'Patrolled' });
    assert.equal(b.components.find((c) => c.key === 'safetyIndex')!.display, 'Patrolled');
  });

  test('names which profile produced the number', () => {
    assert.equal(computeHealthyScore(metrics).profileApplied, 'Island baseline');
    assert.match(
      computeHealthyScore(metrics, {
        profile: { purposes: ['quiet'], activity: 'gentle', watch: [], completedAt: 'x' },
      }).profileApplied,
      /Your profile/,
    );
  });

  test('the total equals the weighted sum of its own components', () => {
    const b = computeHealthyScore(metrics);
    const recomputed = sum(b.components.map((c) => c.subScore * c.weight));
    assert.ok(Math.abs(b.total - recomputed) <= 1, `${b.total} vs ${recomputed}`);
  });
});

describe('crowd label agrees with the crowd curve', () => {
  test('a place labelled Low never outscores one labelled High', () => {
    assert.equal(crowdLabel(0.4).en, 'Low');
    assert.equal(crowdLabel(3.0).en, 'High');
    assert.ok(crowdSubScore(0.4) > crowdSubScore(3.0));
  });
});

describe('calibration against the approved design comps', () => {
  // The prototype hard-codes these five scores. They are the numbers every
  // stakeholder has already signed off on, so the seed metrics are tuned to
  // reproduce them through the real formula rather than being faked.
  const EXPECTED: Record<string, number> = {
    chaweng: 74,
    namuang: 91,
    fisherman: 82,
    lamai: 88,
    mangrove: 79,
  };

  test('every island place has a comp, and only island places do', () => {
    // The campus places (TH-20) carry the team's estimates, not numbers a
    // stakeholder signed off on. They are calibrated to nothing, on purpose.
    const island = SEED_PLACES.filter((p) => p.province === 'TH-84').map((p) => p.id).sort();
    assert.deepEqual(island, Object.keys(EXPECTED).sort());
  });

  for (const place of SEED_PLACES.filter((p) => p.id in EXPECTED)) {
    test(`${place.id} scores ${EXPECTED[place.id]} +/- 1`, () => {
      const got = healthyScore(place.metrics);
      assert.ok(
        Math.abs(got - EXPECTED[place.id]!) <= 1,
        `${place.id}: expected ~${EXPECTED[place.id]}, formula gave ${got}`,
      );
    });
  }

  test('Na Muang is the highest-scoring place, as its blurb claims', () => {
    const ranked = [...SEED_PLACES].sort(
      (a, b) => healthyScore(b.metrics) - healthyScore(a.metrics),
    );
    assert.equal(ranked[0]!.id, 'namuang');
  });

  test('exactly Na Muang and Lamai cross the accent-pin threshold', () => {
    const high = SEED_PLACES.filter((p) => p.province === 'TH-84' && isHighScore(healthyScore(p.metrics))).map((p) => p.id);
        // Sorted, so the expectation is sorted too: 'lamai' precedes 'namuang'.
    assert.deepEqual(high.sort(), ['lamai', 'namuang']);
    assert.equal(HIGH_SCORE_THRESHOLD, 85);
  });
});

describe('the campus scores stand on estimates', () => {
  test('no campus place crosses the accent threshold on an estimate', () => {
    // Walkability and safety on the campus are the team's estimates pending
    // a survey. An estimate that earns the accent pin is a claim nobody has
    // measured; the campus earns that colour when its numbers are.
    for (const p of SEED_PLACES.filter((x) => x.province === 'TH-20')) {
      assert.ok(!isHighScore(healthyScore(p.metrics)), `${p.id} scores ${healthyScore(p.metrics)} on estimates`);
    }
  });
});
