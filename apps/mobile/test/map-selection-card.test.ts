/**
 * A selected map pin offers two deliberately separate actions: open the
 * place, or start ChivarGo navigation. The navigation control sits above the
 * card, so pressing it must never fall through to the card's detail action.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';

import { MapSelectionCard } from '../src/screens/MapScreen.tsx';
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
