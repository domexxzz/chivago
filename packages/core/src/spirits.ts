/**
 * The Summoning: twenty-four spirits, and the rules a roll has to obey here.
 *
 * READ THIS BEFORE CHANGING ANYTHING BELOW. The owner asked for a gacha, and
 * two files in this repository say in their own words that a gacha is the
 * wrong shape: `companions.ts` ("a random roll would make it a slot machine")
 * and `docs/58-the-prize-question.md`, which lists "a drop table, or any
 * reward decided by a roll" among the four things that would move this
 * product under the Gambling Act B.E. 2478 in one commit.
 *
 * Neither of those objections is to randomness. Both are to randomness
 * DECIDING SOMETHING THAT MATTERS. So this file draws the line where they
 * drew it, and the line is the whole design:
 *
 *   NOTHING OF VALUE IS EVER DRAWN. A summon yields a spirit and nothing
 *   else - never points, never a voucher, never a sponsor's goods, never a
 *   discount, never anything redeemable anywhere for anything. A spirit
 *   cannot be sold, sent, spent or exchanged. `summon-service.ts` has a test
 *   that the outcome carries no currency, and it should outlive this comment.
 *
 *   NOTHING IS BOUGHT. A summon costs a CHARM, and a charm is earned by
 *   doing something the system already records: a host-verified quest, or a
 *   day on which this traveller checked in somewhere. Charms cost no money,
 *   cannot be bought with money, and are not bought with Green Points -
 *   which are the ESG currency an auditor is asked to trust and must never
 *   be spendable on a game.
 *
 *   THE COMPANIONS AND THE MASCOTS ARE NOT TOUCHED. The five Samui species
 *   stay on the evidence ladder in `companions.ts`; the seventy-seven
 *   provincial emblems stay in `mascots.ts`, where `basis` says where each
 *   came from. A spirit is a THIRD thing and says so: it is invented, it
 *   claims nothing about any animal, any province or any place, and
 *   `INVENTED` below is printed on every card so a reader can tell it apart
 *   from the two collections that do make claims.
 *
 *   THE ROLL IS CHECKABLE. The draw is a number this file maps to a spirit
 *   by a published table, and the number itself is produced from a seed the
 *   server commits to before anybody pulls (see `summon-service.ts`). The
 *   rates are in `RARITY_RATE`, served by the API and printed on screen; the
 *   two pity floors are in `MYTHIC_PITY` and `RARE_PITY` and are published
 *   the same way. There is no soft pity, no hidden weighting, and no number
 *   anywhere that the player is not shown.
 *
 * WHAT A SPIRIT IS MADE OF is deliberately the mascot vocabulary - archetype,
 * outline, ears, tail, crest, one prop, four colours - so `MascotMark` draws
 * these too and there is one renderer rather than two.
 */

import type { Bilingual } from './types.ts';
import type {
  MascotArchetype, MascotCrest, MascotEars, MascotProp, MascotShape, MascotTail,
} from './mascots.ts';

/**
 * The parts a drawn creature is made of, apart from who it is.
 *
 * Factored out of `Mascot` so a spirit can be handed to the same renderer
 * without being a mascot - which it is not, and must never be mistaken for.
 */
export interface MascotForm {
  archetype: MascotArchetype;
  colours: { body: string; belly: string; feature: string; accent: string };
  ears: MascotEars;
  tail: MascotTail;
  crest: MascotCrest;
  prop: MascotProp | null;
  shape: MascotShape;
}

export type SpiritRarity = 'common' | 'uncommon' | 'rare' | 'mythic';
export const RARITIES: readonly SpiritRarity[] = ['common', 'uncommon', 'rare', 'mythic'] as const;

/** Five courts. Invented, like everything else here - not the app's five layers. */
export type SpiritCourt = 'tide' | 'grove' | 'ember' | 'storm' | 'dusk';

