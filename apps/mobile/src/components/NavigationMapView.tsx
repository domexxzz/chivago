/**
 * The navigation map on a phone: MapLibre in a WebView, driven by messages.
 *
 * The same arrangement `WebTerrainMap.tsx` introduced and for the same
 * reason - MapLibre's native binding needs a development build and this
 * project is driven from Expo Go - with three differences that all come from
 * the one requirement a hero map does not have: THE DOCUMENT MUST NOT
 * RELOAD WHILE SOMEBODY IS DRIVING.
 *
 *   - the HTML is memoised on the things that genuinely change the
 *     document, and a position is not one of them. The `here` dot on the
 *     hero map is placed from the position the map STARTED with, because
 *     re-rendering for a fix would tear the map down; here the position has
 *     to be live, so it arrives as a MESSAGE instead. Nothing in the route,
 *     the arrow or the camera touches the `source` prop.
 *   - commands travel by `postMessage`, not `injectJavaScript`. The latter
 *     is string concatenation into executable source, which is acceptable
 *     for `__zoom(1)` and not acceptable for anything carrying a route.
 *   - commands sent before the style has loaded are QUEUED. A navigator
 *     starts by sending a route and a camera immediately; a map that is
 *     still fetching 800 KB of library would otherwise drop both and sit at
 *     the island overview until the next fix.
 *
 * The tile cache is the same IndexedDB shim as the hero map, which is what
 * makes offline navigation more than a claim: the roads a lost traveller
 * needs do not stop existing because the network did.
 */

import React from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { chivagoStyle } from './terrain-style.ts';
import {
  NAV, NAV_BEFORE, USER_ARROW_SVG, navigationLayers, navigationSources,
} from './navigation-layers.ts';
import { parseMapEvent, validateCommand, type MapCommand } from './navigation-bridge.ts';
import { color } from '../theme/index.ts';

/** Same origin, same reason: an opaque origin has no IndexedDB to cache into. */
const ORIGIN = 'https://tiles.openfreemap.org';
const MAPLIBRE_JS = 'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js';
const MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css';

export interface NavigationMapHandle {
  send: (command: MapCommand) => void;
}

export interface NavigationMapViewProps {
  /** Island hour, so the navigator wears the same palette as everything else. */
  hour?: number;
  /** Where to open before the first fix arrives. */
  centre: { lat: number; lng: number };
  onReady?: () => void;
  /** The traveller took the camera. The screen stops driving it. */
  onUserMovedMap?: () => void;
  /** A coordinate tapped while the screen is in point-picking mode. */
  onPressCoordinate?: (point: { lat: number; lng: number }) => void;
  /** MapLibre could not start at all. The screen says so rather than showing grey. */
  onFailed?: (code: string) => void;
  handleRef?: React.Ref<NavigationMapHandle>;
}

/**
 * The page.
 *
 * Built once per style, never per fix. Everything dynamic arrives through
 * `message` and is parsed as JSON - nothing on this page is ever built by
 * pasting data into source.
 */
