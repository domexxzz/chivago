import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { createElement as h } from 'react';

import { DropOffLayer } from '../src/components/DropOffLayer.tsx';
import { mount } from './interact.ts';
import type { DropOffPoint } from '@chivago/core';

/**
 * Drop-off points on the map.
 *
 * The state this guards hardest is the EMPTY one, because that is the state
 * the island is in today and will stay in until a shop agrees to run a
 * point. A section that renders nothing when it has nothing reads as a
 * broken app, and a placeholder pin is worse than either: it sends somebody
 * who has already carried a bottle for forty minutes on a walk to a bin that
 * is not there.
 *
 * The second thing it guards is that a drop-off point never promises points
 * for arriving. Walking to a bin carrying nothing is not the behaviour this
 * exists to encourage, and the reward lives on the quest a named host
 * releases.
 */

const POINT: DropOffPoint = {
  id: 'do-test',
  name: { en: 'Pier drop-off', th: 'จุดรับที่ท่าเรือ', zh: '码头投放点' },
  where: { en: 'Tha Lang pier', th: 'ท่าล่าง', zh: '塔朗码头' },
  lat: 13.161443,
  lng: 100.810441,
  host: { id: 'h-test', name: 'Pier shop', type: 'business' },
  accepts: ['plastic', 'can'],
  hours: '08:00-17:00',
  source: 'test fixture',
};

describe('drop-off layer', () => {
  test('with no points it says the island has none, and why', () => {
    const screen = mount(h(DropOffLayer, { here: null, points: [] }));
    const text = screen.text();
    assert.match(text, /ยังไม่มีจุดรับ|No drop-off point/i);
    // The reason, not just the absence: somebody has to agree to run one.
    assert.match(text, /ร้านหรือเทศบาล|shop or the municipality/i);
  });

  test('the empty state never shows a placeholder distance', () => {
    const screen = mount(h(DropOffLayer, { here: { lat: 13.16, lng: 100.81 }, points: [] }));
    assert.doesNotMatch(screen.text(), /\d+\s*(m|ม\.|km|กม\.)\b/);
  });

  test('a point shows its distance in metres, rounded', () => {
    // ~160 m north of the point.
    const here = { lat: 13.16288, lng: 100.810441 };
    const screen = mount(h(DropOffLayer, { here, points: [POINT] }));
    assert.match(screen.text(), /1[5-7]0 (m|ม\.)/);
  });

  test('with location off it says so rather than printing a distance from nothing', () => {
    const screen = mount(h(DropOffLayer, { here: null, points: [POINT] }));
    assert.match(screen.text(), /ยังไม่ได้เปิดตำแหน่ง|Location off/i);
    assert.doesNotMatch(screen.text(), /\d+\s*(m|ม\.)\b/);
  });

  test('it says what the point takes, at the moment somebody has to decide', () => {
    const screen = mount(h(DropOffLayer, { here: null, points: [POINT] }));
    const text = screen.text();
    assert.match(text, /ขวดพลาสติก|Plastic bottles/i);
    assert.match(text, /กระป๋อง|Cans/i);
  });

  test('it names who signs for what is handed in', () => {
    const screen = mount(h(DropOffLayer, { here: null, points: [POINT] }));
    assert.match(screen.text(), /Pier shop/);
  });

  test('it never offers points for arriving at a bin', () => {
    const screen = mount(h(DropOffLayer, { here: { lat: 13.16, lng: 100.81 }, points: [POINT] }));
    const text = screen.text();
    // "Drop-off points" is the heading; what must never appear is a REWARD —
    // a +number, a named currency, or EXP — beside a bin.
    assert.doesNotMatch(text, /\+\s*\d+|Trip Point|Green Point|แต้ม|EXP/i);
  });

  test('nearest first, so the one worth walking to is at the top', () => {
    const far: DropOffPoint = {
      ...POINT,
      id: 'do-far',
      name: { en: 'Far point', th: 'จุดไกล', zh: '远点' },
      lat: 13.2,
      lng: 100.9,
    };
    const here = { lat: 13.1615, lng: 100.8105 };
    const screen = mount(h(DropOffLayer, { here, points: [far, POINT] }));
    const text = screen.text();
    assert.ok(
      text.indexOf('จุดรับที่ท่าเรือ') < text.indexOf('จุดไกล')
        || text.indexOf('Pier drop-off') < text.indexOf('Far point'),
      'the far point was listed first',
    );
  });

  test('the directions control is absent on a surface that cannot route', () => {
    const screen = mount(h(DropOffLayer, { here: null, points: [POINT] }));
    assert.equal(screen.labels().some((l) => /นำทาง|Directions/i.test(l)), false);
  });

  test('the directions control appears when routing is possible', () => {
    const screen = mount(h(DropOffLayer, { here: null, points: [POINT], onRoute: () => {} }));
    assert.ok(screen.labels().some((l) => /นำทางไปจุดรับ|Directions to this drop-off/i.test(l)));
  });
});
