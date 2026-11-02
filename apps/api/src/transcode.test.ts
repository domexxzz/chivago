/**
 * The transcoder, against the real binary.
 *
 * WHY THIS FILE EXISTS AT ALL. Everything else in the suite injects a fake
 * transcoder, which is right - no test should need ffmpeg to check the story
 * state machine. But the one property that actually matters here is a
 * property OF FFMPEG'S OUTPUT, and a fake cannot have it: whether a published
 * clip still carries the phone's position.
 *
 * It did. `story-service.ts` said the re-encode strips EXIF and position, and
 * that was true of photographs and false of clips, because the video pipeline
 * had no `-map_metadata -1` and ffmpeg copies global metadata into an MP4 by
 * default. An iPhone writes the recording location into exactly that field.
 *
 * So these tests run the real binary, and SKIP where it is absent rather than
 * passing. A test that silently passes without ffmpeg would be worse than no
 * test: it would report that position is stripped on a machine that never
 * checked.
 */

import { strict as assert } from 'node:assert';
import { test, describe, before, after } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeFileSync as writeOut } from 'node:fs';

import { FFMPEG, ffmpegTranscoder, transcoderAvailable, type Encoded } from './transcode.ts';

/** A coordinate off Koh Samui, recognisable in any output that leaks it. */
const LAT_LNG = '+09.5357+100.0617/';

let dir: string;
let haveFfmpeg = false;

before(async () => {
  haveFfmpeg = await transcoderAvailable();
  dir = mkdtempSync(join(tmpdir(), 'chivago-transcode-'));
});

after(() => rmSync(dir, { recursive: true, force: true }));

