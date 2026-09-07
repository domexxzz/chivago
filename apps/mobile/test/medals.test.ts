import { strict as assert } from 'node:assert';
import { test, describe, afterEach } from 'node:test';
import { createElement as h } from 'react';

import { MedalsScreen, progressLine } from '../src/screens/MedalsScreen.tsx';
import { ProfileScreen, medalsToShow } from '../src/screens/ProfileScreen.tsx';
import { mountScreen, server } from './interact.ts';
import {
  RANKED_BY, SEED_PLACES, collectionSummary, companionsFor, medalsView, progressionFor,
  type ExploredPlace,
} from '@chivago/core';

/**
 * Medals, on the phone.
 *
 * The rules are proved in core. What is held here is what the screens say
 * about them: the condition on every medal, the date on an earned one, the
 * basis at the top, and a profile that leads with the medals that have
 * something to say.
 */

const noop = () => {};
const NOW = new Date('2026-09-07T12:00:00Z');

const places = SEED_PLACES.map((p) => ({ id: p.id, province: p.province }));
const visit = (placeId: string, iso: string): ExploredPlace => ({ placeId, firstAt: iso, how: 'checkin' });

/** Two check-ins on the island: first steps earned today, the coast one of three. */
const view = () => medalsView([
  visit('chaweng', '2026-09-07T09:00:00Z'),
  visit('namuang', '2026-09-06T09:00:00Z'),
], places);

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; });

describe('the medals screen', () => {
  test('every medal, its condition, and where you stand on it', async () => {
    const s = server({ '/medals': view() }); restore = s.restore;
    const ui = await mountScreen(h(MedalsScreen, { onBack: noop, now: NOW }));
    const said = ui.text();
    assert.match(said, /1 of 7 earned/);
    assert.match(said, /250 m fence/, 'the basis is at the top');
    assert.match(said, /Check in at any one place\./, 'the condition is said, not hidden behind a lock');
    // Dated to the check-in that finished it - the first one, yesterday at
    // Na Muang - not to the latest visit.
    assert.match(said, /Earned · Yesterday/, 'an earned medal carries the date of the check-in that finished it');
    const labels = ui.labels();
    assert.ok(labels.includes('First steps, Earned'));
    assert.ok(labels.includes('Samui coast, 1 / 3 places'));
    assert.ok(labels.includes('Hopper, 1 / 2 areas'), 'the hopper counts areas, not places');
    ui.unmount();
  });

  test('the progress line counts in the unit the rule uses', () => {
    const v = view();
    const coast = v.medals.find((m) => m.key === 'samui-coast')!;
    const hopper = v.medals.find((m) => m.key === 'hopper')!;
    assert.equal(progressLine(coast), '1 / 3 places');
    assert.equal(progressLine(hopper), '1 / 2 areas');
  });
});

describe('the medals on the profile', () => {
  const props = {
    onBack: noop, onOpenAccount: noop, onOpenWallet: noop, onOpenPassport: noop, onOpenMedals: noop, onOpenCompanion: noop,
  };
  const companions = companionsFor([{ layer: 'Green', visitDays: 3, questsVerified: 1 }]);
  const routes = () => ({
    '/wallet': { balances: { green: 1850, trip: 790 }, progression: progressionFor(2640), ledger: [] },
    '/standing': { hosts: [], you: { userId: 'u1', displayName: 'Ana', greenVerified: 610, missionsVerified: 3 }, participants: 1, position: 1, rankedBy: RANKED_BY },
    '/passport': { visited: ['TH-84'], selfReported: [], evidence: [] },
    '/companions': { companions, summary: collectionSummary(companions), speciesAsOf: '2026-09-01' },
    '/medals': view(),
  });

  test('earned first, then the nearest, and six at most', () => {
    const shown = medalsToShow(view().medals);
    assert.equal(shown.length, 6);
    assert.equal(shown[0]!.key, 'first-steps', 'the earned one leads');
    assert.ok(shown.slice(1).every((m) => !m.earned));
    // Explorer is 2 of 3; the coast 1 of 3; those come before the untouched campus.
    assert.equal(shown[1]!.key, 'explorer');
    assert.ok(!shown.some((m) => m.key === 'all-of-campus'), 'the seventh, with nothing to say, waits for see all');
  });

  test('the profile shows the medals with their state and a door to all of them', async () => {
    let opened = 0;
    const s = server(routes()); restore = s.restore;
    const ui = await mountScreen(h(ProfileScreen, { ...props, onOpenMedals: () => { opened += 1; } }));
    assert.match(ui.text(), /Medals/);
    assert.match(ui.text(), /1\/7 · See all/);
    const labels = ui.labels();
    assert.ok(labels.includes('First steps, Earned'));
    assert.ok(labels.includes('Explorer, 2 / 3 places'));
    await ui.press('See all: Medals');
    assert.equal(opened, 1);
    ui.unmount();
  });
});
