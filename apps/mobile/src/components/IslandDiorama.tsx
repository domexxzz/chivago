/**
 * Ko Sichang as a diorama, inside a WebView — and a thing you can walk with.
 *
 * WHY A WEBVIEW, FOR THE REASON `WebTerrainMap.tsx` IS ONE. Expo Go takes no
 * native module, so WebGL on a phone otherwise means expo-gl and a
 * development build: the same wall that kept MapLibre's native binding off
 * phones. `three` is already a dependency and already draws Chivar Bot on the
 * web; a browser inside a browser puts the same drawing on a phone with no
 * change to how this project is built. On the web it is an iframe.
 *
 * WHAT MAKES IT A MAP RATHER THAN A PICTURE. A drawn island with no scale and
 * no north is a poster: somebody looking at it can admire the shape and still
 * not know which way to walk. So it carries the four things a map owes a
 * person on the ground — where they are, which way north is, how far a
 * hundred metres is, and the line to where they asked to go. The roads under
 * all of it are the island's real ones, from OpenStreetMap.
 *
 * THE PAGE IS BUILT ONCE. Position changes arrive as messages, not as a new
 * page: rebuilding the HTML would reload the model and throw away the camera
 * every time the phone moved a metre.
 *
 * AN OPAQUE ORIGIN, so every URL is absolute. A WebView handed bare HTML has
 * nothing to resolve `/islands/...` against - documented in
 * `WebTerrainMap.tsx`, and otherwise the next hour of somebody's life.
 *
 * LABELS ARE HTML over the canvas, never text in the scene: Thai loses its
 * vowel and tone marks to a texture atlas, and a DOM label is a thumb-sized
 * tap target for free. docs/76 §labels.
 */

import * as React from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { areaByKey } from '@chivago/core';
import { color, space } from '@chivago/tokens';

import { API_BASE } from '../api/client.ts';
import { Body } from './Type.tsx';
import { t } from '../i18n/locale.ts';

/**
 * three.js, from our own origin.
 *
 * IT CAME FROM A CDN AND THAT WAS THE REST OF THE WAIT. 675 KB over a fresh
 * DNS lookup and TLS handshake to a host that is not ours, before a single
 * byte of island. Served from here it rides the connection the app already
 * has open, and the version in the filename lets it be cached for a year.
 *
 * GLTFLOADER IS GONE, which is another 107 KB. It reads a format this
 * repository also WRITES (`scripts/island-terrain.mjs`), and the file it has
 * to read is one mesh with two attributes and no indices. Thirty lines below
 * do it; the general-purpose loader was carrying animation, skinning,
 * cameras, materials and a dozen extensions for a file that has none.
 */
const VENDOR = '/vendor/three-0.170.0.min.js';

/** docs/76 §camera: constrained, never free. */
export const CAMERA = { yaw: 20, yawRange: 35, pitch: 32, pitchMin: 24, pitchMax: 55 };

/**
 * Metres per degree, the same formula `scripts/lib/geo.mjs` uses to place
 * everything in the model. The two have to agree or the dot stands in the
 * wrong bay, so the copy is deliberate and the comment is the contract.
 */
export function metresPerDegree(lat: number): { lat: number; lng: number } {
  const rad = (lat * Math.PI) / 180;
  return {
    lat: 111_132.92 - 559.82 * Math.cos(2 * rad) + 1.175 * Math.cos(4 * rad),
    lng: 111_412.84 * Math.cos(rad) - 93.5 * Math.cos(3 * rad),
  };
}

/** Longitude and latitude into the model's own metres. Y is left to the page. */
export function toIsland(island: string, lng: number, lat: number): [number, number] | null {
  const area = areaByKey(island as Parameters<typeof areaByKey>[0]);
  if (!area?.bbox) return null;
  const { bbox } = area;
  const perDeg = metresPerDegree((bbox.minLat + bbox.maxLat) / 2);
  return [
    (lng - (bbox.minLng + bbox.maxLng) / 2) * perDeg.lng,
    -(lat - (bbox.minLat + bbox.maxLat) / 2) * perDeg.lat,
  ];
}

