/**
 * The photograph has to actually leave the phone.
 *
 * `submitProof` posted JSON for the whole life of the feature. The payload
 * carries `uri` — a path on the device — so the server's JSON branch recorded
 * a proof row with a filename it could never open, `proof_files` stayed empty,
 * and the host console drew `<img src="…">` with nothing behind it. The host
 * is the person who decides whether the work happened; a host looking at a
 * blank square is the one failure this product cannot absorb.
 *
 * Every one of these fails on the JSON version, which is the only reason to
 * write them. The first fails loudest: the body was a string.
 *
 * WHAT THESE DO NOT PROVE: that a real phone's `file://` path survives React
 * Native's FormData. `Platform.OS` is `web` in this harness, so the web branch
 * is the one exercised here; the native branch is the same two lines used by
 * `uploadShopImage` and `tellStory`, and a device run is still owed.
 */

import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { api } from '../src/api/client.ts';
import { __setCachedKeyForTests } from '../src/api/account.ts';

const POSITION = { lat: 9.5357, lng: 100.0617, accuracyM: 12, mocked: false };

const PHOTOS = [
  { uri: 'blob:photo-one', lat: 9.5358, lng: 100.0618, takenAt: '2026-11-14T09:05:00.000Z' },
  { uri: 'blob:photo-two', lat: null, lng: null, takenAt: null },
];

/** The bytes the picker is pretending to hold, one distinct body per uri. */
const BYTES: Record<string, string> = {
  'blob:photo-one': 'jpeg-bytes-one',
  'blob:photo-two': 'jpeg-bytes-two',
};

type Sent = { body: unknown; headers: Record<string, string>; url: string };

/**
 * One stub for two different fetches: the client reads each picked photo
 * through `fetch(uri)` on web, and then posts the form. Both arrive here.
 */
function net(options: { photoFails?: boolean } = {}) {
  const original = globalThis.fetch;
  const sent: Sent[] = [];
  const read: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input);
    if (url.startsWith('blob:')) {
      read.push(url);
      if (options.photoFails) throw new Error('the blob URL was revoked');
      return { ok: true, status: 200, blob: async () => new Blob([BYTES[url] ?? '']) } as unknown as Response;
    }
    sent.push({ body: init?.body, headers: (init?.headers ?? {}) as Record<string, string>, url });
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: { progress: { stage: 'host_verification' }, proofId: 'p_1' } }),
    } as Response;
  }) as typeof fetch;
  return { sent, read, restore: () => { globalThis.fetch = original; } };
}

const submit = (weightKg: number | null = 4.2) =>
  api.submitProof('q_sc01', { photos: PHOTOS, weightKg, position: POSITION });

/** The one request that went to the API, as a form. */
const formOf = (sent: Sent[]): FormData => {
  assert.equal(sent.length, 1, 'expected exactly one request to the proof route');
  const { body } = sent[0]!;
  assert.ok(
    body instanceof FormData,
    `proof was sent as ${typeof body === 'string' ? 'a JSON string' : typeof body} — the photo bytes never left the phone`,
  );
  return body;
};

afterEach(() => { __setCachedKeyForTests(null); });

describe('proof is submitted as multipart', () => {
  test('the bytes of every photograph are read and sent as files', async () => {
    const n = net();
    try {
      const res = await submit();
      assert.equal(res.ok, true);
      const form = formOf(n.sent);
      const files = form.getAll('photo');
      assert.equal(files.length, 2, 'both photographs must be on the request');
      // Read from the uri the picker gave: this is what "the bytes left the
      // device" means, and the JSON version never did it.
      assert.deepEqual(n.read, ['blob:photo-one', 'blob:photo-two']);
      const bodies = await Promise.all(files.map((f) => (f as Blob).text()));
      assert.deepEqual(bodies, ['jpeg-bytes-one', 'jpeg-bytes-two']);
      // The server stores `f.name` as the proof's photo uri, so the names are
      // part of the contract, not decoration.
      assert.deepEqual(files.map((f) => (f as File).name), ['proof-1.jpg', 'proof-2.jpg']);
    } finally { n.restore(); }
  });

  test('a multipart body is never labelled application/json', async () => {
    const n = net();
    try {
      await submit();
      const { headers } = n.sent[0]!;
      assert.equal(
        headers['content-type'],
        undefined,
        'a fixed content-type overwrites the multipart boundary and the server parses nothing',
      );
    } finally { n.restore(); }
  });

  test('EXIF travels beside the files, in the same order', async () => {
    const n = net();
    try {
      await submit();
      const meta = JSON.parse(String(formOf(n.sent).get('meta')));
      // The route pairs meta[i] with the i-th photo part. Out of order, a
      // photograph taken at the site would be filed against the wrong one.
      assert.deepEqual(meta, [
        { lat: 9.5358, lng: 100.0618, takenAt: '2026-11-14T09:05:00.000Z' },
        { lat: null, lng: null, takenAt: null },
      ]);
    } finally { n.restore(); }
  });

  test('the second in-fence sample is sent as the position the fence judges', async () => {
    const n = net();
    try {
      await submit();
      assert.deepEqual(JSON.parse(String(formOf(n.sent).get('position'))), POSITION);
    } finally { n.restore(); }
  });

  test('weight is sent when the volunteer gave one, and left out when they did not', async () => {
    const withWeight = net();
    try {
      await submit(4.2);
      assert.equal(formOf(withWeight.sent).get('weightKg'), '4.2');
    } finally { withWeight.restore(); }

    const without = net();
    try {
      await submit(null);
      // Not the string "null": the route reads this field as a number and a
      // quest that does not ask for a weight must not report one.
      assert.equal(formOf(without.sent).get('weightKg'), null);
    } finally { without.restore(); }
  });
});

describe('a photograph the system will not hand over', () => {
  test('is refused in a way the outbox will not retry forever', async () => {
    const n = net({ photoFails: true });
    try {
      const res = await api.submitProof('q_sc01', { photos: PHOTOS, weightKg: null, position: POSITION });
      assert.equal(res.ok, false);
      if (res.ok) return;
      // QuestDetail queues NETWORK and TIMEOUT in the outbox. A file the OS
      // has already dropped will never read, so reporting it as a network
      // failure would queue a proof that can only fail, every minute, for as
      // long as the app is installed.
      assert.notEqual(res.code, 'NETWORK');
      assert.notEqual(res.code, 'TIMEOUT');
      assert.equal(res.code, 'INVALID_PHOTO');
      assert.ok(res.error.length > 0, 'the volunteer has to be told something');
      assert.equal(n.sent.length, 0, 'nothing should have been posted');
    } finally { n.restore(); }
  });
});
