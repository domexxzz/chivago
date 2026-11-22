/**
 * A PNG with nothing in it but the picture - the PNG half of jpeg-clean.ts.
 *
 * Same reason: on Workers there is no ffmpeg to re-encode a photograph, and
 * the re-encode is what removed its metadata before it went public. A PNG is
 * a list of chunks, each with its own CRC, so cleaning one is choosing which
 * chunks to copy. No pixel is decoded and no CRC has to be recomputed.
 *
 * KEPT: the chunks that are the picture or say how to draw it - header,
 * palette, image data, transparency, gamma and colour (including an ICC
 * profile), physical size, and the animation chunks of an APNG.
 *
 * DROPPED: everything else, by default. That is text of every kind (tEXt,
 * zTXt, iTXt - where XMP and a screenshot tool's notes live), eXIf, tIME, and
 * any chunk this file has never heard of. Nothing after IEND is copied.
 */

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const KEEP = new Set([
  'IHDR', 'PLTE', 'IDAT', 'IEND',
  'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'cICP', 'sBIT', 'bKGD', 'pHYs',
  'acTL', 'fcTL', 'fdAT',
]);

/** More chunks than any real PNG has; a file made of empty ones is refused, not copied. */
const MAX_CHUNKS = 50_000;

/** The picture without its metadata. Throws on anything that is not a whole PNG. */
export function cleanPng(input: Uint8Array): Uint8Array {
  if (input.length < SIGNATURE.length || SIGNATURE.some((byte, i) => input[i] !== byte)) {
    throw new Error('not a PNG');
  }
  const kept: Uint8Array[] = [input.subarray(0, SIGNATURE.length)];
  let i = SIGNATURE.length;
  let first = true;
  let ended = false;
  while (i + 12 <= input.length) {
    const length = input[i]! * 0x1000000 + ((input[i + 1]! << 16) | (input[i + 2]! << 8) | input[i + 3]!);
    const type = String.fromCharCode(input[i + 4]!, input[i + 5]!, input[i + 6]!, input[i + 7]!);
    const end = i + 12 + length;
    if (end > input.length) throw new Error('a PNG chunk is cut short');
    if (first && type !== 'IHDR') throw new Error('the PNG does not start with its header');
    first = false;
    if (KEEP.has(type)) kept.push(input.subarray(i, end));
    if (kept.length > MAX_CHUNKS) throw new Error('the PNG has too many chunks');
    i = end;
    if (type === 'IEND') { ended = true; break; }
  }
  if (!ended) throw new Error('the PNG has no end chunk');

  const out = new Uint8Array(kept.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of kept) { out.set(part, at); at += part.length; }
  return out;
}
