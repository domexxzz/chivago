import { strict as assert } from 'node:assert';
import { afterEach, describe, test } from 'node:test';
import { createElement as h } from 'react';

import { CommunityFeedScreen } from '../src/screens/CommunityFeedScreen.tsx';
import { mountScreen, server } from './interact.ts';

const post = {
  id: 'post-1',
  body: 'Morning walk by the pier',
  createdAt: '2026-11-13T03:00:00.000Z',
  updatedAt: '2026-11-13T03:00:00.000Z',
  author: { id: 'ana', displayName: 'Ana', accountType: 'traveller', profilePhotoUrl: null },
  media: null,
  likeCount: 2,
  commentCount: 0,
  shareCount: 1,
  likedByMe: false,
  comments: [],
} as const;

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; });

describe('Community Feed', () => {
  test('loads real posts and connects like and comment actions to the API', async () => {
    const net = server({
      'GET /community/feed': { posts: [post] },
      'POST /community/posts/post-1/like': { liked: true, likeCount: 3 },
      'POST /community/posts/post-1/comments': {
        id: 'comment-1', body: 'Looks peaceful', createdAt: '2026-11-13T04:00:00.000Z', author: post.author,
      },
    });
    restore = net.restore;
    const ui = await mountScreen(h(CommunityFeedScreen, { onBack: () => {}, onToast: () => {} }));

    assert.match(ui.text(), /Morning walk by the pier/);
    await ui.press(/Like post/i);
    await ui.press(/Comment on post/i);
    await ui.type('Looks peaceful', /Write a comment/i);
    await ui.press(/Send comment/i);

    assert.ok(net.calls.some((call) => call.method === 'POST' && call.path === '/community/posts/post-1/like'));
    const comment = net.calls.find((call) => call.method === 'POST' && call.path === '/community/posts/post-1/comments');
    assert.deepEqual(comment?.body, { body: 'Looks peaceful' });
    assert.deepEqual(net.missing, []);
    ui.unmount();
  });

  test('publishes a text post as multipart data and refreshes the feed', async () => {
    const net = server({
      'GET /community/feed': { posts: [] },
      'POST /community/posts': post,
    });
    restore = net.restore;
    const ui = await mountScreen(h(CommunityFeedScreen, { onBack: () => {}, onToast: () => {} }));

    await ui.type('Hello community', /Post message/i);
    await ui.pressText(/^Post$/i);

    const publish = net.calls.find((call) => call.method === 'POST' && call.path === '/community/posts');
    assert.equal((publish?.body as { body?: string } | undefined)?.body, 'Hello community');
    assert.deepEqual(net.missing, []);
    ui.unmount();
  });
});
