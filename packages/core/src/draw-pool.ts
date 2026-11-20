/**
 * One box, two kinds of thing in it: spirits and costumes.
 *
 * READ `spirits.ts` AND `costumes.ts` FIRST. Between them they carry the
 * argument this file is standing on, and this file changes two of its terms.
 * What follows is the record of which two, and what did not move.
 *
 * WHAT MOVED, AND ON WHOSE WORD
 *
 * The owner asked on 13 November 2026 for a single draw holding both the
 * invented spirits and the fashion, paid for with Trip Points. Both halves
 * were put to them against the objections already written down here, and
 * both were confirmed. So:
 *
 *   1. COSTUMES ARE NOW DRAWN. `costumes.ts` built a deliberate non-gacha -
 *      deterministic from the deed, without replacement, no duplicates, no
 *      pity and no published percentage, because "there is no chance in it".
 *      That path STILL EXISTS and is untouched: `costumesFor` still awards a
 *      costume per host-verified quest, certainly, and the forge door still
 *      sells any item outright for stardust. The box is a second, faster,
 *      chancy route to the same wardrobe - never the only one.
 *
 *   2. A PULL COSTS TRIP POINTS. `docs/68` set the rule "nothing is bought"
 *      and paid for a summon with a charm, which is a receipt for a deed.
 *      Trip Points are closer to a currency than a charm is, and the owner
 *      chose them with that said.
 *
 * WHAT DID NOT MOVE, AND MAY NOT
 *
 *   GREEN POINTS CANNOT PAY FOR A PULL. Not now and not behind a flag. That
 *   currency is what an ESG auditor is asked to trust, and a figure that can
 *   be spent on a game is not evidence of anything. `PULL_CURRENCY` is the
 *   single place this is decided and a test holds it to `'trip'`.
 *
 *   NOTHING THAT CERTIFIES IS IN THE BOX. No companion, no province mascot,
 *   no medal, no passport stamp. `costumes.ts` states the reason in full: a
 *   grown companion says a host verified work in a habitat, a vouched mascot
 *   says the same of a province, and rolling for either hands out evidence.
 *   The owner was offered province mascots in the box and declined them.
 *   `POOL` is built from `SPIRITS` and `ROLL_POOL` alone, and a test walks
 *   every entry asserting it carries no `code`, no `scientific` and no
 *   `basis` - the three fields that mark a thing that makes a claim.
 *
 *   NOTHING OF VALUE COMES OUT. A pull yields a spirit or a costume. It
 *   writes no voucher, grants no EXP, unlocks no discount, and pays no
 *   points back. Trip Points go in and decoration comes out; the exchange
 *   runs one way only, so there is nothing here to cash.
 *
 *   THE ROLL IS STILL COMMITTED BEFORE IT IS MADE. This module is pure and
 *   total: it turns two integers and a pity state into an item. The integers
 *   come from a seed the server published a SHA-256 of beforehand, exactly as
 *   `summon-service.ts` already produced them, so a stranger with a receipt
 *   can still recompute any pull.
 *
 * THE ORDER IN HERE IS LOAD-BEARING. `itemsOfRarity` appends costumes AFTER
 * the spirits of the same rarity so that the spirit at a given index keeps
 * its index. The modulus still changes, which is why pulls carry
 * `POOL_VERSION`: a receipt written under version 1 is recomputed against
 * version 1's pool, and this version number is the only thing that makes an
 * old receipt checkable after the box was added to. Bump it, never edit a
 * published pool in place.
 */

import { ROLL_POOL, type Costume } from './costumes.ts';
import {
  MYTHIC_PITY, RARE_PITY, RARITIES, SPIRITS, rarityFromRoll,
  type PityState, type Spirit, type SpiritRarity,
} from './spirits.ts';
import type { Bilingual } from './types.ts';

