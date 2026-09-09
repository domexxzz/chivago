import { strict as assert } from 'node:assert';
import { test, describe, afterEach } from 'node:test';
import { createElement as h } from 'react';

import { REVIEW_TRIP_POINTS } from '@chivago/core';
import { ComposeSheet, ReportSheet, AppealSheet, ReviewRow } from '../src/screens/PlaceReviews.tsx';
import { OfferRow } from '../src/screens/MarketScreen.tsx';
import { QuestRow } from '../src/screens/MissionsScreen.tsx';
import { fakeFetch, mount, server, type FakeCall } from './interact.ts';
import * as fx from './fixtures.ts';

/**
 * What a traveller DOES.
 *
 * The render tests ask what a screen says. These mount it, press things and
 * read what changed - which is the only way to reach ComposeSheet, ReportSheet
 * and AppealSheet at all, several hundred lines that nothing had ever executed.
 *
 * The network is faked at `globalThis.fetch`, so the REAL api client runs:
 * envelope handling, headers, paths. A test that stubbed the client module
 * would prove the screens agree with a hand-written fake and nothing else.
 */

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; });

const withServer = (answer: (path: string, method: string, body: unknown) => unknown) => {
  const fake = fakeFetch(answer);
  restore = fake.restore;
  return fake.calls;
};

describe('writing a review', () => {
  const sheet = (over: Record<string, unknown> = {}) =>
    mount(h(ComposeSheet, {
      placeId: 'chaweng', existing: null, visible: true,
      // The sheet takes the stars, the words and a clip now. These two say
      // which halves are on offer; a test that wants the other states passes
      // its own.
      canReview: true, storiesOpen: false, busy: false,
      onPickMedia: async () => null, onPostStory: async () => true,
      onClose: () => {}, onSaved: () => {}, onWithdrawn: () => {},
      ...over,
    } as never));

  test('you cannot post without choosing a rating', () => {
    const ui = sheet();
    try {
      const post = ui.find(/^Post$/);
      assert.ok(post, 'the post control should exist');
      // A review with no rating is not a review, and the server refuses it.
      assert.equal(post!.props.disabled, true);
    } finally { ui.unmount(); }
  });

  test('picking a rating enables it, and the sheet says which', async () => {
    const ui = sheet();
    try {
      await ui.press(/4 out of 5/);
      assert.equal(ui.find(/^Post$/)!.props.disabled, false);
      assert.match(ui.text(), /4 out of 5/);
    } finally { ui.unmount(); }
  });

  test('posting sends the rating and body to the right place', async () => {
    let saved = '';
    const calls: FakeCall[] = withServer(() => ({
      review: fx.review(), created: true, pointsAwarded: REVIEW_TRIP_POINTS,
    }));
    const ui = sheet({ onSaved: (m: string) => { saved = m; } });
    try {
      await ui.press(/5 out of 5/);
      await ui.type('Quiet at 7am and the water is clean, worth the early start.');
      await ui.press(/^Post$/);

      assert.equal(calls.length, 1);
      assert.equal(calls[0]!.method, 'POST');
      assert.equal(calls[0]!.path, '/places/chaweng/reviews');
      assert.deepEqual(calls[0]!.body, {
        rating: 5,
        body: 'Quiet at 7am and the water is clean, worth the early start.',
      });
      assert.match(saved, new RegExp(String(REVIEW_TRIP_POINTS)));
    } finally { ui.unmount(); }
  });

  test('a rating with no words says why it earned nothing', async () => {
    let saved = '';
    withServer(() => ({ review: fx.review({ body: null }), created: true, pointsAwarded: 0 }));
    const ui = sheet({ onSaved: (m: string) => { saved = m; } });
    try {
      await ui.press(/5 out of 5/);
      await ui.press(/^Post$/);
      // Discovering it by watching a number not move is worse than being told.
      assert.match(saved, /characters or more to earn/i);
    } finally { ui.unmount(); }
  });

  test('an edit opens with the existing review, not a blank sheet', () => {
    const existing = fx.review({ rating: 3, body: 'Busier than I expected on a Sunday.' });
    const ui = sheet({ existing });
    try {
      assert.match(ui.text(), /3 out of 5/);
      assert.match(ui.text(), /Busier than I expected/);
      assert.match(ui.text(), /Delete/);
    } finally { ui.unmount(); }
  });

  test('a new review offers no delete', () => {
    const ui = sheet();
    try {
      assert.doesNotMatch(ui.text(), /Delete/);
    } finally { ui.unmount(); }
  });
});

