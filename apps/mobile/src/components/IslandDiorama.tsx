/**
 * Ko Sichang as a diorama, inside a WebView.
 *
 * WHY A WEBVIEW, AGAIN. The same reason `WebTerrainMap.tsx` is one: this
 * project is driven from Expo Go, Expo Go takes no native module, and WebGL
 * on a phone otherwise means `expo-gl` and a development build. `three` is
 * already a dependency and already draws Chivar Bot on the web; a browser
 * inside a browser puts the same drawing on a phone with no change to how the
 * project is built.
 *
 * WHAT IT DRAWS is `public/islands/koh-sichang.glb`, built by
 * `scripts/island-blockout.mjs` from the elevation archive, the OpenStreetMap
 * coastline, the place records and the village's own footprints. It is a file
 * the Worker serves, not something in the bundle: a megabyte and a third has
 * no business in the JavaScript every screen loads.
 *
 * AN OPAQUE ORIGIN, so every URL here is absolute. A WebView handed bare HTML
 * has no origin to resolve `/islands/...` against - the same trap documented
 * in `WebTerrainMap.tsx`, and the reason `API_BASE` is interpolated in.
 *
 * LABELS ARE HTML over the canvas rather than text in the scene. Thai loses
 * its vowel and tone marks to a texture atlas, and a DOM label gives a tap
 * target big enough for a thumb for free. docs/76 §labels.
 */

import * as React from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { color, radius, space } from '@chivago/tokens';

import { API_BASE } from '../api/client.ts';
import { Body } from './Type.tsx';
import { t } from '../i18n/locale.ts';

/** three.js, pinned. A range here is a map that changes on somebody's CDN. */
const THREE = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
const LOADER = 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js';

/** docs/76 §camera: constrained, never free. */
export const CAMERA = { yaw: 20, yawRange: 35, pitch: 32, pitchMin: 24, pitchMax: 55 };

export interface IslandDioramaProps {
  /** Which island. Only Ko Sichang has an asset today. */
  island?: string;
  height: number;
  /** A label was tapped. The id is a place record's id. */
  onSelectPlace?: (placeId: string) => void;
}

export function dioramaPage(island: string, base: string): string {
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  html,body{margin:0;padding:0;height:100%;width:100%;overflow:hidden;background:${color.brand};
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
  canvas{display:block;touch-action:none}
  #labels{position:absolute;inset:0;pointer-events:none}
  .lab{position:absolute;transform:translate(-50%,-100%);pointer-events:auto;
    background:#fff;color:#13242e;border-radius:999px;padding:5px 11px;font-size:12px;font-weight:600;
    box-shadow:0 2px 6px rgba(0,0,0,.22);white-space:nowrap;min-height:26px;line-height:16px}
  .lead{position:absolute;width:1px;background:rgba(255,255,255,.85);transform-origin:top center;pointer-events:none}
  #fail{position:absolute;inset:0;display:none;align-items:center;justify-content:center;
    color:#fff;font-size:13px;text-align:center;padding:0 24px}
</style>
</head><body>
<div id="labels"></div>
<div id="fail"></div>
<script type="module">
import * as THREE from '${THREE}';
import { GLTFLoader } from '${LOADER}';

const post = (m) => {
  try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); return; } catch (e) {}
  try { window.parent.postMessage(JSON.stringify(m), '*'); } catch (e) {}
};
const fail = (why) => {
  const el = document.getElementById('fail');
  el.style.display = 'flex';
  el.textContent = why;
  post({ type: 'error', why });
};

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('${color.brand}');

/* docs/76 §light: one warm sun, a cool sky, the sea bouncing up. */
const az = 135 * Math.PI / 180, el = 48 * Math.PI / 180;
const sun = new THREE.DirectionalLight(0xfff0d2, 2.0);
sun.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(5000);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xa8c8e8, 0x3e8fc4, 1.05));

const sea = new THREE.Mesh(
  new THREE.PlaneGeometry(60000, 60000),
  new THREE.MeshBasicMaterial({ color: new THREE.Color('${color.brand}') }),
);
sea.rotation.x = -Math.PI / 2;
sea.position.y = -2;
scene.add(sea);

const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 10, 80000);
const target = new THREE.Vector3();
let yaw = ${CAMERA.yaw}, pitch = ${CAMERA.pitch}, distance = 1;
const yaw0 = ${CAMERA.yaw};

function place() {
  const y = yaw * Math.PI / 180, p = pitch * Math.PI / 180;
  camera.position.set(
    target.x + Math.sin(y) * Math.cos(p) * distance,
    target.y + Math.sin(p) * distance,
    target.z + Math.cos(y) * Math.cos(p) * distance,
  );
  camera.lookAt(target);
}

const anchors = [];
const labels = document.getElementById('labels');

