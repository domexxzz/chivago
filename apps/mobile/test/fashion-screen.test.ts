import { strict as assert } from 'node:assert';
import { afterEach, describe, test } from 'node:test';
import { createElement as h } from 'react';

import { COSTUMES, costumesFor } from '@chivago/core';
import { FashionScreen } from '../src/screens/FashionScreen.tsx';
import { mountScreen, server } from './interact.ts';

const account = {
  userId: 'traveller-1', accountType: 'traveller', businessName: null,
  fullName: 'ChivarGo Traveller', email: null, phone: null, username: 'traveller-1',
  bio: null, profilePhotoUrl: null, devices: [],
};

const standing = {
  hosts: [],
  you: { userId: 'traveller-1', displayName: 'ChivarGo Traveller', greenVerified: 300, missionsVerified: 2 },
  participants: 1,
  position: null,
  rankedBy: { en: 'Verified approvals only', th: 'เฉพาะการอนุมัติที่ตรวจแล้ว', zh: '仅已验证批准' },
};

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; });

describe('Fashion reads the traveller’s verified record', () => {
  test('shows the real deterministic collection and every available item', async () => {
    const s = server({ 'GET /account': account, 'GET /standing': standing }); restore = s.restore;
    const ui = await mountScreen(h(FashionScreen, { onBack: () => {} }));
    const said = ui.text();
    const earned = costumesFor({ travellerKey: account.userId, questsVerified: 2 });

    assert.match(said, new RegExp(`2 / ${COSTUMES.length}`));
    for (const award of earned) assert.match(said, new RegExp(award.costume.name.en));
    for (const costume of COSTUMES) assert.match(said, new RegExp(costume.name.en));
    assert.match(said, /Have a host verify one more quest/);
    ui.unmount();
  });
});
