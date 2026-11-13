import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { createElement as h } from 'react';

import { ConnectAppScreen } from '../src/screens/ConnectAppScreen.tsx';
import { mountScreen } from './interact.ts';

describe('Local Picks shell', () => {
  test('has the shared header and returns to the previous screen', async () => {
    let backCount = 0;
    const ui = await mountScreen(h(ConnectAppScreen, {
      onBack: () => { backCount += 1; },
    }));

    assert.match(ui.text(), /Local Picks/);
    await ui.press(/Back/i);
    assert.equal(backCount, 1);
    ui.unmount();
  });
});
