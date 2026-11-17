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
export const CAMERA = {
  yaw: 20, yawRange: 35, pitch: 32, pitchMin: 24, pitchMax: 55,
  /*
    HOW CLOSE A PERSON MAY COME. docs/76 asked for 1.2 km at the near end and
    that is kept. The far end is not a number here: it is whatever distance
    frames the whole island, measured from the model when it loads (6,872 m
    for Ko Sichang, whose mesh is 2,871 by 5,976 m). There is nothing to see
    further out than the whole island, and a second island of another size
    would need a different number, which is exactly the kind of number that
    goes stale in a constant.
  */
  zoomMin: 1200,
};

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
  /* The ids the app can actually open. Anything else is drawn, not offered. */
  openable?: readonly string[];
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
  /*
    LEADERS ARE SVG, not divs. A div leader can only be a vertical bar, which
    is why the first version could only ever push names straight down - and on
    an island whose places cluster, straight down marches them off the land.
    A line can point anywhere, so the name can go wherever there is room.
    #leads sits BEFORE #labels, so each pill covers the end of its own line.
  */
  #leads{position:absolute;inset:0;pointer-events:none}
  #leads line{stroke:rgba(19,36,46,.5);stroke-width:1}
  /*
    THE DOT IS THE PLACE. The pill is only its name, and a name that has been
    nudged aside to stay readable no longer says where anything is. The dot
    never moves, the leader joins the two, and together they can be trusted.
  */
  /*
    A NAME THAT OPENS SAYS SO. Every pill was styled the same and every pill
    posted a tap, including the ones the app has no record for - so some of
    the island's names were buttons that did nothing at all when pressed,
    which is the worst kind of control: one that looks willing. The chevron
    and the pointer are only worn by names the app can actually open.
  */
  .lab.open{cursor:pointer;padding-right:7px}
  .lab.open::after{content:'›';margin-left:6px;color:#4E6B7A;font-weight:700}
  .lab:not(.open){cursor:default}
  .dot{position:absolute;width:9px;height:9px;border-radius:999px;transform:translate(-50%,-50%);
    background:#fff;border:2px solid #13242e;box-shadow:0 1px 3px rgba(0,0,0,.35);pointer-events:none}
  /* North, and how far a hundred metres is. A drawn island owes both. */
  #rose{position:absolute;left:12px;top:12px;width:46px;height:46px;border-radius:999px;
    background:rgba(255,255,255,.92);box-shadow:0 2px 6px rgba(0,0,0,.2)}
  #rose svg{display:block}
  #scale{position:absolute;left:12px;bottom:12px;color:#fff;font-size:11px;font-weight:600;
    text-shadow:0 1px 3px rgba(0,0,0,.5)}
  #scale .bar{height:3px;background:#fff;border-radius:2px;margin-bottom:3px;
    box-shadow:0 1px 3px rgba(0,0,0,.4)}
  /*
    PINCH IS INVISIBLE. This map lives in a 320 px band inside a page that
    scrolls, where a two-finger gesture is neither obvious nor comfortable,
    so the two things it does are also buttons. They are the reason zoom can
    be found at all, and the only way to work it with one hand on a phone.
  */
  #zoom{position:absolute;right:12px;bottom:12px;display:flex;flex-direction:column;gap:6px}
  #zoom button{width:44px;height:44px;border:0;border-radius:999px;cursor:pointer;
    background:rgba(255,255,255,.92);box-shadow:0 2px 6px rgba(0,0,0,.2);
    color:#13242e;font-size:22px;font-weight:600;line-height:1;padding:0;
    display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent}
  #zoom button:disabled{opacity:.4;cursor:default}
  #fail{position:absolute;inset:0;display:none;align-items:center;justify-content:center;
    color:#fff;font-size:13px;text-align:center;padding:0 24px}
</style>
</head><body>
<svg id="leads"></svg>
<div id="labels"></div>
<div id="zoom">
  <button id="zoomIn" type="button" aria-label="Zoom in">+</button>
  <button id="zoomOut" type="button" aria-label="Zoom out">−</button>
