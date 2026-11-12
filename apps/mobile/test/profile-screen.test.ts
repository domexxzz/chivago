import { strict as assert } from 'node:assert';
import { test, describe, afterEach, beforeEach } from 'node:test';
import { createElement as h } from 'react';

import { ProfileScreen, leadCompanion } from '../src/screens/ProfileScreen.tsx';
import { mountScreen, server } from './interact.ts';
import { __setLocaleForTests } from '../src/i18n/locale.ts';
import { RANKED_BY, companionsFor, collectionSummary, progressionFor, type Companion } from '@chivago/core';

/**
 * The profile.
 *
 * What is worth holding here is what the screen refuses to make up: a name
 * it was not given, a face it does not have, a podium for one person, and a
 * "4th of 3" for somebody a host has never checked. The rest is arithmetic
 * the wallet already proves.
 */

const noop = () => {};
const props = {
  onBack: noop, onOpenAccount: noop, onOpenWallet: noop, onOpenPassport: noop, onOpenMedals: noop, onOpenCompanion: noop,
};

const wallet = (exp = 2640) => ({
  balances: { green: 1850, trip: 790 }, progression: progressionFor(exp), ledger: [],
});

const standing = (over: Record<string, unknown> = {}) => ({
  hosts: [],
  you: { userId: 'u1', displayName: 'Ana', greenVerified: 610, missionsVerified: 3 },
  participants: 1,
  position: 1,
  rankedBy: RANKED_BY,
  ...over,
});

/** Real companions from real evidence: one grown, one still an egg. */
const grownAndEgg = (): Companion[] => companionsFor([
  { layer: 'Green', visitDays: 3, questsVerified: 1 },
  { layer: 'Food', visitDays: 1, questsVerified: 0 },
]);

const routes = (over: Record<string, unknown> = {}) => {
  const companions = grownAndEgg();
  return {
    '/wallet': wallet(),
    '/standing': standing(),
    '/passport': { visited: ['TH-84'], selfReported: [], evidence: [] },
    '/companions': { companions, summary: collectionSummary(companions), speciesAsOf: '2026-09-01' },
    ...over,
  };
};

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; });

describe('who the profile says you are', () => {
  test('the name is the account’s, the rank and level are the wallet’s, the face is a companion', async () => {
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(ProfileScreen, props));
    const said = ui.text();
    assert.match(said, /Ana/, 'the display name the account was registered with');
    assert.match(said, /Newcomer/, 'the rank, as a title');
    assert.match(said, /Level 3 · 2,640 EXP/, 'the level and the lifetime EXP');
    // The picture is the companion that grew, named for the screen reader.
    const grown = grownAndEgg().find((c) => c.stage === 'grown')!;
    const face = ui.labels().find((l) => l.startsWith(`${grown.species.name.en}, Grown`));
    assert.ok(face, 'the avatar is the grown companion');
    ui.unmount();
  });

  test('with no companions the face is nobody in particular, not a stock portrait', async () => {
    const s = server(routes({
      '/companions': { companions: [], summary: { found: 0, total: 5, grown: 0 }, speciesAsOf: '2026-09-01' },
    }));
    restore = s.restore;
    const ui = await mountScreen(h(ProfileScreen, props));
    assert.ok(ui.labels().includes('Traveller'), 'the avatar announces itself as the traveller');
    assert.match(ui.text(), /first egg/, 'an empty collection says how to start, not five locked slots');
    ui.unmount();
  });

  test('the lead companion is the most grown one', () => {
    const list = grownAndEgg();
    assert.equal(leadCompanion(list)?.stage, 'grown');
    assert.equal(leadCompanion([...list].reverse())?.stage, 'grown');
    assert.equal(leadCompanion([]), null);
  });
});

describe('how far', () => {
  test('the distance to the next rank is counted in EXP', async () => {
    // 2,640 EXP is level 3; Wanderer starts at level 5, which begins at 4,200.
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(ProfileScreen, props));
    assert.match(ui.text(), /1,560 EXP to Wanderer/);
    assert.match(ui.text(), /1,140 \/ 1,200 EXP/, 'the level bar keeps the wallet’s figures');
    ui.unmount();
  });

  test('at the top rank there is no next one to count to', async () => {
    const s = server(routes({ '/wallet': wallet(1_000_000) })); restore = s.restore;
    const ui = await mountScreen(h(ProfileScreen, props));
    assert.match(ui.text(), /Top rank reached/);
    assert.match(ui.text(), /Chiva Legend/);
    ui.unmount();
  });

  test('every rank is on the path, reached or not', async () => {
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(ProfileScreen, props));
    const labels = ui.labels();
    assert.ok(labels.includes('Newcomer, reached'));
    assert.ok(labels.includes('Wanderer, from level 5'));
    assert.ok(labels.includes('Island Explorer, from level 10'));
    assert.ok(labels.includes('Samui Insider, from level 20'));
    assert.ok(labels.includes('Chiva Legend, from level 35'));
    ui.unmount();
  });
});

