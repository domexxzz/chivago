import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { createElement as h } from 'react';

import { SPECIES, type Companion } from '@chivago/core';
import { MyCollection } from '../src/components/MyCollection.tsx';
import { mountScreen } from './interact.ts';

describe('My collection in My Backpack', () => {
  test('shows every habitat without revealing an unfound species', async () => {
    const ui = await mountScreen(h(MyCollection, {
      companions: [],
      onOpenCompanion: () => {},
      onOpenMascots: () => {},
      onOpenSummon: () => {},
    }));
    const said = ui.text();

    assert.match(said, /My collection/);
    for (const species of Object.values(SPECIES)) {
      assert.ok(said.includes(species.eggName.en), `no tile for ${species.eggName.en}`);
      assert.ok(!said.includes(species.name.en), `the egg gave away ${species.name.en}`);
    }

    const safe = SPECIES.Safe;
    await ui.press(new RegExp(`^${safe.eggName.en}, not found yet`));
    assert.match(ui.text(), new RegExp(safe.habitat.en));
    assert.match(ui.text(), /A companion arrives on your second day in this habitat/);
    await ui.press('Close');
    ui.unmount();
  });

  test('opens a found companion, Mascot and Summoning from the backpack rail', async () => {
    const turtle: Companion = {
      species: SPECIES.Safe,
      stage: 'hatchling',
      evidence: { layer: 'Safe', visitDays: 2, questsVerified: 0, walkedLegs: 0 } as never,
      nextStep: { en: 'Finish one verified quest', th: 'ทำภารกิจที่ยืนยันแล้วหนึ่งครั้ง' },
    };
    let opened: Companion | null = null;
    let mascots = 0;
    let summons = 0;
    const ui = await mountScreen(h(MyCollection, {
      companions: [turtle],
      onOpenCompanion: (companion: Companion) => { opened = companion; },
      onOpenMascots: () => { mascots += 1; },
      onOpenSummon: () => { summons += 1; },
    }));

    await ui.press(/^Green sea turtle, Hatchling/);
    await ui.press('The seventy-seven province emblems');
    await ui.press(/^The Summoning:/);
    assert.equal(opened?.species.key, 'green-turtle');
    assert.deepEqual([mascots, summons], [1, 1]);
    ui.unmount();
  });
});
