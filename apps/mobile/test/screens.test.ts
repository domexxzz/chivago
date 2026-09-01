import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { progressionFor, SEED_PLACES } from '@chivago/core';
import { Balances, LevelBlock, RankLadder, Ledger } from '../src/screens/WalletScreen.tsx';
import { MapHeader } from '../src/screens/MapScreen.tsx';
import { PurseChips, OfferRow } from '../src/screens/MarketScreen.tsx';
import { QuestRow } from '../src/screens/QuestsScreen.tsx';
import { ReviewRow } from '../src/screens/PlaceReviews.tsx';
import { PinChip } from '../src/components/SamuiMap.tsx';
import { h, html, labels, text } from './render.ts';
import { LAYERS_WITH_SPECIES, SPECIES } from '@chivago/core';
import { Creature, hasCreatureMark } from '../src/components/Creature.tsx';
import * as fx from './fixtures.ts';

/**
 * What each screen SAYS.
 *
 * Five bugs reached a running app before anybody rendered one of these
 * (docs/21-walking-the-app.md). Three were wrong text: a caption naming one
 * currency over two figures, reward badges with no currency at all, and map
 * pins labelled with their layer. All three are assertions here.
 */

describe('the wallet says which purse is which', () => {
  test('both balances appear, each with what it means', () => {
    const out = text(h(Balances, { wallet: fx.wallet() }));
    assert.match(out, /Green Points/);
    assert.match(out, /1,240/);
    assert.match(out, /Trip Points/);
    assert.match(out, /320/);
    // The notes are the whole reason two numbers are not read as one number
    // split in two.
    assert.match(out, /Verified by a host/);
    assert.match(out, /Earned as you explore/);
  });

  test('the level bar shows EXP, and says EXP is never spent', () => {
    const out = text(h(LevelBlock, { wallet: fx.wallet() }));
    assert.match(out, /Level 3/);
    assert.match(out, /Newcomer/i);
    assert.match(out, /60 \/ 1,200 EXP/);
    // Without this line the obvious assumption is that redeeming costs a level.
    assert.match(out, /EXP is never spent/i);
  });

  test('the rank ladder always shows all five', () => {
    const out = text(h(RankLadder, { wallet: fx.wallet() }));
    for (const rank of ['Newcomer', 'Wanderer', 'Island Explorer', 'Samui Insider', 'Chiva Legend']) {
      assert.ok(out.includes(rank), `${rank} missing from the ladder`);
    }
  });

  test('a top-rank traveller is told so rather than shown a broken bar', () => {
    const out = text(h(LevelBlock, { wallet: fx.wallet({ progression: progressionFor(5_000_000) }) }));
    assert.match(out, /Top rank reached/i);
  });

  test('every ledger row names its currency', () => {
    const out = text(h(Ledger, { wallet: fx.wallet(), onOpenMarket: () => {} }));
    // A +150 and a -180 look like the same kind of thing without the letter.
    assert.match(out, /\+150 G/);
    assert.match(out, /−180 T/);
    // Every entry names the host that verified it. Non-negotiable for trust.
    assert.match(out, /Samui Municipality/);
    assert.match(out, /Sabeinglae Coffee/);
  });
});

describe('the map header names both currencies, in words', () => {
  const props = { balances: { trip: 320, green: 1240 }, mode: 'map' as const, onToggleMode: () => {}, onOpenWallet: () => {} };
  const header = () => text(h(MapHeader, props));

  test('each figure carries its currency as a WORD, not a letter', () => {
    // It read "1,240 G · 320 T". The difference between the two - one vouched
    // for by a host, one seen only by the phone - is the whole product, and it
    // was compressed into two letters a first-time reader cannot decode.
    assert.match(header(), /1,240\s*GREEN/);
    assert.match(header(), /320\s*TRIP/);
  });

  test('no caption sits under both figures describing one of them', () => {
    // It read GREEN POINTS under both numbers: describing one and lying about
    // the other. Found only by opening the app. Each row labels itself now, so
    // there is no shared caption left to be wrong.
    assert.doesNotMatch(header(), /Green Points/i);
    assert.doesNotMatch(header(), /Trip Points/i);
  });

  test('the screen reader is told what the two actually mean', () => {
    // Sighted readers get a word and a tap through to the Wallet. Somebody on
    // a screen reader gets neither unless it is said here.
    const said = labels(h(MapHeader, props)).join(' | ');
    assert.match(said, /Verified by a host/i, 'green is not explained');
    assert.match(said, /Earned as you explore/i, 'trip is not explained');
    assert.match(said, /1,240/);
    assert.match(said, /320/);
  });
});

describe('a reward badge is meaningless without its currency', () => {
  test('a green quest says G', () => {
    const out = text(h(QuestRow, { quest: fx.quest(), progress: null, onPress: () => {} }));
    assert.match(out, /\+150 G/);
  });

  test('a trip quest says T', () => {
    const out = text(h(QuestRow, {
      quest: fx.quest({ rewardPoints: 120, rewardCurrency: 'trip' }),
      progress: null,
      onPress: () => {},
    }));
    assert.match(out, /\+120 T/);
  });

  test('and the screen reader is told the currency in words', () => {
    const spoken = labels(h(QuestRow, { quest: fx.quest(), progress: null, onPress: () => {} })).join(' ');
    // It used to say "150 points", which is the same ambiguity read aloud.
    assert.match(spoken, /150 Green Points/);
  });
});

