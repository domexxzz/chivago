import { strict as assert } from 'node:assert';
import { test, describe, afterEach } from 'node:test';
import { createElement as h } from 'react';

import { AccountScreen, countdown, groupCode } from '../src/screens/AccountScreen.tsx';
import { mountScreen, server, refuses, offline, settle } from './interact.ts';
import { __setLocaleForTests } from '../src/i18n/locale.ts';

/**
 * The account screen.
 *
 * The thing worth testing here is not that the buttons exist — it is that the
 * screen tells the truth about a trade the traveller cannot undo. There is no
 * password and no recovery email, so losing the only phone loses the account,
 * and that sentence has to be on the screen next to the button that prevents
 * it rather than in a help page somebody reaches afterwards.
 */

const noop = () => {};
const props = { onBack: noop, onToast: noop };

const devices = (over: unknown[] = []) => ({
  userId: 'u_1',
  devices: over.length ? over : [
    { label: 'Ana iPhone', createdAt: '2026-09-01T00:00:00.000Z', lastSeenAt: '2026-09-02T00:00:00.000Z', current: true },
  ],
});

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; });

describe('the code is made to be read off one screen and typed into another', () => {
  test('eight characters are shown as two groups of four', () => {
    // Eight unbroken characters is a transcription error waiting to happen.
    assert.equal(groupCode('RHW6FXT7'), 'RHW6 FXT7');
  });

  test('anything that is not eight characters is left alone', () => {
    assert.equal(groupCode('ABC'), 'ABC');
  });

  test('the countdown shows seconds, because the whole window is ten minutes', () => {
    assert.equal(countdown(587_000), '9:47');
    assert.equal(countdown(60_000), '1:00');
    assert.equal(countdown(9_000), '0:09');
  });

  test('an expired code counts to zero and not below it', () => {
    // A negative clock is how somebody learns to distrust the rest of the page.
    assert.equal(countdown(0), '0:00');
    assert.equal(countdown(-5_000), '0:00');
  });
});

describe('what the screen says', () => {
  test('the cost of having no password is stated, not buried', async () => {
    // THE assertion. Every product that collects a recovery email buys its way
    // out of this sentence with the reader's personal data. This one does not,
    // so the reader is owed the sentence.
    const s = server({ 'GET /account': devices() }); restore = s.restore;
    const ui = await mountScreen(h(AccountScreen, props));
    const said = ui.text();

    assert.match(said, /if this is your only phone and you lose it, the account goes/i);
    assert.match(said, /No password, no email, no phone number/);
    ui.unmount();

    // The same sentence, to a Thai reader, in Thai. One language at a time
    // means the Thai is there when the app is in Thai, not under the English.
    __setLocaleForTests('th');
    const thai = await mountScreen(h(AccountScreen, props));
    assert.match(thai.text(), /บัญชีจะหายไปด้วย/, 'the Thai reader was not told');
    thai.unmount();
    __setLocaleForTests('en');
  });

  test('it says what moves and what does not', async () => {
    const s = server({ 'GET /account': devices() }); restore = s.restore;
    const ui = await mountScreen(h(AccountScreen, props));
    assert.match(ui.text(), /points, passport and companions move with you/i);
    ui.unmount();
  });

  test('one phone is singular, two are plural', async () => {
    const one = server({ 'GET /account': devices() }); restore = one.restore;
    const first = await mountScreen(h(AccountScreen, props));
    assert.match(first.text(), /1 phone on this account/);
    first.unmount();
    one.restore(); restore = null;

    const two = server({
      'GET /account': devices([
        { label: 'Ana iPhone', createdAt: '2026-09-01T00:00:00.000Z', lastSeenAt: null, current: true },
        { label: 'Ana iPad', createdAt: '2026-09-02T00:00:00.000Z', lastSeenAt: null, current: false },
      ]),
    });
    restore = two.restore;
    const second = await mountScreen(h(AccountScreen, props));
    assert.match(second.text(), /2 phones on this account/);
    second.unmount();
  });
});

describe('the phone you are holding', () => {
  test('it is marked, and it offers no Remove button', async () => {
    // Removing the device you are holding logs you out of an account you may
    // have no way back into — the one irreversible action on the screen, and
    // not one to sit in a list beside other people's phones.
    const s = server({
      'GET /account': devices([
        { label: 'Ana iPhone', createdAt: '2026-09-01T00:00:00.000Z', lastSeenAt: null, current: true },
      ]),
    });
    restore = s.restore;
    const ui = await mountScreen(h(AccountScreen, props));

    // Case-insensitive: `Label` uppercases in CSS, and the copy is now a
    // translatable pair written in sentence case (Thai has no case to shout).
    assert.match(ui.text(), /in use/i);
    assert.doesNotMatch(ui.text(), /remove/i, 'the current phone offered to remove itself');
    ui.unmount();
  });

  test('another phone can be removed', async () => {
    const s = server({
      'GET /account': devices([
        { label: 'Ana iPhone', createdAt: '2026-09-01T00:00:00.000Z', lastSeenAt: null, current: true },
        { label: 'Old phone', createdAt: '2026-08-01T00:00:00.000Z', lastSeenAt: null, current: false },
      ]),
    });
    restore = s.restore;
    const ui = await mountScreen(h(AccountScreen, props));
    assert.match(ui.text(), /remove/i);
    assert.match(ui.labels().join(' '), /Remove Old phone from the account/);
    ui.unmount();
  });
});