export interface IslandDioramaProps {
  island?: string;
  height: number;
  /** Where the phone says it is. Drawn as a standing marker. */
  here?: { lat: number; lng: number } | null;
  /** The route the map is already showing, as [lng, lat] pairs. */
  route?: [number, number][] | null;
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
  /* North, and how far a hundred metres is. A drawn island owes both. */
  #rose{position:absolute;left:12px;top:12px;width:46px;height:46px;border-radius:999px;
    background:rgba(255,255,255,.92);box-shadow:0 2px 6px rgba(0,0,0,.2)}
  #rose svg{display:block}
  #scale{position:absolute;left:12px;bottom:12px;color:#fff;font-size:11px;font-weight:600;
    text-shadow:0 1px 3px rgba(0,0,0,.5)}
  #scale .bar{height:3px;background:#fff;border-radius:2px;margin-bottom:3px;
    box-shadow:0 1px 3px rgba(0,0,0,.4)}
  #fail{position:absolute;inset:0;display:none;align-items:center;justify-content:center;
    color:#fff;font-size:13px;text-align:center;padding:0 24px}
</style>
</head><body>
<div id="labels"></div>
<div id="rose"><svg width="46" height="46" viewBox="0 0 46 46">
  <g id="needle" transform="translate(23,23)">
    <polygon points="0,-15 5,3 0,0 -5,3" fill="#C4452B"></polygon>
    <polygon points="0,15 5,-3 0,0 -5,-3" fill="#9AA3A8"></polygon>
  </g>
  <text x="23" y="11" text-anchor="middle" font-size="9" font-weight="700" fill="#13242e">N</text>
</svg></div>
<div id="scale"><div class="bar" style="width:60px"></div><span id="scaleText">—</span></div>
<div id="fail"></div>
<script type="module">
import * as THREE from '${base}${VENDOR}';

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

/* The ground under a point, read off the model rather than guessed. */
const ray = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);
let island = null;
function groundAt(x, z, fallback = 0) {
  if (!island) return fallback;
  ray.set(new THREE.Vector3(x, 4000, z), DOWN);
  const hit = ray.intersectObject(island, true)[0];
  return hit ? hit.point.y : fallback;
}

/* Where the phone says it is: a post with a disc, so it reads from above. */
const hereGroup = new THREE.Group();
hereGroup.visible = false;
const hereColour = new THREE.MeshBasicMaterial({ color: 0x0077b6 });
const post1 = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 90, 8), hereColour);
post1.position.y = 45;
const head = new THREE.Mesh(new THREE.SphereGeometry(14, 12, 10), hereColour);
head.position.y = 100;
const ring = new THREE.Mesh(
  new THREE.RingGeometry(26, 36, 24),
  new THREE.MeshBasicMaterial({ color: 0x0077b6, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 3;
hereGroup.add(post1, head, ring);
scene.add(hereGroup);

/* The route, as a ribbon just above the ground it follows. */
let routeMesh = null;
function drawRoute(points) {
  if (routeMesh) { scene.remove(routeMesh); routeMesh.geometry.dispose(); routeMesh = null; }
  if (!points || points.length < 2) return;
  const half = 9;
  const pos = [];
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i], b = points[i + 1];
    const ay = groundAt(a[0], a[1]) + 6, by = groundAt(b[0], b[1]) + 6;
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * half, nz = (dx / len) * half;
    const p1 = [a[0] - nx, ay, a[1] - nz], p2 = [b[0] - nx, by, b[1] - nz];
    const p3 = [b[0] + nx, by, b[1] + nz], p4 = [a[0] + nx, ay, a[1] + nz];
    pos.push(...p1, ...p2, ...p3, ...p1, ...p3, ...p4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  routeMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: 0xf26430, side: THREE.DoubleSide, transparent: true, opacity: 0.95,
  }));
  scene.add(routeMesh);
}

const anchors = [];
const labels = document.getElementById('labels');
const needle = document.getElementById('needle');
const scaleBar = document.querySelector('#scale .bar');
const scaleText = document.getElementById('scaleText');

/* A scale bar earns its place only if it is honest at the current camera. */
function updateScale() {
  const a = new THREE.Vector3(target.x, target.y, target.z).project(camera);
  const b = new THREE.Vector3(target.x + 100, target.y, target.z).project(camera);
  const pxPer100 = Math.abs(b.x - a.x) * window.innerWidth * 0.5;
  if (!isFinite(pxPer100) || pxPer100 <= 0) return;
  const steps = [50, 100, 200, 500, 1000];
  let metres = steps[0];
  for (const s of steps) if ((pxPer100 / 100) * s < 120) metres = s;
  scaleBar.style.width = Math.round((pxPer100 / 100) * metres) + 'px';
  scaleText.textContent = metres >= 1000 ? (metres / 1000) + ' km' : metres + ' m';
}

