/**
 * Clips and PNGs on Workers, where nothing can re-encode them.
 *
 * What must hold for each: no metadata survives, the picture (and sound)
 * does, and a file this cannot be sure about is refused rather than
 * published half-cleaned. Then the ranged read a phone's player needs.
 */
import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';

import { openBlob, parseRange, r2BlobStore, resolveRange, sliceBytes, type R2Like } from './blob-store.ts';
import { UnreadableClip, cleanMp4 } from './mp4-clean.ts';
import { cleanPng } from './png-clean.ts';
import { workersTranscoder } from './transcode.ts';

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));
const u32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const text = (b: Uint8Array): string => String.fromCharCode(...b);

// ---------------------------------------------------------------------------
// MP4
// ---------------------------------------------------------------------------

const box = (type: string, ...parts: number[][]): number[] => {
  const body = parts.flat();
  return [...u32(body.length + 8), ...ascii(type), ...body];
};
const full = (...rest: number[][]): number[] => [0, 0, 0, 0, ...rest.flat()]; // version 0, no flags

const VIDEO = ascii('VIDEO-SAMPLE-BYTES');
const DATA = ascii('GPS-SMP1GPS-SMP2'); // two 8-byte samples of a data track

/** A header with creation and modification times set, so zeroing them shows. */
const timed = (...rest: number[][]): number[] => full(u32(0xaaaaaaaa), u32(0xbbbbbbbb), ...rest);
const hdlr = (kind: string): number[] => box('hdlr', full(u32(0), ascii(kind), u32(0), u32(0), u32(0), [0]));
const stbl = (offset: number, sizes: number[]): number[] => box('stbl',
  box('stsd', full(u32(0))),
  box('stsz', full(u32(0), u32(sizes.length), ...sizes.map(u32))),
  box('stsc', full(u32(1), u32(1), u32(sizes.length), u32(1))),
  box('stco', full(u32(1), u32(offset))),
);
const trak = (kind: string, offset: number, sizes: number[], ...extra: number[][]): number[] => box('trak',
  box('tkhd', timed(u32(1))),
  ...extra,
  box('mdia', box('mdhd', timed(u32(1000), u32(6000))), hdlr(kind), box('minf', stbl(offset, sizes))),
);

interface ClipOptions { video?: boolean; data?: boolean; fragmented?: boolean }

/** A whole clip: tags in every place a phone puts them, a data track, and a trailer. */
function clip(opts: ClipOptions = {}): Uint8Array {
  const { video = true, data = true, fragmented = false } = opts;
  const ftyp = box('ftyp', ascii('isom'), u32(0), ascii('isom'));
  const moov = (mediaAt: number): number[] => box('moov',
    box('mvhd', timed(u32(1000), u32(6000))),
    box('udta', box('\xa9xyz', ascii('GPS-UDTA+13.16+100.81/'))),
    box('meta', ascii('GPS-META-com.apple.quicktime.location')),
    ...(video ? [trak('vide', mediaAt, [VIDEO.length],
      box('tref', box('tmcd', u32(2))),
      box('udta', ascii('GPS-TRAK-UDTA')))] : []),
    ...(data ? [trak('meta', fragmented ? 0 : mediaAt + VIDEO.length, fragmented ? [] : [8, 8])] : []),
  );
  const mediaAt = ftyp.length + moov(0).length + 8;
  return Uint8Array.from([
    ...ftyp, ...moov(mediaAt),
    ...box('mdat', VIDEO, DATA),
    ...(fragmented ? box('moof', u32(0)) : []),
    ...box('uuid', ascii('GPS-UUID-XMP-PACKET')),
    ...ascii('GPS-TRAILER'), // not a box at all
  ]);
}

const SECRETS = ['GPS-UDTA', 'GPS-META', 'GPS-TRAK-UDTA', 'GPS-SMP1', 'GPS-SMP2', 'GPS-UUID', 'GPS-TRAILER'];

