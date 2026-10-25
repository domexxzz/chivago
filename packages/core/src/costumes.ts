/**
 * Costumes - the one layer in this app it is safe to roll for.
 *
 * `companions.ts` opens by refusing a random roll outright: "a random roll
 * would make it a slot machine. Neither is a thing a conservation app should
 * teach." That refusal stands, and this file does not weaken it. It works
 * because of a distinction that file did not need to draw:
 *
 *   A COMPANION, a MASCOT and a MEDAL all CERTIFY something. A grown
 *   companion says a host verified work in that habitat. A vouched province
 *   mascot says the same of a province. A medal says somebody stood inside a
 *   250 m fence with a second signal under it. Roll for any of those and the
 *   app is handing out evidence, which is the one thing it must never do.
 *
 *   A COSTUME CERTIFIES NOTHING. It changes a prop, a crest, an accent
 *   colour. No screen may read it as a claim about a province, a habitat, a
 *   person or a place, and `costumesCertifyNothing` below says so in code so
 *   a future reader cannot mistake the decision for an oversight.
 *
 * That is the whole argument, and the invariant test holds it: a costume may
 * differ from the mascot it dresses in `prop`, `crest` and `colours.accent`
 * and in nothing else.
 *
 * WHAT A ROLL COSTS, AND WHY IT CANNOT BE BOUGHT
 *
 * One host-verified quest, one roll. Money cannot buy a roll and neither can
 * a check-in - the same exclusion `monsters.ts` makes when it says a check-in
 * is worth nothing against a monster, because standing next to a problem is
 * not doing anything about it. There is no free opening pull, since a costume
 * that cost nothing is a prize the app handed out rather than a receipt for
 * work somebody did.
 *
 * WHAT MAKES THIS NOT A GACHA, MECHANICALLY
 *
 * Three properties, each removing one of the ways a loot box extracts a
 * second payment:
 *
 *   deterministic   the draw is a hash of the traveller and the roll number,
 *                   so the costume was already decided by the deed. The app
 *                   is not deciding at tap time, which means nothing is
 *                   stored - the same derived-never-stored rule
 *                   `companionsFor` and `provinceCompanions` follow - and
 *                   closing the app cannot re-roll anything.
 *   append-only     roll four never moves rolls one to three. The reason
 *                   `progression.ts` gives about EXP applies here: a
 *                   collection that can shift under its owner teaches them
 *                   not to use it.
 *   no duplicates   drawn WITHOUT replacement. The duplicate is the engine of
 *                   a gacha's revenue, and here the payment was a verified
 *                   quest - charging twice for one costume would be charging
 *                   twice for real work. So the set completes in exactly as
 *                   many deeds as it has costumes, no pity timer is needed,
 *                   and no screen ever shows a percentage.
 *
 * There is therefore nothing to disclose odds for, which is also why none of
 * the `nextCostumeStep` lines may mention a chance or a rate: there is no
 * chance in it. A test holds that too.
 *
 * THE COSTUMES A PLACE GRANTS
 *
 * Not everything here is rolled. Four costumes belong to four named Koh
 * Sichang places from the seed, and the only way to get one is for a host to
 * verify work at that place. These are the "ปลุกของดี" half: a reason to walk
 * past the palace and the shop row rather than the pier and the beach alone,
 * which is the behaviour the island's own challenge page asks to change.
 * Being place-locked rather than rare is the point - a thing you get by going
 * somewhere specific cannot be farmed from a sofa, and it needs no odds.
 *
 * WHAT THIS FILE DOES NOT DO. It does not sell anything, hold a currency, or
 * name a business. A shop sponsoring a costume is a thing the operator door
 * (`operator-application.ts`) would have to carry with a disclosure, and it
 * is deliberately not modelled here until a real shop has agreed to it.
 */

import type { Mascot, MascotCrest, MascotProp } from './mascots.ts';
import type { Bilingual } from './types.ts';

/**
 * The invariant the whole module rests on, stated where code can read it.
 *
 * Written as a const for the same reason `monsters.ts` writes
 * `restingChangesTheReading = false`: a comment can be contradicted by a
 * later change in silence, and a const cannot - the test fails.
 */
export const costumesCertifyNothing = true;

/** How a costume is come by. There is no third way, and no way involving money. */
export type CostumeSource = 'roll' | 'place';

/** The cosmetic slots a costume may occupy. Every other field of a Mascot is off limits. */
export interface CostumeSlots {
  readonly prop?: MascotProp;
  readonly crest?: MascotCrest;
  /** Replaces `colours.accent` only. Body, belly and feature colours are the mascot's own. */
  readonly accent?: string;
}

