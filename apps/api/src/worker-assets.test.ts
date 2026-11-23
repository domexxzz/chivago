import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { servedFromExport } from './served-from-export.ts';

/**
 * Everything in the web app's `public/` directory reaches a visitor.
 *
 * On Node the static handler is given a directory and tries it. On Workers
 * there is no directory to try: `worker.ts` holds a LIST, and a path not on
 * it goes to the API, where it meets the device-authentication middleware and
 * comes back 401. So a file added to `public/` is served on one deployment
 * and refused on the other, and nothing says so.
 *
 * That is not a hypothetical. On the first Workers deployment of this app,
 * measured against the Node one:
 *
 *   /robots.txt          node 200   workers 401
 *   /icons/icon-192.png  node 200   workers 401
 *   /favicon.ico         node 200   workers 200
 *
 * The icons are the PWA's home-screen icons and robots.txt is what tells a
 * crawler what to do with a pilot. Both would have gone unnoticed for a long
 * time, because nothing in the app requests them while somebody is looking.
 *
 * This test walks the directory instead of trusting the list.
 */

const PUBLIC = fileURLToPath(new URL('../../mobile/public/', import.meta.url));

/** Every path `public/` puts at the root of the export, as a URL path. */
function publicPaths(dir = PUBLIC, prefix = '/'): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // `_headers` is configuration for the asset server, not a file to serve.
    if (entry.name === '_headers') continue;
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory()) out.push(...publicPaths(`${dir}${entry.name}/`, `${path}/`));
    else out.push(path);
  }
  return out;
}

describe('the Worker serves what the export carries', () => {
  test('every file in public/ is on the list', () => {
    const missed = publicPaths().filter((p) => {
      // index.html is served AT `/`, not at its own name - on both
      // deployments. Asking for it by name is a 404 either way.
      if (p === '/index.html') return false;
      return !servedFromExport(p);
    });
    assert.deepEqual(
      missed, [],
      `these would answer 401 on Workers and 200 on Node: ${missed.join(', ')}`,
    );
  });

  test('the directory is actually being read', () => {
    // A walk that silently finds nothing would make the test above pass for
    // ever. The icons are the ones that were broken, so they are named.
    const paths = publicPaths();
    assert.ok(paths.length >= 5, `only found ${paths.length} file(s) under public/`);
    assert.ok(paths.includes('/robots.txt'));
    assert.ok(paths.some((p) => p.startsWith('/icons/')));
  });

  test('the API is still the API', () => {
    // The list must not grow into a catch-all: a path that reaches the export
    // instead of the routes is a feature that stops answering.
    /*
      `/admin/export` matters more here than the others. `worker.ts` tries
      Workers Assets FIRST for every GET whose path is on this list, and the
      export is the first operator route that is a GET - the import is a POST,
      which never reaches the asset check at all. A path that drifted onto the
      list would answer a backup request with a static file, or a 404 that
      looks exactly like an unarmed deployment.
    */
    for (const p of ['/health', '/wallet', '/quests', '/admin/import', '/admin/export', '/admin/export/batch', '/shops']) {
      assert.ok(!servedFromExport(p), `${p} would be served as a static file`);
    }
  });

  test('a database-backed media id still reaches the API', () => {
    /*
      `/media/` IS on the list, and that is deliberate: the export carries
      place photographs under it. A request that the export does not have
      falls through to the API in `worker.ts`, which is what keeps
      `/media/<id>` - a row, not a file - working. This test records that the
      prefix is shared on purpose, so nobody "fixes" it by removing it.
    */
    assert.ok(servedFromExport('/media/ku-park.jpg'));
    assert.ok(servedFromExport('/media/01J9Zc4K2Q'));
  });

  test('the promo page and the crawler files are served, and nothing near them is', () => {
    for (const p of ['/th', '/th/', '/th/img/hero.webp', '/sitemap.xml', '/llms.txt', '/robots.txt']) {
      assert.ok(servedFromExport(p), `${p} would reach the API`);
    }
    assert.ok(publicPaths().includes('/th/index.html'), 'public/th/index.html is missing');
    for (const p of ['/thanks', '/thx', '/sitemap', '/llms']) {
      assert.ok(!servedFromExport(p), `${p} would be served as a static file`);
    }
  });

  test('the privacy policy and about page are served by their short names, and nothing near them is', () => {
    // Google's OAuth consent screen links to these. A 401 from the device-key
    // middleware there is an app that cannot leave Testing mode.
    for (const p of ['/privacy', '/about']) {
      // The short name is served; the other two spellings are redirected to it by the asset server.
      for (const spelling of [p, `${p}.html`, `${p}/`]) {
        assert.ok(servedFromExport(spelling), `${spelling} would reach the API`);
      }
      assert.ok(publicPaths().includes(`${p}.html`), `public${p}.html is missing`);
    }
    for (const p of ['/privacy/anything', '/about-us', '/aboutx', '/privacyx']) {
      assert.ok(!servedFromExport(p), `${p} would be served as a static file`);
    }
  });
});
