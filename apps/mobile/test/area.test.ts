/**
 * The area: the island or the campus, chosen by the URL, the chip, or the
 * last choice. Small, and worth holding, because a QR code at the campus
 * that lands somebody on the island is a demo that fails in the first
 * second.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { __setAreaForTests, areaFromUrl, getArea, placeFromUrl, setArea } from '../src/state/area.ts';
import { AREAS, areaOfProvince, inArea, nearestArea } from '@chivago/core';

describe('the area from the page URL', () => {
  test('a QR code carries ?area=ku-sriracha and it is honoured', () => {
    assert.equal(areaFromUrl('?area=ku-sriracha'), 'ku-sriracha');
    assert.equal(areaFromUrl('?place=ku-library&area=ku-sriracha'), 'ku-sriracha');
  });

  test('anything that is not an area we have is ignored, not guessed', () => {
    assert.equal(areaFromUrl('?area=bangkok'), null);
    assert.equal(areaFromUrl('?area='), null);
    assert.equal(areaFromUrl(''), null);
  });
});

describe('changing area', () => {
  test('tells every subscriber and stays put', () => {
    __setAreaForTests('samui');
    setArea('ku-sriracha');
    assert.equal(getArea(), 'ku-sriracha');
    setArea('samui');
    assert.equal(getArea(), 'samui');
  });
});

describe('what belongs where', () => {
  test('every place province maps to an area and every area frames its own centre', () => {
    for (const a of AREAS) {
      assert.equal(areaOfProvince(a.province), a.key);
      assert.ok(inArea(a, a.center));
      assert.equal(nearestArea(a.center.lat, a.center.lng).key, a.key);
    }
  });

  test('the island does not contain the campus, nor the campus the island', () => {
    const [samui, ku] = AREAS;
    assert.ok(!inArea(samui!, ku!.center));
    assert.ok(!inArea(ku!, samui!.center));
  });
});

describe('the place from the page URL', () => {
  test('a QR code at a pin names the place, in our shape or not at all', () => {
    assert.equal(placeFromUrl('?area=ku-sriracha&place=ku-park'), 'ku-park');
    assert.equal(placeFromUrl('?place=KU PARK'), null);
    assert.equal(placeFromUrl('?place=../etc'), null);
    assert.equal(placeFromUrl(''), null);
  });
});