describe('the marketplace prices in the right purse', () => {
  test('an offer shows its own currency', () => {
    const trip = text(h(OfferRow, { offer: fx.offer(), affordable: true, onRedeem: () => {}, busy: false }));
    assert.match(trip, /180 T/);
    const green = text(h(OfferRow, {
      offer: fx.offer({ costPoints: 600, currency: 'green' }),
      affordable: true, onRedeem: () => {}, busy: false,
    }));
    assert.match(green, /600 G/);
  });

  test('the header shows both purses, not one', () => {
    const out = text(h(PurseChips, { balances: { trip: 320, green: 1240 } }));
    // A single figure would silently be the wrong one half the time.
    assert.match(out, /1,240 G/);
    assert.match(out, /320 T/);
  });

  test('an unaffordable offer stays reachable rather than disabled', () => {
    const out = text(h(OfferRow, { offer: fx.offer(), affordable: false, onRedeem: () => {}, busy: false }));
    // A disabled control tells the user nothing about how far off they are.
    assert.match(out, /180 T/);
  });
});

describe('a review says who verified it, and when they were there', () => {
  test('somebody else’s review leads with the verification, not a name', () => {
    const out = text(h(ReviewRow, {
      review: fx.review(), isMine: false, alreadyReported: false, onReport: () => {},
    }));
    // Every user is called "Traveller" in the pilot, so a column of names reads
    // as a bug. The verification is the useful fact anyway.
    assert.match(out, /Verified visit/i);
    assert.doesNotMatch(out, /Traveller/);
    assert.match(out, /5 \/ 5/);
  });

  test('your own review is marked as yours and cannot be reported', () => {
    const out = text(h(ReviewRow, {
      review: fx.review(), isMine: true, alreadyReported: false, onReport: () => {},
    }));
    assert.match(out, /Your review/i);
    assert.doesNotMatch(out, /Report/);
  });

  test('an already-reported review says so instead of inviting a second go', () => {
    const out = text(h(ReviewRow, {
      review: fx.review(), isMine: false, alreadyReported: true, onReport: () => {},
    }));
    assert.match(out, /already reported/i);
  });
});

describe('the seed data the pins render', () => {
  test('no place is labelled with its own layer', () => {
    // Four of the five were, so the map read Green / Food / Wellness / Quest —
    // repeating the filter chips above it and naming no place at all. A data
    // bug no component test could see, so it is asserted on the data.
    for (const place of SEED_PLACES) {
      assert.notEqual(
        place.short.toLowerCase(), place.layer.toLowerCase(),
        `${place.name.en} is pinned with its layer name`,
      );
    }
  });

  test('the pin label is a shortening of the place name', () => {
    // Both sides normalised the same way, or "Fisherman's" fails against
    // "Fisherman's Village" on the apostrophe alone.
    const plain = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, '');
    for (const place of SEED_PLACES) {
      const firstWord = plain(place.short).split(' ')[0]!;
      assert.ok(
        plain(place.name.en).includes(firstWord),
        `"${place.short}" does not come from "${place.name.en}"`,
      );
    }
  });

  test('what a pin SHOWS and what it ANNOUNCES agree', () => {
    // The accessibility label was right the whole time — a screen reader said
    // "Na Muang Waterfall" while the pin said "GREEN". The assistive path
    // being more informative than the visible one is exactly backwards.
    const place = SEED_PLACES[1]!;
    const pin = h(PinChip, { place: { ...place, healthyScore: 89, breakdown: null, reviews: null }, onPress: () => {} });
    const shown = text(pin);
    const spoken = labels(pin).join(' ');
    assert.match(shown, /Na Muang/);
    assert.match(spoken, /Na Muang Waterfall/);
  });
});

/**
 * The drawings.
 *
 * They contribute no text, so every other test on this screen passes with the
 * artwork deleted. These are the only ones that would notice.
 */
describe('every companion has a face', () => {
  test('every species in the data has a mark drawn for it', () => {
    // The guard that matters: add a sixth habitat and its animal, forget to
    // draw it, and the collection silently shows an egg that never opens.
    for (const layer of LAYERS_WITH_SPECIES) {
      assert.ok(
        hasCreatureMark(SPECIES[layer].key),
        `${SPECIES[layer].name.en} (${SPECIES[layer].key}) has no drawing`,
      );
    }
  });

  test('it renders for every species at every stage', () => {
    // A smoke test with teeth: the first version of these marks reached for an
    // SVG shape the test stub did not export, and an ES module namespace is
    // built statically, so it threw at import rather than drawing nothing.
    for (const layer of LAYERS_WITH_SPECIES) {
      for (const stage of ['egg', 'hatchling', 'grown'] as const) {
        assert.doesNotThrow(
          () => html(h(Creature, { species: SPECIES[layer].key, stage })),
          `${SPECIES[layer].key} at ${stage} does not draw`,
        );
      }
    }
  });

  test('an unknown species falls back to the egg rather than crashing', () => {
    // Species data can arrive from the server ahead of a client that knows how
    // to draw it. An egg is the honest thing to show for something we have no
    // picture of, and it is the one drawing that promises nothing.
    assert.doesNotThrow(() => html(h(Creature, { species: 'sea-monster', stage: 'grown' })));
  });
});
