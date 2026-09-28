import { strict as assert } from 'node:assert';
import { test, describe, afterEach } from 'node:test';
import { createElement as h } from 'react';

import { AskScreen, dayChoices } from '../src/screens/AskScreen.tsx';
import { parseDeepLink } from '../src/notifications/push.ts';
import { mountScreen, offline, refuses, server } from './interact.ts';
import { islandDateKey } from '@chivago/core';

/**
 * Asking an operator a question. docs/61, stage three.
 *
 * What is worth holding here is what the screen refuses to say or invent: it
 * never calls a question a booking, never shows a price nobody stated or a
 * response time built from one reply, never pads an empty list with examples,
 * and never sends a question the server would refuse.
 */

const noop = () => {};

const boat = (over: Record<string, unknown> = {}) => ({
  id: 'l1', operatorId: 'op', operatorName: 'Thong Krut Boat Co-op', kind: 'tour',
  title: { en: 'Longtail to Koh Taen', th: 'เรือหางยาวไปเกาะแตน' }, whereLabel: 'Thong Krut pier',
  fromTHB: null, licenceNo: '31/01234', active: true, responseHours: null, ...over,
});

const asked = (over: Record<string, unknown> = {}) => ({
  id: 'i1', listingId: 'l1', userId: 'u1', forDate: '2026-10-04', partySize: 2,
  message: 'Two of us?', state: 'sent', now: 'sent', sentAt: '2026-10-01T02:00:00.000Z',
  answeredAt: null, answer: null, quoteTHB: null,
  listing: { title: boat().title, operatorName: 'Thong Krut Boat Co-op', kind: 'tour', whereLabel: 'Thong Krut pier' },
  ...over,
});

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; });

describe('what the screen says before anything is asked', () => {
  test('IT OPENS WITH THE SENTENCE THAT SAYS THIS IS NOT A BOOKING', async () => {
    const s = server({ '/listings': [boat()], '/inquiries': [] }); restore = s.restore;
    const ui = await mountScreen(h(AskScreen, { onBack: noop, onToast: noop }));
    assert.match(ui.text(), /This is a question, not a booking/);
  });

  test('WITH NO OPERATORS IT SAYS SO, AND INVENTS NONE', async () => {
    // No operator is seeded: the businesses on Samui are real, and a listing
    // is a claim made in their name.
    const s = server({ '/listings': [], '/inquiries': [] }); restore = s.restore;
    const ui = await mountScreen(h(AskScreen, { onBack: noop, onToast: noop }));
    assert.match(ui.text(), /No operator has listed here yet/);
  });

  test('AN UNSTATED PRICE READS AS UNSTATED, NEVER AS FREE', async () => {
    const s = server({ '/listings': [boat()], '/inquiries': [] }); restore = s.restore;
    const ui = await mountScreen(h(AskScreen, { onBack: noop, onToast: noop }));
    assert.match(ui.text(), /No price stated/);
    assert.doesNotMatch(ui.text(), /0 THB|฿0/);
  });

  test('a stated price is the operator’s, and says so', async () => {
    const s = server({ '/listings': [boat({ fromTHB: 1500 })], '/inquiries': [] }); restore = s.restore;
    const ui = await mountScreen(h(AskScreen, { onBack: noop, onToast: noop }));
    assert.match(ui.text(), /From 1,500 THB, as the operator states/);
  });

  test('A TOUR’S LICENCE IS SHOWN AS STATED, NOT VERIFIED', async () => {
    const s = server({ '/listings': [boat()], '/inquiries': [] }); restore = s.restore;
    const ui = await mountScreen(h(AskScreen, { onBack: noop, onToast: noop }));
    assert.match(ui.text(), /31\/01234/);
    assert.match(ui.text(), /ChivaGo has not verified it/);
  });

  test('NO RESPONSE TIME UNTIL THERE IS ENOUGH TO SAY ONE', async () => {
    const s = server({ '/listings': [boat()], '/inquiries': [] }); restore = s.restore;
    const ui = await mountScreen(h(AskScreen, { onBack: noop, onToast: noop }));
    assert.doesNotMatch(ui.text(), /Usually answers/);
  });

  test('with enough answers, the operator’s usual response time is shown', async () => {
    const s = server({ '/listings': [boat({ responseHours: 2 })], '/inquiries': [] }); restore = s.restore;
    const ui = await mountScreen(h(AskScreen, { onBack: noop, onToast: noop }));
    assert.match(ui.text(), /Usually answers within 2 hours/);
  });
});

