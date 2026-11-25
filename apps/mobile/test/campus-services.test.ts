/** The way in to what a university already runs, the note kept afterwards, and the faculty card. */
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { Linking } from 'react-native';
import type { RoomReminder } from '@chivago/core';

import { CampusServicesScreen } from '../src/screens/CampusServicesScreen.tsx';
import { HomeScreen } from '../src/screens/HomeScreen.tsx';
import { setOfflineStorageForTests } from '../src/offline/storage.ts';
import { forgetRoom, markCollected, noteRoom, readRooms } from '../src/state/room-reminders.ts';
import { __setAreaForTests } from '../src/state/area.ts';
import { __setLocaleForTests } from '../src/i18n/locale.ts';
import { mountScreen, server, settle } from './interact.ts';
import * as fx from './fixtures.ts';

const noop = () => {};
let restore: (() => void) | null = null;
let kept = new Map<string, string>();
let said: string[] = [];

beforeEach(() => {
  kept = new Map();
  said = [];
  setOfflineStorageForTests({
    get: async (k) => kept.get(k) ?? null,
    set: async (k, v) => { kept.set(k, v); },
    delete: async (k) => { kept.delete(k); },
    keys: async () => [...kept.keys()],
  });
  __setAreaForTests('rmutt');
});
afterEach(() => {
  mock.restoreAll(); restore?.(); restore = null;
  setOfflineStorageForTests(null); __setAreaForTests('samui'); __setLocaleForTests('en');
});

const open = async (student: unknown = null, more: Record<string, unknown> = {}) => {
  const s = server({ '/campus/student': { student }, ...more } as never);
  restore = s.restore;
  const opened = mock.method(Linking, 'openURL', async () => true);
  const ui = await mountScreen(h(CampusServicesScreen, { onBack: noop, onOpenQuests: noop, onToast: (m: string) => { said.push(m); } }));
  await settle();
  return { ui, calls: s.calls, opened: () => opened.mock.calls.map((c) => c.arguments[0] as string) };
};

describe('booking and services at RMUTT', () => {
  test('a room is booked in the university’s system, with the rules said first', async () => {
    const { ui, opened } = await open();
    assert.match(ui.text(), /Three hours a day each/);
    assert.match(ui.text(), /within 15 minutes/);
    await ui.press(/Open the library’s table/);
    assert.deepEqual(opened(), ['https://booking.rmutt.ac.th/booking-table?b=101']);
    ui.unmount();
  });

  test('it never says a room is free, and says that it does not know', async () => {
    const { ui } = await open();
    assert.match(ui.text(), /does not know which rooms are free/);
    assert.doesNotMatch(ui.text(), /\bavailable\b|free now/i);
    ui.unmount();
  });

  test('every other building is one tap further', async () => {
    const { ui, opened } = await open();
    assert.doesNotMatch(ui.text(), /Architecture Building/);
    await ui.press(/All 14 buildings/);
    await ui.press(/Architecture Building/);
    assert.deepEqual(opened(), ['https://booking.rmutt.ac.th/booking-table?b=111']);
    ui.unmount();
  });

  test('a number is dialled as digits, and says whose it is to a screen reader', async () => {
    const { ui, opened } = await open();
    await ui.press(/Call Clinic 0 2549 4010/);
    assert.deepEqual(opened(), ['tel:025494010']);
    ui.unmount();
  });

  test('says where it was read and that nobody has confirmed it', async () => {
    __setLocaleForTests('th');
    const { ui } = await open();
    assert.match(ui.text(), /ยังไม่ได้ยืนยันกับหน่วยงาน และไม่ใช่ความร่วมมือ/);
    ui.unmount();
  });

  test('a campus nobody has read says so', async () => {
    __setAreaForTests('ku-sriracha');
    const { ui } = await open();
    assert.match(ui.text(), /Nothing has been read/);
    ui.unmount();
  });
});

const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
const room = (change: Partial<RoomReminder> = {}): RoomReminder => ({
  id: 'r1', buildingId: 'library', buildingName: { en: 'Central Library', th: 'หอสมุด' }, room: 'Discussion 4-2',
  startsAt: inMinutes(-3), endsAt: inMinutes(57), collectWithinMin: 15, collected: false, ...change,
});

