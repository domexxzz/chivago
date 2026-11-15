import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { installDemoServer } from '../src/demo/server.ts';

const restores: Array<() => void> = [];
afterEach(() => { while (restores.length > 0) restores.pop()!(); });

describe('guest presentation sandbox', () => {
  test('sleeps for members and never lets an unknown guest write reach the real API', async () => {
    let active = false;
    const realCalls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      realCalls.push(String(input));
      return new Response(JSON.stringify({ ok: true, data: { live: true } }), {
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    restores.push(() => { globalThis.fetch = original; });
    restores.push(installDemoServer('https://api.example', {
      active: () => active,
      fallThroughUnknownReads: true,
    }));

    await fetch('https://api.example/member-read');
    assert.equal(realCalls.length, 1, 'signed-in traffic is untouched');

    active = true;
    const response = await fetch('https://api.example/new-mutation', { method: 'POST', body: '{}' });
    const body = await response.json() as { ok: boolean; code: string };
    assert.equal(body.ok, false);
    assert.equal(body.code, 'DEMO_ROUTE');
    assert.equal(realCalls.length, 1, 'an unknown guest write never reaches the deployed API');
  });

  test('posts, likes and comments live in memory for the presentation session', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true, data: { posts: [] } }), {
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
    restores.push(() => { globalThis.fetch = original; });
    restores.push(installDemoServer('https://api.example', {
      active: () => true,
      fallThroughUnknownReads: true,
    }));

    const form = new FormData();
    form.append('body', 'Hello from the demo');
    const created = await (await fetch('https://api.example/community/posts', { method: 'POST', body: form })).json() as {
      data: { id: string };
    };
    const id = created.data.id;
    await fetch(`https://api.example/community/posts/${id}/like`, { method: 'POST', body: '{}' });
    await fetch(`https://api.example/community/posts/${id}/comments`, {
      method: 'POST', body: JSON.stringify({ body: 'Looks great' }),
    });

    const feed = await (await fetch('https://api.example/community/feed')).json() as {
      data: { posts: Array<{ id: string; likedByMe: boolean; comments: Array<{ body: string }> }> };
    };
    const post = feed.data.posts.find((item) => item.id === id);
    assert.equal(post?.likedByMe, true);
    assert.equal(post?.comments[0]?.body, 'Looks great');
  });
});