function page(style: unknown, centre: [number, number], arrow: string): string {
  const data = JSON.stringify({
    style,
    centre,
    sources: navigationSources(),
    layers: navigationLayers(),
    before: NAV_BEFORE,
    ids: NAV,
    arrow,
  }).replace(/</g, '\\u003c');

  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link href="${MAPLIBRE_CSS}" rel="stylesheet">
<style>
  html,body,#map{margin:0;padding:0;height:100%;width:100%;background:${color.brandSoft}}
  .maplibregl-ctrl-attrib{font-size:9px}
  .cg-me{width:40px;height:40px;will-change:transform}
  .cg-me svg{display:block;filter:drop-shadow(0 2px 4px rgba(8,26,48,.45))}
</style>
</head><body>
<div id="map"></div>
<script>
/*
  THE TILE CACHE. The same shim the hero map uses: every map request is
  answered from the network and kept, or answered from the copy when the
  network is gone. It is what makes a saved route followable on a phone with
  no signal - the geometry comes from the app, and the roads under it come
  from here.
*/
var DB='chivago-tiles', STORE='tiles', dbp=null;
function db(){
  if(dbp) return dbp;
  dbp=new Promise(function(res,rej){
    var r=indexedDB.open(DB,1);
    r.onupgradeneeded=function(){ if(!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
    r.onsuccess=function(){res(r.result)}; r.onerror=function(){rej(r.error)};
  }).catch(function(e){ dbp=null; throw e; });
  return dbp;
}
function cacheGet(k){ return db().then(function(d){ return new Promise(function(res){
  var q=d.transaction(STORE,'readonly').objectStore(STORE).get(k);
  q.onsuccess=function(){res(q.result||null)}; q.onerror=function(){res(null)};
});}).catch(function(){return null}); }
function cachePut(k,v){ return db().then(function(d){ return new Promise(function(res){
  var tx=d.transaction(STORE,'readwrite'); tx.objectStore(STORE).put(v,k);
  tx.oncomplete=function(){res()}; tx.onerror=function(){res()}; tx.onabort=function(){res()};
});}).catch(function(){}); }
var realFetch=window.fetch.bind(window);
window.fetch=function(input,init){
  var url=typeof input==='string'?input:(input&&input.url)||'';
  if(!/openfreemap|elevation-tiles-prod|unpkg\\.com/.test(url)) return realFetch(input,init);
  return realFetch(input,init).then(function(res){
    if(!res||!res.ok) throw new Error('bad response');
    res.clone().arrayBuffer().then(function(buf){
      cachePut(url,{b:buf,t:res.headers.get('content-type')||''});
    }).catch(function(){});
    return res;
  }).catch(function(err){
    return cacheGet(url).then(function(hit){
      if(!hit) throw err;
      return new Response(hit.b,{status:200,headers:{'content-type':hit.t}});
    });
  });
};

function post(m){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(m)); }catch(e){} }

var D=${data};
var map=null, me=null, ready=false, queue=[];

/* The same validation the screen's side describes, on the side that needs it. */
function num(v){ return typeof v==='number' && isFinite(v); }
function line(v){
  if(!Array.isArray(v)) return null;
  for(var i=0;i<v.length;i++){ var p=v[i]; if(!Array.isArray(p)||p.length!==2||!num(p[0])||!num(p[1])) return null; }
  return v;
}
function pad(v){
  return v&&typeof v==='object'&&num(v.top)&&num(v.bottom)&&num(v.left)&&num(v.right)
    ? {top:v.top,bottom:v.bottom,left:v.left,right:v.right} : null;
}
function feature(coords){ return {type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}}; }
function setData(id,data){ var s=map&&map.getSource(id); if(s&&s.setData) s.setData(data); }

