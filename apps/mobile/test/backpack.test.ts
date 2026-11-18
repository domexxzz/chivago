/**
 * My Backpack — the adventure inventory.
 *
 * What these guard is the honesty of the thing, not its paint. A backpack is
 * the one screen whose whole job is to show what somebody already has, so
 * every slot on it is a claim: a gold reward square says a rank was reached,
 * a mascot says a province was visited, a pet says a companion was found.
 * Each test below is one of those claims refusing to be made without the data
 * behind it.
 *
 * The rail moved here from the Collect screen, so there is also a test that
 * it did not stay in both places. Two copies of a collection drift, and the
 * one that drifts is always the one nobody opened.
 */

import { strict as assert } from 'node:assert';
import { afterEach, describe, test } from 'node:test';
import { createElement as h } from 'react';
import { act } from 'react-test-renderer';
import { AccessibilityInfo } from 'react-native';

import { SPECIES, progressionFor, type Companion } from '@chivago/core';

import { WalletScreen } from '../src/screens/WalletScreen.tsx';
import { GameScreen } from '../src/screens/GameScreen.tsx';
import { NavigationRail } from '../src/components/Shell.tsx';
import { mountScreen, mount, server } from './interact.ts';
import { wallet } from './fixtures.ts';
import gashaponArt from '../assets/menu-travel-box-v1.png';

const noop = () => {};

const walletProps = {
  onOpenMarket: noop, onOpenAccount: noop, refreshKey: 0, notifications: [], unread: 0,
  onMarkRead: noop, onMarkAllRead: noop, onOpenQuest: noop, onOpenCompanion: noop,
};

const collection = (companions: Companion[]) => ({
  companions,
  summary: {
    found: companions.length,
    total: 5,
    grown: companions.filter((c) => c.stage === 'grown').length,
  },
  speciesAsOf: '2026-09-01',
});

const turtleEgg: Companion = {
  species: SPECIES.Safe,
  stage: 'egg',
  evidence: { layer: 'Safe', visitDays: 1, questsVerified: 0, walkedLegs: 0 } as never,
  nextStep: { en: 'Check in at 1 more Safe place', th: 'เช็กอินอีก 1 แห่ง', zh: '再签到 1 处' },
};

const turtle: Companion = { ...turtleEgg, stage: 'hatchling' };

/** The backpack's three fetches, with the test's own answers for each. */
const backpack = (over: {
  companions?: Companion[];
  exp?: number;
  evidence?: unknown[];
} = {}) => server({
  'GET /wallet': wallet({ progression: progressionFor(over.exp ?? 1560) }),
  'GET /companions': collection(over.companions ?? []),
  'GET /passport': { visited: [], selfReported: [], evidence: over.evidence ?? [] },
  'GET /vouchers': [],
});

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; });

describe('the collection lives in the backpack, and only there', () => {
  test('My Collection is on My Backpack', async () => {
    const net = backpack({ companions: [turtle] });
    restore = net.restore;
    const ui = await mountScreen(h(WalletScreen, walletProps));
    assert.match(ui.text(), /My collection/, 'the rail should be on the backpack');
    assert.ok(
      ui.labels().some((l) => /View all collections/.test(l)),
      'View All travelled with the rail',
    );
    ui.unmount();
  });

  test('View all opens the Collect lobby, which the rail no longer has a cell for', async () => {
    // The one door left to that layer on a wide screen. Without it, taking
    // Collect's cell would have stranded the lobby and everything behind it.
    let collect = 0;
    const net = backpack({ companions: [turtle] });
    restore = net.restore;
    const ui = await mountScreen(h(WalletScreen, {
      ...walletProps,
      onOpenCollect: () => { collect += 1; },
    }));

    await ui.press('View all collections');
    assert.equal(collect, 1);
    ui.unmount();
  });

  test('and it is no longer on the Collect screen', async () => {
    // Moved, not copied. A second copy is a second thing to keep in step.
    const net = server({
      'GET /companions': collection([turtle]),
      'GET /wallet': wallet(),
    });
    restore = net.restore;
    const ui = await mountScreen(h(GameScreen, {
      onOpenCompanion: noop, onOpenMascots: noop,
      onOpenParty: noop, onOpenWallet: noop, onOpenFashion: noop,
    }));
    assert.doesNotMatch(ui.text(), /My collection/, 'the rail should have left the Collect screen');
    assert.doesNotMatch(ui.text(), /Collect more, explore more/);
    ui.unmount();
  });
});

