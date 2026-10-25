/**
 * The Summoning in the static demo (docs/68).
 *
 * The demo build has no server, and on this screen that matters more than
 * anywhere else: everything the summoning prints is a claim about fairness.
 * `/summon` was never in the capture, so the shim's unknown-route fallback
 * answered it, and a judge who tapped Summon at the public demo was shown
 * `Not in the demo build: GET /summon` - a developer's string, on the one
 * screen whose whole subject is that nothing here is hidden.
 *
 * So this answers it, with the real mechanism rather than a recorded outcome.
 *
 *   THE TABLE IS CORE'S. The rates, the weights, both floors, both dust
 *   tables and all twenty-four spirits are imported from `spirits.ts`, so
 *   the odds the demo prints are the odds the server prints and cannot drift
 *   from them. The draw is `drawSpirit` and the counters are `advancePity`:
 *   the same two functions `summon-service.ts` calls, given the same inputs
 *   in the same order.
 *
 *   THE COMMITMENT IS REAL, for the length of one sitting. A seed is drawn
 *   once, before any roll, and what the screen shows is SHA-256 of its hex -
 *   the same digest of the same string `commitmentOf` takes. Every roll is
 *   HMAC-SHA256(seed, "demo-user:<nonce>"), read exactly as `rollFor` reads
 *   it, so the outcomes were fixed by the seed before anybody tapped. The
 *   epoch stays OPEN and `seed` is therefore null, because an open round
 *   withholds its seed on the real server too.
 *
 *   WHAT IT IS NOT is a checkable round, and the demo must not pretend
 *   otherwise. Nobody outside this tab saw the commitment before the sitting
 *   began, and the seed sits in the same browser that rolls against it. That
 *   is strictly weaker than the server's promise, which is why
 *   `/summon/verify` is NOT answered here: the only honest verdict a static
 *   build could return is that there is nothing independent to recompute
 *   against, and a green tick that meant nothing would be worse than the
 *   screen never offering one.
 *
 *   THE CHARMS ARE NOT SEEDED. They are counted off the demo's own wallet
 *   ledger by the rule in `charmsFor`: one per host-verified quest, one per
 *   ISLAND DAY with a check-in, with the day read off the tail of the source
 *   ref rather than re-derived from a UTC timestamp - the same reason that
 *   function gives. The capture holds four verified quests and five days with
 *   a check-in, so the visitor opens on nine charms, and a check-in made in
 *   the demo on a day the capture does not already hold earns a tenth. Nine
 *   is enough to see the collection fill; the tenth is the one the rare floor
 *   lands on, so a judge who checks in first can watch a published guarantee
 *   fire rather than read about it.
 *
 * Nothing is stored. A reload is a new seed, an empty collection and nine
 * charms again, which is exactly what the DEMO strip promises.
 */

import {
  DUST_FROM_DUPLICATE, DUST_TO_FORGE, MYTHIC_PITY, RARE_PITY, RARITIES,
  RARITY_EFFECTIVE_PERCENT, RARITY_EFFECTIVE_WEIGHT, RARITY_PERCENT,
  RARITY_WEIGHT, SPIRITS, WEIGHT_TOTAL, advancePity, drawSpirit,
  type PityState, type SpiritRarity,
} from '@chivago/core';

/*
  The screen's own types, so this cannot answer a shape it does not read.

  Imported rather than restated: `client.ts` is what `SummonScreen` reads
  through, and a demo whose `/summon` was missing a field the screen prints
  would otherwise compile and then show an empty line at the pitch.
*/
import type { SpiritCard, SummonReceipt, SummonResult, SummonState } from '../api/client.ts';

/** One visitor, the same one the rest of the demo answers for. */
const USER = 'demo-user';

/**
 * The same shape `inquiries.ts` answers in, so server.ts's `settle` turns a
 * refusal here into the envelope the client already branches on.
 */
export type SummonAnswer<T> = { ok: true; value: T } | { ok: false; code: string; error: string };

/**
 * The three numbers and the one sentence in the published table that do NOT
 * live in core.
 *
 * `publishedRules()` in apps/api/src/summon-service.ts is where they belong -
 * charms are counted against the database there, so the constants went with
 * the counting. They are repeated here rather than imported because that file
 * is server code with `node:sqlite` behind it, and a web bundle cannot hold
 * it. Everything else in `PUBLISHED_RULES` comes from core, which is where
 * every number a roll depends on already was; if these three ever disagree
 * with the server, the server is right.
 */
