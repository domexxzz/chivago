/**
 * The bus strip on Home.
 *
 * What it must never do is read like a timetable. Nobody publishes one for
 * either campus, so every number on this card came from riders tapping a
 * button, and the sentence has to keep saying so - especially on the days the
 * number looks confident, because that is when a reader stops asking where it
 * came from.
 *
 * And the absence has to speak. A university with no published shuttle route
 * gets a line saying exactly that; a section that quietly is not there is a
 * question nobody knows to ask.
 */
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';

import { HomeScreen } from '../src/screens/HomeScreen.tsx';
import { MapScreen } from '../src/screens/MapScreen.tsx';
import { mountScreen, server } from './interact.ts';
import * as fx from './fixtures.ts';
import { __setAreaForTests } from '../src/state/area.ts';
import { __setLocaleForTests } from '../src/i18n/locale.ts';
import { control, resetControl } from './stubs/native.mjs';

const noop = () => {};
const props = {
  onOpenMap: noop, onOpenQuests: noop, onOpenQuest: noop, onOpenWallet: noop,
  onOpenPassport: noop, onOpenImpact: noop, onOpenConcierge: noop, onOpenSafety: noop,
  onOpenParty: noop, onOpenProfile: noop,
  now: new Date('2026-09-15T02:00:00Z'),
};

const campusPlace = () => fx.place({
  id: 'rmutt-park',
  name: { en: 'Rajamangala Park', th: 'สวนราชมงคล' },
  short: 'Park',
  layer: 'Green',
  province: 'TH-13',
  lat: 14.0333879,
  lng: 100.7251362,
});

/** The route as the server really answers it, headway and all. */
const route = (headway: {
  lastSeenMinAgo: number | null; typicalGapMin: number | null; reports: number; vehicles: number;
}) => ({
  id: 'smartbus-538',
  kind: 'public' as const,
  ref: '538 (1-24E)',
  name: { en: '538 (1-24E) RMUTT - Priest Hospital', th: '538 (1-24E) ม.เทคโนโลยีราชมงคลธัญบุรี - โรงพยาบาลสงฆ์' },
  operator: 'smart bus',
  colour: 'navy',
  source: 'OpenStreetMap relations 14144070 and 14144071, read 2026-09-15',
  schedule: 'unpublished' as const,
  stops: [
    { id: 'rmutt-gate3', name: { en: 'Rajamangala Gate 3 (Soi Phon)', th: 'ราชมงคล ประตู 3 (ซอยพร)' }, lat: 14.0356229, lng: 100.7320651, osm: 'node 11265006936' },
    { id: 'rmutt-south-east', name: null, lat: 14.0315712, lng: 100.7321438, osm: 'node 11534778327' },
  ],
  headway,
});

const routes = (headway = { lastSeenMinAgo: null, typicalGapMin: null, reports: 0, vehicles: 0 }) => ({
  '/places': [campusPlace()],
  '/quests?filter=today': { quests: [], progress: {} },
  '/wallet': { balances: { green: 0, trip: 0 }, progression: null, ledger: [] },
  '/passport': { visited: [] },
  '/companions': { companions: [], summary: { found: 0, total: 5, grown: 0 }, speciesAsOf: '2026-09-08' },
  '/areas/rmutt/transit': { routes: [route(headway)], campus: [] },
  '/areas/samui/transit': { routes: [], campus: [] },
});

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; resetControl(); __setAreaForTests('samui'); __setLocaleForTests('en'); });

describe('what runs to this campus', () => {
  test('the route, its number and who runs it', async () => {
    __setAreaForTests('rmutt');
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, { ...props }));
    const said = ui.text();
    assert.match(said, /538 \(1-24E\)/);
    assert.match(said, /smart bus/, 'a rider should know whose bus it is');
    assert.match(said, /Rajamangala Gate 3/);
    ui.unmount();
  });

  test('an unnamed stop says it is unnamed rather than being given a name', async () => {
    __setAreaForTests('rmutt');
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, { ...props }));
    assert.match(ui.text(), /Unnamed stop/);
    ui.unmount();
  });

  test('the university has published no shuttle, and the card says so', async () => {
    __setAreaForTests('rmutt');
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, { ...props }));
    assert.match(ui.text(), /has not published a shuttle route/);
    ui.unmount();
  });

  test('an area with no route draws nothing at all', async () => {
    // Samui has no seeded route. A card announcing that there is no bus on an
    // island nobody expected one on is noise, not honesty.
    __setAreaForTests('samui');
    const s = server({ ...routes(), '/places': [fx.place({ layer: 'Safe' })] }); restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, { ...props }));
    const said = ui.text();
    assert.doesNotMatch(said, /538/);
    assert.doesNotMatch(said, /Getting here/);
    ui.unmount();
  });
});