export const COURT_LABEL: Record<SpiritCourt, Bilingual> = {
  tide: { en: 'Tide', th: 'วารี' },
  grove: { en: 'Grove', th: 'พนา' },
  ember: { en: 'Ember', th: 'อัคนี' },
  storm: { en: 'Storm', th: 'วายุ' },
  dusk: { en: 'Dusk', th: 'สนธยา' },
};

export const RARITY_LABEL: Record<SpiritRarity, Bilingual> = {
  common: { en: 'Common', th: 'สามัญ' },
  uncommon: { en: 'Uncommon', th: 'ไม่ธรรมดา' },
  rare: { en: 'Rare', th: 'หายาก' },
  mythic: { en: 'Mythic', th: 'ตำนาน' },
};

/**
 * Said on every card, in both languages.
 *
 * `mascots.ts` prints `basis` so a reader can tell a provincial seal from a
 * famous fruit. A spirit has no basis to print, and the honest thing to
 * print instead is that there is none.
 */
export const INVENTED: Bilingual = {
  en: 'Invented. Not an animal, a province or a place - a creature made up for this collection.',
  th: 'สร้างขึ้นใหม่ ไม่ใช่สัตว์จริง ไม่ใช่จังหวัด ไม่ใช่สถานที่ - เป็นตัวละครที่แต่งขึ้นสำหรับคอลเลกชันนี้',
};

export interface Spirit {
  key: string;
  court: SpiritCourt;
  rarity: SpiritRarity;
  /** A nickname, the way a child would say it. */
  name: Bilingual;
  /** What it is: "a foam minnow", "a cloud serpent". */
  creature: Bilingual;
  /** One line of its own. Flavour, and labelled as flavour by `INVENTED`. */
  lore: Bilingual;
  form: MascotForm;
}

type Row = [
  key: string, court: SpiritCourt, rarity: SpiritRarity,
  name: [string, string], creature: [string, string], lore: [string, string],
  archetype: MascotArchetype, shape: MascotShape,
  colours: [string, string, string, string],
  ears: MascotEars, tail: MascotTail, crest: MascotCrest, prop: MascotProp | null,
];

