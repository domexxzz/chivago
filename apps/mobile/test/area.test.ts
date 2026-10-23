/**
 * The area: the island or the campus, chosen by the URL, the chip, or the
 * last choice. Small, and worth holding, because a QR code at the campus
 * that lands somebody on the island is a demo that fails in the first
 * second.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { __setAreaForTests, areaFromUrl, eventFromUrl, getArea, placeFromUrl, setArea } from '../src/state/area.ts';
import { AREAS, areaOf, inArea, nearestArea } from '@chivago/core';

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
  test('every area frames its own centre, and its centre answers to it', () => {
    /*
      `areaOfProvince(a.province) === a.key` used to be here, and it was a
      true statement about the world right up until Ko Sichang joined the
      Si Racha campus in Chon Buri. Two areas, one province, and `find`
      returns the first: the island's own centre would have answered
      "ku-sriracha". What is actually required is that an area contains
      where it says it is, and that geography can tell them apart - which
      is `areaOf`, and which `areas.test.ts` checks for the pair that
      forced it.
    */
    for (const a of AREAS) {
      assert.ok(inArea(a, a.center), `${a.key} does not contain its own centre`);
      assert.equal(nearestArea(a.center.lat, a.center.lng).key, a.key);
      assert.equal(areaOf({ ...a.center, province: a.province }), a.key);
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

describe('the event token from the page URL', () => {
  test('a QR code in the room carries ?event=, in a token’s shape or not at all', () => {
    assert.equal(eventFromUrl('?area=ku-sriracha&event=K7M2xQ9pLm3vR8sT'), 'K7M2xQ9pLm3vR8sT');
    assert.equal(eventFromUrl('?event=short'), null, 'too short to be one of ours');
    assert.equal(eventFromUrl('?event=has spaces in it'), null);
    assert.equal(eventFromUrl(''), null);
  });
});