/**
 * The pool this build draws from.
 *
 * 1 was spirits alone, which is every receipt written before the fashion
 * went in. 2 is spirits and costumes together. A receipt stores the version
 * it was drawn under and `itemsOfRarity` is asked for that version, so
 * yesterday's pulls keep recomputing to yesterday's answer.
 */
export const POOL_VERSION = 3;

/** The two independent banners. Their pools and pity counters never cross. */
export type SummonCategory = 'mascot' | 'fashion';

/** What a pull can pay in. Never `'green'`; see the header. */
export const PULL_CURRENCY = 'trip' as const;

/**
 * What one pull costs, and what ten cost together.
 *
 * The ten is cheaper per pull, and that discount is the one part of a gacha's
 * shape worth being careful about: in a paid box it is the lever that turns
 * a tap into a bulk purchase. Here the money cannot enter - Trip Points come
 * from walking and checking in - so what the discount buys is fewer taps for
 * the same deeds, not a bigger spend.
 */
export const PULL_COST = 100;
export const TEN_PULL_COST = 900;
export const TEN_PULL_SIZE = 10;

/**
 * The most pulls one traveller can make in one island day, both banners
 * together.
 *
 * Trip Points cannot be bought, so this is not a spending cap in the usual
 * sense. It is there so that the answer to "what stops somebody sitting on
 * the box all night?" is a number on the screen rather than "they would run
 * out of walking". Ten is one ten-pull, or ten singles. The mythic floor
 * (`MYTHIC_PITY`) therefore takes at least three days to reach, which is the
 * pace this is meant to have. The day is the island's (`islandDateKey`), the
 * same day a check-in counts against.
 */
export const DAILY_PULL_LIMIT = 10;

/** A drawn thing. Either an invented spirit or a costume; never anything that certifies. */
export type DrawnItem =
  | { readonly kind: 'spirit'; readonly spirit: Spirit; readonly rarity: SpiritRarity }
  | { readonly kind: 'costume'; readonly costume: Costume; readonly rarity: SpiritRarity };

/**
 * Which rarity each rolled costume sits at.
 *
 * Kept HERE rather than on the rows in `costumes.ts`, because a costume has
 * no rarity of its own - it is six pieces of decoration, equal to each other,
 * and the deed-earned path still hands them out without replacement and
 * without ever mentioning one of these words. This map is a fact about THE
 * BOX, so it lives with the box.
 *
 * Every banner has at least one eligible item in every published rarity.
 * Tide crest already existed as the most elaborate fashion collectible; the
 * independent Fashion banner now places it in Mythic so its guarantee can be
 * honoured without inventing a reward or silently falling through to a
 * different rarity.
 */
export const COSTUME_RARITY: Readonly<Record<string, SpiritRarity>> = Object.freeze({
  'refill-flask': 'common',
  'sorting-basket': 'common',
  'sun-umbrella': 'uncommon',
  'deck-scarf': 'uncommon',
  'field-notebook': 'rare',
  'tide-crest': 'mythic',
});

const SPIRIT_ITEMS: readonly DrawnItem[] = SPIRITS.map(
  (spirit) => Object.freeze({ kind: 'spirit', spirit, rarity: spirit.rarity }) as DrawnItem,
);

const COSTUME_ITEMS: readonly DrawnItem[] = ROLL_POOL.map((costume) => {
  const rarity = COSTUME_RARITY[costume.key];
  if (!rarity) throw new Error(`Costume ${costume.key} is in ROLL_POOL with no rarity in COSTUME_RARITY.`);
  return Object.freeze({ kind: 'costume', costume, rarity }) as DrawnItem;
});

/** Everything in the box, spirits first. The denominator a collection screen shows. */
export const POOL: readonly DrawnItem[] = Object.freeze([...SPIRIT_ITEMS, ...COSTUME_ITEMS]);

/** The static catalogue behind each DB-configured banner. */
export const CATEGORY_POOL: Readonly<Record<SummonCategory, readonly DrawnItem[]>> = Object.freeze({
  mascot: SPIRIT_ITEMS,
  fashion: COSTUME_ITEMS,
});