/*
  Nine common, seven uncommon, five rare, three mythic.

  Not a pyramid for its own sake: the commons are what a traveller actually
  collects, so there have to be enough of them to be a collection on their
  own, and the three mythics are few enough that the room knows what one is.

  No spirit wears the evidence green (#25874c and its neighbours). Green means
  a host verified something; an invented creature has verified nothing, and
  the test in spirits.test.ts holds it to that.
*/
const ROWS: Row[] = [
  // ---- Tide -------------------------------------------------------------
  ['tide-minnow', 'tide', 'common', ['Fong', 'ฟอง'], ['a foam minnow', 'ปลาฟอง'],
    ['Born where a wave finishes, and gone by the time the next one starts.', 'เกิดตรงที่คลื่นจบ และหายไปก่อนคลื่นลูกใหม่จะมา'],
    'sea', 'round', ['#8fd0e6', '#eaf7fc', '#3f7f9f', '#ffffff'], 'none', 'fan', 'fin', null],
  ['tide-pearlkeeper', 'tide', 'uncommon', ['Muk', 'มุก'], ['a pearl-keeping crab', 'ปูเฝ้าไข่มุก'],
    ['Carries one pearl its whole life and will not say where it found it.', 'ถือไข่มุกเม็ดเดียวทั้งชีวิต และไม่เคยบอกว่าเจอที่ไหน'],
    'shell', 'flat', ['#d98a7a', '#f7e2d8', '#8a4a3c', '#f6f0ff'], 'none', 'none', 'none', 'pearl'],
  ['tide-naga-fry', 'tide', 'rare', ['Nak Noi', 'นาคน้อย'], ['a naga hatchling', 'ลูกพญานาคจิ๋ว'],
    ['Still too small to make a river, so it practises in puddles.', 'ยังเล็กเกินจะสร้างแม่น้ำ เลยซ้อมในแอ่งน้ำไปก่อน'],
    'naga', 'long', ['#2f7a8f', '#bfe6ef', '#1b4a58', '#f2c24e'], 'none', 'long', 'crown', null],
  ['tide-moonwhale', 'tide', 'mythic', ['Duang Chan', 'ดวงจันทร์'], ['a whale that carries the moon', 'วาฬแบกดวงจันทร์'],
    ['Surfaces once a month, which is why the moon is sometimes late.', 'โผล่ขึ้นมาเดือนละครั้ง นั่นแหละเหตุผลที่บางคืนจันทร์ขึ้นช้า'],
    'sea', 'long', ['#3a4a7a', '#c6cfe8', '#1e2746', '#f6f0d0'], 'none', 'flukes', 'none', 'lantern'],

  // ---- Grove ------------------------------------------------------------
  ['grove-sprout', 'grove', 'common', ['No', 'หน่อ'], ['a sprout sprite', 'ภูตหน่อไม้'],
    ['Three days old and already taller than it was yesterday.', 'อายุสามวัน แต่สูงกว่าเมื่อวานแล้ว'],
    'sprite', 'tall', ['#8fb45a', '#e4f0c4', '#56762c', '#f2d24e'], 'none', 'none', 'leaf', null],
  ['grove-mossling', 'grove', 'common', ['Num', 'นุ่ม'], ['a moss cub', 'ลูกมอส'],
    ['Sleeps on the north side of things and complains about the sun.', 'นอนด้านทิศเหนือของทุกอย่าง และบ่นเรื่องแดดตลอด'],
    'beast', 'round', ['#6f8a5c', '#cfddb8', '#3f512f', '#b7d08a'], 'round', 'short', 'none', null],
  ['grove-lanternfruit', 'grove', 'uncommon', ['Khom', 'โคม'], ['a lantern fruit', 'ผลโคมไฟ'],
    ['Ripens into light instead of sugar, which no orchard has forgiven.', 'สุกเป็นแสงแทนที่จะเป็นน้ำตาล ซึ่งสวนผลไม้ไม่เคยให้อภัย'],
    'sprite', 'round', ['#f2a83b', '#ffe3b0', '#a35a12', '#fff3c4'], 'none', 'none', 'fruit', 'lantern'],
  ['grove-warden', 'grove', 'rare', ['Rukkha', 'รุกขา'], ['a walking tree', 'ต้นไม้เดินได้'],
    ['Moves one step a year and has never once been in a hurry.', 'เดินปีละก้าว และไม่เคยรีบสักครั้ง'],
    'ape', 'tall', ['#7a6246', '#cbb391', '#45351f', '#6f9b4a'], 'tufts', 'none', 'leaf', 'basket'],

  // ---- Ember ------------------------------------------------------------
  ['ember-spark', 'ember', 'common', ['Kai', 'ไก'], ['an ember spark', 'ประกายไฟ'],
    ['Lives about four seconds and spends all of them delighted.', 'มีชีวิตราวสี่วินาที และใช้มันอย่างมีความสุขทั้งสี่'],
    'bug', 'round', ['#f2762c', '#ffd2a0', '#9a3a0c', '#ffe9a8'], 'none', 'short', 'flame', null],
  ['ember-kiln', 'ember', 'common', ['Tao', 'เตา'], ['a little kiln', 'เตาเผาน้อย'],
    ['Warm to hold, and will bake anything you leave on its head.', 'อุ่นมือ และจะอบทุกอย่างที่วางไว้บนหัวมัน'],
    'shell', 'round', ['#a8553a', '#e8c0a4', '#5e2b18', '#f2a83b'], 'none', 'none', 'none', 'steam'],
  ['ember-forgemoth', 'ember', 'uncommon', ['Mod', 'มอด'], ['a moth of the forge', 'มอดเตาหลอม'],
    ['Drawn to the hottest thing in the room, which is usually an argument.', 'บินเข้าหาสิ่งที่ร้อนที่สุดในห้อง ซึ่งมักจะเป็นการเถียงกัน'],
    'bug', 'flat', ['#c9502c', '#f6c9a8', '#6b2210', '#ffd27a'], 'none', 'fan', 'antennae', 'wings'],
  ['ember-sunbird', 'ember', 'rare', ['Tawan', 'ตะวัน'], ['a sun bird', 'นกตะวัน'],
    ['Wakes an hour before the sun to make sure it still remembers how.', 'ตื่นก่อนดวงอาทิตย์หนึ่งชั่วโมง เพื่อเช็กว่ามันยังจำวิธีขึ้นได้'],
    'bird', 'tall', ['#f2b52c', '#fff0b8', '#b35a12', '#e8543a'], 'none', 'plume', 'crest', null],
  ['ember-lamp-phoenix', 'ember', 'mythic', ['Hong Fai', 'หงส์ไฟ'], ['the phoenix in the lamp', 'หงส์ในตะเกียง'],
    ['Folds itself into any lamp that is still burning at four in the morning.', 'พับตัวเองเข้าไปในตะเกียงทุกดวงที่ยังติดอยู่ตอนตีสี่'],
    'bird', 'tall', ['#e8543a', '#ffd9a8', '#7a1e10', '#ffe9a8'], 'none', 'plume', 'flame', 'lantern'],

  // ---- Storm ------------------------------------------------------------
  ['storm-gust', 'storm', 'common', ['Lom', 'ลม'], ['a gust sprite', 'ภูตสายลม'],
    ['Opens every door it passes and apologises to none of them.', 'เปิดประตูทุกบานที่ผ่าน และไม่เคยขอโทษสักบาน'],
    'sprite', 'pear', ['#9fc6d8', '#e8f4fa', '#4f7f96', '#ffffff'], 'none', 'plume', 'none', 'scarf'],
  ['storm-raindrop', 'storm', 'common', ['Yot', 'หยด'], ['a raindrop', 'หยดฝน'],
    ['Has fallen eleven thousand times and still looks surprised.', 'ตกลงมาหนึ่งหมื่นหนึ่งพันครั้ง และยังทำหน้าตกใจทุกครั้ง'],
    'sprite', 'round', ['#5f9fd0', '#d6ecf8', '#2d5c80', '#bfe3f2'], 'none', 'none', 'none', null],
  ['storm-kite', 'storm', 'uncommon', ['Wao', 'ว่าว'], ['a storm kite', 'ว่าวพายุ'],
    ['Cut its own string years ago and has not come down since.', 'ตัดสายป่านตัวเองไปเมื่อหลายปีก่อน และยังไม่ลงมาเลย'],
    'bird', 'flat', ['#d9536f', '#f8c6d0', '#80213a', '#f2c24e'], 'none', 'fan', 'none', 'wings'],
  ['storm-thunderfrog', 'storm', 'uncommon', ['Kop Fa', 'กบฟ้า'], ['a thunder frog', 'กบฟ้าร้อง'],
    ['Croaks first; the sky copies it about two seconds later.', 'ร้องก่อน แล้วฟ้าค่อยร้องตามอีกราวสองวินาที'],
    'sprite', 'flat', ['#5f8f6a', '#cfe6d2', '#2d4f36', '#f2d24e'], 'none', 'none', 'none', 'drum'],
  ['storm-cloudserpent', 'storm', 'rare', ['Mek', 'เมฆ'], ['a cloud serpent', 'งูเมฆ'],
    ['Long enough to be two weathers at once, and often is.', 'ยาวพอจะเป็นอากาศสองแบบพร้อมกัน และก็เป็นบ่อยด้วย'],
    'naga', 'long', ['#8b94b8', '#dfe4f2', '#474f70', '#f6f0ff'], 'none', 'long', 'whiskers', null],

  // ---- Dusk -------------------------------------------------------------
  ['dusk-moth', 'dusk', 'common', ['Yam', 'ยาม'], ['a dusk moth', 'ผีเสื้อยามค่ำ'],
    ['Comes on at the same minute every evening, like a street light.', 'มาตรงนาทีเดิมทุกเย็น เหมือนไฟถนน'],
    'bug', 'flat', ['#7a6f8f', '#ded6ea', '#413a55', '#f2d24e'], 'none', 'short', 'antennae', null],
  ['dusk-shadowcat', 'dusk', 'common', ['Ngao', 'เงา'], ['a shadow cat', 'แมวเงา'],
    ['Belongs to no one and sits on everybody\'s step anyway.', 'ไม่ใช่แมวของใคร แต่ก็ไปนั่งหน้าบ้านทุกคนอยู่ดี'],
    'beast', 'round', ['#4a4553', '#8d8799', '#241f2b', '#8fd0e6'], 'long', 'long', 'none', null],
  ['dusk-lanternghost', 'dusk', 'uncommon', ['Wap', 'วับ'], ['a lantern wisp', 'ดวงไฟเร่ร่อน'],
    ['Walks the path ahead of you and is never there when you arrive.', 'เดินนำหน้าไปตามทาง และไม่เคยอยู่ตรงนั้นตอนเราไปถึง'],
    'sprite', 'tall', ['#b8d8c8', '#eef7f2', '#5f8a76', '#ffe9a8'], 'none', 'none', 'flame', 'lantern'],
  ['dusk-starweaver', 'dusk', 'uncommon', ['Dao', 'ดาว'], ['a star weaver', 'ผู้ทอดาว'],
    ['Re-threads one constellation a night; nobody has noticed which.', 'ทอกลุ่มดาวใหม่คืนละกลุ่ม ยังไม่มีใครจับได้ว่ากลุ่มไหน'],
    'bug', 'long', ['#4b4a86', '#d3d0f0', '#272553', '#f6f0d0'], 'none', 'plume', 'antennae', 'gem'],
  ['dusk-dreamtapir', 'dusk', 'rare', ['Fan', 'ฝัน'], ['a dream tapir', 'สมเสร็จกินฝัน'],
    ['Eats the dream you did not want and leaves the one you did.', 'กินฝันที่เราไม่อยากได้ และทิ้งฝันที่เราอยากได้ไว้'],
    'beast', 'pear', ['#2f2b3a', '#efe9e0', '#14121c', '#e07aa8'], 'round', 'short', 'none', 'trunk'],
  ['dusk-nightnaga', 'dusk', 'mythic', ['Ratri', 'ราตรี'], ['the naga of the long night', 'พญานาคราตรี'],
    ['Coils round the hour between three and four, which is why it is longest.', 'ขดรอบชั่วโมงระหว่างตีสามถึงตีสี่ นั่นแหละเหตุผลที่มันยาวที่สุด'],
    'naga', 'long', ['#211d33', '#6f6894', '#0d0b16', '#9fe0ff'], 'horns', 'long', 'crown', 'gem'],
];

