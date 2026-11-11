import { strict as assert } from 'node:assert';
import { test, describe, afterEach } from 'node:test';
import { createElement as h } from 'react';

import { LocalPicksScreen } from '../src/screens/LocalPicksScreen.tsx';
import { mountScreen, server, offline } from './interact.ts';
import * as fx from './fixtures.ts';

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

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; });

const routes = (shops: unknown[]) => ({ '/shops?area=samui': shops });

describe('Local Picks lists the island by category', () => {
  test('every category has a chip, vehicle rental among them', async () => {
    const s = server(routes([fx.shop()])); restore = s.restore;
    const ui = await mountScreen(h(LocalPicksScreen, props));

    const said = ui.text();
    for (const label of ['Accommodation', 'Restaurants', 'Car rental', 'Tour guide']) {
      assert.match(said, new RegExp(label), `the ${label} chip is missing`);
    }
    ui.unmount();
  });

  test('choosing a category leaves only that category on screen', async () => {
    const s = server(routes([
      fx.shop({ id: 'a', name: 'Somewhere Koh Sichang', category: 'ที่พัก' }),
      fx.shop({ id: 'b', name: 'Islandish Cafe', category: 'ร้านอาหาร' }),
    ]));
    restore = s.restore;
    const ui = await mountScreen(h(LocalPicksScreen, props));
    assert.match(ui.text(), /Islandish Cafe/, 'everything should show before a category is chosen');

    await ui.press('Accommodation');
    const said = ui.text();
    assert.match(said, /Somewhere Koh Sichang/, 'the accommodation is missing');
    assert.doesNotMatch(said, /Islandish Cafe/, 'a restaurant survived the accommodation filter');
    ui.unmount();
  });

  /*
    THE ONE THAT MATTERS. Koh Sichang has eight businesses and eight
    categories, so most categories are empty and will stay empty. A chip that
    leads to a blank screen is indistinguishable from a chip that is broken.
  */
  test('a category with nothing in it says so, rather than going blank', async () => {
    const s = server(routes([fx.shop({ category: 'ที่พัก' })])); restore = s.restore;
    const ui = await mountScreen(h(LocalPicksScreen, props));

    await ui.press('Haircuts');
    assert.match(ui.text(), /Nothing listed here yet/, 'an empty category said nothing at all');
    ui.unmount();
  });

  test('an area with no businesses says so too', async () => {
    const s = server(routes([])); restore = s.restore;
    const ui = await mountScreen(h(LocalPicksScreen, props));
    assert.match(ui.text(), /Nothing listed here yet/, 'an empty area said nothing at all');
    ui.unmount();
  });

  test('a shop opens its own page', async () => {
    const opened: string[] = [];
    const s = server(routes([fx.shop({ id: 'novotel', name: 'Novotel Koh Si Chang' })]));
    restore = s.restore;
    const ui = await mountScreen(h(LocalPicksScreen, { ...props, onOpenShop: (id: string) => { opened.push(id); } }));

    await ui.press('Novotel Koh Si Chang');
    assert.deepEqual(opened, ['novotel'], 'the card did not open the shop');
    ui.unmount();
  });

  test('a dead endpoint is said out loud, not shown as an empty island', async () => {
    const s = server({ '/shops?area=samui': offline() }); restore = s.restore;
    const ui = await mountScreen(h(LocalPicksScreen, props));

    assert.doesNotMatch(ui.text(), /Nothing listed here yet/, 'a failed request was dressed up as an empty area');
    ui.unmount();
  });
});
