import { strict as assert } from 'node:assert';
import { test, describe, afterEach } from 'node:test';
import { createElement as h } from 'react';

import { PARTY_DOES_NOT, summarise } from '@chivago/core';
import { PartyScreen } from '../src/screens/PartyScreen.tsx';
import { mountScreen, server, refuses } from './interact.ts';

/**
 * The group screen.
 *
 * What is worth asserting is not that the buttons render — it is that the
 * screen answers "do we all get the points" with no, in both languages, and
 * that it never puts a member's balance in front of their friends.
 */

const noop = () => {};
const props = { onBack: noop, onToast: noop };

const member = (over: Record<string, unknown> = {}) => ({
  userId: 'u1', displayName: 'Ana', missionsVerified: 0, greenEarned: 0,
  provinces: [] as string[], you: false, ...over,
});

const solo = { party: null, summary: summarise([]), doesNot: PARTY_DOES_NOT };

const together = (members: ReturnType<typeof member>[]) => ({
  party: { id: 'pty_1', name: 'Songkran trip', createdBy: 'u1', createdAt: '2026-09-01T00:00:00.000Z' },
  summary: summarise(members as never),
  doesNot: PARTY_DOES_NOT,
});

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; });

describe('travelling on your own', () => {
  test('solo is a real screen, not an empty one', async () => {
    // Everybody starts here. A shrug and a disabled button would make the
    // first thing most travellers see look broken.
    const s = server({ 'GET /party': solo }); restore = s.restore;
    const ui = await mountScreen(h(PartyScreen, props));
    const said = ui.text();

    assert.match(said, /travelling on your own/i);
    assert.match(said, /Start a group/);
    assert.match(said, /Have a code/);
    ui.unmount();
  });

  test('it says what a group does and does not add, before anyone joins one', async () => {
    const s = server({ 'GET /party': solo }); restore = s.restore;
    const ui = await mountScreen(h(PartyScreen, props));
    const said = ui.text();
    assert.match(said, /does not share points/i);
    assert.match(said, /provinces you have reached between you/i);
    ui.unmount();
  });

  test('starting a group shows the code rather than navigating away from it', async () => {
    // The traveller tapped this to get a code to give somebody. Bouncing them
    // to the group view takes away the thing they came for.
    const s = server({
      'GET /party': solo,
      'POST /party': { party: { id: 'pty_1', name: 'Our trip' }, code: 'K7M2QP' },
    });
    restore = s.restore;
    const ui = await mountScreen(h(PartyScreen, props));
    await ui.pressText(/Start a group/);
    assert.match(ui.text(), /K7M2QP/);
    assert.match(ui.text(), /SHARE THIS CODE/);
    ui.unmount();
  });

  test('the server’s own refusal reaches the traveller', async () => {
    // unknown / full / already-in / disbanded need four different actions.
    const said: string[] = [];
    const s = server({
      'GET /party': solo,
      'POST /party/join': refuses('PARTY_FULL', 'That party is full — 8 people is the most it can hold.'),
    });
    restore = s.restore;

    const ui = await mountScreen(h(PartyScreen, { ...props, onToast: (m: string) => said.push(m) }));
    await ui.type('K7M2QP');
    await ui.pressText(/^Join$/);
    assert.equal(said.length, 1);
    assert.match(said[0]!, /full/);
    ui.unmount();
  });

  test('an empty code never reaches the server', async () => {
    const said: string[] = [];
    const s = server({ 'GET /party': solo }); restore = s.restore;
    const ui = await mountScreen(h(PartyScreen, { ...props, onToast: (m: string) => said.push(m) }));
    await ui.pressText(/^Join$/);
    assert.deepEqual(said, []);
    ui.unmount();
  });
});

describe('travelling together', () => {
  test('provinces between you leads, because it is the only figure a group changes', async () => {
    // Two people who went to different provinces have covered two. Leading
    // with a points total would suggest a shared pot, which is the one thing
    // a group does not have.
    const s = server({
      'GET /party': together([
        member({ userId: 'a', displayName: 'Ana', provinces: ['TH-84'], missionsVerified: 3, greenEarned: 610, you: true }),
        member({ userId: 'b', displayName: 'Bo', provinces: ['TH-20'], missionsVerified: 1, greenEarned: 150 }),
      ]),
    });
    restore = s.restore;
    const ui = await mountScreen(h(PartyScreen, props));
    const said = ui.text();

    assert.match(said, /Provinces between you/);
    assert.match(said, /\b2\b/);
    assert.match(said, /The two of you/i, 'a party of two is not labelled a duo');
    ui.unmount();
  });

  test('a member’s balance is never on screen', async () => {
    // Joining a trip is not consent to show your friends your wallet. What is
    // shown is what they EARNED, which is already public on the host standing.
    const s = server({
      'GET /party': together([
        member({ userId: 'a', displayName: 'Ana', missionsVerified: 3, greenEarned: 610, you: true }),
      ]),
    });
    restore = s.restore;
    const ui = await mountScreen(h(PartyScreen, props));
    const said = ui.text();

    // Scoped to the member list. The word "balance" DOES appear on this
    // screen — in the panel promising not to show one — and asserting against
    // the whole page would have failed on the disclosure doing its job.
    const rows = said.slice(said.indexOf('Who is here'), said.indexOf('WHAT A GROUP'));
    assert.match(rows, /VERIFIED/);
    assert.doesNotMatch(rows, /balance/i, 'a balance reached the member rows');
    assert.doesNotMatch(rows, /610/, 'a green total was shown against a member');

    // And the promise itself is still on the page.
    assert.match(said, /Show anybody your balance/);
    ui.unmount();
  });

  test('what a group does not do is on the screen, in both languages', async () => {
    const s = server({ 'GET /party': together([member({ you: true })]) }); restore = s.restore;
    const ui = await mountScreen(h(PartyScreen, props));
    const said = ui.text();
    assert.match(said, /Share points/i);
    assert.match(said, /ไม่แชร์แต้ม/);
    ui.unmount();
  });

  test('leaving says the points were always yours', async () => {
    // Leaving costs nothing, and a scary confirmation would imply otherwise.
    const s = server({ 'GET /party': together([member({ you: true })]) }); restore = s.restore;
    const ui = await mountScreen(h(PartyScreen, props));
    assert.match(ui.text(), /They always were yours/);
    ui.unmount();
  });

  test('the member who is you is marked', async () => {
    const s = server({
      'GET /party': together([
        member({ userId: 'a', displayName: 'Ana', you: true }),
        member({ userId: 'b', displayName: 'Bo' }),
      ]),
    });
    restore = s.restore;
    const ui = await mountScreen(h(PartyScreen, props));
    assert.match(ui.text(), /YOU/);
    ui.unmount();
  });
});
