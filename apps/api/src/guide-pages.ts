/**
 * The guide: one crawlable HTML page per place.
 *
 * WHY THIS EXISTS. chivargo.com is an Expo web export - the whole app is
 * rendered in the browser. To anything that does not run JavaScript, and most
 * of what grounds a generated answer does not, the entire site is a `<title>`
 * and an empty `<div>`; the only readable content is the marketing page at
 * /th/. Every place the app knows about - a palace, a shrine, a cave temple,
 * each with a bilingual description and a coordinate - was invisible. For a
 * product about two islands that is the whole geographic surface, missing.
 *
 * ITS OWN FILE SO IT CAN BE TESTED, the same reason `served-from-export.ts`
 * and `board.ts` are their own files: `worker.ts` imports `cloudflare:workers`,
 * which the node test runner cannot load, so anything beside the fetch handler
 * is unreachable from a test. Rendering is pure - rows in, string out.
 *
 * NOT AT /places/<id>, WHICH IS ALREADY THE JSON API. Serving HTML there by
 * sniffing `Accept` would mean one URL answering two things, which caches
 * badly and breaks whenever a client sends a header nobody predicted. The
 * guide gets its own space, with the language in the path rather than
 * negotiated, so every page has exactly one address.
 *
 * WHAT IS DELIBERATELY NOT HERE: the live metrics. A place carries an AQI, a
 * crowd reading and a safety index, and all three are overwritten from live
 * feeds. A number on a page a crawler keeps for weeks is a number that will
 * be wrong, and publishing a stale air reading beside a real place name is
 * worse than publishing none. The page states facts that do not move, and
 * says the app has the rest.
 */

import {
  type Area,
  areaByKey,
  inArea,
  nearestArea,
} from '@chivago/core';

/**
 * The languages a place exists in.
 *
 * TWO, NOT THREE, and that is the data's doing rather than a decision: the
 * `places` table holds `name_en`/`name_th` and `blurb_en`/`blurb_th` and no
 * Chinese at all, while the marketing page has all three. A Chinese page
 * built by falling back to English would be an hreflang claiming a
 * translation that does not exist, which is worse than not offering one.
 * Adding 'zh' here is the only change needed once the columns exist.
 */
export const GUIDE_LANGS = ['th', 'en'] as const;
export type GuideLang = (typeof GUIDE_LANGS)[number];

/** The language a bare /guide resolves to, matching the site's own default. */
export const GUIDE_DEFAULT_LANG: GuideLang = 'th';

export const isGuideLang = (value: string): value is GuideLang =>
  (GUIDE_LANGS as readonly string[]).includes(value);

/** The area the guide publishes. Koh Sichang is the pilot: the quests, the
 *  hosts and the verified activity are all there. */
export const GUIDE_AREA = 'koh-sichang';

/**
 * The province names behind the ISO 3166-2:TH codes in `areas.ts`.
 *
 * The area registry stores the code and not the name, deliberately - a code
 * is one thing to trust and look up. A page has to show a reader a word, so
 * the four codes the areas actually use are spelled out here.
 */
const PROVINCES: Record<string, { th: string; en: string }> = {
  'TH-10': { th: 'กรุงเทพมหานคร', en: 'Bangkok' },
  'TH-13': { th: 'ปทุมธานี', en: 'Pathum Thani' },
  'TH-20': { th: 'ชลบุรี', en: 'Chon Buri' },
  'TH-84': { th: 'สุราษฎร์ธานี', en: 'Surat Thani' },
};

/** A place as the guide reads it: the published columns, and nothing scored. */
export interface GuidePlace {
  id: string;
  name_th: string;
  name_en: string;
  blurb_th: string;
  blurb_en: string;
  lat: number;
  lng: number;
  tags: string;
  photo_url: string | null;
  photo_credit: string | null;
  photo_licence: string | null;
  photo_source: string | null;
  safety_label_th: string;
  safety_label_en: string;
}

