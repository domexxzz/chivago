/**
 * Tell MapLibre where its worker is, because it cannot work it out here.
 *
 * WHY THIS FILE EXISTS. maplibre-gl 6 dropped the UMD build that version 5
 * shipped and is now ESM-only, with the heavy half of the library split into a
 * separate `maplibre-gl-worker.mjs` that it locates at runtime with
 *
 *   new URL('./maplibre-gl-worker.mjs', import.meta.url)
 *
 * Two things about that do not survive Metro.
 *
 * `import.meta` is a SYNTAX error in a classic script, which is what Metro
 * emits for web - so the whole shared chunk holding MapLibre failed to parse
 * and both map screens came up empty, reporting only `Uncaught SyntaxError:
 * Cannot use 'import.meta' outside a module` with nothing to say it was the
 * map. `babel.config.js` turns on Expo's `unstable_transformImportMeta` to
 * get past that; it rewrites `import.meta` to Expo's registry, whose `url` is
 * the BUNDLE's url.
 *
 * Which is the second problem: the worker is not served next to the bundle.
 * `_expo/static/js/web/maplibre-gl-worker.mjs` does not exist, so the resolved
 * URL 404s and no map ever gets a worker. MapLibre's own `setWorkerUrl()` is
 * the supported way to say otherwise, so we say it.
 *
 * THE FILE IS VENDORED, the same bargain `IslandDiorama.tsx` strikes for
 * three.js: served from our own origin rather than fetched over somebody
 * else's DNS and TLS, with the version in the filename so `/vendor/*` can stay
 * `immutable` in `public/_headers`. `maplibre-worker.test.ts` fails if the
 * vendored copy and the installed package ever drift apart, which is the one
 * way this arrangement could go quietly wrong.
 *
 * Imported for its side effect by every component that builds a Map, and it
 * must run before the first one does.
 */

import { setWorkerUrl } from 'maplibre-gl';

/**
 * Kept in one place because the test reads it.
 *
 * The version is part of the path, not decoration: `public/_headers` caches
 * `/vendor/*` for a year as immutable, which is only safe while a new version
 * means a new name.
 *
 * `.js`, THOUGH THE FILE IS ESM. MapLibre starts it with
 * `new Worker(url, { type: 'module' })`, and a module worker is REFUSED unless
 * the response is a JavaScript MIME type - the extension is not consulted. Every
 * static host maps `.js` to `text/javascript`; `.mjs` is widely but not
 * universally mapped, and a worker that 404s on content-type is a blank map
 * rather than an error. `.js` costs nothing and removes the question.
 */
export const MAPLIBRE_WORKER_URL = '/vendor/maplibre-gl-worker-6.19.0.js';

/*
  Guarded so the module is harmless off the web - the native maps never load
  this, but a test or a server render might import the tree that reaches it.
*/
if (typeof window !== 'undefined') setWorkerUrl(MAPLIBRE_WORKER_URL);
