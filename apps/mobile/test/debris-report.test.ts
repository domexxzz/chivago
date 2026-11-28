/**
 * Reporting rubbish that washed up: the first step of the five on the Ko
 * Sichang proposal, as the traveller sees it. Photograph, three questions,
 * done - and then a case number, the people who saw it too, and no points.
 */
import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';

import { DEBRIS_REJECT_REASON, type DebrisReportView } from '@chivago/core';
import { DebrisReportScreen } from '../src/screens/DebrisReportScreen.tsx';
import { DebrisReportCard } from '../src/components/DebrisReportCard.tsx';
import { __resetServerConfig } from '../src/state/server-config.ts';
import { __setAreaForTests } from '../src/state/area.ts';
import { mountScreen, offline, server } from './interact.ts';
import { control, resetControl } from './stubs/native.mjs';

const THAM_PHANG = { coords: { latitude: 13.1454, longitude: 100.806835, accuracy: 8 }, mocked: false };
const photo = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'beach.jpg', { type: 'image/jpeg' });
const shot = () => ({ canceled: false, assets: [{ uri: 'file:///beach.jpg', mimeType: 'image/jpeg', file: photo() }] });

const view = (over: Partial<DebrisReportView> = {}): DebrisReportView => ({
  id: 'r1', submittedAt: '2026-11-23T03:26:00.000Z', takenAt: '2026-11-23T03:26:00.000Z',
  kinds: ['foam'], amount: 'strand', access: 'climb', verdict: 'opened', rejectReason: null,
  case: { number: 'KS-2611-0142', status: 'open', openedAt: '2026-11-23T03:26:00.000Z', reporters: 1, collection: null },
  ...over,
});

let restore: () => void = () => {};
let toasts: string[] = [];
const props = () => ({ onBack: () => {}, onToast: (m: string) => { toasts.push(m); } });

beforeEach(() => { resetControl(); toasts = []; __resetServerConfig(); });
afterEach(() => { restore(); restore = () => {}; });

/** Mount, photograph, and land on the three questions. */
async function atQuestions(routes: Record<string, unknown> = {}) {
  const s = server({ 'GET /debris-reports': { reports: [] }, ...routes });
  restore = s.restore;
  control.camera = shot();
  control.position = THAM_PHANG;
  const ui = await mountScreen(h(DebrisReportScreen, props()));
  await ui.press('Take the photo');
  return { ui, calls: s.calls };
}

async function answerAndSend(ui: Awaited<ReturnType<typeof atQuestions>>['ui']) {
  await ui.press('Foam');
  await ui.press('All along the tideline');
  await ui.press('Down steps or over rocks');
  await ui.press('Send report');
}

