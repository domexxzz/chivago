import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { addedFields, diffShapes, shapeOf, type Shape } from './contract.ts';

const CONTRACT = join(process.cwd(), '..', '..', 'contract', 'api-contract.json');
const SAMPLES = join(process.cwd(), '..', '..', 'contract', 'api-samples.json');

interface Recorded { shapes: Record<string, Shape>; uncovered: string[] }

const load = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

describe('shape comparison', () => {
  test('a renamed field is a break', () => {
    const before = shapeOf({ costPoints: 180 });
    const after = shapeOf({ cost_points: 180 });
    const diffs = diffShapes(before, after);
    assert.equal(diffs.length, 1);
    assert.equal(diffs[0]!.path, 'costPoints');
    assert.equal(diffs[0]!.actual, 'missing');
  });

  test('a retyped field is a break', () => {
    const diffs = diffShapes(shapeOf({ rating: 5 }), shapeOf({ rating: '5' }));
    assert.deepEqual(diffs, [{ path: 'rating', expected: 'number', actual: 'string' }]);
  });

  test('an ADDED field is not a break - an old decoder ignores it', () => {
    const diffs = diffShapes(shapeOf({ a: 1 }), shapeOf({ a: 1, b: 2 }));
    assert.deepEqual(diffs, []);
    assert.deepEqual(addedFields(shapeOf({ a: 1 }), shapeOf({ a: 1, b: 2 })), ['b']);
  });

  test('null is a WILDCARD on both sides', () => {
    // A nullable field that happened to be null when the fixture was taken must
    // not fail the day it holds a string. That is the field working.
    assert.deepEqual(diffShapes(shapeOf({ note: null }), shapeOf({ note: 'hi' })), []);
    assert.deepEqual(diffShapes(shapeOf({ note: 'hi' }), shapeOf({ note: null })), []);
  });

  test('it looks inside arrays and nested objects', () => {
    const before = shapeOf({ ledger: [{ amount: 1, currency: 'green' }] });
    const after = shapeOf({ ledger: [{ amount: 1 }] });
    const diffs = diffShapes(before, after);
    assert.equal(diffs[0]!.path, 'ledger[].currency');
  });

  test('an empty array cannot be compared, and does not pretend to be', () => {
    // `unknown` on either side is a known gap, recorded by the capture as
    // `uncovered` rather than silently passing as agreement.
    assert.deepEqual(diffShapes(shapeOf({ xs: [] }), shapeOf({ xs: [{ a: 1 }] })), []);
  });
});

describe('the checked-in contract', () => {
  test('exists — three hand-written clients depend on it', () => {
    assert.ok(
      existsSync(CONTRACT),
      'contract/api-contract.json is missing. Run `pnpm --filter @chivago/api contract` '
      + 'against a running API. The Swift and Dart SDKs are written from this file.',
    );
    assert.ok(existsSync(SAMPLES), 'contract/api-samples.json is missing.');
  });

  test('the samples still match the shapes they were captured with', () => {
    const recorded = load<Recorded>(CONTRACT);
    const samples = load<Record<string, unknown>>(SAMPLES);

    for (const [name, shape] of Object.entries(recorded.shapes)) {
      assert.ok(name in samples, `sample missing for ${name}`);
      const diffs = diffShapes(shape, shapeOf(samples[name]));
      assert.deepEqual(
        diffs, [],
        `${name} drifted: ${diffs.map((d) => `${d.path} ${d.expected}->${d.actual}`).join(', ')}`,
      );
    }
  });

  test('the SDKs cover every endpoint the contract records', () => {
    const recorded = load<Recorded>(CONTRACT);
    // Named here rather than derived, so ADDING an endpoint to the capture is a
    // deliberate decision about whether the other two clients need it.
    const expected = [
      'health', 'profile', 'places', 'place', 'quests', 'quest', 'wallet',
      'offers', 'vouchers', 'impactMe', 'impactCommunity', 'shield',
      'notifications', 'quietHours', 'checkinsToday', 'reviews', 'sosContacts',
      'checkin', 'writeReview',
      // Recorded, not scored (docs/29): both SDKs decode these now.
      'selfVisits', 'passport',
      // The evidence layer (docs/31): the statements a traveller's work is on.
      'myStatements',
    ];
    assert.deepEqual(Object.keys(recorded.shapes).sort(), [...expected].sort());
  });

  test('what is NOT covered is written down', () => {
    const recorded = load<Recorded>(CONTRACT);
    // An uncovered shape that LOOKS covered is worse than a known gap. These
    // were empty collections when the contract was taken, so nothing about
    // their elements is guarded, and the file says so.
    assert.ok(Array.isArray(recorded.uncovered));
    for (const path of recorded.uncovered) assert.match(path, /^[a-zA-Z.]+$/);
  });

  test('the money paths are guarded, whatever else moves', () => {
    const recorded = load<Recorded>(CONTRACT);
    const paths = (s: Shape, p = ''): string[] => {
      if (typeof s === 'string') return [p];
      if ('array' in s) return paths(s.array, `${p}[]`);
      return Object.entries(s.object).flatMap(([k, v]) => paths(v, p ? `${p}.${k}` : k));
    };
    const wallet = paths(recorded.shapes.wallet!);
    for (const required of [
      'balances.green', 'balances.trip',
      'progression.exp', 'progression.level',
      'ledger[].amount', 'ledger[].currency', 'ledger[].exp',
    ]) {
      assert.ok(wallet.includes(required), `${required} is no longer in the contract`);
    }
  });
});
