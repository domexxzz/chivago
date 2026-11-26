import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { DROP_OFF_POINTS, areaByKey } from '@chivago/core';

import { DROP_OFF_PIN_CATEGORY, dropOffForPin, dropOffPins, dropOffPointsIn, isDropOffPin } from './drop-off-pins.ts';

const th = (text: { th: string }) => text.th;
const sichang = areaByKey('koh-sichang');
const samui = areaByKey('samui');

test('every Koh Sichang drop-off point becomes a pin on the Koh Sichang map', () => {
  assert.ok(sichang, 'koh-sichang area exists');
  const pins = dropOffPins(sichang.bbox, th);
  assert.equal(pins.length, DROP_OFF_POINTS.length);
  for (const pin of pins) {
    assert.equal(pin.category, DROP_OFF_PIN_CATEGORY);
    assert.ok(isDropOffPin(pin.id), `${pin.id} is not recognised as a drop-off pin`);
    assert.equal(typeof pin.lat, 'number');
  }
});

test('a Koh Sichang bin is not pinned on another island', () => {
  assert.ok(samui, 'samui area exists');
  assert.deepEqual(dropOffPins(samui.bbox, th), []);
});

test('a pin id leads back to its point, and a shop id leads nowhere', () => {
  const first = DROP_OFF_POINTS[0];
  assert.equal(dropOffForPin(first.id)?.id, first.id);
  assert.equal(dropOffForPin('shop-123'), null);
});

test('the pin carries the name in the language it is given', () => {
  assert.ok(sichang);
  const [pin] = dropOffPins(sichang.bbox, (text) => text.en);
  assert.equal(pin.name, DROP_OFF_POINTS[0].name.en);
});

describe('the points listed under an area map', () => {
  test('are only the ones in that area: a campus does not list an island pier', () => {
    assert.deepEqual(dropOffPointsIn(areaByKey('rmutt').bbox), []);
  });

  test('and Ko Sichang still lists all of its own', () => {
    assert.equal(dropOffPointsIn(areaByKey('koh-sichang').bbox).length, DROP_OFF_POINTS.length);
  });
});