export interface Costume {
  readonly key: string;
  readonly name: Bilingual;
  /**
   * What it is drawn from, in one line, said on the card.
   *
   * The same honesty rule `mascots.ts` applies to a `basis`: a reader should
   * be able to tell where this came from, and somebody who knows better
   * should be able to correct it. Every line opens by saying it is
   * decoration. Where one then states a fact about the island - that Tham
   * Phang is the beach the litter reaches first - it is repeating that
   * place's own `blurb` in `seed.ts`, which carries the sourcing; it is not a
   * new claim made up here to decorate a costume.
   */
  readonly why: Bilingual;
  readonly source: CostumeSource;
  readonly wears: CostumeSlots;
  /** The seed place that grants it. Set for `place`, absent for `roll`. */
  readonly placeId?: string;
}

/**
 * A costume a place grants, with the place required by the type.
 *
 * Worth its own name only because it removes every `placeId!` below - a
 * non-null assertion on a field the data always has is a claim the compiler
 * should be making instead.
 */
type PlaceCostume = Costume & { readonly placeId: string };

/**
 * One host-verified quest, one roll.
 *
 * Not a tunable. Two rolls per quest would make the pool finish in half the
 * deeds and the collection would stop meaning "this many verified quests",
 * which is the only thing it is allowed to mean.
 */
export const ROLLS_PER_VERIFIED_QUEST = 1;

/**
 * The roll pool. FROZEN ONCE SHIPPED - adding, removing or reordering a row
 * here reshuffles every collection that already exists.
 *
 * The draw takes `hash(key + ':' + i) % remaining.length`, so both the length
 * and the order are load-bearing: a seventh costume changes the modulus on
 * roll 1 and every traveller's second costume with it. That is the exact thing
 * the append-only promise above forbids, and no type can stop it, so a
 * golden-vector test pins the draw for a handful of keys and fails if this
 * array or the hash ever moves.
 *
 * To add costumes later, do NOT append here. Add a second pool drawn after
 * this one completes, seeded `key + ':g2:' + i`, so the first six stay put.
 */
const ROLLED: readonly Costume[] = [
  {
    key: 'refill-flask',
    name: { en: 'Refill flask', th: 'ขวดเติมน้ำ', zh: '续水瓶' },
    why: {
      en: 'Decoration, drawn from the bottle the island waste quests ask you to bring.',
      th: 'ของตกแต่ง มาจากขวดที่ Quest ขยะบนเกาะขอให้พกมาเติมน้ำ',
      zh: '装饰，取自岛上垃圾任务请你随身带来的那只水瓶。',
    },
    source: 'roll',
    wears: { prop: 'pot' },
  },
  {
    key: 'sorting-basket',
    name: { en: 'Sorting basket', th: 'ตะกร้าคัดแยก', zh: '分类筐' },
    why: {
      en: 'Decoration, drawn from the baskets a sorting point uses to separate waste.',
      th: 'ของตกแต่ง มาจากตะกร้าที่จุดคัดแยกใช้แยกขยะ',
      zh: '装饰，取自分类点用来分开垃圾的那些筐。',
    },
    source: 'roll',
    wears: { prop: 'basket' },
  },
  {
    key: 'sun-umbrella',
    name: { en: 'Sun umbrella', th: 'ร่มกันแดด', zh: '遮阳伞' },
    why: {
      en: 'Decoration. A sun umbrella, for an island walked in the middle of the day.',
      th: 'ของตกแต่ง ร่มกันแดด สำหรับเกาะที่ต้องเดินกลางวัน',
      zh: '装饰。一把遮阳伞，给正午时分走在岛上的人。',
    },
    source: 'roll',
    wears: { prop: 'umbrella', accent: '#f2c24e' },
  },
  {
    key: 'deck-scarf',
    name: { en: 'Deck scarf', th: 'ผ้าพันคอกันลม', zh: '甲板围巾' },
    why: {
      en: 'Decoration. A scarf against the wind on the open deck of the ferry.',
      th: 'ของตกแต่ง ผ้าพันคอกันลมบนดาดฟ้าเรือ',
      zh: '装饰。一条围巾，挡住渡轮露天甲板上的风。',
    },
    source: 'roll',
    wears: { prop: 'scarf' },
  },
  {
    key: 'field-notebook',
    name: { en: 'Field notebook', th: 'สมุดจด', zh: '野外笔记本' },
    why: {
      en: 'Decoration. A notebook, for writing down what you were told rather than guessing.',
      th: 'ของตกแต่ง สมุดจด สำหรับจดสิ่งที่ได้ฟังมา ไม่ใช่เดา',
      zh: '装饰。一本笔记本，把听来的话记下来，而不是靠猜。',
    },
    source: 'roll',
    wears: { prop: 'book' },
  },
  {
    key: 'tide-crest',
    name: { en: 'Tide crest', th: 'ยอดคลื่น', zh: '潮线冠饰' },
    why: {
      en: 'Decoration. A crest shaped like the tide line, in no particular bay.',
      th: 'ของตกแต่ง ยอดทรงแนวคลื่น ไม่ได้อ้างอิงอ่าวใดอ่าวหนึ่ง',
      zh: '装饰。形如潮线的冠饰，不指任何一处海湾。',
    },
    source: 'roll',
    wears: { crest: 'fin', accent: '#7fa3c4' },
  },
];

