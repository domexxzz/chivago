import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { BOARD_MAX, boardCounts, boardFeed, type BoardEntry } from './board.ts';

/**
 * The board is the one screen where separate accounts meet, so the order it
 * puts them in is the whole product: a feed that reshuffles between two
 * fetches reads as broken, and one ordered by which query answered first
 * reads as random.
 */
const story = (id: string, at: string): BoardEntry => ({
  kind: 'story', id, at, placeId: 'ku-viewpoint',
  placeName: { en: 'Sapandao viewpoint', th: 'จุดชมวิวสะพานดาว' },
  media: 'video', caption: 'the lake at six', mediaUrl: `/m/${id}`, posterUrl: `/p/${id}`,
});

const review = (id: string, at: string, rating = 5): BoardEntry => ({
  kind: 'review', id, at, placeId: 'ku-shops',
  placeName: { en: 'Shop row by building 25', th: 'ร้านค้าข้างอาคาร 25' },
  rating, body: 'good coffee', authorName: 'Ana', language: 'en',
});

describe('the board', () => {
  test('newest first, whichever kind it is', () => {
    const feed = boardFeed([
      review('r1', '2026-09-08T10:00:00.000Z'),
      story('s1', '2026-09-08T12:00:00.000Z'),
      review('r2', '2026-09-08T11:00:00.000Z'),
    ]);
    assert.deepEqual(feed.map((e) => e.id), ['s1', 'r2', 'r1']);
  });

  test('a review between two clips sits between them', () => {
    // Ordered by when it HAPPENED, not by which query returned it.
    const feed = boardFeed([
      story('s1', '2026-09-08T12:00:00.000Z'),
      story('s2', '2026-09-08T09:00:00.000Z'),
      review('r1', '2026-09-08T10:30:00.000Z'),
    ]);
    assert.deepEqual(feed.map((e) => e.id), ['s1', 'r1', 's2']);
  });

  test('two entries in the same second do not swap places between fetches', () => {
    const same = '2026-09-08T12:00:00.000Z';
    const a = boardFeed([story('b', same), review('a', same)]);
    const b = boardFeed([review('a', same), story('b', same)]);
    assert.deepEqual(a.map((e) => e.id), b.map((e) => e.id));
  });

  test('a board is capped, because nobody finishes an endless scroll', () => {
    const many = Array.from({ length: BOARD_MAX + 20 }, (_, i) =>
      review(`r${String(i).padStart(3, '0')}`, new Date(Date.now() - i * 60_000).toISOString()));
    assert.equal(boardFeed(many).length, BOARD_MAX);
  });

  test('an empty area has an empty board, not a placeholder', () => {
    assert.deepEqual(boardFeed([]), []);
    assert.deepEqual(boardCounts([]), { stories: 0, reviews: 0 });
  });

  test('the counts say how much of each is really there', () => {
    const counts = boardCounts([story('s1', '2026-09-08T12:00:00.000Z'), review('r1', '2026-09-08T11:00:00.000Z'), review('r2', '2026-09-08T10:00:00.000Z')]);
    assert.deepEqual(counts, { stories: 1, reviews: 2 });
  });

  test('the input is not mutated - the caller keeps its own list', () => {
    const input = [review('r1', '2026-09-08T10:00:00.000Z'), story('s1', '2026-09-08T12:00:00.000Z')];
    boardFeed(input);
    assert.deepEqual(input.map((e) => e.id), ['r1', 's1']);
  });
});
