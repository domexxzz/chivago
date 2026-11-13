/**
 * Every place and every service has a pin.
 *
 * The maps used to skip a service with no coordinates - listed under the map,
 * absent from it. These tests mount the maps the harness can render (the
 * island drawing and the area coordinate map; the browser's MapLibre map
 * needs a `document` this harness does not have) and count what comes out,
 * so "every one, one pin" is a fact about the rendered tree rather than a
 * comment.
 *
 * The browser map is covered too, from the other side: it builds its pins
 * from the same `servicePoints` these maps do, which `map-geometry.test.ts`
 * holds to one point per service.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { act } from 'react-test-renderer';

import { SEED_PLACES, areaByKey, computeHealthyScore, inArea, type ScoredPlace } from '@chivago/core';
import { mountScreen } from './interact.ts';
import * as fx from './fixtures.ts';
import { SamuiMap } from '../src/components/SamuiMap.tsx';

const noop = () => {};

/** Seed places for one area, scored the way the API scores them. */
const placesIn = (key: Parameters<typeof areaByKey>[0]): ScoredPlace[] => {
  const area = areaByKey(key);
  return SEED_PLACES.filter((p) => inArea(area, p)).map((p) => {
    const breakdown = computeHealthyScore(p.metrics);
    // No reviews: a pin does not read them, and inventing some would be a
    // fixture claiming the seed places have been reviewed.
    return {
      ...p, healthyScore: breakdown.total, breakdown,
      reviews: { count: 0, average: null, distribution: [0, 0, 0, 0, 0] as [number, number, number, number, number] },
    } as ScoredPlace;
  });
};

const withWidth = async (ui: Awaited<ReturnType<typeof mountScreen>>, width = 390) => {
  for (const node of ui.root.findAll((n) => typeof n.props.onLayout === 'function', { deep: true })) {
    await act(async () => { node.props.onLayout({ nativeEvent: { layout: { width, height: 344 } } }); });
  }
};

/** Every press target whose label names this service. */
const pinsFor = (ui: Awaited<ReturnType<typeof mountScreen>>, name: string) =>
  ui.root.findAll(
    (n) => typeof n.props.onPress === 'function'
      && typeof n.props.accessibilityLabel === 'string'
      && n.props.accessibilityLabel.includes(name),
    { deep: true },
  );

/*
  Outside a browser, an area's map is the WebView one: MapLibre inside a page
  this harness cannot run. What it CAN read is the page's own data - the
  `pins` and `shopPins` arrays the page draws one marker each from - so the
  test reads those, from the `source` the WebView was handed.
*/
type PageData = {
  pins: { id: string }[];
  shopPins: { id: string; lat: number; lng: number; approximate: boolean; note: string }[];
};
const pageData = (ui: Awaited<ReturnType<typeof mountScreen>>): PageData => {
  const view = ui.root.findAll((n) => typeof n.props.source?.html === 'string', { deep: true })[0];
  assert.ok(view, 'no map page was rendered');
  const html = String(view.props.source.html);
  const pins = /"pins":(\[.*?\]),"shopPins"/s.exec(html);
  const shopPins = /"shopPins":(\[.*?\]),"centre"/s.exec(html);
  assert.ok(pins && shopPins, 'the page carries no pin data');
  return { pins: JSON.parse(pins[1]!), shopPins: JSON.parse(shopPins[1]!) };
};

