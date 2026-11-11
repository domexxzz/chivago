/**
 * The Cloudflare Worker entry point. Step one of `docs/74`, and no more.
 *
 * WHAT THIS IS FOR. `do-storage.ts` presents Durable Object SQLite through
 * the same `DB` surface the whole codebase already uses, and its tests pass -
 * against a node:sqlite stand-in. Nothing in this repository has ever run it
 * against a real Durable Object. Two things no test here can prove are
 * whether the toolchain bundles this at all, and whether the database opens
 * inside `blockConcurrencyWhile` before a request is served. This Worker
 * exists to find that out, on a workers.dev subdomain with nothing pointing
 * at it, while the pilot keeps running on Fly.
 *
 * WHY ONLY `/health`. `docs/74` said step one was `/health` and `/config`.
 * `/config` turned out to be unreachable from here: `publicConfig()` lives in
 * `fence.ts`, which imports `assist-service.ts`, which imports
 * `node:fs/promises`, `node:os` and the ffmpeg transcoder. Serving it would
 * mean either dragging Node into the Worker or copying the config shape and
 * letting the two drift. Neither is worth it for a spike, so `/config` waits
 * for the step that untangles `fence.ts`.
 *
 * WHY THE ENVELOPE IS WRITTEN OUT HERE. `ok()` lives in `http.ts`, which
 * imports `transcode.ts` for its error mapping - `node:child_process`, the
 * one thing Workers genuinely cannot do. Six lines of duplication beat
 * importing the whole error map to reach them, and the duplication is
 * temporary: the step that moves the routes across moves `http.ts` with them.
 *
 * NOTHING FROM NODE MAY REACH THIS FILE, and that is not a convention:
 * `worker-is-node-free.test.ts` walks every runtime import from here and
 * fails on the first `node:` specifier it finds.
 */
import { Hono } from 'hono';
import { openDurableDatabase } from './schema.ts';
import type { SyncDatabase } from './do-storage.ts';
import type { DurableStorage } from './do-storage.ts';

/*
  The slice of the Cloudflare runtime this file touches, declared here.

  `@cloudflare/workers-types` would bring the real ones, and the step that
  adds `wrangler` should add them. It is not installed yet, and the global
  types it ships collide with `@types/node`, which this package needs for the
  rest of its code. Declaring the four members actually used keeps that fight
  for the day it has to be had, and keeps this file honestly typed meanwhile.
*/
interface DurableObjectState {
  storage: DurableStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}
interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}
interface DurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStub;
}
export interface Env {
  CHIVAGO_DB: DurableObjectNamespace;
}

/**
 * The database, as one Durable Object.
 *
 * ONE OBJECT, ONE DATABASE - the rule `fly.toml` keeps with one machine and
 * one volume, expressed in the only way this platform offers. `idFromName`
 * below always asks for the same name, so every request reaches this one
 * object and there is never a second database to diverge from the first.
 *
 * The open happens inside `blockConcurrencyWhile`, so the schema and the
 * migrations finish before any request is served. That is the half of this
 * spike the node:sqlite stand-in cannot test.
 */
export class ChivagoDatabase {
  #db: SyncDatabase | null = null;
  #failure: string | null = null;

  constructor(state: DurableObjectState) {
    void state.blockConcurrencyWhile(async () => {
      try {
        this.#db = openDurableDatabase(state.storage);
      } catch (err) {
        /*
          Kept, not thrown. A constructor that throws here takes the object
          down on every request with nothing to read, which is the shape of
          the Ko Sichang bootstrap failure in #196: an exception during
          start-up, no port, no explanation. Holding the reason lets /health
          report it.
        */
        this.#failure = err instanceof Error ? err.message : String(err);
      }
    });
  }

  async fetch(_request: Request): Promise<Response> {
    if (this.#db === null) {
      return Response.json({ ok: false, error: { code: 'DB_UNAVAILABLE', message: this.#failure ?? 'the database did not open' } }, { status: 503 });
    }
    /*
      Not `SELECT 1`. The question this spike asks is whether the SCHEMA and
      the migrations ran, and only a real table answers that - a connection
      that opened over an empty database would pass `SELECT 1` and prove
      nothing.
    */
    const counted = this.#db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").get() as { n: number | bigint } | undefined;
    return Response.json({
      ok: true,
      data: { status: 'up', time: new Date().toISOString(), tables: Number(counted?.n ?? 0) },
    });
  }
}

const app = new Hono<{ Bindings: Env }>();

app.get('/health', async (c) => {
  const stub = c.env.CHIVAGO_DB.get(c.env.CHIVAGO_DB.idFromName('chivago'));
  return stub.fetch(new Request('https://do/health'));
});

export default app;