describe('before the photograph', () => {
  test('it says what to photograph, and that a report earns nothing', async () => {
    const s = server({ 'GET /debris-reports': { reports: [] } });
    restore = s.restore;
    const ui = await mountScreen(h(DebrisReportScreen, props()));
    assert.match(ui.text(), /camera down/i);
    assert.match(ui.text(), /no one in the frame/i);
    assert.match(ui.text(), /no points/i);
    ui.unmount();
  });

  test('your earlier reports are listed with where each one stands', async () => {
    const s = server({ 'GET /debris-reports': { reports: [
      view({ id: 'r2', case: { number: 'KS-2611-0150', status: 'assigned', openedAt: '2026-11-23T05:00:00.000Z', reporters: 2, collection: null } }),
      view({ id: 'r3', verdict: 'rejected', rejectReason: 'outside_area', case: null }),
    ] } });
    restore = s.restore;
    const ui = await mountScreen(h(DebrisReportScreen, props()));
    assert.match(ui.text(), /KS-2611-0150/);
    assert.match(ui.text(), /team assigned/i);
    assert.match(ui.text(), /sent back/i);
    ui.unmount();
  });

  test('a case the team closed says what came off the beach, and a part-collection names the case for the rest', async () => {
    const s = server({ 'GET /debris-reports': { reports: [
      view({ id: 'r4', case: { number: 'KS-2611-0142', status: 'closed', openedAt: '2026-11-23T03:26:00.000Z', reporters: 4,
        collection: { at: '2026-11-23T07:20:00.000Z', by: 'Prasert', weightKg: 6.4, outcome: 'all', followUpNumber: null } } }),
      view({ id: 'r5', case: { number: 'KS-2611-0150', status: 'closed', openedAt: '2026-11-23T05:00:00.000Z', reporters: 1,
        collection: { at: '2026-11-23T08:00:00.000Z', by: 'Prasert', weightKg: 2.1, outcome: 'partial', followUpNumber: 'KS-2611-0155' } } }),
    ] } });
    restore = s.restore;
    const ui = await mountScreen(h(DebrisReportScreen, props()));
    assert.match(ui.text(), /Collected · 6\.4 kg · by Prasert/);
    assert.match(ui.text(), /Part collected · 2\.1 kg · the rest is KS-2611-0155/);
    ui.unmount();
  });

  test('a phone that will not give its position cannot report, and is told why', async () => {
    const s = server({ 'GET /debris-reports': { reports: [] } });
    restore = s.restore;
    control.camera = shot();
    control.permission = { granted: false, status: 'denied' };
    const ui = await mountScreen(h(DebrisReportScreen, props()));
    await ui.press('Take the photo');
    assert.ok(toasts.some((m) => /location/i.test(m)), toasts.join(' | '));
    assert.equal(ui.find('Send report'), undefined);
    ui.unmount();
  });
});

describe('the three questions', () => {
  test('the photograph leads to them, with the position filled in and the third marked as the one that matters', async () => {
    const { ui } = await atQuestions();
    assert.match(ui.text(), /What did you see/);
    assert.match(ui.text(), /How much/);
    assert.match(ui.text(), /How would someone get to it/);
    assert.match(ui.text(), /±8 m/);
    assert.match(ui.text(), /only you know/i);
    ui.unmount();
  });

  test('send waits for how much and how to reach it; what was seen is optional', async () => {
    const { ui } = await atQuestions();
    assert.equal(ui.find('Send report')?.props.disabled, true);
    await ui.press('A heap');
    assert.equal(ui.find('Send report')?.props.disabled, true);
    await ui.press('Easy to walk to');
    assert.equal(ui.find('Send report')?.props.disabled, false);
    ui.unmount();
  });

  test('sending posts the photo, the phone’s own position and the three answers', async () => {
    const { ui, calls } = await atQuestions({ 'POST /debris-reports': view() });
    await answerAndSend(ui);
    const sent = calls.find((c) => c.method === 'POST' && c.path === '/debris-reports');
    assert.ok(sent, 'no POST /debris-reports');
    const body = sent.body as Record<string, unknown>;
    assert.ok(body.photo instanceof File);
    assert.equal(body.amount, 'strand');
    assert.equal(body.access, 'climb');
    assert.deepEqual(JSON.parse(String(body.kinds)), ['foam']);
    const position = JSON.parse(String(body.position));
    assert.equal(position.lat, 13.1454);
    assert.equal(position.accuracyM, 8);
    assert.equal(position.mocked, false);
    assert.ok(Number.isFinite(Date.parse(String(body.takenAt))));
    ui.unmount();
  });

  test('offline keeps every answer and says so', async () => {
    const { ui } = await atQuestions({ 'POST /debris-reports': offline() });
    await answerAndSend(ui);
    assert.ok(toasts.length > 0, 'the failure was silent');
    assert.equal(ui.find('Send report')?.props.disabled, false, 'the answers were lost');
    ui.unmount();
  });
});