describe('reporting a review', () => {
  const sheet = (over: Record<string, unknown> = {}) =>
    mount(h(ReportSheet, {
      review: fx.review(), onClose: () => {}, onSent: () => {}, ...over,
    } as never));

  test('the sheet says what a report does before you send one', () => {
    const ui = sheet();
    try {
      // Somebody who expects the review to vanish, and watches it stay up,
      // concludes the button is decorative.
      assert.match(ui.text(), /does not remove it/i);
      assert.match(ui.text(), /only a moderator/i);
    } finally { ui.unmount(); }
  });

  test('a reason is required', async () => {
    const ui = sheet();
    try {
      assert.equal(ui.find(/Send report/)!.props.disabled, true);
      await ui.press(/It is abusive or threatening/);
      assert.equal(ui.find(/Send report/)!.props.disabled, false);
    } finally { ui.unmount(); }
  });

  test('it sends the reason KEY, not the sentence', async () => {
    const calls = withServer(() => ({ id: 'rep1' }));
    const ui = sheet();
    try {
      await ui.press(/It names or identifies someone/);
      await ui.type('Somsak is my brother and he left that job.');
      await ui.press(/Send report/);

      assert.equal(calls[0]!.path, `/reviews/${fx.review().id}/report`);
      // A key, so the moderator reads it in their language and the reporter
      // chose in theirs.
      assert.deepEqual(calls[0]!.body, {
        reason: 'personal_info',
        note: 'Somsak is my brother and he left that job.',
      });
    } finally { ui.unmount(); }
  });

  test('the note is optional', async () => {
    const calls = withServer(() => ({ id: 'rep1' }));
    const ui = sheet();
    try {
      await ui.press(/It is an advert or spam/);
      await ui.press(/Send report/);
      assert.deepEqual(calls[0]!.body, { reason: 'spam', note: null });
    } finally { ui.unmount(); }
  });
});

describe('appealing a take-down', () => {
  const state = {
    review: fx.review(),
    hiddenAt: '2026-08-31T04:00:00.000Z',
    hiddenReasonKey: 'personal_data',
    appeal: null,
  };
  const sheet = (over: Record<string, unknown> = {}) =>
    mount(h(AppealSheet, { state, onClose: () => {}, onSent: () => {}, ...over } as never));

  test('a bare "this is wrong" is not enough to send', async () => {
    const ui = sheet();
    try {
      assert.equal(ui.find(/Send appeal/)!.props.disabled, true);
      await ui.type('wrong');
      assert.equal(ui.find(/Send appeal/)!.props.disabled, true, 'still refused at five characters');
    } finally { ui.unmount(); }
  });

  test('a real appeal reaches the right review', async () => {
    const calls = withServer(() => ({ id: 'a1' }));
    const ui = sheet();
    try {
      await ui.type('Somsak is the name on the bar sign, not a person I singled out.');
      await ui.press(/Send appeal/);
      assert.equal(calls[0]!.path, `/reviews/${fx.review().id}/appeal`);
      assert.match(String((calls[0]!.body as { message: string }).message), /bar sign/);
    } finally { ui.unmount(); }
  });
});

describe('the controls on a review row', () => {
  test('your own review offers no report control', () => {
    const ui = mount(h(ReviewRow, {
      review: fx.review(), isMine: true, alreadyReported: false, onReport: () => {},
    } as never));
    try {
      assert.equal(ui.find(/Report this review/), undefined);
    } finally { ui.unmount(); }
  });

  test('reporting fires once, and not again once reported', async () => {
    let reports = 0;
    const first = mount(h(ReviewRow, {
      review: fx.review(), isMine: false, alreadyReported: false,
      onReport: () => { reports += 1; },
    } as never));
    try {
      await first.press(/Report this review/);
      assert.equal(reports, 1);
    } finally { first.unmount(); }

    const again = mount(h(ReviewRow, {
      review: fx.review(), isMine: false, alreadyReported: true,
      onReport: () => { reports += 1; },
    } as never));
    try {
      const control = again.find(/already reported/i)!;
      assert.equal(control.props.disabled, true);
      // Disabled AND its handler removed: a disabled control that still fires
      // is the worst of both.
      assert.equal(control.props.onPress, undefined);
      assert.equal(reports, 1);
    } finally { again.unmount(); }
  });
});

