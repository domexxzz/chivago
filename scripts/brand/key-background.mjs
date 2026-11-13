/**
 * Lift flat-background artwork onto transparency, edges and all.
 *
 * A logo arrives as a square of cream with the mark painted on it. Keying it
 * by "delete every pixel close to the background colour" gives a hard
 * one-bit cutout: every antialiased edge pixel is part cream, so it either
 * survives as a pale fringe or is deleted and leaves the curve jagged. On a
 * wordmark at 32 pixels both failures are the whole image.
 *
 * So the background is treated as what it actually is - a layer BEHIND a
 * partly transparent painting - and the painting is solved for:
 *
 *   alpha  = how far this pixel is from the background, normalised
 *   colour = (pixel - background * (1 - alpha)) / alpha
 *
 * which is un-premultiplying against a known backdrop. An edge pixel that is
 * 40% ink over cream comes back as 100% ink at 40% alpha, so it composites
 * correctly onto ANY colour afterwards - white, the teal header, a dark
 * mode - instead of carrying a rim of someone else's background with it.
 *
 * Interior holes come out transparent for free: the counters of a C or a G
 * are the same cream as the outside and nothing here tests connectivity.
 * That is the right answer for a logo and would be the wrong one for, say, a
 * photograph of a cream shirt.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [src, dst, t0Arg, t1Arg] = process.argv.slice(2);
/** Below this distance from the background a pixel is fully transparent. */
const T0 = Number(t0Arg ?? 10);
/** Above it, fully opaque. Between, a real fraction. */
const T1 = Number(t1Arg ?? 42);
const FFMPEG = process.env.FFMPEG
  || 'C:/Users/DomeCB/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.2-full_build/bin/ffmpeg.exe';

const info = (() => {
  try { execFileSync(FFMPEG, ['-hide_banner', '-i', src], { stdio: 'pipe' }); } catch (e) { return e.stderr.toString(); }
  return '';
})();
const m = info.match(/,\s(\d+)x(\d+)[\s,]/);
if (!m) throw new Error(`could not read size from:\n${info}`);
const W = Number(m[1]);
const H = Number(m[2]);

const raw = path.join(os.tmpdir(), `key-${process.pid}.rgba`);
execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', src, '-pix_fmt', 'rgba', '-f', 'rawvideo', raw]);
const px = fs.readFileSync(raw);
fs.unlinkSync(raw);

// The background, read off the corners rather than assumed. The median of a
// 12-pixel patch in each corner, so one stray pixel cannot set it.
const corner = (cx, cy) => {
  const vals = [[], [], []];
  for (let y = cy; y < cy + 12; y += 1) {
    for (let x = cx; x < cx + 12; x += 1) {
      const o = (y * W + x) * 4;
      for (let c = 0; c < 3; c += 1) vals[c].push(px[o + c]);
    }
  }
  return vals.map((v) => v.sort((a, b) => a - b)[Math.floor(v.length / 2)]);
};
const corners = [corner(0, 0), corner(W - 13, 0), corner(0, H - 13), corner(W - 13, H - 13)];
const bg = [0, 1, 2].map((c) => Math.round(corners.reduce((s, k) => s + k[c], 0) / corners.length));
const spread = Math.max(...[0, 1, 2].map((c) => Math.max(...corners.map((k) => Math.abs(k[c] - bg[c])))));
console.log('background', bg, 'corner spread', spread);
if (spread > 6) console.warn('WARNING: the corners disagree - this background may not be flat');

const out = Buffer.alloc(W * H * 4);
let opaque = 0;
let partial = 0;
for (let i = 0; i < W * H; i += 1) {
  const o = i * 4;
  const d = Math.max(
    Math.abs(px[o] - bg[0]),
    Math.abs(px[o + 1] - bg[1]),
    Math.abs(px[o + 2] - bg[2]),
  );
  let a = (d - T0) / (T1 - T0);
  a = a < 0 ? 0 : a > 1 ? 1 : a;
  if (a === 0) continue;
  if (a === 1) opaque += 1; else partial += 1;
  for (let c = 0; c < 3; c += 1) {
    // Solve for the ink that, composited over the background at this alpha,
    // produces the pixel that was measured.
    const v = (px[o + c] - bg[c] * (1 - a)) / a;
    out[o + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
  }
  out[o + 3] = Math.round(a * 255);
}
console.log(`kept ${opaque} opaque and ${partial} partial pixels of ${W * H}`);

// Trim to the ink, so the file is the logo and not the sheet it arrived on.
let minX = W; let minY = H; let maxX = -1; let maxY = -1;
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    if (out[(y * W + x) * 4 + 3] > 10) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
const cw = maxX - minX + 1;
const chRows = maxY - minY + 1;
console.log(`ink box ${cw} x ${chRows} at ${minX},${minY}`);

const cropped = Buffer.alloc(cw * chRows * 4);
for (let y = 0; y < chRows; y += 1) {
  out.copy(cropped, y * cw * 4, ((minY + y) * W + minX) * 4, ((minY + y) * W + minX + cw) * 4);
}

const rawOut = path.join(os.tmpdir(), `key-out-${process.pid}.rgba`);
fs.writeFileSync(rawOut, cropped);
fs.mkdirSync(path.dirname(dst), { recursive: true });
execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba',
  '-s', `${cw}x${chRows}`, '-i', rawOut, '-frames:v', '1', dst]);
fs.unlinkSync(rawOut);
console.log(`wrote ${dst}: ${cw} x ${chRows}, ${(fs.statSync(dst).size / 1024).toFixed(1)} KB`);