</div>
<div id="rose"><svg width="46" height="46" viewBox="0 0 46 46">
  <g id="needle" transform="translate(23,23)">
    <polygon points="0,-15 5,3 0,0 -5,3" fill="#C4452B"></polygon>
    <polygon points="0,15 5,-3 0,0 -5,-3" fill="#9AA3A8"></polygon>
  </g>
  <text x="23" y="11" text-anchor="middle" font-size="9" font-weight="700" fill="#13242e">N</text>
</svg></div>
<div id="scale"><div class="bar" style="width:60px"></div><span id="scaleText">—</span></div>
<div id="fail"></div>
<script>
  /*
    THE ISLAND STARTS DOWNLOADING BEFORE three DOES, and this is worth more
    than either file's size.

    A module import blocks the module body, so the page was doing this in
    series: fetch 675 KB of three, parse it, and only then ask for the 602 KB
    island. Two downloads that have nothing to say to each other were waiting
    for one another - on a phone that is the difference between one wait and
    two. This is a classic script on purpose: it runs the moment the parser
    reaches it, while the module below is still being fetched.
  */
  window.__t0 = Date.now();
  /*
    A WATCHDOG, because the failure that cost today could not speak.

    If the module script itself is refused - a CORS header missing, a file
    404, a parse error - none of the code below ever runs, so none of it can
    say so. The page just waits. This is the only line guaranteed to execute,
    so it is the one that has to notice the silence.
  */
  window.__say = function (m) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); return; } catch (e) {}
    try { window.parent.postMessage(JSON.stringify(m), '*'); } catch (e) {}
  };
  window.addEventListener('error', function (e) {
    window.__say({ type: 'error', why: 'script: ' + (e.message || 'failed to load') });
  }, true);
  setTimeout(function () {
    if (!window.__started) {
      window.__say({ type: 'error', why: 'the island did not start in 10 seconds' });
    }
  }, 10000);
  window.__island = Promise.all([
    fetch('${base}/islands/${island}.glb').then(function (r) {
      if (!r.ok) throw new Error('glb ' + r.status);
      return r.arrayBuffer();
    }),
    fetch('${base}/islands/${island}.anchors.json')
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; }),
  ]);
</script>
<script type="module">
import * as THREE from '${base}${VENDOR}';

