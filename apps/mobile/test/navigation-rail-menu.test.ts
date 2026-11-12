import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { createElement as h } from 'react';

import { NavigationRail } from '../src/components/Shell.tsx';
import { mount } from './interact.ts';

describe('desktop rail application menus', () => {
  test('Community and Connect App sit before Safety and open their real routes', async () => {
    let opened = '';
    const ui = mount(h(NavigationRail, {
      active: 'home',
      onChange: () => {},
      onOpenBackpack: () => {},
      onOpenCommunity: () => { opened = 'community'; },
      onOpenConnectApp: () => { opened = 'connectApp'; },
    }));

    const labels = [...new Set(ui.labels())];
    assert.deepEqual(labels, [
      'Home', 'Map', 'Games & Quests', 'My Backpack', 'Community', 'Connect App', 'Safety',
    ]);
    await ui.press('Community');
    assert.equal(opened, 'community');
    await ui.press('Connect App');
    assert.equal(opened, 'connectApp');
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
});
