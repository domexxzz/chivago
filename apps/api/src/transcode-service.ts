/**
 * The encoder, as a service.
 *
 * WHY IT EXISTS. ffmpeg is a native binary. Cloudflare Workers cannot spawn a
 * process, so when the API runs on Workers the encode has to happen in a
 * container, and this is that container's whole program: the same
 * `ffmpegTranscoder` the single machine uses, behind two routes.
 *
 * IT IS THE BOX THAT RUNS NODE. ffmpeg was the first thing that needed one,
 * and for a while the only one - but Air4Thai's feed needs `node:https` to
 * supply intermediates its server omits, which Workers cannot do either, so
 * that request happens here too (`/air4thai`). Everything else the API does
 * runs on Workers. This exists because of specific capabilities Workers lacks,
 * not because the architecture wanted a second service.
 *
 * WHAT IT MUST NOT BE: open to the internet. Transcoding is the most expensive
 * thing this product does - a minute of CPU per clip, bounded only by a
 * timeout - so an unauthenticated encoder is a free CPU-burning endpoint for
 * anybody who finds it. `CHIVAGO_TRANSCODE_TOKEN` is required, refused at
 * startup if absent, and compared in constant time.
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';

import { fetchOverNodeTls } from './air4thai.ts';
import {
  STORY_MAX_SECONDS,
  STORY_WIDTH,
  TranscoderUnavailable,
  ffmpegTranscoder,
  transcoderAvailable,
} from './transcode.ts';

/**
 * The largest thing it will accept.
 *
 * `server.ts` caps a story upload well below this; the ceiling here is the
 * second lock, so a direct caller cannot hand the encoder a gigabyte and make
 * it the container's problem.
 */
const MAX_INPUT_BYTES = 64 * 1024 * 1024;

const TOKEN = process.env.CHIVAGO_TRANSCODE_TOKEN ?? '';
const UTF8 = new TextEncoder();

/**
 * Constant-time byte comparison.
 *
 * DELIBERATE DUPLICATE, to be deleted. `scrypt.ts` on the Workers-safe-scrypt
 * branch has exactly this function; that branch is not merged, and stacking
 * this change on top of it as well as on the metadata fix would make three
 * branches deep for six lines. When both have landed, delete this and import
 * `constantTimeEqual` from `scrypt.ts`.
 *
 * Every byte is read and the differences accumulated with OR, so the work does
 * not depend on WHERE the first difference is - no early return inside the
 * loop. Empty inputs are not equal: `TOKEN` is checked non-empty before this
 * is reached, and two empty buffers comparing true is how an absent secret
 * turns into an open door.
 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/**
 * Is the caller allowed?
 *
 * The token's LENGTH leaks, because an unequal length returns at once. That is
 * accepted: the token is a random secret an operator sets, not a password, and
 * its length is not what protects it.
 */
function authorised(header: string | undefined): boolean {
  if (!TOKEN || !header) return false;
  return constantTimeEqual(UTF8.encode(header), UTF8.encode(TOKEN));
}

