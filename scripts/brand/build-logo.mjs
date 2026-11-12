/**
 * Every logo file in the app, cut from one source.
 *
 *   node scripts/brand/key-background.mjs <artwork> <keyed.png>
 *   node scripts/brand/build-logo.mjs <keyed.png>
 *
 * The artwork arrives as one lockup: the CG mark, and the word ChivarGO
 * under it. Those are two different jobs and this splits them, because a
 * wordmark at sixteen pixels is a smudge and a browser tab is sixteen
 * pixels. The split is MEASURED, not typed in: the only band of fully empty
 * rows across the whole image is the gap between the two, so the file tells
 * us where it divides and a redrawn logo with different proportions will
 * still divide in the right place.
 *
 * ICONS ARE THE MARK ALONE, ON TRANSPARENCY, which is what the files being
 * replaced already were - checked before anything was overwritten rather
 * than assumed. The maskable icon sits smaller inside its square because
 * Android crops that one to whatever shape the launcher feels like, and
 * anything outside the middle 80% is not guaranteed to survive.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SRC = process.argv[2];
const ROOT = process.argv[3] ?? 'apps/mobile';
const FFMPEG = process.env.FFMPEG
  || 'C:/Users/DomeCB/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.2-full_build/bin/ffmpeg.exe';

const ff = (args) => execFileSync(FFMPEG, ['-v', 'error', '-y', ...args]);
const sizeOf = (file) => {
  let info = '';
  try { execFileSync(FFMPEG, ['-hide_banner', '-i', file], { stdio: 'pipe' }); } catch (e) { info = e.stderr.toString(); }
  const m = info.match(/,\s(\d+)x(\d+)[\s,]/);
  if (!m) throw new Error(`no size for ${file}`);
  return { w: Number(m[1]), h: Number(m[2]) };
};

const { w: W, h: H } = sizeOf(SRC);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-'));
const rawPath = path.join(tmp, 'src.rgba');
ff(['-i', SRC, '-pix_fmt', 'rgba', '-f', 'rawvideo', rawPath]);
const px = fs.readFileSync(rawPath);

/** Rows with essentially no ink, which is how the lockup announces its parts. */
const emptyRun = (() => {
  const runs = [];
  let start = null;
  for (let y = 0; y < H; y += 1) {
    let ink = 0;
    for (let x = 0; x < W; x += 1) if (px[(y * W + x) * 4 + 3] > 12) ink += 1;
    const empty = ink < 3;
    if (empty && start === null) start = y;
    if (!empty && start !== null) { if (y - start > 4) runs.push([start, y - 1]); start = null; }
  }
  return runs.filter(([s, e]) => s > H * 0.2 && e < H * 0.95)[0];
})();
if (!emptyRun) throw new Error('no gap between mark and wordmark - has the artwork changed shape?');
const markRows = emptyRun[0];
console.log(`mark is rows 0..${markRows - 1}, wordmark starts at ${emptyRun[1] + 1}`);

// The mark's own horizontal extent, so the icon is centred on the mark and
// not on the wider lockup underneath it.
let minX = W; let maxX = -1;
for (let y = 0; y < markRows; y += 1) {
  for (let x = 0; x < W; x += 1) {
    if (px[(y * W + x) * 4 + 3] > 12) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
  }
}
const markW = maxX - minX + 1;
console.log(`mark box ${markW} x ${markRows} at ${minX},0`);

const mark = path.join(tmp, 'mark.png');
ff(['-i', SRC, '-vf', `crop=${markW}:${markRows}:${minX}:0`, '-frames:v', '1', mark]);

/**
 * A square with the mark centred inside `inset` of its width.
 *
 * `backdrop` is transparent unless a platform refuses to supply its own.
 * iOS is the one that does: it composites a home-screen icon over BLACK, and
 * the mark's dark outlines disappear into it - which is why the file being
 * replaced here was already flattened onto white, and why this keeps doing
 * that. The note is in `public/index.html` beside the link tag.
 */