/**
 * The four place costumes, on the four Koh Sichang places a visitor can walk
 * between. Ids are the seed's own (`seed.ts`), so a costume cannot point at a
 * place that does not exist.
 *
 * The hospital is in the seed and is deliberately not here: it is on the map
 * so somebody in trouble can find it, and turning it into a collectible
 * would be the wrong invitation.
 */
const PLACE_GRANTED: readonly PlaceCostume[] = [
  {
    key: 'palace-crown',
    name: { en: 'Palace crest', th: 'ยอดวัง', zh: '王宫冠饰' },
    why: {
      en: 'Decoration, granted at Phra Chudadhuj Palace, the royal residence on the island.',
      th: 'ของตกแต่ง ได้จากพระจุฑาธุชราชฐาน พระราชฐานบนเกาะ',
      zh: '装饰，在朱他突王宫获得，那是岛上的王室行宫。',
    },
    source: 'place',
    placeId: 'sc-palace',
    wears: { crest: 'crown', accent: '#d8b46a' },
  },
  {
    key: 'thamphang-flower',
    name: { en: 'Beach flower', th: 'ดอกไม้ชายหาด', zh: '海滩花' },
    why: {
      en: 'Decoration, granted at Tham Phang Beach - the beach the island litter reaches first.',
      th: 'ของตกแต่ง ได้จากหาดถ้ำพัง หาดที่ขยะไปถึงก่อน',
      zh: '装饰，在探蓬海滩获得——岛上的垃圾最先漂到的那片海滩。',
    },
    source: 'place',
    placeId: 'sc-thamphang',
    wears: { crest: 'flower' },
  },
  {
    key: 'pier-boat',
    name: { en: 'Ferry boat', th: 'เรือข้ามฟาก', zh: '渡船' },
    why: {
      en: 'Decoration, granted at Tha Lang pier, where the ferry from Si Racha lands.',
      th: 'ของตกแต่ง ได้จากท่าเรือท่าล่าง ที่เรือจากศรีราชาเทียบ',
      zh: '装饰，在塔朗码头获得，从是拉差来的渡轮在此靠岸。',
    },
    source: 'place',
    placeId: 'sc-pier',
    wears: { prop: 'boat' },
  },
  {
    key: 'shoprow-lantern',
    name: { en: 'Shop row lantern', th: 'โคมหน้าร้าน', zh: '店铺街灯笼' },
    why: {
      en: 'Decoration, granted on the shop row by the pier. Names no shop.',
      th: 'ของตกแต่ง ได้จากย่านร้านค้าหน้าท่าล่าง ไม่ได้ระบุชื่อร้านใด',
      zh: '装饰，在码头旁的店铺街获得。不指名任何一家店。',
    },
    source: 'place',
    placeId: 'sc-shops',
    wears: { prop: 'lantern' },
  },
];

/** Every costume there is. The denominator a collection screen shows. */
export const COSTUMES: readonly Costume[] = Object.freeze(
  [...ROLLED, ...PLACE_GRANTED].map((c) => Object.freeze({ ...c, wears: Object.freeze({ ...c.wears }) })),
);

/** The costumes a roll can draw. Nothing else is ever drawn. */
export const ROLL_POOL: readonly Costume[] = ROLLED;

const BY_PLACE = new Map(PLACE_GRANTED.map((c) => [c.placeId, c]));

/**
 * Rolls earned. Lifetime, from verified quests alone - never from money or a
 * check-in.
 *
 * A non-finite count is zero rather than itself. `Math.max(0, NaN)` is `NaN`,
 * and a `NaN` here used to fall through `nextCostumeStep`'s first branch and
 * tell somebody with no verified quests to go and finish a PLACE costume.
 */
