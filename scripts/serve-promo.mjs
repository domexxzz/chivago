import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';

const host = '127.0.0.1';
const port = 4321;
const publicRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../apps/mobile/public',
);
const promoUrl = `http://${host}:${port}/th/`;

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8',
};

function openBrowser() {
  if (process.argv.includes('--no-open')) return;
  const child = spawn('cmd.exe', ['/c', 'start', '', promoUrl], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

const server = createServer((request, response) => {
  try {
    const requestUrl = new URL(request.url ?? '/', promoUrl);
    if (requestUrl.pathname === '/th/config.js') {
      response.writeHead(200, { 'content-type':'text/javascript; charset=utf-8', 'cache-control':'no-store' });
      response.end('export const config = '+JSON.stringify({ appBase:'http://localhost:8081', serviceBase:'http://localhost:8787' })+';');
      return;
    }
    let pathname = decodeURIComponent(requestUrl.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    const filePath = path.resolve(publicRoot, `.${pathname}`);
    const insidePublic = filePath === publicRoot || filePath.startsWith(`${publicRoot}${path.sep}`);

    if (!insidePublic || !existsSync(filePath) || !statSync(filePath).isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('ไม่พบหน้านี้');
      return;
    }

    response.writeHead(200, {
      'cache-control': 'no-cache',
      'content-type': contentTypes[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    });
    createReadStream(filePath).pipe(response);
  } catch (error) {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('เปิดหน้าโปรโมตไม่สำเร็จ');
    console.error(error);
  }
});

server.once('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.log(`มีตัวรันอยู่แล้ว กำลังเปิด ${promoUrl}`);
    openBrowser();
    process.exit(0);
  }
  console.error('เปิดตัวรันหน้าโปรโมตไม่สำเร็จ:', error);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log('ChivarGo Promo พร้อมใช้งาน');
  console.log(`เปิดที่: ${promoUrl}`);
  console.log('ปิดหน้าต่างนี้เมื่อต้องการหยุดตัวรัน');
  openBrowser();
});