export function itemsForCategory(
  category: SummonCategory,
  rarity?: SpiritRarity,
): readonly DrawnItem[] {
  const pool = CATEGORY_POOL[category];
  return rarity ? pool.filter((item) => item.rarity === rarity) : pool;
}

/**
 * The entries of one rarity, for one pool version.
 *
 * Spirits keep their order and costumes come after them, so index n of a
 * rarity means the same spirit it always did. Version 1 is the spirits
 * alone - the shape every receipt written before the fashion went in was
 * drawn against.
 */
export function itemsOfRarity(rarity: SpiritRarity, version: number = POOL_VERSION): readonly DrawnItem[] {
  const spirits = SPIRIT_ITEMS.filter((p) => p.rarity === rarity);
  if (version <= 1) return spirits;
  return [...spirits, ...COSTUME_ITEMS.filter((p) => p.rarity === rarity)];
}

/** How many of each rarity are in the box, for the screen that prints the table. */
export const POOL_COUNT: Readonly<Record<SpiritRarity, number>> = Object.freeze(
  Object.fromEntries(RARITIES.map((r) => [r, itemsOfRarity(r).length])) as Record<SpiritRarity, number>,
);

/** A prize's stable key. Unique across both kinds — a test holds that no spirit and costume collide. */
export const itemKey = (item: DrawnItem): string =>
  item.kind === 'spirit' ? item.spirit.key : item.costume.key;

/** What it is called, in every language the app speaks. */
export const itemName = (item: DrawnItem): Bilingual =>
  item.kind === 'spirit' ? item.spirit.name : item.costume.name;

/** Find one by key, within a pool version. Returns undefined rather than throwing. */
export const itemFor = (key: string, version: number = POOL_VERSION): DrawnItem | undefined =>
  (version <= 1 ? SPIRIT_ITEMS : POOL).find((p) => itemKey(p) === key);

export interface ItemDraw {
  readonly item: DrawnItem;
  readonly rarity: SpiritRarity;
  /** Set when a floor decided the rarity rather than the roll. Printed on the receipt. */
  readonly byPity: 'mythic' | 'rare' | null;
}

/**
 * Resolve one pull.
 *
 * The rarity arithmetic is `drawSpirit`'s, unchanged and for its reasons: the
 * floors are applied BEFORE the roll is read and the roll is still consumed,
 * so a pull's inputs mean the same thing whether a floor fired or not. Only
 * the list the `pick` indexes into is wider.
 */
export function drawItem(
  roll: number,
  pick: number,
  pity: PityState,
  version: number = POOL_VERSION,
): ItemDraw {
  let byPity: ItemDraw['byPity'] = null;
  let rarity: SpiritRarity;

  if (pity.sinceMythic + 1 >= MYTHIC_PITY) {
    rarity = 'mythic';
    byPity = 'mythic';
  } else if (pity.sinceRare + 1 >= RARE_PITY) {
    // The floor guarantees RARE OR BETTER, so a mythic rolled on the same
    // pull still counts as a mythic. Clamping it down would make the floor a
    // ceiling, which is the opposite of what it is for.
    rarity = rarityFromRoll(roll) === 'mythic' ? 'mythic' : 'rare';
    byPity = rarity === 'mythic' ? null : 'rare';
  } else {
    rarity = rarityFromRoll(roll);
  }

  const pool = itemsOfRarity(rarity, version);
  return { item: pool[pick % pool.length]!, rarity, byPity };
}

/**
 * What ten pulls cost together, and what one costs.
 *
 * A single function so no screen multiplies the price itself and prints a
 * total the server would refuse.
 */
export const pullCost = (pulls: number): number =>
  (pulls === TEN_PULL_SIZE ? TEN_PULL_COST : PULL_COST * Math.max(0, Math.floor(pulls)));
