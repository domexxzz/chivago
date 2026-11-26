/**
 * The encoder's container, and the Durable Object that owns its lifetime.
 *
 * WHY A DURABLE OBJECT AT ALL. A Cloudflare container is not a service with an
 * address; it is attached to a Durable Object class, and the only way to reach
 * it is through an instance of that class. So this object holds no storage and
 * answers no business question - it starts a container, waits for it to listen,
 * and forwards one request. `ChivagoPilot` is the database; this is a handle.
 *
 * The container's whole program is `transcode-service.ts` (see
 * `Dockerfile.transcode`): the same ffmpeg the single machine used, behind two
 * routes, refusing to start without `CHIVAGO_TRANSCODE_TOKEN`.
 *
 * MEASURED, because the instance size is not a guess. The same 15-second
 * 1080p HEVC clip, through the real image with Docker holding it to each
 * instance's CPU and memory:
 *
 *   lite        1/16 vCPU, 256 MiB   FAILED - ffmpeg's own 60 s timeout
 *   basic       1/4  vCPU, 1 GiB     21 s
 *   standard-1  1/2  vCPU, 4 GiB     13 s
 *
 * So `lite`, the default, cannot do this job at all, and `basic` is the
 * smallest that can. The app gives an upload 60 s, so `basic` leaves about
 * forty seconds of headroom for the request either side of the encode.
 */

import { DurableObject } from 'cloudflare:workers';

/** Where `transcode-service.ts` listens: its own default, and the Dockerfile's. */
const CONTAINER_PORT = 8788;

/**
 * How long an idle container stays up.
 *
 * Every cold start costs a traveller one to three seconds on top of the
 * encode, and stories arrive in bursts - a group posts from the same beach
 * within a few minutes of each other. Ten minutes keeps the container through
 * a burst and lets it go long before the next one.
 */
const IDLE_MS = 10 * 60 * 1000;

/** How long to wait for the container to answer `/health` before giving up. */
const READY_TIMEOUT_MS = 60_000;
const READY_POLL_MS = 250;

export interface EncoderEnv {
  CHIVAGO_TRANSCODE_TOKEN?: string;
}

export class ChivagoEncoder extends DurableObject<EncoderEnv> {
  /** The start in flight, so concurrent uploads wait on one, not one each. */
  private starting: Promise<void> | undefined;

  async fetch(request: Request): Promise<Response> {
    try {
      this.starting ??= this.startAndWait().finally(() => { this.starting = undefined; });
      await this.starting;
    } catch (err) {
      /*
        A container that will not start is the server's fault, and it has to
        say so in the words `story-service.ts` already understands: 503 is
        what `httpTranscoder` reads as `TranscoderUnavailable`, which answers
        the traveller "nothing is wrong with your clip" rather than refusing
        a file that was fine. See transcode.ts.
      */
      console.error('[chivago] encoder container did not start:', err);
      return new Response('the encoder did not start', { status: 503 });
    }

    // The container is addressed by port, not by hostname; the URL's host is
    // a placeholder the container never reads, and `host` must not survive.
    const url = new URL(request.url);
    url.protocol = 'http:';
    url.host = 'container';
    const forwarded = new Request(url, request);
    forwarded.headers.delete('host');
    return this.ctx.container!.getTcpPort(CONTAINER_PORT).fetch(forwarded);
  }

  private async startAndWait(): Promise<void> {
    const container = this.ctx.container;
    if (!container) throw new Error('no container is attached to this Durable Object');
    if (!container.running) {
      /*
        The token reaches the container as an environment variable, which is
        how `transcode-service.ts` expects it and why it refuses to start
        without one. It is a Worker secret, so it is never in this repository.
      */
      const token = this.env.CHIVAGO_TRANSCODE_TOKEN;
      if (!token) throw new Error('CHIVAGO_TRANSCODE_TOKEN is not set on the Worker');
      container.start({ env: { CHIVAGO_TRANSCODE_TOKEN: token, PORT: String(CONTAINER_PORT) } });
    }
    await container.setInactivityTimeout(IDLE_MS);

    /*
      `start` returns before the program is listening, so the port is polled.
      `/health` needs no token and says only whether ffmpeg answers - which is
      the right question: a container whose binary has gone looks identical to
      a healthy one until the first clip fails.
    */
    const port = container.getTcpPort(CONTAINER_PORT);
    const deadline = Date.now() + READY_TIMEOUT_MS;
    let last: unknown;
    while (Date.now() < deadline) {
      try {
        const res = await port.fetch('http://container/health', { signal: AbortSignal.timeout(2_000) });
        await res.body?.cancel();
        if (res.ok) return;
        last = new Error(`health answered ${res.status}`);
      } catch (err) {
        last = err;
      }
      await scheduler.wait(READY_POLL_MS);
    }
    throw new Error(`the encoder did not answer within ${READY_TIMEOUT_MS / 1000} s`, { cause: last });
  }
}