export const guideIndexPath = (lang: GuideLang): string => `/guide/${lang}`;
export const guidePlacePath = (lang: GuideLang, id: string): string =>
  `/guide/${lang}/${encodeURIComponent(id)}`;

/**
 * Whether this place is one the guide publishes.
 *
 * BOTH CHECKS, AND MEASURED RATHER THAN REASONED. The first attempt used
 * `isOnKohSichang`, which looked like the obvious answer and is the wrong
 * one: it is deliberately the strict check, written for a
 * navigation-provider decision, with no margin at all. Run against the real
 * seeded island it silently dropped Ko Kham Yai - a fishing-community island
 * the seed lists as a Koh Sichang attraction, whose pier the island's own
 * bounding box was drawn to reach, and which sits 15 metres of longitude
 * outside it. A guide missing one of its ten places, with nothing failing.
 *
 * So: `inArea`, whose margin exists exactly so that a place just off a frame
 * still belongs to it, AND `nearestArea`, which throws out the mainland that
 * the same margin would otherwise sweep in - the Si Racha campus is twelve
 * kilometres east and in the same province. Each check alone is wrong in a
 * way the other is not.
 */
export const inGuide = (place: { lat: number; lng: number }): boolean =>
  inArea(areaByKey(GUIDE_AREA), place)
  && nearestArea(place.lat, place.lng).key === GUIDE_AREA;

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const pick = <T>(lang: GuideLang, th: T, en: T): T => (lang === 'th' ? th : en);