describe('discounts stay in the backpack with their real source', () => {
  test('the backpack uses the Gashapon name and the same machine art as Home', async () => {
    const net = server({
      'GET /wallet': wallet({ progression: progressionFor(1560) }),
      'GET /companions': collection([]),
      'GET /passport': { visited: [], selfReported: [], evidence: [] },
      'GET /vouchers': [
        { id: 'v1', offerId: 'o1', merchant: 'Island Cafe', title: 'Quest coupon', code: 'QUEST10', status: 'active', sourceKind: 'quest', sourceRef: 'quest-1', expiresAt: null },
        { id: 'v2', offerId: 'o2', merchant: 'Pier Shop', title: 'Box coupon', code: 'BOX10', status: 'active', sourceKind: 'gacha', sourceRef: 'reward-1', expiresAt: null },
      ],
    });
    restore = net.restore;
    const ui = await mountScreen(h(WalletScreen, walletProps));
    const gashapon = ui.find('Open Gashapon');
    assert.ok(gashapon, 'the Gashapon door remains accessible');
    assert.ok(
      gashapon.findAll((node) => node.props.source === gashaponArt).length > 0,
      'the backpack reuses the Home Gashapon artwork',
    );
    assert.match(ui.text(), /Quest reward/);
    assert.match(ui.text(), /Gashapon reward/);
    assert.doesNotMatch(ui.text(), /Traveller’s Box/);
    ui.unmount();
  });
});

describe('travel companions name only what the traveller holds', () => {
  test('the supplied explorer and dog are independent controls that return to idle', async () => {
    // react-native-web reports reduced motion in Node. Override only this
    // interaction test; the production hook still honours the real setting.
    const originalReducedMotion = AccessibilityInfo.isReduceMotionEnabled;
    AccessibilityInfo.isReduceMotionEnabled = async () => false;
    const net = backpack({ companions: [turtle] });
    restore = net.restore;
    const ui = await mountScreen(h(WalletScreen, walletProps));
    try {
      const boy = 'Greet the ChivaGo Explorer';
      const dog = 'Play with the ChivaGo Explorer Dog';

      assert.equal(ui.find(boy)?.props.accessibilityState.busy, false);
      assert.equal(ui.find(dog)?.props.accessibilityState.busy, false);
      await ui.press(boy);
      await ui.press(dog);
      assert.equal(ui.find(boy)?.props.accessibilityState.busy, true);
      assert.equal(ui.find(dog)?.props.accessibilityState.busy, true);

      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1_050)); });
      assert.equal(ui.find(boy)?.props.accessibilityState.busy, false);
      assert.equal(ui.find(dog)?.props.accessibilityState.busy, false);
    } finally {
      ui.unmount();
      AccessibilityInfo.isReduceMotionEnabled = originalReducedMotion;
    }
  });

  test('a traveller who has been nowhere is given no province mascot', async () => {
    // An emblem on this card is a claim that somebody went there.
    const net = backpack();
    restore = net.restore;
    const ui = await mountScreen(h(WalletScreen, walletProps));
    assert.ok(
      ui.labels().some((l) => /No province mascot yet/.test(l)),
      'an unvisited traveller should get the honest state, not an invented emblem',
    );
    ui.unmount();
  });

  test('a visited province puts its real emblem on the card', async () => {
    const net = backpack({
      evidence: [{ code: 'TH-20', layer: 'Green', visitDays: 2, questsVerified: 1 }],
    });
    restore = net.restore;
    const ui = await mountScreen(h(WalletScreen, walletProps));
    const mascotLabel = ui.labels().find((l) => /Open the Mascot collection/.test(l));
    assert.ok(mascotLabel, 'the mascot tile should still open the collection');
    assert.match(mascotLabel!, /emblem of Chon Buri/, 'the emblem should name the province visited');
    ui.unmount();
  });

  test('the mascot tile opens the mascot collection and the pet opens its companion', async () => {
    let mascots = 0;
    let opened: Companion | null = null;
    const net = backpack({
      companions: [turtle],
      evidence: [{ code: 'TH-20', layer: 'Green', visitDays: 2, questsVerified: 1 }],
    });
    restore = net.restore;
    const ui = await mountScreen(h(WalletScreen, {
      ...walletProps,
      onOpenMascots: () => { mascots += 1; },
      onOpenCompanion: (c: Companion) => { opened = c; },
    }));

    await ui.press(/Open the Mascot collection/);
    await ui.press(/^Green sea turtle, Hatchling$/);
    assert.equal(mascots, 1);
    assert.equal(opened?.species.key, 'green-turtle');
    ui.unmount();
  });

  test('no companion means a stated locked pet, never a silhouette to guess at', async () => {
    const net = backpack();
    restore = net.restore;
    const ui = await mountScreen(h(WalletScreen, walletProps));
    assert.match(ui.text(), /PET LOCKED/);
    assert.ok(
      ui.labels().some((l) => /No travel pet yet/.test(l)),
      'the empty state should say what it is, in words',
    );
    for (const species of Object.values(SPECIES)) {
      assert.doesNotMatch(
        ui.labels().join(' | '),
        new RegExp(`${species.name.en}, (Egg|Hatchling|Grown)`),
        `an empty backpack named ${species.name.en} as a pet`,
      );
    }
    ui.unmount();
  });

  test('an egg in the pet slot is named for its habitat, not its animal', async () => {
    const net = backpack({ companions: [turtleEgg] });
    restore = net.restore;
    const ui = await mountScreen(h(WalletScreen, walletProps));
    const pet = ui.labels().find((l) => /, Egg$/.test(l));
    assert.ok(pet, 'the pet tile should announce its stage');
    assert.match(pet!, /^Beach egg/, 'an egg is named for where it was found');
    assert.doesNotMatch(pet!, /Green sea turtle/, 'the egg gave away what is inside it');
    ui.unmount();
  });
});

