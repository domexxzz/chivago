/**
 * The island's files must come from the app's own origin.
 *
 * WHY THIS FILE EXISTS. The public demo is built with
 * `EXPO_PUBLIC_API_URL=http://localhost:8787`, because its own in-process
 * server answers the app's calls to that address from a snapshot. The island
 * page is not the app: it runs inside an iframe of its own and makes its own
 * requests, which that server never sees. So the demo asked the VISITOR'S OWN
 * MACHINE for a megabyte of island, nothing answered, no canvas was ever
 * created, and the demo link - the one a judge opens - had never once shown
 * the island to anybody.
 *
 * The five build checks could not catch it. They grep the export for
 * `localhost:8787`, and the demo is deliberately exempt because its app code
 * is SUPPOSED to contain that string. Even without the exemption a grep would
 * have missed it: the url is built at run time from a base and a path, so
 * `localhost:8787/islands/` appears nowhere in any file.
 *
 * A string search cannot see a string that does not exist yet. This can.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dioramaPage, pageBase } from '../src/components/IslandDiorama.tsx';

/** Every absolute http(s) url the page will fetch from. */
const hostsIn = (html: string): string[] => {
  const found = html.match(/https?:\/\/[^'"`\s)]+/g) ?? [];
  return [...new Set(found.map((u) => new URL(u).host))];
};

test('THE DEMO BUILD DOES NOT SEND A VISITOR TO THEIR OWN MACHINE', () => {
  /*
    The regression itself, and the only assertion here that would have failed
    before the fix. The page builder was always innocent - it uses whatever
    base it is handed - and the fault was in the handing: API_BASE, which in
    the demo build is http://localhost:8787.
  */
  assert.equal(pageBase('web', 'http://localhost:8787'), '');
  assert.equal(pageBase('web', 'https://chivargo.com'), '');
  assert.equal(pageBase('ios', 'https://chivargo.com'), 'https://chivargo.com');
  assert.equal(pageBase('android', 'https://chivargo.com'), 'https://chivargo.com');
});

test('on the web the island asks its own origin, whatever the API base is', () => {
  /*
    '' is what the web build passes: a relative path resolves against the
    origin that served the page, which is right for the live site and right
    for the demo, without either of them having to know its own name.
  */
  const page = dioramaPage('koh-sichang', '');

  assert.ok(
    page.includes("'/islands/koh-sichang.glb'") || page.includes('/islands/koh-sichang.glb'),
    'the page must ask for the island',
  );
  assert.ok(
    !page.includes('localhost'),
    'a page built for the web must never name localhost - that is the visitor\'s own machine',
  );

  /*
    The only absolute hosts left may be the XML namespaces SVG needs, which
    are identifiers rather than anywhere the page fetches from.
  */
  const hosts = hostsIn(page).filter((h) => h !== 'www.w3.org');
  assert.deepEqual(hosts, [], `the page should fetch from no other host, got ${hosts.join(', ')}`);
});

test('a native base is still absolute, because a WebView has no origin to be relative to', () => {
  /*
    The other half of the same rule. On native the page is handed bare HTML
    with no document url, so a relative path has nothing to resolve against
    and only an absolute host will do. Changing the web case must not quietly
    take this away.
  */
  const page = dioramaPage('koh-sichang', 'https://chivargo.com');
  assert.ok(page.includes('https://chivargo.com/islands/koh-sichang.glb'));
  assert.ok(page.includes('https://chivargo.com/vendor/'));
});

test('the vendored three.js is asked for by the same rule', () => {
  /*
    three.js is imported as an ES MODULE, which fails differently and more
    silently than a fetch: the browser refuses the import and the module body
    never runs, so none of the page's own error handling exists yet to report
    it. It gets the same base for the same reason.
  */
  const web = dioramaPage('koh-sichang', '');
  assert.ok(web.includes("from '/vendor/three-"), 'the web page must import three from its own origin');
  assert.ok(!web.includes('//cdn.'), 'three.js is served from here, not from a CDN');
});