describe('cleaning a clip', () => {
  test('nothing but picture and sound survives, and no byte moves', () => {
    const bytes = clip();
    const before = text(bytes);
    const info = cleanMp4(bytes);
    const after = text(bytes);
    for (const secret of SECRETS) {
      assert.ok(before.includes(secret), `the fixture carries ${secret}`);
      assert.ok(!after.includes(secret), `${secret} must be gone`);
    }
    assert.equal(after.length, before.length, 'same size, so every sample offset is still true');
    assert.equal(after.indexOf(text(Uint8Array.from(VIDEO))), before.indexOf(text(Uint8Array.from(VIDEO))), 'the video sample is where it was');
    assert.equal(info.durationS, 6);
    assert.equal(info.droppedTracks, 1);
  });

  test('the times in the headers it keeps are zeroed, and a dangling track reference goes', () => {
    const bytes = clip();
    cleanMp4(bytes);
    const after = text(bytes);
    assert.ok(!after.includes('\xaa\xaa\xaa\xaa') && !after.includes('\xbb\xbb\xbb\xbb'));
    assert.ok(!after.includes('tref'), 'the reference to the dropped track is gone');
    assert.ok(after.includes('vide') && !after.includes('meta'), 'the video track stays, the data track does not');
  });

  test('with no extra track, a reference between the tracks that stay is left alone', () => {
    const bytes = clip({ data: false });
    assert.equal(cleanMp4(bytes).droppedTracks, 0);
    assert.ok(text(bytes).includes('tref'));
  });

  test('it is idempotent', () => {
    const once = clip();
    cleanMp4(once);
    const twice = Uint8Array.from(once);
    cleanMp4(twice);
    assert.deepEqual(twice, once);
  });

  test('a file it cannot be sure about is refused, never published', () => {
    assert.throws(() => cleanMp4(Uint8Array.from(box('ftyp', ascii('isom')))), UnreadableClip, 'no movie header');
    assert.throws(() => cleanMp4(clip({ video: false })), /no video track/);
    assert.throws(() => cleanMp4(clip({ fragmented: true })), /fragmented/);
    const broken = clip();
    const moov = text(broken).indexOf('moov');
    broken.set(u32(0x7fffffff), moov + 4); // the first box inside moov now claims 2 GB
    assert.throws(() => cleanMp4(broken), /does not fit/);
  });

  test('a file built to cost memory or CPU is refused before it does', () => {
    const flood = Uint8Array.from([...box('ftyp', ascii('isom')), ...Array.from({ length: 10_050 }, () => box('free')).flat()]);
    assert.throws(() => cleanMp4(flood), /too many boxes/);
    // A data track whose two samples each claim more than the whole file.
    const greedy = clip();
    const sizes = text(greedy).lastIndexOf('stsz') + 4 + 12; // past version, uniform size and count
    greedy.set(u32(0x00ffffff), sizes);
    greedy.set(u32(0x00ffffff), sizes + 4);
    assert.throws(() => cleanMp4(greedy), /more than the file holds/);
  });

  test('a clip cut off mid-upload is still cleaned: the tail is the media, not a box', () => {
    const whole = clip();
    const cut = whole.subarray(0, text(whole).indexOf('mdat') + 4 + VIDEO.length);
    const bytes = Uint8Array.from(cut);
    assert.equal(cleanMp4(bytes).durationS, 6);
    assert.ok(text(bytes).includes(text(Uint8Array.from(VIDEO))));
  });
});

/**
 * The smallest clip `cleanMp4` accepts, with a named codec in its `stsd`.
 *
 * Separate from `clip()` above, whose sample table deliberately names no
 * codec at all - which is itself one of the cases below.
 */
const codecClip = (codec: string | null): Uint8Array => {
  const sample = ascii('VIDEO');
  const table = box('stbl',
    box('stsd', full(u32(codec ? 1 : 0), ...(codec ? [box(codec)] : []))),
    box('stsz', full(u32(0), u32(1), u32(sample.length))),
    box('stsc', full(u32(1), u32(1), u32(1), u32(1))),
    box('stco', full(u32(1), u32(0))),
  );
  const ftyp = box('ftyp', ascii('isom'), u32(0), ascii('isom'));
  const moov = box('moov',
    box('mvhd', timed(u32(1000), u32(6000))),
    box('trak',
      box('tkhd', timed(u32(1))),
      box('mdia', box('mdhd', timed(u32(1000), u32(6000))), hdlr('vide'), box('minf', table))),
  );
  return Uint8Array.from([...ftyp, ...moov, ...box('mdat', sample)]);
};

