import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FEATURED_PLACES, featuredFirst, hasFeatured, isFeatured } from './featured.ts';
import { SEED_PLACES } from './seed.ts';

const list = (...ids: string[]) => ids.map((id) => ({ id }));
const ids = (places: { id: string }[]) => places.map((p) => p.id);

test('every pinned place is a seeded place, pinned once', () => {
  for (const id of FEATURED_PLACES) {
    assert.ok(SEED_PLACES.some((p) => p.id === id), `${id} is a seeded place`);
  }
  assert.equal(new Set(FEATURED_PLACES).size, FEATURED_PLACES.length, 'each place is pinned once');
});

test('a pinned place is known as pinned, and nothing else is', () => {
  assert.equal(isFeatured('sinthani-badminton'), true);
  for (const id of ['chaweng', 'rmutt-canteen', 'constructor', '__proto__', '']) {
    assert.equal(isFeatured(id), false, id);
  }
});

test('the pinned place goes to the front', () => {
  assert.deepEqual(
    ids(featuredFirst(list('chaweng', 'rmutt-canteen', 'sinthani-badminton'))),
    ['sinthani-badminton', 'chaweng', 'rmutt-canteen'],
  );
});

test('everything else keeps the order it arrived in, so nearest-first still holds for them', () => {
  // This is the whole reason the header can still say "then nearest": the
  // unpinned places are not reordered, only moved down as a block.
  const incoming = list('a', 'b', 'sinthani-badminton', 'c', 'd');
  assert.deepEqual(ids(featuredFirst(incoming)), ['sinthani-badminton', 'a', 'b', 'c', 'd']);
  const reversed = list('d', 'c', 'sinthani-badminton', 'b', 'a');
  assert.deepEqual(ids(featuredFirst(reversed)), ['sinthani-badminton', 'd', 'c', 'b', 'a']);
});

test('a list without the pinned place is returned unchanged', () => {
  const incoming = list('chaweng', 'rmutt-canteen', 'ku-bk-library');
  assert.deepEqual(ids(featuredFirst(incoming)), ['chaweng', 'rmutt-canteen', 'ku-bk-library']);
  assert.deepEqual(ids(featuredFirst([])), []);
});

test('it copies rather than reordering the caller\'s list in place', () => {
  const incoming = list('chaweng', 'sinthani-badminton');
  const out = featuredFirst(incoming);
  assert.deepEqual(ids(incoming), ['chaweng', 'sinthani-badminton'], 'the caller\'s array is untouched');
  assert.notEqual(out, incoming);
});

test('a header can tell whether it must stop claiming nearest-first', () => {
  assert.equal(hasFeatured(list('chaweng', 'sinthani-badminton')), true);
  assert.equal(hasFeatured(list('chaweng', 'rmutt-canteen')), false);
  assert.equal(hasFeatured([]), false);
});

test('pinning is placement only - it never touches what a place scored', () => {
  // The pinned place carries its own fields through untouched; nothing here
  // may promote a score to justify the position.
  const scored = [{ id: 'chaweng', score: 91 }, { id: 'sinthani-badminton', score: 62 }];
  const out = featuredFirst(scored);
  assert.deepEqual(out[0], { id: 'sinthani-badminton', score: 62 });
  assert.deepEqual(out[1], { id: 'chaweng', score: 91 });
});
