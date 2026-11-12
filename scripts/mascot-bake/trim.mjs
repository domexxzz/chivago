/** Crop a transparent render to its alpha bounds, then scale to a target height. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [src, dst, targetHeight = '900', padPercent = '2'] = process.argv.slice(2);
const FFMPEG = process.env.FFMPEG
  || 'C:/Users/DomeCB/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.2-full_build/bin/ffmpeg.exe';

// ffmpeg with no output exits non-zero and prints the stream line on stderr.
const info = (() => {
  try { execFileSync(FFMPEG, ['-hide_banner', '-i', src], { stdio: 'pipe' }); } catch (e) {
    return e.stderr.toString();
  }
  return '';
})();
const m = info.match(/,\s(\d+)x(\d+)[\s,]/);
if (!m) throw new Error(`could not read size from:\n${info}`);
const W = Number(m[1]); const H = Number(m[2]);

const raw = path.join(os.tmpdir(), `trim-${process.pid}.rgba`);
execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', src, '-pix_fmt', 'rgba', '-f', 'rawvideo', raw]);
const px = fs.readFileSync(raw);
fs.unlinkSync(raw);

let minX = W; let minY = H; let maxX = -1; let maxY = -1;
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    if (px[(y * W + x) * 4 + 3] > 8) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
if (maxX < 0) throw new Error('image is entirely transparent');

const pad = Math.round(((maxY - minY + 1) * Number(padPercent)) / 100);
const x0 = Math.max(0, minX - pad);
const y0 = Math.max(0, minY - pad);
const w = Math.min(W - x0, maxX - minX + 1 + pad * 2);
const h = Math.min(H - y0, maxY - minY + 1 + pad * 2);
console.log(`content ${minX},${minY} - ${maxX},${maxY} -> crop ${w}x${h} at ${x0},${y0}`);

execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', src,
  '-vf', `crop=${w}:${h}:${x0}:${y0},scale=-1:${targetHeight}:flags=lanczos`,
  '-frames:v', '1', '-pred', 'mixed', dst]);
console.log('wrote', dst, (fs.statSync(dst).size / 1024).toFixed(1), 'KB');