export const rollsEarned = (questsVerified: number): number =>
  Number.isFinite(questsVerified)
    ? Math.max(0, Math.floor(questsVerified)) * ROLLS_PER_VERIFIED_QUEST
    : 0;

/**
 * FNV-1a, 32-bit, with murmur3's `fmix32` finaliser over the top.
 *
 * The hash has to be STABLE - the same next week - because the draw is
 * reproduced from scratch on every read rather than stored. `Math.random`
 * here would make a collection that changed every time a screen opened.
 *
 * THE FINALISER IS NOT OPTIONAL, and this is the subtle part. The draw takes
 * `hash(key + ':' + i) % remaining.length`, so it reads the hash's LOW bits,
 * which are FNV-1a's weakest: multiplying by an odd prime never carries a bit
 * upward, so bit 0 of the result is just the XOR of bit 0 of every input
 * character. Only the `:i` suffix varies between rolls, and a decimal digit's
 * low bit alternates with `i` - so raw FNV-1a ties roll 0 to roll 4 with
 * certainty.
 *
 * Measured over 200,000 keys, raw FNV-1a produced 120 of the 720 possible
 * orderings, and the last costume drawn was `refill-flask` or `tide-crest`
 * 26.7% of the time each against `sun-umbrella` at 8.4%. The first roll was a
 * clean 16.7% each, which is why the bias survives casual testing. With the
 * finaliser: all 720 orderings, every costume last 16.7% of the time.
 *
 * Taking the HIGH bits instead (`floor(h / 2**32 * n)`) is worse, not better -
 * 44 orderings. The mixing is what is missing, not the bit position.
 *
 * `normalize('NFC')` because a Thai or accented traveller key can arrive
 * decomposed from one client and composed from another, and the two must not
 * be different people.
 */