describe('where you stand', () => {
  test('one participant is not a ranking, and the screen says so', async () => {
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(ProfileScreen, props));
    const said = ui.text();
    assert.match(said, /Not a ranking yet: 1 participant with verified points/);
    assert.doesNotMatch(said, /#1/, 'a podium with one step');
    assert.match(said, /610/, 'the verified points are still shown');
    assert.match(said, /Ranked by verified approvals only/, 'the basis is on the screen');
    ui.unmount();
  });

  test('with enough participants the position is shown, of that many', async () => {
    const s = server(routes({ '/standing': standing({ participants: 5, position: 2 }) })); restore = s.restore;
    const ui = await mountScreen(h(ProfileScreen, props));
    assert.match(ui.text(), /#2/);
    assert.match(ui.text(), /of 5 participants/);
    ui.unmount();
  });

  test('no verified work is no position, not last place', async () => {
    const s = server(routes({
      '/standing': standing({
        you: { userId: 'u1', displayName: 'Ana', greenVerified: 0, missionsVerified: 0 },
        participants: 5, position: null,
      }),
    }));
    restore = s.restore;
    const ui = await mountScreen(h(ProfileScreen, props));
    assert.match(ui.text(), /No verified work yet/);
    assert.doesNotMatch(ui.text(), /#/);
    ui.unmount();
  });
});

describe('what follows you everywhere', () => {
  test('the verified purse and the passport, each named', async () => {
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(ProfileScreen, props));
    const labels = ui.labels();
    assert.ok(labels.includes('Green Points, 1,850 G'));
    assert.ok(labels.includes('Travel passport, 1 / 77'));
    ui.unmount();
  });

  test('the gear opens the account', async () => {
    let opened = 0;
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(ProfileScreen, { ...props, onOpenAccount: () => { opened += 1; } }));
    await ui.press('Account and devices');
    assert.equal(opened, 1);
    ui.unmount();
  });
});

