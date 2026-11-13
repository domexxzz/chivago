/** A one-file three.js viewer with the GLB inlined, so file:// needs no server. */
import fs from 'node:fs';

const glb = fs.readFileSync(process.argv[2]).toString('base64');
const out = process.argv[3];
const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>ChangChang</title>
<style>html,body{margin:0;height:100%;background:#eef4f7}canvas{display:block}</style>
<script type="importmap">{"imports":{
"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
"three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"}}</script>
</head><body>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const W = 520, H = 640;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(2);
renderer.setSize(W, H);
renderer.setClearColor(0x000000, 0);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x9fb6c4, 2.2));
const key = new THREE.DirectionalLight(0xffffff, 2.0);
key.position.set(2, 3, 2.5);
scene.add(key);
const rim = new THREE.DirectionalLight(0xbfe6ff, 0.9);
rim.position.set(-2, 1.5, -2);
scene.add(rim);

const camera = new THREE.PerspectiveCamera(32, W / H, 0.1, 40);
const pivot = new THREE.Group();
scene.add(pivot);

window.state = { ready: false, info: null, error: null };
new GLTFLoader().parse(
  Uint8Array.from(atob("${glb}"), (c) => c.charCodeAt(0)).buffer,
  '',
  (gltf) => {
    pivot.add(gltf.scene);
    let tris = 0, verts = 0, hasColour = false;
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      tris += o.geometry.index.count / 3;
      verts += o.geometry.attributes.position.count;
      hasColour = hasColour || !!o.geometry.attributes.color;
      o.material.vertexColors = !!o.geometry.attributes.color;
      o.material.needsUpdate = true;
    });
    const box = new THREE.Box3().setFromObject(gltf.scene);
    window.state.info = { tris, verts, hasColour, box: { min: box.min.toArray(), max: box.max.toArray() } };
    window.state.ready = true;
    window.shot(0, 10);
  },
  (e) => { window.state.error = String(e); },
);

/** Render once from a turntable angle. No rAF: the host may never fire one. */
window.shot = (degrees, tilt = 10) => {
  pivot.rotation.y = (degrees * Math.PI) / 180;
  const r = 2.3;
  const t = (tilt * Math.PI) / 180;
  camera.position.set(0, 0.5 + r * Math.sin(t), r * Math.cos(t));
  camera.lookAt(0, 0.5, 0);
  renderer.render(scene, camera);
  return true;
};

/** Render a turntable and upload each frame; the pane may never composite. */
window.sheet = async (angles, tilt = 10) => {
  const done = [];
  for (const a of angles) {
    window.shot(a, tilt);
    const url = renderer.domElement.toDataURL('image/png');
    await fetch('/shot/angle-' + a + '.png', { method: 'POST', body: url });
    done.push(a);
  }
  return done.join(',');
};
</script></body></html>`;
fs.writeFileSync(out, html);
console.log('wrote', out, (html.length / 1024 / 1024).toFixed(2), 'MB');
