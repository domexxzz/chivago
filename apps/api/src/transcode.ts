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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanJpeg } from './jpeg-clean.ts';

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
  /** The encoded clip or picture. */
  media: Uint8Array;
  /** A frame to show before it plays. The same bytes as `media` for a photo. */
  poster: Uint8Array;
  /** Seconds of media in the output, when ffmpeg said. */
  durationS: number | null;
}

/**
 * What the service calls. Injectable, so a test never needs the binary.
 *
 * BYTES, NOT PATHS. It used to take filenames, which was the honest shape
 * while the only implementation shelled out to ffmpeg on the same machine.
 * It cannot stay that shape: ffmpeg is a native binary, Cloudflare Workers
 * cannot spawn a process, and a Worker has no filesystem to name. So the
 * contract is now bytes in and bytes out, which is the only thing both an
 * implementation that forks a process and one that makes an HTTP call can
 * honour.
 *
 * `ext` is passed because it is passed today: the transcode writes the input
 * under its real extension, and some formats - HEIC above all - are probed
 * more reliably when ffmpeg can see one. Keeping it keeps the behaviour.
 */
export interface Transcoder {
  video: (bytes: Uint8Array, ext: string) => Promise<Encoded>;
  photo: (bytes: Uint8Array, ext: string) => Promise<Encoded>;
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

/**
 * Run `fn` against real files in a scratch directory that is always removed.
 *
 * ffmpeg needs real files; nothing above this line should have to know that.
 * The directory is per-call rather than shared, so two concurrent encodes
 * cannot collide on a name, and the `finally` is what stops a failed encode
 * leaving its input on the disk - which on a volume is a slow leak nobody
 * notices until it is full.
 */
async function inScratch<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'chivago-transcode-'));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Only the characters an extension may have, so it cannot shape a filename. */
const safeExt = (ext: string): string => (/^[a-z0-9]{1,8}$/i.test(ext) ? ext.toLowerCase() : 'bin');

export const ffmpegTranscoder: Transcoder = {
  video(bytes, ext) {
    return inScratch(async (dir) => {
      const input = join(dir, `in.${safeExt(ext)}`);
      const outMp4 = join(dir, 'out.mp4');
      const outPoster = join(dir, 'poster.jpg');
      writeFileSync(input, bytes);
      const durationS = await encodeVideo(input, outMp4, outPoster);
      return {
        media: new Uint8Array(readFileSync(outMp4)),
        poster: new Uint8Array(readFileSync(outPoster)),
        durationS,
      };
    });
  },
  photo(bytes, ext) {
    return inScratch(async (dir) => {
      const input = join(dir, `in.${safeExt(ext)}`);
      const outJpg = join(dir, 'out.jpg');
      writeFileSync(input, bytes);
      await encodePhoto(input, outJpg);
      // A photograph is its own poster. One read, one buffer, shared.
      const media = new Uint8Array(readFileSync(outJpg));
      return { media, poster: media, durationS: null };
    });
  },
};

/**
 * The video encode, against real files. The ffmpeg arguments are unchanged.
 * Returns the duration rather than an object, so `Encoded` is assembled in
 * one place.
 */
async function encodeVideo(
  input: string,
  outMp4: string,
  outPoster: string,
): Promise<number | null> {
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
  return input_s === null ? null : Math.min(input_s, STORY_MAX_SECONDS);
}

/** The photograph encode, against real files. Arguments unchanged. */
async function encodePhoto(input: string, outJpg: string): Promise<void> {
  // -map_metadata -1: say it rather than rely on a build's default. Some
  // ffmpeg builds carry EXIF through as frame side data, and this is what
  // strips a position before a photo is public or sent to the AI. The video
  // path needs the same flag and did not have it until 2 November.
  await run([
    '-y', '-i', input, '-map_metadata', '-1',
    '-vf', `scale='min(${STORY_WIDTH},iw)':-2`, '-q:v', '4', outJpg,
  ]);
}

// ---------------------------------------------------------------------------
// The encoder as a service
// ---------------------------------------------------------------------------

