/**
 * A selected map pin offers two deliberately separate actions: open the
 * place, or start ChivarGo navigation. The navigation control sits above the
 * card, so pressing it must never fall through to the card's detail action.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';

import { CoastalDriftSelectionCard, MapSelectionCard } from '../src/screens/MapScreen.tsx';
import type { CoastalDriftFile, CoastalDriftPoint } from '../src/components/coastal-drift.ts';
import { mount } from './interact.ts';
import * as fx from './fixtures.ts';

describe('the selected map pin card', () => {
  test('starts navigation without opening the detail screen', async () => {
    let opened = 0;
    let navigated = 0;
    const ui = mount(h(MapSelectionCard, {
      place: fx.place({ name: { en: 'Tiew Pai Park Resort', th: 'ทิวไผ่ ปาร์ค รีสอร์ท', zh: '竹景公园度假村' } }),
      shop: null,
      onOpen: () => { opened += 1; },
      onNavigate: () => { navigated += 1; },
    }));

    try {
      await ui.press(/Navigate to|นำทางไป|导航至/);
      assert.equal(navigated, 1);
      assert.equal(opened, 0, 'navigation fell through to the detail card');
    } finally { ui.unmount(); }
  });

  /**
   * What kind of thing the card is about.
   *
   * A shop has always said its category on this line - ที่พัก, ร้านอาหาร -
   * and a place said "Place", because it had nothing better. Koniix Garden
   * Cottage went on the Ko Sichang map on 15 November and read "Place"
   * beside shops reading "ที่พัก": the map being vaguer about the thing it
   * knows more about.
   *
   * THE GUARD IS THE SECOND TEST. Tags are English content from the seed, so
   * one may only reach this line once it has been written in all three
   * languages. Printing a raw tag would hand a Thai reader "Garden" where
   * they used to read สถานที่.
   */
  test('a place wears its kind when the app has the word', () => {
    const ui = mount(h(MapSelectionCard, {
      place: fx.place({ tags: ['Accommodation', 'Garden', 'Sea view'] }),
      shop: null,
      onOpen: () => {},
    }));

    try {
      assert.match(ui.text(), /Accommodation|ที่พัก|住宿/);
      assert.doesNotMatch(ui.text(), /\bPlace\b/, 'it still calls a guest house a place');
    } finally { ui.unmount(); }
  });

  test('and keeps the old word for a tag nobody has translated', () => {
    const ui = mount(h(MapSelectionCard, {
      place: fx.place({ tags: ['Garden', 'Sea view'] }),
      shop: null,
      onOpen: () => {},
    }));

    try {
      assert.match(ui.text(), /Place|สถานที่|地点/);
      assert.doesNotMatch(ui.text(), /Garden/, 'an untranslated tag reached the card');
    } finally { ui.unmount(); }
  });

  test('does not render a dead navigation button without an action', () => {
    const ui = mount(h(MapSelectionCard, {
      place: fx.place(), shop: null, onOpen: () => {},
    }));

    try {
      assert.equal(
        ui.labels().some((label) => /Navigate to|นำทางไป|导航至/.test(label)),
        false,
      );
    } finally { ui.unmount(); }
  });
});

describe('the floating-debris forecast point card', () => {
  test('explains a modelled shoreline contact without claiming observed rubbish', () => {
    const point: CoastalDriftPoint = {
      id: 24, rank: 1, count: 83, firstHours: 0.5, arrivalP10: 1, arrivalP90: 4.7,
      low: 73, high: 86, beach: null, near: 'หาดท่าวัง', path: [[100.819, 13.137]],
      lat: 13.137, lng: 100.819, side: 'south', attention: 'higher',
      sideLabel: { en: 'South coast', th: 'ชายฝั่งใต้', zh: '南岸' },
      attentionLabel: { en: 'Survey first', th: 'ควรสำรวจก่อน', zh: '优先巡查' },
    };
    const file = {
      model: 'sichang-rk2-sensitivity-v2', issued: '2026-11-17T04:08+07:00', window: 6,
      calibrated: false, seeding: 'uniform offshore grid; no observed debris mass', sensitivityMeaning: null,
      simulations: 5133, contacts: 717, afloat: 3937, outOfArea: 0, max: 83,
      source: 'Copernicus SMOC via Open-Meteo', segments: [],
    } satisfies CoastalDriftFile;
    const ui = mount(h(CoastalDriftSelectionCard, { point, file }));
    try {
      const said = ui.text();
      assert.match(said, /83/);
      assert.match(said, /not pieces of rubbish|ไม่ใช่จำนวนชิ้นขยะ|不是垃圾件数/);
      assert.match(said, /Uncalibrated|ยังไม่ผ่านการสอบเทียบ|未校准/);
    } finally { ui.unmount(); }
  });
});
