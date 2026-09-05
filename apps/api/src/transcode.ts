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
 */

import { spawn } from 'node:child_process';

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
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
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

export const ffmpegTranscoder: Transcoder = {
  async video(input, outMp4, outPoster) {
    const log = await run([
      '-y', '-i', input,
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
    await run(['-y', '-ss', '0.5', '-i', outMp4, '-frames:v', '1', '-q:v', '4', outPoster]);
    const input_s = durationFrom(log);
    return { durationS: input_s === null ? null : Math.min(input_s, STORY_MAX_SECONDS) };
  },
  async photo(input, outJpg) {
    await run(['-y', '-i', input, '-vf', `scale='min(${STORY_WIDTH},iw)':-2`, '-q:v', '4', outJpg]);
  },
};
