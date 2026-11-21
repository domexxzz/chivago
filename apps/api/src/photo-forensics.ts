/**
 * What a photograph says about itself.
 *
 * THE PHONE IS NOT A WITNESS. `POST /quests/:id/proof` takes each photo's
 * capture location and time from the client, in a `meta` field sent beside
 * the files - because the app reads EXIF from the original, and re-encoding
 * on the phone routinely strips it. That is a reasonable thing for the app
 * to do and an unreasonable thing to trust on its own: `meta` is a plain
 * JSON field that a tampered client fills in with whatever it likes, and
 * every check in `review-service.ts` was reading it.
 *
 * So this file derives, from the bytes WE stored and nothing else:
 *
 *   - a SHA-256 of the file, which two submissions of the same photograph
 *     share and which nothing on the phone can forge;
 *   - the EXIF the file still carries, when it carries any - the moment the
 *     shutter fired, where the camera thought it was, and which camera.
 *
 * Nothing here decides anything. It produces facts for `review-service.ts`
 * to turn into signals and a human to judge, which is the rule the whole
 * console is built on: the software shows its work, the host decides.
 *
 * WHAT IT CANNOT DO. A file with no EXIF yields nothing but a hash, and that
 * is the common case rather than a suspicious one - plenty of phones and
 * every screenshot arrive stripped. "No camera data" is therefore reported
 * as UNKNOWN, never as a finding. A check that fires on most honest
 * submissions is a check reviewers learn to click past.
 *
 * PARSING HOSTILE BYTES. Everything below walks a file an attacker chose.
 * Every read is bounds-checked and answers null rather than throwing, every
 * loop has a ceiling, and an offset that points outside the block ends the
 * walk. A corrupt or malicious file produces an empty fingerprint - never an
 * exception, never a hang. A photograph that cannot be parsed must still
 * reach a reviewer.
 */

import { createHash } from 'node:crypto';

export interface PhotoFingerprint {
  /** Hex SHA-256 of the stored bytes. Always present. */
  sha256: string;
  /**
   * The shutter moment exactly as the file records it ("2026:11:21 14:03:22"),
   * with no timezone applied.
   *
   * Kept raw and compared only for EQUALITY, which is why the missing zone
   * does not matter: two files from one camera recording one moment carry the
   * same string whatever zone the camera was set to.
   */
  moment: string | null;
  /**
   * The same moment as a real instant - ONLY when the file also carries the
   * offset that makes it one.
   *
   * Without `OffsetTimeOriginal` an EXIF time is a wall clock with no zone,
   * and a tourist whose camera is still on their home time would be hours
   * "wrong" through no fault of theirs. Guessing the island's zone would
   * invent an instant and fail that traveller, so this stays null and the
   * timing check keeps using what the phone worked out, which knew.
   */
  takenAt: string | null;
  /** Where the camera thought it was, from the file's own GPS block. */
  lat: number | null;
  lng: number | null;
  /** Make, model and body serial as recorded, joined by `|`. */
  camera: string | null;
}

const EMPTY: Omit<PhotoFingerprint, 'sha256'> = {
  moment: null, takenAt: null, lat: null, lng: null, camera: null,
};

/** Everything the stored bytes say about themselves. Never throws. */
export function fingerprint(bytes: Buffer): PhotoFingerprint {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  let exif: Omit<PhotoFingerprint, 'sha256'> = EMPTY;
  try {
    const tiff = exifBlock(bytes);
    if (tiff) exif = readTiff(tiff) ?? EMPTY;
  } catch {
    // A malformed file is a photograph a reviewer still has to look at.
    exif = EMPTY;
  }
  return { sha256, ...exif };
}

// ---------------------------------------------------------------------------
// Finding the TIFF block, in each container we accept
// ---------------------------------------------------------------------------

/** Ceilings. A file is a few dozen segments; anything more is not a photograph. */
const MAX_SEGMENTS = 512;
const EXIF_HEADER = 'Exif\0\0';

/**
 * The EXIF payload - a TIFF block - out of a JPEG, PNG or WebP.
 *
 * `uploads.ts` has already proved which of the three this is from its magic
 * bytes, so the dispatch here only has to agree with that, not re-decide it.
 */
function exifBlock(b: Buffer): Buffer | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) return jpegExif(b);
  if (b.length > 8 && b.readUInt32BE(0) === 0x89504e47) return pngExif(b);
  if (b.length > 12 && b.subarray(0, 4).toString('ascii') === 'RIFF'
    && b.subarray(8, 12).toString('ascii') === 'WEBP') return webpExif(b);
  return null;
}

