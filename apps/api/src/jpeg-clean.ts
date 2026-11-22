/**
 * A JPEG with nothing in it but the picture - for when there is no ffmpeg.
 *
 * Stories re-encode every photograph, and the re-encode is what strips the
 * EXIF a phone writes into it, POSITION INCLUDED, before the picture becomes
 * public (transcode.ts). On Cloudflare Workers there is no ffmpeg to run, and
 * until the encoder container exists every photo story failed. This does the
 * part of the re-encode that matters for privacy without decoding a pixel:
 * it copies the image data and drops every segment that can carry metadata.
 *
 * KEPT: SOI, the frame and Huffman/quantisation tables, APP0 (JFIF), an APP2
 * that is an ICC colour profile, APP14 (Adobe, which says how to read the
 * colour), the scan data up to the first EOI - and the orientation, rewritten
 * as a fresh EXIF block holding that one tag and nothing else, because an
 * iPhone photo without it shows up on its side.
 *
 * DROPPED: APP1 (EXIF and XMP: GPS, device, time, thumbnails), every other
 * APPn (IPTC, MPF and the rest), comments, and anything after the first EOI -
 * which on an iPhone is the gain map and other secondary pictures, each able
 * to carry its own metadata.
 *
 * Anything that does not parse as a JPEG throws, so a broken file is refused
 * rather than published.
 */

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const APP0 = 0xe0;
const APP1 = 0xe1;
const APP2 = 0xe2;
const APP14 = 0xee;
const COM = 0xfe;
const ORIENTATION_TAG = 0x0112;

const ascii = (bytes: Uint8Array, from: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(from, from + length));

/** The EXIF orientation (1-8) in an APP1 payload, or null when it has none. */
export function exifOrientation(payload: Uint8Array): number | null {
  if (payload.length < 14 || ascii(payload, 0, 6) !== 'Exif\0\0') return null;
  const tiff = payload.subarray(6);
  const little = tiff[0] === 0x49 && tiff[1] === 0x49;
  if (!little && !(tiff[0] === 0x4d && tiff[1] === 0x4d)) return null;
  const u16 = (o: number): number => (little ? tiff[o]! | (tiff[o + 1]! << 8) : (tiff[o]! << 8) | tiff[o + 1]!);
  const u32 = (o: number): number => (little
    ? (tiff[o]! | (tiff[o + 1]! << 8) | (tiff[o + 2]! << 16)) + tiff[o + 3]! * 0x1000000
    : tiff[o]! * 0x1000000 + ((tiff[o + 1]! << 16) | (tiff[o + 2]! << 8) | tiff[o + 3]!));
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return null;
  const entries = u16(ifd);
  for (let k = 0; k < entries; k++) {
    const at = ifd + 2 + k * 12;
    if (at + 12 > tiff.length) return null;
    if (u16(at) === ORIENTATION_TAG) {
      const value = u16(at + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/** A complete APP1 segment holding one EXIF tag: the orientation. */
function orientationSegment(orientation: number): Uint8Array {
  return Uint8Array.from([
    0xff, APP1, 0x00, 0x22, // marker, length 34
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // big-endian TIFF, IFD0 at 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // SHORT, count 1
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ]);
}

const isIcc = (segment: Uint8Array): boolean => ascii(segment, 4, 12) === 'ICC_PROFILE\0';

/** The first EOI after `from`, in entropy-coded data where 0xFF is always escaped. */
function endOfImage(bytes: Uint8Array, from: number): number {
  for (let i = from; i + 1 < bytes.length; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === EOI) return i + 2;
  }
  throw new Error('the JPEG has no end-of-image marker');
}

/** The picture without its metadata. Throws on anything that is not a whole JPEG. */
export function cleanJpeg(input: Uint8Array): Uint8Array {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== SOI) throw new Error('not a JPEG');
  const kept: Uint8Array[] = [];
  let orientation: number | null = null;
  let i = 2;
  let sawScan = false;
  while (i + 1 < input.length) {
    if (input[i] !== 0xff) throw new Error('a JPEG segment is broken');
    const marker = input[i + 1]!;
    if (marker === 0xff) { i += 1; continue; } // fill byte before a marker
    if (marker === SOS) {
      // The scan and everything up to the picture's own end: further scans and
      // tables of a progressive JPEG included, trailing secondary images not.
      kept.push(input.subarray(i, endOfImage(input, i + 2)));
      sawScan = true;
      break;
    }
    if (i + 4 > input.length) throw new Error('a JPEG segment is cut short');
    const length = (input[i + 2]! << 8) | input[i + 3]!;
    if (length < 2 || i + 2 + length > input.length) throw new Error('a JPEG segment is cut short');
    const segment = input.subarray(i, i + 2 + length);
    if (marker === APP1) orientation ??= exifOrientation(segment.subarray(4));
    const isApp = marker >= APP0 && marker <= 0xef;
    const keep = marker !== COM && (!isApp || marker === APP0 || marker === APP14 || (marker === APP2 && isIcc(segment)));
    if (keep) kept.push(segment);
    i += 2 + length;
  }
  if (!sawScan) throw new Error('the JPEG has no image data');

  const parts: Uint8Array[] = [Uint8Array.from([0xff, SOI])];
  if (orientation !== null && orientation !== 1) parts.push(orientationSegment(orientation));
  parts.push(...kept);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}
