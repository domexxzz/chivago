import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { createElement as h } from 'react';

import { NavigationRail, TabBar } from '../src/components/Shell.tsx';
import { mount } from './interact.ts';

describe('desktop rail application menus', () => {
  test('Community, Local Picks and Profile follow the primary menus and open their real routes', async () => {
    let opened = '';
    const ui = mount(h(NavigationRail, {
      active: 'home',
      onChange: () => {},
      onOpenBackpack: () => {},
      onOpenCommunity: () => { opened = 'community'; },
      onOpenConnectApp: () => { opened = 'connectApp'; },
      onOpenProfile: () => { opened = 'profile'; },
    }));

    const labels = [...new Set(ui.labels())];
    assert.deepEqual(labels, [
      'Home', 'Map', 'Game&Quest', 'My Backpack', 'Community', 'Local Picks', 'Profile',
    ]);
    await ui.press('Community');
    assert.equal(opened, 'community');
    await ui.press('Local Picks');
    assert.equal(opened, 'connectApp');
    await ui.press('Profile');
    assert.equal(opened, 'profile');
    ui.unmount();
  });

  test('each added menu reports its active state and does not reopen itself', async () => {
    let opened = 0;
    const ui = mount(h(NavigationRail, {
      active: 'home',
      onChange: () => {},
      onOpenBackpack: () => {},
      onOpenCommunity: () => { opened += 1; },
      communityActive: true,
      onOpenConnectApp: () => { opened += 1; },
    }));

    assert.equal(ui.find('Community')?.props.accessibilityState?.selected, true);
    assert.equal(ui.find('Home')?.props.accessibilityState?.selected, false);
    await ui.press('Community');
    assert.equal(opened, 0);
    ui.unmount();
  });

  test('Profile reports its active state and does not reopen itself', async () => {
    let opened = 0;
    const ui = mount(h(NavigationRail, {
      active: 'home',
      onChange: () => {},
      onOpenBackpack: () => {},
      onOpenProfile: () => { opened += 1; },
      profileActive: true,
    }));

    assert.equal(ui.find('Profile')?.props.accessibilityState?.selected, true);
    assert.equal(ui.find('Home')?.props.accessibilityState?.selected, false);
    await ui.press('Profile');
    assert.equal(opened, 0);
    ui.unmount();
  });
});

describe('mobile application menu', () => {
  test('shows Home, Map, Game, Collect and Local Picks in that order', async () => {
    let selected = '';
    let openedPicks = 0;
    const ui = mount(h(TabBar, {
      active: 'home',
      onChange: (key: string) => { selected = key; },
      onOpenLocalPicks: () => { openedPicks += 1; },
    }));

    assert.deepEqual([...new Set(ui.labels())], ['Home', 'Map', 'Game', 'Collect', 'Local Picks']);
    await ui.press('Game');
    assert.equal(selected, 'quests');
    await ui.press('Collect');
    assert.equal(selected, 'game');
    await ui.press('Local Picks');
    assert.equal(openedPicks, 1);
    ui.unmount();
  });
});