describe('a clip only the person who filmed it could play', () => {
  test('cleanMp4 reports the codec it read, and null when it cannot', () => {
    assert.equal(cleanMp4(codecClip('avc1')).videoCodec, 'avc1');
    assert.equal(cleanMp4(codecClip('hvc1')).videoCodec, 'hvc1');
    assert.equal(cleanMp4(codecClip(null)).videoCodec, null);
  });

  test('HEVC is refused, under every name it goes by', async () => {
    for (const codec of ['hvc1', 'hev1', 'dvh1', 'dvhe']) {
      await assert.rejects(
        workersTranscoder.video(codecClip(codec), 'mp4'),
        (e: Error) => e.name === 'UnplayableCodec' && e.message.includes(codec.toUpperCase()),
        `${codec} went out as a clip most people cannot watch`,
      );
    }
  });

  test('H.264 goes out, which is what makes the refusal worth having', async () => {
    const out = await workersTranscoder.video(codecClip('avc1'), 'mp4');
    assert.equal(out.mime, 'video/mp4');
  });

  /*
    THE REFUSAL IS FOR A CODEC THIS RECOGNISES, not for every one it cannot
    name. A sample table it fails to read must not turn into a traveller who
    cannot post at all - that is a worse failure than the one being fixed.
  */
  test('a table naming no codec is passed on, not refused', async () => {
    const out = await workersTranscoder.video(codecClip(null), 'mp4');
    assert.equal(out.mime, 'video/mp4');
  });
});

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const chunk = (type: string, data: number[]): number[] => [...u32(data.length), ...ascii(type), ...data, 0xde, 0xad, 0xbe, 0xef];
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (): Uint8Array => Uint8Array.from([
  ...PNG_SIG,
  ...chunk('IHDR', [...u32(2), ...u32(2), 8, 2, 0, 0, 0]),
  ...chunk('tEXt', ascii('Comment\0GPS-TEXT')),
  ...chunk('iTXt', ascii('XML:com.adobe.xmp\0\0\0\0\0GPS-XMP')),
  ...chunk('eXIf', ascii('GPS-EXIF')),
  ...chunk('tIME', [7, 234, 11, 22, 8, 50, 0]),
  ...chunk('gAMA', u32(45455)),
  ...chunk('zzZz', ascii('GPS-UNKNOWN')),
  ...chunk('IDAT', ascii('PIXELS')),
  ...chunk('IEND', []),
  ...ascii('GPS-AFTER-END'),
]);

describe('cleaning a PNG', () => {
  test('text, EXIF, the time and unknown chunks go; the picture and its gamma stay', () => {
    const out = text(cleanPng(png()));
    for (const secret of ['GPS-TEXT', 'GPS-XMP', 'GPS-EXIF', 'tIME', 'GPS-UNKNOWN', 'GPS-AFTER-END']) {
      assert.ok(!out.includes(secret), `${secret} must be gone`);
    }
    for (const kept of ['IHDR', 'gAMA', 'PIXELS', 'IEND']) assert.ok(out.includes(kept), `${kept} must stay`);
    assert.ok(out.endsWith('IEND\xde\xad\xbe\xef'), 'nothing after the end chunk');
  });

  test('it is idempotent, and refuses what is not a whole PNG', () => {
    const once = cleanPng(png());
    assert.deepEqual(cleanPng(once), once);
    assert.throws(() => cleanPng(Uint8Array.from(ascii('not a png'))), /not a PNG/);
    assert.throws(() => cleanPng(png().subarray(0, 40)), /cut short|no end chunk/);
  });
});

// ---------------------------------------------------------------------------
// The Worker transcoder
// ---------------------------------------------------------------------------

describe('the Worker transcoder, for clips and PNGs', () => {
  test('a clip is cleaned in the buffer it came in, under a drawn cover', async () => {
    const bytes = clip();
    const encoded = await workersTranscoder.video(bytes, 'mp4');
    assert.equal(encoded.media, bytes, 'no second copy of a 25 MB clip');
    assert.ok(!text(encoded.media).includes('GPS-'));
    assert.deepEqual([...encoded.poster.subarray(0, 3)], [0xff, 0xd8, 0xff], 'the cover is a JPEG');
    assert.equal(encoded.durationS, 6);
    assert.equal(encoded.mime, 'video/mp4');
  });

  test('a PNG stays a PNG, and is its own poster', async () => {
    const encoded = await workersTranscoder.photo(png(), 'png');
    assert.equal(encoded.mime, 'image/png');
    assert.equal(encoded.poster, encoded.media);
    assert.ok(!text(encoded.media).includes('GPS-'));
  });

  test('what it cannot clean is refused by name', async () => {
    await assert.rejects(workersTranscoder.video(clip(), 'webm'), /only MP4 and MOV/);
    await assert.rejects(workersTranscoder.photo(png(), 'heic'), /only JPEG and PNG/);
  });
});