describe('asking', () => {
  test('AN EMPTY QUESTION IS NOT SENT, AND SAYS WHY BESIDE THE FIELD', async () => {
    const s = server({ '/listings': [boat()], '/inquiries': [] }); restore = s.restore;
    const ui = await mountScreen(h(AskScreen, { onBack: noop, onToast: noop }));
    await ui.pressText('Longtail to Koh Taen');
    await ui.pressText('Send question');
    assert.match(ui.text(), /Write a question for the operator/);
    assert.equal(s.calls.filter((c) => c.method === 'POST').length, 0, 'an incomplete question was sent');
  });

  test('A COMPLETE QUESTION IS SENT WITH THE DAY AND PARTY THE FORM SHOWED', async () => {
    const toasts: string[] = [];
    const s = server({
      '/listings': [boat()], '/inquiries': [],
      'POST /listings/l1/inquiries': asked(),
    }); restore = s.restore;
    const ui = await mountScreen(h(AskScreen, { onBack: noop, onToast: (m: string) => toasts.push(m) }));
    await ui.pressText('Longtail to Koh Taen');
    await ui.type('Two of us, morning if possible?');
    await ui.pressText('Send question');

    const sent = s.calls.find((c) => c.method === 'POST' && c.path === '/listings/l1/inquiries');
    assert.ok(sent, 'nothing was posted');
    assert.equal(sent!.body.partySize, 2);
    assert.equal(sent!.body.message, 'Two of us, morning if possible?');
    // Tomorrow by default, in island time - not today, which may be half over.
    assert.equal(sent!.body.forDate, dayChoices()[1]);
    assert.deepEqual(toasts, ['Sent — nothing is reserved']);
  });

  test('the party size moves within its bounds', async () => {
    const s = server({ '/listings': [boat()], '/inquiries': [], 'POST /listings/l1/inquiries': asked() }); restore = s.restore;
    const ui = await mountScreen(h(AskScreen, { onBack: noop, onToast: noop }));
    await ui.pressText('Longtail to Koh Taen');
    await ui.press('More people');
    await ui.press('More people');
    await ui.press('Fewer people');
    await ui.type('Three of us?');
    await ui.pressText('Send question');
    const sent = s.calls.find((c) => c.method === 'POST');
    assert.equal(sent!.body.partySize, 3);
  });

  test('A SEND THE SERVER REFUSES SAYS WHY INSIDE THE SHEET, NOT IN A TOAST BEHIND IT', async () => {
    // The toast draws beneath the sheet's Modal: a refusal sent there was a
    // button that did nothing. A phone whose clock is a day off is the case
    // that reaches here, since the form runs the server's own checks.
    const toasts: string[] = [];
    const s = server({
      '/listings': [boat()], '/inquiries': [],
      'POST /listings/l1/inquiries': refuses('INVALID_INQUIRY', 'The inquiry is not complete. That day has already passed.'),
    }); restore = s.restore;
    const ui = await mountScreen(h(AskScreen, { onBack: noop, onToast: (m: string) => toasts.push(m) }));
    await ui.pressText('Longtail to Koh Taen');
    await ui.type('Two of us?');
    await ui.pressText('Send question');
    assert.match(ui.text(), /That day has already passed/);
    assert.match(ui.text(), /Send question/, 'the sheet closed on a refusal');
    assert.deepEqual(toasts, []);
  });

  test('OFFLINE ON THE PIER, THE SHEET SAYS SO AND KEEPS THE QUESTION', async () => {
    const s = server({ '/listings': [boat()], '/inquiries': [], 'POST /listings/l1/inquiries': offline() }); restore = s.restore;
    const ui = await mountScreen(h(AskScreen, { onBack: noop, onToast: noop }));
    await ui.pressText('Longtail to Koh Taen');
    await ui.type('Is the sea calm enough tomorrow?');
    await ui.pressText('Send question');
    assert.match(ui.text(), /You appear to be offline/);
    assert.match(ui.text(), /Is the sea calm enough tomorrow\?/, 'the typed question was lost');
  });
});

