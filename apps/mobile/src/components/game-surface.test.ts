import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Where the game surface may go, enforced.
 *
 * This app draws a line between the EVIDENCE layer, where a number is a claim
 * about the world, and the GAME layer of levels, companions, medals and
 * travelling together. `packages/tokens` has drawn it in colour since the
 * palette was written — green means a host verified it, gold is the game — and
 * `Game.tsx` now draws it in surface too.
 *
 * A rule that lives only in a comment is a rule that lasts until somebody is
 * in a hurry. This test is the rule.
 *
 * WHY THE FORBIDDEN LIST IS THE IMPORTANT HALF. A bevelled, glossy, springy
 * control on a screen somebody opens because they are hurt is the interface
 * telling them this is a game. It is not. The same goes for the ledger, for
 * proof a host is about to verify, and for the impact figures somebody will
 * put in a filing: those screens carry claims, and a claim that looks like a
 * toy is a claim nobody should trust.
 */

const SCREENS = new URL('../screens/', import.meta.url).pathname;

/** May wear it: collection, progression, companions, play. */
const GAME_LAYER = [
  'GameScreen.tsx',
  'CompanionHome.tsx',
  'MascotRoom.tsx',
  'MascotsScreen.tsx',
  'MedalsScreen.tsx',
  'PassportScreen.tsx',
  'PartyScreen.tsx',
  'FindPartyScreen.tsx',
];

/**
 * May NOT, and each for its own reason.
 *
 * Anything not named in either list is unclassified and also refused, so a new
 * screen has to be placed on one side of the line on the day it is written
 * rather than a year later by whoever is debugging it.
 */
const EVIDENCE_LAYER: Record<string, string> = {
  'SafetyScreen.tsx': 'a live SOS is not a game',
  'WalletScreen.tsx': 'the ledger is the record, not the toy',
  'ImpactScreen.tsx': 'these figures go into somebody’s report',
  'MissionsScreen.tsx': 'work a host is about to verify',
  'QuestDetail.tsx': 'proof submission',
  'PlaceReviews.tsx': 'moderation and appeals',
  'AccountScreen.tsx': 'devices and credentials',
  'ProfileScreen.tsx': 'standing, which is public and ranked',
  'PlaceScreen.tsx': 'the healthy score is a measured claim',
  'MapScreen.tsx': 'crowd counts and air are measured',
  'MarketScreen.tsx': 'a voucher is money',
  'TripScreen.tsx': 'a plan with prices in it',
  'ConciergeScreen.tsx': 'answers about the real island',
  /*
    Home is the hard case and it lands here on purpose.

    It is a hub carrying both layers at once: the board and the quest strip are
    play, but the healthy score, the crowd figure and the wallet summary are
    measured claims. A screen that wears the game surface WHOLE would put a
    bevel under a number the island produced.

    So the screen stays flat and a game-layer CARD on it may wear the surface
    later — which is a different change, made deliberately, on the card.
  */
  'HomeScreen.tsx': 'a hub that carries measured claims beside play',
  /*
    Onboarding started on the game list and moved here on inspection.

    What is actually on it is permission choices — location, notifications —
    and a consent control is not play. A bevelled, springy toggle is the
    interface making a decision feel like a move in a game, on the one screen
    where the traveller most needs to understand that it is not.
  */
  'Onboarding.tsx': 'permission choices are consent, not play',
};

const imports = (file: string): string => {
  try {
    return readFileSync(join(SCREENS, file), 'utf8');
  } catch {
    return '';
  }
};

const usesGameSurface = (source: string): boolean =>
  /from\s+['"][^'"]*components\/Game\.tsx['"]/.test(source);

describe('the game surface stays in the game layer', () => {
  test('no evidence screen imports it, and the reason is named', () => {
    for (const [file, why] of Object.entries(EVIDENCE_LAYER)) {
      const source = imports(file);
      if (source === '') continue; // a screen that was renamed is caught below
      assert.ok(
        !usesGameSurface(source),
        `${file} reached for the game surface — ${why}`,
      );
    }
  });

  test('every screen is on one side of the line or the other', () => {
    // An unclassified screen is the failure mode this whole test exists to
    // stop: it is how the SOS screen quietly grows a bevel in eighteen months.
    const onDisk = readdirSync(SCREENS).filter((f) => f.endsWith('.tsx'));
    const classified = new Set([...GAME_LAYER, ...Object.keys(EVIDENCE_LAYER)]);
    const orphans = onDisk.filter((f) => !classified.has(f));
    assert.deepEqual(
      orphans, [],
      `these screens are on neither list — put each on one before shipping it: ${orphans.join(', ')}`,
    );
  });

  test('the list names screens that actually exist', () => {
    // A guard pointed at a deleted file passes forever and protects nothing.
    const onDisk = new Set(readdirSync(SCREENS).filter((f) => f.endsWith('.tsx')));
    for (const file of [...GAME_LAYER, ...Object.keys(EVIDENCE_LAYER)]) {
      assert.ok(onDisk.has(file), `${file} is on a list but not on disk`);
    }
  });

  test('the SOS screen is on the forbidden list, by name', () => {
    // Named explicitly rather than left to the loop, because this is the one
    // that matters most and a refactor of the loop must not quietly drop it.
    assert.ok('SafetyScreen.tsx' in EVIDENCE_LAYER);
    assert.ok(!usesGameSurface(imports('SafetyScreen.tsx')));
  });
});
