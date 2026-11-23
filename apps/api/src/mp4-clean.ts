/**
 * An MP4 or MOV with nothing in it but the pictures and the sound.
 *
 * WHY. Every story used to be re-encoded by ffmpeg, and the re-encode is what
 * removed a clip's metadata before it went public. On Cloudflare Workers
 * there is no ffmpeg. A phone's clip carries where it was filmed in at least
 * three places - `moov/udta` (©xyz), `moov/meta` (Apple's
 * com.apple.quicktime.location.ISO6709, with the make, model and date), and
 * sometimes a whole extra TRACK of timed metadata (an action camera's GPS
 * telemetry is one) - so publishing the file as it arrived is not an option.
 *
 * HOW, without re-encoding and without moving a byte. The file is a tree of
 * boxes, and the sample tables address the media by absolute file offset. So
 * nothing is removed: a box that must go is renamed `free` - the format's own
 * word for "skip this" - and its contents are overwritten with zeros. Every
 * offset stays true, and the bytes are really gone, not just unlisted.
 *
 * DENY BY DEFAULT at every level this walks: a box is kept only if it is on
 * the short list of ones a player needs. Tracks other than video and sound
 * are dropped whole, and the samples they point at in `mdat` are zeroed too.
 * Creation and modification times are zeroed in the headers that are kept.
 *
 * IT WRITES INTO THE BUFFER IT IS GIVEN. A clip is up to 25 MB and a Worker
 * has 128; a copy is the difference between fitting and not.
 *
 * NOT DONE HERE, because it needs a decoder: trimming to ten seconds, scaling
 * to 720 wide, converting HEVC to H.264, and cutting a poster frame. Nor does
 * it look INSIDE the encoded stream: anything a camera wrote into the video
 * bitstream itself (an SEI message) stays, where a re-encode would drop it.
 */

const KEEP_TOP = new Set(['ftyp', 'moov', 'mdat', 'wide', 'moof', 'mfra', 'sidx', 'styp', 'ssix', 'pdin']);
const KEEP_MOOV = new Set(['mvhd', 'trak', 'mvex', 'iods']);
const KEEP_TRAK = new Set(['tkhd', 'mdia', 'edts', 'tref', 'tapt']);
const KEEP_MDIA = new Set(['mdhd', 'hdlr', 'minf', 'elng']);
const PADDING = new Set(['free', 'skip']);
const PLAYABLE = new Set(['vide', 'soun']);

/*
  Ceilings, because this parses a file from anybody. A real clip has a few
  dozen boxes at any level and a handful of tracks; a file built to hurt has
  three million eight-byte boxes, or a sample table that claims the whole
  file once per chunk. Both are refused long before they cost anything.
*/
const MAX_BOXES_PER_LEVEL = 10_000;
const MAX_TRACKS = 32;

interface Box { type: string; start: number; body: number; end: number }

export class UnreadableClip extends Error {
  constructor(detail: string) {
    super(`the clip could not be read (${detail})`);
    this.name = 'UnreadableClip';
  }
}