const CHARM_PER_VERIFIED_QUEST = 1;
const CHARM_PER_CHECKIN_DAY = 1;
/* `EPOCH_HOURS`, repeated for the same reason: the rotation that publishes a
   seed runs against the database, so the constant lives with it. The demo
   never rotates - a reload is a new seed - but the screen prints this number
   in the sentence about when the seed comes out, and an undefined there is a
   blank at the pitch. */
const EPOCH_HOURS = 24;

const PUBLISHED_RULES = {
  /*
    THE EFFECTIVE TABLE, floors included - what `publishedRules()` serves as
    `rates`, and what the panel prints under the word "odds".

    This said `RARITY_PERCENT` when it was written, which was the roll band
    and was right for about an hour: the server changed in the same window
    (#134) and this file is the demo's copy of a table whose own docstring
    says the server is right when the two disagree. Neither pull request
    could see the clash - they touched no file in common, and each was green
    on its own - so the demo would have printed "Mythic 3%" to a judge while
    the live app printed 5.01%.
  */
  rates: RARITY_EFFECTIVE_PERCENT,
  effectiveWeights: RARITY_EFFECTIVE_WEIGHT,
  /* The roll band, under its own name, same as the server. */
  rollBand: RARITY_PERCENT,
  weights: RARITY_WEIGHT,
  weightTotal: WEIGHT_TOTAL,
  pity: { mythic: MYTHIC_PITY, rare: RARE_PITY },
  dustFromDuplicate: DUST_FROM_DUPLICATE,
  dustToForge: DUST_TO_FORGE,
  charmsFrom: { verifiedQuest: CHARM_PER_VERIFIED_QUEST, checkinDay: CHARM_PER_CHECKIN_DAY },
  epochHours: EPOCH_HOURS,
  notice: {
    en: 'A summon costs a charm you earned, never money. It yields a spirit and nothing else - no points, no vouchers, no prizes.',
    th: 'การอัญเชิญใช้เครื่องรางที่คุณสะสมเอง ไม่ใช่เงิน และได้เป็นภูตเท่านั้น ไม่มีแต้ม ไม่มีคูปอง ไม่มีของรางวัล',
    zh: '一次召唤消耗的是你赚得的护符，绝不是钱。它只会给你一只精灵，别无其他 - 没有积分、没有代金券、没有奖品。',
  },
} as const;

/** `NoCharms`'s own sentence, so the refusal reads the same as the server's. */
const NO_CHARMS = 'No charms yet. A charm comes from a host-verified quest, or from a day you checked in somewhere.';

// ---------------------------------------------------------------------------
// The seed, and the two numbers one summon needs
// ---------------------------------------------------------------------------

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * The seed's bytes, over an ArrayBuffer of their own.
 *
 * `new Uint8Array(numbers)` is typed over `ArrayBufferLike`, which includes a
 * SharedArrayBuffer, and WebCrypto will not take one - so the buffer is made
 * first and filled, rather than cast afterwards.
 */
const bytesOf = (hexString: string): Uint8Array<ArrayBuffer> => {
  const values = (hexString.match(/../g) ?? []).map((pair) => parseInt(pair, 16));
  const bytes = new Uint8Array(new ArrayBuffer(values.length));
  bytes.set(values);
  return bytes;
};

/**
 * SHA-256 of the seed's HEX STRING, not of its bytes.
 *
 * `commitmentOf` hashes the hex with `update(seed, 'utf8')`, and a commitment
 * computed over the raw bytes instead would be a different digest of the same
 * seed - published, unfalsifiable, and wrong.
 */
export const commitmentOf = async (seedHex: string): Promise<string> =>
  hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seedHex))));

/**
 * The roll, read off the digest exactly as `rollFor` reads it: the key is the
 * seed's 32 RAW bytes, the message is the traveller and the nonce joined by a
 * colon, the first four bytes choose the rarity band and the next four choose
 * within it. Any of those four details differing would make this a different
 * mechanic that merely looked the same.
 *
 * Exported, and `commitmentOf` with it, for the reason the server exports its
 * own: these two ARE the published mechanism, and a test that recomputes them
 * with `node:crypto` is the only thing standing between a comment claiming
 * HMAC-SHA256 and a demo quietly doing something else.
 */
