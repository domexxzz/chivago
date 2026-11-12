import { strict as assert } from 'node:assert';
import { afterEach, describe, test } from 'node:test';
import { createElement as h } from 'react';

import { EditProfileScreen } from '../src/screens/EditProfileScreen.tsx';
import { mountScreen, server } from './interact.ts';

const account = {
  userId: 'traveller-1', accountType: 'traveller' as const, businessName: null,
  fullName: 'Existing Name', username: 'existing', email: 'existing@example.com',
  phone: '0812345678', bio: 'Existing bio', profilePhotoUrl: null, devices: [],
};

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; });

describe('leaving the edit profile screen', () => {
  test('goes back immediately when nothing changed', async () => {
    let backed = 0;
    const net = server({ 'GET /account': account }); restore = net.restore;
    const ui = await mountScreen(h(EditProfileScreen, { onBack: () => { backed += 1; } }));
    await ui.press('Back');
    assert.equal(backed, 1);
    assert.doesNotMatch(ui.text(), /Unsaved changes/);
    ui.unmount();
  });

  test('offers save, discard, and continue editing after a change', async () => {
    let backed = 0;
    const net = server({ 'GET /account': account }); restore = net.restore;
    const ui = await mountScreen(h(EditProfileScreen, { onBack: () => { backed += 1; } }));
    await ui.type('Changed Name', 'Display name');
    await ui.press('Back');
    assert.match(ui.text(), /Unsaved changes/);
    assert.match(ui.text(), /Save changes/);
    assert.match(ui.text(), /Leave without saving/);
    assert.match(ui.text(), /Continue editing/);
    assert.equal(backed, 0);

    await ui.pressText('Continue editing');
    assert.doesNotMatch(ui.text(), /Would you like to save/);
    await ui.press('Back');
    await ui.pressText('Leave without saving');
    assert.equal(backed, 1);
    ui.unmount();
  });

  test('saves from the prompt before leaving', async () => {
    let saved = 0;
    const net = server({
      'GET /account': account,
      'PUT /account/profile': { ...account, fullName: 'Saved Name' },
    });
    restore = net.restore;
    const ui = await mountScreen(h(EditProfileScreen, { onBack: () => {}, onSaved: () => { saved += 1; } }));
    await ui.type('Saved Name', 'Display name');
    await ui.press('Back');
    await ui.pressText('Save changes');
    assert.equal(saved, 1);
    ui.unmount();
  });
});
