/**
 * The promo page's contract with search and answer engines.
 *
 * WHY THIS FILE EXISTS. Every canonical, every hreflang annotation and every
 * sitemap entry on this page pointed at a URL ending in `.html`, and Workers
 * Assets answers that spelling with a 307. The pages looked right, the HTML
 * validated, nothing logged a warning, and the one thing on the site that
 * said "these are the same page in three languages" was being discarded -
 * Google drops an hreflang whose target redirects, and reports a sitemap of
 * redirects as "page with redirect" rather than indexing it. It is invisible
 * from inside: you have to fetch the URL to find out.
 *
 * So the rule is checkable here instead. These tests assert the two things
 * that silently rot - the URLs are the ones that answer 200, and the
 * structured data still says what the page says - and the privacy rule in
 * robots.txt that a later edit is most likely to break.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { faq, features, steps, islands } from '../apps/mobile/public/th/content.mjs';

const read = (name) => readFileSync(new URL('../apps/mobile/public/' + name, import.meta.url), 'utf8');

const PAGES = { th: 'th/index.html', en: 'th/en.html', zh: 'th/zh.html' };
const URLS = { th: 'https://chivargo.com/th/', en: 'https://chivargo.com/th/en', zh: 'https://chivargo.com/th/zh' };

const html = Object.fromEntries(Object.entries(PAGES).map(([lang, file]) => [lang, read(file)]));
const graphOf = (lang) => JSON.parse(html[lang].match(/application\/ld\+json">(.*?)<\/script>/s)[1])['@graph'];
const nodeOf = (lang, type) => graphOf(lang).find((n) => [].concat(n['@type']).includes(type));

/*
  The 307 itself. A `.html` anywhere in a URL that a crawler is told to treat
  as authoritative is the whole bug, in every file that carries one.
*/
test('no page, sitemap or crawler file points at a URL that redirects', () => {
  const absoluteUrls = (text) => text.match(/https:\/\/chivargo\.com[^"'\s<>)]*/g) ?? [];
  for (const [name, text] of [
    ...Object.entries(PAGES).map(([lang, file]) => [file, html[lang]]),
    ['sitemap.xml', read('sitemap.xml')],
    ['llms.txt', read('llms.txt')],
    ['robots.txt', read('robots.txt')],
  ]) {
    for (const url of absoluteUrls(text)) {
      assert.ok(!url.endsWith('.html'), name + ' points at ' + url + ', which answers 307');
    }
  }
});

test('each page is its own canonical', () => {
  for (const [lang, url] of Object.entries(URLS)) {
    assert.match(html[lang], new RegExp('<link rel="canonical" href="' + url + '">'));
  }
});

/*
  An hreflang set counts only if every member carries the whole set, its own
  entry included - a one-directional annotation is ignored, which is how three
  pages each naming only themselves came to mean nothing.
*/
test('every page carries the whole hreflang set, itself included, plus x-default', () => {
  for (const lang of Object.keys(PAGES)) {
    for (const [other, url] of Object.entries(URLS)) {
      assert.match(html[lang], new RegExp('hreflang="' + other + '" href="' + url + '"'),
        PAGES[lang] + ' is missing the ' + other + ' alternate');
    }
    assert.match(html[lang], new RegExp('hreflang="x-default" href="' + URLS.th + '"'));
  }
});

test('the sitemap lists the three pages and gives each the whole alternate set', () => {
  const sitemap = read('sitemap.xml');
  for (const url of Object.values(URLS)) {
    assert.ok(sitemap.includes('<loc>' + url + '</loc>'), 'sitemap is missing ' + url);
  }
  // Three pages, each naming three languages and x-default.
  assert.equal((sitemap.match(/<xhtml:link/g) ?? []).length, 3 * 4);
});

/*
  The structured data is generated from `content.mjs`, so a count that has
  stopped matching means the pages were not rebuilt after the copy changed -
  which ships a page whose prose and whose machine-readable claims disagree.
*/
test('the structured data still says what the page says, in all three languages', () => {
  for (const lang of Object.keys(PAGES)) {
    const page = nodeOf(lang, 'FAQPage');
    assert.equal(page.mainEntity.length, faq.length, lang + ': FAQ is stale');
    for (const [index, [question, answer]] of faq.entries()) {
      assert.equal(page.mainEntity[index].name, question[lang]);
      assert.equal(page.mainEntity[index].acceptedAnswer.text, answer[lang]);
    }

    const howTo = nodeOf(lang, 'HowTo');
    assert.deepEqual(howTo.step.map((s) => s.name), steps.map((s) => s[lang]));
    assert.deepEqual(howTo.step.map((s) => s.position), steps.map((_, i) => i + 1));

    const app = nodeOf(lang, 'WebApplication');
    assert.deepEqual(app.featureList, features.map((f) => f[2][lang]));
    // Free, and said in the form that reads as free rather than as unpriced.
    assert.equal(app.offers.price, 0);
    assert.equal(app.offers.priceCurrency, 'THB');

    const places = graphOf(lang).filter((n) => n['@type'] === 'TouristDestination');
    assert.equal(places.length, islands.length);
    for (const [index, island] of islands.entries()) {
      assert.equal(places[index].geo.latitude, island.lat);
      assert.equal(places[index].geo.longitude, island.lng);
      assert.equal(places[index].containedInPlace.identifier, island.provinceCode);
      assert.equal(typeof places[index].geo.latitude, 'number', 'a coordinate must not be a string');
    }

    assert.equal(nodeOf(lang, 'WebPage').inLanguage, lang);
  }
});

/*
  The footgun. A crawler obeys exactly one group in robots.txt - its own, if
  it has one - and ignores the wildcard group entirely. So every named agent
  has to repeat the two Disallow lines, and the one that matters is /sos/:
  its URL token is the whole credential protecting somebody who is sharing
  their live location in an emergency.
*/
test('every named group in robots.txt repeats the disallows the wildcard group sets', () => {
  /*
    Grouped the way a crawler groups it, which is not by blank lines: runs of
    consecutive `User-agent` lines share the rules that follow, and a group
    may be split across blank lines and comments - as the wildcard group here
    is. A new group starts at a `User-agent` line that follows a rule.
  */
  const groups = [];
  let current = null;
  for (const line of read('robots.txt').split('\n').map((l) => l.replace(/#.*$/, '').trim())) {
    if (!line) continue;
    const field = line.slice(0, line.indexOf(':')).trim().toLowerCase();
    const value = line.slice(line.indexOf(':') + 1).trim();
    if (field === 'user-agent') {
      if (!current || current.rules.length) groups.push(current = { agents: [], rules: [] });
      current.agents.push(value);
    } else if (field === 'sitemap') {
      continue; // Not part of any group, wherever in the file it appears.
    } else if (current) {
      current.rules.push(field + ': ' + value);
    }
  }

  assert.ok(groups.length >= 2, 'expected a wildcard group and at least one named group');
  assert.deepEqual(groups[0].agents, ['*']);
  for (const group of groups) {
    for (const path of ['/console', '/sos/']) {
      assert.ok(group.rules.includes('disallow: ' + path),
        group.agents.join(', ') + ' does not disallow ' + path);
    }
  }
});