export const SPIRITS: readonly Spirit[] = ROWS.map(
  ([key, court, rarity, name, creature, lore, archetype, shape, colours, ears, tail, crest, prop]) => ({
    key,
    court,
    rarity,
    name: { en: name[0], th: name[1] },
    creature: { en: creature[0], th: creature[1] },
    lore: { en: lore[0], th: lore[1] },
    form: {
      archetype,
      shape,
      colours: { body: colours[0], belly: colours[1], feature: colours[2], accent: colours[3] },
      ears,
      tail,
      crest,
      prop,
    },
  }),
);

export const SPIRIT_COUNT = SPIRITS.length;

const BY_KEY = new Map(SPIRITS.map((s) => [s.key, s]));
export const spiritFor = (key: string): Spirit | undefined => BY_KEY.get(key);
export const isSpiritKey = (key: string): boolean => BY_KEY.has(key);

/**
 * The pool of one rarity, in a fixed order.
 *
 * The order matters: the draw indexes into it, so re-ordering this array
 * would change what every past summon resolves to and break the verification
 * of every receipt ever issued. Add to the END of a rarity's rows, never
 * into the middle.
 */
export const spiritsOfRarity = (rarity: SpiritRarity): readonly Spirit[] =>
  SPIRITS.filter((s) => s.rarity === rarity);