describe('the reward inventory is the rank ladder, and nothing else', () => {
  test('a low level unlocks the first slot and locks the rest, each with its level', async () => {
    // Level 1: Newcomer earned, the other four locked and saying when.
    const net = backpack({ exp: 0 });
    restore = net.restore;
    const ui = await mountScreen(h(WalletScreen, walletProps));
    const said = ui.labels().join(' | ');

    assert.match(said, /Newcomer\. Unlocked/);
    for (const [rank, level] of [['Wanderer', 5], ['Island Explorer', 10], ['Samui Insider', 20], ['Chiva Legend', 35]] as const) {
      assert.match(said, new RegExp(`${rank}\\. Locked until level ${level}`), `${rank} should be locked`);
      assert.match(ui.text(), new RegExp(`Lv\\. ${level}`), `${rank} should show the level it opens at`);
    }
    ui.unmount();
  });

  test('a slot is never gold for a rank the progression has not reached', async () => {
    const data = wallet({ progression: progressionFor(0) });
    const net = backpack({ exp: 0 });
    restore = net.restore;
    const ui = await mountScreen(h(WalletScreen, walletProps));
    const said = ui.labels().join(' | ');

    for (const rank of data.progression.ladder) {
      assert.match(
        said,
        new RegExp(`${rank.label.en}\\. ${rank.earned ? 'Unlocked' : 'Locked until level'}`),
        `${rank.label.en} was announced against its own progression row`,
      );
    }
    ui.unmount();
  });
});

describe('the two purses stay two different things', () => {
  test('Green and Trip each carry their own figure and where it came from', async () => {
    const net = backpack();
    restore = net.restore;
    const ui = await mountScreen(h(WalletScreen, walletProps));
    const said = ui.labels().join(' | ');

    // Each purse announces its own figure AND the sentence that tells the two
    // apart. A screen reader that said "1,240" and "320" alone would hand over
    // the exact confusion the side-by-side layout exists to prevent.
    assert.match(said, /1,240 Green Points\. Verified by a host/);
    assert.match(said, /320 Trip Points\. Earned as you explore/);
    assert.doesNotMatch(said, /1,240 Trip Points|320 Green Points/);
    assert.match(ui.text(), /Star Points/, 'the game inventory should name the verified purse as an item');
    assert.match(ui.text(), /Travel Flags/, 'the game inventory should name the exploration purse as an item');
    ui.unmount();
  });
});

