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

import { openDurableDatabase, SCHEMA_VERSION } from './db.ts';
import type { DurableStorage } from './do-storage.ts';
import { r2BlobStore, setBlobStore } from './blob-store.ts';
import { nextDueAt, runDueSweeps, type LastRunAt, type Sweep } from './sweeps.ts';
import { servedFromExport } from './served-from-export.ts';
import { edgeCacheKey, edgeCacheable, forClient, forEdge } from './edge-cache.ts';

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

/** Which `SCHEMA_VERSION` this object's database was last built to. */
const SCHEMA_KEY = 'schema:version';

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
      /*
        THE SCHEMA RUNS ONCE PER VERSION, NOT ONCE PER BOOT.

        A Node process applies the schema at startup and then lives for days.
        This object does not: it is constructed, serves, hibernates, and is
        constructed again by the next alarm - 2,880 times a day at the pilot's
        cadence. Re-applying the schema each time is 142 statements against 222
        schema objects, and Durable Object SQLite charges by rows read, so on
        12 November 2026 it burned the whole five-million-row daily allowance
        and the pilot answered 500 for everything. See `SCHEMA_VERSION`.

        The version is read from key-value storage rather than from the
        database, so the boot that skips the migration touches no table at all.
      */
      const installed = await ctx.storage.get<number>(SCHEMA_KEY);
      const migrate = installed !== SCHEMA_VERSION;
      useDatabase(
        openDurableDatabase(ctx.storage as unknown as DurableStorage, { migrate }),
      );
      /*
        Written AFTER the migration, never before: a boot that dies halfway
        through `migrate()` must come back and finish, and a version recorded
        up front would tell the next boot there was nothing to do.
      */
      if (migrate) {
        await ctx.storage.put(SCHEMA_KEY, SCHEMA_VERSION);
        console.log(`[chivago] schema at version ${SCHEMA_VERSION}`);
      }

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
    const response = await this.#app.fetch(request);
    await this.#pullAlarmForward();
    return response;
  }

  /**
   * Book the alarm sooner if this request gave a sweep something to do.
   *
   * THIS IS WHAT MAKES THE IDLE CADENCE SAFE. The escalation sweep drops to
   * five minutes while no alert is open (see `Sweep.idle`), and the only way
   * an alert can come into being is a request - this one. So the cadence is
   * recomputed here, with the alert already written, and the alarm is dragged
   * back to thirty seconds before the response leaves the object.
   *
   * AWAITED, NOT `waitUntil`. The two storage reads cost about a millisecond,
   * and the thing being protected is how fast somebody in trouble is escalated
   * when nobody answers. That is not a guarantee to hand to a best-effort
   * callback.
   *
   * Only ever moves the alarm EARLIER. Pushing it out would let a steady
   * trickle of requests postpone the hourly sweeps indefinitely.
   */
  async #pullAlarmForward(): Promise<void> {
    try {
      const last = (await this.ctx.storage.get<LastRunAt>(LAST_RUN_KEY)) ?? {};
      const due = nextDueAt(this.#sweeps, last);
      const booked = await this.ctx.storage.getAlarm();
      if (booked === null || booked > due) await this.ctx.storage.setAlarm(due);
    } catch (err) {
      // A response that was already produced must not be lost to bookkeeping.
      // The worst case is the next alarm fires on the cadence it already had.
      console.error('[chivago] could not re-book the alarm', err);
    }
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
 * rules are set in `apps/mobile/public/_headers`, which Workers Assets reads
 * and `public/` carries into the export; the comment over `serveWebApp` in
 * `server-node.ts` explains why each one is what it is, and the two must not
 * drift apart.
 */

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const isAsset = servedFromExport(url.pathname);

    /*
      HEAD AS WELL AS GET, which is why `HEAD /islands/koh-sichang.glb` used to
      answer 401 while GET answered 200 (recorded in #254 and left). A HEAD on
      a static path fell past this branch to the Durable Object, which asks for
      a token and refuses without one - so the one request a person makes to
      ASK ABOUT a file, rather than download it, got an answer about
      authentication. It cost real time today: headers read with HEAD looked
      like an auth problem when the files were fine.
    */
    if (isAsset && (request.method === 'GET' || request.method === 'HEAD')) {
      const asset = await env.ASSETS.fetch(request);
      // A miss falls through to the API, which is what makes `/media/<id>` -
      // served from the database, not from the export - still work.
      if (asset.status !== 404) return asset;
    }

    // `getByName` is deterministic: the same name is always the same object,
    // which is how "one machine, one database" survives being a platform
    // promise rather than a configuration setting.
    const pilot = env.CHIVAGO.getByName('pilot');

    // Public answers that are the same for everybody are kept at the edge
    // for a minute and never reach the object again (edge-cache.ts).
    if (edgeCacheable(request)) {
      const cache = await caches.open('public-reads');
      const key = edgeCacheKey(request);
      const hit = await cache.match(key);
      if (hit) return forClient(hit, 'HIT');
      const response = await pilot.fetch(request);
      const stored = forEdge(response.clone());
      if (stored) ctx.waitUntil(cache.put(key, stored));
      return forClient(response, 'MISS');
    }

    return pilot.fetch(request);
  },
};
