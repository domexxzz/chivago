import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { createElement as h } from 'react';
import { ImpactScreen } from '../src/screens/ImpactScreen.tsx';
import { Body } from '../src/components/Type.tsx';
import { color } from '../src/theme/index.ts';
import { mountScreen, refuses, server } from './interact.ts';

const empty = { pending: 0, planted: 0, lines: [] };
const base = {
  'GET /impact/me': [],
  'GET /impact/community': { year: 2026, metrics: [] },
  'GET /wellness/balance': { total: null, days: 0, components: [], note: { en: 'Not enough of the trip yet', th: 'ข้อมูลยังไม่พอ' } },
};
const props = { onToast: () => {}, refreshKey: 0 };
const proof = {
  id: 'plant-1', userId: 'ana', sponsorId: 'sponsor-1', questId: 'quest-1', trees: 2,
  partner: 'Test planting partner', plantedAt: '2026-09-20T00:00:00.000Z',
  lat: 9.51, lng: 100.01,
  photo: { url: 'https://example.org/tree.jpg', credit: 'Test photographer', licence: 'CC BY 4.0' },
};
const line = {
  sponsorId: 'sponsor-1', questId: 'quest-1', treesPerVerified: 3,
  sponsorName: { en: 'Signed sponsor', th: 'ผู้สนับสนุนที่ลงนาม' },
  questName: { en: 'Beach cleanup', th: 'เก็บขยะชายหาด' },
};

describe('the traveller tree card', () => {
  test('fetches its own impact and hides the tree box when there are no entries', async () => {
    const net = server({ ...base, 'GET /impact/trees': empty });
    try {
      const ui = await mountScreen(h(ImpactScreen, props));
      assert.ok(net.calls.some((c) => c.path === '/impact/trees'));
      assert.doesNotMatch(ui.text(), /Your sponsored trees|No signed tree promise/);
      assert.doesNotMatch(ui.text(), /Sponsored by|planting photo|Test planting partner/);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('a sponsor promise stays pending without evidence and never reads as planted', async () => {
    const net = server({ ...base, 'GET /impact/trees': {
      pending: 3, planted: 0, lines: [{ ...line, pending: 3, planted: 0, evidence: [] }],
    } });
    try {
      const ui = await mountScreen(h(ImpactScreen, props));
      const said = ui.text();
      assert.match(said, /3 PROMISED · NOT YET PLANTED/);
      assert.match(said, /0 PLANTED · WITH PROOF/);
      assert.match(said, /Signed sponsor · 3 per verified quest/);
      assert.match(said, /3 still promised, not planted/);
      assert.doesNotMatch(said, /Test planting partner|View planting photo/);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('only evidenced trees move into planted and show who, when, where, and photo credit', async () => {
    const net = server({ ...base, 'GET /impact/trees': {
      pending: 1, planted: 2, lines: [{ ...line, pending: 1, planted: 2, evidence: [proof] }],
    } });
    try {
      const ui = await mountScreen(h(ImpactScreen, props));
      const said = ui.text();
      assert.match(said, /1 PROMISED · NOT YET PLANTED/);
      assert.match(said, /2 PLANTED · WITH PROOF/);
      assert.match(said, /2 planted by Test planting partner on 2026-09-20/);
      assert.match(said, /9\.51, 100\.01 · Test photographer · CC BY 4\.0/);
      const photo = ui.find('View planting photo');
      assert.ok(photo, 'the credited photo must be accessible');
      assert.equal(photo.findAllByType(Body)[0]?.props.colour, color.brand);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('a tree service error is visible while the rest of impact remains usable', async () => {
    const net = server({ ...base,
      'GET /impact/me': [{ key: 'waste', label: { en: 'Waste collected', th: 'ขยะ' }, value: 12, unit: 'kg' }],
      'GET /impact/trees': refuses('TREES_DOWN', 'Tree impact is unavailable.'),
    });
    try {
      const ui = await mountScreen(h(ImpactScreen, props));
      assert.match(ui.text(), /Tree impact is unavailable/);
      assert.match(ui.text(), /12 kg/);
      assert.doesNotMatch(ui.text(), /No signed tree promise/, 'an error is not an empty result');
      ui.unmount();
    } finally { net.restore(); }
  });
});