/** Body, outline, crest and main colour. Two spirits sharing one would be one spirit. */
export const spiritSignature = (s: Spirit): string =>
  `${s.form.archetype}/${s.form.shape}/${s.form.crest}/${s.form.colours.body.toLowerCase()}`;

// ---------------------------------------------------------------------------
// The published table
// ---------------------------------------------------------------------------

/**
 * The rates, as a player is shown them. These numbers are served by
 * `GET /summon` and printed on the screen before anybody spends a charm.
 *
 * Integers in TEN-THOUSANDTHS, not floats. A rate table that reads 0.1 + 0.27
 * on one machine and 0.37000000000000005 on another is a table nobody can
 * check, and "the rates are checkable" is most of the point of this file.
 */
export const RARITY_WEIGHT: Record<SpiritRarity, number> = {
  common: 6_000,
  uncommon: 2_700,
  rare: 1_000,
  mythic: 300,
};

export const WEIGHT_TOTAL = 10_000;

/**
 * The roll band as a percentage. Exact, because the weights are integers.
 *
 * This is what ONE ROLL does, before either floor is applied. It is not the
 * rate a player meets over a collection - that is `RARITY_EFFECTIVE_PERCENT`
 * below, and it is the one the screen leads with.
 */
export const RARITY_PERCENT: Record<SpiritRarity, number> = {
  common: RARITY_WEIGHT.common / 100,
  uncommon: RARITY_WEIGHT.uncommon / 100,
  rare: RARITY_WEIGHT.rare / 100,
  mythic: RARITY_WEIGHT.mythic / 100,
};

