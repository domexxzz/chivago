/**
 * EXP, levels and ranks.
 *
 * THE decision this file encodes: EXP is NOT a spendable balance.
 *
 * The obvious shortcut is to derive level from the points a user holds. It is
 * also wrong, and wrong in a way that punishes the exact behaviour the product
 * wants: redeem a voucher and you would be demoted. Progress you can lose by
 * spending is not progress, and a traveller who drops from Island Explorer to
 * Wanderer because they bought a coffee will not spend again.
 *
 * So: EXP is lifetime and monotonic. It only ever goes up, it is never spent,
 * and it is granted alongside - never instead of - the spendable currencies.
 *
 * The curve. Advancing from level L costs `300 * (L + 1)` EXP, so each level
 * costs a little more than the last without the wall a geometric curve builds.
 * Level 12 therefore spans 3,900 EXP, which is the figure the pitch deck shows.
 */

import type { Bilingual } from './types.ts';

/** EXP needed to advance FROM this level to the next. */
export const expToAdvance = (level: number): number => 300 * (level + 1);

/**
 * Total lifetime EXP at which a user becomes `level`.
 * Closed form of the running sum, so no loop is needed to place a balance.
 */
export const expAtLevel = (level: number): number =>
  300 * ((level * (level + 1)) / 2 - 1);

/**
 * The five ranks, from the pitch deck's Game Layer slide.
 *
 * A rank is a BAND of levels, not a level. The deck shows "Level 12 · Island
 * Explorer", so the two are displayed together and must not be conflated: the
 * level is the number that moves every session, the rank is the name that
 * changes rarely enough to feel earned.
 */
export const RANKS = [
  { index: 1, key: 'newcomer', label: { en: 'Newcomer', th: 'ผู้มาใหม่' }, fromLevel: 1 },
  { index: 2, key: 'wanderer', label: { en: 'Wanderer', th: 'นักเดินทาง' }, fromLevel: 5 },
  { index: 3, key: 'islandExplorer', label: { en: 'Island Explorer', th: 'นักสำรวจเกาะ' }, fromLevel: 10 },
  { index: 4, key: 'samuiInsider', label: { en: 'Samui Insider', th: 'คนในสมุย' }, fromLevel: 20 },
  { index: 5, key: 'chivaLegend', label: { en: 'Chiva Legend', th: 'ตำนานชีวา' }, fromLevel: 35 },
] as const;

export type Rank = (typeof RANKS)[number];
export type RankKey = Rank['key'];

/** The level a lifetime EXP total sits at. Never below 1. */
export function levelFor(exp: number): number {
  if (!Number.isFinite(exp) || exp <= 0) return 1;
  // Invert expAtLevel: 150·L·(L+1) − 300 ≤ exp  ⇒  L(L+1) ≤ (exp+300)/150.
  const k = (exp + 300) / 150;
  let level = Math.floor((Math.sqrt(1 + 4 * k) - 1) / 2);
  // sqrt is not exact at the boundaries, so settle the last step in integers
  // rather than trusting the float. At most one iteration either way.
  while (expAtLevel(level + 1) <= exp) level += 1;
  while (level > 1 && expAtLevel(level) > exp) level -= 1;
  return Math.max(1, level);
}

export const rankFor = (level: number): Rank => {
  let current: Rank = RANKS[0]!;
  for (const rank of RANKS as readonly Rank[]) {
    if (level >= rank.fromLevel) current = rank;
  }
  return current;
};

export const nextRankFor = (level: number): Rank | null =>
  (RANKS as readonly Rank[]).find((r) => level < r.fromLevel) ?? null;

/** One square of the rank ladder, as the wallet screen draws it. */
export interface RankState {
  index: number;
  key: RankKey;
  label: Bilingual;
  fromLevel: number;
  earned: boolean;
}

export const rankLadder = (level: number): RankState[] =>
  RANKS.map((r) => ({
    index: r.index,
    key: r.key,
    label: r.label,
    fromLevel: r.fromLevel,
    earned: level >= r.fromLevel,
  }));

/** Everything the UI needs to draw the level bar and the rank name. */
export interface Progression {
  /** Lifetime EXP. Monotonic. */
  exp: number;
  level: number;
  /** EXP earned inside the current level. */
  intoLevel: number;
  /** EXP the current level spans, i.e. the bar's denominator. */
  levelSpan: number;
  rank: { index: number; key: RankKey; label: Bilingual };
  nextRank: { index: number; key: RankKey; label: Bilingual } | null;
  /** Level at which the next rank unlocks. Null at the top. */
  nextRankAtLevel: number | null;
  ladder: RankState[];
}

export function progressionFor(exp: number): Progression {
  const safe = Number.isFinite(exp) && exp > 0 ? Math.floor(exp) : 0;
  const level = levelFor(safe);
  const next = nextRankFor(level);
  const rank = rankFor(level);
  return {
    exp: safe,
    level,
    intoLevel: safe - expAtLevel(level),
    levelSpan: expToAdvance(level),
    rank: { index: rank.index, key: rank.key, label: rank.label },
    nextRank: next ? { index: next.index, key: next.key, label: next.label } : null,
    nextRankAtLevel: next?.fromLevel ?? null,
    ladder: rankLadder(level),
  };
}

/** Level bar fill, 0-100. */
export const levelProgressPct = (exp: number): number => {
  const p = progressionFor(exp);
  return Math.min(100, Math.max(0, Math.round((p.intoLevel / p.levelSpan) * 100)));
};