export function buildApp(): Hono {
  const app = new Hono();

  /**
   * Is the binary there?
   *
   * Unauthenticated on purpose and says nothing but yes or no, so an
   * orchestrator can restart a container whose ffmpeg has gone without
   * holding the shared secret.
   */
  app.get('/health', async (c) => {
    const ready = await transcoderAvailable();
    return c.json({ ok: ready, encoder: ready ? 'ffmpeg' : 'missing' }, ready ? 200 : 503);
  });

  /**
   * Air4Thai, fetched from here because it cannot be fetched from Workers.
   *
   * Measured: workerd's `fetch` answers "TLS peer's certificate is not
   * trusted; unable to get local issuer certificate", because Air4Thai's
   * server omits its intermediates and Cloudflare's stack neither fetches them
   * (AIA) nor offers a way to hand them over. `node:https` does, with the
   * chain bundled in `apps/api/certs`.
   *
   * SO THIS SERVICE IS NO LONGER ONLY THE ENCODER. It is the box that runs
   * Node, and ffmpeg was the first thing that needed one rather than the only
   * thing. A second container for one HTTP call would cost more and explain
   * less.
   *
   * It is a cross-check and nothing is built on its absence: a failure here
   * downgrades an air reading to `estimated`, which is the correct outcome and
   * is what `air.ts` already does. So this answers plainly and lets the caller
   * degrade, rather than retrying or caching - `air_cache` upstream already
   * holds the reading.
   */
  app.get('/air4thai', async (c) => {
    if (!authorised(c.req.header('x-transcode-token'))) {
      return c.text('Forbidden', 403);
    }
    try {
      return c.json(await fetchOverNodeTls(10_000) as Record<string, unknown>);
    } catch (err) {
      // 502, not 500: the fault is upstream, and the caller's log should say
      // which of the two servers let it down.
      return c.text(`Air4Thai could not be read: ${(err as Error).message}`, 502);
    }
  });

  app.post('/:kind{video|photo}', async (c) => {
    if (!authorised(c.req.header('x-transcode-token'))) {
      return c.text('Forbidden', 403);
    }

    const kind = c.req.param('kind') as 'video' | 'photo';
    const ext = c.req.query('ext') ?? 'bin';

    const body = new Uint8Array(await c.req.arrayBuffer());
    if (body.length === 0) return c.text('Empty body', 400);
    if (body.length > MAX_INPUT_BYTES) return c.text('Too large', 413);

    try {
      const encoded = kind === 'video'
        ? await ffmpegTranscoder.video(body, ext)
        : await ffmpegTranscoder.photo(body, ext);

      /*
        A multipart response rather than JSON with base64: the media is the
        bulk of this answer and base64 would add a third to it for nothing.
        `FormData` and `Response` are web standards on both sides, so the
        Worker parses this with `res.formData()` and no library.
      */
      const form = new FormData();
      form.append('media', new Blob([encoded.media as BlobPart]));
      form.append('poster', new Blob([encoded.poster as BlobPart]));
      form.append('durationS', encoded.durationS === null ? '' : String(encoded.durationS));
      return new Response(form, { status: 200 });
    } catch (err) {
      /*
        The one distinction worth carrying over the wire. ffmpeg missing is
        503 - the server's fault; the caller maps it back to
        `TranscoderUnavailable` and the traveller is told the server is at
        fault. A file ffmpeg could not read is 400, and the caller turns that
        into "it could not be used as a story".
      */
      if (err instanceof TranscoderUnavailable) {
        return c.text(`Encoder unavailable: ${err.message}`, 503);
      }
      return c.text(`Could not encode: ${(err as Error).message}`, 400);
    }
  });

  return app;
}

/** Started only when this file is the process entry point, never on import. */
const isEntryPoint = (): boolean => {
  const arg = process.argv[1];
  return arg !== undefined && /transcode-service\.ts$/.test(arg);
};

if (isEntryPoint()) {
  if (!TOKEN) {
    // Refusing to start is the point. A transcoder that came up without its
    // token would be an open encoder, and nothing in the logs would say so.
    console.error('[transcode] CHIVAGO_TRANSCODE_TOKEN is not set; refusing to start an open encoder.');
    process.exit(1);
  }

  const port = Number(process.env.PORT ?? 8788);
  const ready = await transcoderAvailable();
  if (!ready) {
    // Not fatal: /health answers 503 and an orchestrator can see it. Dying
    // here would make a container that restarts forever instead of one that
    // says what is wrong.
    console.warn('[transcode] ffmpeg was not found; /health will answer 503 until it is.');
  }
  console.log(
    `[transcode] listening on ${port}; ${STORY_WIDTH}px, ${STORY_MAX_SECONDS}s max, ffmpeg ${ready ? 'present' : 'MISSING'}`,
  );
  serve({ fetch: buildApp().fetch, port });
}