function draw() {
  place();
  renderer.render(scene, camera);
  needle.setAttribute('transform', 'translate(23,23) rotate(' + (-yaw) + ')');
  updateScale();

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

/*
  The page is built once and told things afterwards. Rebuilding the HTML to
  move a dot would reload a megabyte of island and throw away whatever angle
  somebody had turned it to.
*/
let pending = { here: null, route: null };
window.__chivago = {
  setHere(x, z) {
    if (x === null || x === undefined) { hereGroup.visible = false; return; }
    pending.here = [x, z];
    hereGroup.position.set(x, groundAt(x, z), z);
    hereGroup.visible = true;
  },
  setRoute(points) { pending.route = points; drawRoute(points); },
};
window.addEventListener('message', (e) => {
  let m = null;
  try { m = JSON.parse(typeof e.data === 'string' ? e.data : ''); } catch (err) { return; }
  if (!m) return;
  if (m.type === 'here') window.__chivago.setHere(m.x, m.z);
  if (m.type === 'route') window.__chivago.setRoute(m.points);
});

/*
  The whole of the glTF this page needs to understand.

  One mesh, POSITION and COLOR_0, no indices - because that is what
  scripts/island-terrain.mjs writes it. A file that fails these expectations
  should throw here rather than be half-read.
*/
function parseIsland(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb');
  const jsonLength = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLength)));
  const binStart = 20 + jsonLength + 8;
  const primitive = json.meshes[0].primitives[0];
  const read = (name) => {
    const accessor = json.accessors[primitive.attributes[name]];
    const view = json.bufferViews[accessor.bufferView];
    const offset = binStart + (view.byteOffset || 0);
    const items = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
    const count = accessor.count * items;
    if (accessor.componentType === 5126) {
      return new THREE.BufferAttribute(new Float32Array(buf, offset, count), items);
    }
    if (accessor.componentType === 5121) {
      return new THREE.BufferAttribute(new Uint8Array(buf, offset, count), items, Boolean(accessor.normalized));
    }
    throw new Error('componentType ' + accessor.componentType);
  };
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', read('POSITION'));
  if (primitive.attributes.COLOR_0 !== undefined) geometry.setAttribute('color', read('COLOR_0'));
  /*
    Recomputed rather than shipped: the mesh is unindexed, so this returns
    exactly the flat normals that used to be in the file - 451 KB of them.
  */
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}

Promise.all([
  fetch('${base}/islands/${island}.glb').then((r) => { if (!r.ok) throw new Error('glb ' + r.status); return r.arrayBuffer(); }),
  fetch('${base}/islands/${island}.anchors.json').then((r) => (r.ok ? r.json() : [])),
]).then(([bin, list]) => new Promise((resolve) => {
  {
    const mesh = parseIsland(bin);
    scene.add(mesh);
    island = mesh;
    const gltf = { scene: mesh };

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
    /* Anything that arrived while the island was still loading. */
    if (pending.here) window.__chivago.setHere(pending.here[0], pending.here[1]);
    if (pending.route) window.__chivago.setRoute(pending.route);
    post({ type: 'ready', labels: list.length });
    draw();
    resolve();
  }
})).catch((e) => fail(String(e && e.message ? e.message : e)));
</script>
</body></html>`;
}

export function IslandDiorama({ island = 'koh-sichang', height, here, route, onSelectPlace }: IslandDioramaProps) {
  const [ready, setReady] = React.useState(false);
  const web = React.useRef<WebView>(null);
  const frame = React.useRef<HTMLIFrameElement | null>(null);
  const html = React.useMemo(() => dioramaPage(island, API_BASE), [island]);

  const send = React.useCallback((message: Record<string, unknown>) => {
    const payload = JSON.stringify(message);
    if (Platform.OS === 'web') {
      frame.current?.contentWindow?.postMessage(payload, '*');
      return;
    }
    web.current?.injectJavaScript(`window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(payload)}}));true;`);
  }, []);

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

  /* Position and route are pushed in, never rebuilt into the page. */
  React.useEffect(() => {
    if (!ready) return;
    const point = here ? toIsland(island, here.lng, here.lat) : null;
    send(point ? { type: 'here', x: point[0], z: point[1] } : { type: 'here', x: null });
  }, [ready, here, island, send]);

  React.useEffect(() => {
    if (!ready) return;
    const points = (route ?? [])
      .map(([lng, lat]) => toIsland(island, lng, lat))
      .filter((p): p is [number, number] => p !== null);
    send({ type: 'route', points: points.length > 1 ? points : null });
  }, [ready, route, island, send]);

  return (
    <View style={{ height, borderRadius: 18, overflow: 'hidden', backgroundColor: color.brand }}>
      {Platform.OS === 'web'
        ? React.createElement('iframe', {
            ref: frame,
            srcDoc: html,
            title: 'Ko Sichang',
            style: { border: 0, width: '100%', height: '100%' },
          })
        : (
          <WebView
            ref={web}
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