describe('distinction between operator and traveller roles', () => {
  // The role copy asserted here is the Thai copy; the screen follows the app language.
  beforeEach(() => { __setLocaleForTests('th'); });
  afterEach(() => { __setLocaleForTests('en'); });

  test('renders business operator profile with business name and partner badges', async () => {
    const s = server(routes({
      '/account': {
        userId: 'u_op_123',
        accountType: 'operator',
        businessName: 'สีชัง ซันเซ็ท วิลล่า',
        fullName: 'สมคิด เจ้าของร้าน',
        email: 'somkid@resort.com',
        phone: '0829998877',
        devices: [],
      },
      '/standing': standing({
        you: { userId: 'u_op_123', displayName: 'สมคิด เจ้าของร้าน', greenVerified: 200, missionsVerified: 1 },
      }),
    }));
    restore = s.restore;

    const ui = await mountScreen(h(ProfileScreen, props));
    const text = ui.text();

    assert.match(text, /โปรไฟล์ผู้ประกอบการ/);
    assert.match(text, /สีชัง ซันเซ็ท วิลล่า/);
    assert.match(text, /ลงทะเบียนแล้ว/);
    assert.match(text, /0829998877/);
    assert.match(text, /somkid@resort.com/);
    assert.match(text, /จัดการร้านค้าของฉัน/);
    ui.unmount();
  });

  test('renders normal traveller profile with traveller badges and eco-tourism notice', async () => {
    const s = server(routes({
      '/account': {
        userId: 'u_traveller_1',
        accountType: 'traveller',
        businessName: null,
        fullName: 'สมชาย รักเที่ยว',
        email: 'somchai@travel.com',
        phone: '0812345678',
        devices: [],
      },
      '/standing': standing({
        you: { userId: 'u_traveller_1', displayName: 'สมชาย รักเที่ยว', greenVerified: 50, missionsVerified: 0 },
      }),
    }));
    restore = s.restore;

    const ui = await mountScreen(h(ProfileScreen, props));
    const text = ui.text();

    assert.match(text, /นักท่องเที่ยว/);
    assert.match(text, /สมชาย รักเที่ยว/);
    assert.match(text, /โปรไฟล์นักท่องเที่ยว/);
    assert.match(text, /เมนูของฉัน/);
    assert.match(text, /0812345678/);
    ui.unmount();
  });

  test('opens Digital passport and Medals from the traveller profile menu', async () => {
    let passport = 0;
    let medals = 0;
    const s = server(routes());
    restore = s.restore;
    const ui = await mountScreen(h(ProfileScreen, {
      ...props,
      onOpenPassport: () => { passport += 1; },
      onOpenMedals: () => { medals += 1; },
    }));

    await ui.press(/^พาสปอร์ตดิจิทัล$/);
    await ui.press(/^เหรียญรางวัล$/);
    assert.deepEqual([passport, medals], [1, 1]);
    ui.unmount();
  });

  test('strictly isolates operator dashboard from traveller profile without role toggles', async () => {
    // 1. Operator Account
    const opServer = server(routes({
      '/account': {
        userId: 'u_op_strict',
        accountType: 'operator',
        businessName: 'สมุย มารีน่า & รีสอร์ท',
        fullName: 'คุณสมเกียรติ',
        email: 'somkiat@resort.com',
        phone: '0812345678',
        devices: [],
      },
    }));
    restore = opServer.restore;

    const opUI = await mountScreen(h(ProfileScreen, props));
    const opText = opUI.text();

    // Contains operator elements
    assert.match(opText, /บัญชีผู้ประกอบการ/);
    assert.match(opText, /โปรไฟล์ผู้ประกอบการ/);
    assert.match(opText, /สมุย มารีน่า & รีสอร์ท/);
    assert.match(opText, /เครื่องมือสำหรับผู้ประกอบการ/);
    assert.match(opText, /จัดการร้านค้าของฉัน/);
    // Until the backend exposes operator KPIs, the profile must not present
    // hard-coded zeroes as if they were measured business statistics.
    assert.doesNotMatch(opText, /ภารกิจที่รับรองแล้ว/);
    assert.doesNotMatch(opText, /นักท่องเที่ยวเช็คอิน/);
    assert.doesNotMatch(opText, /คะแนนพาร์ทเนอร์/);
    assert.doesNotMatch(opText, /รับรองภารกิจนักท่องเที่ยว/);

    // Does NOT contain traveller game collection elements
    assert.doesNotMatch(opText, /first egg/);
    opUI.unmount();
    opServer.restore();

    // 2. Traveller Account
    const travServer = server(routes({
      '/account': {
        userId: 'u_trav_strict',
        accountType: 'traveller',
        businessName: null,
        fullName: 'มาลี รักการเดินทาง',
        email: 'malee@travel.com',
        phone: '0899998888',
        devices: [],
      },
      '/standing': standing({
        you: { userId: 'u_trav_strict', displayName: 'มาลี รักการเดินทาง', greenVerified: 50, missionsVerified: 0 },
      }),
    }));
    restore = travServer.restore;

    const travUI = await mountScreen(h(ProfileScreen, props));
    const travText = travUI.text();

    // Contains traveller elements
    assert.match(travText, /นักท่องเที่ยว/);
    assert.match(travText, /มาลี รักการเดินทาง/);
    assert.match(travText, /EXP/);

    // Does NOT contain operator tools
    assert.doesNotMatch(travText, /แดชบอร์ดผู้ประกอบการ/);
    assert.doesNotMatch(travText, /เครื่องมือสำหรับผู้ประกอบการ/);
    travUI.unmount();
  });
});

describe('logout functionality and confirmation popup', () => {
  test('tapping logout button opens confirmation modal, cancelling closes it, confirming calls onLogout', async () => {
    let loggedOut = false;
    const s = server(routes());
    restore = s.restore;

    const ui = await mountScreen(h(ProfileScreen, {
      ...props,
      onLogout: () => { loggedOut = true; },
    }));

    // Initially modal is not visible (text does not contain confirmation question)
    assert.doesNotMatch(ui.text(), /Are you sure you want to log out|คุณแน่ใจหรือไม่/);

    // Tap the logout button in profile
    await ui.press(/log out|ออกจากระบบ/i);

    // Modal is now open
    assert.match(ui.text(), /Log Out|ยืนยันการออกจากระบบ/);
    assert.match(ui.text(), /Are you sure you want to log out|คุณแน่ใจหรือไม่/);
    assert.equal(loggedOut, false);

    // Tap cancel
    await ui.press(/cancel|ยกเลิก/i);
    assert.doesNotMatch(ui.text(), /Are you sure you want to log out|คุณแน่ใจหรือไม่/);
    assert.equal(loggedOut, false);

    // Open modal again and confirm logout
    await ui.press(/log out|ออกจากระบบ/i);
    assert.match(ui.text(), /Log Out|ยืนยันการออกจากระบบ/);
    await ui.press(/confirm log out|ยืนยันออกจากระบบ/i);

    assert.equal(loggedOut, true);
    ui.unmount();
  });
});
