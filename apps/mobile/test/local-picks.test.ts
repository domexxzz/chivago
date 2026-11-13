import { strict as assert } from 'node:assert';
import { test, describe, mock } from 'node:test';
import { test, describe, afterEach, beforeEach } from 'node:test';
import { createElement as h } from 'react';
import { Linking } from 'react-native';

import { LocalPicksScreen } from '../src/screens/LocalPicksScreen.tsx';
import { mountScreen } from './interact.ts';
import { mountScreen, server, offline } from './interact.ts';
import * as fx from './fixtures.ts';
import { __setAreaForTests } from '../src/state/area.ts';

/**
 * Local Picks - the island's own businesses, by category.
 *
 * The categories are not new. `/shops` has filtered on `category` since the
 * directory shipped, Home has carried the same chips inside its "places in
 * this area" section, and `SHOP_CATEGORIES` has listed all eight - including
 * `เช่ารถ`, which is how a rental shop gets a place to stand without anybody
 * building a rental feature.
 *
 * What was missing is a screen: on Home the chips are two taps down, behind a
 * `Services` switch, in a row that scrolls sideways off a screen somebody is
 * already scrolling. These tests are about the screen, and the thing they
 * guard hardest is the EMPTY category - a filter that silently shows nothing
 * reads as a broken app, and this island will have empty categories for
 * months.
 */

const noop = () => {};
const props = { onBack: noop, onOpenShop: noop };

describe('Local Picks category shell', () => {
  test('defaults to All and exposes the four categories in one dropdown', async () => {
    const ui = await mountScreen(h(LocalPicksScreen, props));

    assert.match(ui.text(), /All local picks/i);
    assert.match(ui.text(), /Sinrani Badminton/);
    await ui.press('Category: All');
    const said = ui.text();

    for (const label of ['All', 'Food', 'Accommodation', 'Transportation', 'Sports']) {
      assert.match(said, new RegExp(label), `the ${label} category is missing`);
    }
    ui.unmount();
  });

  test('the Sports category shows Sinrani Badminton and opens its booking page', async () => {
    const opened = mock.method(Linking, 'openURL', async () => true);
    const ui = await mountScreen(h(LocalPicksScreen, props));

    await ui.press('Category: All');
    await ui.press('Sports');
    assert.match(ui.text(), /Activities and active experiences/);
    assert.match(ui.text(), /Sinrani Badminton/);
    assert.doesNotMatch(ui.text(), /No recommendations yet/);
    await ui.press('Sinrani Badminton');
    assert.deepEqual(opened.mock.calls.map((call) => call.arguments[0]), ['https://badminton-booking-ihw1.onrender.com/']);
    ui.unmount();
    opened.mock.restore();
  });
});
