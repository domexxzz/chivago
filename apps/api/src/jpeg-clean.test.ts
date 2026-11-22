/**
 * The JPEG cleaner, and the Worker transcoder that uses it.
 *
 * What must hold: no byte of metadata survives - EXIF, XMP, comments, the
 * secondary pictures an iPhone appends after the main one - and the picture
 * itself, plus its orientation, does.
 */
import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';

import { cleanJpeg, exifOrientation } from './jpeg-clean.ts';
import { workersTranscoder } from './transcode.ts';

const bytes = (...parts: (number[] | string)[]): Uint8Array =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));

const segment = (marker: number, payload: Uint8Array): number[] =>
  [0xff, marker, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff, ...payload];

/** An EXIF block: orientation 6 and a stand-in for a GPS sub-IFD, little-endian. */
const exif = (orientation: number): Uint8Array => bytes(
  'Exif\0\0', [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00],
  [0x02, 0x00],
  [0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00],
  [0x25, 0x88, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x26, 0x00, 0x00, 0x00],
  [0x00, 0x00, 0x00, 0x00],
  'GPS-13.16N-100.81E',
);

const photo = (orientation = 6): Uint8Array => bytes(
  [0xff, 0xd8],
  segment(0xe0, bytes('JFIF\0', [1, 1, 0, 0, 1, 0, 1, 0, 0])),
  segment(0xe1, exif(orientation)),
  segment(0xe1, bytes('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>GPS-XMP</x:xmpmeta>')),
  segment(0xe2, bytes('MPF\0', [0, 0, 0, 0])),
  segment(0xfe, bytes('a comment with GPS-COMMENT')),
  segment(0xdb, bytes([0, ...Array(64).fill(1)])), // DQT
  segment(0xc0, bytes([8, 0, 2, 0, 2, 1, 1, 0x11, 0])), // SOF0
  segment(0xda, bytes([1, 1, 0, 0, 0x3f, 0])), // SOS header
  [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56], // entropy data: stuffed 0xFF and a restart marker
  [0xff, 0xd9],
  // An appended secondary picture, as an iPhone writes its gain map.
  [0xff, 0xd8], segment(0xe1, bytes('Exif\0\0GPS-TRAILING')), [0xff, 0xd9],
);

const text = (b: Uint8Array): string => String.fromCharCode(...b);

describe('cleaning a JPEG', () => {
  test('no metadata survives: EXIF, XMP, MPF, comments, trailing pictures', () => {
    const out = text(cleanJpeg(photo()));
    for (const secret of ['GPS-13.16N', 'GPS-XMP', 'MPF', 'GPS-COMMENT', 'GPS-TRAILING']) {
      assert.ok(!out.includes(secret), `${secret} must be gone`);
    }
  });

  test('the picture and its orientation do survive', () => {
    const out = cleanJpeg(photo(6));
    assert.deepEqual([...out.subarray(0, 2)], [0xff, 0xd8]);
    assert.deepEqual([...out.subarray(-2)], [0xff, 0xd9], 'ends at the main picture');
    assert.ok(text(out).includes('JFIF'));
    assert.ok(text(out).includes(text(Uint8Array.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56]))), 'scan data intact');
    // The orientation block sits straight after SOI and says 6, and nothing else.
    assert.equal(out[3], 0xe1);
    assert.equal(exifOrientation(out.subarray(6, 6 + 32)), 6);
  });

  test('a progressive JPEG keeps every scan and loses what sits between them', () => {
    const progressive = bytes(
      [0xff, 0xd8],
      segment(0xc2, bytes([8, 0, 2, 0, 2, 1, 1, 0x11, 0])), // SOF2
      segment(0xda, bytes([1, 1, 0, 0, 0, 0])), [0x11, 0xff, 0x00, 0x22],
      segment(0xfe, bytes('GPS-BETWEEN-SCANS')),
      segment(0xe1, bytes('Exif\0\0GPS-LATE-EXIF')),
      segment(0xc4, bytes([0, ...Array(16).fill(0)])), // DHT
      segment(0xda, bytes([1, 1, 0, 1, 5, 0])), [0x33, 0xff, 0xd3, 0x44],
      [0xff, 0xd9],
    );
    const out = text(cleanJpeg(progressive));
    assert.ok(!out.includes('GPS-BETWEEN-SCANS') && !out.includes('GPS-LATE-EXIF'));
    assert.ok(out.includes('\x11\xff\x00\x22') && out.includes('\x33\xff\xd3\x44'), 'both scans intact');
    assert.ok(out.endsWith('\xff\xd9'));
  });

  test('a file built of thousands of empty segments is refused, not copied', () => {
    const flood = bytes([0xff, 0xd8], ...Array.from({ length: 6000 }, () => segment(0xdb, bytes([0]))), [0xff, 0xd9]);
    assert.throws(() => cleanJpeg(flood), /too many segments/);
  });

  test('an upright photo gets no EXIF at all', () => {
    const out = cleanJpeg(photo(1));
    assert.ok(!text(out).includes('Exif'));
  });

  test('it is idempotent', () => {
    const once = cleanJpeg(photo());
    assert.deepEqual(cleanJpeg(once), once);
  });

  test('anything that is not a whole JPEG is refused, never published', () => {
    assert.throws(() => cleanJpeg(bytes('not a jpeg at all')), /not a JPEG/);
    assert.throws(() => cleanJpeg(photo().subarray(0, 40)), /cut short|no image data/);
    const noEnd = photo();
    const sos = text(noEnd).indexOf('\xff\xda');
    assert.throws(() => cleanJpeg(noEnd.subarray(0, sos + 12)), /end-of-image/);
  });
});

describe('the Worker transcoder (no encoder container)', () => {
  test('a JPEG photo is published cleaned, as its own poster', async () => {
    const encoded = await workersTranscoder.photo(photo(), 'jpg');
    assert.ok(!text(encoded.media).includes('GPS-13.16N'));
    assert.equal(encoded.poster, encoded.media);
    assert.equal(encoded.durationS, null);
  });

  // Clips and PNGs are cleaned too now; media-clean.test.ts holds those.
  test('a photo in a format it cannot clean is refused by name', async () => {
    await assert.rejects(workersTranscoder.photo(photo(), 'webp'), /only JPEG and PNG photos/);
  });
});