export async function rollFor(seedHex: string, userId: string, nonce: number): Promise<{ roll: number; pick: number }> {
  const key = await crypto.subtle.importKey(
    'raw', bytesOf(seedHex), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${userId}:${nonce}`));
  const digest = hex(new Uint8Array(signed));
  return {
    roll: parseInt(digest.slice(0, 8), 16) % WEIGHT_TOTAL,
    pick: parseInt(digest.slice(8, 16), 16),
  };
}

// ---------------------------------------------------------------------------
// Charms, counted off the ledger the demo already has
// ---------------------------------------------------------------------------

/** A wallet row, as the snapshot and `credit` both write it. */
export type LedgerRow = Readonly<Record<string, unknown>>;

export type CharmBreakdown = SummonState['charms'];

export function charmsFrom(ledger: readonly LedgerRow[], spent: number): CharmBreakdown {
  const verifiedQuests = ledger.filter((r) => r.kind === 'quest_reward').length;

  /*
    The island day comes off the source ref, not off `occurredAt` - the same
    choice `charmsFor` makes and for the same reason. A check-in between
    midnight and 07:00 Bangkok is the day before in UTC, and re-deriving it
    here would hand the visitor a second charm for one evening.
  */
  const days = new Set<string>();
  for (const r of ledger) {
    if (r.kind !== 'checkin') continue;
    const ref = String(r.sourceRef ?? '');
    const at = ref.lastIndexOf(':');
    if (at > 0) days.add(ref.slice(at + 1));
  }

  const earned = verifiedQuests * CHARM_PER_VERIFIED_QUEST + days.size * CHARM_PER_CHECKIN_DAY;
  return {
    verifiedQuests,
    checkinDays: days.size,
    earned,
    spent,
    available: Math.max(0, earned - spent),
  };
}

// ---------------------------------------------------------------------------
// The sitting
// ---------------------------------------------------------------------------

interface Pull {
  id: string;
  at: string;
  epochId: string;
  nonce: number;
  roll: number;
  pick: number;
  spiritKey: string;
  rarity: SpiritRarity;
  byPity: 'mythic' | 'rare' | null;
  duplicate: boolean;
  dust: number;
}

interface Epoch {
  id: string;
  seed: string;
  commitment: string;
  openedAt: string;
}

/**
 * Open the summoning for one sitting.
 *
 * `ledgerNow` is read on every call rather than captured once, because the
 * demo's ledger grows: checking in during the demo appends a row, and the
 * charm it earns has to show up here without anything telling it to.
 */
export function createSummoning(ledgerNow: () => readonly LedgerRow[], opened: Date = new Date()) {
  const pulls: Pull[] = [];

  /*
    Drawn on first use, not at install. Lazy for the reason `currentEpoch` is
    lazy - a fresh database, a test and a replica all behave the same - and
    harmless here because the commitment is computed from the same seed every
    roll afterwards reads. Held as the promise so two screens mounting at once
    cannot open two epochs.
  */
  let epoch: Promise<Epoch> | null = null;
  const openEpoch = (): Promise<Epoch> => (epoch ??= (async () => {
    const seed = hex(crypto.getRandomValues(new Uint8Array(32)));
    return {
      id: crypto.randomUUID(),
      seed,
      commitment: await commitmentOf(seed),
      openedAt: opened.toISOString(),
    };
  })());

  /** Keys drawn this sitting, and how many of each. Derived, never stored. */
  const held = (): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const p of pulls) counts.set(p.spiritKey, (counts.get(p.spiritKey) ?? 0) + 1);
    return counts;
  };

  const dust = (): number => pulls.reduce((n, p) => n + p.dust, 0);

  /** The counters, folded over the rolls in the order they were made. */
  const pity = (): PityState =>
    pulls.reduce<PityState>((p, r) => advancePity(p, r.rarity), { sinceMythic: 0, sinceRare: 0 });

  /**
   * Charms committed this sitting, a roll still in flight included.
   *
   * Counted off `taken` rather than off `pulls`, which is what makes the
   * check below safe without a transaction: a charm is spent the moment the
   * tap is accepted, not when the HMAC comes back, so two taps cannot both
   * read "you have one charm" across the await in between.
   */
  let taken = 0;
  const charms = (): CharmBreakdown => charmsFrom(ledgerNow(), taken);

  return {
    /** `GET /summon`: the state and the whole published table. */
    async state(): Promise<SummonState> {
      const e = await openEpoch();
      const mine = held();
      return {
        charms: charms(),
        dust: dust(),
        pity: pity(),
        collected: mine.size,
        total: SPIRITS.length,
        // Cast because `fromEntries` is typed over string keys and cannot
        // know `RARITIES` covers every one of them. A test asserts it does,
        // which is the only thing that would make this cast a lie.
        byRarity: Object.fromEntries(
          RARITIES.map((r) => [r, {
            held: SPIRITS.filter((s) => s.rarity === r && mine.has(s.key)).length,
            total: SPIRITS.filter((s) => s.rarity === r).length,
          }]),
        ) as SummonState['byRarity'],
        // Open, and so without its seed. The demo never closes a round: there
        // is nobody to publish one to and nothing that outlives the tab.
        epoch: { id: e.id, commitment: e.commitment, openedAt: e.openedAt, closedAt: null, seed: null },
        rules: PUBLISHED_RULES,
      };
    },

    /**
     * `GET /summon/collection`: every spirit, named only once it has been met.
     *
     * The silhouette matters in a demo more than anywhere: a judge should see
     * what a collection looks like before it is full, and a full field guide
     * handed over at the door would show the opposite of what the screen is
     * for.
     */
    collection(): SpiritCard[] {
      const mine = held();
      return SPIRITS.map((s) => ({
        key: s.key,
        court: s.court,
        rarity: s.rarity,
        held: mine.get(s.key) ?? 0,
        ...(mine.has(s.key) ? { name: s.name, creature: s.creature, lore: s.lore, form: s.form } : {}),
      }));
    },

    /** `GET /summon/history`: this sitting's receipts, newest first. */
    history(limit = 50): SummonReceipt[] {
      return [...pulls].reverse().slice(0, limit).map((p) => ({
        id: p.id,
        at: p.at,
        source: 'summon' as const,
        spiritKey: p.spiritKey,
        rarity: p.rarity,
        byPity: p.byPity,
        duplicate: p.duplicate,
        dust: p.dust,
        receipt: { epochId: p.epochId, nonce: p.nonce, roll: p.roll, pick: p.pick },
      }));
    },

    /**
     * `POST /summon`: spend one charm, draw one spirit.
     *
     * No transaction and no unique index on (user, epoch, nonce), because
     * there is one visitor and one tab. What takes their place is that the
     * charm and the nonce are both claimed in the same synchronous step as
     * the check, before the first await: the server leans on SQLite for that
     * and this leans on the one thread it has.
     *
     * The ORDER is the real inheritance. The pity read here is the pity
     * BEFORE this roll, and the roll is consumed even when a floor fires -
     * exactly as `drawSpirit` documents, and for the same reason.
     */
    async pull(now: Date = new Date()): Promise<SummonAnswer<SummonResult>> {
      if (charms().available < 1) return { ok: false, code: 'NO_CHARMS', error: NO_CHARMS };
      const nonce = (taken += 1);

      const e = await openEpoch();
      const { roll, pick } = await rollFor(e.seed, USER, nonce);
      const drawn = drawSpirit(roll, pick, pity());

      const duplicate = held().has(drawn.spirit.key);
      const dustGained = duplicate ? DUST_FROM_DUPLICATE[drawn.rarity] : 0;
      const id = crypto.randomUUID();

      pulls.push({
        id, at: now.toISOString(), epochId: e.id, nonce, roll, pick,
        spiritKey: drawn.spirit.key, rarity: drawn.rarity, byPity: drawn.byPity,
        duplicate, dust: dustGained,
      });

      return {
        ok: true,
        value: {
          id,
          spirit: drawn.spirit,
          rarity: drawn.rarity,
          byPity: drawn.byPity,
          duplicate,
          dustGained,
          dust: dust(),
          charms: charms(),
          pity: pity(),
          receipt: { epochId: e.id, commitment: e.commitment, nonce, roll, pick },
        },
      };
    },
  };
}
