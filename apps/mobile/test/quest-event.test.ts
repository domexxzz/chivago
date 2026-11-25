/** A campus activity with dates and seats, on the two screens that show it. */
import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';

import { QuestDetailScreen } from '../src/screens/QuestDetail.tsx';
import { QuestRow } from '../src/screens/MissionsScreen.tsx';
import { __setLocaleForTests } from '../src/i18n/locale.ts';
import { mount, mountScreen, refuses, server } from './interact.ts';
import * as fx from './fixtures.ts';

const noop = () => {};
const soon = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
const event = (change = {}) => ({ startsAt: soon(24), endsAt: soon(27), seats: 20, taken: 14, closed: false, ...change });
const quest = (change = {}) => fx.quest({ id: 'hq-1', code: 'H-1A2B3C', event: event(change) });

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; __setLocaleForTests('en'); });

const open = async (q: unknown, progress: unknown = null, more = {}) => {
  const s = server({ '/quests/hq-1': { quest: q, progress }, ...more });
  restore = s.restore;
  const ui = await mountScreen(h(QuestDetailScreen, {
    questId: 'hq-1', onBack: noop, onOpenWallet: noop, onToast: (m: string) => { said.push(m); }, onPointsChanged: noop,
  }));
  return { ui, calls: s };
};
let said: string[] = [];
const joined = {
  userId: 'u', questId: 'hq-1', stage: 'joined', joinedAt: soon(-1), arrivedAt: null, proofSubmittedAt: null,
  verifiedAt: null, rejectedAt: null, rejectionReason: null, weightKg: null,
};

describe('the activity page', () => {
  test('says how many places are left, and offers one', async () => {
    const { ui } = await open(quest());
    assert.match(ui.text(), /6 of 20 places left/);
    assert.match(ui.text(), /Join/);
    ui.unmount();
  });

  for (const [what, change, words] of [
    ['full', { taken: 20 }, /Every place is taken/],
    ['closed', { closed: true }, /Closed by the organiser/],
    ['over', { startsAt: soon(-5), endsAt: soon(-2) }, /This activity is over/],
  ] as const) {
    test(`offers nothing to press when it is ${what}`, async () => {
      const { ui } = await open(quest(change));
      assert.match(ui.text(), words);
      await assert.rejects(ui.press(/^Join/), /no pressable/);
      ui.unmount();
    });
  }

  test('lets somebody with a place give it up', async () => {
    said = [];
    const { ui, calls } = await open(quest(), joined, { '/quests/hq-1/leave': { left: true } });
    await ui.press(/Give up my place/);
    assert.ok(calls.calls.some((c) => c.path === '/quests/hq-1/leave' && c.method === 'POST'));
    ui.unmount();
  });

  test('says why, when the server will not give one', async () => {
    said = [];
    const { ui } = await open(quest(), joined, { '/quests/hq-1/leave': refuses('INVALID_TRANSITION', 'x') });
    await ui.press(/Give up my place/);
    assert.deepEqual(said, ['This status cannot be changed that way.']);
    ui.unmount();
  });

  test('is in Thai for a Thai reader', async () => {
    __setLocaleForTests('th');
    const { ui } = await open(quest());
    assert.match(ui.text(), /เหลือ 6 จาก 20 ที่/);
    ui.unmount();
  });

  test('a quest without dates has no such panel', async () => {
    const { ui } = await open(fx.quest({ id: 'hq-1' }));
    assert.doesNotMatch(ui.text(), /When and how many/);
    ui.unmount();
  });
});

describe('a join the server turns away', () => {
  test('is explained in the reader’s language, not the server’s', async () => {
    said = [];
    __setLocaleForTests('th');
    const { ui } = await open(quest(), null, { '/quests/hq-1/join': refuses('QUEST_FULL', 'Every place is taken.') });
    await ui.press(/เข้าร่วม/);
    assert.match(said.join(), /ที่เต็มแล้ว/);
    ui.unmount();
  });
});

describe('the row in the list', () => {
  test('carries the date and the seats, in Thailand’s clock', () => {
    const q = fx.quest({ event: { startsAt: '2026-12-04T02:00:00.000Z', endsAt: '2026-12-04T05:00:00.000Z', seats: 5, taken: 1, closed: false } });
    const ui = mount(h(QuestRow, { quest: q, progress: null, onPress: noop }));
    assert.match(ui.text(), /09:00–12:00/);
    ui.unmount();
  });
});
