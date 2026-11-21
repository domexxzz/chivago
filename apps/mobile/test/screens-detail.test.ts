/**
 * The six screens the first whole-screen pass left out.
 *
 * Same harness as `whole-screens.test.ts`: a route table for the network, and
 * a mount that waits for whatever the screen fetches. Two of these screens also
 * touch native APIs — location for a check-in, the camera for quest proof — so
 * the Expo stub now carries a `control` a test can steer.
 */

import { beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { Linking } from 'react-native';

import { act } from 'react-test-renderer';
import { motion } from '@chivago/tokens';
import { areaByKey, DEFAULT_AREA, type ScoredPlace } from '@chivago/core';
import { mountScreen, offline, refuses, server, settle } from './interact.ts';
import { __setLocaleForTests } from '../src/i18n/locale.ts';
import { __setAreaForTests } from '../src/state/area.ts';
import { control, resetControl } from './stubs/native.mjs';
import { place, progress, quest, review, shield, summary, wallet } from './fixtures.ts';

import { Hero, PlaceScreen } from '../src/screens/PlaceScreen.tsx';
import { ReviewsBlock } from '../src/screens/PlaceReviews.tsx';
import { QuestDetailScreen } from '../src/screens/QuestDetail.tsx';
import { SafetyScreen } from '../src/screens/SafetyScreen.tsx';
import { ConciergeScreen } from '../src/screens/ConciergeScreen.tsx';
import { CompanionHomeScreen } from '../src/screens/CompanionHome.tsx';
import { PassportScreen } from '../src/screens/PassportScreen.tsx';
import { companionsFor } from '@chivago/core';
import { TripScreen } from '../src/screens/TripScreen.tsx';
import { OnboardingScreen } from '../src/screens/Onboarding.tsx';
import { ImpactScreen } from '../src/screens/ImpactScreen.tsx';
import { WalletScreen } from '../src/screens/WalletScreen.tsx';
import { __resetServerConfig } from '../src/state/server-config.ts';

const noop = () => {};

const priceRoutes = {
  'POST /prices': {
    today: {
      category: 'stay', date: '2026-12-30',
      band: { low: 2900, typical: 3550, high: 4200, currency: 'THB' },
      isFestival: true,
      drivers: [
        { label: { en: 'Peak season', th: 'ฤดูท่องเที่ยวสูงสุด' }, effect: 1.5 },
        { label: { en: 'New Year', th: 'ปีใหม่' }, effect: 1.7 },
      ],
      confidence: 'rough',
      caveat: {
        en: 'A range, not a quote. Modelled from season and typical rates as of 2026-09-01; no partner inventory yet.',
        th: 'เป็นช่วงราคา ไม่ใช่ราคาจอง คำนวณจากฤดูกาลและค่าเฉลี่ย',
      },
    },
    outlook: [
      { month: '2026-11', label: { en: 'Wettest month', th: 'เดือนฝนชุก' }, band: { low: 850, typical: 1050, high: 1250, currency: 'THB' }, hasFestival: true, confidence: 'rough' },
      { month: '2026-12', label: { en: 'Peak season', th: 'ฤดูสูงสุด' }, band: { low: 1700, typical: 2100, high: 2500, currency: 'THB' }, hasFestival: true, confidence: 'rough' },
    ],
    cheapest: { month: '2026-11', label: { en: 'Wettest month', th: 'เดือนฝนชุก' }, band: { low: 850, typical: 1050, high: 1250, currency: 'THB' }, hasFestival: true, confidence: 'rough' },
  },
};



describe('a place, and checking in to it', () => {
  const props = (over = {}) => ({
    placeId: 'chaweng', onBack: noop, onAddToTrip: noop, onSafePath: noop,
    onToast: noop, onPointsChanged: noop, ...over,
  });

  test('it fetches the place and today\'s check-ins, and shows the score', async () => {
    const net = server({
      'GET /places/chaweng': place(),
      'GET /checkins/today': [],
      'GET /visits/self': { places: [], remainingThisYear: 10 },
      'GET /places/chaweng/reviews': { reviews: [], mine: null, canReview: false, reported: [] },
      'GET /places/chaweng/history': { since: null, days: [] },
      'GET /places/chaweng/stories': { open: false, stories: [] },
      'GET /medals': { medals: [], earned: 0, total: 0, basis: { en: 'x', th: 'x' } },
    });
    try {
      const ui = await mountScreen(h(PlaceScreen, props()));
      // Eight fetches: the screen carries the reviews block, the air history,
      // the stories, and the medals as they stand before any check-in. Plus
      // `/config`, which the visitor count reads to know whether it may still
      // call itself geofenced - one request per launch, shared, not per
      // screen. See src/state/server-config.ts.
      assert.deepEqual(
        net.calls.map((c) => c.path).sort(),
        ['/checkins/today', '/config', '/medals', '/places/chaweng', '/places/chaweng/history', '/places/chaweng/reviews', '/places/chaweng/stories', '/visits/self'],
      );
      assert.deepEqual(net.missing, []);

      const said = ui.text();
      assert.match(said, /Chaweng Beach/);
      assert.match(said, /82/, 'the healthy score');
      assert.match(said, /Check in here/, 'a place not yet visited today offers the check-in');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('a place with a booking page offers it, and the button opens that page', async () => {
    __setLocaleForTests('en');
    const booking = 'https://badminton-booking-ihw1.onrender.com/';
    const opened = mock.method(Linking, 'openURL', async () => true);
    const net = server({ 'GET /places/chaweng': place({ bookingUrl: booking }), 'GET /checkins/today': [] });
    try {
      const ui = await mountScreen(h(PlaceScreen, props()));
      await ui.pressText('Book on their site');
      assert.deepEqual(opened.mock.calls.map((c) => c.arguments[0]), [booking]);
      ui.unmount();
    } finally { net.restore(); opened.mock.restore(); }
  });

  test('no booking page, or one that is not plain https, and there is no button', async () => {
    __setLocaleForTests('en');
    for (const bookingUrl of [null, 'http://badminton-booking-ihw1.onrender.com/', 'javascript:alert(1)']) {
      const net = server({ 'GET /places/chaweng': place({ bookingUrl }), 'GET /checkins/today': [] });
      try {
        const ui = await mountScreen(h(PlaceScreen, props()));
        assert.doesNotMatch(ui.text(), /Book on their site/, String(bookingUrl));
        ui.unmount();
      } finally { net.restore(); }
    }
  });

  test('a place already checked in today says so instead of offering again', async () => {
    // Server state, not screen state: it survives a reinstall.
    const net = server({ 'GET /places/chaweng': place(), 'GET /checkins/today': ['chaweng'] });
    try {
      const ui = await mountScreen(h(PlaceScreen, props()));
      assert.match(ui.text(), /Already checked in here today/);
      assert.doesNotMatch(ui.text(), /Check in here/);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('checking in sends the phone\'s position and reports the award', async () => {
    let toasted = '';
    let pointsChanged = 0;
    // The medals before and after: the server counts both, the phone compares.
    const medal = (earned: boolean) => ({
      key: 'first-steps', name: { en: 'First steps', th: 'ก้าวแรก' }, how: { en: 'x', th: 'x' }, mark: 'footprints',
      earned, earnedAt: earned ? '2026-09-07T09:00:00Z' : null, progress: { done: earned ? 1 : 0, total: 1, unit: 'places' },
    });
    let checkedIn = false;
    const net = server({
      'GET /places/chaweng': place(),
      'GET /checkins/today': [],
      'GET /medals': () => ({ medals: [medal(checkedIn)], earned: checkedIn ? 1 : 0, total: 1, basis: { en: 'x', th: 'x' } }),
      'POST /places/chaweng/checkin': () => {
        checkedIn = true;
        return {
          placeId: 'chaweng', placeName: 'Chaweng Beach', awarded: true, pointsAwarded: 40,
          balances: { trip: 360, green: 1240 }, exp: 40, distanceM: 18,
        };
      },
    });
    try {
      const ui = await mountScreen(h(PlaceScreen, props({
        onToast: (m: string) => { toasted = m; },
        onPointsChanged: () => { pointsChanged += 1; },
      })));

      await ui.pressText(/Check in here/);
      await settle();

      const posted = net.calls.find((c) => c.method === 'POST');
      assert.ok(posted, 'a check-in must reach the server');
      // The client sends coordinates and the SERVER decides the geofence.
      // A client that judged its own distance is a client that can lie.
      assert.deepEqual(posted.body, { lat: 9.5357, lng: 100.0617, accuracyM: 12, mocked: false });
      assert.match(toasted, /\+40 Trip Points/);
      assert.match(toasted, /Medal earned: First steps/, 'the medal this check-in finished is said beside the points');
      assert.equal(pointsChanged, 1);
      ui.unmount();
    } finally { net.restore(); resetControl(); }
  });

  test('a refused location never reaches the server', async () => {
    let toasted = '';
    const net = server({ 'GET /places/chaweng': place(), 'GET /checkins/today': [] });
    try {
      control.permission = { granted: false, status: 'denied' };
      const ui = await mountScreen(h(PlaceScreen, props({ onToast: (m: string) => { toasted = m; } })));

      await ui.pressText(/Check in here/);
      await settle();

      assert.match(toasted, /Location permission/);
      assert.equal(net.calls.filter((c) => c.method === 'POST').length, 0);
      ui.unmount();
    } finally { net.restore(); resetControl(); }
  });

  test('it says how far away the place is, and which way', async () => {
    // The distance existed before this and was only ever spoken while
    // REFUSING a check-in. Chaweng is at 9.5357/100.0617; standing a little
    // south-west of it is about 1.5 km away.
    const net = server({ 'GET /places/chaweng': place(), 'GET /checkins/today': [] });
    try {
      control.position = { coords: { latitude: 9.5262, longitude: 100.0518, accuracy: 12 } };
      const ui = await mountScreen(h(PlaceScreen, props()));
      const said = ui.text();
      assert.match(said, /1\.5 km/, 'the distance is not shown');
      assert.match(said, /north-east/i, 'the direction is not shown');
      assert.match(said, /on foot/i, 'the walk is not estimated');
      assert.match(said, /Open in Google Maps/);
      ui.unmount();
    } finally { net.restore(); resetControl(); }
  });

  test('a place too far to walk to is not quoted as a walk', async () => {
    // "About 105 min on foot" beside eight kilometres is not information
    // anybody can use, and on this island in this heat it is bad advice.
    const naMuang = place({ id: 'namuang', name: { en: 'Na Muang Waterfall', th: 'น้ำตกหน้าเมือง' }, lat: 9.4682, lng: 99.9856 });
    const net = server({ 'GET /places/namuang': naMuang, 'GET /checkins/today': [] });
    try {
      const ui = await mountScreen(h(PlaceScreen, props({ placeId: 'namuang' })));
      const said = ui.text();
      assert.match(said, /km/, 'the distance is still shown');
      assert.doesNotMatch(said, /on foot/i, 'an eight-kilometre walk was suggested');
      assert.match(said, /Open in Google Maps/);
      ui.unmount();
    } finally { net.restore(); resetControl(); }
  });

  test('standing on the place reads as arrival, not as a distance', async () => {
    // "250 m away" directly above a check-in button that works reads as a
    // contradiction. The default stub position IS Chaweng.
    const net = server({ 'GET /places/chaweng': place(), 'GET /checkins/today': [] });
    try {
      const ui = await mountScreen(h(PlaceScreen, props()));
      const said = ui.text();
      assert.match(said, /You're here/);
      assert.doesNotMatch(said, /of you/, 'a distance was shown from inside the fence');
      assert.match(said, /Open in Google Maps/, 'the map is offered wherever you stand');
      ui.unmount();
    } finally { net.restore(); resetControl(); }
  });

  test('no location permission costs the distance, not the map', async () => {
    // And it raises no dialog to get one: a screen that nags for location to
    // show a nice-to-have teaches people to refuse the request that matters.
    const net = server({ 'GET /places/chaweng': place(), 'GET /checkins/today': [] });
    try {
      control.permission = { granted: false, status: 'denied' };
      const ui = await mountScreen(h(PlaceScreen, props()));
      const said = ui.text();
      assert.match(said, /Distance needs your location/);
      assert.doesNotMatch(said, /on foot/i, 'a walk was estimated with no position');
      assert.match(said, /Open in Google Maps/);
      ui.unmount();
    } finally { net.restore(); resetControl(); }
  });

  test('standing too far away shows safe localised copy, not the raw server sentence', async () => {
    let toasted = '';
    const net = server({
      'GET /places/chaweng': place(),
      'GET /checkins/today': [],
      'POST /places/chaweng/checkin': refuses('TOO_FAR', 'You need to be at the place to check in — about 800 m away'),
      'GET /visits/self': { places: [], remainingThisYear: 10 },
      'POST /places/chaweng/visits': { placeId: 'chaweng', recorded: true, remainingThisYear: 9 },
    });
    try {
      const ui = await mountScreen(h(PlaceScreen, props({ onToast: (m: string) => { toasted = m; } })));
      assert.ok(!ui.find(/Note that I was here/), 'the other half must not be offered before a check-in has failed');
      await ui.pressText(/Check in here/);
      await settle();

      assert.match(toasted, /need to be at the place/i);
      assert.doesNotMatch(toasted, /800 m away/, 'diagnostic server copy must not reach the UI');

      // Recorded, not scored: the refusal is followed by the other half.
      assert.ok(ui.find(/Note that I was here/), 'a failed check-in should offer to note the visit');
      await ui.pressText(/Note that I was here/);
      await settle();
      assert.match(toasted, /self-reported . 9 more this year/);
      assert.equal(net.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/visits')).length, 1);
      ui.unmount();
    } finally { net.restore(); resetControl(); }
  });

  test('a place that will not load offers a retry rather than a blank page', async () => {
    const net = server({ 'GET /places/chaweng': offline(), 'GET /checkins/today': [] });
    try {
      const ui = await mountScreen(h(PlaceScreen, props()));
      assert.match(ui.text(), /offline/i);
      assert.ok(ui.find(/retry/i));
      ui.unmount();
    } finally { net.restore(); }
  });
});

describe('the reviews block, which fetches its own list', () => {
  const props = (over = {}) => ({
    placeId: 'chaweng', summary: summary({ count: 1, average: 5, distribution: [0, 0, 0, 0, 1] }),
    justCheckedIn: false, storiesOpen: false, busy: false,
    onPickMedia: async () => null, onPostStory: async () => true,
    onToast: noop, onPointsChanged: noop, ...over,
  });
  const body = (over = {}) => ({ reviews: [], mine: null, canReview: false, reported: [], ...over });

  test('reviews that arrive are listed, with the verification leading', async () => {
    const net = server({
      'GET /places/chaweng/reviews': body({
        reviews: [review({ body: 'Quiet at 7am, shade at the north end.' })],
      }),
    });
    try {
      const ui = await mountScreen(h(ReviewsBlock, props()));
      const said = ui.text();
      assert.match(said, /Quiet at 7am/);
      assert.match(said, /verified|Checked in/i, 'the check-in is what makes a review trustworthy');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('someone who has been here is offered the write control', async () => {
    const net = server({ 'GET /places/chaweng/reviews': body({ canReview: true }) });
    try {
      const ui = await mountScreen(h(ReviewsBlock, props()));
      assert.match(ui.text(), /Write|Review/i, 'a past visitor may write');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('someone who has never been here is not offered it', async () => {
    const net = server({ 'GET /places/chaweng/reviews': body({ canReview: false }) });
    try {
      const ui = await mountScreen(h(ReviewsBlock, props()));
      assert.doesNotMatch(ui.text(), /Write a review/i);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('a failed fetch says so instead of looking like an unreviewed place', async () => {
    // The block used to `return` on failure with no state recorded at all:
    // no message, no retry, and canReview stuck false — so a traveller who HAD
    // been here silently lost the ability to write. An empty list and a broken
    // list must not look the same.
    const net = server({
      'GET /places/chaweng/reviews': refuses('REVIEWS_DOWN', 'Reviews are unavailable right now.'),
    });
    try {
      const ui = await mountScreen(h(ReviewsBlock, props()));
      assert.match(ui.text(), /Something went wrong\. Please try again\./);
      assert.doesNotMatch(ui.text(), /Reviews are unavailable right now\./);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('a review taken down is still shown to its own author, with why', async () => {
    const net = server({
      'GET /places/chaweng/reviews': body({
        canReview: true,
        // The reason travels as a KEY and is rendered per reader. The
        // traveller must never be shown the literal `personal_data`.
        mine: {
          review: review({ id: 'r9', body: 'My own words.' }),
          hiddenAt: '2026-08-31T05:00:00.000Z',
          hiddenReasonKey: 'personal_data',
          appeal: null,
        },
      }),
    });
    try {
      const ui = await mountScreen(h(ReviewsBlock, props()));
      const said = ui.text();
      assert.match(said, /My own words\./, 'a review that silently vanishes is the worst version');
      assert.match(said, /Identifies an individual by name or contact details/, 'and it must say why');
      assert.doesNotMatch(said, /personal_data/, 'the key is never shown to a reader');
      ui.unmount();
    } finally { net.restore(); }
  });
});

describe('a quest, from joining to verification', () => {
  const props = (over = {}) => ({
    questId: 'q1', onBack: noop, onOpenWallet: noop, onToast: noop,
    onPointsChanged: noop, ...over,
  });
  const detail = (p: unknown = null) => ({ quest: quest(), progress: p });

  test('an unjoined quest shows the reward, the host, and one way in', async () => {
    const net = server({ 'GET /quests/q1': detail(null) });
    try {
      const ui = await mountScreen(h(QuestDetailScreen, props()));
      const said = ui.text();
      assert.match(said, /Beach Cleanup/);
      assert.match(said, /Samui Municipality/, 'a quest without a host is not verifiable');
      assert.match(said, /150/, 'the reward');
      assert.match(said, /Join this quest/);
      assert.doesNotMatch(said, /I'm at the site/, 'you cannot arrive before you join');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('a Koh Sichang pilot shows its real criteria and opens the verified quest workflow', async () => {
    const pilot = quest({
      id: 'q-sg-explorer',
      code: 'SG-01',
      name: { en: 'Sichang Explorer', th: 'นักสำรวจเกาะสีชัง', zh: '锡昌岛探索家' },
      where: { en: 'Koh Sichang', th: 'เกาะสีชัง', zh: '锡昌岛' },
      duration: { en: 'Pilot schedule', th: 'ตามรอบทดลอง', zh: '试运行时段' },
      rewardPoints: 0,
      rewardExp: 150,
      rewardCurrency: 'trip',
    });
    const net = server({ 'GET /quests/q-sg-explorer': { quest: pilot, progress: null } });
    try {
      const ui = await mountScreen(h(QuestDetailScreen, props({ questId: pilot.id })));
      const said = ui.text();
      assert.match(said, /150 XP/);
      assert.match(said, /Check in at 3 designated points/);
      assert.match(said, /Answer at least 5 of 6 questions correctly/);
      assert.match(said, /Open for participation/);
      assert.match(said, /Join this quest/);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('joining posts, and the screen moves on to arriving', async () => {
    // Joining reloads the quest rather than trusting the POST's own reply, so
    // the route has to answer the way the server would the second time.
    let joined = false;
    const net = server({
      'GET /quests/q1': () => detail(joined ? progress({ stage: 'joined' }) : null),
      'POST /quests/q1/join': () => { joined = true; return progress({ stage: 'joined' }); },
    });
    try {
      const ui = await mountScreen(h(QuestDetailScreen, props()));
      await ui.pressText(/Join this quest/);
      await settle();

      assert.ok(net.calls.some((c) => c.method === 'POST' && c.path === '/quests/q1/join'));
      assert.match(ui.text(), /I'm at the site/, 'the next step should be offered');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('arriving sends the position the server will geofence', async () => {
    const net = server({
      'GET /quests/q1': detail(progress({ stage: 'joined' })),
      'POST /quests/q1/arrive': progress({ stage: 'arrived', arrivedAt: '2026-08-31T02:00:00.000Z' }),
    });
    try {
      const ui = await mountScreen(h(QuestDetailScreen, props()));
      await ui.pressText(/I'm at the site/);
      await settle();

      const posted = net.calls.find((c) => c.path === '/quests/q1/arrive');
      assert.ok(posted, 'arriving must reach the server');
      assert.deepEqual(posted.body, { lat: 9.5357, lng: 100.0617, accuracyM: 12, mocked: false });
      ui.unmount();
    } finally { net.restore(); resetControl(); }
  });

  test('a quest awaiting the host says who is checking, not "done"', async () => {
    const net = server({
      'GET /quests/q1': detail(progress({ stage: 'host_verification', proofSubmittedAt: '2026-08-31T03:00:00.000Z' })),
    });
    try {
      const ui = await mountScreen(h(QuestDetailScreen, props()));
      const said = ui.text();
      assert.match(said, /Samui Municipality/, 'the traveller should know who is deciding');
      assert.doesNotMatch(said, /Join this quest/);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('where the photos are sent, it says an AI may look - and who still decides', async () => {
    __resetServerConfig();
    const net = server({
      'GET /config': { fenceOff: false, autoApprove: false, aiAssist: true },
      'GET /quests/q1': detail(progress({ stage: 'arrived', arrivedAt: '2026-08-31T02:00:00.000Z' })),
    });
    try {
      const ui = await mountScreen(h(QuestDetailScreen, props()));
      await settle();
      assert.match(ui.text(), /An AI may look at your photos/);
      assert.match(ui.text(), /the host decides/);
      ui.unmount();
    } finally { net.restore(); __resetServerConfig(); }
  });

  test('a server that sends nothing to an AI does not claim it might', async () => {
    __resetServerConfig();
    const net = server({
      'GET /config': { fenceOff: false, autoApprove: false, aiAssist: false },
      'GET /quests/q1': detail(progress({ stage: 'arrived', arrivedAt: '2026-08-31T02:00:00.000Z' })),
    });
    try {
      const ui = await mountScreen(h(QuestDetailScreen, props()));
      await settle();
      assert.doesNotMatch(ui.text(), /An AI may look/);
      assert.match(ui.text(), /Verified by host within 24h/, 'the proof box itself is still there');
      ui.unmount();
    } finally { net.restore(); __resetServerConfig(); }
  });

  test('a rejected quest shows the reason in the reader\'s language', async () => {
    // The rejection is stored bilingual because the reviewer and the volunteer
    // rarely share a language.
    const net = server({
      'GET /quests/q1': detail(progress({
        stage: 'arrived',
        rejectedAt: '2026-08-31T04:00:00.000Z',
        rejectionReason: { en: 'The photo has no location data', th: 'รูปไม่มีข้อมูลตำแหน่ง' },
      })),
    });
    try {
      const ui = await mountScreen(h(QuestDetailScreen, props()));
      assert.match(ui.text(), /The photo has no location data/);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('a quest that will not load never renders a half-quest', async () => {
    const net = server({ 'GET /quests/q1': refuses('GONE', 'That quest has ended.') });
    try {
      const ui = await mountScreen(h(QuestDetailScreen, props()));
      const said = ui.text();
      assert.match(said, /Something went wrong\. Please try again\./);
      assert.doesNotMatch(said, /That quest has ended\./);
      assert.doesNotMatch(said, /Join this quest/, 'no CTA without a quest behind it');
      ui.unmount();
    } finally { net.restore(); }
  });
});

describe('a verified quest, and whose record it is on', () => {
  const props = () => ({
    questId: 'q1', onBack: noop, onOpenWallet: noop, onToast: noop, onPointsChanged: noop,
  });
  const done = () => ({
    quest: quest(),
    progress: progress({ stage: 'complete', verifiedAt: '2026-08-31T05:00:00.000Z' }),
  });
  const filed = {
    statements: [{
      id: 'CG-2026-7K3M9Q',
      host: { id: 'h1', name: 'Samui Municipality', type: 'municipality' },
      period: { from: '2026-01-01', to: '2026-12-31' },
      issuedAt: '2026-09-01T02:00:00.000Z',
      quests: [{ id: 'q1', name: { en: 'Beach Cleanup', th: 'เก็บขยะชายหาด' } }],
    }],
  };

  test('says which statement the host filed it in, by public id', async () => {
    const net = server({ 'GET /quests/q1': done(), 'GET /me/statements': filed });
    try {
      const ui = await mountScreen(h(QuestDetailScreen, props()));
      await settle();
      const said = ui.text();
      assert.match(said, /Verified/);
      assert.match(said, /On record/);
      assert.match(said, /CG-2026-7K3M9Q/, 'the public id, so the traveller can quote it');
      assert.match(said, /Samui Municipality filed this/);
      assert.match(said, /Anyone can check/);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('a statement that counts other quests is not this one\'s', async () => {
    const other = {
      statements: [{ ...filed.statements[0], quests: [{ id: 'q2', name: { en: 'Mangrove Planting', th: 'ปลูกป่าชายเลน' } }] }],
    };
    const net = server({ 'GET /quests/q1': done(), 'GET /me/statements': other });
    try {
      const ui = await mountScreen(h(QuestDetailScreen, props()));
      await settle();
      assert.match(ui.text(), /Verified/);
      assert.doesNotMatch(ui.text(), /On record/);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('the statement route failing leaves the verification standing', async () => {
    const net = server({
      'GET /quests/q1': done(),
      'GET /me/statements': refuses('STATEMENTS_DOWN', 'Statements are unavailable right now.'),
    });
    try {
      const ui = await mountScreen(h(QuestDetailScreen, props()));
      await settle();
      assert.match(ui.text(), /Verified/);
      assert.doesNotMatch(ui.text(), /On record|unavailable/);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('the weight it reports is the one on the approved proof, or none at all', async () => {
    // It used to say 4.2 kg to everyone. A statement next to it said 3.2.
    const weighed = server({
      'GET /quests/q1': { quest: quest(), progress: progress({ stage: 'complete', weightKg: 3.2 }) },
      'GET /me/statements': { statements: [] },
    });
    try {
      const ui = await mountScreen(h(QuestDetailScreen, props()));
      await settle();
      assert.match(ui.text(), /3\.2 kg waste logged/);
      ui.unmount();
    } finally { weighed.restore(); }
    const unweighed = server({
      'GET /quests/q1': { quest: quest(), progress: progress({ stage: 'complete', weightKg: null }) },
      'GET /me/statements': { statements: [] },
    });
    try {
      const ui = await mountScreen(h(QuestDetailScreen, props()));
      await settle();
      assert.match(ui.text(), /logged to the Samui impact ledger/);
      assert.doesNotMatch(ui.text(), /kg waste|4\.2/, 'a number the app does not hold');
      ui.unmount();
    } finally { unweighed.restore(); }
  });

  test('an unverified quest never asks whose record it is on', async () => {
    const net = server({ 'GET /quests/q1': { quest: quest(), progress: progress({ stage: 'joined' }) } });
    try {
      const ui = await mountScreen(h(QuestDetailScreen, props()));
      await settle();
      assert.ok(!net.calls.some((c) => c.path === '/me/statements'), 'nothing to be on yet');
      ui.unmount();
    } finally { net.restore(); }
  });
});

describe('the safety shield', () => {
  const props = (over = {}) => ({
    alert: null, onFire: noop, onCancel: noop, onShare: noop, firing: false, ...over,
  });
  const alert = {
    id: 's1', status: 'dispatching' as const, lat: 13.161443, lng: 100.810441,
    locationLabel: 'Tha Lang pier, 120 m', firedAt: '2026-08-31T05:00:00.000Z',
    acknowledgedAt: null, acknowledgedBy: null, nearestHospital: 'Koh Sichang Hospital',
    note: null, shareUrl: 'https://chiva.go/s/abc', lastPositionAt: null,
    dispatches: [], contactsReached: 2, contactsTotal: 3,
  };

  test('every shield service is listed with its own state', async () => {
    const net = server({ 'GET /shield': shield() });
    try {
      const ui = await mountScreen(h(SafetyScreen, props()));
      const said = ui.text();
      assert.match(said, /One-tap SOS/);
      assert.match(said, /Thai interpreter/);
      assert.match(said, /Live location share/);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('a live alert counts only the contacts actually reached', async () => {
    // "2 of 3" is counted from real dispatch attempts. A screen that claimed
    // everyone had been reached would be the worst possible lie here.
    const net = server({ 'GET /shield': shield() });
    try {
      const ui = await mountScreen(h(SafetyScreen, props({ alert })));
      const said = ui.text();
      assert.match(said, /2 of 3 contacts reached/);
      assert.match(said, /Tha Lang pier, 120 m/, 'the location is on screen');
      assert.match(said, /Nobody has picked this up yet/, 'unacknowledged must say so');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('it never implies ChivarGo is the ambulance', async () => {
    // The single most important sentence in the app. It must survive any
    // rewording of this screen.
    const net = server({ 'GET /shield': shield() });
    try {
      const ui = await mountScreen(h(SafetyScreen, props({ alert })));
      const said = ui.text();
      assert.match(said, /cannot send an ambulance/i);
      assert.match(said, /1669/, 'the real emergency number, on screen, always');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('a live alert keeps its Thai whatever language the app is set to', async () => {
    /*
     * The responder's language, not the traveller's. A Thai medic handed an
     * English or Chinese tourist's phone reads the dispatch state, the
     * emergency service names and the two SOS buttons off this screen, so
     * every one of those lines carries Thai regardless of the app language.
     *
     * The rule is written in `i18n/locale.ts`. It has now been stripped twice
     * - #150 removed `always` from all ten lines here and `bilingual` from
     * both buttons on a consistency argument, and the fix after it restored
     * only the banner in `Shell.tsx`. This test is here so the third time
     * fails in CI instead of on an island.
     */
    const net = server({ 'GET /shield': shield() });
    try {
      for (const locale of ['en', 'th', 'zh'] as const) {
        __setLocaleForTests(locale);
        const ui = await mountScreen(h(SafetyScreen, props({ alert })));
        const said = ui.text();
        // Named lines, not "is there any Thai on screen": the two bilingual
        // buttons alone would satisfy that, and did - the first version of
        // this test passed with `always` stripped from all ten lines.
        assert.match(said, /ส่งรถพยาบาลไม่ได้/, `"we cannot send an ambulance", in ${locale}`);
        assert.match(said, /ยังไม่มีเจ้าหน้าที่รับเรื่อง/, `"nobody has picked this up", in ${locale}`);
        assert.match(said, /Tha Lang pier, 120 m/, `the location, in ${locale}`);
        ui.unmount();
      }
    } finally {
      __setLocaleForTests('en');
      net.restore();
    }
  });

  test('the shield list failing does not take the SOS control with it', async () => {
    // The one screen where a failed fetch must never remove a control: the
    // service list is informational, firing an SOS is not.
    const net = server({ 'GET /shield': offline() });
    try {
      const ui = await mountScreen(h(SafetyScreen, props()));
      assert.match(ui.text(), /offline/i, 'the failure is stated');
      assert.match(ui.text(), /SOS/i, 'and the SOS is still there');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('the island stations are on screen, not just the hotlines', async () => {
    // 1669 dispatches. These are the people who arrive. On an island where a
    // wrong turn costs twenty minutes, naming the station is the whole point.
    const net = server({ 'GET /shield': shield() });
    try {
      const ui = await mountScreen(h(SafetyScreen, props()));
      const said = ui.text();
      assert.match(said, /Koh Sichang Hospital emergency room/);
      assert.match(said, /088-7504872/, 'printed the way it is dialled locally');
      assert.match(said, /Koh Sichang Police Station/);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('with an alert live, the nearest station comes first', async () => {
    // The alert fixture is at Tha Lang pier. The hospital has an official map
    // coordinate; the police contact page publishes only its street address,
    // so the UI must not fabricate a police-station distance.
    const net = server({ 'GET /shield': shield() });
    try {
      const ui = await mountScreen(h(SafetyScreen, props({ alert })));
      const said = ui.text();
      const hospital = said.indexOf('Koh Sichang Hospital emergency room');
      const police = said.indexOf('Koh Sichang Police Station');
      assert.ok(hospital > -1 && police > -1, 'both responders are listed');
      assert.ok(hospital < police, 'the responder with a verified coordinate is ordered first');
      assert.match(said, /0\.[1-9] km away/, 'and it says the measured hospital distance');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('with no alert it shows no distances rather than made-up ones', async () => {
    // No alert means no position. An app that prints a distance it cannot
    // know is worse here than one that prints none.
    const net = server({ 'GET /shield': shield() });
    try {
      const ui = await mountScreen(h(SafetyScreen, props()));
      assert.doesNotMatch(ui.text(), /km away/, 'no distance without a position');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('every number on screen can be dialled', async () => {
    // A directory that reads well and does not dial is a poster.
    const net = server({ 'GET /shield': shield() });
    try {
      const ui = await mountScreen(h(SafetyScreen, props()));
      const said = ui.labels().join(' | ');
      for (const n of ['1669', '191', '1155', '088-7504872', '0 3821 6218']) {
        assert.match(said, new RegExp(n.replace(/-/g, '\-')), `${n} has no dial control`);
      }
      ui.unmount();
    } finally { net.restore(); }
  });

  test('the directory says when it was last checked', async () => {
    // Numbers change. A directory with no date is a directory nobody can tell
    // is stale - the same reason every photo carries its licence and date.
    const net = server({ 'GET /shield': shield() });
    try {
      assert.match((await mountScreen(h(SafetyScreen, props()))).text(), /checked \d{4}-\d{2}-\d{2}/);
    } finally { net.restore(); }
  });

  test('the shield list failing leaves the official numbers standing', async () => {
    // Our own service list is a fetch. The national lines are not, and must not
    // disappear with it - that is the failure mode the whole design guards.
    const net = server({ 'GET /shield': offline() });
    try {
      const said = (await mountScreen(h(SafetyScreen, props()))).text();
      assert.match(said, /1669/);
      assert.match(said, /Koh Sichang Hospital/);
    } finally { net.restore(); }
  });
});

/**
 * The five seconds between the hold and the dispatch.
 *
 * Time is mocked rather than waited out: a 5000 ms countdown is five seconds
 * per test, and five seconds of real waiting is how a
 * suite stops being run. Timers are enabled only AFTER the screen has mounted
 * and settled, so the mount's own fetch is not caught by the mock and left
 * hanging on a clock nobody is ticking.
 */
describe('the SOS demo countdown', () => {
  const alertOf = () => null;
  const shieldRoute = () => ({ 'GET /shield': shield() });
  const SOS = /^SOS\./;

  /** Push the clock forward and let React see what changed. */
  const advance = async (ms: number) => {
    await act(async () => { mock.timers.tick(ms); });
    await act(async () => {});
  };

  const start = async (over: Record<string, unknown> = {}) => {
    const fired: (undefined | { lat: number; lng: number })[] = [];
    const ui = await mountScreen(h(SafetyScreen, {
      alert: alertOf(), onCancel: noop, onShare: noop, firing: false,
      onFire: (pos?: { lat: number; lng: number }) => { fired.push(pos); },
      ...over,
    }));
    mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    return { ui, fired };
  };

  test('a tap opens a five-second cancellation window without sending', async () => {
    const net = server(shieldRoute());
    try {
      const { ui, fired } = await start();
      await ui.press(SOS);
      assert.deepEqual(fired, [], 'nothing was sent at the end of the hold');
      assert.match(ui.text(), /5/, 'and the way back is on screen');
      ui.unmount();
    } finally { mock.timers.reset(); net.restore(); }
  });

  test('it counts down out loud, second by second', async () => {
    const net = server(shieldRoute());
    try {
      const { ui } = await start();
      await ui.press(SOS);
      await advance(1000);
      assert.match(ui.text(), /4/);
      await advance(2000);
      assert.match(ui.text(), /2/);
      ui.unmount();
    } finally { mock.timers.reset(); net.restore(); }
  });

  test('Stop takes it back, and nothing is sent', async () => {
    const net = server(shieldRoute());
    try {
      const { ui, fired } = await start();
      await ui.press(SOS);
      await ui.pressText(/Cancel simulation/);
      await advance(motion.sosCountdownMs * 2);
      assert.deepEqual(fired, [], 'Stop means stop, even after the clock runs out');
      assert.doesNotMatch(ui.text(), /Start SOS\?/);
      ui.unmount();
    } finally { mock.timers.reset(); net.restore(); }
  });

  test('finishing the countdown shows a simulation and never dispatches', async () => {
    const net = server(shieldRoute());
    try {
      const { ui, fired } = await start();
      await ui.press(SOS);
      for (let second = 0; second < 5; second += 1) await advance(1000);
      assert.deepEqual(fired, [], 'the demo must never send a real alert');
      assert.match(ui.text(), /Simulation complete/);
      ui.unmount();
    } finally { mock.timers.reset(); net.restore(); }
  });

  test('leaving the screen mid-countdown does nothing later', async () => {
    const net = server(shieldRoute());
    try {
      const { ui, fired } = await start();
      await ui.press(SOS);
      ui.unmount();
      await advance(motion.sosCountdownMs * 2);
      assert.deepEqual(fired, []);
    } finally { mock.timers.reset(); net.restore(); }
  });
});

describe('the trip day, planned by the server', () => {
  const trip = { dayNumber: 2, dateLabel: 'Mon 31 Aug', walkingKm: 0, pointsToday: 0, airLabel: '', items: [] };
  const props = (over = {}) => ({ trip, onBack: noop, ...over });

  const plan = (over = {}) => ({
    energy: 'moderate',
    walkingKm: 4.4,
    totalKm: 36.1,
    fareTHB: 82,
    pointsAvailable: 550,
    dropped: [],
    items: [
      {
        time: '06:30', minutes: 75, kind: 'place',
        name: { en: 'Na Muang Waterfall', th: 'น้ำตกหน้าเมือง' }, tag: 'Green',
        placeId: 'namuang', questId: null, isPointsRelated: false,
        why: { en: 'Scores 89 today — air excellent', th: 'วันนี้ได้ 89 คะแนน' },
      },
      {
        time: '07:45', minutes: 24, kind: 'transit',
        name: { en: 'Songthaew', th: 'สองแถว' }, tag: 'Transit',
        placeId: null, questId: null, isPointsRelated: false, mode: 'songthaew', km: 6,
        waitMinutes: 8, fareTHB: 68,
        why: { en: '6 km on the ring road — cheapest, stops on request', th: '6 กม. ทางถนนรอบเกาะ' },
      },
      {
        time: '08:09', minutes: 45, kind: 'quest',
        name: { en: 'Beach Cleanup', th: 'เก็บขยะชายหาด' }, tag: 'Quest',
        placeId: null, questId: 'q1', isPointsRelated: true,
        why: { en: '150 Green Points, and you are already here', th: 'ได้ 150 แต้มกรีน' },
      },
    ],
    ...over,
  });

  test('the planned day arrives and every stop is on it', async () => {
    const net = server({ 'POST /trip/plan': plan() });
    try {
      const ui = await mountScreen(h(TripScreen, props()));
      const said = ui.text();
      assert.match(said, /06:30/);
      assert.match(said, /Na Muang Waterfall/);
      assert.match(said, /Beach Cleanup/);
      assert.match(said, /4\.4 km/, 'walking is shown to one decimal');
      assert.match(said, /\+550/, 'the points the day puts on offer');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('every row says why it is there', async () => {
    // The reason is the feature. A row without one is a row nobody can argue
    // with, which is the failure mode this screen exists to avoid.
    const net = server({ 'POST /trip/plan': plan() });
    try {
      const ui = await mountScreen(h(TripScreen, props()));
      const said = ui.text();
      assert.match(said, /Scores 89 today/);
      assert.match(said, /cheapest, stops on request/);
      assert.match(said, /already here/);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('a ride shows moving, waiting and fare as three separate facts', async () => {
    // Folding the wait into the ride is the lie that makes a plan wrong.
    const net = server({ 'POST /trip/plan': plan() });
    try {
      const ui = await mountScreen(h(TripScreen, props()));
      const said = ui.text();
      assert.match(said, /Songthaew · 6 km/);
      assert.match(said, /16 min moving/, '24 total minus 8 waiting');
      assert.match(said, /8 min wait/);
      assert.match(said, /฿68/);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('the day totals what it costs to get around', async () => {
    const net = server({ 'POST /trip/plan': plan() });
    try {
      const ui = await mountScreen(h(TripScreen, props()));
      assert.match(ui.text(), /FARES/i);
      assert.match(ui.text(), /฿82/);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('asking for a gentle day replans, and says so to the server', async () => {
    const net = server({ 'POST /trip/plan': (body) => plan({ energy: (body as { energy?: string }).energy ?? 'moderate' }) });
    try {
      const ui = await mountScreen(h(TripScreen, props()));
      // The screen also fetches prices on mount, so count only the plans.
      const plans = () => net.calls.filter((c) => c.path === '/trip/plan');
      assert.equal(plans().length, 1);

      await ui.press('Gentle day');
      await settle();

      assert.equal(plans().length, 2, 'changing the energy must replan');
      // The area rides along: a day is planned in one area (docs/43). Which
      // area is not what this test is about, so it reads the default rather
      // than naming one - it broke when the default moved to Koh Sichang.
      assert.deepEqual(plans()[1]!.body, { energy: 'gentle', area: DEFAULT_AREA });
      ui.unmount();
    } finally { net.restore(); }
  });

  test('what the planner left out is on screen, with the reason', async () => {
    // A day that silently omits a place is indistinguishable from a day that
    // never knew about it.
    const net = server({
      'POST /trip/plan': plan({
        dropped: [{
          name: { en: 'Chaweng Beach', th: 'หาดเฉวง' },
          reason: { en: 'Air is 140 AQI — unhealthy at any hour', th: 'อากาศ 140 AQI ไม่ดีต่อสุขภาพ' },
        }],
      }),
    });
    try {
      const ui = await mountScreen(h(TripScreen, props()));
      const said = ui.text();
      assert.match(said, /Chaweng Beach/);
      assert.match(said, /140 AQI/);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('a plan that will not load offers a retry, not a blank day', async () => {
    const net = server({ 'POST /trip/plan': offline() });
    try {
      const ui = await mountScreen(h(TripScreen, props()));
      assert.match(ui.text(), /offline/i);
      assert.ok(ui.find(/retry/i));
      ui.unmount();
    } finally { net.restore(); }
  });

  test('going back is one press, and reaches the caller', async () => {
    let back = 0;
    const net = server({ 'POST /trip/plan': plan() });
    try {
      const ui = await mountScreen(h(TripScreen, props({ onBack: () => { back += 1; } })));
      await ui.press(/back/i);
      assert.equal(back, 1);
      ui.unmount();
    } finally { net.restore(); }
  });
});

describe('onboarding, three steps and out', () => {
  test('it starts on step one and does not skip ahead', async () => {
    const ui = await mountScreen(h(OnboardingScreen, { onFinish: noop }));
    const said = ui.text();
    assert.match(said, /Step 1 of 3/);
    assert.match(said, /Wellness & spa/, 'the first question is about purpose');
    assert.doesNotMatch(said, /Gentle/, 'step two is not on screen yet');
    ui.unmount();
  });

  /**
   * THE FIRST LINE OF THE APP NAMES THE PILOT, AND THE PILOT MOVES.
   *
   * Under the wordmark it read "Koh Samui" for months after the pilot had
   * moved to Koh Sichang, so the first words anyone read on opening the app
   * named an island the app was no longer about - including anyone being shown
   * it for the first time, which is the one audience that cannot tell the
   * difference between a stale label and a confused product.
   *
   * The assertion reads DEFAULT_AREA rather than naming an island, so moving
   * the pilot again moves this test with the screen instead of reddening it.
   */
  test('the line under the wordmark names the area the app opens on', async () => {
    const ui = await mountScreen(h(OnboardingScreen, { onFinish: noop }));
    const said = ui.text();
    const opensOn = areaByKey(DEFAULT_AREA).name.en;
    assert.match(said, new RegExp(opensOn), `the way in does not name ${opensOn}`);
    if (DEFAULT_AREA !== 'samui') {
      assert.doesNotMatch(said, /Koh Samui/, 'the first pilot is still named on the way in');
    }
    ui.unmount();
  });

  test('walking all three steps hands back exactly what was picked', async () => {
    let answers: unknown = null;
    const ui = await mountScreen(h(OnboardingScreen, {
      onFinish: (a: unknown) => { answers = a; },
    }));

    await ui.press(/^Nature & green space/);
    await ui.press(/^Volunteering/);
    await ui.pressText('Continue');

    assert.match(ui.text(), /Step 2 of 3/);
    await ui.press(/^Moderate/);
    await ui.pressText('Continue');

    assert.match(ui.text(), /Step 3 of 3/);
    await ui.press(/^Air quality alerts/);
    await ui.pressText('Enter ChivarGo');

    assert.deepEqual(answers, {
      purposes: ['nature', 'volunteering'],
      activity: 'moderate',
      watch: ['air'],
    });
    ui.unmount();
  });

  test('activity level is single-select, because two answers make the weighting meaningless', async () => {
    let answers: { activity: string | null } | null = null;
    const ui = await mountScreen(h(OnboardingScreen, {
      onFinish: (a: { activity: string | null }) => { answers = a; },
    }));

    await ui.pressText('Continue');
    await ui.press(/^Gentle/);
    await ui.press(/^Full days/);
    await ui.pressText('Continue');
    await ui.pressText('Enter ChivarGo');

    assert.equal(answers!.activity, 'full', 'the second pick replaces the first, never adds');
    ui.unmount();
  });

  test('a purpose picked twice is unpicked, not counted twice', async () => {
    let answers: { purposes: string[] } | null = null;
    const ui = await mountScreen(h(OnboardingScreen, {
      onFinish: (a: { purposes: string[] }) => { answers = a; },
    }));

    await ui.press(/^Quiet, away from crowds/);
    await ui.press(/^Quiet, away from crowds/);
    await ui.pressText('Continue');
    await ui.pressText('Continue');
    await ui.pressText('Enter ChivarGo');

    assert.deepEqual(answers!.purposes, []);
    ui.unmount();
  });

  test('skipping answers nothing rather than answering wrongly', async () => {
    // A default of "wellness, moderate, everything" would be a fabricated
    // profile, and the Healthy Score is weighted from these.
    let answers: unknown = null;
    const ui = await mountScreen(h(OnboardingScreen, {
      onFinish: (a: unknown) => { answers = a; },
    }));

    await ui.pressText(/Skip/);
    assert.deepEqual(answers, { purposes: [], activity: null, watch: [] });
    ui.unmount();
  });

  test('the PDPA notice is on screen before the answers are submitted', async () => {
    // It sits on the last step, which is the last moment before onFinish
    // fires and anything is stored. Nothing leaves the screen before then.
    const ui = await mountScreen(h(OnboardingScreen, { onFinish: noop }));
    assert.doesNotMatch(ui.text(), /stored to personalise/, 'not needed on step one');

    await ui.pressText('Continue');
    await ui.pressText('Continue');

    const said = ui.text();
    assert.match(said, /Step 3 of 3/);
    assert.match(said, /Location and health preferences are stored to personalise/);
    assert.match(said, /change or delete them any time/, 'and it must say the right to erasure');
    ui.unmount();
  });
});

describe('Chiva Balance and the mood check-in', () => {
  const impactProps = { onToast: noop, refreshKey: 0 };
  const stats = [{ key: 'waste', label: { en: 'Waste collected', th: 'ขยะ' }, value: 12, unit: 'kg' }];
  const community = { year: 2026, metrics: [] };

  const balance = (over = {}) => ({
    total: 74,
    days: 3,
    note: null,
    components: [
      { key: 'rest', label: { en: 'How you have felt', th: 'ความรู้สึกของคุณ' }, display: '2 check-ins', subScore: 75, weight: 0.3, source: 'self-reported' },
      { key: 'movement', label: { en: 'Movement', th: 'การเคลื่อนไหว' }, display: '5.6 km a day', subScore: 96, weight: 0.2, source: 'measured' },
      { key: 'air', label: { en: 'Air you have breathed', th: 'อากาศ' }, display: '31 AQI average', subScore: 88, weight: 0.15, source: 'measured' },
    ],
    ...over,
  });

  const routes = (b: unknown) => ({
    'GET /impact/me': stats,
    'GET /impact/trees': { pending: 0, planted: 0, lines: [] },
    'GET /impact/community': community,
    'GET /wellness/balance': b,
  });

  test('every component says whether it was measured or self-reported', async () => {
    // Four of five come from what happened and one from what somebody said.
    // Hiding which is which is how a wellbeing number stops being trustworthy.
    const net = server(routes(balance()));
    try {
      const ui = await mountScreen(h(ImpactScreen, impactProps));
      const said = ui.text();
      assert.match(said, /74/, 'the balance figure');
      assert.match(said, /MEASURED/);
      assert.match(said, /YOU TOLD US/);
      assert.match(said, /5\.6 km a day/, 'the raw value, not just the sub-score');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('a trip too short to judge shows the reason, never a zero', async () => {
    const net = server(routes(balance({
      total: null,
      components: [],
      note: { en: 'Not enough of the trip yet — 1 of 3 places visited', th: 'ข้อมูลยังไม่พอ' },
    })));
    try {
      const ui = await mountScreen(h(ImpactScreen, impactProps));
      const said = ui.text();
      assert.match(said, /Not enough of the trip yet/);
      assert.doesNotMatch(said, /Chiva Balance · สมดุลชีวา\s*0\b/, 'a zero would be a lie');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('checking in a mood sends the key and replans nothing on its own', async () => {
    let toasted = '';
    const net = server({
      ...routes(balance()),
      'POST /wellness/mood': { at: '2026-09-01T02:00:00.000Z', mood: 'drained', note: null },
    });
    try {
      const ui = await mountScreen(h(ImpactScreen, {
        ...impactProps, onToast: (m: string) => { toasted = m; },
      }));

      await ui.press('I feel Drained');
      await settle();

      const posted = net.calls.find((c) => c.path === '/wellness/mood');
      assert.ok(posted, 'the mood must reach the server');
      assert.deepEqual(posted.body, { mood: 'drained', note: null });
      assert.match(toasted, /short, quiet day/i, 'it should say what the day will become');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('it never presents itself as health advice', async () => {
    // This is a travel app reading a mood as a preference. The disclaimer is
    // not decoration; it is the line that keeps the feature honest.
    const net = server(routes(balance()));
    try {
      const ui = await mountScreen(h(ImpactScreen, impactProps));
      assert.match(ui.text(), /not health advice/i);
      ui.unmount();

      __setLocaleForTests('th');
      const thai = await mountScreen(h(ImpactScreen, impactProps));
      assert.match(thai.text(), /ไม่ใช่คำแนะนำทางการแพทย์/);
      thai.unmount();
      __setLocaleForTests('en');
    } finally { net.restore(); }
  });

  test('a failed balance does not take the impact figures with it', async () => {
    const net = server({
      'GET /impact/me': stats,
      'GET /impact/trees': { pending: 0, planted: 0, lines: [] },
      'GET /impact/community': community,
      'GET /wellness/balance': offline(),
    });
    try {
      const ui = await mountScreen(h(ImpactScreen, impactProps));
      assert.match(ui.text(), /12 kg/, 'the impact half is fine');
      assert.match(ui.text(), /offline/i, 'and the balance half says why it is not');
      ui.unmount();
    } finally { net.restore(); }
  });
});

describe('the price outlook on the trip screen', () => {
  const trip = { dayNumber: 2, dateLabel: 'Tue 1 Sept', walkingKm: 0, pointsToday: 0, airLabel: '', items: [] };
  const emptyPlan = {
    energy: 'moderate', walkingKm: 0, totalKm: 0, fareTHB: 0,
    pointsAvailable: 0, dropped: [], items: [],
  };

  test('it shows a band, never a single price', async () => {
    // People budget against this. A single number reads as a quote and we
    // have nothing to quote from.
    const net = server({ 'POST /trip/plan': emptyPlan, ...priceRoutes });
    try {
      const ui = await mountScreen(h(TripScreen, { trip, onBack: noop }));
      const said = ui.text();
      assert.match(said, /฿2,900–4,200/, 'the band, low to high');
      assert.doesNotMatch(said, /฿3,550\b(?!–)/, 'the typical price must not stand alone');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('it shows how sure it is, and what it cannot see', async () => {
    const net = server({ 'POST /trip/plan': emptyPlan, ...priceRoutes });
    try {
      const ui = await mountScreen(h(TripScreen, { trip, onBack: noop }));
      const said = ui.text();
      assert.match(said, /ROUGH/, 'the confidence must be on screen');
      assert.match(said, /not a quote/i);
      assert.match(said, /no partner inventory yet/i);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('it names what moved the price, with the size of each effect', async () => {
    const net = server({ 'POST /trip/plan': emptyPlan, ...priceRoutes });
    try {
      const ui = await mountScreen(h(TripScreen, { trip, onBack: noop }));
      const said = ui.text();
      assert.match(said, /Peak season \+50%/);
      assert.match(said, /New Year \+70%/);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('the cheapest month is marked, and festival months are flagged', async () => {
    const net = server({ 'POST /trip/plan': emptyPlan, ...priceRoutes });
    try {
      const ui = await mountScreen(h(TripScreen, { trip, onBack: noop }));
      const said = ui.text();
      assert.match(said, /2026-11/);
      assert.match(said, /festival/i, 'nobody should book into one unknowingly');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('a failed price fetch does not take the day plan with it', async () => {
    const net = server({ 'POST /trip/plan': emptyPlan, 'POST /prices': offline() });
    try {
      const ui = await mountScreen(h(TripScreen, { trip, onBack: noop }));
      assert.match(ui.text(), /Gentle/, 'the planner half is still there');
      assert.doesNotMatch(ui.text(), /A night on Samui/, 'and the price half is simply absent');
      ui.unmount();
    } finally { net.restore(); }
  });
});

describe('the place hero, with and without a photograph', () => {

  test('a photograph carries its credit and licence on the image', async () => {
    // Most licences require attribution to appear WITH the work. A credit
    // buried in a settings screen is a licence violation waiting to be found.
    const ui = await mountScreen(h(Hero, {
      place: place({
        photo: {
          url: 'https://images.example/chaweng.jpg',
          credit: 'Somchai P.',
          licence: 'CC BY-SA 4.0',
          sourceUrl: 'https://commons.example/chaweng',
        },
      }),
    }));
    const said = ui.text();
    assert.match(said, /Somchai P\./);
    assert.match(said, /CC BY-SA 4\.0/);
    assert.ok(ui.find(/photographed by Somchai P\./), 'the screen reader gets the credit too');
    ui.unmount();
  });

  test('with no photograph it says so, rather than looking like a failed load', async () => {
    // The grey rectangle this replaces was the loudest "prototype" signal in
    // the app. A placeholder that admits what it is beats one that does not.
    const ui = await mountScreen(h(Hero, { place: place({ photo: null }) }));
    assert.match(ui.text(), /no photograph yet/i);
    ui.unmount();
  });

  test('the placeholder never claims to be a picture of the place', async () => {
    const ui = await mountScreen(h(Hero, { place: place({ photo: null }) }));
    const labels = ui.labels().join(' ');
    assert.doesNotMatch(labels, /photographed by/i, 'a drawing must not be credited as a photo');
    ui.unmount();
  });
});

describe('the companion collection on the wallet', () => {
  const walletProps = {
    onOpenMarket: noop, refreshKey: 0, notifications: [], unread: 0,
    onMarkRead: noop, onMarkAllRead: noop, onOpenQuest: noop,
  };

  const species = (over = {}) => ({
    key: 'green-turtle', layer: 'Safe',
    name: { en: 'Green sea turtle', th: 'เต่าตนุ' },
    scientific: 'Chelonia mydas',
    eggName: { en: 'Beach egg', th: 'ไข่จากหาดทราย' },
    habitat: { en: 'Sand beaches', th: 'หาดทราย' },
    fact: {
      en: 'Returns to the beach it hatched on to nest, decades later.',
      th: 'กลับมาวางไข่ที่หาดเดิมที่ตัวเองฟักออกมา',
    },
    status: 'EN', ...over,
  });

  const routes = (companions: unknown[], summary = { found: 1, total: 5, grown: 0 }) => ({
    'GET /wallet': wallet(),
    'GET /companions': { companions, summary, speciesAsOf: '2026-09-01' },
  });

  test('an egg keeps the species hidden — that is what an egg is for', async () => {
    const net = server(routes([{
      species: species(), stage: 'egg',
      evidence: { layer: 'Safe', visitDays: 1, questsVerified: 0 },
      nextStep: { en: 'Check in at 1 more Safe place to hatch this egg', th: 'เช็กอินอีก 1 แห่ง' },
    }]));
    try {
      const ui = await mountScreen(h(WalletScreen, walletProps));
      const said = ui.text();
      assert.match(said, /Beach egg/, 'an egg is named for its habitat, not a filter chip');
      assert.doesNotMatch(said, /Green sea turtle/, 'an egg must not name what is inside it');
      assert.doesNotMatch(said, /Chelonia mydas/);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('a hatched companion teaches something true about a real animal', async () => {
    const net = server(routes([{
      species: species(), stage: 'hatchling',
      evidence: { layer: 'Safe', visitDays: 2, questsVerified: 0 },
      nextStep: { en: 'Have a host verify one Safe quest', th: 'ให้ผู้จัดยืนยันหนึ่งครั้ง' },
    }]));
    try {
      const ui = await mountScreen(h(WalletScreen, walletProps));
      const said = ui.text();
      assert.match(said, /Green sea turtle/);
      assert.match(said, /Chelonia mydas/, 'the binomial, so it is checkable');
      assert.match(said, /IUCN EN/);
      assert.match(said, /Returns to the beach it hatched on/);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('every unfinished companion says what would move it on', async () => {
    // A locked slot with no stated lever is the shape of a slot machine.
    const net = server(routes([{
      species: species(), stage: 'egg',
      evidence: { layer: 'Safe', visitDays: 1, questsVerified: 0 },
      nextStep: { en: 'Check in at 1 more Safe place to hatch this egg', th: 'เช็กอินอีก 1 แห่ง' },
    }]));
    try {
      const ui = await mountScreen(h(WalletScreen, walletProps));
      assert.match(ui.text(), /Check in at 1 more Safe place/);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('an empty collection invites the first check-in, not five locked slots', async () => {
    const net = server(routes([], { found: 0, total: 5, grown: 0 }));
    try {
      const ui = await mountScreen(h(WalletScreen, walletProps));
      const said = ui.text();
      // The wallet used to carry its own copy of this line, which said "on
      // the island". There are two areas now and one of them is a campus in
      // Chonburi, so the shared line does not name a geography.
      assert.match(said, /Check in anywhere to find your first egg/);
      assert.match(said, /0\/5/);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('the species data carries the date it was recorded', async () => {
    // Conservation status ages. This app does not make claims it cannot date.
    const net = server(routes([]));
    try {
      const ui = await mountScreen(h(WalletScreen, walletProps));
      assert.match(ui.text(), /recorded 2026-09-01/);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('a failed companion fetch does not take the wallet with it', async () => {
    const net = server({ 'GET /wallet': wallet(), 'GET /companions': offline() });
    try {
      const ui = await mountScreen(h(WalletScreen, walletProps));
      assert.match(ui.text(), /1,240/, 'the balance is still there');
      assert.doesNotMatch(ui.text(), /Companions ·/, 'and the collection is simply absent');
      ui.unmount();
    } finally { net.restore(); }
  });
});

describe('the concierge screen, which shows only server-backed answers', () => {
  // The concierge suggests places in the CURRENT area, and the fixture is on
  // Samui, so the area is said out loud here rather than inherited from
  // DEFAULT_AREA - which is Koh Sichang, where this place is not.
  beforeEach(() => { __setAreaForTests('samui'); __setLocaleForTests('en'); });

  const props = (over = {}) => ({ onOpenMap: noop, onOpenPlace: noop, onAction: noop, ...over });
  const chat = (over: Record<string, unknown> = {}) => ({
    conversationId: 'conversation-1',
    reply: {
      intent: 'recommend', lang: 'en', text: 'Chaweng is the quietest verified option in this set.',
      suggestions: [{
        placeId: 'chaweng', name: { en: 'Chaweng Beach', th: 'หาดเฉวง' },
        because: { en: 'Estimated crowd · 2 check-ins in the last hour', th: 'ค่าประเมิน' },
        healthyScore: 82, photoUrl: null, distanceKm: 1.2,
        crowd: { checkinsLastHour: 2, estimateLabel: { en: 'Low', th: 'น้อย' }, provenance: 'live-checkins-plus-estimate' },
      }],
      dial: [], action: null,
    },
    source: 'groq', model: 'openai/gpt-oss-120b',
    analysis: {
      intent: 'CROWD', confidence: 0.94, language: 'en',
      entities: { category: null, placeName: null, time: null, budgetBaht: null, travelMode: null, quiet: true, indoor: false, nearMe: false, familyFriendly: false, showMore: false, closest: false },
      contextReference: 'none', requiredActions: ['get_crowd_information'], needsClarification: false, sentiment: 'neutral',
    },
    quickReplies: ['How do I get there?'], weather: null,
    evidence: [{ kind: 'crowd', label: 'Crowd information', source: 'ChivaGo check-ins + survey estimate', fetchedAt: '2026-11-16T08:00:00Z', validity: 'estimated' }],
    aiNotice: null, retryable: false, recommendations: null,
    ...over,
  });

  test('it opens with questions, not an empty box', async () => {
    // An empty chat makes the reader guess what it is for. They guess
    // something it cannot do, and then they stop typing.
    const net = server({ 'GET /places': [place()] });
    try {
      const ui = await mountScreen(h(ConciergeScreen, props()));
      const said = ui.text();
      assert.match(said, /Try asking/i);
      assert.match(said, /Somewhere quiet/i);
      ui.unmount();

      __setLocaleForTests('th');
      const thai = await mountScreen(h(ConciergeScreen, props()));
      assert.match(thai.text(), /ที่เงียบ/, 'the openers are offered in Thai when the app is');
      thai.unmount();
      __setLocaleForTests('en');
    } finally { net.restore(); }
  });

  test('restores chat history and requires confirmation before permanently clearing it', async () => {
    const net = server({
      'GET /places': [place()],
      'GET /concierge/history': {
        conversationId: 'saved-conversation',
        messages: [
          { role: 'user', content: 'Recommend a quiet beach', createdAt: '2026-11-16T08:00:00Z' },
          { role: 'assistant', content: 'Lamai Beach matches that request.', createdAt: '2026-11-16T08:00:01Z' },
        ],
      },
      'DELETE /concierge/history': { cleared: true, deletedConversations: 1 },
    });
    try {
      const ui = await mountScreen(h(ConciergeScreen, props()));
      assert.match(ui.text(), /Recommend a quiet beach/);
      assert.match(ui.text(), /Lamai Beach matches that request/);

      await ui.press(/Clear chat/i);
      assert.match(ui.text(), /Clear chat history/);
      assert.match(ui.text(), /permanently deleted/);
      assert.equal(net.calls.some((call) => call.method === 'DELETE'), false, 'opening the warning deleted history');

      await ui.press(/Cancel/i);
      assert.match(ui.text(), /Lamai Beach matches that request/);
      await ui.press(/Clear chat/i);
      await ui.press(/Confirm clear chat/i);
      await settle();

      assert.ok(net.calls.some((call) => call.method === 'DELETE' && call.path === '/concierge/history?area=samui'));
      assert.doesNotMatch(ui.text(), /Lamai Beach matches that request/);
      assert.match(ui.text(), /Try asking/i);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('asking in English answers in English, with a reason', async () => {
    const net = server({ 'GET /places': [place()], 'POST /concierge/chat': chat() });
    try {
      const ui = await mountScreen(h(ConciergeScreen, props()));
      await ui.pressText(/Somewhere quiet/);
      const said = ui.text();
      assert.match(said, /quietest verified option/i);
      assert.match(said, /Estimated crowd/, 'recommended with no measurement behind it');
      assert.doesNotMatch(said, /Healthy Score|\b82\b/, 'a health score leaked into a tourism recommendation');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('a place suggestion is a control, not a sentence about a place', async () => {
    const opened: string[] = [];
    const net = server({ 'GET /places': [place()], 'POST /concierge/chat': chat() });
    try {
      const ui = await mountScreen(h(ConciergeScreen, props({
        onOpenPlace: (id: string) => { opened.push(id); },
      })));
      await ui.pressText(/Somewhere quiet/);
      await ui.pressText(/Chaweng/);
      assert.deepEqual(opened, ['chaweng'], 'the suggestion did not open the place');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('shows thinking, then grounded Groq cards, distance, sources and contextual quick replies', async () => {
    let release!: (value: unknown) => void;
    const pending = new Promise((resolve) => { release = resolve; });
    const net = server({ 'GET /places': [place()], 'POST /concierge/chat': () => pending });
    try {
      const ui = await mountScreen(h(ConciergeScreen, props()));
      await ui.pressText(/Somewhere quiet/);
      assert.match(ui.text(), /checking ChivaGo data/i);

      release(chat());
      await settle();
      const said = ui.text();
      assert.match(said, /GROQ AI · CHIVAGO VERIFIED DATA/i);
      assert.match(said, /1\.2 km/);
      assert.match(said, /Crowd information\s*:\s*ChivaGo check-ins \+ survey estimate · estimated/);
      assert.match(said, /How do I get there/);
      assert.deepEqual(net.calls.find((call) => call.path === '/concierge/chat')?.body, {
        message: 'Somewhere quiet', area: 'samui', conversationId: null,
        location: { lat: 9.5357, lng: 100.0617, accuracyM: 12 },
      });
      ui.unmount();
    } finally { net.restore(); }
  });

  test('renders structured recommendation cards and hands map and navigation to existing screens', async () => {
    const mapped: string[] = [];
    const navigated: string[] = [];
    const net = server({
      'GET /places': [place()],
      'POST /concierge/chat': chat({
        recommendations: {
          title: { en: 'Places ranked for your location', th: 'สถานที่เรียงตามตำแหน่งของคุณ', zh: '按你的位置排序的地点' },
          hasMore: false,
          limitations: [],
          items: [{
            placeId: 'chaweng', name: { en: 'Chaweng Beach', th: 'หาดเฉวง', zh: '查汶海滩' },
            category: { en: 'Nature', th: 'ธรรมชาติ', zh: '自然' },
            description: { en: 'A real place description.', th: 'คำอธิบายสถานที่จริง', zh: '真实地点描述。' },
            image: null, coordinates: { lat: 9.53, lng: 100.06 }, distanceKm: 1.2,
            rating: { average: 4.5, reviewCount: 8 }, openingStatus: null,
            source: { name: 'ChivaGo database', fetchedAt: '2026-11-16T08:00:00Z', lastUpdatedAt: null },
            reason: { en: '1.2 km from the permitted location', th: 'ห่าง 1.2 กม.', zh: '距离 1.2 公里' },
            verificationStatus: 'partially-verified', score: 87, scoreBreakdown: [],
          }],
        },
      }),
    });
    try {
      const ui = await mountScreen(h(ConciergeScreen, props({
        onShowOnMap: (item: ScoredPlace) => { mapped.push(item.id); },
        onNavigatePlace: (item: ScoredPlace) => { navigated.push(item.id); },
      })));
      await ui.pressText(/Somewhere quiet/);
      await settle();
      assert.match(ui.text(), /Places ranked for your location/);
      assert.match(ui.text(), /A real place description/);
      assert.match(ui.text(), /4\.5\s*\(\s*8\s*\)/);
      assert.match(ui.text(), /ChivaGo database · partially-verified/);
      await ui.pressText(/^Map$/);
      await ui.pressText(/^Navigate$/);
      assert.deepEqual(mapped, ['chaweng']);
      assert.deepEqual(navigated, ['chaweng']);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('renders an ordered trip and opens every recommended marker together', async () => {
    const second = place({ id: 'lamai', name: { en: 'Lamai Beach', th: 'หาดละไม' }, lat: 9.47, lng: 100.04 });
    const mapped: string[][] = [];
    const item = (p: ScoredPlace, score: number) => ({
      placeId: p.id, name: p.name, category: { en: 'Nature', th: 'ธรรมชาติ', zh: '自然' },
      description: p.blurb, image: null, coordinates: { lat: p.lat, lng: p.lng }, distanceKm: null,
      rating: null, openingStatus: null,
      source: { name: 'ChivaGo database' as const, fetchedAt: '2026-11-16T08:00:00Z', lastUpdatedAt: null },
      reason: { en: 'Selected for variety', th: 'คัดเพื่อความหลากหลาย', zh: '多样性' },
      verificationStatus: 'partially-verified' as const, score, scoreBreakdown: [],
    });
    const net = server({
      'GET /places': [place(), second],
      'POST /concierge/chat': chat({
        recommendations: {
          title: { en: 'Recommended places', th: 'สถานที่แนะนำ', zh: '推荐地点' },
          hasMore: false, limitations: [], items: [item(place(), 88), item(second, 82)],
        },
        tripRecommendation: {
          title: { en: 'AI trip recommendation', th: 'ทริปแนะนำจาก AI', zh: 'AI 行程推荐' },
          durationLabel: { en: 'Half-day · 2 places', th: 'ครึ่งวัน · 2 สถานที่', zh: '半日 · 2 个地点' },
          stops: [
            { order: 1, placeId: 'chaweng', name: place().name, coordinates: { lat: place().lat, lng: place().lng } },
            { order: 2, placeId: 'lamai', name: second.name, coordinates: { lat: second.lat, lng: second.lng } },
          ],
          routeStatus: 'calculate-on-map',
          limitation: { en: 'ChivaGo Routing calculates the actual route on the map.', th: 'คำนวณเส้นทางจริงบนแผนที่', zh: '在地图计算实际路线。' },
        },
      }),
    });
    try {
      const ui = await mountScreen(h(ConciergeScreen, props({
        onShowRecommendationsOnMap: (items: ScoredPlace[]) => { mapped.push(items.map((entry) => entry.id)); },
      })));
      await ui.pressText(/Somewhere quiet/);
      await settle();
      assert.match(ui.text(), /AI trip recommendation/);
      assert.match(ui.text(), /1\s*Chaweng Beach/);
      assert.match(ui.text(), /2\s*Lamai Beach/);
      await ui.pressText(/View all stops on map/);
      assert.deepEqual(mapped, [['chaweng', 'lamai']]);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('shows no fabricated fallback and retries the same question against the server', async () => {
    let calls = 0;
    const net = server({
      'GET /places': [place()],
      'POST /concierge/chat': () => {
        calls += 1;
        return calls === 1 ? refuses('UPSTREAM', 'Groq unavailable') : chat();
      },
    });
    try {
      const ui = await mountScreen(h(ConciergeScreen, props()));
      await ui.pressText(/Somewhere quiet/);
      await settle();
      assert.match(ui.text(), /could not reach the server/i);
      assert.match(ui.text(), /No answer was generated/i);
      assert.doesNotMatch(ui.text(), /quietest verified option/i);
      await ui.pressText(/^Retry$/i);
      await settle();
      assert.equal(calls, 2);
      assert.match(ui.text(), /CHIVAGO VERIFIED DATA/i);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('the places fetch failing does not take the chat with it', async () => {
    // The concierge is pure; only its data comes over the network. Losing the
    // island should cost recommendations, not the whole screen.
    const net = server({ 'GET /places': offline() });
    try {
      const ui = await mountScreen(h(ConciergeScreen, props()));
      assert.match(ui.text(), /offline/i, 'the failure is stated');
      assert.match(ui.text(), /Try asking/i, 'and the chat is still usable');
      ui.unmount();
    } finally { net.restore(); }
  });
});

/**
 * The companion's room.
 *
 * Borrowed shape, different engine — so the tests that matter are the ones
 * that would catch it drifting back into a pet simulator.
 */
describe('a companion at home', () => {
  const grown = () => companionsFor([{ layer: 'Safe' as const, visitDays: 3, questsVerified: 1 }])[0]!;
  const egg = () => companionsFor([{ layer: 'Wellness' as const, visitDays: 1, questsVerified: 0 }])[0]!;
  const props = (over = {}) => ({
    companion: grown(), onBack: noop, onOpenPlace: noop, onFindQuest: noop, ...over,
  });

  test('the meters are the habitat measured, not a decay clock', async () => {
    // The whole reason this screen is not a pet simulator. Every bar has to be
    // a reading from somewhere real, and has to say where.
    const net = server({ 'GET /places': [place({ layer: 'Safe', metrics: { aqi: 42, crowdDensity: 3, safetyIndex: 7, walkability: 8 } })] });
    try {
      const ui = await mountScreen(h(CompanionHomeScreen, props()));
      const said = ui.text();
      assert.match(said, /42 AQI/, 'the air reading is not shown');
      assert.match(said, /per 100/, 'the crowding reading is not shown');
      assert.match(said, /Measured at/i, 'it does not say the numbers were measured');
      assert.doesNotMatch(said, /hungry|hunger|feed|sleepy|energy/i, 'a need meter crept in');
      ui.unmount();
    } finally { net.restore(); }
  });

  test('an egg keeps its species hidden here too', async () => {
    const net = server({ 'GET /places': [place({ layer: 'Wellness' })] });
    try {
      const ui = await mountScreen(h(CompanionHomeScreen, props({ companion: egg() })));
      const said = ui.text();
      assert.doesNotMatch(said, /junglefowl/i, 'the egg named the species inside it');
      assert.match(said, /egg/i);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('every unfinished companion says what would move it on', async () => {
    const net = server({ 'GET /places': [place({ layer: 'Wellness' })] });
    try {
      assert.match((await mountScreen(h(CompanionHomeScreen, props({ companion: egg() })))).text(), /Next/);
    } finally { net.restore(); }
  });

  test('the actions send you outside, not deeper into the app', async () => {
    // The reference has three buttons that all resolve on screen. A companion
    // here only moves because somebody went somewhere.
    const opened: string[] = [];
    let quests = 0;
    const net = server({ 'GET /places': [place({ id: 'chaweng', layer: 'Safe' })] });
    try {
      const ui = await mountScreen(h(CompanionHomeScreen, props({
        onOpenPlace: (id: string) => { opened.push(id); },
        onFindQuest: () => { quests += 1; },
      })));
      await ui.pressText(/Go there/);
      await ui.pressText(/Find a quest here/);
      assert.deepEqual(opened, ['chaweng']);
      assert.equal(quests, 1);
      ui.unmount();
    } finally { net.restore(); }
  });

  test('losing the places fetch costs the meters, not the screen', async () => {
    const net = server({ 'GET /places': offline() });
    try {
      const ui = await mountScreen(h(CompanionHomeScreen, props()));
      const said = ui.text();
      assert.match(said, /offline/i, 'the failure is stated');
      assert.match(said, /Green sea turtle/, 'and the companion is still there');
      ui.unmount();
    } finally { net.restore(); }
  });
});

describe('the passport, which shows a country it has not finished', () => {
  test('all 77 provinces are on screen, not just the open ones', async () => {
    // The failure this guards: quietly rendering the two we built and calling
    // it a passport. A traveller from Nong Khai finds out in one tap.
    const net = server({ 'GET /passport': { visited: [] } });
    try {
      const ui = await mountScreen(h(PassportScreen, {}));
      const said = ui.text();
      for (const p of ['Nong Khai', 'Mae Hong Son', 'Narathiwat', 'Bangkok', 'Surat Thani']) {
        assert.match(said, new RegExp(p), `${p} is missing from the passport`);
      }
      assert.match(said, /\/ 77/, 'the denominator is not the whole country');
      ui.unmount();

      // And by their own names, for a reader from there.
      __setLocaleForTests('th');
      const thai = (await mountScreen(h(PassportScreen, {}))).text();
      for (const p of ['หนองคาย', 'แม่ฮ่องสอน', 'นราธิวาส', 'กรุงเทพมหานคร', 'สุราษฎร์ธานี']) {
        assert.match(thai, new RegExp(p), `${p} is missing from the Thai passport`);
      }
      __setLocaleForTests('en');
    } finally { net.restore(); }
  });

  test('a visited province is counted, and the count is out of 77', async () => {
    const net = server({ 'GET /passport': { visited: ['TH-84'] } });
    try {
      const said = (await mountScreen(h(PassportScreen, {}))).text();
      assert.match(said, /1\s*\/ 77/);
    } finally { net.restore(); }
  });

  test('it says how many provinces are actually open', async () => {
    // Four. Saying so out loud is what stops the other 73 reading as broken.
    const net = server({ 'GET /passport': { visited: [] } });
    try {
      const said = (await mountScreen(h(PassportScreen, {}))).text();
      assert.match(said, /4 provinces are open/);
      assert.match(said, /not yet built/i);
      assert.match(said, /Air and crowd figures state their source/);
    } finally { net.restore(); }
  });

  test('every region is shown with its own count', async () => {
    const net = server({ 'GET /passport': { visited: ['TH-84'] } });
    try {
      const said = (await mountScreen(h(PassportScreen, {}))).text();
      for (const r of ['Northern', 'Northeastern', 'Central', 'Eastern', 'Western', 'Southern']) {
        assert.match(said, new RegExp(r));
      }
      assert.match(said, /1 \/ 14/, 'the southern count did not move for Surat Thani');
    } finally { net.restore(); }
  });

  test('a self-reported stamp is shown as one, and counts for nothing', async () => {
    // Recorded, not scored. Chiang Mai on the traveller's word appears in the
    // legend's own state and leaves the Northern count exactly where it was.
    const net = server({ 'GET /passport': { visited: ['TH-84'], selfReported: ['TH-50'] } });
    try {
      const ui = await mountScreen(h(PassportScreen, {}));
      const said = ui.text();
      assert.match(said, /Self-reported/, 'the legend must name the dashed state');
      assert.match(said, /0 \/ 9/, 'a self-reported province inflated the Northern count');
      assert.match(said, /1\s*\/ 77/, 'or the passport total');
    } finally { net.restore(); }
  });

  test('a province with evidence names the province’s own emblem, and its level', async () => {
    // Surat Thani, with a host-verified quest in the Safe habitat.
    //
    // This used to assert "Green sea turtle" - the habitat species - which
    // meant every Safe-layer province in the country printed the same animal
    // and two provinces looked identical. The passport now names the
    // province's emblem, which is one of seventy-seven. The turtle is still
    // real and still earned; it belongs to the habitat and is said in the
    // companion room.
    const net = server({
      'GET /passport': {
        visited: ['TH-84'],
        evidence: [{ code: 'TH-84', layer: 'Safe', visitDays: 3, questsVerified: 1 }],
      },
    });
    try {
      const said = (await mountScreen(h(PassportScreen, {}))).text();
      assert.match(said, /Ngo/, 'Surat Thani’s emblem is missing from its card');
      // 3 days + one verified quest, at three days each.
      assert.match(said, /Level 6/, 'the level is missing, or is not the evidence under it');
      assert.match(said, /Vouched for/, 'a host verified work here, and the summary should say so');
    } finally { net.restore(); }
  });

  test('a province nobody has surveyed names no animal at all', async () => {
    // The heart of it. Seventy-three sealed eggs, and not one invented species
    // among them — a collection game that would rather say "not known yet".
    const net = server({ 'GET /passport': { visited: [], evidence: [] } });
    try {
      const said = (await mountScreen(h(PassportScreen, {}))).text();
      // Every species name in the app. None may appear without evidence.
      for (const animal of ['Green sea turtle', 'Southern pig-tailed macaque', 'Water buffalo']) {
        assert.doesNotMatch(said, new RegExp(animal), `${animal} was claimed for a sealed province`);
      }
      assert.match(said, /73/, 'the sealed count is not shown');
    } finally { net.restore(); }
  });

  test('the collection is counted against 77, like the stamps', async () => {
    const net = server({
      'GET /passport': {
        visited: ['TH-84'],
        evidence: [{ code: 'TH-84', layer: 'Safe', visitDays: 1, questsVerified: 0 }],
      },
    });
    try {
      const said = (await mountScreen(h(PassportScreen, {}))).text();
      assert.match(said, /\/ 77/);
    } finally { net.restore(); }
  });

  test('a failed fetch costs the stamps, not the country', async () => {
    // The province list is local and pure. Only "where have I been" is remote,
    // so losing the network should leave a readable passport with none stamped.
    const net = server({ 'GET /passport': offline() });
    try {
      const said = (await mountScreen(h(PassportScreen, {}))).text();
      assert.match(said, /offline/i);
      assert.match(said, /Chiang Mai/, 'the country vanished with the request');
      assert.match(said, /0\s*\/ 77/);
    } finally { net.restore(); }
  });
});
