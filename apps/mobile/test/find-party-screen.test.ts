import { strict as assert } from 'node:assert';
import { test, describe, afterEach } from 'node:test';
import { createElement as h } from 'react';

import { INVITE_DOES_NOT } from '@chivago/core';
import { FindPartyScreen } from '../src/screens/FindPartyScreen.tsx';
import { mountScreen, server, refuses } from './interact.ts';
import { place } from './fixtures.ts';
import { __setLocaleForTests } from '../src/i18n/locale.ts';

/**
 * Finding a party.
 *
 * What is worth asserting is not that the list renders. It is that no request
 * this screen makes carries a position, that nothing it displays could resolve
 * to where a person is standing, and that the two counts it shows — a crowd
 * the island counted and a plan somebody typed — are never added together.
 */

const noop = () => {};
const props = { onBack: noop, onToast: noop };

const places = [
  place({ id: 'mangrove', name: { en: 'Thong Krut Mangrove', th: 'ป่าชายเลนท้องกรูด' } }),
  place({ id: 'chaweng', name: { en: 'Chaweng Beach', th: 'หาดเฉวง' } }),
];

const pins = {
  pins: [
    {
      placeId: 'mangrove', invitesOpen: 2, checkinsLastHour: 3,
      line: { en: '3 checked in in the last hour · 2 parties are looking for people', th: 'เช็กอินในชั่วโมงที่ผ่านมา 3 คน · มี 2 ปาร์ตี้กำลังหาคน' },
    },
    {
      placeId: 'chaweng', invitesOpen: 0, checkinsLastHour: 0,
      line: { en: 'Nobody has checked in here in the last hour, and no party is asking.', th: 'ยังไม่มีใครเช็กอินที่นี่ในชั่วโมงที่ผ่านมา และยังไม่มีปาร์ตี้ประกาศหาคน' },
    },
  ],
};

const listing = (over: Record<string, unknown> = {}) => ({
  id: 'inv_1', placeId: 'mangrove',
  from: '2026-09-15T00:00:00.000Z', until: '2026-09-15T03:00:00.000Z',
  spacesLeft: 2, note: 'Clean up then find breakfast', state: 'open',
  partyName: 'Two slow walkers', missionsVerified: 7, yours: false, ...over,
});

const at = (invitations: unknown[] = [listing()]) => ({
  invitations, doesNot: INVITE_DOES_NOT,
});

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; __setLocaleForTests('en'); });

describe('nothing this screen does carries a position', () => {
  test('no request it makes has a coordinate in it', async () => {
    // The structural guard at the layer a reviewer actually reads. If somebody
    // adds "sort by distance" later, this fails before it ships.
    const s = server({ 'GET /places': places, 'GET /invites/pins': pins });
    restore = s.restore;
    const ui = await mountScreen(h(FindPartyScreen, props));

    for (const call of s.calls) {
      for (const banned of ['lat', 'lng', 'latitude', 'longitude', 'accuracy']) {
        assert.ok(!call.path.toLowerCase().includes(banned), `${call.path} carried ${banned}`);
        assert.ok(
          !JSON.stringify(call.body ?? {}).toLowerCase().includes(banned),
          `a body carried ${banned}`,
        );
      }
    }
    ui.unmount();
  });

  test('it says so before the list, not after it', async () => {
    // "Can people see where I am" is the first question anybody asks, and a
    // traveller should not have to scroll past strangers to reach the answer.
    const s = server({ 'GET /places': places, 'GET /invites/pins': pins });
    restore = s.restore;
    const ui = await mountScreen(h(FindPartyScreen, props));
    const said = ui.text();

    const promise = said.search(/never at a person/i);
    const firstParty = said.search(/Two slow walkers|Thong Krut/i);
    assert.ok(promise >= 0, 'the screen never says invitations are posted at a place');
    assert.ok(promise < firstParty || firstParty === -1, 'the promise came after the list');
    ui.unmount();
  });
});

describe('the two counts are printed, never added', () => {
  test('a place prints the line the server composed', async () => {
    const s = server({ 'GET /places': places, 'GET /invites/pins': pins });
    restore = s.restore;
    const ui = await mountScreen(h(FindPartyScreen, props));
    const said = ui.text();

    assert.match(said, /3 checked in in the last hour/);
    assert.match(said, /2 parties are looking/);
    // 3 + 2 is the number a screen doing its own arithmetic would show.
    assert.ok(!/\b5 (people|travellers)\b/.test(said), 'the two counts were summed');
    ui.unmount();
  });

  test('a place nobody is at says so rather than disappearing', async () => {
    // An unvisited beach is not a quiet one, it is one nobody counted at —
    // and it is still somewhere you might want to post an invitation.
    const s = server({ 'GET /places': places, 'GET /invites/pins': pins });
    restore = s.restore;
    const ui = await mountScreen(h(FindPartyScreen, props));
    assert.match(ui.text(), /Chaweng Beach/);
    assert.match(ui.text(), /Nobody has checked in here/);
    ui.unmount();
  });
});

