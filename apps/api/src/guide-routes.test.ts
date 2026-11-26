/**
 * The guide's contract with crawlers.
 *
 * Three things here have each cost this project something real, so each is
 * pinned:
 *
 *  1. A PUBLIC PAGE THAT ANSWERS 401. On the first Workers deployment
 *     /robots.txt answered 401 because it was not on a list, and the traveller
 *     gate was answering a request never meant to reach it. A guide page is
 *     for strangers; it must work with no device key even once a phone has
 *     registered, which is when `openIdentityAllowed` stops saving us.
 *  2. A CANONICAL THAT POINTS AT A REDIRECT. Every canonical and hreflang on
 *     the marketing page pointed at a `.html` URL that answers 307, so Google
 *     discarded the whole language cluster. Nothing here may carry one.
 *  3. AN IMAGE PUBLISHED WITHOUT ITS CREDIT. These photographs are Wikimedia
 *     Commons, mostly CC BY or CC BY-SA, and attribution is a condition of
 *     the licence rather than a courtesy. A row whose credit is missing must
 *     render no image at all.
 */
import { strict as assert } from 'node:assert';
import { before, describe, test } from 'node:test';

delete process.env.CHIVAGO_OPEN_IDENTITY;
process.env.CHIVAGO_DB = ':memory:';
process.env.CHIVAGO_PUBLIC_URL = 'https://chivargo.example';
const { app, db } = await import('./server-node.ts');

const ORIGIN = 'https://chivargo.example';

/** On the island, with a photograph we are allowed to show. */
const ON_ISLAND = 'g-palace';
/** On the island, photograph present but UNCREDITED, so unpublishable. */
const NO_CREDIT = 'g-nocredit';
/** A real place that is not on Koh Sichang: it must not get a page. */
const OFF_ISLAND = 'g-mainland';
/**
 * Ko Kham Yai, a Koh Sichang attraction that sits just OUTSIDE the main
 * island's bounding box - 100.8245 against a maxLng of 100.8230. The first
 * version of the filter used `isOnKohSichang`, the strict no-margin check,
 * and silently dropped it. Pinned here because nothing failed when it did.
 */
const OFF_BBOX = 'g-ko-kham-yai';
/**
 * A row carrying the two payloads the review found: a name that closes the
 * JSON-LD script element, and a photo source that is a `javascript:` URL.
 * Both rendered before this was fixed - the first put a live <img> in the
 * document, the second a clickable script link dressed as a photo credit.
 */
const HOSTILE = 'g-hostile';