describe('a room somebody noted', () => {
  test('is kept on the phone and nowhere else', async () => {
    const { calls, ui } = await open();
    ui.unmount();
    const before = calls.length;
    const noted = await noteRoom(room());
    assert.equal(noted.kept, true);
    assert.equal(calls.length, before, 'nothing was sent');
    assert.equal((await readRooms()).length, 1);
    assert.equal((await markCollected('r1'))[0]!.collected, true);
    assert.deepEqual(await forgetRoom('r1'), []);
  });

  test('counts down to the key, and stops once it is collected', async () => {
    await noteRoom(room());
    const { ui } = await open();
    assert.match(ui.text(), /Collect the key now/);
    assert.match(ui.text(), /1[12]:\d\d/);
    await ui.press(/I have the key/);
    await settle();
    assert.match(ui.text(), /In use/);
    assert.doesNotMatch(ui.text(), /Collect the key now/);
    ui.unmount();
  });

  test('nothing in storage, or nonsense, is simply no rooms', async () => {
    assert.deepEqual(await readRooms(), []);
    kept.set('chivago.roomReminders', '{"not":"a list"}');
    assert.deepEqual(await readRooms(), []);
    kept.set('chivago.roomReminders', 'not json');
    assert.deepEqual(await readRooms(), []);
    kept.set('chivago.roomReminders', JSON.stringify([room(), { id: 'half' }]));
    assert.equal((await readRooms()).length, 1);
  });

  test('a phone that will not keep it says so rather than pretending', async () => {
    setOfflineStorageForTests({
      get: async () => null, set: async () => { throw new Error('full'); }, delete: async () => {}, keys: async () => [],
    });
    assert.equal((await noteRoom(room())).kept, false);
  });

  test('yesterday’s is gone', async () => {
    kept.set('chivago.roomReminders', JSON.stringify([room({ startsAt: inMinutes(-3000), endsAt: inMinutes(-2900) })]));
    assert.deepEqual(await readRooms(), []);
  });

  test('can be written from the screen', async () => {
    const { ui } = await open();
    await ui.press(/I booked a room/);
    await ui.press(/^Tomorrow$/);
    await ui.press(/^09:00$/);
    await ui.press(/^2 h$/);
    await ui.type('Discussion 2-1');
    await ui.press(/^Note it$/);
    await settle();
    const [noted] = await readRooms();
    assert.equal(noted!.room, 'Discussion 2-1');
    assert.equal(noted!.collectWithinMin, 15);
    assert.equal((Date.parse(noted!.endsAt) - Date.parse(noted!.startsAt)) / 3_600_000, 2);
    assert.equal(said.length, 1);
    ui.unmount();
  });

  test('over the library’s three hours it says so', async () => {
    const { ui } = await open();
    await ui.press(/I booked a room/);
    await ui.press(/^Tomorrow$/);
    await ui.press(/^09:00$/);
    await ui.press(/^3 h$/);
    assert.doesNotMatch(ui.text(), /allows 3 hours/);
    await ui.type('Discussion 2-1');
    await ui.press(/^Note it$/);
    await settle();
    await ui.press(/I booked a room/);
    await ui.press(/^Tomorrow$/);
    await ui.press(/^13:00$/);
    assert.match(ui.text(), /allows 3 hours a day each/);
    ui.unmount();
  });
});

describe('a faculty and a year', () => {
  test('nothing is sent until it is chosen and agreed', async () => {
    const { ui, calls } = await open();
    await ui.press(/Add my faculty/);
    await ui.press(/^Science and Technology$/);
    await ui.press(/^Year 2$/);
    await ui.press(/^Save$/).catch(noop);
    assert.equal(calls.some((c) => c.method === 'PUT'), false, 'not without the agreement');
    await ui.press(/I agree that ChivarGo keeps/);
    await ui.press(/^Save$/);
    const sent = calls.find((c) => c.method === 'PUT');
    assert.deepEqual(sent!.body, { university: 'rmutt', faculty: 'science', year: '2', consentVersion: 'student-1' });
    ui.unmount();
  });

  test('shows what was said, and lets it be taken back', async () => {
    const { ui, calls } = await open({ university: 'rmutt', faculty: 'nursing', year: '3' });
    assert.match(ui.text(), /Nursing · Year 3/);
    await ui.press(/Remove it/);
    assert.ok(calls.some((c) => c.method === 'DELETE' && c.path === '/campus/student'));
    ui.unmount();
  });
});

describe('the door on Home', () => {
  const home = async (key: 'rmutt' | 'koh-sichang') => {
    __setAreaForTests(key);
    const s = server({
      '/places': [fx.place({ id: 'p', province: 'TH-13', lat: 14.0334, lng: 100.7251 })],
      '/quests?filter=today': { quests: [], progress: {} },
      '/wallet': { balances: { green: 0, trip: 0 }, progression: null, ledger: [] },
      '/passport': { visited: [] },
      '/companions': { companions: [], summary: { found: 0, total: 5, grown: 0 }, speciesAsOf: '2026-09-08' },
      [`/areas/${key}/transit`]: { routes: [], campus: [] },
    } as never);
    restore = s.restore;
    let went = 0;
    const ui = await mountScreen(h(HomeScreen, {
      onOpenMap: noop, onOpenQuests: noop, onOpenQuest: noop, onOpenWallet: noop, onOpenPassport: noop, onOpenImpact: noop,
      onOpenConcierge: noop, onOpenSafety: noop, onOpenParty: noop, onOpenProfile: noop, onOpenCampus: () => { went += 1; },
    }));
    return { ui, went: () => went };
  };

  test('is there at RMUTT', async () => {
    const { ui, went } = await home('rmutt');
    await ui.press(/Booking and services/);
    assert.equal(went(), 1);
    ui.unmount();
  });

  test('and not on the island', async () => {
    const { ui } = await home('koh-sichang');
    assert.doesNotMatch(ui.text(), /Booking and services/);
    ui.unmount();
  });
});
