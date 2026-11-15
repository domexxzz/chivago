import { strict as assert } from 'node:assert';
import { test, describe, mock, afterEach, beforeEach } from 'node:test';
import { createElement as h } from 'react';
import { Linking } from 'react-native';

import { LocalPicksScreen } from '../src/screens/LocalPicksScreen.tsx';
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

/**
 * Koniix Garden Cottage — a stay carried by its coordinate.
 *
 * The owner gave a name and a point on 15 November, and that is ALL this app
 * knows about it: no licensed photograph, no confirmed telephone number, no
 * rooms, no price. It is also not in OpenStreetMap, checked 250 m around the
 * point, which is why it is a pick and not a map place - `sichang.test.ts`
 * requires every island place to be a mapped feature with a team photograph,
 * and refuses a named business on the map besides.
 *
 * So these tests guard the SHAPE OF THE CLAIM: the card offers the one thing
 * that is true, which is where it is, and nothing that would read as a
 * listing nobody confirmed.
 */
describe('the stay on the island', () => {
  test('appears under Accommodation, which was an empty category before it', async () => {
    const ui = await mountScreen(h(LocalPicksScreen, props));

    await ui.press('Category: All');
    await ui.press('Accommodation');
    const said = ui.text();

    assert.match(said, /Koniix Garden Cottage/);
    assert.doesNotMatch(said, /No recommendations yet/, 'the category is no longer empty');
    ui.unmount();
  });

  test('navigates with the app’s own navigator, carrying the coordinate', async () => {
    /*
      Not a Google link and not a map of its own: `navigationProviderFor`
      keeps a Koh Sichang destination in the island's router, and a third
      answer to "how do I get there" on a screen that already has two would
      be the one that is wrong on the day.
    */
    const seen: { id: string; lat: number; lng: number }[] = [];
    const ui = await mountScreen(h(LocalPicksScreen, {
      ...props,
      onNavigate: (d: { id: string; lat: number; lng: number }) => { seen.push(d); },
    }));

    await ui.press('Koniix Garden Cottage');
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.id, 'koniix-garden-cottage');
    assert.deepEqual([seen[0]?.lat, seen[0]?.lng], [13.156753, 100.808781], 'the point the owner gave');
    ui.unmount();
  });

  test('claims nothing it was not told: no price, no phone, no rating, no stars', async () => {
    /*
      THE RULE, not the layout. docs/61: a listing is the business's own
      claim, and this app invents none on their behalf. A card that filled
      the empty fields of a listing - "from ฿1,200", "4.8", "open daily" -
      would be ChivarGo making those claims about a real business that never
      made them.
    */
    const ui = await mountScreen(h(LocalPicksScreen, props));
    await ui.press('Category: All');
    await ui.press('Accommodation');
    const said = ui.text();

    assert.doesNotMatch(said, /฿|THB|\bbaht\b/i, 'no price was given, so none is shown');
    assert.doesNotMatch(said, /\b0[0-9][- ]?[0-9]{3}[- ]?[0-9]{4}\b/, 'no telephone number was given');
    assert.doesNotMatch(said, /★|⭐|\b[0-5]\.[0-9]\s*\/\s*5\b/, 'nobody has reviewed it here');
    ui.unmount();
  });
});

/**
 * Solution Connect — the paid surface, next to the unpaid one.
 *
 * These are not layout tests. Connect is where a partner PAYS to appear, on a
 * screen whose other half is "the island's own businesses" - and the one way
 * that arrangement goes wrong is silently, by a traveller reading a placement
 * as a recommendation. The disclosure is therefore a behaviour, tested like
 * any other, and the two assertions that matter are that it is always said
 * and that a partner never appears as a result of a category.
 */
describe('Solution Connect', () => {
  test('names the partner in their own words, and says the place is paid for', async () => {
    const ui = await mountScreen(h(LocalPicksScreen, props));
    const said = ui.text();

    assert.match(said, /Solution Connect/i);
    assert.match(said, /Sentiara AI/);
    // The partner's own description, labelled as the partner's.
    assert.match(said, /on-premise AI/i);
    assert.match(said, /stated by the provider/i);
    // And the sentence the whole arrangement depends on.
    assert.match(said, /not a ChivarGo recommendation/i);
    ui.unmount();
  });

  test('opens the partner’s own site, not a page inside ChivarGo', async () => {
    /*
      The revenue model's own wording: a link straight to the partner's site.
      An in-app surface built around their product would be ChivarGo hosting
      a claim it cannot check.
    */
    const opened = mock.method(Linking, 'openURL', async () => true);
    const ui = await mountScreen(h(LocalPicksScreen, props));

    await ui.press('Sentiara AI');
    assert.deepEqual(
      opened.mock.calls.map((call) => call.arguments[0]),
      ['https://sentiaratech.com/'],
    );
    ui.unmount();
    opened.mock.restore();
  });

  test('a partner is never a category result, and never fills an empty category', async () => {
    /*
      THE RULE WORTH GUARDING. Food has no businesses yet and says so. If a
      paid card could be drawn into that gap - or into the category list at
      all - the empty state would quietly become an advert, and the traveller
      would have asked for restaurants and been sold something else.
    */
    const ui = await mountScreen(h(LocalPicksScreen, props));

    await ui.press('Category: All');
    await ui.press('Food');
    const said = ui.text();

    assert.match(said, /No recommendations yet/, 'the empty category still admits it is empty');
    assert.match(said, /Sentiara AI/, 'and Connect is still there, beside it rather than inside it');
    assert.match(said, /not a ChivarGo recommendation/, 'still disclosed in the empty category');
    ui.unmount();
  });
});
