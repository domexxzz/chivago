import { strict as assert } from 'node:assert';
import { test } from 'node:test';

delete process.env.CHIVAGO_OPEN_IDENTITY;
process.env.CHIVAGO_DB = ':memory:';

const { app } = await import('./server-node.ts');

const json = async (response: Response) => (await response.json()) as { ok: boolean; data?: any; code?: string };

test('the HTTP community flow publishes media, likes, comments and shares', async () => {
  const register = async (name: string) => {
    const response = await json(await app.request('/devices', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: name }),
    }));
    return { key: response.data.deviceKey as string, userId: response.data.userId as string };
  };
  const ana = await register('Ana');
  const bo = await register('Bo');
  const auth = (key: string) => ({ 'x-chivago-device-key': key });

  const form = new FormData();
  form.append('body', 'Ferry sunset');
  form.append('file', new File([
    Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(20, 1)]),
  ], 'sunset.jpg', { type: 'image/jpeg' }));
  const created = await json(await app.request('/community/posts', { method: 'POST', headers: auth(ana.key), body: form }));
  assert.equal(created.ok, true);
  const postId = created.data.id as string;

  assert.equal((await json(await app.request(`/community/posts/${postId}/like`, { method: 'POST', headers: auth(bo.key) }))).data.liked, true);
  const comment = await json(await app.request(`/community/posts/${postId}/comments`, {
    method: 'POST', headers: { ...auth(bo.key), 'content-type': 'application/json' }, body: JSON.stringify({ body: 'Beautiful light' }),
  }));
  assert.equal(comment.data.author.displayName, 'Bo');
  assert.equal((await json(await app.request(`/community/posts/${postId}/share`, { method: 'POST', headers: auth(ana.key) }))).data.shareCount, 1);

  const feed = await json(await app.request('/community/feed', { headers: auth(bo.key) }));
  assert.equal(feed.data.posts[0].body, 'Ferry sunset');
  assert.equal(feed.data.posts[0].likedByMe, true);
  assert.equal(feed.data.posts[0].commentCount, 1);
  assert.equal(feed.data.posts[0].shareCount, 1);

  // Media is intentionally public so <Image> and the native video player can
  // fetch it without exposing a device credential in a URL.
  const media = await app.request(`/community/media/${postId}`);
  assert.equal(media.status, 200);
  assert.equal(media.headers.get('content-type'), 'image/jpeg');
  assert.equal((await media.arrayBuffer()).byteLength, 23);
});
