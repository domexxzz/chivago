/**
 * Serve the static demo the way a host would, from the folder `demo:web`
 * wrote, so it can be opened in a real browser BEFORE it is deployed.
 *
 *   node apps/mobile/scripts/serve-demo.mjs [dir] [port]
 *
 * Node, not `python -m http.server`: the launch config used Python, which is
 * `python` on Windows and `python3` on a Mac and absent on a fresh Linux
 * box, so the one check that catches a broken export ("the map chunk is
 * not in the bundle") could not be run on the machine that was about to
 * deploy. Every machine this repository runs on has node.
 *
 * Unknown paths fall back to index.html, as the Vercel rewrite does.
 */

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const dir = resolve(process.argv[2] ?? 'apps/mobile/dist-demo');
const port = Number(process.argv[3] ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.map': 'application/json',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let path = normalize(join(dir, decodeURIComponent(url.pathname)));
  if (!path.startsWith(dir)) { res.writeHead(403); res.end(); return; }
  if (!existsSync(path) || statSync(path).isDirectory()) path = join(dir, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(path).pipe(res);
}).listen(port, () => {
  console.log(`[chivago] demo at http://localhost:${port} from ${dir}`);
});
