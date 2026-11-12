/**
 * The Cloudflare entry point.
 *
 * `server.ts` is the routes, `server-node.ts` is the Node process, and this is
 * the third thing that can own them: a Worker in front of one Durable Object.
 *
 * ONE DURABLE OBJECT, DELIBERATELY. `fly.toml` says it in the shape of a
 * comment about machines - "SQLite is a file on one disk: a second machine
 * would be a second database, diverging from the first, and neither would be
 * wrong in a way anyone could detect from the outside". A Durable Object is
 * that rule expressed as a platform guarantee rather than as a configuration
 * nobody must change: every request is routed to the object named `pilot`, so
 * there is exactly one database and the runtime enforces it.
 *
 * It is also why this is a Durable Object and not D1. D1's API is async, which
 * would make every one of the 536 `prepare(` call sites and every function
 * above them async. Durable Object SQLite is synchronous, like `node:sqlite`,
 * so `do-storage.ts` re-presents it and not one call site changed.
 *
 * WHAT STILL LIVES ELSEWHERE. ffmpeg cannot run here - Workers cannot spawn a
 * process - so media transcoding is a container this Worker calls over HTTP
 * (`CHIVAGO_TRANSCODE_URL`, see `transcode-service.ts`). That is not a
 * temporary state of this port; it is the shape of the deployment.
 */

import { DurableObject } from 'cloudflare:workers';

import { openDurableDatabase } from './db.ts';
import type { DurableStorage } from './do-storage.ts';
import { r2BlobStore, setBlobStore } from './blob-store.ts';
import { nextDueAt, runDueSweeps, type LastRunAt, type Sweep } from './sweeps.ts';

export interface Env {
  /** The one object. See the note above about why there is only one. */
  CHIVAGO: DurableObjectNamespace<ChivagoPilot>;
  /** Proof photographs. Story media lives in the database, not here. */
  UPLOADS: R2Bucket;
  /** The exported web app, served by Workers Assets. */
  ASSETS: Fetcher;
}

/** Where the sweep bookkeeping lives, so a restart does not re-run everything. */
const LAST_RUN_KEY = 'sweeps:lastRunAt';

export class ChivagoPilot extends DurableObject<Env> {
  /*
    Typed as "something that answers a Request" rather than as `Hono`. The app
    carries its own env generic (`Hono<AppEnv>`), which does not match a bare
    `Hono`, and naming the generic here would tie the platform entry point to
    the routes' internals for no gain: all this needs is `fetch`.
  */
  #app: { fetch: (request: Request) => Response | Promise<Response> } | null = null;
  #sweeps: Sweep[] = [];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    /*
      blockConcurrencyWhile, and nothing else, is what makes this safe.

      The schema and the migrations run here, and until they finish no request
      may be served against a half-built database. This is the Workers
      equivalent of what `openDb` does on Node - and it is why
      `openDurableDatabase` exists as a separate function from `openDb`.

      It is also the ONE place a constructor may do I/O. Anything heavier than
      this belongs in a request.
    */
    ctx.blockConcurrencyWhile(async () => {
      // Uploaded bytes go to R2 rather than a volume. Set before the routes
      // exist, so no handler can read the default disk store by accident.
      setBlobStore(r2BlobStore(env.UPLOADS));

      /*
        A DYNAMIC import, and the order matters.

        `server.ts` reads its database from a binding that `useDatabase` sets.
        Importing it statically would evaluate its module scope - and build the
        sweep list - before this object's storage was available. Importing it
        here means the routes are created with a database already in hand.
      */
      const { app, scheduledSweeps, useDatabase } = await import('./server.ts');
      /*
        The cast is the whole price of not depending on Cloudflare's types in
        `do-storage.ts`. `DurableStorage` there describes the three methods
        this code uses, declared structurally so that 58 service files and the
        Node driver never import `@cloudflare/workers-types`. The real
        `DurableObjectStorage` satisfies it in substance - the probes behind
        `do-storage.ts` ran against this very API - but its `sql.exec` is
        generic over `Record<string, SqlStorageValue>` where ours is generic
        over the row type a caller asks for, and TypeScript cannot see those as
        the same. One cast, at the one place the platform meets the port.
      */
      useDatabase(openDurableDatabase(ctx.storage as unknown as DurableStorage));

      this.#app = app;
      this.#sweeps = scheduledSweeps();

      // Six timers became one alarm. Booked now, so a freshly created object
      // starts sweeping without waiting for a request to wake it.
      if ((await ctx.storage.getAlarm()) === null) {
        await ctx.storage.setAlarm(Date.now() + 1_000);
      }
    });
  }

  override async fetch(request: Request): Promise<Response> {
    // `blockConcurrencyWhile` has finished by the time any request arrives, so
    // this is never null in practice; the check is here because a null
    // dereference under load is a worse way to find out.
    if (!this.#app) return new Response('Starting', { status: 503 });
    return this.#app.fetch(request);
  }

  /**
   * The six sweeps, on one alarm.
   *
   * Each decides whether its turn has come, so the hourly ones are not dragged
   * along by the thirty-second one; `sweeps.ts` holds that logic and the
   * reasons for each cadence. The record of when each last ran is persisted,
   * because an alarm has no memory of the last one and an object that forgot
   * would re-run every hourly job on every restart.
   */
  override async alarm(): Promise<void> {
    const last = (await this.ctx.storage.get<LastRunAt>(LAST_RUN_KEY)) ?? {};
    const updated = await runDueSweeps(this.#sweeps, last);
    await this.ctx.storage.put(LAST_RUN_KEY, updated);
    /*
      Book the next one even if this one threw something `runDueSweeps` did not
      catch. Without this an unhandled alarm is the end of all scheduled work
      on this object, silently - SOS escalation included.
    */
    await this.ctx.storage.setAlarm(nextDueAt(this.#sweeps, updated));
  }
}

/**
 * Static files first, then the one object.
 *
 * Workers Assets serves the exported web app, which is what `serveStatic` did
 * on Node. THE CACHE HEADERS MATTER AND ARE NOT THE DEFAULT: hashed Expo
 * bundles and fonts are immutable for a year, unhashed photographs get an
 * hour, and `index.html` is `no-cache` so a deploy is visible at once. Those
 * rules are set in `wrangler.jsonc`; the comment over `serveWebApp` in
 * `server-node.ts` explains why each one is what it is, and the two must not
 * drift apart.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    /*
      Anything that is not the API is a static file. The prefixes are the ones
      `server.ts` already treats as static; keeping one list is the point,
      because a path that is static here and dynamic there is a 404 nobody can
      reproduce.
    */
    const isAsset = url.pathname === '/'
      || url.pathname === '/favicon.ico'
      || ['/_expo/', '/assets/', '/media/', '/shops/media/', '/shops/guide-photos/']
        .some((p) => url.pathname.startsWith(p));

    if (isAsset && request.method === 'GET') {
      const asset = await env.ASSETS.fetch(request);
      // A miss falls through to the API, which is what makes `/media/<id>` -
      // served from the database, not from the export - still work.
      if (asset.status !== 404) return asset;
    }

    // `getByName` is deterministic: the same name is always the same object,
    // which is how "one machine, one database" survives being a platform
    // promise rather than a configuration setting.
    return env.CHIVAGO.getByName('pilot').fetch(request);
  },
};
