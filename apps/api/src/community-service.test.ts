import { strict as assert } from 'node:assert';
import { beforeEach, describe, test } from 'node:test';

import { openTestDb, type DB } from './db-node.ts';
import {
  InvalidCommunityMedia, InvalidCommunityPost, addCommunityComment, communityMediaMime,
  createCommunityPost, listCommunityFeed, readCommunityMedia, recordCommunityShare, toggleCommunityLike,
} from './community-service.ts';

let db: DB;
const now = new Date('2026-11-13T04:00:00.000Z');
const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(24, 1)]);

beforeEach(() => {
  db = openTestDb();
  for (const [id, name] of [['ana', 'Ana'], ['bo', 'Bo']]) {
    db.prepare('INSERT INTO users(id,display_name,created_at) VALUES(?,?,?)').run(id, name, now.toISOString());
  }
});

describe('community posts', () => {
  test('lists real authors, text and media newest first', () => {
    const first = createCommunityPost(db, 'ana', { body: 'Hello island' }, now);
    const second = createCommunityPost(db, 'bo', { body: '', media: jpeg() }, new Date(now.getTime() + 1000));
    const feed = listCommunityFeed(db, 'ana');
    assert.deepEqual(feed.map((p) => p.id), [second.id, first.id]);
    assert.equal(feed[1]?.author.displayName, 'Ana');
    assert.equal(feed[0]?.media?.kind, 'image');
    assert.deepEqual(Buffer.from(readCommunityMedia(db, second.id)!.bytes), jpeg());
  });

  test('requires words or media and verifies bytes instead of trusting a filename', () => {
    assert.throws(() => createCommunityPost(db, 'ana', { body: '   ' }), InvalidCommunityPost);
    assert.equal(communityMediaMime(jpeg()), 'image/jpeg');
    assert.throws(() => communityMediaMime(Buffer.from('%PDF')), InvalidCommunityMedia);
  });
});

describe('community conversations', () => {
  test('likes toggle once per person, comments retain authors, and shares are counted', () => {
    const post = createCommunityPost(db, 'ana', { body: 'Low tide walk' }, now);
    assert.deepEqual(toggleCommunityLike(db, post.id, 'bo', now), { liked: true, likeCount: 1 });
    assert.deepEqual(toggleCommunityLike(db, post.id, 'bo', now), { liked: false, likeCount: 0 });
    addCommunityComment(db, post.id, 'bo', 'Looks lovely', now);
    assert.equal(recordCommunityShare(db, post.id), 1);
    const refreshed = listCommunityFeed(db, 'ana')[0]!;
    assert.equal(refreshed.comments[0]?.author.displayName, 'Bo');
    assert.equal(refreshed.commentCount, 1);
    assert.equal(refreshed.shareCount, 1);
  });
});