const insertPlace = (place: {
  id: string; lat: number; lng: number; nameEn?: string;
  photoUrl?: string | null; photoCredit?: string | null; photoSource?: string | null;
}) => {
  db.prepare(
    `INSERT INTO places (
       id, name_en, name_th, short, layer, lat, lng, meta, blurb_en, blurb_th,
       tags, photo_url, photo_credit, photo_licence, photo_source,
       safety_label_en, safety_label_th,
       crowd_density, aqi, safety_index, walkability
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    place.id, place.nameEn ?? 'Phra Chudadhuj Palace', 'พระจุฑาธุชราชฐาน', 'Palace', 'Wellness',
    place.lat, place.lng, '{}',
    'The only royal palace built on an island, with "quoted" grounds & gardens.',
    'พระราชฐานแห่งเดียวที่สร้างบนเกาะ',
    JSON.stringify(['History', 'Palace']),
    place.photoUrl ?? null, place.photoCredit ?? null,
    place.photoCredit ? 'CC BY 4.0' : null,
    place.photoCredit
      ? (place.photoSource ?? 'https://commons.wikimedia.org/wiki/File:Example.jpg')
      : null,
    'Staffed palace grounds', 'อยู่ในเขตพระราชฐาน',
    0.2, 30, 0.9, 0.8,
  );
};

const get = (path: string) => app.request(path, { method: 'GET' });

const schemaOf = (html: string): any[] => {
  const match = html.match(/application\/ld\+json">(.*?)<\/script>/s);
  assert.ok(match, 'the page carries no JSON-LD');
  return JSON.parse(match![1]!)['@graph'];
};

const nodeOf = (graph: any[], type: string) =>
  graph.find((n) => {
    const types: string[] = Array.isArray(n['@type']) ? n['@type'] : [n['@type']];
    return types.includes(type);
  });

before(() => {
  insertPlace({
    id: ON_ISLAND, lat: 13.1504555, lng: 100.8180568,
    photoUrl: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Example.jpg?width=1280',
    photoCredit: 'Supanut Arunoprayote',
  });
  insertPlace({
    id: NO_CREDIT, lat: 13.1564464, lng: 100.8075131,
    photoUrl: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Uncredited.jpg',
    photoCredit: null,
  });
  // The real Ko Kham Yai coordinate, from the seed.
  insertPlace({ id: OFF_BBOX, lat: 13.1679437, lng: 100.8245248 });
  insertPlace({
    id: HOSTILE, lat: 13.1504, lng: 100.8180,
    nameEn: '</script><img src=x onerror=alert(1)>',
    photoUrl: 'https://commons.example/a.jpg', photoCredit: 'Someone',
    photoSource: 'javascript:alert(document.cookie)',
  });
  // The Si Racha campus, on the mainland twelve kilometres east: in the same
  // province, and outside `inArea`'s margin. This is the place the margin
  // must not sweep in.
  insertPlace({ id: OFF_ISLAND, lat: 13.1205, lng: 100.9205 });

  /*
    A registered device, which is what closes the open-identity door. Without
    this row `openIdentityAllowed()` is true and every route answers happily
    to anybody, so the "no device key" tests below would pass on a site that
    is in fact shut to strangers. This is the row that makes them mean
    something.
  */
  const now = new Date().toISOString();
  db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)')
    .run('u-guide', 'Traveller', now);
  db.prepare('INSERT INTO device_keys (key_hash, user_id, label, created_at, last_seen_at) VALUES (?,?,?,?,?)')
    .run('hash-for-guide-test', 'u-guide', 'guide test', now, now);
});

describe('a stranger with no device key can read the guide', () => {
  test('the index, a place, and the sitemap all answer 200', async () => {
    for (const path of ['/guide/th', '/guide/en', `/guide/th/${ON_ISLAND}`, '/guide/sitemap.xml']) {
      const response = await get(path);
      assert.equal(response.status, 200, `${path} answered ${response.status}`);
    }
  });

  test('an unknown language and an unknown place are 404, not 401', async () => {
    assert.equal((await get('/guide/de')).status, 404);
    assert.equal((await get('/guide/th/no-such-place')).status, 404);
  });

  test('a bare /guide and the trailing slashes redirect to the real page', async () => {
    for (const path of ['/guide', '/guide/']) {
      const response = await get(path);
      assert.equal(response.status, 301);
      assert.equal(response.headers.get('location'), '/guide/th');
    }
    const withSlash = await get('/guide/en/');
    assert.equal(withSlash.status, 301);
    assert.equal(withSlash.headers.get('location'), '/guide/en');
  });
});

describe('only the island is published', () => {
  test('a mainland place has no page and appears in neither index nor sitemap', async () => {
    assert.equal((await get(`/guide/th/${OFF_ISLAND}`)).status, 404);
    const index = await (await get('/guide/th')).text();
    const sitemap = await (await get('/guide/sitemap.xml')).text();
    for (const [name, text] of [['index', index], ['sitemap', sitemap]] as const) {
      assert.ok(!text.includes(OFF_ISLAND), `the ${name} names a mainland place`);
      assert.ok(text.includes(ON_ISLAND), `the ${name} is missing an island place`);
    }
  });

  test('an island attraction just outside the main bounding box is published', async () => {
    assert.equal((await get(`/guide/th/${OFF_BBOX}`)).status, 200);
    const index = await (await get('/guide/th')).text();
    assert.ok(index.includes(OFF_BBOX), 'Ko Kham Yai is missing from the index');
  });
});

describe('the URLs a crawler is told to trust', () => {
  test('no page or sitemap points at a URL with a file extension', async () => {
    for (const path of ['/guide/th', '/guide/en', `/guide/th/${ON_ISLAND}`, '/guide/sitemap.xml']) {
      const text = await (await get(path)).text();
      for (const url of text.match(/https:\/\/chivargo\.example\/guide[^"'\s<>)]*/g) ?? []) {
        assert.ok(!/\.(html|xml)$/.test(url.replace('/guide/sitemap.xml', '')),
          `${path} points at ${url}`);
      }
    }
  });

  test('each page is its own canonical and carries the whole hreflang set', async () => {
    for (const [lang, path] of [['th', '/guide/th'], ['en', '/guide/en'],
      ['th', `/guide/th/${ON_ISLAND}`], ['en', `/guide/en/${ON_ISLAND}`]] as const) {
      const html = await (await get(path)).text();
      assert.ok(html.includes(`<link rel="canonical" href="${ORIGIN}${path}">`),
        `${path} is not its own canonical`);
      assert.ok(html.includes(`<html lang="${lang}">`), `${path} is not marked as ${lang}`);
      // Both languages of THIS page, plus x-default, on every one of them.
      const sibling = path.replace(`/guide/${lang}`, lang === 'th' ? '/guide/en' : '/guide/th');
      const thai = lang === 'th' ? path : sibling;
      assert.ok(html.includes(`hreflang="th" href="${ORIGIN}${thai}"`), `${path} lacks the th alternate`);
      assert.ok(html.includes(`hreflang="en" href="${ORIGIN}${lang === 'en' ? path : sibling}"`),
        `${path} lacks the en alternate`);
      assert.ok(html.includes(`hreflang="x-default" href="${ORIGIN}${thai}"`),
        `${path} lacks x-default`);
    }
  });

  test('the sitemap gives every page both languages and an x-default', async () => {
    const sitemap = await (await get('/guide/sitemap.xml')).text();
    const locs = sitemap.match(/<loc>/g) ?? [];
    // Two index pages plus four island places in two languages.
    assert.equal(locs.length, 2 + 4 * 2);
    assert.equal((sitemap.match(/<xhtml:link/g) ?? []).length, locs.length * 3);
    assert.ok(sitemap.includes(`${ORIGIN}/guide/th/${NO_CREDIT}`));
  });
});

describe('the structured data', () => {
  test('a place is a located TouristAttraction with numeric coordinates', async () => {
    const graph = schemaOf(await (await get(`/guide/en/${ON_ISLAND}`)).text());
    const place = nodeOf(graph, 'TouristAttraction');
    assert.equal(place.name, 'Phra Chudadhuj Palace');
    assert.equal(typeof place.geo.latitude, 'number', 'a coordinate must not be a string');
    assert.equal(place.geo.latitude, 13.1504555);
    assert.equal(place.isAccessibleForFree, true);
    // The island it is on, and the province that island is in.
    const island = nodeOf(graph, 'TouristDestination');
    assert.equal(place.containedInPlace['@id'], island['@id']);
    assert.equal(island.containedInPlace.identifier, 'TH-20');
    assert.equal(nodeOf(graph, 'BreadcrumbList').itemListElement.length, 3);
  });

  test('the index lists every published place in order', async () => {
    const graph = schemaOf(await (await get('/guide/th')).text());
    const list = nodeOf(graph, 'CollectionPage').mainEntity;
    assert.equal(list.numberOfItems, 4);
    assert.deepEqual(list.itemListElement.map((i: any) => i.position), [1, 2, 3, 4]);
    // Ordered by id, so the list is the same list on every request.
    assert.deepEqual(
      list.itemListElement.map((i: any) => i.url),
      [
        `${ORIGIN}/guide/th/${HOSTILE}`,
        `${ORIGIN}/guide/th/${OFF_BBOX}`,
        `${ORIGIN}/guide/th/${NO_CREDIT}`,
        `${ORIGIN}/guide/th/${ON_ISLAND}`,
      ],
    );
  });

  test('the place name is escaped, not injected', async () => {
    const html = await (await get(`/guide/en/${ON_ISLAND}`)).text();
    assert.ok(html.includes('&quot;quoted&quot; grounds &amp; gardens'),
      'the blurb was not escaped');
    assert.ok(!html.includes('"quoted" grounds & gardens'));
  });
});

describe('a photograph is published with its credit or not at all', () => {
  test('a credited photograph is shown, with its licence and source', async () => {
    const html = await (await get(`/guide/en/${ON_ISLAND}`)).text();
    assert.ok(html.includes('<img src='), 'the credited photograph is missing');
    assert.ok(html.includes('Supanut Arunoprayote'), 'the credit is missing');
    assert.ok(html.includes('CC BY 4.0'), 'the licence is missing');
    assert.ok(html.includes('rel="license noopener nofollow"'), 'the source is not linked as a licence');
    const image = nodeOf(schemaOf(html), 'TouristAttraction').image;
    assert.equal(image.creditText, 'Supanut Arunoprayote');
    assert.equal(image.license, 'CC BY 4.0');
  });

  test('an uncredited photograph is not shown at all, in markup or schema', async () => {
    const html = await (await get(`/guide/th/${NO_CREDIT}`)).text();
    assert.ok(!html.includes('<img src='), 'an uncredited photograph was published');
    assert.ok(!html.includes('Uncredited.jpg'), 'an uncredited photograph was published');
    assert.equal(nodeOf(schemaOf(html), 'TouristAttraction').image, undefined,
      'an uncredited photograph was claimed in the schema');
    // The page itself is still perfectly good; it just has no picture.
    assert.ok(html.includes('<h1>'), 'the page lost its heading with its photograph');
  });
});

describe('nothing in a database row can become markup', () => {
  test('a name holding </script> cannot end the JSON-LD element', async () => {
    const html = await (await get(`/guide/en/${HOSTILE}`)).text();
    assert.ok(!html.includes('</script><img src=x'), 'the script element was closed by the data');
    assert.ok(!/<img src=x onerror=/.test(html), 'a live img tag reached the document');
    // And the graph still carries the real name, escaped rather than mangled.
    assert.equal(
      nodeOf(schemaOf(html), 'TouristAttraction').name,
      '</script><img src=x onerror=alert(1)>',
    );
  });

  test('a javascript: photo source is not linked, and the licence is still named', async () => {
    const html = await (await get(`/guide/en/${HOSTILE}`)).text();
    assert.ok(!html.includes('javascript:'), 'a javascript: URL was rendered as an href');
    assert.ok(html.includes('CC BY 4.0'), 'the licence lost its name along with its link');
    assert.equal(
      nodeOf(schemaOf(html), 'TouristAttraction').image.acquireLicensePage, undefined,
      'a javascript: URL was published in the schema',
    );
  });

  test('the image never claims a size nobody measured', async () => {
    const html = await (await get(`/guide/en/${ON_ISLAND}`)).text();
    assert.ok(html.includes('<img src='), 'the photograph is missing');
    assert.ok(!/<img[^>]*\swidth="/.test(html),
      'the image asserts a width that was a guess, which is what shifts the layout');
  });
});