/** Walk the marker segments to APP1. Stops at the scan: pixels are not metadata. */
function jpegExif(b: Buffer): Buffer | null {
  let at = 2;
  for (let seen = 0; seen < MAX_SEGMENTS; seen += 1) {
    // Fill bytes (0xFF) may pad the gap before a marker.
    while (at < b.length && b[at] === 0xff) at += 1;
    if (at >= b.length) return null;
    const marker = b[at]!;
    at += 1;
    // Standalone markers carry no length: SOI/EOI, TEM, and the restarts.
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01
      || (marker >= 0xd0 && marker <= 0xd7)) continue;
    // Start of scan - entropy-coded data follows and there is no more metadata.
    if (marker === 0xda) return null;
    const length = u16(b, at, false);
    if (length === null || length < 2) return null;
    const from = at + 2;
    const to = at + length;
    if (to > b.length) return null;
    if (marker === 0xe1 && b.subarray(from, from + 6).toString('latin1') === EXIF_HEADER) {
      return b.subarray(from + 6, to);
    }
    at = to;
  }
  return null;
}

/** PNG stores EXIF in an `eXIf` chunk, as the bare TIFF block. */
function pngExif(b: Buffer): Buffer | null {
  let at = 8;
  for (let seen = 0; seen < MAX_SEGMENTS; seen += 1) {
    const length = u32(b, at, false);
    if (length === null) return null;
    const type = b.subarray(at + 4, at + 8).toString('latin1');
    if (type.length < 4) return null;
    const from = at + 8;
    const to = from + length;
    // The 4-byte CRC follows the data; `to` overflowing the buffer is corruption.
    if (to > b.length || to < from) return null;
    if (type === 'eXIf') return b.subarray(from, to);
    if (type === 'IEND') return null;
    at = to + 4;
  }
  return null;
}

/** WebP stores it in an `EXIF` RIFF chunk, sometimes behind the JPEG header. */
function webpExif(b: Buffer): Buffer | null {
  let at = 12;
  for (let seen = 0; seen < MAX_SEGMENTS; seen += 1) {
    const type = b.subarray(at, at + 4).toString('latin1');
    if (type.length < 4) return null;
    const length = u32(b, at + 4, true);
    if (length === null) return null;
    const from = at + 8;
    const to = from + length;
    if (to > b.length || to < from) return null;
    if (type === 'EXIF') {
      const payload = b.subarray(from, to);
      return payload.subarray(0, 6).toString('latin1') === EXIF_HEADER
        ? payload.subarray(6)
        : payload;
    }
    // Chunks are padded to an even length.
    at = to + (length % 2);
  }
  return null;
}

// ---------------------------------------------------------------------------
// The TIFF block itself
// ---------------------------------------------------------------------------

const u16 = (b: Buffer, at: number, little: boolean): number | null =>
  at < 0 || at + 2 > b.length ? null : (little ? b.readUInt16LE(at) : b.readUInt16BE(at));

const u32 = (b: Buffer, at: number, little: boolean): number | null =>
  at < 0 || at + 4 > b.length ? null : (little ? b.readUInt32LE(at) : b.readUInt32BE(at));

/** Bytes one value of each TIFF type occupies. Index is the type code. */
const TYPE_BYTES: Record<number, number> = {
  1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8,
};

/** One directory entry, resolved to where its value actually lives. */
interface Field { type: number; count: number; at: number }

/** A whole IFD as a map from tag to field. A ceiling on entries, as always. */
const MAX_ENTRIES = 256;

function readIfd(b: Buffer, offset: number, little: boolean): Map<number, Field> | null {
  const count = u16(b, offset, little);
  if (count === null || count > MAX_ENTRIES) return null;
  const fields = new Map<number, Field>();
  for (let i = 0; i < count; i += 1) {
    const entry = offset + 2 + i * 12;
    const tag = u16(b, entry, little);
    const type = u16(b, entry + 2, little);
    const n = u32(b, entry + 4, little);
    if (tag === null || type === null || n === null) return fields;
    const size = TYPE_BYTES[type];
    // An unknown type has an unknowable length, so its value cannot be found.
    if (size === undefined) continue;
    const bytes = size * n;
    // A count that overflows the file is corruption, not a value.
    if (bytes > b.length) continue;
    // Four bytes or fewer sit in the entry; anything longer is a pointer.
    let at = entry + 8;
    if (bytes > 4) {
      const pointer = u32(b, entry + 8, little);
      if (pointer === null || pointer + bytes > b.length) continue;
      at = pointer;
    }
    fields.set(tag, { type, count: n, at });
  }
  return fields;
}

