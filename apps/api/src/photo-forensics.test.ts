/**
 * The fingerprint is read from the bytes, or it is not read at all.
 *
 * The files here are BUILT, not checked in as fixtures. A binary blob in the
 * repository is a thing nobody can review: the next person cannot see why a
 * test passes, and cannot write a new case without a camera. Everything the
 * parser is asked to read is assembled a few lines above the assertion, so
 * the EXIF layout itself is part of the test.
 */

import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { describe, test } from 'node:test';

import { fingerprint } from './photo-forensics.ts';

// ---------------------------------------------------------------------------
// A tiny EXIF writer, so the parser has something real to walk
// ---------------------------------------------------------------------------

type Entry = { tag: number; type: number; count: number; data: Buffer };

const ascii = (tag: number, value: string): Entry => {
  const data = Buffer.from(`${value}\0`, 'latin1');
  return { tag, type: 2, count: data.length, data };
};

const long = (tag: number, value: number): Entry => {
  const data = Buffer.alloc(4);
  data.writeUInt32LE(value);
  return { tag, type: 4, count: 1, data };
};

/** Three rationals: degrees, minutes, seconds - how EXIF writes a coordinate. */
const coordinate = (tag: number, degrees: number): Entry => {
  const whole = Math.floor(degrees);
  const minutes = Math.floor((degrees - whole) * 60);
  const seconds = Math.round(((degrees - whole) * 60 - minutes) * 60 * 1000);
  const data = Buffer.alloc(24);
  data.writeUInt32LE(whole, 0); data.writeUInt32LE(1, 4);
  data.writeUInt32LE(minutes, 8); data.writeUInt32LE(1, 12);
  data.writeUInt32LE(seconds, 16); data.writeUInt32LE(1000, 20);
  return { tag, type: 5, count: 3, data };
};

const ifdSize = (entries: Entry[]) => 2 + entries.length * 12 + 4;

/** Serialise one IFD, pushing anything longer than four bytes onto the heap. */
function writeIfd(entries: Entry[], heap: Buffer[], heapAt: number): { ifd: Buffer; heapAt: number } {
  const sorted = [...entries].sort((a, b) => a.tag - b.tag);
  const ifd = Buffer.alloc(ifdSize(sorted));
  ifd.writeUInt16LE(sorted.length, 0);
  let cursor = heapAt;
  sorted.forEach((entry, i) => {
    const at = 2 + i * 12;
    ifd.writeUInt16LE(entry.tag, at);
    ifd.writeUInt16LE(entry.type, at + 2);
    ifd.writeUInt32LE(entry.count, at + 4);
    if (entry.data.length <= 4) {
      entry.data.copy(ifd, at + 8);
    } else {
      ifd.writeUInt32LE(cursor, at + 8);
      heap.push(entry.data);
      cursor += entry.data.length;
    }
  });
  return { ifd, heapAt: cursor };
}

interface Exif {
  make?: string;
  model?: string;
  serial?: string;
  moment?: string;
  offset?: string;
  lat?: number;
  lng?: number;
}

/** A complete little-endian TIFF block: IFD0, then the Exif and GPS IFDs. */
function tiffBlock(e: Exif): Buffer {
  const exifEntries: Entry[] = [];
  if (e.moment) exifEntries.push(ascii(0x9003, e.moment));
  if (e.offset) exifEntries.push(ascii(0x9011, e.offset));
  if (e.serial) exifEntries.push(ascii(0xa431, e.serial));

  const gpsEntries: Entry[] = [];
  if (e.lat !== undefined) {
    gpsEntries.push(ascii(1, e.lat >= 0 ? 'N' : 'S'), coordinate(2, Math.abs(e.lat)));
  }
  if (e.lng !== undefined) {
    gpsEntries.push(ascii(3, e.lng >= 0 ? 'E' : 'W'), coordinate(4, Math.abs(e.lng)));
  }

  const base: Entry[] = [];
  if (e.make) base.push(ascii(0x010f, e.make));
  if (e.model) base.push(ascii(0x0110, e.model));

  // Offsets have to be known before the pointers are written, so every block
  // is measured first and only then filled in.
  const ifd0At = 8;
  const ifd0Entries = base.length + (exifEntries.length ? 1 : 0) + (gpsEntries.length ? 1 : 0);
  const ifd0Size = 2 + ifd0Entries * 12 + 4;
  const exifAt = ifd0At + ifd0Size;
  const gpsAt = exifAt + (exifEntries.length ? ifdSize(exifEntries) : 0);
  const heapStart = gpsAt + (gpsEntries.length ? ifdSize(gpsEntries) : 0);

  if (exifEntries.length) base.push(long(0x8769, exifAt));
  if (gpsEntries.length) base.push(long(0x8825, gpsAt));

  const heap: Buffer[] = [];
  const first = writeIfd(base, heap, heapStart);
  const second = exifEntries.length
    ? writeIfd(exifEntries, heap, first.heapAt)
    : { ifd: Buffer.alloc(0), heapAt: first.heapAt };
  const third = gpsEntries.length
    ? writeIfd(gpsEntries, heap, second.heapAt)
    : { ifd: Buffer.alloc(0), heapAt: second.heapAt };

  const header = Buffer.alloc(8);
  header.write('II', 0, 'latin1');
  header.writeUInt16LE(42, 2);
  header.writeUInt32LE(ifd0At, 4);
  return Buffer.concat([header, first.ifd, second.ifd, third.ifd, ...heap]);
}