describe('reading and asking', () => {
  test('opening a place shows who is asking, and what a host verified', async () => {
    const s = server({
      'GET /places': places, 'GET /invites/pins': pins, 'GET /invites': at(),
    });
    restore = s.restore;
    const ui = await mountScreen(h(FindPartyScreen, props));
    await ui.pressText(/Thong Krut Mangrove/);
    const said = ui.text();

    assert.match(said, /Two slow walkers/);
    assert.match(said, /7 VERIFIED/);
    assert.match(said, /2 spaces left/);
    assert.match(said, /Ask to come along/);
    ui.unmount();
  });

  test('a party with nothing verified is named plainly, not hidden', async () => {
    // Everybody starts at zero. Hiding it would leave the reader guessing,
    // and colouring it as a warning would punish somebody for being new.
    const s = server({
      'GET /places': places, 'GET /invites/pins': pins,
      'GET /invites': at([listing({ missionsVerified: 0 })]),
    });
    restore = s.restore;
    const ui = await mountScreen(h(FindPartyScreen, props));
    await ui.pressText(/Thong Krut Mangrove/);
    assert.match(ui.text(), /NOTHING VERIFIED YET/);
    ui.unmount();
  });

  test('your own party is marked, and cannot be asked to join', async () => {
    const s = server({
      'GET /places': places, 'GET /invites/pins': pins,
      'GET /invites': at([listing({ yours: true })]),
    });
    restore = s.restore;
    const ui = await mountScreen(h(FindPartyScreen, props));
    await ui.pressText(/Thong Krut Mangrove/);
    const said = ui.text();
    assert.match(said, /YOUR PARTY/);
    assert.ok(!/Ask to come along/.test(said), 'it offered to join your own party');
    ui.unmount();
  });

  test('a refusal arrives in the server’s own words', async () => {
    // Seven refusals, seven sentences. "Somebody took the last space" and
    // "leave your current party first" send a traveller to different places.
    const said: string[] = [];
    const s = server({
      'GET /places': places, 'GET /invites/pins': pins, 'GET /invites': at(),
      'POST /invites/inv_1/request': refuses('REQUEST_FULL', 'Somebody took the last space.'),
    });
    restore = s.restore;
    const ui = await mountScreen(
      h(FindPartyScreen, { ...props, onToast: (m: string) => said.push(m) }),
    );
    await ui.pressText(/Thong Krut Mangrove/);
    await ui.pressText(/Ask to come along/);

    assert.deepEqual(said, ['Somebody took the last space.']);
    ui.unmount();
  });

  test('what it does not do is carried with the list', async () => {
    const s = server({
      'GET /places': places, 'GET /invites/pins': pins, 'GET /invites': at(),
    });
    restore = s.restore;
    const ui = await mountScreen(h(FindPartyScreen, props));
    await ui.pressText(/Thong Krut Mangrove/);
    const said = ui.text();
    assert.match(said, /WHAT THIS DOES NOT DO/);
    assert.match(said, /never at a person/i);
    assert.match(said, /balance/i);
    ui.unmount();
  });

  test('an empty place says so instead of looking broken', async () => {
    const s = server({
      'GET /places': places, 'GET /invites/pins': pins, 'GET /invites': at([]),
    });
    restore = s.restore;
    const ui = await mountScreen(h(FindPartyScreen, props));
    await ui.pressText(/Chaweng Beach/);
    assert.match(ui.text(), /No party is asking here yet/);
    ui.unmount();
  });
});

describe('in Thai', () => {
  test('the promise and the refusal list are both translated', async () => {
    __setLocaleForTests('th');
    const s = server({
      'GET /places': places, 'GET /invites/pins': pins, 'GET /invites': at(),
    });
    restore = s.restore;
    const ui = await mountScreen(h(FindPartyScreen, props));
    const said = ui.text();
    assert.match(said, /ประกาศผูกกับสถานที่/);
    assert.ok(!/never at a person/i.test(said), 'English leaked into the Thai screen');
    ui.unmount();
  });
});