// ---------------------------------------------------------------------------
// Ranged reads
// ---------------------------------------------------------------------------

const TEN = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

/** A bucket that serves ranges as a stream, the way R2 does. */
function rangedBucket(): R2Like {
  return {
    put: () => Promise.resolve(undefined),
    delete: () => Promise.resolve(),
    get(key, options) {
      if (key !== 'stories/a.mp4') return Promise.resolve(null);
      const range = options?.range;
      if (range && 'offset' in range && range.offset >= TEN.length) return Promise.reject(new RangeError('past the end'));
      const at = range ? resolveRange(range, TEN.length)! : { offset: 0, length: TEN.length };
      const part = TEN.subarray(at.offset, at.offset + at.length);
      return Promise.resolve({
        arrayBuffer: () => Promise.resolve(part.slice().buffer as ArrayBuffer),
        body: new Blob([part.slice()]).stream() as ReadableStream<Uint8Array>,
        size: TEN.length,
      });
    },
  };
}

const drain = async (body: ReadableStream<Uint8Array> | Uint8Array): Promise<number[]> =>
  [...(body instanceof Uint8Array ? body : new Uint8Array(await new Response(body).arrayBuffer()))];

describe('reading part of a clip', () => {
  test('a Range header becomes an offset, a length, or the last bytes', () => {
    assert.deepEqual(parseRange('bytes=0-1'), { offset: 0, length: 2 });
    assert.deepEqual(parseRange('bytes=4-'), { offset: 4 });
    assert.deepEqual(parseRange('bytes=-3'), { suffix: 3 });
    for (const none of [undefined, '', 'bytes=-', 'bytes=5-2', 'bytes=0-1,4-5', 'items=0-1']) {
      assert.equal(parseRange(none), null, `${none} is served whole`);
    }
  });

  test('a range is clamped to the object and refused when it starts past the end', () => {
    assert.deepEqual(resolveRange({ offset: 8, length: 100 }, 10), { offset: 8, length: 2 });
    assert.deepEqual(resolveRange({ suffix: 3 }, 10), { offset: 7, length: 3 });
    assert.equal(resolveRange({ offset: 10 }, 10), null);
    assert.equal(sliceBytes(TEN, { offset: 99 }), 'unsatisfiable');
    const part = sliceBytes(TEN, { offset: 2, length: 3 });
    assert.ok(part !== 'unsatisfiable');
    assert.deepEqual([part.offset, part.length, part.size], [2, 3, 10]);
  });

  test('the R2 store streams the piece and reports where it sits', async () => {
    const store = r2BlobStore(rangedBucket());
    const read = await openBlob(store, 'stories/a.mp4', { offset: 2, length: 3 });
    assert.ok(read && read !== 'unsatisfiable');
    assert.deepEqual([read.offset, read.length, read.size], [2, 3, 10]);
    assert.deepEqual(await drain(read.body), [2, 3, 4]);
    const whole = await openBlob(store, 'stories/a.mp4', null);
    assert.ok(whole && whole !== 'unsatisfiable');
    assert.equal(whole.length, 10);
    assert.equal(await openBlob(store, 'stories/a.mp4', { offset: 50 }), 'unsatisfiable');
    assert.equal(await openBlob(store, 'stories/missing.mp4', null), null);
  });

  test('a store with no ranged read is read whole and sliced', async () => {
    const plain = { put: async () => undefined, delete: async () => undefined, get: async () => TEN };
    const read = await openBlob(plain, 'stories/a.mp4', { suffix: 2 });
    assert.ok(read && read !== 'unsatisfiable');
    assert.deepEqual(await drain(read.body), [8, 9]);
  });
});