/** Run a tool and hand back its stdout. Used for the fixture and for ffprobe. */
function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (c: Buffer) => { out += c.toString('utf8'); });
    child.stderr.on('data', (c: Buffer) => { err += c.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${bin} exited ${code}: ${err.slice(-400)}`)));
  });
}

const ffprobe = (): string => FFMPEG.replace(/ffmpeg(\.exe)?$/i, (m) => m.replace('ffmpeg', 'ffprobe'));

/** A two-second clip tagged with a position, the way a phone hands one over. */
async function clipWithPosition(path: string): Promise<void> {
  await run(FFMPEG, [
    '-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=15',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-metadata', `location=${LAT_LNG}`,
    '-metadata', `com.apple.quicktime.location.ISO6709=${LAT_LNG}`,
    '-metadata', 'title=private holiday',
    path,
  ]);
}

/**
 * Run the real transcoder over a file's bytes and put the results back on
 * disk, because ffprobe reads files and the transcoder no longer writes any.
 */
async function encodeFile(src: string, kind: 'video' | 'photo', outBase: string): Promise<Encoded> {
  const bytes = new Uint8Array(readFileSync(src));
  const ext = src.endsWith('.jpg') ? 'jpg' : 'mp4';
  const encoded = kind === 'video'
    ? await ffmpegTranscoder.video(bytes, ext)
    : await ffmpegTranscoder.photo(bytes, ext);
  writeOut(`${outBase}.media`, encoded.media);
  writeOut(`${outBase}.poster`, encoded.poster);
  return encoded;
}

/** Every metadata tag ffprobe can see, format-level and stream-level. */
async function tagsOf(path: string): Promise<string> {
  const fmt = await run(ffprobe(), [
    '-v', 'error', '-show_entries', 'format_tags', '-of', 'default=noprint_wrappers=1', path,
  ]);
  const str = await run(ffprobe(), [
    '-v', 'error', '-show_entries', 'stream_tags', '-of', 'default=noprint_wrappers=1', path,
  ]);
  return `${fmt}\n${str}`;
}

describe('a published clip does not carry the phone of origin', () => {
  test('the fixture really does carry a position, or this proves nothing', async (t) => {
    if (!haveFfmpeg) return t.skip('ffmpeg is not on this machine');
    const src = join(dir, 'src.mp4');
    await clipWithPosition(src);
    const tags = await tagsOf(src);
    assert.match(tags, /location/i, 'the fixture is tagged');
    assert.match(tags, /100\.0617/, 'the coordinate is in the source');
  });

  test('the re-encode strips the position', async (t) => {
    if (!haveFfmpeg) return t.skip('ffmpeg is not on this machine');
    const src = join(dir, 'in.mp4');
    const out = join(dir, 'out.mp4');
    const poster = join(dir, 'out.jpg');
    await clipWithPosition(src);

    await encodeFile(src, 'video', join(dir, 'enc1'));

    const tags = await tagsOf(join(dir, 'enc1.media'));
    assert.doesNotMatch(tags, /100\.0617/, 'the coordinate survived into the published clip');
    assert.doesNotMatch(tags, /09\.5357/, 'the latitude survived into the published clip');
    assert.doesNotMatch(tags, /ISO6709/i, "the phone's location field survived");
    assert.doesNotMatch(tags, /private holiday/, 'a free-text title survived');
  });

  test('nor is there a location BOX left in the raw bytes', async (t) => {
    if (!haveFfmpeg) return t.skip('ffmpeg is not on this machine');
    /*
      ffprobe reports the tags it can decode. This asks the blunter question:
      is the container still carrying a location box at all.

      It looks for `loci` - the 3GPP location atom - and not for the digits.
      The coordinate is stored there as binary fixed-point, NOT as the text
      "+09.5357", so searching the bytes for the number finds nothing whether
      or not the leak is present, and a test that cannot fail is worse than
      none. Checked: `loci` and the free-text title are both present in the
      bytes of an unfixed encode and absent from a fixed one.
    */
    const src = join(dir, 'raw-in.mp4');
    await clipWithPosition(src);
    const encoded = await encodeFile(src, 'video', join(dir, 'enc2'));
    const bytes = Buffer.from(encoded.media).toString('latin1');
    assert.ok(!bytes.includes('loci'), 'a 3GPP location box survived into the published clip');
    assert.ok(!bytes.includes('private holiday'), 'a free-text title survived into the bytes');
  });

  test('the poster frame is clean too', async (t) => {
    if (!haveFfmpeg) return t.skip('ffmpeg is not on this machine');
    const src = join(dir, 'p-in.mp4');
    await clipWithPosition(src);
    await encodeFile(src, 'video', join(dir, 'enc3'));
    assert.doesNotMatch(await tagsOf(join(dir, 'enc3.poster')), /100\.0617/);
  });

  test('and the clip still plays - stripping metadata did not break the encode', async (t) => {
    if (!haveFfmpeg) return t.skip('ffmpeg is not on this machine');
    const src = join(dir, 'ok-in.mp4');
    await clipWithPosition(src);
    const encoded = await encodeFile(src, 'video', join(dir, 'enc4'));
    const out = join(dir, 'enc4.media');

    // A real H.264 stream of the expected width, and a duration ffmpeg read.
    const probe = await run(ffprobe(), [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,width', '-of', 'csv=p=0', out,
    ]);
    assert.match(probe, /h264/);
    assert.match(probe, /320/, 'a 320-wide input is not upscaled to 720');
    assert.equal(encoded.durationS, 2);
  });
});

describe('a published photograph does not carry its EXIF', () => {
  test('the position is stripped', async (t) => {
    if (!haveFfmpeg) return t.skip('ffmpeg is not on this machine');
    // This path already had `-map_metadata -1`; the test is here so the two
    // paths are held to one standard rather than one of them being trusted.
    const src = join(dir, 'photo-in.jpg');
    await run(FFMPEG, [
      '-y', '-f', 'lavfi', '-i', 'color=c=sandybrown:size=64x64:duration=1',
      '-frames:v', '1', '-metadata', `location=${LAT_LNG}`, src,
    ]);
    await encodeFile(src, 'photo', join(dir, 'enc5'));
    assert.doesNotMatch(await tagsOf(join(dir, 'enc5.media')), /100\.0617/);
  });
});