/**
 * The two floors, published with the rates.
 *
 * A floor, not a "soft pity": there is no hidden ramp, no streak detection
 * and no number the player is not told. On the summon where the counter
 * reaches the floor the rarity is simply fixed, and the receipt says it was.
 */
export const MYTHIC_PITY = 30;
export const RARE_PITY = 10;

// ---------------------------------------------------------------------------
// What that table actually comes to
// ---------------------------------------------------------------------------

/*
  `RARITY_WEIGHT` is what ONE ROLL does. It is not what a collection ends up
  made of, and for a while this file published it as though it were.

  The floors are not a rounding error. A rare is forced on every tenth summon
  without one and a mythic on every thirtieth, and both fire often enough to
  move the table a long way: a player told "mythic 3%" meets one at about
  5%. Every bit of that gap is in the player's favour, which is exactly why
  it went unnoticed - but a rate printed above a button is a promise about
  what will happen, and 3% was not what happens.

  So both numbers are published now. The EFFECTIVE table is the headline,
  because it is the sentence a player reads as a promise. The roll band stays
  beside it, because it is the number a roll is actually compared against and
  a stranger recomputing a receipt needs it to follow the arithmetic.

  Computed, never typed in: change a weight or a floor and this follows on
  its own. Exact, in whole-number arithmetic from end to end, so it reads the
  same on every machine - the same promise `RARITY_WEIGHT` makes, and the one
  docs/68 rests on.
*/

interface Ratio { n: bigint; d: bigint }

const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b));
const ratio = (n: bigint, d: bigint): Ratio => {
  const g = gcd(n < 0n ? -n : n, d) || 1n;
  return { n: n / g, d: d / g };
};
const plus = (a: Ratio, b: Ratio): Ratio => ratio(a.n * b.d + b.n * a.d, a.d * b.d);
const times = (a: Ratio, b: Ratio): Ratio => ratio(a.n * b.n, a.d * b.d);
const NONE: Ratio = { n: 0n, d: 1n };

