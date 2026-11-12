/**
 * The encoder as a service, and the client that calls it.
 *
 * The thing worth testing here is not "does ffmpeg work" - `transcode.test.ts`
 * covers that against the real binary. It is whether the DISTINCTION survives
 * the network.
 *
 * `TranscoderUnavailable` exists because a machine with no ffmpeg used to
 * answer every upload with "that file could not be used as a story", which is
 * a 400 and a lie: the file was fine and the server was not. On the day that
 * reads as every traveller in the room having a broken phone. Over HTTP there
 * are now TWO ways to be unavailable rather than one - the container can
 * refuse, or it can be unreachable - and both have to come out as the server's
 * fault, while a file ffmpeg genuinely cannot read must not.
 */

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { httpTranscoder, TranscoderUnavailable } from './transcode.ts';

const BYTES = new Uint8Array([1, 2, 3, 4]);
const TOKEN = 'test-token';

/** A stand-in encoder, so no test here needs a port or a binary. */
function service(
  handler: (kind: string, body: Uint8Array, ext: string, token: string | null) => Promise<Response>,
): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const kind = url.pathname.split('/').pop() ?? '';
    const ext = url.searchParams.get('ext') ?? '';
    const headers = new Headers(init?.headers);
    const body = new Uint8Array(init?.body as ArrayBuffer);
    return handler(kind, body, ext, headers.get('x-transcode-token'));
  }) as unknown as typeof fetch;
}

/** The multipart answer the real service sends. */
function encoded(media: string, poster: string, durationS: string): Response {
  const form = new FormData();
  form.append('media', new Blob([media]));
  form.append('poster', new Blob([poster]));
  form.append('durationS', durationS);
  return new Response(form, { status: 200 });
}

const text = (bytes: Uint8Array): string => Buffer.from(bytes).toString();

describe('the happy path', () => {
  test('bytes go out and bytes come back, with the duration', async () => {
    const t = httpTranscoder('https://encoder.internal', {
      fetch: service(async (kind, body, ext) => {
        assert.equal(kind, 'video');
        assert.equal(ext, 'mp4');
        assert.deepEqual(body, BYTES, 'the input arrived whole');
        return encoded('MP4', 'POSTER', '8.2');
      }),
      token: TOKEN,
    });
    const out = await t.video(BYTES, 'mp4');
    assert.equal(text(out.media), 'MP4');
    assert.equal(text(out.poster), 'POSTER');
    assert.equal(out.durationS, 8.2);
  });

  test('a photo asks the photo route and has no duration', async () => {
    const t = httpTranscoder('https://encoder.internal/', {
      fetch: service(async (kind) => {
        assert.equal(kind, 'photo');
        return encoded('JPG', 'JPG', '');
      }),
      token: TOKEN,
    });
    const out = await t.photo(BYTES, 'heic');
    assert.equal(text(out.media), 'JPG');
    assert.equal(out.durationS, null, 'an empty duration is null, not NaN');
  });

  test('the token is sent, so the encoder is not an open endpoint', async () => {
    let seen: string | null = null;
    const t = httpTranscoder('https://encoder.internal', {
      fetch: service(async (_k, _b, _e, token) => {
        seen = token;
        return encoded('MP4', 'P', '1');
      }),
      token: TOKEN,
    });
    await t.video(BYTES, 'mp4');
    assert.equal(seen, TOKEN);
  });

  test('an odd extension is not passed through verbatim', async () => {
    // The extension shapes a filename on the far side, so it is normalised
    // before it is ever sent rather than only on arrival.
    let seen = '';
    const t = httpTranscoder('https://encoder.internal', {
      fetch: service(async (_k, _b, ext) => { seen = ext; return encoded('M', 'P', ''); }),
      token: TOKEN,
    });
    await t.photo(BYTES, '../../etc/passwd');
    assert.equal(seen, 'bin');
  });
});

describe('the server is at fault', () => {
  test('503 from the encoder is TranscoderUnavailable, not a bad file', async () => {
    const t = httpTranscoder('https://encoder.internal', {
      fetch: service(async () => new Response('Encoder unavailable: ffmpeg: ENOENT', { status: 503 })),
      token: TOKEN,
    });
    await assert.rejects(() => t.video(BYTES, 'mp4'), TranscoderUnavailable);
  });

  test('an unreachable container is ALSO TranscoderUnavailable', async () => {
    // The failure mode that did not exist before this was a network call. A
    // refused connection is no more the traveller's fault than a missing
    // binary, and must not be reported as an unreadable file.
    const t = httpTranscoder('https://encoder.internal', {
      fetch: (() => Promise.reject(new Error('connect ECONNREFUSED'))) as unknown as typeof fetch,
      token: TOKEN,
    });
    await assert.rejects(() => t.video(BYTES, 'mp4'), TranscoderUnavailable);
  });

  test('a timeout is the server too', async () => {
    const t = httpTranscoder('https://encoder.internal', {
      fetch: (() => Promise.reject(new Error('The operation was aborted due to timeout'))) as unknown as typeof fetch,
      token: TOKEN,
    });
    await assert.rejects(() => t.photo(BYTES, 'jpg'), TranscoderUnavailable);
  });
});

describe('the file is at fault', () => {
  test('400 is an ordinary error, so the story layer blames the file', async () => {
    /*
      This is the other half of the distinction. story-service.ts turns a
      non-TranscoderUnavailable throw into "it could not be read", which is
      the right thing to tell somebody whose clip really is broken - and the
      wrong thing to tell a room when the encoder is down.
    */
    const t = httpTranscoder('https://encoder.internal', {
      fetch: service(async () => new Response('Could not encode: moov atom not found', { status: 400 })),
      token: TOKEN,
    });
    await assert.rejects(
      () => t.video(BYTES, 'mp4'),
      (e: unknown) => {
        assert.ok(e instanceof Error);
        assert.ok(!(e instanceof TranscoderUnavailable), 'a bad file is not the server being unavailable');
        assert.match(e.message, /moov atom/);
        return true;
      },
    );
  });

  test('403 is not mistaken for either - a wrong token is a deployment fault', async () => {
    const t = httpTranscoder('https://encoder.internal', {
      fetch: service(async () => new Response('Forbidden', { status: 403 })),
      token: 'wrong',
    });
    await assert.rejects(
      () => t.video(BYTES, 'mp4'),
      (e: unknown) => {
        assert.ok(!(e instanceof TranscoderUnavailable));
        assert.match((e as Error).message, /403/);
        return true;
      },
    );
  });
});

describe('a malformed answer is not trusted', () => {
  test('a 200 without the parts is an error, not an empty story', async () => {
    // An empty clip stored as though it encoded would be a grey box with a
    // row behind it saying everything went fine.
    const t = httpTranscoder('https://encoder.internal', {
      fetch: service(async () => {
        const form = new FormData();
        form.append('durationS', '3');
        return new Response(form, { status: 200 });
      }),
      token: TOKEN,
    });
    await assert.rejects(() => t.video(BYTES, 'mp4'), /without media and poster/);
  });

  test('a nonsense duration becomes null rather than NaN', async () => {
    const t = httpTranscoder('https://encoder.internal', {
      fetch: service(async () => encoded('M', 'P', 'not-a-number')),
      token: TOKEN,
    });
    assert.equal((await t.video(BYTES, 'mp4')).durationS, null);
  });
});
