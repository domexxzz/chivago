/** Local companion server for the exported app. API requests use the existing Node API. */
import { createServer, request as proxyRequest } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(fileURLToPath(new URL('../apps/mobile/dist-live/', import.meta.url)));
if (!existsSync(path.join(root,'index.html'))) throw new Error('Run pnpm --filter @chivago/mobile export:live first.');
const mime = { '.js':'text/javascript', '.css':'text/css', '.html':'text/html; charset=utf-8', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml', '.ttf':'font/ttf', '.woff2':'font/woff2', '.wasm':'application/wasm', '.glb':'model/gltf-binary' };
createServer((req,res)=>{
 let pathname;
 try { pathname=decodeURIComponent(new URL(req.url,'http://localhost:8081').pathname); } catch { res.writeHead(400);res.end();return; }
 const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if (file.startsWith(root+path.sep) && existsSync(file) && statSync(file).isFile()) {
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-cache'});
  createReadStream(file).on('error',()=>res.destroy()).pipe(res);return;
 }
 const upstream=proxyRequest({hostname:'127.0.0.1',port:8787,path:req.url,method:req.method,headers:req.headers},reply=>{
  res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);
 });
 upstream.on('error',()=>{res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:'LOCAL_API_UNAVAILABLE'}));});
 req.pipe(upstream);
}).listen(8081,'127.0.0.1',()=>console.log('Local ChivarGo app: http://localhost:8081'));