const square = (out, size, inset, backdrop = '#00000000') => {
  const box = Math.round(size * inset);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  ff(['-i', mark, '-vf',
    `scale=${box}:${box}:force_original_aspect_ratio=decrease:flags=lanczos,`
    + `format=rgba,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=${backdrop}`,
    '-frames:v', '1', out]);
  console.log(`${out}: ${size}px, ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);
};

/** The full lockup, scaled to a width. */
const lockup = (out, width) => {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  ff(['-i', SRC, '-vf', `scale=${width}:-1:flags=lanczos`, '-frames:v', '1', out]);
  const { w, h } = sizeOf(out);
  console.log(`${out}: ${w} x ${h}, ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);
};

lockup(path.join(ROOT, 'assets/chivago-logo.png'), 1035);
lockup(path.join(ROOT, 'assets/chivago-color-logo.png'), 1035);
lockup(path.join(ROOT, 'public/media/brand/chivago-logo.png'), 1035);

// 0.86 matches the inset the replaced icons used; the maskable one keeps
// clear of the 80% safe circle by a comfortable margin.
square(path.join(ROOT, 'public/icons/icon-512.png'), 512, 0.86);
square(path.join(ROOT, 'public/icons/icon-192.png'), 192, 0.86);
square(path.join(ROOT, 'public/icons/apple-touch-icon.png'), 180, 0.86, 'white');
square(path.join(ROOT, 'public/icons/favicon-32.png'), 32, 0.94);
square(path.join(ROOT, 'public/icons/icon-maskable-512.png'), 512, 0.60);

/*
  favicon.ico, written by hand because ffmpeg will not encode one.

  FOUR SIZES, NOT ONE. `public/index.html` says why beside its link tag:
  Google's crawler wants 48 or a multiple of it and fetches /favicon.ico
  whether or not a tag points at it, so this file is what decides the mark
  that appears in search results. A single 16 would look fine in a tab and
  quietly cost that.

  A modern .ico may hold a PNG verbatim instead of a BMP, which every browser
  in use has understood for well over a decade and which keeps the alpha
  channel without the AND-mask dance the old format needs.
*/
const ICO_SIZES = [16, 32, 48, 64];
const icoImages = ICO_SIZES.map((size) => {
  const file = path.join(tmp, `ico-${size}.png`);
  const box = Math.round(size * (size <= 32 ? 0.94 : 0.9));
  ff(['-i', mark, '-vf',
    `scale=${box}:${box}:force_original_aspect_ratio=decrease:flags=lanczos,`
    + `format=rgba,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=#00000000`,
    '-frames:v', '1', file]);
  return { size, bytes: fs.readFileSync(file) };
});

const DIR_ENTRY = 16;
let imageOffset = 6 + DIR_ENTRY * icoImages.length;
const directory = [];
for (const { size, bytes } of icoImages) {
  const entry = Buffer.alloc(DIR_ENTRY);
  entry.writeUInt8(size === 256 ? 0 : size, 0); // width, 0 meaning 256
  entry.writeUInt8(size === 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2); // palette size: not paletted
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(bytes.length, 8);
  entry.writeUInt32LE(imageOffset, 12);
  imageOffset += bytes.length;
  directory.push(entry);
}
const icoHead = Buffer.alloc(6);
icoHead.writeUInt16LE(0, 0); // reserved
icoHead.writeUInt16LE(1, 2); // type: icon
icoHead.writeUInt16LE(icoImages.length, 4);
const icoPath = path.join(ROOT, 'public/favicon.ico');
fs.writeFileSync(icoPath, Buffer.concat([icoHead, ...directory, ...icoImages.map((i) => i.bytes)]));
console.log(`${icoPath}: ${ICO_SIZES.join('/')} px, ${fs.statSync(icoPath).size} bytes`);

fs.rmSync(tmp, { recursive: true, force: true });
