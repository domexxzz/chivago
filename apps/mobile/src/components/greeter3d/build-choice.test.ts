import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { TABLET_SHORT_SIDE_PX, wantsDetailedBuild } from './build-choice.ts';

const laptop = { pointerFine: true, saveData: false, screenShortSidePx: 900 };
const ipad = { pointerFine: false, saveData: false, screenShortSidePx: 820 };
const phone = { pointerFine: false, saveData: false, screenShortSidePx: 390 };

test('a machine with a mouse gets the detailed build', () => {
  assert.equal(wantsDetailedBuild(laptop), true);
});

test('a tablet gets the detailed build - the small one blotches the coat and blurs the fur there', () => {
  assert.equal(wantsDetailedBuild(ipad), true);
  assert.equal(wantsDetailedBuild({ ...ipad, screenShortSidePx: TABLET_SHORT_SIDE_PX }), true);
});

test('a phone gets the small build, in either orientation', () => {
  assert.equal(wantsDetailedBuild(phone), false);
  assert.equal(wantsDetailedBuild({ ...phone, screenShortSidePx: TABLET_SHORT_SIDE_PX - 1 }), false);
});

test('Data Saver wins over both a mouse and a big screen', () => {
  assert.equal(wantsDetailedBuild({ ...laptop, saveData: true }), false);
  assert.equal(wantsDetailedBuild({ ...ipad, saveData: true }), false);
});

test('an unknown screen size is not read as a tablet', () => {
  assert.equal(wantsDetailedBuild({ ...phone, screenShortSidePx: Number.NaN }), false);
});