describe('the area map draws a pin for every service, pinned or not', () => {
  const area = areaByKey('koh-sichang');
  const places = placesIn('koh-sichang');
  const shops = [
    fx.shop({ id: 's-pinned', name: 'Harbour Kitchen', category: 'ร้านอาหาร', areaKey: 'koh-sichang', lat: 13.155, lng: 100.81 }),
    fx.shop({ id: 's-nopin', name: 'No-Pin Salon', category: 'เสริมสวย', areaKey: 'koh-sichang', lat: null, lng: null }),
    fx.shop({ id: 's-typo', name: 'Typo Hostel', category: 'ที่พัก', areaKey: 'koh-sichang', lat: 13.7563, lng: 100.5018 }),
    // A guide is a person, not a place: listed, never pinned.
    fx.shop({ id: 's-guide', name: 'Island Guide', category: 'ไกด์นำเที่ยว', serviceType: 'guide', areaKey: 'koh-sichang', lat: 13.15, lng: 100.81 }),
  ];

  test('every business reaches the page as a pin, including the two with no usable spot - and no guide does', async () => {
    const ui = await mountScreen(h(SamuiMap, { area, places, onSelect: noop, height: 344, shops }));
    const data = pageData(ui);
    assert.deepEqual(data.shopPins.map((p) => p.id), ['s-pinned', 's-nopin', 's-typo'], 'a business was dropped, or a guide was pinned');
    for (const pin of data.shopPins) {
      assert.ok(Number.isFinite(pin.lat) && Number.isFinite(pin.lng), `${pin.id} has no drawable spot`);
      assert.ok(inArea(area, pin), `${pin.id} would be drawn off this area's map`);
    }
    ui.unmount();
  });

  test('a pin standing on the ring says so; a real address does not', async () => {
    const ui = await mountScreen(h(SamuiMap, { area, places, onSelect: noop, height: 344, shops }));
    const byId = new Map(pageData(ui).shopPins.map((p) => [p.id, p]));
    assert.equal(byId.get('s-pinned')!.approximate, false);
    assert.equal(byId.get('s-pinned')!.lat, 13.155, 'a real address was moved');
    for (const id of ['s-nopin', 's-typo']) {
      assert.equal(byId.get(id)!.approximate, true, `${id} is drawn as a real address`);
      assert.match(byId.get(id)!.note, /Location not given by the business/);
    }
    ui.unmount();
  });

  test('every place in the area reaches the page as a pin as well', async () => {
    const ui = await mountScreen(h(SamuiMap, { area, places, onSelect: noop, height: 344, shops: [] }));
    assert.ok(places.length > 0, 'the area has no seed places to check');
    assert.deepEqual(
      pageData(ui).pins.map((p) => p.id).sort(),
      places.map((p) => p.id).sort(),
      'a place is missing from the map',
    );
    ui.unmount();
  });
});

describe('the island drawing draws a pin for every service too', () => {
  test('an unpinned Samui business stands on the island, labelled in the reader’s language; a guide does not', async () => {
    const shops = [
      fx.shop({ id: 's-1', name: 'Beach Bar', category: 'ร้านอาหาร', areaKey: 'samui', lat: 9.53, lng: 100.06 }),
      fx.shop({ id: 's-2', name: 'Unpinned Spa', category: 'เสริมสวย', areaKey: 'samui', lat: null, lng: null }),
      fx.shop({ id: 's-3', name: 'Samui Guide', category: 'ไกด์นำเที่ยว', serviceType: 'guide', areaKey: 'samui', lat: 9.5, lng: 100.0 }),
    ];
    const ui = await mountScreen(h(SamuiMap, { places: placesIn('samui'), onSelect: noop, height: 344, shops }));
    await withWidth(ui);

    for (const s of shops.filter((x) => x.serviceType !== 'guide')) {
      assert.ok(pinsFor(ui, s.name).length >= 1, `${s.name} has no pin on the island`);
    }
    assert.equal(pinsFor(ui, 'Samui Guide').length, 0, 'a guide was given a pin');
    // It used to be the Thai word for "shop" whatever the reader had chosen.
    const roaming = String(pinsFor(ui, 'Unpinned Spa')[0]!.props.accessibilityLabel);
    assert.doesNotMatch(roaming, /^ร้าน /, 'the label is still Thai-only');
    assert.match(roaming, /Location not given by the business/);
    ui.unmount();
  });
});