/** A JPEG that is a valid container and not a valid image - enough to parse. */
function jpeg(e: Exif | null, pixels = 'pixels'): Buffer {
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])];
  if (e) {
    const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiffBlock(e)]);
    const length = Buffer.alloc(2);
    length.writeUInt16BE(payload.length + 2);
    parts.push(Buffer.from([0xff, 0xe1]), length, payload);
  }
  // A comment segment, so the walk has to step over something to reach the end.
  const comment = Buffer.from(pixels, 'latin1');
  const commentLength = Buffer.alloc(2);
  commentLength.writeUInt16BE(comment.length + 2);
  parts.push(Buffer.from([0xff, 0xfe]), commentLength, comment);
  parts.push(Buffer.from([0xff, 0xd9]));
  return Buffer.concat(parts);
}

function png(tiff: Buffer | null): Buffer {
  const parts: Buffer[] = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    return Buffer.concat([length, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
  };
  parts.push(chunk('IHDR', Buffer.alloc(13)));
  if (tiff) parts.push(chunk('eXIf', tiff));
  parts.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

function webp(tiff: Buffer): Buffer {
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(payload.length);
  const body = Buffer.concat([
    Buffer.from('WEBP', 'latin1'),
    Buffer.from('VP8 ', 'latin1'), (() => { const n = Buffer.alloc(4); n.writeUInt32LE(4); return n; })(),
    Buffer.alloc(4),
    Buffer.from('EXIF', 'latin1'), size, payload,
  ]);
  const riffSize = Buffer.alloc(4);
  riffSize.writeUInt32LE(body.length);
  return Buffer.concat([Buffer.from('RIFF', 'latin1'), riffSize, body]);
}

// The pier on Ko Sichang, which is where the pilot's quests are.
const PIER = { lat: 13.1599, lng: 100.8096 };

// ---------------------------------------------------------------------------

describe('the hash is the part nothing can forge', () => {
  test('every file gets one, including a file with nothing else in it', () => {
    const bytes = jpeg(null);
    const fp = fingerprint(bytes);
    assert.equal(fp.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(fp.sha256.length, 64);
  });

  test('two submissions of the same photograph share it, and a different one does not', () => {
    const once = fingerprint(jpeg({ moment: '2026:11:21 14:03:22' }));
    const again = fingerprint(jpeg({ moment: '2026:11:21 14:03:22' }));
    const other = fingerprint(jpeg({ moment: '2026:11:21 14:03:23' }));
    assert.equal(once.sha256, again.sha256);
    assert.notEqual(once.sha256, other.sha256);
  });
});

describe('what the file says about itself', () => {
  test('a JPEG gives up its camera, its moment and its coordinates', () => {
    const fp = fingerprint(jpeg({
      make: 'Samsung', model: 'SM-S918B', serial: 'R3CT20',
      moment: '2026:11:21 14:03:22', offset: '+07:00',
      lat: PIER.lat, lng: PIER.lng,
    }));
    assert.equal(fp.camera, 'Samsung|SM-S918B|R3CT20');
    assert.equal(fp.moment, '2026:11:21 14:03:22');
    assert.equal(fp.takenAt, '2026-11-21T07:03:22.000Z');
    assert.ok(Math.abs(fp.lat! - PIER.lat) < 0.0005, `lat ${fp.lat}`);
    assert.ok(Math.abs(fp.lng! - PIER.lng) < 0.0005, `lng ${fp.lng}`);
  });

  test('the southern and western hemispheres come back negative', () => {
    const fp = fingerprint(jpeg({ lat: -33.8688, lng: -70.6693 }));
    assert.ok(fp.lat! < 0 && fp.lng! < 0, `${fp.lat}, ${fp.lng}`);
    assert.ok(Math.abs(fp.lat! + 33.8688) < 0.0005);
  });

  /*
    THE WHOLE REASON `takenAt` AND `moment` ARE TWO FIELDS.

    An EXIF time with no offset tag is a wall clock. A traveller whose camera
    is still set to their own country's time would be hours "wrong" against
    the island's, through no fault of theirs, and a check built on a guessed
    zone would fail them. So the instant stays null, the raw string survives
    for comparing one file against another, and `timingCheck` goes on using
    what the phone worked out - which knew the zone.
  */
  test('a moment with no offset is kept, but is not turned into an instant', () => {
    const fp = fingerprint(jpeg({ moment: '2026:11:21 14:03:22' }));
    assert.equal(fp.moment, '2026:11:21 14:03:22');
    assert.equal(fp.takenAt, null);
  });

  test('a PNG carries EXIF in its own chunk', () => {
    const fp = fingerprint(png(tiffBlock({ make: 'Canon', moment: '2026:11:21 14:03:22' })));
    assert.equal(fp.camera, 'Canon');
    assert.equal(fp.moment, '2026:11:21 14:03:22');
  });

  test('a WebP does too, behind the same header a JPEG uses', () => {
    const fp = fingerprint(webp(tiffBlock({ model: 'Pixel 9', lat: PIER.lat, lng: PIER.lng })));
    assert.equal(fp.camera, 'Pixel 9');
    assert.ok(Math.abs(fp.lat! - PIER.lat) < 0.0005);
  });

  test('a half-filled file gives up what it has and nothing more', () => {
    const fp = fingerprint(jpeg({ make: 'Apple', model: 'iPhone 17' }));
    assert.equal(fp.camera, 'Apple|iPhone 17');
    assert.equal(fp.moment, null);
    assert.equal(fp.lat, null);
  });
});

/*
  A STRIPPED FILE IS THE ORDINARY CASE, NOT A FINDING.

  `POST /quests/:id/proof` says so in its own comment: the app reads EXIF on
  the device because re-encoding there routinely strips it. So most honest
  photographs reach us carrying nothing but pixels, and everything below has
  to come back empty rather than suspicious.
*/
describe('a file with nothing to say says nothing', () => {
  test('a JPEG with no EXIF segment yields a hash and four nulls', () => {
    const fp = fingerprint(jpeg(null));
    assert.deepEqual(
      { moment: fp.moment, takenAt: fp.takenAt, lat: fp.lat, lng: fp.lng, camera: fp.camera },
      { moment: null, takenAt: null, lat: null, lng: null, camera: null },
    );
  });

  test('so does a PNG screenshot', () => {
    assert.equal(fingerprint(png(null)).camera, null);
  });
});

/*
  EVERY FILE HERE IS ONE SOMEBODY CHOSE TO SEND US.

  The parser walks offsets taken from the file itself, so a hostile file is a
  file that points wherever it likes. None of these may throw, hang or read
  past the end: a photograph that cannot be parsed still has to reach a
  reviewer, and the console must not be the thing that falls over.
*/
describe('a hostile file is answered, never obeyed', () => {
  const survives = (name: string, bytes: Buffer) => test(name, () => {
    const fp = fingerprint(bytes);
    assert.equal(fp.sha256.length, 64, 'the hash is always available');
    assert.equal(fp.camera, null);
    assert.equal(fp.moment, null);
  });

  survives('empty', Buffer.alloc(0));
  survives('two bytes that only claim to be a JPEG', Buffer.from([0xff, 0xd8]));
  survives('a segment length that runs past the end', Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xfe]));
  survives('random noise', Buffer.from(Array.from({ length: 512 }, (_, i) => (i * 37) % 256)));

  survives('an EXIF header with no TIFF behind it', (() => {
    const payload = Buffer.from('Exif\0\0', 'latin1');
    const length = Buffer.alloc(2);
    length.writeUInt16BE(payload.length + 2);
    return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), length, payload]);
  })());

  survives('an IFD offset pointing outside the block', (() => {
    const tiff = Buffer.alloc(16);
    tiff.write('II', 0, 'latin1');
    tiff.writeUInt16LE(42, 2);
    tiff.writeUInt32LE(0xfffffff0, 4);
    const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
    const length = Buffer.alloc(2);
    length.writeUInt16BE(payload.length + 2);
    return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), length, payload]);
  })());

  survives('an entry count far larger than the block', (() => {
    const tiff = Buffer.alloc(32);
    tiff.write('II', 0, 'latin1');
    tiff.writeUInt16LE(42, 2);
    tiff.writeUInt32LE(8, 4);
    tiff.writeUInt16LE(60000, 8);
    const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
    const length = Buffer.alloc(2);
    length.writeUInt16BE(payload.length + 2);
    return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), length, payload]);
  })());

  test('a run of fill bytes does not become a loop', () => {
    const bytes = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(4096, 0xff)]);
    const started = Date.now();
    assert.equal(fingerprint(bytes).camera, null);
    assert.ok(Date.now() - started < 1000, 'the walk should end at once');
  });

  test('a text field full of control characters is cleaned, not trusted', () => {
    const fp = fingerprint(jpeg({ make: 'A\u0007B\u001bC' }));
    assert.equal(fp.camera, 'ABC');
  });

  test('a coordinate outside the globe is refused', () => {
    const fp = fingerprint(jpeg({ lat: 981 }));
    assert.equal(fp.lat, null);
  });
});