const tagsOf = (place: GuidePlace): string[] => {
  try {
    const parsed: unknown = JSON.parse(place.tags);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
};

/**
 * Whether the photograph may be published.
 *
 * The `places` schema says it beside the column: "a photo with no credit is
 * one we cannot legally publish". These images are Wikimedia Commons, mostly
 * CC BY or CC BY-SA, and both licences require attribution as a condition of
 * use - so a page that shows the image without the credit is not merely
 * impolite, it is outside the licence. The check is here rather than in the
 * template so there is one answer to it.
 */
export const publishablePhoto = (place: GuidePlace): boolean =>
  Boolean(place.photo_url && place.photo_credit && place.photo_licence);

const WORDS = {
  guide: { th: 'คู่มือสถานที่', en: 'Place guide' },
  island: { th: 'เกาะสีชัง', en: 'Koh Sichang' },
  // The WORD island, not the island's name: the row beside it holds the
  // name, and using `island` for both read "Koh Sichang / Koh Sichang".
  islandLabel: { th: 'เกาะ', en: 'Island' },
  intro: {
    th: 'สถานที่บนเกาะสีชัง จังหวัดชลบุรี ที่ ChivarGo พาไปสำรวจ แต่ละแห่งมีพิกัด คำอธิบาย และภารกิจที่ทำได้ในแอป',
    en: 'The places on Koh Sichang, Chon Buri, that ChivarGo takes you to. Each one has a coordinate, a description, and quests you can take on in the app.',
  },
  where: { th: 'ที่ตั้ง', en: 'Where it is' },
  province: { th: 'จังหวัด', en: 'Province' },
  coords: { th: 'พิกัด', en: 'Coordinates' },
  safety: { th: 'ข้อควรรู้', en: 'Good to know' },
  openInApp: { th: 'เปิดใน ChivarGo', en: 'Open in ChivarGo' },
  allPlaces: { th: 'สถานที่ทั้งหมด', en: 'All places' },
  photoBy: { th: 'ภาพโดย', en: 'Photograph by' },
  licence: { th: 'สัญญาอนุญาต', en: 'Licence' },
  source: { th: 'แหล่งที่มา', en: 'Source' },
  liveNote: {
    th: 'ค่าอากาศ ความหนาแน่น และสภาพปัจจุบันของสถานที่นี้ดูได้ในแอป หน้านี้แสดงเฉพาะข้อมูลที่ไม่เปลี่ยนแปลง',
    en: 'Air quality, how busy it is and today’s conditions are in the app. This page carries only what does not change.',
  },
  otherLang: { th: 'English', en: 'ไทย' },
  home: { th: 'ChivarGo', en: 'ChivarGo' },
  placeCount: { th: 'สถานที่', en: 'places' },
} as const;

const word = (key: keyof typeof WORDS, lang: GuideLang): string => WORDS[key][lang];

const STYLE = `
:root{--bg:#fbfaf7;--ink:#13232b;--dim:#5c7078;--line:#e2e0d8;--teal:#0e7480;--deep:#083b55;--card:#fff}
@media(prefers-color-scheme:dark){:root{--bg:#0b1418;--ink:#f2f4f1;--dim:#8fa3a8;--line:#22323a;--teal:#3fa8b4;--deep:#cfe6ef;--card:#142026}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:"Noto Sans Thai","Anuphan",system-ui,-apple-system,sans-serif;line-height:1.65}
.wrap{max-width:720px;margin:0 auto;padding:0 16px}
header{border-bottom:1px solid var(--line);padding:18px 0}
header a{color:var(--teal);text-decoration:none;font-weight:600}
nav.crumb{font-size:14px;color:var(--dim);padding:16px 0 0}
nav.crumb a{color:var(--teal)}
h1{font-size:clamp(1.6rem,1.2rem+2vw,2.3rem);line-height:1.2;margin:14px 0 6px;letter-spacing:-.01em}
h2{font-size:1.1rem;margin:28px 0 8px;color:var(--deep)}
p{margin:10px 0}
.lede{font-size:1.08rem;color:var(--ink)}
figure{margin:20px 0 8px}
figure img{width:100%;height:auto;border-radius:12px;display:block;background:var(--card)}
figcaption{font-size:13px;color:var(--dim);margin-top:8px}
figcaption a{color:var(--teal)}
dl{display:grid;grid-template-columns:auto 1fr;gap:4px 16px;margin:10px 0;font-size:15px}
dt{color:var(--dim)}
dd{margin:0}
.tags{list-style:none;display:flex;flex-wrap:wrap;gap:8px;padding:0;margin:14px 0}
.tags li{font-size:13px;border:1px solid var(--line);border-radius:999px;padding:3px 11px;color:var(--dim)}
.cta{display:inline-block;margin:18px 0 4px;background:var(--teal);color:#fff;padding:11px 20px;border-radius:999px;text-decoration:none;font-weight:600}
@media(prefers-color-scheme:dark){.cta{color:#06161a}}
.note{font-size:14px;color:var(--dim);border-left:3px solid var(--line);padding-left:14px;margin:22px 0}
ul.places{list-style:none;padding:0;margin:18px 0}
ul.places li{border-bottom:1px solid var(--line);padding:14px 0}
ul.places a{color:var(--ink);text-decoration:none;font-weight:600;font-size:1.05rem}
ul.places p{margin:4px 0 0;font-size:14px;color:var(--dim)}
footer{border-top:1px solid var(--line);margin-top:40px;padding:20px 0 40px;font-size:14px;color:var(--dim)}
footer a{color:var(--teal)}
a:focus-visible,.cta:focus-visible{outline:2px solid var(--teal);outline-offset:3px}
`.trim();

interface Shell {
  origin: string;
  lang: GuideLang;
  path: string;
  title: string;
  description: string;
  schema: unknown;
  body: string;
  image?: string;
}

/**
 * Every page's head, and the one place the URL rules live.
 *
 * The hreflang set is complete on every page, its own entry included: a
 * one-directional annotation is ignored, which is exactly how the marketing
 * page's three languages came to count for nothing. `x-default` is Thai, as
 * it is there. None of these URLs carries a file extension, because Workers
 * Assets answers that spelling with a 307 and a canonical pointing at a
 * redirect is a canonical that is thrown away.
 */
const page = ({ origin, lang, path, title, description, schema, body, image }: Shell): string => {
  const alternates = GUIDE_LANGS
    .map((l) => `<link rel="alternate" hreflang="${l}" href="${origin}${pathFor(path, lang, l)}">`)
    .join('')
    + `<link rel="alternate" hreflang="x-default" href="${origin}${pathFor(path, lang, GUIDE_DEFAULT_LANG)}">`;
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${esc(title)}</title>`
    + `<meta name="description" content="${esc(description)}">`
    + `<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">`
    + `<link rel="canonical" href="${origin}${path}">${alternates}`
    + `<meta name="theme-color" content="#083b55">`
    + `<meta property="og:type" content="article"><meta property="og:site_name" content="ChivarGo">`
    + `<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">`
    + `<meta property="og:url" content="${origin}${path}">`
    + (image ? `<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image">` : '')
    + `<style>${STYLE}</style>`
    + `<script type="application/ld+json">${JSON.stringify(schema)}</script>`
    + `</head><body>${body}</body></html>\n`;
};

/** The same page in another language: only the language segment changes. */
const pathFor = (path: string, from: GuideLang, to: GuideLang): string =>
  path.replace(new RegExp(`^/guide/${from}(?=/|$)`), `/guide/${to}`);

const header = (lang: GuideLang): string =>
  `<header><div class="wrap"><a href="/">${word('home', lang)}</a></div></header>`;

const footer = (lang: GuideLang, path: string): string => {
  const other = GUIDE_LANGS.find((l) => l !== lang) ?? lang;
  return `<footer><div class="wrap">`
    + `<a href="${guideIndexPath(lang)}">${word('allPlaces', lang)}</a> · `
    + `<a href="${pathFor(path, lang, other)}" hreflang="${other}">${word('otherLang', lang)}</a> · `
    + `<a href="${lang === 'th' ? '/th/' : '/th/en'}">ChivarGo</a>`
    + `</div></footer>`;
};

const crumbs = (lang: GuideLang, here?: string): string =>
  `<nav class="crumb" aria-label="${lang === 'th' ? 'เส้นทาง' : 'Breadcrumb'}"><div class="wrap">`
  + `<a href="/">ChivarGo</a> › `
  + (here
    ? `<a href="${guideIndexPath(lang)}">${word('island', lang)}</a> › ${esc(here)}`
    : word('island', lang))
  + `</div></nav>`;

const breadcrumbSchema = (origin: string, lang: GuideLang, place?: GuidePlace) => ({
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'ChivarGo', item: `${origin}/` },
    { '@type': 'ListItem', position: 2, name: WORDS.island[lang], item: `${origin}${guideIndexPath(lang)}` },
    ...(place
      ? [{
        '@type': 'ListItem', position: 3, name: pick(lang, place.name_th, place.name_en),
        item: `${origin}${guidePlacePath(lang, place.id)}`,
      }]
      : []),
  ],
});