/**
 * ffmpeg, over HTTP.
 *
 * WHY. ffmpeg is a native binary and Cloudflare Workers cannot spawn a
 * process, so on Workers the encode has to happen somewhere else. "Somewhere
 * else" is a container running `transcode-service.ts`, which is the same
 * `ffmpegTranscoder` behind two routes. This is the client for it.
 *
 * The 503-versus-400 distinction that `TranscoderUnavailable` exists for has
 * to survive the network, and over HTTP there are now two ways to be
 * unavailable rather than one: the container can refuse (503, no ffmpeg) or it
 * can be unreachable (DNS, connection refused, timeout). BOTH are
 * `TranscoderUnavailable`, because both mean the server is at fault and
 * neither means the traveller's file was bad. Anything else - a 400 from the
 * encoder, a 500 - is a normal error, which `story-service.ts` turns into
 * "it could not be read".
 */
export function httpTranscoder(
  baseUrl: string,
  deps: { fetch?: typeof fetch; token?: string } = {},
): Transcoder {
  const base = baseUrl.replace(/\/+$/, '');
  const doFetch = deps.fetch ?? fetch;
  const token = deps.token ?? process.env.CHIVAGO_TRANSCODE_TOKEN ?? '';

  const call = async (kind: 'video' | 'photo', bytes: Uint8Array, ext: string): Promise<Encoded> => {
    const url = `${base}/${kind}?ext=${encodeURIComponent(safeExt(ext))}`;
    let res: Response;
    try {
      res = await doFetch(url, {
        method: 'POST',
        // A fresh copy, because a Uint8Array view over a larger buffer would
        // otherwise send the whole buffer.
        body: bytes.slice().buffer as ArrayBuffer,
        headers: {
          'content-type': 'application/octet-stream',
          ...(token ? { 'x-transcode-token': token } : {}),
        },
        signal: AbortSignal.timeout(ENCODE_TIMEOUT_MS + 15_000),
      });
    } catch (err) {
      // Unreachable, refused, or timed out. The server's fault, not the file's.
      throw new TranscoderUnavailable(`${base}: ${(err as Error).message}`);
    }

    if (res.status === 503) {
      throw new TranscoderUnavailable(`${base}: the encoder reported itself unavailable`);
    }
    if (!res.ok) {
      throw new Error(`transcode service answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }

    const form = await res.formData();
    const media = form.get('media');
    const poster = form.get('poster');
    if (!(media instanceof Blob) || !(poster instanceof Blob)) {
      throw new Error('transcode service answered without media and poster parts');
    }
    const durationRaw = form.get('durationS');
    const duration = typeof durationRaw === 'string' && durationRaw !== '' ? Number(durationRaw) : null;
    return {
      media: new Uint8Array(await media.arrayBuffer()),
      poster: new Uint8Array(await poster.arrayBuffer()),
      durationS: duration !== null && Number.isFinite(duration) ? duration : null,
    };
  };

  return {
    video: (bytes, ext) => call('video', bytes, ext),
    photo: (bytes, ext) => call('photo', bytes, ext),
  };
}

/**
 * The transcoder this process should use.
 *
 * With `CHIVAGO_TRANSCODE_URL` set, the encode goes to the container; without
 * it, this process runs ffmpeg itself, which is the current deployment and
 * stays the default. One switch, so a deployment chooses by configuration
 * rather than by which build it is running.
 */
export function transcoderFromEnv(): Transcoder {
  const url = process.env.CHIVAGO_TRANSCODE_URL;
  if (url) return httpTranscoder(url);
  return onWorkers() ? workersTranscoder : ffmpegTranscoder;
}

/** Running inside Cloudflare Workers, where no process can be spawned. */
export const onWorkers = (): boolean =>
  typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

/**
 * What a Worker can do with no encoder container behind it.
 *
 * A JPEG photo is published with its metadata stripped (jpeg-clean.ts): the
 * privacy half of the re-encode, without the resize. Everything else still
 * needs ffmpeg - a clip, and a HEIC, PNG, WebP or AVIF photo - and says so.
 * Before this, with `CHIVAGO_TRANSCODE_URL` unset, EVERY story failed on the
 * live site, photographs included.
 */
export const workersTranscoder: Transcoder = {
  async video() {
    throw new TranscoderUnavailable('clips need the encoder container (CHIVAGO_TRANSCODE_URL is not set)');
  },
  async photo(bytes, ext) {
    if (ext !== 'jpg') {
      throw new Error(`only JPEG photos can be posted right now, and this one is ${ext.toUpperCase()}`);
    }
    const media = cleanJpeg(bytes);
    return { media, poster: media, durationS: null };
  },
};