describe('when something goes wrong', () => {
  test('a photo the phone cannot read back does not leave the button spinning, and the answers stay', async () => {
    // A web pick with no File: the client has to fetch the URI itself, and here that fails.
    const s = server({ 'GET /debris-reports': { reports: [] } });
    restore = s.restore;
    control.camera = { canceled: false, assets: [{ uri: 'blob:gone', mimeType: 'image/jpeg' }] };
    control.position = THAM_PHANG;
    const ui = await mountScreen(h(DebrisReportScreen, props()));
    await ui.press('Take the photo');
    await answerAndSend(ui);
    assert.ok(toasts.length > 0, 'the failure was silent');
    assert.deepEqual(ui.find('Send report')?.props.accessibilityState, { disabled: false, busy: false });
    assert.equal(ui.find('Down steps or over rocks')?.props.accessibilityState?.selected, true);
    ui.unmount();
  });

  test('a report sent back keeps the answers for the retake: the beach has not changed', async () => {
    const back = view({ verdict: 'rejected', rejectReason: 'outside_area', case: null });
    const { ui } = await atQuestions({ 'POST /debris-reports': back });
    await answerAndSend(ui);
    await ui.press('Take it again');
    await ui.press('Take the photo');
    assert.equal(ui.find('All along the tideline')?.props.accessibilityState?.selected, true);
    assert.equal(ui.find('Down steps or over rocks')?.props.accessibilityState?.selected, true);
    assert.equal(ui.find('Foam')?.props.accessibilityState?.selected, true);
    ui.unmount();
  });
});

describe('what the screens do not promise', () => {
  test('no notification, no service level and no case page that do not exist', async () => {
    const { ui } = await atQuestions({ 'POST /debris-reports': view() });
    await answerAndSend(ui);
    assert.doesNotMatch(ui.text(), /you are told|office hours|any time/i);
    ui.unmount();
  });
});

describe('after sending', () => {
  test('the case number, the others who saw the same pile, and that it earned nothing - on purpose', async () => {
    const merged = view({ verdict: 'merged', case: { number: 'KS-2611-0142', status: 'open', openedAt: '2026-11-23T03:00:00.000Z', reporters: 4, collection: null } });
    const { ui } = await atQuestions({ 'POST /debris-reports': merged });
    await answerAndSend(ui);
    assert.match(ui.text(), /KS-2611-0142/);
    assert.match(ui.text(), /3 other/);
    assert.match(ui.text(), /no points/i);
    assert.match(ui.text(), /Waiting for the municipality/i);
    ui.unmount();
  });

  test('somewhere only a boat can reach says it may wait for the boat team, rather than going quiet', async () => {
    const boat = view({ access: 'boat_only' });
    const { ui } = await atQuestions({ 'POST /debris-reports': boat });
    await ui.press('A heap');
    await ui.press('Only seen from a boat');
    await ui.press('Send report');
    assert.match(ui.text(), /boat team/i);
    ui.unmount();
  });

  test('a report sent back shows the reason and a way to take it again', async () => {
    const back = view({ verdict: 'rejected', rejectReason: 'outside_area', case: null });
    const { ui } = await atQuestions({ 'POST /debris-reports': back });
    await answerAndSend(ui);
    assert.ok(ui.text().includes(DEBRIS_REJECT_REASON.outside_area.en), ui.text());
    assert.ok(ui.find('Take it again'));
    assert.doesNotMatch(ui.text(), /KS-/);
    ui.unmount();
  });
});

describe('the door on Home', () => {
  const card = async (area: 'koh-sichang' | 'samui', config: Record<string, unknown>) => {
    __setAreaForTests(area);
    const s = server({ '/config': config });
    restore = s.restore;
    return mountScreen(h(DebrisReportCard, { onOpen: () => {} }));
  };

  test('on Ko Sichang, with somebody named to read the queue, it opens and names them', async () => {
    const ui = await card('koh-sichang', { fenceOff: false, debrisReader: 'Ko Sichang Municipality' });
    assert.match(ui.text(), /Ko Sichang Municipality/);
    assert.ok(ui.find(/Report rubbish/));
    ui.unmount();
  });

  test('with nobody to read it, there is no door at all - not a door to an empty room', async () => {
    const ui = await card('koh-sichang', { fenceOff: false });
    assert.equal(ui.text(), '');
    ui.unmount();
  });

  test('on an island that takes no reports, nothing either', async () => {
    const ui = await card('samui', { fenceOff: false, debrisReader: 'Ko Sichang Municipality' });
    assert.equal(ui.text(), '');
    ui.unmount();
  });
});