/**
 * The island itself, as the node every place hangs off.
 *
 * The coordinate and the province agree with `packages/core/src/areas.ts`,
 * where the provenance is recorded: the point is the town node in
 * OpenStreetMap (node 487180518, by Tha Lang pier).
 */
const islandSchema = (origin: string, lang: GuideLang, area: Area) => {
  const province = PROVINCES[area.province];
  return {
    '@type': 'TouristDestination',
    '@id': `${origin}/#koh-sichang`,
    name: pick(lang, area.name.th, area.name.en),
    url: `${origin}${guideIndexPath(lang)}`,
    geo: { '@type': 'GeoCoordinates', latitude: area.center.lat, longitude: area.center.lng },
    ...(province
      ? {
        address: {
          '@type': 'PostalAddress',
          addressRegion: pick(lang, province.th, province.en),
          addressCountry: 'TH',
        },
        containedInPlace: {
          '@type': 'AdministrativeArea',
          name: pick(lang, province.th, province.en),
          identifier: area.province,
        },
      }
      : {}),
  };
};

/**
 * One place, as a thing with a location.
 *
 * `TouristAttraction` rather than a bare `Place`, because that is what each of
 * these is and the more specific type is the one an answer engine can use.
 * The image carries `license`, `creditText` and `acquireLicensePage`: those
 * are the Commons terms the photograph arrived under, which we are obliged to
 * state anyway, and stating them in the markup is also what makes the image
 * eligible rather than merely borrowed.
 */
