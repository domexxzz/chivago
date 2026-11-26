import { writeFile } from 'node:fs/promises';
import { render, esc } from '../apps/mobile/public/th/components.mjs';
import { ui, features, steps, faq, islands } from '../apps/mobile/public/th/content.mjs';

const directory = new URL('../apps/mobile/public/th/', import.meta.url);
const ORIGIN = 'https://chivargo.com';
const LANGS = ['th', 'en', 'zh'];

/**
 * A language's page, WITHOUT the `.html`.
 *
 * THE EXTENSION IS A REDIRECT. Workers Assets serves `/th/en` out of
 * `th/en.html` and answers the spelling with the extension with a 307 to this
 * one - the same rule `served-from-export.ts` records for /privacy and
 * /about. Every canonical, every hreflang and every sitemap entry used to
 * carry the `.html` spelling, so all of them pointed at a redirect. That is
 * not cosmetic: Google drops an hreflang annotation whose target redirects,
 * which left the th/en/zh set with no cluster at all, and a sitemap full of
 * redirects is reported as "page with redirect" and not indexed. These are
 * the URLs that answer 200.
 */
const pageUrl = (lang) => ORIGIN + '/th/' + (lang === 'th' ? '' : lang);

const titleFor = (lang) => 'ChivarGo — ' + ui.headline[lang] + ' · ' + ui.highlight[lang];

/**
 * The hreflang set, which every page in the set must carry in full -
 * including the link to itself, or the annotation is one-directional and
 * ignored. `x-default` is Thai: it is what the bare /th/ serves, and the
 * language the operator, the hosts and the islands are in.
 */
const alternates = (lang) => LANGS
  .map((l) => '<link rel="alternate" hreflang="' + l + '" href="' + pageUrl(l) + '">')
  .join('') + '<link rel="alternate" hreflang="x-default" href="' + pageUrl('th') + '">';

/**
 * What a machine is told this page is.
 *
 * ONE GRAPH RATHER THAN ONE NODE, because this page was shipping a bare
 * `WebSite` carrying a name and a URL - true, and worth nothing to anybody.
 * The page already holds six questions with their answers, four numbered
 * steps, a twenty-one item feature list and two islands, and all of it was
 * readable only as prose. These nodes say the same things in the form an
 * answer engine quotes:
 *
 *   FAQPage             the six questions, verbatim, with their answers
 *   HowTo               the four steps to start, in order
 *   WebApplication      free, in a browser, in three languages, what it does
 *   TouristDestination  the two islands, each with a coordinate and a province
 *
 * The FAQ hangs off the WebPage node rather than a second page node: there is
 * one URL here, and two page nodes claiming it is what makes a graph
 * unparseable.
 *
 * Every string is read from `content.mjs`, so all three languages get this
 * for free and none of it can drift from what the page actually says.
 */
const schemaFor = (lang) => {
  const t = (v) => v[lang];
  const org = ORIGIN + '/#organization';
  const site = ORIGIN + '/#website';
  const application = ORIGIN + '/#app';
  const placeId = (island) => ORIGIN + '/#' + island.slug;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization', '@id': org, name: 'ChivarGo', url: ORIGIN,
        logo: { '@type': 'ImageObject', url: ORIGIN + '/th/img/logo.webp' },
      },
      {
        '@type': 'WebSite', '@id': site, name: 'ChivarGo', url: ORIGIN,
        publisher: { '@id': org }, inLanguage: LANGS,
      },
      {
        '@type': ['WebPage', 'FAQPage'], '@id': pageUrl(lang) + '#webpage',
        url: pageUrl(lang), name: titleFor(lang), description: t(ui.intro),
        inLanguage: lang, isPartOf: { '@id': site }, about: { '@id': application },
        primaryImageOfPage: { '@type': 'ImageObject', url: ORIGIN + '/th/img/og.jpg' },
        mainEntity: faq.map(([question, answer]) => ({
          '@type': 'Question', name: t(question),
          acceptedAnswer: { '@type': 'Answer', text: t(answer) },
        })),
      },
      {
        '@type': 'WebApplication', '@id': application, name: 'ChivarGo',
        alternateName: 'ชีวาร์โก', url: ORIGIN + '/',
        applicationCategory: 'TravelApplication', operatingSystem: 'Web browser',
        browserRequirements: 'Requires JavaScript', inLanguage: LANGS,
        provider: { '@id': org },
        // Free, said in the form that is read as free rather than as
        // unpriced: an application with no `offers` is not quotable as free.
        offers: {
          '@type': 'Offer', price: 0, priceCurrency: 'THB',
          availability: 'https://schema.org/InStock',
        },
        featureList: features.map((feature) => t(feature[2])),
        areaServed: islands.map((island) => ({ '@id': placeId(island) })),
      },
      {
        '@type': 'HowTo', '@id': pageUrl(lang) + '#how', name: t(ui.steps),
        inLanguage: lang,
        step: steps.map((step, index) => ({
          '@type': 'HowToStep', position: index + 1, name: t(step),
          url: pageUrl(lang) + '#how',
        })),
      },
      ...islands.map((island) => ({
        '@type': 'TouristDestination', '@id': placeId(island),
        name: t(ui[island.key]), description: t(ui[island.key + 'Desc']),
        url: pageUrl(lang) + '#destinations',
        geo: { '@type': 'GeoCoordinates', latitude: island.lat, longitude: island.lng },
        address: {
          '@type': 'PostalAddress', addressRegion: t(island.province),
          addressCountry: 'TH',
        },
        containedInPlace: {
          '@type': 'AdministrativeArea', name: t(island.province),
          identifier: island.provinceCode,
        },
      })),
    ],
  };
};

