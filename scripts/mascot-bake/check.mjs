import fs from 'node:fs';
const b = fs.readFileSync(process.argv[2]);
const jlen = b.readUInt32LE(12);
const g = JSON.parse(b.slice(20, 20+jlen).toString('utf8'));
const BIN = 20 + jlen + 8;
const view = (i) => { const bv = g.bufferViews[i]; return { off: BIN + (bv.byteOffset||0), len: bv.byteLength }; };
const pv = view(0);
const pos = new Float32Array(b.buffer, b.byteOffset + pv.off, pv.len/4);
let zeros = 0, nan = 0;
const mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9];
for (let i=0;i<pos.length/3;i++){
  const x=pos[i*3],y=pos[i*3+1],z=pos[i*3+2];
  if (Number.isNaN(x)||Number.isNaN(y)||Number.isNaN(z)) nan++;
  if (x===0&&y===0&&z===0) zeros++;
  for(let c=0;c<3;c++){const v=pos[i*3+c]; if(v<mn[c])mn[c]=v; if(v>mx[c])mx[c]=v;}
}
console.log('verts', pos.length/3, 'all-zero', zeros, 'nan', nan);
console.log('true bbox', mn.map(v=>v.toFixed(3)), mx.map(v=>v.toFixed(3)));
const iv = view(3);
const ct = g.accessors[3].componentType;
const idx = ct===5123 ? new Uint16Array(b.buffer,b.byteOffset+iv.off,iv.len/2) : new Uint32Array(b.buffer,b.byteOffset+iv.off,iv.len/4);
let maxi=0; for(const v of idx) if(v>maxi) maxi=v;
console.log('indices', idx.length, 'max index', maxi, 'vertex count', pos.length/3);
const cv = view(2);
const col = new Uint8Array(b.buffer, b.byteOffset+cv.off, cv.len);
let black=0; for(let i=0;i<col.length/4;i++) if(col[i*4]===0&&col[i*4+1]===0&&col[i*4+2]===0) black++;
console.log('colour: all-black verts', black, 'of', col.length/4, 'sample', [...col.slice(0,16)]);