export const placeSchema = (origin: string, lang: GuideLang, place: GuidePlace, area: Area) => {
  const province = PROVINCES[area.province];
  const tags = tagsOf(place);
  return {
    '@type': 'TouristAttraction',
    '@id': `${origin}${guidePlacePath(lang, place.id)}#place`,
    name: pick(lang, place.name_th, place.name_en),
    description: pick(lang, place.blurb_th, place.blurb_en),
    url: `${origin}${guidePlacePath(lang, place.id)}`,
    geo: { '@type': 'GeoCoordinates', latitude: place.lat, longitude: place.lng },
    isAccessibleForFree: true,
    inLanguage: lang,
    containedInPlace: { '@id': `${origin}/#koh-sichang` },
    ...(province
      ? {
        address: {
          '@type': 'PostalAddress',
          addressRegion: pick(lang, province.th, province.en),
          addressCountry: 'TH',
        },
      }
      : {}),
    ...(tags.length ? { keywords: tags.join(', ') } : {}),
    ...(publishablePhoto(place)
      ? {
        image: {
          '@type': 'ImageObject',
          contentUrl: place.photo_url,
          creditText: place.photo_credit,
          license: place.photo_licence,
          ...(place.photo_source ? { acquireLicensePage: place.photo_source } : {}),
        },
      }
      : {}),
  };
};