describe('rows that lead somewhere', () => {
  test('an offer row redeems', async () => {
    let redeemed = 0;
    const ui = mount(h(OfferRow, {
      offer: fx.offer(), affordable: true, onRedeem: () => { redeemed += 1; }, busy: false,
    } as never));
    try {
      await ui.press(/Redeem/);
      assert.equal(redeemed, 1);
    } finally { ui.unmount(); }
  });

  test('an unaffordable offer is still pressable, so the toast can explain', async () => {
    let redeemed = 0;
    const ui = mount(h(OfferRow, {
      offer: fx.offer(), affordable: false, onRedeem: () => { redeemed += 1; }, busy: false,
    } as never));
    try {
      await ui.press(/Redeem/);
      // Kept tappable on purpose: a disabled control tells the user nothing
      // about how far off they are.
      assert.equal(redeemed, 1);
    } finally { ui.unmount(); }
  });

  test('a quest row opens its quest', async () => {
    let opened = 0;
    const ui = mount(h(QuestRow, {
      quest: fx.quest(), progress: null, onPress: () => { opened += 1; },
    } as never));
    try {
      await ui.press(/Beach Cleanup/);
      assert.equal(opened, 1);
    } finally { ui.unmount(); }
  });
});

/**
 * One sheet, two halves.
 *
 * Stars and a clip used to be two buttons in two blocks, which asked a
 * traveller to decide what KIND of thing they were leaving before they had
 * said anything - and a clip posted through the old button carried no words,
 * because that flow had no text box. What is STORED is still apart, because
 * a rating aggregates and lasts while a clip expires in seven days. What a
 * person meets is one sheet.
 */
describe('leaving something at a place', () => {
  const media = { uri: 'file:///clip.mp4', name: 'clip.mp4', type: 'video/mp4' };

  const sheetWith = (over: Record<string, unknown>) =>
    mount(h(ComposeSheet, {
      placeId: 'chaweng', existing: null, visible: true,
      canReview: true, storiesOpen: true, busy: false,
      onPickMedia: async () => media, onPostStory: async () => true,
      onClose: () => {}, onSaved: () => {}, onWithdrawn: () => {},
      ...over,
    } as never));

  test('nothing chosen is not an error, it is a button that waits', () => {
    const ui = sheetWith({});
    try {
      assert.equal(ui.find(/^Post$/)!.props.disabled, true);
      assert.ok(ui.text().includes('Add a rating, a photo or a clip'), 'and it says what is missing');
    } finally { ui.unmount(); }
  });

  test('a clip alone is enough, with no rating at all', async () => {
    let posted: { caption: string } | null = null;
    const ui = sheetWith({
      onPostStory: async (_m: unknown, caption: string) => { posted = { caption }; return true; },
    });
    try {
      await ui.pressText(/Add a photo or a clip/);
      assert.equal(ui.find(/^Post$/)!.props.disabled, false, 'a clip is something to post');
      await ui.pressText(/^Post$/);
      assert.deepEqual(posted, { caption: '' });
    } finally { ui.unmount(); }
  });

  test('the words become the review body AND the clip’s caption', async () => {
    // The clip used to carry no caption at all, because the flow that posted
    // it had no text box. It borrows the one the review is using.
    let caption: string | null = null;
    const net = server({ 'POST /places/chaweng/reviews': { created: true, pointsAwarded: 5 } });
    const ui = sheetWith({
      onPostStory: async (_m: unknown, c: string) => { caption = c; return true; },
    });
    try {
      await ui.pressText(/Add a photo or a clip/);
      await ui.type('the lake at six, nobody about');
      await ui.pressText(/^3$/);
      await ui.pressText(/^Post$/);
      assert.equal(caption, 'the lake at six, nobody about');
      const sent = net.calls.find((c) => c.method === 'POST' && c.path === '/places/chaweng/reviews');
      assert.deepEqual(sent?.body, { rating: 3, body: 'the lake at six, nobody about' });
    } finally { ui.unmount(); net.restore(); }
  });

  test('a shut story door leaves the stars and takes the camera away', () => {
    const ui = sheetWith({ storiesOpen: false });
    try {
      assert.doesNotMatch(ui.text(), /Add a photo or a clip/);
      assert.match(ui.text(), /1|2|3|4|5/, 'the rating is still on offer');
    } finally { ui.unmount(); }
  });

  test('no check-in yet: the stars say why, and a clip is still allowed', () => {
    const ui = sheetWith({ canReview: false });
    try {
      assert.match(ui.text(), /Check in here to leave a rating/);
      assert.match(ui.text(), /Add a photo or a clip/);
    } finally { ui.unmount(); }
  });
});