describe('when is the next one', () => {
  test('with no reports it asks for one instead of inventing a time', async () => {
    __setAreaForTests('rmutt');
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, { ...props }));
    assert.match(ui.text(), /Nobody has reported one today/);
    ui.unmount();
  });

  test('a headway is always said to be what riders saw, never a timetable', async () => {
    __setAreaForTests('rmutt');
    const s = server(routes({ lastSeenMinAgo: 8, typicalGapMin: 21, reports: 5, vehicles: 3 }));
    restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, { ...props }));
    const said = ui.text();
    assert.match(said, /every 21 min/);
    assert.match(said, /not a timetable/, 'an observation was allowed to read as a schedule');
    // And how thin the evidence is, beside what it claims.
    assert.match(said, /5 reports today/);
    assert.match(said, /3 vehicles/);
    ui.unmount();
  });


  test('the Thai sentence disclaims the timetable too, in its own words', async () => {
    // Half the readers at this campus will only ever see this half. A
    // disclaimer that exists only in English is not a disclaimer.
    __setAreaForTests('rmutt');
    __setLocaleForTests('th');
    const s = server(routes({ lastSeenMinAgo: 8, typicalGapMin: 21, reports: 5, vehicles: 3 }));
    restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, { ...props }));
    const said = ui.text();
    assert.match(said, /21 นาที/);
    assert.match(said, /ไม่ใช่ตารางเดินรถ/);
    assert.match(said, /เห็นรถ 3 คัน/);
    ui.unmount();
  });

  test('five reports of one bus never read as five buses', async () => {
    __setAreaForTests('rmutt');
    const s = server(routes({ lastSeenMinAgo: 1, typicalGapMin: null, reports: 5, vehicles: 1 }));
    restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, { ...props }));
    const said = ui.text();
    assert.match(said, /5 reports today/);
    assert.match(said, /5 reports today, 1 vehicle/);
    assert.doesNotMatch(said, /Reports today came about every/, 'one vehicle must not produce a frequency');
    ui.unmount();
  });
});