function hash(input: string): number {
  let h = 0x811c9dc5;
  const s = input.normalize('NFC');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // fmix32: avalanche the low bits so a modulo can read them.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** What a traveller has done, as far as costumes are concerned. */
export interface CostumeInput {
  /** Stable per traveller. The draw is reproduced from it, so it must not change. */
  travellerKey: string;
  /** Host-verified quests, lifetime. The only thing that earns a roll. */
  questsVerified: number;
  /** Seed place ids where a host verified work. Grants that place's costume. */
  placesVerified?: readonly string[];
}

export interface CostumeAward {
  costume: Costume;
  from: CostumeSource;
  /** Which roll drew it, from 1. Absent for a place costume. */
  ordinal?: number;
}

/**
 * The costumes a traveller holds, derived from what they have done.
 *
 * Derived, never stored, for the reason `companionsFor` gives: a stored
 * collection is a second record of facts the ledger already holds, and two
 * records of one fact eventually disagree.
 *
 * Draw order is append-only. Step `i` depends only on the traveller key and
 * the steps before it, so earning a fifth roll cannot reshuffle the first
 * four.
 */
export function costumesFor(input: CostumeInput): CostumeAward[] {
  const rolls = Math.min(rollsEarned(input.questsVerified), ROLL_POOL.length);
  const remaining = [...ROLL_POOL];
  const awards: CostumeAward[] = [];

  for (let i = 0; i < rolls; i++) {
    const index = hash(input.travellerKey + ':' + i) % remaining.length;
    awards.push({ costume: remaining.splice(index, 1)[0]!, from: 'roll', ordinal: i + 1 });
  }

  // Place costumes come after the rolled ones, in the order `PLACE_GRANTED`
  // is written (which is a walking order out from the pier, not the seed's own
  // order), so two travellers with the same places always read the same list.
  // An id nothing grants is ignored rather than throwing: a place can leave
  // the seed, and a traveller's history should not crash a screen when it
  // does. A test holds that all four ids are really in the seed, because that
  // silence is exactly what would hide a renamed place.
  const verified = new Set(input.placesVerified ?? []);
  for (const costume of PLACE_GRANTED) {
    if (verified.has(costume.placeId)) awards.push({ costume, from: 'place' });
  }

  return awards;
}

/**
 * Props that are the creature's own body, not something it holds.
 *
 * In the data this is `wings`, on exactly three of the seventy-seven - the
 * dragonfly, the butterfly and the bee - and both renderers draw wings as
 * part of the animal. A costume that overwrote one would take a wing OFF an
 * emblem, which is not "changing how it looks", so those three keep their own
 * prop and wear the costume's other slots instead.
 *
 * `tusks` and `trunk` are in this list and in no mascot row: the elephants
 * get theirs from `m.key.includes('elephant')` in the 3D rig rather than from
 * the prop slot, so a costume never had a route to them. They stay listed
 * because `MascotProp` permits them and a future row could use one.
 *
 * NOTE what this does NOT cover. The other twenty-five props in use are
 * emblem content a costume DOES replace - Chiang Mai's Bo Sang umbrella,
 * Surin's round-up drum. Forty-nine mascots carry no prop at all, so
 * restricting costumes to empty slots would leave a third of the collection
 * unable to wear most of the set. The trade is deliberate and is pinned by a
 * test in the mobile rig suite.
 */
const ANATOMY: readonly MascotProp[] = ['wings', 'tusks', 'trunk'];

/**
 * A mascot wearing a costume. Always a NEW mascot, including when the costume
 * is `null` - the rows in `MASCOTS` are shared and must never be edited.
 *
 * `name`, `creature` and `why` are COPIED rather than spread through. A
 * shallow spread would hand the caller the very `Bilingual` objects in
 * `MASCOTS`, and one `dressed.name.en = ...` would rewrite the province's
 * emblem for every screen in the process.
 *
 * The slots below are the entire blast radius of a costume, and the invariant
 * test proves it by comparing a dressed mascot to its original with exactly
 * those three keys removed.
 */
export function wearing(mascot: Mascot, costume: Costume | null): Mascot {
  const wears = costume?.wears;
  const keepsOwnProp = mascot.prop !== null && ANATOMY.includes(mascot.prop);
  return {
    ...mascot,
    name: { ...mascot.name },
    creature: { ...mascot.creature },
    why: { ...mascot.why },
    prop: keepsOwnProp ? mascot.prop : wears?.prop ?? mascot.prop,
    crest: wears?.crest ?? mascot.crest,
    colours: { ...mascot.colours, accent: wears?.accent ?? mascot.colours.accent },
  };
}

export interface CostumeCollection {
  /** How many they hold. */
  held: number;
  rolled: number;
  fromPlaces: number;
  /** Every costume there is, never the ones reachable today. */
  total: number;
}

/**
 * The collection, counted.
 *
 * `total` is every costume, including the place ones nobody near this
 * traveller can reach - the same decision `provinceCollection` makes about
 * seventy-seven provinces. "2 of 2" would flatter the app.
 */
export function costumeCollection(awards: readonly CostumeAward[]): CostumeCollection {
  return {
    held: awards.length,
    rolled: awards.filter((a) => a.from === 'roll').length,
    fromPlaces: awards.filter((a) => a.from === 'place').length,
    total: COSTUMES.length,
  };
}

/**
 * The one thing to do next, or null when there is nothing left.
 *
 * Always a DEED, never a probability and never a price. There is no chance in
 * this system to disclose and nothing to sell, so a line that mentioned
 * either would be inventing a mechanic the code does not have.
 */
export function nextCostumeStep(input: CostumeInput): Bilingual | null {
  const rolls = Math.min(rollsEarned(input.questsVerified), ROLL_POOL.length);
  const left = ROLL_POOL.length - rolls;

  if (left > 0) {
    return {
      en: `Have a host verify one more quest to earn costume ${rolls + 1} of ${ROLL_POOL.length}`,
      th: `ให้ผู้จัดภารกิจยืนยันภารกิจอีกหนึ่งครั้ง เพื่อได้คอสตูมชิ้นที่ ${rolls + 1} จาก ${ROLL_POOL.length}`,
      zh: `请主办方再验证一次任务，即可获得第 ${rolls + 1} 件服饰，共 ${ROLL_POOL.length} 件`,
    };
  }

  const verified = new Set(input.placesVerified ?? []);
  const missing = PLACE_GRANTED.find((c) => !verified.has(c.placeId));
  if (!missing) return null;

  return {
    en: `Have a host verify work at one more named place to earn its costume`,
    th: `ให้ผู้จัดภารกิจยืนยันงานที่สถานที่ที่ระบุอีกหนึ่งแห่ง เพื่อได้คอสตูมของที่นั่น`,
    zh: `请主办方再在一处指定地点验证你做的事，即可获得那里的服饰`,
  };
}

/** Which place grants a costume, if any. For a place card that wants to say so. */
export const costumeAtPlace = (placeId: string): Costume | null => BY_PLACE.get(placeId) ?? null;