const MAX_TEXT = 64;

/** An ASCII field, cut at its NUL and stripped of anything unprintable. */
function text(b: Buffer, f: Field | undefined): string | null {
  if (!f || (f.type !== 2 && f.type !== 7)) return null;
  const end = Math.min(f.at + f.count, b.length);
  if (end <= f.at) return null;
  const raw = b.subarray(f.at, end).toString('latin1');
  // eslint-disable-next-line no-control-regex
  const value = raw.split('\0')[0]!.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return value ? value.slice(0, MAX_TEXT) : null;
}

/** One unsigned rational, as a number. */
function rational(b: Buffer, at: number, little: boolean): number | null {
  const numerator = u32(b, at, little);
  const denominator = u32(b, at + 4, little);
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

/**
 * GPS degrees, from the three rationals EXIF stores them as.
 *
 * The hemisphere is a separate ASCII tag, which is why a file can hold a
 * perfectly good latitude and still be unusable without it.
 */
function coordinate(
  b: Buffer, value: Field | undefined, ref: string | null, little: boolean, limit: number,
): number | null {
  if (!value || value.type !== 5 || value.count < 3 || !ref) return null;
  const degrees = rational(b, value.at, little);
  const minutes = rational(b, value.at + 8, little);
  const seconds = rational(b, value.at + 16, little);
  if (degrees === null || minutes === null || seconds === null) return null;
  const magnitude = degrees + minutes / 60 + seconds / 3600;
  if (!Number.isFinite(magnitude) || magnitude > limit) return null;
  const negative = ref.toUpperCase().startsWith('S') || ref.toUpperCase().startsWith('W');
  return negative ? -magnitude : magnitude;
}

const EXIF_IFD = 0x8769;
const GPS_IFD = 0x8825;
const MAKE = 0x010f;
const MODEL = 0x0110;
const DATE_TIME_ORIGINAL = 0x9003;
const CREATE_DATE = 0x9004;
const OFFSET_TIME_ORIGINAL = 0x9011;
const BODY_SERIAL = 0xa431;

const MOMENT = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/;
const OFFSET = /^[+-]\d{2}:\d{2}$/;

function readTiff(b: Buffer): Omit<PhotoFingerprint, 'sha256'> | null {
  const order = u16(b, 0, false);
  if (order !== 0x4949 && order !== 0x4d4d) return null;
  const little = order === 0x4949;
  if (u16(b, 2, little) !== 42) return null;
  const first = u32(b, 4, little);
  if (first === null || first < 8) return null;

  const ifd0 = readIfd(b, first, little);
  if (!ifd0) return null;

  const exifPointer = ifd0.get(EXIF_IFD);
  const exif = exifPointer && exifPointer.type === 4
    ? readIfd(b, u32(b, exifPointer.at, little) ?? -1, little)
    : null;
  const gpsPointer = ifd0.get(GPS_IFD);
  const gps = gpsPointer && gpsPointer.type === 4
    ? readIfd(b, u32(b, gpsPointer.at, little) ?? -1, little)
    : null;

  const moment = text(b, exif?.get(DATE_TIME_ORIGINAL) ?? exif?.get(CREATE_DATE));
  const camera = [
    text(b, ifd0.get(MAKE)),
    text(b, ifd0.get(MODEL)),
    text(b, exif?.get(BODY_SERIAL)),
  ].filter(Boolean).join('|') || null;

  return {
    moment: moment && MOMENT.test(moment) ? moment : null,
    takenAt: instantOf(moment, text(b, exif?.get(OFFSET_TIME_ORIGINAL))),
    lat: gps ? coordinate(b, gps.get(2), text(b, gps.get(1)), little, 90) : null,
    lng: gps ? coordinate(b, gps.get(4), text(b, gps.get(3)), little, 180) : null,
    camera,
  };
}

/** A real instant, or null when the file did not record enough to make one. */
function instantOf(moment: string | null, offset: string | null): string | null {
  if (!moment || !offset) return null;
  const parts = MOMENT.exec(moment);
  if (!parts || !OFFSET.test(offset)) return null;
  const [, year, month, day, hour, minute, second] = parts;
  const at = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}