describe('on a rail the fourth cell is the backpack, not Collect', () => {
  test('the cell takes Collect’s place, keeps its position, and opens the wallet', async () => {
    let opened = 0;
    let tab: string | null = null;
    const ui = mount(h(NavigationRail, {
      active: 'home',
      onChange: (key: string) => { tab = key; },
      onOpenBackpack: () => { opened += 1; },
      backpackActive: false,
    }));

    await ui.press('My Backpack');
    assert.equal(opened, 1, 'the backpack cell should open the backpack');
    assert.equal(tab, null, 'and it should not be a tab switch in disguise');

    assert.equal(ui.find('Collect'), undefined, 'Collect should not also have a cell');
    assert.deepEqual([...new Set(ui.labels())], ['Home', 'Map', 'Game&Quest', 'My Backpack']);
    ui.unmount();
  });

  test('without a backpack wired the rail is the mobile bar, Collect and all', async () => {
    // The component still stands on its own; the swap is the app's choice.
    let tab: string | null = null;
    const ui = mount(h(NavigationRail, {
      active: 'home',
      onChange: (key: string) => { tab = key; },
    }));

    assert.deepEqual([...new Set(ui.labels())], ['Home', 'Map', 'Game&Quest', 'Collect']);
    await ui.press('Collect');
    assert.equal(tab, 'game');
    ui.unmount();
  });

  test('on the backpack the cell reads selected, and pressing it does not stack a second copy', async () => {
    let opened = 0;
    const ui = mount(h(NavigationRail, {
      active: 'home',
      onChange: noop,
      onOpenBackpack: () => { opened += 1; },
      backpackActive: true,
    }));

    assert.equal(ui.find('My Backpack')?.props.accessibilityState?.selected, true);
    assert.equal(ui.find('Home')?.props.accessibilityState?.selected, false,
      'Home should not read as selected while the backpack is open');

    await ui.press('My Backpack');
    assert.equal(opened, 0, 'the cell you are already on should not push again');
    ui.unmount();
  });

  test('the rail looks the same on the backpack as it does anywhere else', async () => {
    // It used to wear canvas and leather straps here. Navigation that
    // restyles itself per destination makes the reader re-check, every time,
    // whether they are still looking at the same five things.
    const railStyle = (backpackActive: boolean) => {
      const ui = mount(h(NavigationRail, {
        active: 'home', onChange: noop, onOpenBackpack: noop, backpackActive,
      }));
      const rail = ui.root.findAll((n) => n.props.accessibilityRole === 'tablist', { deep: true })[0];
      const style = JSON.stringify(rail?.props.style);
      ui.unmount();
      return style;
    };

    assert.equal(railStyle(true), railStyle(false), 'the rail changed skin on the backpack');
  });

  test('the whole Collect layer keeps the backpack cell lit, so nothing is stranded', async () => {
    // `active` is 'game' for the lobby, the mascots, the medals, the
    // passport — every screen that tab owns. With no cell of its own, the
    // rail would otherwise show a tablist with nothing selected.
    const ui = mount(h(NavigationRail, {
      active: 'game',
      onChange: noop,
      onOpenBackpack: noop,
      backpackActive: true,
    }));

    assert.equal(ui.find('My Backpack')?.props.accessibilityState?.selected, true);
    ui.unmount();
  });
});

/*
  A LOCKED REWARD HAS TO SAY WHAT OPENS IT.

  Twelve rank tiles used to draw a hover and a press scale and then do
  nothing at all - they looked exactly as pressable as the medals beside
  them, which do open a screen. The locked ones are the tiles a traveller
  taps hardest, because the padlock says "not yet" without saying what
  "yet" costs.

  Every number in the answer is the ladder's own: 1560 EXP is level 3, and
  Wanderer opens at level 5, so the gap is two. Nothing here is written
  into the test that the progression does not compute - the level came from
  `progressionFor`, not from this file.
*/
describe('a reward tile answers when it is pressed', () => {
  test('a locked rank says the level it opens at and how far away that is', async () => {
    const net = backpack();
    restore = net.restore;
    const ui = await mountScreen(h(WalletScreen, walletProps));
    try {
      const before = ui.text();
      assert.ok(!/Opens at level 5/.test(before), 'the explanation must not be on screen already');

      await ui.press(/^Wanderer\./);
      const after = ui.text();
      assert.match(after, /Opens at level 5/);
      assert.match(after, /You are level 3/);
      assert.match(after, /2 to go/);
    } finally { ui.unmount(); }
  });

  test('an unlocked rank says so, rather than explaining a requirement already met', async () => {
    const net = backpack();
    restore = net.restore;
    const ui = await mountScreen(h(WalletScreen, walletProps));
    try {
      await ui.press(/^Newcomer\./);
      const said = ui.text();
      assert.match(said, /Unlocked/);
      assert.ok(!/to go/.test(said.split('Unlocked')[1] ?? ''), 'nothing is owed on a rank already held');
    } finally { ui.unmount(); }
  });
});