/**
 * The share of all draws each rarity really takes, in ten-thousandths.
 *
 * Worked out over one MYTHIC CYCLE - the run of summons from just after one
 * mythic to the next - because a cycle always ends (the floor at
 * `MYTHIC_PITY` guarantees it) and so the whole thing is a forward walk of
 * at most thirty steps rather than a stationary distribution anybody has to
 * take on trust.
 *
 * `alive[r]` is the chance the run has got this far without a mythic, with
 * `r` summons since the last rare. Each step spreads that chance over what
 * the summon can yield and carries the survivors forward. The long-run rate
 * is then simply what one cycle yields over how long one cycle lasts.
 *
 * Two things a test holds, both of which would catch an error here: exactly
 * one mythic is produced per cycle, and the four shares sum to
 * `WEIGHT_TOTAL`.
 */
export function effectiveWeights(): Record<SpiritRarity, number> {
  const share = (r: SpiritRarity): Ratio => ratio(BigInt(RARITY_WEIGHT[r]), BigInt(WEIGHT_TOTAL));
  const pMythic = share('mythic');
  const pRare = share('rare');
  // The two that reset neither counter, and so are the only way to run a
  // floor down.
  const pPlain = plus(share('common'), share('uncommon'));

  let alive: readonly Ratio[] = Array.from({ length: RARE_PITY }, (_, r) => (r === 0 ? { n: 1n, d: 1n } : NONE));
  let yielded: Record<SpiritRarity, Ratio> = { common: NONE, uncommon: NONE, rare: NONE, mythic: NONE };
  let lasted: Ratio = NONE;

  for (let since = 0; since < MYTHIC_PITY; since++) {
    const next: Ratio[] = Array.from({ length: RARE_PITY }, () => NONE);
    for (let r = 0; r < RARE_PITY; r++) {
      const here = alive[r]!;
      if (here.n === 0n) continue;
      lasted = plus(lasted, here);

      if (since + 1 >= MYTHIC_PITY) {
        // The mythic floor. The cycle ends here and carries nothing forward.
        yielded = { ...yielded, mythic: plus(yielded.mythic, here) };
      } else if (r + 1 >= RARE_PITY) {
        // The rare floor: rare OR BETTER, so a rolled mythic still ends the
        // cycle and everything else is lifted to rare.
        const toRare = times(here, plus(pRare, pPlain));
        yielded = {
          ...yielded,
          mythic: plus(yielded.mythic, times(here, pMythic)),
          rare: plus(yielded.rare, toRare),
        };
        next[0] = plus(next[0]!, toRare);
      } else {
        yielded = {
          common: plus(yielded.common, times(here, share('common'))),
          uncommon: plus(yielded.uncommon, times(here, share('uncommon'))),
          rare: plus(yielded.rare, times(here, pRare)),
          mythic: plus(yielded.mythic, times(here, pMythic)),
        };
        next[0] = plus(next[0]!, times(here, pRare));
        next[r + 1] = plus(next[r + 1]!, times(here, pPlain));
      }
    }
    alive = next;
  }

  /*
    Into ten-thousandths. Largest remainder rather than plain rounding,
    because four numbers that each round on their own are four numbers that
    no longer sum to the total - and a published table that does not add up
    is the thing this whole file is trying not to be.
  */
  const parts = RARITIES.map((rarity) => {
    const q = times(times(yielded[rarity], { n: BigInt(WEIGHT_TOTAL), d: 1n }), { n: lasted.d, d: lasted.n });
    return { rarity, whole: q.n / q.d, remainder: q.n % q.d, over: q.d };
  });
  const short = BigInt(WEIGHT_TOTAL) - parts.reduce((t, part) => t + part.whole, 0n);
  const byRemainder = [...parts].sort((a, b) => {
    const left = a.remainder * b.over;
    const right = b.remainder * a.over;
    return left === right ? 0 : left > right ? -1 : 1;
  });
  const bumped = new Set(byRemainder.slice(0, Number(short)).map((part) => part.rarity));

  return Object.fromEntries(
    parts.map((part) => [part.rarity, Number(part.whole + (bumped.has(part.rarity) ? 1n : 0n))]),
  ) as Record<SpiritRarity, number>;
}

/**
 * The rates as a player meets them, floors and all. Ten-thousandths, summing
 * to `WEIGHT_TOTAL`, like the roll band above.
 */
