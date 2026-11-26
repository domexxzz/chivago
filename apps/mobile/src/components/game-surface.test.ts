import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { URL, fileURLToPath } from 'node:url';
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

/*
  `fileURLToPath`, not `.pathname`.

  On Windows a file URL's pathname is "/C:/Users/...", with a leading slash
  the platform does not want. `readdirSync` reads that as a rooted path on
  the current drive and goes looking for C:\\C:\\Users\\..., which does not
  exist - so both directory tests threw ENOENT. And because this file runs
  first in the package's test script, the 493 screen tests after it never
  ran at all: one path bug was hiding the whole mobile suite.
*/
const SCREENS = fileURLToPath(new URL('../screens/', import.meta.url));

/** May wear it: collection, progression, companions, play. */
const GAME_LAYER = [
  'GameScreen.tsx',
  'CompanionHome.tsx',
  'MascotRoom.tsx',
  'MascotsScreen.tsx',
  'FashionScreen.tsx',
  'MedalsScreen.tsx',
  'PassportScreen.tsx',
  'SeasonScreen.tsx',
  'PartyScreen.tsx',
  'FindPartyScreen.tsx',
  /*
    The summoning (docs/68) is squarely the game layer, and it has to be,
    because the one thing it must never look like is evidence. Nothing on it
    is a measured claim: the creatures are invented and say so, the charm
    came from the ledger but is not a balance, and no number on the screen
    goes into anybody's report. A flat, evidence-looking summon screen would
    be the interface quietly suggesting otherwise.
  */
  'SummonScreen.tsx',
  /*
    A mini-game is the game layer by definition, and it is the one screen here
    that could not be anything else: what it shows is a document that keeps
    its own score, in its own storage, and hands nothing to the app. The frame
    around it may wear the surface because there is no claim anywhere inside
    it - and `src/games/index.ts` is where the rule is written that keeps it
    that way, since the danger with a game is never the surface, it is
    somebody deciding later that winning should be worth Green.
  */
  'MiniGameScreen.tsx',
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
  /*
    The navigator is the sharpest case on this list.

    Every number on it is a claim about the real world that somebody is
    about to act on at speed: which way to turn, in how many metres, and how
    long until they are there. A bevelled, springy surface under "turn left
    in 120 m" would be the interface suggesting the distance is a score.
  */
  'NavigateScreen.tsx': 'a turn instruction is acted on at speed, not played',
  'MarketScreen.tsx': 'a voucher is money',
  'AskScreen.tsx': 'a question to a real business, and its quote is theirs',
  'TripScreen.tsx': 'a plan with prices in it',
  'ConciergeScreen.tsx': 'answers about the real island',
  'FairScreen.tsx': 'where a stall is, on the organiser’s plan',
  'CampusServicesScreen.tsx': 'a university’s own services, and a health line is not play',
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
  'LoginScreen.tsx': 'authentication and credentials are not play',
  'RegisterScreen.tsx': 'registration and consent are not play',
  'EditProfileScreen.tsx': 'account details and profile credentials are not play',
  'ConnectAppScreen.tsx': 'account connections and credentials are not play',
  'CommunityFeedScreen.tsx': 'a conversation between real people is not play',
  'ShopManageScreen.tsx': 'business management and shop operations are not play',
  'ShopProfileScreen.tsx': 'real shop discovery and customer reviews are not play',
  'LocalPicksScreen.tsx': 'a directory of real businesses is not play',
  'AdventureScreen.tsx': 'story presentation is playful, but its check-in and server-confirmed reward are evidence',
  'AdventureVerificationScreen.tsx': 'camera, GPS, evidence and host approval are security decisions, not play',
  'TravelJournalScreen.tsx': 'personal notes sit on immutable verified travel events and privacy controls',
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
