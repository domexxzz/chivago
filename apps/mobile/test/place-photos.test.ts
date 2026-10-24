import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { SEED_PLACES } from '@chivago/core';
import { API_BASE } from '../src/api/client.ts';
import { creditWord, fitsWhole, mascotBeachUri, photoBackdrop, photoUri } from '../src/api/photos.ts';
import { color } from '../src/theme/index.ts';

/**
 * Place photographs and hero illustrations.
 *
 * Two promises: a photograph in the seed is a file that exists (a path that
 * 404s is a grey box with a credit under it), and a phone can reach it. The
 * licence itself is a human's promise - see public/media/places/README.md.
 */

const PUBLIC = join(import.meta.dirname, '..', 'public');

describe('a logo is shown as a logo, not as a photograph of the place', () => {
  const logo = { kind: 'logo' as const, backdrop: '#2C492A', url: 'https://x/l.png', credit: 'c', licence: 'l', sourceUrl: null };
  const snap = { kind: 'photo' as const, url: 'https://x/p.jpg', credit: 'c', licence: 'l', sourceUrl: null };

  test('the credit word tells the truth about what the image is', () => {
    // "photographed by <a real business>" printed on a logo nobody photographed.
    assert.equal(creditWord(logo).en, 'logo of');
    assert.equal(creditWord(logo).th, 'โลโก้ของ');
    assert.equal(creditWord(snap).en, 'photographed by');
    // An older photo record carries no `kind` at all and must stay a photograph.
    assert.equal(creditWord({}).en, 'photographed by');
  });

  test('a logo is fitted whole; a photograph still fills the frame', () => {
    // Cropped to fill, the venue's name comes off its own mark.
    assert.equal(fitsWhole(logo), true);
    assert.equal(fitsWhole(snap), false);
    assert.equal(fitsWhole(null), false);
    assert.equal(fitsWhole(undefined), false);
  });

  test('a fitted logo sits on its own field colour, everything else on the placeholder grey', () => {
    assert.equal(photoBackdrop(logo), '#2C492A');
    assert.equal(photoBackdrop(snap), color.neutral200);
    assert.equal(photoBackdrop(null), color.neutral200);
    // A logo without a sampled backdrop falls back rather than rendering on nothing.
    assert.equal(photoBackdrop({ ...logo, backdrop: undefined }), color.neutral200);
  });

  test('every logo in the seed carries a backdrop, so none is left floating on grey', () => {
    for (const p of SEED_PLACES) {
      if (p.photo?.kind !== 'logo') continue;
      assert.match(p.photo.backdrop ?? '', /^#[0-9A-Fa-f]{6}$/, `${p.id}: logo has no sampled backdrop`);
    }
  });
});

describe('a photograph the seed names is a file that ships', () => {
  test('every own-origin photo path exists under public/', () => {
    for (const p of SEED_PLACES) {
      if (!p.photo || !p.photo.url.startsWith('/')) continue;
      assert.ok(existsSync(join(PUBLIC, p.photo.url)), `${p.id}: ${p.photo.url} is not in apps/mobile/public`);
    }
  });

  test('companion beach illustrations exist under public/media/illustrations/', () => {
    assert.ok(existsSync(join(PUBLIC, 'media/illustrations/mascots-beach-day.jpg')), 'mascots-beach-day.jpg missing');
    assert.ok(existsSync(join(PUBLIC, 'media/illustrations/mascots-beach-sunset.jpg')), 'mascots-beach-sunset.jpg missing');
  });

  /*
    THE REGRESSION THIS DIRECTORY MOVED TO FIX.

    `/assets/` is Metro's own URL namespace. In an export these are real
    files there and win, so a path under it looked correct in production
    while `expo start --web` answered every one of them 404 - the whole of
    development with no place photographs, and nothing saying why. Putting
    one back is a one-line change in the seed, so it is a test.
  */
  test('no photograph hides under Metro\'s /assets/ prefix', () => {
    for (const p of SEED_PLACES) {
      if (!p.photo || !p.photo.url.startsWith('/')) continue;
      assert.ok(
        !p.photo.url.startsWith('/assets/'),
        `${p.id}: ${p.photo.url} is under Metro's namespace and will 404 in dev - use /media/`,
      );
    }
    for (const at of [new Date('2026-10-23T04:00:00Z'), new Date('2026-10-23T14:00:00Z')]) {
      assert.ok(!mascotBeachUri(at, 'web').startsWith('/assets/'), 'the beach hero is back under /assets/');
    }
  });

  test('every photo carries its credit and licence', () => {
    for (const p of SEED_PLACES) {
      if (!p.photo) continue;
      assert.ok(p.photo.credit, `${p.id}: no credit`);
      assert.ok(p.photo.licence, `${p.id}: no licence`);
      assert.ok(p.photo.sourceUrl, `${p.id}: no source`);
    }
  });
});

describe('where the phone fetches a photograph from', () => {
  test('a licensed photograph elsewhere keeps its address', () => {
    const url = 'https://upload.wikimedia.org/wikipedia/commons/x.jpg';
    assert.equal(photoUri(url), url);
  });

  test('an own-origin path stays a path in a browser, and is given the API\'s origin on a phone', () => {
    assert.equal(photoUri('/media/places/ku-library.jpg', 'web'), '/media/places/ku-library.jpg');
    assert.equal(photoUri('/media/places/ku-library.jpg', 'ios'), `${API_BASE.replace(/\/$/, '')}/media/places/ku-library.jpg`);
    assert.equal(photoUri('/media/places/ku-library.jpg', 'android'), `${API_BASE.replace(/\/$/, '')}/media/places/ku-library.jpg`);
  });

  test('mascotBeachUri switches dynamically between daytime and sunset/evening', () => {
    // 10:00 (daytime) -> day photo
    const morning = new Date('2026-09-11T10:00:00');
    assert.match(mascotBeachUri(morning, 'web'), /mascots-beach-day\.jpg$/);

    // 18:30 (sunset / evening) -> sunset photo
    const sunset = new Date('2026-09-11T18:30:00');
    assert.match(mascotBeachUri(sunset, 'web'), /mascots-beach-sunset\.jpg$/);

    // 23:00 (night) -> sunset/evening photo
    const night = new Date('2026-09-11T23:00:00');
    assert.match(mascotBeachUri(night, 'web'), /mascots-beach-sunset\.jpg$/);

    // 05:30 (early dawn) -> sunset/evening photo
    const dawn = new Date('2026-09-11T05:30:00');
    assert.match(mascotBeachUri(dawn, 'web'), /mascots-beach-sunset\.jpg$/);

    // 06:00 (morning begins) -> day photo
    const earlyDay = new Date('2026-09-11T06:00:00');
    assert.match(mascotBeachUri(earlyDay, 'web'), /mascots-beach-day\.jpg$/);
  });
});