export const RARITY_EFFECTIVE_WEIGHT: Record<SpiritRarity, number> = effectiveWeights();

/** The same, as the percentage printed on the screen. */
export const RARITY_EFFECTIVE_PERCENT: Record<SpiritRarity, number> = {
  common: RARITY_EFFECTIVE_WEIGHT.common / 100,
  uncommon: RARITY_EFFECTIVE_WEIGHT.uncommon / 100,
  rare: RARITY_EFFECTIVE_WEIGHT.rare / 100,
  mythic: RARITY_EFFECTIVE_WEIGHT.mythic / 100,
};

/** What a duplicate becomes, by the rarity of the duplicate. */
export const DUST_FROM_DUPLICATE: Record<SpiritRarity, number> = {
  common: 1, uncommon: 3, rare: 8, mythic: 20,
};

/**
 * What it costs to simply CHOOSE one, with no roll involved at all.
 *
 * The point of this door is that nothing in the collection is behind luck
 * alone: a traveller who wants one particular spirit can walk to it. It is
 * slow, and it is certain, and a collection with a certain path is not a
 * chase.
 */
export const DUST_TO_FORGE: Record<SpiritRarity, number> = {
  common: 10, uncommon: 25, rare: 60, mythic: 150,
};

export interface PityState {
  /** Summons since the last mythic. 0 on a fresh account and after every mythic. */
  sinceMythic: number;
  /** Summons since the last rare OR mythic. */
  sinceRare: number;
}

export interface Draw {
  spirit: Spirit;
  rarity: SpiritRarity;
  /** True when a floor decided the rarity rather than the roll. Printed on the receipt. */
  byPity: 'mythic' | 'rare' | null;
}

/**
 * Resolve one summon.
 *
 * Pure, total, and the only place a number becomes a creature. `roll` is an
 * integer in [0, 10000) for the rarity and `pick` an integer in [0, 2^32) for
 * which one of that rarity - both produced by `summon-service.ts` from a seed
 * it published a commitment to beforehand, so this function's output can be
 * recomputed by anybody holding the receipt.
 *
 * The floors are applied BEFORE the roll is read, and the roll is still
 * consumed, so a summon's inputs mean the same thing whether a floor fired
 * or not. A verifier that re-derived the inputs would otherwise go out of
 * step with the server on the first pity pull.
 */
export function drawSpirit(roll: number, pick: number, pity: PityState): Draw {
  let byPity: Draw['byPity'] = null;
  let rarity: SpiritRarity;

  if (pity.sinceMythic + 1 >= MYTHIC_PITY) {
    rarity = 'mythic';
    byPity = 'mythic';
  } else if (pity.sinceRare + 1 >= RARE_PITY) {
    // The floor guarantees RARE OR BETTER, so a mythic rolled on the same
    // summon still counts as a mythic. Clamping it down to rare would make
    // the floor a ceiling, which is the opposite of what it is for.
    rarity = rarityFromRoll(roll) === 'mythic' ? 'mythic' : 'rare';
    byPity = rarity === 'mythic' ? null : 'rare';
  } else {
    rarity = rarityFromRoll(roll);
  }

  const pool = spiritsOfRarity(rarity);
  const spirit = pool[pick % pool.length]!;
  return { spirit, rarity, byPity };
}

/** The published table, read in a fixed order so a reader can follow it. */
export function rarityFromRoll(roll: number): SpiritRarity {
  let at = 0;
  for (const rarity of RARITIES) {
    at += RARITY_WEIGHT[rarity];
    if (roll < at) return rarity;
  }
  // Unreachable while the weights sum to WEIGHT_TOTAL, which a test holds.
  return 'common';
}

/** The pity counters after a draw. Pure, so the service never keeps a running total of its own. */
export const advancePity = (pity: PityState, rarity: SpiritRarity): PityState => ({
  sinceMythic: rarity === 'mythic' ? 0 : pity.sinceMythic + 1,
  sinceRare: rarity === 'mythic' || rarity === 'rare' ? 0 : pity.sinceRare + 1,
});