const u32 = (b: Uint8Array, at: number): number =>
  b[at]! * 0x1000000 + ((b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!);
const u64 = (b: Uint8Array, at: number): number => u32(b, at) * 0x100000000 + u32(b, at + 4);
const sizeBytes = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const fourcc = (b: Uint8Array, at: number): string =>
  String.fromCharCode(b[at]!, b[at + 1]!, b[at + 2]!, b[at + 3]!);

/**
 * The boxes between two offsets.
 *
 * `lenient` is for the top level only, where real files end untidily: a clip
 * cut off mid-`mdat` is still a clip, and bytes after the last box (some
 * phones append their own trailer) are not a box at all. Inside `moov` a box
 * that does not fit is corruption, and is refused.
 */
function boxes(b: Uint8Array, from: number, to: number, lenient = false): Box[] {
  const found: Box[] = [];
  let at = from;
  while (at < to) {
    const fits = at + 8 <= to;
    let size = fits ? u32(b, at) : 0;
    let header = 8;
    if (fits && size === 1) {
      if (at + 16 > to) size = -1;
      else { size = u64(b, at + 8); header = 16; }
    } else if (fits && size === 0) {
      size = to - at;
    }
    const ok = fits && size >= header && at + size <= to;
    if (!ok) {
      if (!lenient) throw new UnreadableClip('a box does not fit inside its parent');
      const type = fits ? fourcc(b, at + 4) : '';
      if (type === 'mdat' && size > header) {
        found.push({ type, start: at, body: at + header, end: to });
      } else {
        // Not a box. Whatever it is, it does not go out - and where there is
        // room it becomes a real `free` box, so the file still parses to its
        // end and a second pass finds nothing left to do.
        b.fill(0, at, to);
        if (fits) { b.set([...sizeBytes(to - at), 0x66, 0x72, 0x65, 0x65], at); }
      }
      break;
    }
    found.push({ type: fourcc(b, at + 4), start: at, body: at + header, end: at + size });
    if (found.length > MAX_BOXES_PER_LEVEL) throw new UnreadableClip('it has too many boxes');
    at += size;
  }
  return found;
}

/** Rename a box `free` and zero what was in it. Its size, and so every offset, is unchanged. */
function erase(b: Uint8Array, box: Box): void {
  b.set([0x66, 0x72, 0x65, 0x65], box.start + 4);
  b.fill(0, box.body, box.end);
}

/** Zero the creation and modification times of an mvhd, tkhd or mdhd. */
function zeroTimes(b: Uint8Array, box: Box): void {
  const wide = b[box.body] === 1;
  const end = box.body + 4 + (wide ? 16 : 8);
  if (end > box.end) throw new UnreadableClip(`a ${box.type} header is cut short`);
  b.fill(0, box.body + 4, end);
}

/** Seconds, from the movie header, or null when it does not say. */
function movieSeconds(b: Uint8Array, mvhd: Box): number | null {
  const wide = b[mvhd.body] === 1;
  const at = mvhd.body + 4 + (wide ? 16 : 8);
  if (at + (wide ? 12 : 8) > mvhd.end) throw new UnreadableClip('the movie header is cut short');
  const timescale = u32(b, at);
  const duration = wide ? u64(b, at + 4) : u32(b, at + 4);
  const unknown = wide ? duration >= Number.MAX_SAFE_INTEGER : duration === 0xffffffff;
  if (timescale === 0 || duration === 0 || unknown) return null;
  return duration / timescale;
}

const child = (b: Uint8Array, parent: Box, type: string): Box | undefined =>
  boxes(b, parent.body, parent.end).find((box) => box.type === type);

/** What a track carries: `vide`, `soun`, or something that must not go out. */
function handlerOf(b: Uint8Array, trak: Box): string {
  const mdia = child(b, trak, 'mdia');
  const hdlr = mdia && child(b, mdia, 'hdlr');
  if (!hdlr || hdlr.body + 12 > hdlr.end) return '';
  return fourcc(b, hdlr.body + 8);
}

/**
 * The four characters naming how the video is encoded, or null.
 *
 * `stsd` holds one entry per sample description and the entry is itself a
 * box, so its type IS the codec: `avc1` for H.264, `hvc1` or `hev1` for
 * HEVC. Nothing here decodes anything - it reads a name, four bytes deep in
 * a table this file already walks.
 *
 * NULL IS NOT A REFUSAL. A clip whose table cannot be read is passed on
 * exactly as it was before this existed. The caller refuses a codec it
 * positively recognises as unplayable; refusing everything it cannot name
 * would turn an unreadable table into a traveller who cannot post at all,
 * which is a worse failure than the one this is here to stop.
 */
function videoCodec(b: Uint8Array, trak: Box): string | null {
  const mdia = child(b, trak, 'mdia');
  const minf = mdia && child(b, mdia, 'minf');
  const stbl = minf && child(b, minf, 'stbl');
  const stsd = stbl && child(b, stbl, 'stsd');
  if (!stsd) return null;
  // version+flags, entry count, then the first entry: its own size, its type.
  if (u32(b, stsd.body + 4) === 0 || stsd.body + 16 > stsd.end) return null;
  return fourcc(b, stsd.body + 12);
}

/**
 * Zero every sample a track points at.
 *
 * Erasing the `trak` box alone would leave its samples sitting in `mdat`,
 * unlisted but perfectly recoverable. The three tables say exactly where they
 * are: chunk offsets (stco/co64), how many samples each chunk holds (stsc),
 * and how big each sample is (stsz).
 */
function zeroSamples(b: Uint8Array, trak: Box): void {
  const mdia = child(b, trak, 'mdia');
  const minf = mdia && child(b, mdia, 'minf');
  const stbl = minf && child(b, minf, 'stbl');
  if (!stbl) return;
  const tables = boxes(b, stbl.body, stbl.end);
  const stsz = tables.find((t) => t.type === 'stsz');
  const stsc = tables.find((t) => t.type === 'stsc');
  const stco = tables.find((t) => t.type === 'stco');
  const co64 = tables.find((t) => t.type === 'co64');
  const offsets = stco ?? co64;
  const chunkCount = offsets ? u32(b, offsets.body + 4) : 0;
  if (chunkCount === 0) return; // a track that lists nothing has nothing to zero
  if (!stsz || !stsc || !offsets) throw new UnreadableClip('a data track has no sample tables');

  const width = offsets.type === 'co64' ? 8 : 4;
  if (offsets.body + 8 + chunkCount * width > offsets.end) throw new UnreadableClip('a chunk table is cut short');
  const uniform = u32(b, stsz.body + 4);
  const sampleCount = u32(b, stsz.body + 8);
  if (uniform === 0 && stsz.body + 12 + sampleCount * 4 > stsz.end) throw new UnreadableClip('a size table is cut short');
  const runs = u32(b, stsc.body + 4);
  if (stsc.body + 8 + runs * 12 > stsc.end) throw new UnreadableClip('a chunk map is cut short');

  let sample = 0;
  let run = 0;
  let zeroed = 0;
  for (let chunk = 1; chunk <= chunkCount && sample < sampleCount; chunk++) {
    while (run + 1 < runs && u32(b, stsc.body + 8 + (run + 1) * 12) <= chunk) run += 1;
    const perChunk = runs === 0 ? 0 : u32(b, stsc.body + 8 + run * 12 + 4);
    const at = offsets.body + 8 + (chunk - 1) * width;
    const start = width === 8 ? u64(b, at) : u32(b, at);
    let length = 0;
    for (let k = 0; k < perChunk && sample < sampleCount; k++, sample++) {
      length += uniform !== 0 ? uniform : u32(b, stsz.body + 12 + sample * 4);
    }
    // A track cannot hold more than the file does; one that says so is an attack on the CPU.
    zeroed += length;
    if (zeroed > b.length) throw new UnreadableClip('a data track claims more than the file holds');
    // Clamped: in a clip cut off mid-upload the samples past the cut are not there to zero.
    b.fill(0, Math.min(start, b.length), Math.min(start + length, b.length));
  }
}

/** Tidy a track that stays: drop everything but what plays, and its times. */
function cleanTrack(b: Uint8Array, trak: Box, dropReferences: boolean): void {
  for (const box of boxes(b, trak.body, trak.end)) {
    if (box.type === 'tkhd') zeroTimes(b, box);
    else if (box.type === 'mdia') {
      for (const inner of boxes(b, box.body, box.end)) {
        if (inner.type === 'mdhd') zeroTimes(b, inner);
        else if (!KEEP_MDIA.has(inner.type)) erase(b, inner);
      }
    } else if (box.type === 'tref' && dropReferences) erase(b, box);
    else if (!KEEP_TRAK.has(box.type)) erase(b, box);
  }
}

export interface CleanedClip {
  /** Seconds, from the movie header. Null when it does not say. */
  durationS: number | null;
  /** How many non-video, non-sound tracks were removed. */
  droppedTracks: number;
  /** How the video is encoded (`avc1`, `hvc1`, ...), or null when unreadable. */
  videoCodec: string | null;
}

/**
 * Remove everything but picture and sound from an MP4 or MOV, IN PLACE.
 * Throws `UnreadableClip` for a file it cannot be sure about - a clip is
 * refused rather than published half-cleaned.
 */
export function cleanMp4(b: Uint8Array): CleanedClip {
  const top = boxes(b, 0, b.length, true);
  const moov = top.find((box) => box.type === 'moov');
  if (!moov) throw new UnreadableClip('it has no movie header');
  const fragmented = top.some((box) => box.type === 'moof');

  for (const box of top) {
    if (PADDING.has(box.type)) b.fill(0, box.body, box.end);
    else if (!KEEP_TOP.has(box.type)) erase(b, box);
  }

  let durationS: number | null = null;
  const tracks: Box[] = [];
  for (const box of boxes(b, moov.body, moov.end)) {
    if (box.type === 'cmov') throw new UnreadableClip('its movie header is compressed');
    if (box.type === 'mvhd') { durationS = movieSeconds(b, box); zeroTimes(b, box); }
    else if (box.type === 'trak') tracks.push(box);
    else if (!KEEP_MOOV.has(box.type)) erase(b, box);
  }

  if (tracks.length > MAX_TRACKS) throw new UnreadableClip('it has too many tracks');
  const kinds = tracks.map((trak) => handlerOf(b, trak));
  const playable = tracks.filter((_, k) => PLAYABLE.has(kinds[k]!));
  const others = tracks.filter((_, k) => !PLAYABLE.has(kinds[k]!));
  if (!kinds.includes('vide')) throw new UnreadableClip('it has no video track');
  // A fragmented file keeps its samples in `moof` runs, which this does not
  // walk, so an extra track's samples could not be found to zero.
  if (fragmented && others.length > 0) throw new UnreadableClip('a fragmented clip with an extra data track');

  // Read before anything is erased, though `minf` survives cleaning anyway.
  const vide = tracks.find((_, k) => kinds[k] === 'vide');
  const codec = vide ? videoCodec(b, vide) : null;

  // Samples first, while the tables that locate them are still there.
  for (const trak of others) zeroSamples(b, trak);
  for (const trak of others) erase(b, trak);
  // A reference to a track that is gone would be a dangling one.
  for (const trak of playable) cleanTrack(b, trak, others.length > 0);

  return { durationS, droppedTracks: others.length, videoCodec: codec };
}
