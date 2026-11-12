/**
 * The Node entry point.
 *
 * `server.ts` is the routes and nothing else now - it opens no database, binds
 * no port and starts no timer, because a Durable Object can do none of those
 * at import time. This file is the half that only a Node process can do:
 *
 *   1. open the SQLite file and hand it to the routes,
 *   2. serve the exported web app from the same origin,
 *   3. start the sweep timers,
 *   4. listen.
 *
 * `worker.ts` is the other entry point and does the equivalent in a Durable
 * Object, with Workers Assets for (2) and an alarm for (3).
 *
 * It re-exports `app` and `db` because the route tests import them from here
 * and expect a database to be open - which is exactly what this file is for.
 */

import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';

import { openDb } from './db-node.ts';
import { onPrimary } from './primary.ts';
import { startSweepTimers } from './sweeps.ts';
import { FFMPEG, transcoderAvailable } from './transcode.ts';
import { app, scheduledSweeps, useDatabase } from './server.ts';

// Before anything is served. The routes read this binding, not a copy.
useDatabase(openDb());

export { app, db } from './server.ts';

const webDir = process.env.CHIVAGO_WEB_DIR;

/**
 * Serve the exported web app from this process.
 *
 * NODE ONLY. `serveStatic` and `node:fs` do not exist on Workers, where the
 * same files are served by Workers Assets instead. The cache rules below are the ones that matter and
 * they have to be reproduced there deliberately rather than left to a default
 * - see the comment on `cacheFor`.
 */
function serveWebApp(): void {
  if (webDir === undefined) return;
  if (!existsSync(join(webDir, 'index.html'))) return;

    // `serveStatic` resolves `root` against the process cwd, which is not where
    // this file lives and not where the build lands. Relative-ise it once here
    // rather than depending on how the server happened to be launched.
    const root = relative(process.cwd(), webDir).split(sep).join('/') || '.';

    /*
      How long a static file may be kept.

      `serveStatic` sends no cache header of its own, so before this every open
      AND every refresh re-downloaded the whole bundle - 681 KB over the wire
      even with brotli on. Measured at 150 concurrent readers the CPU was fine;
      it is the bundle, on venue wifi, that falls over first.

      Expo stamps a content hash into bundle and font filenames, so those can be
      kept forever: a new build is a new name, and there is nothing to
      invalidate. The place photographs are NOT hashed (`ku-park.jpg`), so they
      get an hour - long enough to carry a room full of people opening the app
      at once, short enough that replacing one is not a support call.

      index.html is `no-cache`, which does not mean "do not store": it means
      revalidate every time. That is what makes a deploy visible immediately
      while still costing one 304 rather than 1.4 KB.
    */
    const HASHED = /[.-][0-9a-f]{16,}\.[a-z0-9]+$/i;
    const cacheFor = (file: string): string =>
      (HASHED.test(file) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');

    app.get('/', serveStatic({
      path: `${root}/index.html`,
      onFound: (_p, c) => { c.header('cache-control', 'no-cache'); },
    }));
    app.use('/_expo/*', serveStatic({
      root,
      onFound: (p, c) => { c.header('cache-control', cacheFor(p)); },
    }));
    app.use('/assets/*', serveStatic({
      root,
      onFound: (p, c) => { c.header('cache-control', cacheFor(p)); },
    }));
    // The repository's own photographs, copied into the export from
    // `apps/mobile/public/media`. Unhashed names, so `cacheFor` gives them the
    // hour rather than forever - replacing one must not be a support call.
    app.use('/media/*', serveStatic({
      root,
      onFound: (p, c) => { c.header('cache-control', cacheFor(p)); },
    }));
    app.get('/favicon.ico', serveStatic({
      path: `${root}/favicon.ico`,
      onFound: (_p, c) => { c.header('cache-control', 'public, max-age=86400'); },
    }));

    console.log(`[chivago] serving the web app from ${webDir}`);
}

/**
 * Run as a Node process: open the file, start the timers, serve.
 *
 * Everything in here is the Node deployment and none of it can run on
 * Workers - the database is a file, the timers need a process, and `serve`
 * binds a port. `worker.ts` is the other entry point and does the equivalent
 * three things in a Durable Object.
 */
function startNodeServer(): void {
  serveWebApp();

  /*
    Only a real process starts timers, and only the writer runs the work:
    `onPrimary` is what keeps a LiteFS replica from sweeping a database it
    cannot write to. This used to happen at module scope, which meant merely
    IMPORTING this file started six timers.
  */
  startSweepTimers(scheduledSweeps().map((s) => ({ ...s, run: onPrimary(() => void s.run()) })));

  const port = Number(process.env.PORT ?? 8787);
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[chivago] API listening on http://localhost:${info.port}`);
  });

  /*
    Say at the door whether stories can be processed at all.

    Not a gate - the server is useful without ffmpeg, and everything except
    stories works - but a machine that has lost the binary should announce it
    on an empty console, not through the first person in the room who tries
    to post. Deliberately after `serve`, so a slow probe never delays the
    port opening.
  */
  void transcoderAvailable().then((ok_) => {
    if (ok_) return;
    console.error(
      `[chivago] WARNING: ffmpeg ('${FFMPEG}') was not found. Stories cannot be posted on this machine;`
      + ' every upload will answer STORY_TRANSCODER_DOWN (503). Install ffmpeg, or set CHIVAGO_FFMPEG.',
    );
  });
}

/*
  Is this file the process?

  `process.argv[1]` is checked BEFORE `node:url` is reached, so a Worker - which
  has no argv - never evaluates either and never tries to start a server.
*/
/*
  Is this file the process? Importing it must open the database - the route
  tests rely on that - but must NOT bind a port.
*/
const isEntryPoint = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) startNodeServer();

