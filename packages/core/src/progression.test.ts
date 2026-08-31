import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  expAtLevel,
  expToAdvance,
  levelFor,
  levelProgressPct,
  nextRankFor,
  progressionFor,
  RANKS,
  rankFor,
  rankLadder,
} from './progression.ts';

describe('the level curve', () => {
  test('reproduces the figure on the pitch deck', () => {
    // The deck shows "Level 12 · Island Explorer · 2,480 / 3,900 EXP". If the
    // curve does not produce that, the slide and the app disagree in front of
    // a judge.
    const p = progressionFor(expAtLevel(12) + 2480);
    assert.equal(p.level, 12);
    assert.equal(p.rank.label.en, 'Island Explorer');
    assert.equal(p.intoLevel, 2480);
    assert.equal(p.levelSpan, 3900);
  });

  test('a new traveller is level 1, not level 0', () => {
    assert.equal(levelFor(0), 1);
    assert.equal(expAtLevel(1), 0);
  });

  test('each level costs a little more than the last', () => {
    for (let l = 1; l < 40; l += 1) {
      assert.ok(
        expToAdvance(l + 1) > expToAdvance(l),
        `level ${l + 1} must cost more than ${l}`,
      );
    }
  });

  test('expAtLevel and expToAdvance agree at every boundary', () => {
    for (let l = 1; l < 60; l += 1) {
      assert.equal(
        expAtLevel(l + 1) - expAtLevel(l),
        expToAdvance(l),
        `span of level ${l}`,
      );
    }
  });

  test('the boundary lands on the right level, not one either side', () => {
    for (let l = 1; l < 60; l += 1) {
      assert.equal(levelFor(expAtLevel(l)), l, `exactly at level ${l}`);
      assert.equal(levelFor(expAtLevel(l) - 1), l - 1 || 1, `one EXP short of ${l}`);
      assert.equal(levelFor(expAtLevel(l) + 1), l, `one EXP past ${l}`);
    }
  });

  test('never goes backwards as EXP rises', () => {
    let last = 0;
    for (let exp = 0; exp < 400_000; exp += 917) {
      const level = levelFor(exp);
      assert.ok(level >= last, `EXP ${exp} dropped from ${last} to ${level}`);
      last = level;
    }
  });

  test('survives nonsense without throwing', () => {
    assert.equal(levelFor(-500), 1);
    assert.equal(levelFor(Number.NaN), 1);
    assert.equal(progressionFor(-1).exp, 0);
    assert.equal(progressionFor(Number.POSITIVE_INFINITY).exp, 0);
  });
});

describe('ranks', () => {
  test('the five ranks are the ones on the deck, in order', () => {
    assert.deepEqual(
      RANKS.map((r) => r.label.en),
      ['Newcomer', 'Wanderer', 'Island Explorer', 'Samui Insider', 'Chiva Legend'],
    );
  });

  test('every rank is bilingual - the app shows both languages', () => {
    for (const rank of RANKS) {
      assert.ok(rank.label.en.length > 0, `${rank.key} en`);
      assert.ok(rank.label.th.length > 0, `${rank.key} th`);
    }
  });

  test('carries no emoji - Modernist forbids them', () => {
    for (const rank of RANKS) {
      assert.ok(!('emoji' in rank));
      assert.match(rank.label.en, /^[A-Za-z ]+$/);
    }
  });

  test('rank bands do not overlap or leave a gap', () => {
    for (let level = 1; level <= 60; level += 1) {
      const rank = rankFor(level);
      const next = nextRankFor(level);
      assert.ok(level >= rank.fromLevel, `level ${level} below its own band`);
      if (next) assert.ok(level < next.fromLevel, `level ${level} inside the next band`);
    }
  });

  test('the top rank has no next rank', () => {
    assert.equal(nextRankFor(999), null);
    assert.equal(rankFor(999).label.en, 'Chiva Legend');
  });

  test('the ladder always shows all five, with earned derived', () => {
    const ladder = rankLadder(12);
    assert.equal(ladder.length, 5);
    assert.deepEqual(ladder.map((r) => r.earned), [true, true, true, false, false]);
  });
});

describe('the level bar', () => {
  test('stays within 0-100 at every EXP total', () => {
    for (let exp = 0; exp < 200_000; exp += 331) {
      const pct = levelProgressPct(exp);
      assert.ok(pct >= 0 && pct <= 100, `EXP ${exp} gave ${pct}`);
    }
  });

  test('reads 0 the moment a level is reached, not 100', () => {
    // The prototype's points/2500 pins at 100% forever past 2500. A bar that
    // is always full tells the user nothing.
    for (const level of [2, 5, 12, 20, 35]) {
      assert.equal(levelProgressPct(expAtLevel(level)), 0, `arriving at level ${level}`);
    }
  });

  test('reads about half at the midpoint of a level', () => {
    const mid = expAtLevel(12) + Math.floor(expToAdvance(12) / 2);
    assert.equal(levelProgressPct(mid), 50);
  });
});
