/**
 * ffmpeg, for stories.
 *
 * A phone hands over whatever it recorded: since iOS 13.6.1 an iPhone's is
 * an HEVC `.mov`, an Android's a WebM, and neither plays on the other. Every
 * story is re-encoded here to H.264 in an MP4, 720 wide, ten seconds at most,
 * with a poster frame - the one shape every browser in the room can play.
 * A photograph goes through the same door: re-encoded to a 720-wide JPEG,
 * which also strips the EXIF the phone put in it, position included, before
 * the picture becomes public.
 *
 * The binary is `ffmpeg` on the PATH, or `CHIVAGO_FFMPEG`. The Dockerfile
 * installs it; a machine without it fails the upload out loud rather than
 * storing a file nobody can play.
 *
 * "Out loud" means out loud ABOUT THE RIGHT THING. A machine with no ffmpeg
 * used to answer every upload with "that file could not be used as a story",
 * which is a 400 and a lie: the file was fine, the server was not. On the
 * day that reads as every traveller in the room having a broken phone, and
 * the one person who could fix it is told nothing. `TranscoderUnavailable`
 * separates the two - see `handleError` in http.ts, which answers it 503.
 */

import { spawn } from 'node:child_process';

/**
 * ffmpeg could not be run at all - not installed, not executable, not on the
 * PATH. A server fault, never the uploader's.
 */
export class TranscoderUnavailable extends Error {
  constructor(cause: string) {
    super(`The story encoder is not available on this server (${cause}).`);
    this.name = 'TranscoderUnavailable';
  }
}

export const STORY_MAX_SECONDS = 10;
export const STORY_WIDTH = 720;
export const FFMPEG = process.env.CHIVAGO_FFMPEG ?? 'ffmpeg';

/** How long one encode may take. A ten-second clip takes a few seconds; a minute is a hung process. */
const ENCODE_TIMEOUT_MS = 60_000;

export interface Encoded {
  /** Seconds of media in the output, when ffmpeg said. */
  durationS: number | null;
}

/** What the service calls. Injectable, so a test never needs the binary. */
export interface Transcoder {
  video: (input: string, outMp4: string, outPoster: string) => Promise<Encoded>;
  photo: (input: string, outJpg: string) => Promise<void>;
}

function run(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`ffmpeg: timed out after ${ENCODE_TIMEOUT_MS / 1000} s`));
    }, ENCODE_TIMEOUT_MS);
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    // `error` here is the SPAWN failing, not the encode: ENOENT when the
    // binary is missing, EACCES when it is not executable. Neither says
    // anything about the file that was handed in.
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new TranscoderUnavailable(`${FFMPEG}: ${(err as NodeJS.ErrnoException).code ?? err.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stderr);
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.trim().split('\n').slice(-3).join(' | ')}`));
    });
  });
}

/** The input's duration, as ffmpeg prints it while reading the file. */
function durationFrom(stderr: string): number | null {
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/**
 * Is the binary there at all?
 *
 * Asked once at boot, so the operator learns on the empty console rather
 * than from the first traveller who cannot post. It runs `-version`, which
 * touches no file and exits immediately; a non-zero exit still counts as
 * present, because a build that answers at all can be asked to encode.
 */
export function transcoderAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(FFMPEG, ['-version'], { stdio: 'ignore' });
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(false); }, 5_000);
    child.on('error', () => { clearTimeout(timer); resolve(false); });
    child.on('close', () => { clearTimeout(timer); resolve(true); });
  });
}

export const ffmpegTranscoder: Transcoder = {
  async video(input, outMp4, outPoster) {
    const log = await run([
      '-y', '-i', input,
      /*
        -map_metadata -1: the same strip the photo path does, and for the same
        reason. WITHOUT IT A STORY CLIP PUBLISHES THE PHONE'S POSITION.

        ffmpeg copies global metadata into an MP4 by default, and an iPhone
        writes the recording location into exactly that - as `location` and
        `com.apple.quicktime.location.ISO6709`. Measured against ffmpeg 8.1:
        a clip tagged `+09.5357+100.0617/` came out of this pipeline still
        carrying it, so every video story posted from a phone with location
        services on was publishing a coordinate inside the file. The comment
        over `createStory` in story-service.ts said the re-encode strips
        position; that was true of photographs and not of clips.

        -map_chapters -1 for the same reason: chapter titles are free text a
        phone or an editing app can put a place name into.
      */
      '-map_metadata', '-1', '-map_chapters', '-1',
      '-t', String(STORY_MAX_SECONDS),
      // Never upscale a small clip; always fit a big one. Even dimensions,
      // because yuv420p needs them.
      '-vf', `scale='min(${STORY_WIDTH},iw)':-2`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '96k',
      '-movflags', '+faststart',
      outMp4,
    ]);
    // The poster from the OUTPUT, half a second in, so it is a frame that
    // will actually be shown rather than one the trim discarded.
    // Also stripped here, so the poster's cleanliness does not depend on the
    // step above having run on this particular input.
    await run([
      '-y', '-ss', '0.5', '-i', outMp4, '-map_metadata', '-1',
      '-frames:v', '1', '-q:v', '4', outPoster,
    ]);
    const input_s = durationFrom(log);
    return { durationS: input_s === null ? null : Math.min(input_s, STORY_MAX_SECONDS) };
  },
  async photo(input, outJpg) {
    // -map_metadata -1: say it rather than rely on a build's default. Some
    // ffmpeg builds carry EXIF through as frame side data, and this file is
    // what strips a position before a photo is public or sent to the AI.
    // The video path above needs the same flag and did not have it.
    await run([
      '-y', '-i', input, '-map_metadata', '-1',
      '-vf', `scale='min(${STORY_WIDTH},iw)':-2`, '-q:v', '4', outJpg,
    ]);
  },
};