function apply(c){
  if(!c||typeof c!=='object'||!map) return;
  if(c.type==='SET_ROUTE'){
    var remaining=line(c.remaining), travelled=line(c.travelled);
    if(!remaining||!travelled) return;
    setData(D.ids.routeSource, feature(remaining));
    setData(D.ids.travelledSource, feature(travelled));
    setData(D.ids.pointsSource, c.points&&typeof c.points==='object'?c.points:{type:'FeatureCollection',features:[]});
    return;
  }
  if(c.type==='UPDATE_POSITION'){
    if(!num(c.lng)||!num(c.lat)||!num(c.bearing)) return;
    if(!me){
      var el=document.createElement('div');
      el.className='cg-me'; el.setAttribute('role','img'); el.innerHTML=D.arrow;
      me=new maplibregl.Marker({element:el,anchor:'center',rotationAlignment:'map'}).setLngLat([c.lng,c.lat]).addTo(map);
    }
    me.setLngLat([c.lng,c.lat]);
    me.setRotation(c.bearing);
    setData(D.ids.meSource,{type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'Point',coordinates:[c.lng,c.lat]}}]});
    /*
      The accuracy ring's radius arrives as a MapLibre expression computed by
      accuracyRadius on the app's side, so the metres-to-pixels conversion
      exists in one place rather than once per platform. Zero draws nothing,
      which is what a good fix gets. No backticks in here: this comment lives
      inside a template literal.
    */
    if(map.getLayer(D.ids.accuracy)){
      map.setPaintProperty(D.ids.accuracy,'circle-radius', c.radius===undefined?0:c.radius);
    }
    return;
  }
  if(c.type==='CAMERA'){
    var centre=line([c.centre]), padding=pad(c.padding);
    if(!centre||!padding||!num(c.bearing)||!num(c.zoom)||!num(c.pitch)) return;
    /*
      ONE CAMERA MOVE AT A TIME. easeTo replaces whatever is running; two
      overlapping eases fight each other and the map judders, which on a
      following camera happens every single fix.
    */
    map.easeTo({
      center:centre[0], bearing:c.bearing, zoom:c.zoom, pitch:c.pitch,
      padding:padding, duration:num(c.duration)?c.duration:0, essential:true,
    });
    return;
  }
  if(c.type==='FIT'){
    var b=line(c.bounds), p=pad(c.padding);
    if(!b||b.length!==2||!p) return;
    var fitted=map.cameraForBounds(b,{padding:p,bearing:0});
    var maxZoom=fitted?Math.max(map.getMinZoom(),fitted.zoom-0.7):undefined;
    map.fitBounds(b,{padding:p,bearing:0,pitch:0,duration:600,maxZoom:maxZoom});
    return;
  }
  if(c.type==='ZOOM'){
    if(c.delta!==1&&c.delta!==-1) return;
    map.easeTo({zoom:map.getZoom()+c.delta,duration:220,essential:true});
    return;
  }
  if(c.type==='CLEAR_ROUTE'){
    setData(D.ids.routeSource, feature([]));
    setData(D.ids.travelledSource, feature([]));
    setData(D.ids.pointsSource,{type:'FeatureCollection',features:[]});
    setData(D.ids.meSource,{type:'FeatureCollection',features:[]});
    if(me){ me.remove(); me=null; }
  }
}

function receive(raw){
  var c=null;
  try{ c=JSON.parse(raw); }catch(e){ return; }
  if(!ready){ if(queue.length<64) queue.push(c); return; }
  apply(c);
}
/* Android fires on document, iOS on window. Both, and the page survives either. */
document.addEventListener('message', function(e){ receive(e.data); });
window.addEventListener('message', function(e){ receive(e.data); });