/*
  WHERE THE TIME GOES, reported rather than guessed.

  Three rounds of this were spent making files smaller on the theory that
  size was the wait. It helped, and the answer stayed "still slow", because
  nothing here can open a browser and nobody could see which leg was long.
  The page times its own four legs and says so; the overlay shows them while
  it waits. A number from the phone that is slow beats an hour of reasoning
  about a phone that is not here.
*/
const tick = (what) => post({ type: 'tick', what, ms: Date.now() - window.__t0 });
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
/* Set from the model once it is measured; until then there is nothing to zoom. */
let near = ${CAMERA.zoomMin}, far = 1;
const zoomIn = document.getElementById('zoomIn');
const zoomOut = document.getElementById('zoomOut');
function dolly(to) {
  distance = Math.min(far, Math.max(near, to));
  /*
    A control that cannot do anything says so. Both ends of this range are
    reachable in a few taps, and a + that keeps looking live at the closest
    the island has to offer is a small lie told repeatedly.
  */
  zoomIn.disabled = distance <= near + 1;
  zoomOut.disabled = distance >= far - 1;
}

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
const leads = document.getElementById('leads');
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

  const onScreen = anchors
    .map((a) => {
      const v = a.world.clone().project(camera);
      return { a, x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight, z: v.z };
    })
    .filter((s) => s.z < 1 && s.x > 10 && s.x < window.innerWidth - 10);

  /*
    EVERY PLACE GETS A DOT. docs/76 has said "the rest collapse to dots" since
    the direction was written, and the code had never done it: a place that
    did not make the nearest seven simply was not there, so the island looked
    emptier than the database it is drawn from. The dot costs nothing and it
    is what makes the seven names feel like a selection rather than the whole
    of what is on the island.
  */
  /*
    HIDDEN WITH visibility, NOT display. A display:none element measures
    0 wide, and this loop hides every pill before asking how wide each one is
    - so offsetWidth || 110 fell to 110 for ALL of them while the real
    widths run from 112 to 155. The spacing was computed from a number no
    label actually had. visibility keeps the box, so the measurement is real.
  */
  for (const a of anchors) { a.el.style.visibility = 'hidden'; a.lead.style.visibility = 'hidden'; a.dot.style.visibility = 'hidden'; }
  for (const s of onScreen) {
    s.a.dot.style.visibility = 'visible';
    s.a.dot.style.left = s.x + 'px';
    s.a.dot.style.top = s.y + 'px';
  }

  const shown = onScreen
    .slice()
    .sort((m, n) => m.z - n.z)
    .slice(0, 7)
    /*
      NEAREST SEVEN, THEN TOP TO BOTTOM. The old code laid the labels out in
      DEPTH order and moved each one below the last, by a fixed step and
      whatever the distance between them. Seven places spread
      across six kilometres of island therefore collapsed into one column in
      the middle of the sea, in an order that matched nothing a person could
      see, and the leader lines came out at zero height because the label had
      been pushed PAST its own place. Depth still chooses WHICH seven; the
      screen chooses where they go.
    */
    .sort((m, n) => m.y - n.y);
  const placed = [];
  const H = 26;
  /*
    WHERE A NAME MAY GO, in the order it should be tried: over its own dot
    first, then further out, then to one side, then the other. Measured on the
    default framing, where five of the seven dots fall inside thirty vertical
    pixels - the island is 6 km long and the map opens on all of it, so the
    places by the palace genuinely crowd. A cascade that only knows "down" walked
    them 97 px off the island, each one further than the last. Going AROUND
    the cluster keeps every name within sight of the place it belongs to.
  */
  const SPOTS = [
    [0, -12], [0, 38], [0, -40], [0, 66],
    [-76, -12], [76, -12], [-76, 38], [76, 38],
    [0, -68], [0, 94],
    [-108, -12], [108, -12], [-108, 38], [108, 38],
  ];
  for (const s of shown) {
    const w = s.a.el.offsetWidth || 110;
    let spot = null;
    for (const candidate of SPOTS) {
      const cx = s.x + candidate[0];
      const cy = s.y + candidate[1];
      const clipped = cx - w / 2 < 4 || cx + w / 2 > window.innerWidth - 4 || cy - H < 2 || cy > window.innerHeight - 2;
      const hit = placed.some((q) => Math.abs(q.x - cx) < (q.w + w) / 2 + 8 && Math.abs(q.y - cy) < H + 4);
      /*
        AND IT MAY NOT BE LAID OVER A PLACE. Measured on production: the
        Cholatassathan Museum pill alone sat on top of three other dots,
        including two that had labels of their own - so those names pointed
        down a leader line at a place that was not there to see. Five of the
        thirteen dots were buried. A label may cover sea, or hillside, or
        another label's leader. It may not cover the thing this map exists to
        show.
      */
      const over = onScreen.some((q) => Math.abs(q.x - cx) < w / 2 + 5 && q.y > cy - H - 5 && q.y < cy + 5);
      if (!clipped && !hit && !over) { spot = candidate; break; }
    }
    /*
      NO ROOM IS AN ANSWER. An earlier draft kept a last-resort position and
      used it when every candidate was taken, which put a name on top of
      another name - and a label in the wrong place is worse than no label,
      because the reader cannot tell it is wrong. The dot stays, so the place
      is still on the map; turn the island, or come closer, and the name
      returns. Measured on the default framing: six of seven named, nothing
      overlapping, the furthest name 81 px from its own dot and joined to it.
    */
    if (!spot) continue;
    const x = s.x + spot[0];
    const y = s.y + spot[1];
    placed.push({ x, y, w });

    s.a.el.style.visibility = 'visible';
    s.a.el.style.left = x + 'px';
    s.a.el.style.top = y + 'px';
    /*
      From the dot to the middle of the pill, which the pill then covers -
      so what shows is exactly the gap between a name and its place.
    */
    const far = Math.abs(x - s.x) > 3 || Math.abs(y - s.y) > 16;
    s.a.lead.style.visibility = far ? 'visible' : 'hidden';
    s.a.lead.setAttribute('x1', s.x);
    s.a.lead.setAttribute('y1', s.y);
    s.a.lead.setAttribute('x2', x);
    s.a.lead.setAttribute('y2', y - H / 2);
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

/*
  ONE FINGER TURNS THE ISLAND, TWO CHANGE HOW CLOSE YOU ARE.

  Pointer events carry mouse, pen and every finger down the same path, so
  both gestures are decided by how many are on the glass rather than by
  guessing at the device. The map of live pointers is the whole of that
  decision.
*/
const touching = new Map();
let pinching = null;
const spread = () => {
  const two = [...touching.values()];
  return Math.hypot(two[0].x - two[1].x, two[0].y - two[1].y);
};

renderer.domElement.addEventListener('pointerdown', (e) => {
  touching.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touching.size === 2) {
    /* A second finger ends the turn it interrupted rather than fighting it. */
    dragging = null;
    pinching = { spread: spread(), distance };
  } else if (touching.size === 1) {
    down(e.clientX, e.clientY);
  }
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!touching.has(e.pointerId)) return;
  touching.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touching.size === 2 && pinching) {
    const now = spread();
    /* Fingers apart means closer in, which is why the ratio is this way up. */
    if (now > 0) dolly(pinching.distance * (pinching.spread / now));
  } else if (touching.size === 1) {
    move(e.clientX, e.clientY);
  }
});
const lift = (e) => {
  touching.delete(e.pointerId);
  if (touching.size < 2) pinching = null;
  if (touching.size === 1) {
    /*
      ONE FINGER LEFT AFTER A PINCH starts a NEW turn from where it is.
      Without this the drag still holds the yaw and the position it was given
      before the pinch, and the island jumps the moment the other finger
      leaves - which is the most common way a two-gesture map feels broken.
    */
    const rest = [...touching.values()][0];
    down(rest.x, rest.y);
  }
  if (touching.size === 0) up();
};
renderer.domElement.addEventListener('pointerup', lift);
renderer.domElement.addEventListener('pointercancel', lift);
/* A pointer that leaves the canvas still ends, or the island keeps turning. */
window.addEventListener('pointerup', lift);