/** One place's page. */
export function placePage(
  origin: string, lang: GuideLang, place: GuidePlace, area: Area = areaByKey(GUIDE_AREA),
): string {
  const name = pick(lang, place.name_th, place.name_en);
  const blurb = pick(lang, place.blurb_th, place.blurb_en);
  const safety = pick(lang, place.safety_label_th, place.safety_label_en);
  const province = PROVINCES[area.province];
  const tags = tagsOf(place);
  const path = guidePlacePath(lang, place.id);
  const shows = publishablePhoto(place);

  const figure = shows
    ? `<figure><img src="${esc(place.photo_url!)}" alt="${esc(name)}" width="1280" height="853" loading="eager" decoding="async">`
      + `<figcaption>${word('photoBy', lang)} ${esc(place.photo_credit!)} · ${word('licence', lang)} `
      + (place.photo_source
        ? `<a href="${esc(place.photo_source)}" rel="license noopener nofollow">${esc(place.photo_licence!)}</a>`
        : esc(place.photo_licence!))
      + `</figcaption></figure>`
    : '';

  const body = header(lang) + crumbs(lang, name) + `<main class="wrap">`
    + `<h1>${esc(name)}</h1>`
    + `<p class="lede">${esc(blurb)}</p>`
    + figure
    + `<h2>${word('where', lang)}</h2><dl>`
    + `<dt>${word('islandLabel', lang)}</dt><dd>${esc(pick(lang, area.name.th, area.name.en))}</dd>`
    + (province ? `<dt>${word('province', lang)}</dt><dd>${esc(pick(lang, province.th, province.en))}</dd>` : '')
    + `<dt>${word('coords', lang)}</dt><dd>${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}</dd>`
    + (safety ? `<dt>${word('safety', lang)}</dt><dd>${esc(safety)}</dd>` : '')
    + `</dl>`
    + (tags.length ? `<ul class="tags">${tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '')
    + `<a class="cta" href="/?screen=home&amp;area=${esc(GUIDE_AREA)}&amp;lang=${lang}">${word('openInApp', lang)}</a>`
    + `<p class="note">${word('liveNote', lang)}</p>`
    + `</main>` + footer(lang, path);

  return page({
    origin, lang, path,
    title: `${name} · ${pick(lang, area.name.th, area.name.en)} · ChivarGo`,
    description: blurb,
    image: shows ? place.photo_url! : undefined,
    schema: {
      '@context': 'https://schema.org',
      '@graph': [
        placeSchema(origin, lang, place, area),
        islandSchema(origin, lang, area),
        breadcrumbSchema(origin, lang, place),
      ],
    },
    body,
  });
}

/**
 * The index.
 *
 * It exists so the place pages are not orphans. A page reachable only from a
 * sitemap is a page with no internal links pointing at it, and that is read
 * as a page nothing on the site thinks is important - so this is the hub,
 * linked from the marketing page's footer, listing every place once.
 */
export function guideIndexPage(
  origin: string, lang: GuideLang, places: readonly GuidePlace[], area: Area = areaByKey(GUIDE_AREA),
): string {
  const path = guideIndexPath(lang);
  const islandName = pick(lang, area.name.th, area.name.en);
  const items = places.map((place) => {
    const name = pick(lang, place.name_th, place.name_en);
    return `<li><a href="${guidePlacePath(lang, place.id)}">${esc(name)}</a>`
      + `<p>${esc(pick(lang, place.blurb_th, place.blurb_en))}</p></li>`;
  }).join('');

  const body = header(lang) + crumbs(lang) + `<main class="wrap">`
    + `<h1>${esc(islandName)}</h1>`
    + `<p class="lede">${word('intro', lang)}</p>`
    + `<p>${places.length} ${word('placeCount', lang)}</p>`
    + `<ul class="places">${items}</ul>`
    + `</main>` + footer(lang, path);

  return page({
    origin, lang, path,
    title: `${islandName} · ${word('guide', lang)} · ChivarGo`,
    description: WORDS.intro[lang],
    schema: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'CollectionPage',
          '@id': `${origin}${path}#page`,
          name: `${islandName} · ${word('guide', lang)}`,
          description: WORDS.intro[lang],
          inLanguage: lang,
          url: `${origin}${path}`,
          about: { '@id': `${origin}/#koh-sichang` },
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: places.length,
            itemListElement: places.map((place, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              name: pick(lang, place.name_th, place.name_en),
              url: `${origin}${guidePlacePath(lang, place.id)}`,
            })),
          },
        },
        islandSchema(origin, lang, area),
        breadcrumbSchema(origin, lang),
      ],
    },
    body,
  });
}

/**
 * The guide's own sitemap, served from here rather than built.
 *
 * `/sitemap.xml` is a static file written by `scripts/build-promo.mjs`, and it
 * stays that way - it lists pages that exist in the repository. These pages do
 * not: they are rows in the Durable Object's database, and a build script has
 * no way to read them. A sitemap whose contents live in a database has to be
 * served by the thing holding the database, so robots.txt names both.
 *
 * No `lastmod`: nothing records when a place row last changed, and a date
 * stamped at request time would claim every page changed on every crawl.
 * An inaccurate lastmod is discarded rather than merely discounted, so the
 * honest move is to leave it out.
 */
export function guideSitemap(origin: string, places: readonly GuidePlace[]): string {
  const entry = (path: string, each: (lang: GuideLang) => string): string =>
    `  <url>\n    <loc>${origin}${path}</loc>\n`
    + GUIDE_LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${origin}${each(l)}"/>\n`).join('')
    + `    <xhtml:link rel="alternate" hreflang="x-default" href="${origin}${each(GUIDE_DEFAULT_LANG)}"/>\n`
    + `  </url>\n`;

  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
    + GUIDE_LANGS.map((lang) => entry(guideIndexPath(lang), (l) => guideIndexPath(l))).join('')
    + places.flatMap((place) =>
      GUIDE_LANGS.map((lang) => entry(guidePlacePath(lang, place.id), (l) => guidePlacePath(l, place.id))))
      .join('')
    + '</urlset>\n';
}