describe('asking for a code', () => {
  test('the code appears grouped, with a clock on it', async () => {
    const s = server({
      'GET /account': devices(),
      'POST /account/link-code': { code: 'RHW6FXT7', expiresInMs: 600_000 },
    });
    restore = s.restore;
    const ui = await mountScreen(h(AccountScreen, props));
    await ui.pressText(/Show a code/);

    const said = ui.text();
    assert.match(said, /RHW6 FXT7/, 'the code was not grouped for reading');
    assert.match(said, /EXPIRES IN \d+:\d\d/);
    assert.match(said, /works once, and only for ten minutes/);
    ui.unmount();
  });

  test('a refused request does not leave a fake code on screen', async () => {
    const s = server({ 'GET /account': devices(), 'POST /account/link-code': offline() });
    restore = s.restore;
    const ui = await mountScreen(h(AccountScreen, props));
    await ui.pressText(/Show a code/);
    assert.doesNotMatch(ui.text(), /EXPIRES IN/, 'a failed request rendered a code anyway');
    ui.unmount();
  });
});

describe('entering a code', () => {
  test('the server’s own refusal reaches the traveller', async () => {
    // unknown / expired / used need three different actions, and the server
    // already writes three different sentences. Replacing them with one
    // generic failure would throw away the only useful part.
    const said: string[] = [];
    const s = server({
      'GET /account': devices(),
      'POST /account/claim': refuses('LINK_EXPIRED', 'That code has expired. Ask your other phone for a new one.'),
    });
    restore = s.restore;

    const ui = await mountScreen(h(AccountScreen, { ...props, onToast: (m: string) => said.push(m) }));
    await ui.type('RHW6FXT7');
    await ui.pressText(/^Join$/);

    assert.equal(said.length, 1);
    assert.match(said[0]!, /expired.*new one/i);
    ui.unmount();
  });

  test('an empty code never reaches the server, prop or no prop', async () => {
    // The button carries `disabled`, but that is presentation: a fast
    // double-tap fires the handler before React re-renders, and this harness
    // calls onPress directly the same way. The guard lives in the handler.
    const calls: string[] = [];
    const s = server({ 'GET /account': devices() });
    restore = s.restore;
    const ui = await mountScreen(h(AccountScreen, { ...props, onToast: (m: string) => calls.push(m) }));

    await ui.pressText(/^Join$/);
    assert.deepEqual(calls, [], 'an empty code was sent to the server');
    ui.unmount();
  });
});

describe('quiet hours, which the API had and the app could not reach', () => {
  const quiet = (over = {}) => ({ enabled: true, from: null, until: null, ...over });

  test('the default window is shown as island hours, with the SOS exemption beside it', async () => {
    const net = server({ 'GET /account': devices(), 'GET /notifications/quiet': quiet() });
    restore = net.restore;
    const ui = await mountScreen(h(AccountScreen, props));
    assert.match(ui.text(), /Held 22:00 – 07:00/);
    assert.match(ui.text(), /nobody can\s+mute an emergency/);
    ui.unmount();

    __setLocaleForTests('th');
    const thai = await mountScreen(h(AccountScreen, props));
    assert.match(thai.text(), /ไม่มีใครปิดเสียงเหตุฉุกเฉินได้/);
    thai.unmount();
    __setLocaleForTests('en');
  });

  test('turning it off sends enabled:false and reads the server back', async () => {
    let enabled = true;
    const net = server({
      'GET /account': devices(),
      'GET /notifications/quiet': () => quiet({ enabled }),
      'PUT /notifications/quiet': (body: { enabled: boolean }) => { enabled = body.enabled; return quiet({ enabled }); },
    });
    restore = net.restore;
    const ui = await mountScreen(h(AccountScreen, props));
    await ui.press(/Quiet hours on/);
    await settle();
    const put = net.calls.find((c) => c.method === 'PUT' && c.path === '/notifications/quiet');
    assert.ok(put, 'nothing was saved');
    assert.equal((put.body as { enabled: boolean }).enabled, false);
    assert.match(ui.text(), /Off — notify me any time/);
    ui.unmount();
  });

  test('stepping the start back an hour saves 21, and it wraps past midnight', async () => {
    let from: number | null = null;
    const net = server({
      'GET /account': devices(),
      'GET /notifications/quiet': () => quiet({ from }),
      'PUT /notifications/quiet': (body: { from: number }) => { from = body.from; return quiet({ from }); },
    });
    restore = net.restore;
    const ui = await mountScreen(h(AccountScreen, props));
    await ui.press('Earlier start');
    await settle();
    assert.equal(from, 21);
    assert.match(ui.text(), /Held 21:00 – 07:00/);
    ui.unmount();
  });

  test('a refused save is toasted and the setting stays as it was', async () => {
    let said = '';
    const net = server({
      'GET /account': devices(),
      'GET /notifications/quiet': quiet(),
      'PUT /notifications/quiet': refuses('INTERNAL', 'Could not save that.'),
    });
    restore = net.restore;
    const ui = await mountScreen(h(AccountScreen, { ...props, onToast: (m: string) => { said = m; } }));
    await ui.press('Later end');
    await settle();
    assert.equal(said, 'Could not save that.');
    assert.match(ui.text(), /Held 22:00 – 07:00/);
    ui.unmount();
  });
});
