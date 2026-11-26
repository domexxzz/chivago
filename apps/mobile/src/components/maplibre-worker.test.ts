import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test, describe } from 'node:test';
import { URL, fileURLToPath } from 'node:url';

import { MAPLIBRE_WORKER_URL } from './maplibre-worker.ts';

/**
 * The one way the vendored MapLibre worker can go quietly wrong.
 *
 * `maplibre-worker.ts` points MapLibre at a copy of `maplibre-gl-worker.mjs`
 * that lives in `public/vendor/`, because MapLibre 6 cannot find its own
 * worker under Metro. A copy of a dependency's internals is a copy that can
 * drift: bump `maplibre-gl` and the app keeps serving last version's worker to
 * this version's library, which is a mismatch nothing else here would notice -
 * not the typecheck, not the export checks, not a screen test, because none of
 * them run a worker.
 *
 * So these hold the copy to the package, and the URL to the copy.
 */

const require_ = createRequire(import.meta.url);
const here = dirname(fileURLToPath(new URL(import.meta.url)));
const vendorDir = join(here, '..', '..', 'public', 'vendor');

/** The worker shipped by the maplibre-gl that is actually installed. */
const installedWorker = (): { version: string; source: Buffer } => {
  const manifest = require_.resolve('maplibre-gl/package.json');
  const version = JSON.parse(readFileSync(manifest, 'utf8')).version as string;
  const source = readFileSync(join(dirname(manifest), 'dist', 'maplibre-gl-worker.mjs'));
  return { version, source };
};

describe('the vendored MapLibre worker', () => {
  test('is named for the maplibre-gl version that is installed', () => {
    const { version } = installedWorker();
    assert.equal(
      MAPLIBRE_WORKER_URL,
      `/vendor/maplibre-gl-worker-${version}.js`,
      'maplibre-gl moved: copy dist/maplibre-gl-worker.mjs into public/vendor/ under the new '
      + 'version name, update MAPLIBRE_WORKER_URL, and delete the old copy',
    );
  });

  test('is byte-for-byte the worker that package ships', () => {
    const { source } = installedWorker();
    const vendored = readFileSync(join(vendorDir, MAPLIBRE_WORKER_URL.replace('/vendor/', '')));
    /*
      Compared as bytes, not as text, and the sizes are reported separately
      because a 538 KB diff tells nobody anything. A mismatch means the copy
      was taken from a different build of the library.
    */
    assert.equal(vendored.length, source.length, 'vendored worker is a different size to the installed one');
    assert.ok(vendored.equals(source), 'vendored worker differs from the installed maplibre-gl worker');
  });

  test('is served from /vendor, which _headers caches as immutable', () => {
    // The immutable year in public/_headers is only safe for a versioned name.
    assert.match(MAPLIBRE_WORKER_URL, /^\/vendor\/maplibre-gl-worker-\d+\.\d+\.\d+\.js$/);
  });
});