/* A trackpad or a wheel, for everyone not on a phone. */
renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();
  dolly(distance * Math.exp(e.deltaY * 0.0012));
}, { passive: false });

/* And the buttons, a third of the way in or out per press. */
zoomIn.addEventListener('click', () => dolly(distance * 0.7));
zoomOut.addEventListener('click', () => dolly(distance / 0.7));
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
let pending = { here: null, route: null, openable: null };
window.__chivago = {
  setHere(x, z) {
    if (x === null || x === undefined) { hereGroup.visible = false; return; }
    pending.here = [x, z];
    hereGroup.position.set(x, groundAt(x, z), z);
    hereGroup.visible = true;
  },
  setRoute(points) { pending.route = points; drawRoute(points); },
  /*
    Which places the app holds. The island is drawn from a sidecar of
    anchors and the app from its own list, and the two do not have to agree
    - the shrine and the mondop are bootstrapped at run time, the pier and
    the beach come from the seed. Rather than guess, the page is told.
  */
  setOpenable(ids) {
    pending.openable = ids;
    const can = new Set(ids || []);
    for (const a of anchors) a.el.classList.toggle('open', can.has(a.id));
  },
};
window.addEventListener('message', (e) => {
  let m = null;
  try { m = JSON.parse(typeof e.data === 'string' ? e.data : ''); } catch (err) { return; }
  if (!m) return;
  if (m.type === 'here') window.__chivago.setHere(m.x, m.z);
  if (m.type === 'route') window.__chivago.setRoute(m.points);
  if (m.type === 'openable') window.__chivago.setOpenable(m.ids);
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

/* Started before this module was even fetched. */
window.__started = true;
tick('three');
window.__island.then(([bin, list]) => new Promise((resolve) => {
  tick('island');
  {
    const mesh = parseIsland(bin);
    scene.add(mesh);
    island = mesh;
    const gltf = { scene: mesh };

    const box = new THREE.Box3().setFromObject(gltf.scene);
    box.getCenter(target);
    const size = box.getSize(new THREE.Vector3());
    far = Math.max(size.x, size.z) * 1.15;
    dolly(far);

    for (const a of list) {
      const el = document.createElement('div');
      el.className = 'lab';
      el.textContent = a.name;
      el.addEventListener('click', () => {
        /* Silence is not an answer. A pill only takes a tap it can honour. */
        if (el.classList.contains('open')) post({ type: 'place', id: a.id });
      });
      labels.appendChild(el);
      const lead = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      leads.appendChild(lead);
      const dot = document.createElement('div');
      dot.className = 'dot';
      labels.appendChild(dot);
      anchors.push({ id: a.id, el, lead, dot, world: new THREE.Vector3(a.x, a.y + 40, a.z) });
    }
    /* Anything that arrived while the island was still loading. */
    if (pending.here) window.__chivago.setHere(pending.here[0], pending.here[1]);
    if (pending.route) window.__chivago.setRoute(pending.route);
    if (pending.openable) window.__chivago.setOpenable(pending.openable);
    tick('built');
    post({ type: 'ready', labels: list.length });
    draw();
    requestAnimationFrame(() => tick('drawn'));
    resolve();
  }
})).catch((e) => fail(String(e && e.message ? e.message : e)));
</script>
</body></html>`;
}

export function IslandDiorama({ island = 'koh-sichang', height, here, route, onSelectPlace, openable }: IslandDioramaProps) {
  const [ready, setReady] = React.useState(false);
  const [ticks, setTicks] = React.useState<{ what: string; ms: number }[]>([]);
  /*
    WHY THE REASON IS KEPT HERE and not only inside the page: the failure that
    cost today happened BEFORE the page's own code ran, so the page had no way
    to draw its own error. Marking the view "ready" hid the spinner and left a
    blank blue rectangle - a silence, which is what we are trying to stop
    shipping. The reason is held on this side, where something can always say
    it.
  */
  const [failure, setFailure] = React.useState<string | null>(null);
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
    type Note = { type?: string; id?: string; what?: string; ms?: number; why?: string };
    let message: Note | null = null;
    try { message = JSON.parse(raw) as Note; } catch { return; }
    if (message?.type === 'tick' && message.what && typeof message.ms === 'number') {
      setTicks((seen) => [...seen, { what: message.what as string, ms: message.ms as number }]);
    }
    if (message?.type === 'error') setFailure(message.why ?? 'unknown');
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

  /*
    The ids the app holds, joined into a string so the dependency is the
    CONTENT and not the array - a fresh array of the same ids each render
    would otherwise push a message into the page on every frame of the
    parent's state.
  */
  const openKey = (openable ?? []).join(',');
  React.useEffect(() => {
    if (!ready) return;
    send({ type: 'openable', ids: openKey ? openKey.split(',') : [] });
  }, [ready, openKey, send]);

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
          {ticks.length ? (
            <Body size={13} colour="#D9F3FA">
              {ticks.map((entry) => `${entry.what} ${(entry.ms / 1000).toFixed(1)}s`).join(' · ')}
            </Body>
          ) : null}
        </View>
      )}
      {failure ? (
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: space.s2, padding: space.s4, backgroundColor: color.brand }}>
          <Body colour="#ffffff">
            {t({
              en: 'The island could not be drawn.',
              th: 'สร้างเกาะไม่สำเร็จ',
              zh: '岛屿无法生成。',
            })}
          </Body>
          <Body size={13} colour="#D9F3FA">{failure}</Body>
          <Body size={13} colour="#D9F3FA">
            {t({
              en: 'The flat map still works - tap it below.',
              th: 'แผนที่ปกติยังใช้ได้ กดด้านล่าง',
              zh: '平面地图仍可使用，请点击下方。',
            })}
          </Body>
        </View>
      ) : null}
    </View>
  );
}