describe('your questions', () => {
  test('AN ANSWER IS THE OPERATOR’S, WITH THEIR QUOTE, AND BOOKS NOTHING', async () => {
    const s = server({
      '/listings': [boat()],
      '/inquiries': [asked({ state: 'answered', now: 'answered', answer: 'Yes, 8am from the pier.', quoteTHB: 2400 })],
    }); restore = s.restore;
    const ui = await mountScreen(h(AskScreen, { onBack: noop, onToast: noop }));
    const said = ui.text();
    assert.match(said, /Yes, 8am from the pier\./);
    assert.match(said, /Thong Krut Boat Co-op answered and quotes 2,400 THB/);
    assert.match(said, /Nothing is booked until you agree it with them directly/);
  });

  test('a question says how many people it was for, in words', async () => {
    const s = server({ '/listings': [boat()], '/inquiries': [asked(), asked({ id: 'i2', partySize: 1 })] }); restore = s.restore;
    const ui = await mountScreen(h(AskScreen, { onBack: noop, onToast: noop }));
    assert.match(ui.text(), /· 2 people/);
    assert.match(ui.text(), /· 1 person/);
  });

  test('a question still open can be withdrawn', async () => {
    const s = server({
      '/listings': [boat()], '/inquiries': [asked()],
      'POST /inquiries/i1/withdraw': asked({ state: 'withdrawn', now: 'withdrawn' }),
    }); restore = s.restore;
    const ui = await mountScreen(h(AskScreen, { onBack: noop, onToast: noop }));
    assert.match(ui.text(), /Sent — nothing is reserved/);
    await ui.pressText('Withdraw');
    assert.ok(s.calls.some((c) => c.method === 'POST' && c.path === '/inquiries/i1/withdraw'));
  });

  test('a decline shows the operator’s reason', async () => {
    const s = server({
      '/listings': [boat()],
      '/inquiries': [asked({ state: 'declined', now: 'declined', answer: 'Fully booked that day' })],
    }); restore = s.restore;
    const ui = await mountScreen(h(AskScreen, { onBack: noop, onToast: noop }));
    assert.match(ui.text(), /Their reason: Fully booked that day/);
  });

  test('AN EXPIRED QUESTION SAYS IT WENT UNANSWERED, AND OFFERS NOTHING TO DO', async () => {
    const s = server({ '/listings': [boat()], '/inquiries': [asked({ now: 'expired' })] }); restore = s.restore;
    const ui = await mountScreen(h(AskScreen, { onBack: noop, onToast: noop }));
    assert.match(ui.text(), /No answer in time/);
    assert.doesNotMatch(ui.text(), /Withdraw/);
  });

  test('NOTHING ON THE SCREEN, IN ANY STATE, SAYS CONFIRMED OR BOOKED', async () => {
    const all = ['sent', 'answered', 'declined', 'withdrawn', 'expired'].map((now, n) =>
      asked({ id: `i${n}`, now, state: now === 'expired' ? 'sent' : now, answer: now === 'answered' ? 'ok' : null }));
    const s = server({ '/listings': [boat()], '/inquiries': all }); restore = s.restore;
    const ui = await mountScreen(h(AskScreen, { onBack: noop, onToast: noop }));
    const said = ui.text();
    assert.doesNotMatch(said, /\bconfirmed\b/i);
    // "booked" appears only inside "Nothing is booked until...", which is the refusal.
    assert.doesNotMatch(said.replace(/Nothing is booked until/g, ''), /\bbooked\b/i);
  });
});

describe('an answer, arriving', () => {
  test('TAPPING "THE OPERATOR ANSWERED" OPENS THE SCREEN THE ANSWER IS ON', () => {
    // The server's notification says `inquiry` (pinned in the API's
    // inquiry-service test); the screen is `stays`. Unmapped, the tap fell
    // through to Home, where there is no answer to read.
    assert.equal(parseDeepLink({ screen: 'inquiry', inquiryId: 'i1' })?.screen, 'stays');
  });

  test('a screen the phone does not know is ignored, not guessed at', () => {
    assert.equal(parseDeepLink({ screen: 'booking' }), null);
  });
});

describe('the days offered', () => {
  test('a fortnight of island dates, starting today on the island', () => {
    const now = new Date('2026-10-01T20:00:00.000Z'); // 03:00 on the 2nd, island time
    const days = dayChoices(now);
    assert.equal(days.length, 14);
    assert.equal(days[0], islandDateKey(now));
    assert.equal(days[0], '2026-10-02');
    assert.equal(days[13], '2026-10-15');
  });
});