describe('reporting one', () => {
  const acknowledged = {
    recorded: true,
    because: null,
    headway: { lastSeenMinAgo: 0, typicalGapMin: null, reports: 1, vehicles: 1 },
  };

  test('a permitted location selects the nearest stop for the report', async () => {
    __setAreaForTests('rmutt');
    control.position = { coords: { latitude: 14.0315712, longitude: 100.7321438, accuracy: 12 } };
    const s = server({ ...routes(), 'POST /transit/smartbus-538/seen': acknowledged });
    restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, { ...props }));
    assert.match(ui.text(), /Nearest stop selected/);
    assert.equal(ui.find('Select stop: Unnamed stop')?.props.accessibilityState.checked, true);
    await ui.press('I saw one');
    assert.deepEqual(s.calls.find((c) => c.method === 'POST' && c.path === '/transit/smartbus-538/seen')?.body,
      { stopId: 'rmutt-south-east' });
    ui.unmount();
  });

  test('a rider can override the nearest stop before reporting', async () => {
    __setAreaForTests('rmutt');
    control.position = { coords: { latitude: 14.0315712, longitude: 100.7321438, accuracy: 12 } };
    const s = server({ ...routes(), 'POST /transit/smartbus-538/seen': acknowledged });
    restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, { ...props }));
    await ui.press('Select stop: Rajamangala Gate 3 (Soi Phon)');
    assert.equal(ui.find('Select stop: Rajamangala Gate 3 (Soi Phon)')?.props.accessibilityState.checked, true);
    await ui.press('I saw one');
    assert.deepEqual(s.calls.find((c) => c.method === 'POST' && c.path === '/transit/smartbus-538/seen')?.body,
      { stopId: 'rmutt-gate3' });
    ui.unmount();
  });

  test('without location permission a chosen stop cannot be reported', async () => {
    __setAreaForTests('rmutt');
    control.permission = { granted: false, status: 'denied' };
    const s = server({ ...routes(), 'POST /transit/smartbus-538/seen': acknowledged });
    restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, { ...props }));
    assert.match(ui.text(), /Reporting requires your location within 500 m/);
    assert.equal(ui.labels().includes('I saw one'), false, 'reporting must wait for a chosen stop');
    await ui.press('Select stop: Unnamed stop');
    assert.equal(ui.find('Select stop: Unnamed stop')?.props.accessibilityState.checked, true);
    assert.equal(ui.labels().includes('I saw one'), false);
    assert.equal(s.calls.some((c) => c.method === 'POST' && c.path === '/transit/smartbus-538/seen'), false);
    ui.unmount();
  });

  test('a far-away fix neither auto-selects nor permits a manually chosen report', async () => {
    __setAreaForTests('rmutt');
    control.position = { coords: { latitude: 14.2, longitude: 100.7321438, accuracy: 12 } };
    const s = server({ ...routes(), 'POST /transit/smartbus-538/seen': acknowledged });
    restore = s.restore;
    const ui = await mountScreen(h(HomeScreen, { ...props }));
    assert.doesNotMatch(ui.text(), /Nearest stop selected/);
    assert.equal(ui.find('Select stop: Unnamed stop')?.props.accessibilityState.checked, false);
    await ui.press('Select stop: Unnamed stop');
    assert.equal(ui.find('Select stop: Unnamed stop')?.props.accessibilityState.checked, true);
    assert.equal(ui.labels().includes('I saw one'), false);
    assert.equal(s.calls.some((c) => c.method === 'POST' && c.path === '/transit/smartbus-538/seen'), false);
    ui.unmount();
  });

  test('a fresh far-away fix blocks a report after a near stop was selected', async () => {
    __setAreaForTests('rmutt');
    control.position = { coords: { latitude: 14.0315712, longitude: 100.7321438, accuracy: 12 } };
    const s = server({ ...routes(), 'POST /transit/smartbus-538/seen': acknowledged });
    restore = s.restore;
    const said: string[] = [];
    const ui = await mountScreen(h(HomeScreen, { ...props, onToast: (m: string) => said.push(m) }));
    assert.equal(ui.labels().includes('I saw one'), true);
    control.position = { coords: { latitude: 14.2, longitude: 100.7321438, accuracy: 12 } };
    await ui.press('I saw one');
    assert.equal(s.calls.some((c) => c.method === 'POST' && c.path === '/transit/smartbus-538/seen'), false);
    assert.match(said[0] ?? '', /within 500 m/);
    ui.unmount();
  });

  test('the tap posts, and the card settles on what the server sent back', async () => {
    __setAreaForTests('rmutt');
    control.position = { coords: { latitude: 14.0315712, longitude: 100.7321438, accuracy: 12 } };
    const s = server({
      ...routes(),
      'POST /transit/smartbus-538/seen': {
        recorded: true,
        because: null,
        headway: { lastSeenMinAgo: 0, typicalGapMin: null, reports: 1, vehicles: 1 },
      },
    });
    restore = s.restore;
    const said: string[] = [];
    const ui = await mountScreen(h(HomeScreen, { ...props, onToast: (m: string) => said.push(m) }));
    await ui.press(/เห็นรถแล้ว|I saw one/);
    assert.match(ui.text(), /just now/);
    assert.deepEqual(said, ['Thanks - counted']);
    ui.unmount();
  });

  test('a second press is acknowledged, not shown as a failure', async () => {
    // `recorded: false` is the server saying "already counted". Painting that
    // red would teach a rider that pressing twice breaks something.
    __setAreaForTests('rmutt');
    control.position = { coords: { latitude: 14.0315712, longitude: 100.7321438, accuracy: 12 } };
    const s = server({
      ...routes(),
      'POST /transit/smartbus-538/seen': {
        recorded: false,
        because: 'already-reported',
        headway: { lastSeenMinAgo: 0, typicalGapMin: null, reports: 1, vehicles: 1 },
      },
    });
    restore = s.restore;
    const said: string[] = [];
    const ui = await mountScreen(h(HomeScreen, { ...props, onToast: (m: string) => said.push(m) }));
    await ui.press(/เห็นรถแล้ว|I saw one/);
    assert.deepEqual(said, ['Already counted just now']);
    ui.unmount();
  });
});

describe('the stops reach the map', () => {
  /*
    The Map tab asks for them ITSELF rather than being handed them by Home.

    Both tabs are reachable without passing through the other, so a map whose
    stops depended on which tab somebody opened first would lose them at
    random - the kind of bug that cannot be reproduced on request.
  */
  const mapProps = {
    layers: { Green: true, Wellness: true, Food: true, Safe: true, Quest: true },
    onToggleLayer: noop, onPlanDay: noop, onOpenPlace: noop, onOpenQuest: noop, onSeeAllQuests: noop,
    onAskConcierge: noop, onOpenWallet: noop,
    balances: { green: 0, trip: 0 },
  };

  test('the Map tab requests the transit for the area it is framing', async () => {
    __setAreaForTests('rmutt');
    const s = server({ ...routes(), '/explored': { places: [] }, '/areas/rmutt/stories': { open: true, stories: [] } });
    restore = s.restore;
    const ui = await mountScreen(h(MapScreen, mapProps));
    assert.ok(
      s.calls.some((c) => c.method === 'GET' && c.path.startsWith('/areas/rmutt/transit')),
      `the map never asked for the stops: ${s.calls.map((c) => c.path).join(', ')}`,
    );
    ui.unmount();
  });

  test('switching to the island asks for the island, not the campus', async () => {
    __setAreaForTests('samui');
    const s = server({ ...routes(), '/explored': { places: [] }, '/areas/samui/stories': { open: true, stories: [] } });
    restore = s.restore;
    const ui = await mountScreen(h(MapScreen, mapProps));
    assert.ok(s.calls.some((c) => c.path.startsWith('/areas/samui/transit')));
    assert.ok(!s.calls.some((c) => c.path.startsWith('/areas/rmutt/transit')));
    ui.unmount();
  });
});