function start(){
  if(!window.maplibregl){ post({type:'MAP_ERROR',code:'maplibre-unavailable'}); return; }
  map=new maplibregl.Map({
    container:'map', style:D.style, center:D.centre, zoom:16,
    pitch:0, bearing:0, maxPitch:70, attributionControl:{compact:true},
    /* A navigator turns. Rotation is ON here, unlike the hero map. */
    dragRotate:true,
  });
  map.on('error',function(e){
    var msg=(e&&e.error&&e.error.message)||'map-error';
    post({type:'MAP_ERROR',code:String(msg).slice(0,200)});
  });
  /*
    WHO IS DRIVING THE CAMERA.

    MapLibre fires movestart for its OWN eases as well as for a finger, and
    the following camera eases once per fix - so a handler that reported
    every movestart would tell the screen the traveller had panned once a
    second, and the camera would let go immediately and permanently.

    MapLibre's originalEvent is the difference and it is the whole test: it
    is present only when a real pointer, touch or wheel started the move.
    No backticks in here: this comment lives inside a template literal.
  */
  map.on('movestart',function(e){ if(e&&e.originalEvent) post({type:'USER_MOVED_MAP'}); });
  map.on('click',function(e){
    if(e&&e.lngLat&&num(e.lngLat.lng)&&num(e.lngLat.lat)){
      post({type:'MAP_PRESS',lng:e.lngLat.lng,lat:e.lngLat.lat});
    }
  });
  map.on('load',function(){
    Object.keys(D.sources).forEach(function(id){
      if(!map.getSource(id)) map.addSource(id, D.sources[id]);
    });
    var before=map.getLayer(D.before)?D.before:undefined;
    D.layers.forEach(function(layer){
      if(!map.getLayer(layer.id)) map.addLayer(layer, before);
    });
    ready=true;
    post({type:'MAP_READY'});
    var pending=queue; queue=[];
    pending.forEach(apply);
  });
}
var s=document.createElement('script');
s.src='${MAPLIBRE_JS}';
s.onload=start;
s.onerror=function(){ post({type:'MAP_ERROR',code:'maplibre-offline'}); };
document.head.appendChild(s);
</script>
</body></html>`;
}

export function NavigationMapView({
  hour = 12, centre, onReady, onUserMovedMap, onPressCoordinate, onFailed, handleRef,
}: NavigationMapViewProps) {
  const web = React.useRef<WebView>(null);
  const ready = React.useRef(false);
  const queue = React.useRef<MapCommand[]>([]);

  /*
    THE QUEUE, ON THIS SIDE TOO.

    The page queues what arrives before its style has loaded; this queues
    what is sent before the page exists at all, which is the first second of
    every trip. Without it the opening route and camera are posted into a
    WebView that has not run a line of script and are simply lost.
  */
  const send = React.useCallback((command: MapCommand) => {
    // Checked before it crosses, as well as after. The page refuses a bad
    // command anyway; refusing it here means a malformed one never becomes a
    // string that looks like a message somebody has to debug from both ends.
    if (!validateCommand(command)) return;
    if (!ready.current) {
      if (queue.current.length < 64) queue.current.push(command);
      return;
    }
    try { web.current?.postMessage(JSON.stringify(command)); } catch { /* the view is going */ }
  }, []);

  React.useImperativeHandle(handleRef, () => ({ send }), [send]);

  const onMessage = React.useCallback((event: WebViewMessageEvent) => {
    const message = parseMapEvent(event.nativeEvent.data);
    if (!message) return;
    if (message.type === 'MAP_READY') {
      ready.current = true;
      const pending = queue.current;
      queue.current = [];
      for (const command of pending) {
        try { web.current?.postMessage(JSON.stringify(command)); } catch { /* ignore */ }
      }
      onReady?.();
      return;
    }
    if (message.type === 'USER_MOVED_MAP') { onUserMovedMap?.(); return; }
    if (message.type === 'MAP_PRESS') {
      onPressCoordinate?.({ lat: message.lat, lng: message.lng });
      return;
    }
    onFailed?.(message.code);
  }, [onReady, onUserMovedMap, onPressCoordinate, onFailed]);

  /*
    THE ONE MEMO THAT DEFINES THIS COMPONENT.

    `centre` is read for the opening frame and then deliberately ignored: it
    is in the dependency list's blind spot on purpose, because including it
    would rebuild the document on the first fix and every fix after it. The
    page is a function of the STYLE, and the style is a function of the hour.
  */
  const html = React.useMemo(
    () => page(chivagoStyle(hour), [centre.lng, centre.lat], USER_ARROW_SVG),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hour],
  );

  return (
    <View style={{ flex: 1, backgroundColor: color.brandSoft }}>
      <WebView
        ref={web}
        originWhitelist={['*']}
        source={{ html, baseUrl: ORIGIN }}
        onMessage={onMessage}
        onError={() => onFailed?.('webview-error')}
        onRenderProcessGone={() => onFailed?.('webview-gone')}
        onContentProcessDidTerminate={() => onFailed?.('webview-gone')}
        scrollEnabled={false}
        bounces={false}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        androidLayerType="hardware"
        style={{ flex: 1, backgroundColor: color.brandSoft }}
      />
    </View>
  );
}
