import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { wantsDetailedBuild } from './build-choice.ts';

test('every screen gets the detailed build - the small one blotches the coat and loses the eyes', () => {
  assert.equal(wantsDetailedBuild({ saveData: false }), true);
});

test('Data Saver gets the small build', () => {
  assert.equal(wantsDetailedBuild({ saveData: true }), false);
});