for (const lang of LANGS) {
  const filename = lang === 'th' ? 'index.html' : lang + '.html';
  const canonical = pageUrl(lang);
  const title = titleFor(lang);
  const head = '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title>'
    + '<meta name="description" content="' + esc(ui.intro[lang]) + '">'
    // `max-image-preview:large` is what lets Google show the hero rather than
    // a thumbnail, in search and in Discover; the rest is the default said
    // out loud, so a reader of the page knows it was a decision.
    + '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">'
    + '<link rel="canonical" href="' + canonical + '">' + alternates(lang)
    + '<meta name="theme-color" content="#083b55">'
    + '<meta property="og:type" content="website"><meta property="og:site_name" content="ChivarGo">'
    + '<meta property="og:locale" content="' + { th: 'th_TH', en: 'en_US', zh: 'zh_CN' }[lang] + '">'
    + '<meta property="og:title" content="' + esc(title) + '"><meta property="og:description" content="' + esc(ui.intro[lang]) + '">'
    + '<meta property="og:url" content="' + canonical + '"><meta property="og:image" content="' + ORIGIN + '/th/img/og.jpg">'
    + '<meta property="og:image:alt" content="' + esc(title) + '">'
    + '<meta name="twitter:card" content="summary_large_image">'
    + '<link rel="icon" href="img/icon-512.png">'
    + '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet">'
    + '<link rel="stylesheet" href="promo.css"><link rel="preload" as="image" href="img/hero.webp">'
    + '<script type="application/ld+json">' + JSON.stringify(schemaFor(lang)) + '</script>';
  await writeFile(new URL(filename, directory),
    '<!doctype html>\n<html lang="' + lang + '"><head>' + head + '</head><body>'
    + render(lang) + '<script type="module" src="promo.js"></script></body></html>\n');
}
/*
  The sitemap, written here rather than kept by hand.

  It is generated because the hand-written one is what went stale: it listed
  the three `.html` URLs, every one of which answers a 307, and it gave each
  page a single alternate - itself. An hreflang set has to be complete on
  every member or none of it counts, so the one place that said "these three
  pages are the same page in three languages" was saying nothing. Built from
  `pageUrl`, it cannot disagree with the pages again.

  NO lastmod, changefreq OR priority. Google ignores the last two outright,
  and a lastmod stamped at build time would claim the page changed on every
  unrelated deploy - an inaccurate lastmod is not a weak signal but a
  discarded one, so the honest move is to leave it out and let the crawler
  use what it already knows.
*/
const sitemapEntry = (loc, links) => '  <url>\n    <loc>' + loc + '</loc>\n'
  + links.map(([hreflang, href]) => '    <xhtml:link rel="alternate" hreflang="' + hreflang + '" href="' + href + '"/>\n').join('')
  + '  </url>\n';
const promoLinks = [
  ...LANGS.map((l) => [l, pageUrl(l)]),
  ['x-default', pageUrl('th')],
];
await writeFile(new URL('../sitemap.xml', directory),
  '<?xml version="1.0" encoding="UTF-8"?>\n'
  + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
  + LANGS.map((l) => sitemapEntry(pageUrl(l), promoLinks)).join('')
  // The app itself, and the two pages that say who runs it and on what terms.
  // `/about` is the page an answer engine reads to decide whether to trust
  // the rest, which is the whole job of listing it.
  + [ORIGIN + '/', ORIGIN + '/about', ORIGIN + '/privacy'].map((loc) => sitemapEntry(loc, [])).join('')
  + '</urlset>\n');

console.log('Generated ChivarGo promo pages: TH / EN / ZH, and sitemap.xml');