function draw() {
  place();
  renderer.render(scene, camera);
  /* Projected each frame, nearest first, and never more than seven. docs/76. */
  const shown = anchors
    .map((a) => {
      const v = a.world.clone().project(camera);
      return { a, x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight, z: v.z };
    })
    .filter((s) => s.z < 1 && s.x > 10 && s.x < window.innerWidth - 10)
    .sort((m, n) => m.z - n.z)
    .slice(0, 7);
  for (const a of anchors) { a.el.style.display = 'none'; a.lead.style.display = 'none'; }
  let lastY = -100;
  for (const s of shown) {
    const y = Math.max(s.y - 34, lastY + 30);
    lastY = y;
    s.a.el.style.display = 'block';
    s.a.el.style.left = s.x + 'px';
    s.a.el.style.top = y + 'px';
    s.a.lead.style.display = 'block';
    s.a.lead.style.left = s.x + 'px';
    s.a.lead.style.top = y + 'px';
    s.a.lead.style.height = Math.max(0, s.y - y) + 'px';
  }
  requestAnimationFrame(draw);
}

/* One finger turns the island, inside the range docs/76 allows. */
let dragging = null;
const down = (x, y) => { dragging = { x, y, yaw, pitch }; };
const move = (x, y) => {
  if (!dragging) return;
  yaw = Math.max(yaw0 - ${CAMERA.yawRange}, Math.min(yaw0 + ${CAMERA.yawRange}, dragging.yaw - (x - dragging.x) * 0.22));
  pitch = Math.max(${CAMERA.pitchMin}, Math.min(${CAMERA.pitchMax}, dragging.pitch + (y - dragging.y) * 0.16));
};
const up = () => { dragging = null; };
renderer.domElement.addEventListener('pointerdown', (e) => down(e.clientX, e.clientY));
renderer.domElement.addEventListener('pointermove', (e) => move(e.clientX, e.clientY));
renderer.domElement.addEventListener('pointerup', up);
renderer.domElement.addEventListener('pointercancel', up);
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

Promise.all([
  fetch('${base}/islands/${island}.glb').then((r) => { if (!r.ok) throw new Error('glb ' + r.status); return r.arrayBuffer(); }),
  fetch('${base}/islands/${island}.anchors.json').then((r) => (r.ok ? r.json() : [])),
]).then(([bin, list]) => new Promise((resolve, reject) => {
  new GLTFLoader().parse(bin, '', (gltf) => {
    gltf.scene.traverse((o) => {
      if (o.isMesh) o.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    });
    scene.add(gltf.scene);

    const box = new THREE.Box3().setFromObject(gltf.scene);
    box.getCenter(target);
    const size = box.getSize(new THREE.Vector3());
    distance = Math.max(size.x, size.z) * 1.15;

    for (const a of list) {
      const el = document.createElement('div');
      el.className = 'lab';
      el.textContent = a.name;
      el.addEventListener('click', () => post({ type: 'place', id: a.id }));
      labels.appendChild(el);
      const lead = document.createElement('div');
      lead.className = 'lead';
      labels.appendChild(lead);
      anchors.push({ el, lead, world: new THREE.Vector3(a.x, a.y + 40, a.z) });
    }
    post({ type: 'ready', labels: list.length });
    draw();
    resolve();
  }, reject);
})).catch((e) => fail(String(e && e.message ? e.message : e)));
</script>
</body></html>`;
}

export function IslandDiorama({ island = 'koh-sichang', height, onSelectPlace }: IslandDioramaProps) {
  const [ready, setReady] = React.useState(false);
  const html = React.useMemo(() => dioramaPage(island, API_BASE), [island]);

  const handle = React.useCallback((raw: string) => {
    let message: { type?: string; id?: string } | null = null;
    try { message = JSON.parse(raw) as { type?: string; id?: string }; } catch { return; }
    if (message?.type === 'ready' || message?.type === 'error') setReady(true);
    if (message?.type === 'place' && message.id) onSelectPlace?.(message.id);
  }, [onSelectPlace]);

  React.useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const listener = (event: MessageEvent) => {
      if (typeof event.data === 'string') handle(event.data);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [handle]);

  return (
    <View style={{ height, borderRadius: 18, overflow: 'hidden', backgroundColor: color.brand }}>
      {Platform.OS === 'web'
        ? React.createElement('iframe', {
            srcDoc: html,
            title: 'Ko Sichang',
            style: { border: 0, width: '100%', height: '100%' },
          })
        : (
          <WebView
            originWhitelist={['*']}
            source={{ html }}
            onMessage={(event: WebViewMessageEvent) => handle(event.nativeEvent.data)}
            style={{ backgroundColor: color.brand }}
            javaScriptEnabled
            domStorageEnabled={false}
            allowsInlineMediaPlayback
          />
        )}
      {ready ? null : (
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: space.s2 }}>
          <ActivityIndicator color="#ffffff" />
          <Body colour="#ffffff">
            {t({ en: 'Building the island…', th: 'กำลังสร้างเกาะ…', zh: '正在生成岛屿…' })}
          </Body>
        </View>
      )}
    </View>
  );
}
