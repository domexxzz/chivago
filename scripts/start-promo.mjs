import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const children=[];
async function running(port) { return new Promise(resolve=>{const s=connect({host:'127.0.0.1',port});s.on('connect',()=>{s.destroy();resolve(true);});s.on('error',()=>resolve(false));}); }
function start(args,extra={}) { const child=spawn(process.execPath,args,{cwd:root,stdio:'inherit',env:{...process.env,...extra}});children.push(child);return child; }
if(!await running(8787)) start(['--experimental-strip-types','apps/api/src/server-node.ts'],{CHIVAGO_DB:root+'apps/api/data/chivago.db',PORT:'8787'});
if(!await running(8081)) start(['scripts/serve-promo-app.mjs']);
start(['scripts/serve-promo.mjs',...process.argv.slice(2)]);
console.log('Close this launcher to stop the services it started.');
process.on('SIGINT',()=>{children.forEach(child=>child.kill());process.exit();});
process.on('SIGTERM',()=>{children.forEach(child=>child.kill());process.exit();});
