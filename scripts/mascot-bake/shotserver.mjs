/**
 * Static files, plus POST /shot/<name>.png which writes the body to disk.
 * The page renders its own frames and uploads them, because the browser pane
 * cannot be relied on to composite a screenshot while it is hidden.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// Resolved, because the guard below compares against it and an argument with
// forward slashes would never match what path.join builds on Windows.
const ROOT = path.resolve(process.argv[2]);
const PORT = Number(process.argv[3] || 8911);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png' };

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/shot/')) {
    const name = path.basename(req.url.slice('/shot/'.length));
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const b64 = body.slice(body.indexOf(',') + 1);
      const file = path.join(ROOT, 'shots', name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(b64, 'base64'));
      console.log('shot', name, fs.statSync(file).size);
      res.writeHead(200, { 'access-control-allow-origin': '*' });
      res.end('ok');
    });
    return;
  }
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log('serving', ROOT, 'on', PORT));
