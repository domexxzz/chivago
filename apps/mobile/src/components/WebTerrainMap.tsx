/**
 * The web map, on a phone, and still there with no signal.
 *
 * WHY A WEBVIEW. `TerrainMap.tsx` is MapLibre GL JS over OpenFreeMap vector
 * tiles and Terrarium elevation, and it is the map this product means when
 * it says "the map": roads, coastline, labels, the island's own palette. It
 * has never run on a phone, because MapLibre's NATIVE binding is a native
 * module and a native module means a development build - and this project
 * is driven from Expo Go. So the phone drew an SVG decagon with a score on
 * each pin: no roads, no scale, no north. Somebody lost could read every
 * number on it and still not know which way to walk.
 *
 * `react-native-webview` IS bundled in Expo Go (13.12.5 for SDK 52), and
 * MapLibre GL JS is a browser library. Putting the one inside the other
 * gives the phone the same map as the browser with no change to how this
 * project is built or run.
 *
 * ONE STYLE, TWO PLATFORMS. The HTML below does not re-describe the map: it
 * is handed `chivagoStyle()` - the same fourteen-layer StyleSpecification
 * the web map builds, serialised. A change to the island's palette or its
 * layers reaches both, because there is only one of them.
 *
 * WHAT THIS IS NOT. It is not as smooth as a native binding and it does not
 * pretend to be; a WebView is a browser. It was chosen because it ships
 * today on the toolchain the team actually uses, and because the alternative
 * costs a development build - the thing that has kept this map off phones
 * since the beginning.
 */

import React from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { Area, ExploredPlace, ScoredPlace } from '@chivago/core';
import { MapLegend } from './map-parts.tsx';
import { chivagoStyle } from './terrain-style.ts';
import { color } from '../theme/index.ts';
import { t } from '../i18n/locale.ts';
import type { Shop } from '../api/shops.ts';
import { shopMarkerSvg, shopMarkerVisual } from './shop-map-marker.tsx';
import { placeMarkerHtml, placeMarkerVisual } from './place-map-marker.tsx';
import { UNPINNED_NOTE, mappable, servicePoints } from './map-geometry.ts';

/**
 * Where the page thinks it lives.
 *
 * Not a reason to make a request - nothing is fetched from it. It is here
 * because a WebView given bare HTML has an opaque origin, and an opaque
 * origin has no IndexedDB and no Cache API, which is where the tiles for
 * the next outage are kept. Naming the tile host gives the page a real
 * origin AND makes every tile request same-origin.
 */
const ORIGIN = 'https://tiles.openfreemap.org';

/**
 * Satellite imagery, and who it belongs to.
 *
 * Esri's World Imagery is the one free global basemap whose terms allow this
 * use, and those terms are attribution: the credit below is not decoration
 * and is drawn whenever the layer is on. It is a RASTER source, unlike the
 * vector basemap underneath it, which is why it can be laid over the top as
 * one opaque sheet and taken away again without touching the fourteen layers
 * beneath - the roads, labels and pins all come back exactly as they were.
 */
const SATELLITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SATELLITE_CREDIT = 'Imagery © Esri, Maxar, Earthstar Geographics';

/** Pinned, because a map that silently changes library version is a map that silently changes. */
const MAPLIBRE_JS = 'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js';
const MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css';

/** What a screen can ask of the map from outside the document. */
export interface MapHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  /** Back to the whole area, after wandering off it. */
  recentre: () => void;
  /** Flips the satellite sheet. The document keeps the state; this asks it to change. */
  toggleSatellite: () => void;
}

export interface WebTerrainMapProps {
  area: Area;
  places: ScoredPlace[];
  highlightedPlaceIds?: ReadonlySet<string>;
  onSelect: (place: ScoredPlace) => void;
  shops?: Shop[];
  onSelectShop?: (shop: Shop) => void;
  here: { lat: number; lng: number } | null;
  height: number;
  /** Island hour, so the phone wears the same palette as the browser. */
  hour?: number;
  /** For the legend, which belongs to the SCREEN rather than to either drawing. */
  explored?: ExploredPlace[];
  /**
   * Whether the document draws its own satellite button.
   *
   * True on the map embedded in the page, which has no room beside it for
   * native controls. False on the expanded map, which draws its own pinned
   * one - and two buttons for one layer, a hand's width apart, is the kind
   * of thing that makes somebody doubt which one they just pressed.
   */
  inlineSatellite?: boolean;
  /**
   * Handed out so the expanded map can draw its own zoom buttons.
   *
   * A ref rather than a pair of props, because zooming is an EVENT the
   * screen sends once, not a value the map holds: `zoom` as state would
   * fight the pinch and the pan, which change it too.
   */
  handleRef?: React.Ref<MapHandle>;
}

/**
 * The page.
 *
 * Built as a string rather than a file so there is nothing to bundle, nothing
 * to serve, and no second place for the style to drift out of sync.
 */
function page(style: unknown, pins: { id: string; lat: number; lng: number; label: string; colour: string; html: string; highlighted: boolean }[],
  shopPins: { id: string; lat: number; lng: number; name: string; category: string; colour: string; svg: string; approximate: boolean; note: string }[],
  centre: [number, number], here: { lat: number; lng: number } | null,
  box: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  inlineSatellite: boolean): string {
  const data = JSON.stringify({ style, pins, shopPins, centre, here, box, inlineSatellite }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link href="${MAPLIBRE_CSS}" rel="stylesheet">
<style>
  html,body,#map{margin:0;padding:0;height:100%;width:100%;background:${color.brandSoft}}
  .pin{position:relative;display:flex;align-items:center;justify-content:center;width:42px;height:48px;padding:0;border:0;background:transparent;color:#fff}
  .pin-core{position:absolute;top:0;z-index:1;display:flex;align-items:center;justify-content:center;width:38px;height:38px;
    border:3px solid #fff;border-radius:50%;background:var(--marker-colour);box-shadow:0 4px 7px rgba(8,26,48,.4)}
  .pin-core img{width:84px;height:84px;max-width:none;display:block;object-fit:contain}
  .pin.recommended .pin-core{box-shadow:0 0 0 4px #F2B84B,0 0 0 7px rgba(255,255,255,.9),0 7px 14px rgba(8,26,48,.5)}
  .pin-tail{position:absolute;top:31px;width:13px;height:13px;transform:rotate(45deg);background:var(--marker-colour);
    border-right:2.5px solid #fff;border-bottom:2.5px solid #fff;border-radius:2px;box-shadow:3px 3px 5px rgba(8,26,48,.32)}
  .shop-pin{position:relative;display:flex;align-items:center;justify-content:center;width:42px;height:48px;
    padding:0;border:0;background:transparent;color:#fff}
  .shop-pin-core{position:absolute;top:0;z-index:1;display:flex;align-items:center;justify-content:center;width:38px;height:38px;
    border:3px solid #fff;border-radius:50%;background:var(--marker-colour);box-shadow:0 4px 7px rgba(8,26,48,.4)}
  .shop-pin-core svg{width:19px;height:19px}
  .shop-pin-core img{width:84px;height:84px;max-width:none;display:block;object-fit:contain}
  .shop-pin-tail{position:absolute;top:31px;width:13px;height:13px;transform:rotate(45deg);background:var(--marker-colour);
    border-right:2.5px solid #fff;border-bottom:2.5px solid #fff;border-radius:2px;box-shadow:3px 3px 5px rgba(8,26,48,.32)}
  .shop-pin.approx .shop-pin-core{border-style:dashed;opacity:.9}
  .shop-pin.approx .shop-pin-tail{opacity:.55}
  .approx-badge{position:absolute;z-index:2;top:-5px;right:-3px;width:17px;height:17px;border-radius:50%;
    background:#F2B531;color:#3B2A10;border:2px solid #fff;font:800 10px/13px system-ui,sans-serif;text-align:center}
  .me{width:16px;height:16px;border-radius:8px;background:#0077B6;border:3px solid #fff;
      box-shadow:0 0 0 6px rgba(0,119,182,.25)}
  /* Bigger than MapLibre's default: these are pressed with a thumb, not a mouse. */
  .maplibregl-ctrl-group button{width:40px;height:40px}
  /*
    THE TOP-RIGHT CORNER IS ALREADY TAKEN.

    The screen draws its own expand button there, in React Native, OVER this
    document - so MapLibre's controls started underneath it and the zoom-in
    button could not be pressed at all. The stack below is measured from
    that button: it is 42px at a 12px inset, so everything here starts at 56
    and comes down the same edge in one column.
  */
  .maplibregl-ctrl-top-right{margin-top:56px}
  #sat{position:absolute;right:10px;top:66px;z-index:2;min-width:44px;min-height:44px;
       padding:0 14px;border:0;border-radius:12px;background:#fff;color:#123B64;
       font:700 12px/1 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3)}
  #sat.on{background:#0077B6;color:#fff}
</style>
</head><body>
<div id="map"></div>
<button id="sat" type="button">SAT</button>
<script>
/*
  THE TILE CACHE, and it is the whole reason this file is more than twenty
  lines. Every request MapLibre makes - style, glyphs, sprite, vector tile,
  elevation tile - goes through here first.

  Online it answers from the network and keeps a copy. Offline it answers
  from the copy. A tile nobody has ever looked at is not in the cache and
  cannot be invented, so an area never visited is still blank offline; that
  is the honest limit of caching what was seen, and it is stated in the app
  rather than hidden.

  Responses are stored in IndexedDB as ArrayBuffers. The Cache API would be
  tidier, but it is not available on every Android WebView and a map that
  works on some phones is not a feature.
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
  // Only map data is cached. Anything else behaves exactly as before.
  if(!/openfreemap|elevation-tiles-prod|arcgisonline|unpkg\\.com/.test(url)) return realFetch(input,init);
  return realFetch(input,init).then(function(res){
    if(!res||!res.ok) throw new Error('bad response');
    // Clone before the caller consumes it; a body can only be read once.
    res.clone().arrayBuffer().then(function(buf){
      cachePut(url,{b:buf,t:res.headers.get('content-type')||''});
    }).catch(function(){});
    return res;
  }).catch(function(err){
    return cacheGet(url).then(function(hit){
      if(!hit) throw err;
      post({type:'cached'});
      return new Response(hit.b,{status:200,headers:{'content-type':hit.t}});
    });
  });
};

function post(m){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(m)); }catch(e){} }

var D=${data};
var SAT=${JSON.stringify(SATELLITE)}, SAT_CREDIT=${JSON.stringify(SATELLITE_CREDIT)};
function start(){
  if(!window.maplibregl){ post({type:'error',error:'maplibre failed to load'}); return; }
  var map=new maplibregl.Map({
    container:'map', style:D.style, center:D.centre, zoom:11,
    attributionControl:{compact:true}
  });
  map.on('error',function(e){ post({type:'error',error:String((e&&e.error&&e.error.message)||e)}); });
  map.on('load',function(){
    post({type:'ready'});

    /*
      ZOOM IS DRIVEN FROM OUTSIDE, not by a control in here.

      MapLibre's own NavigationControl sits at a corner of THIS DOCUMENT, and
      on the expanded map the document is twice the size of the screen inside
      a pair of scroll views - so the buttons parked themselves at the corner
      of a canvas nobody can see without scrolling to find them. The screen
      draws its own buttons instead, pinned where a thumb is, and calls this.
    */
    window.__zoom=function(d){ map.zoomTo(map.getZoom()+d,{duration:200}); };

    /*
      THE MAP MOVES LIKE A MAP.

      Drag to pan anywhere, pinch to zoom, double-tap to zoom in - all of it
      MapLibre's own, and all of it continuous. The expanded map used to be
      a picture twice the size of the screen dragged around inside two
      scroll views: it stopped dead at the edge of that picture, pinching
      did nothing, and the zoom you got was the zoom it had been built at.

      Rotation stays off. The island's labels are drawn upright and the
      palette is lit from one direction, so a turned map looks wrong rather
      than useful - and a rotation nobody meant to make is the hardest
      gesture to undo on a phone.
    */
    map.dragRotate.disable();
    map.touchZoomRotate.enable();
    map.touchZoomRotate.disableRotation();
    map.doubleClickZoom.enable();

    /*
      Home is the AREA, not the point the map opened at.

      fitBounds frames the whole island however far somebody wandered, and
      the padding keeps the coastline out from under the controls over it.
      No backticks in here: this comment lives inside a template literal.
    */
    window.__home=function(dur){
      map.fitBounds([[D.box.minLng,D.box.minLat],[D.box.maxLng,D.box.maxLat]],
        {padding:{top:80,bottom:90,left:70,right:90},duration:dur===undefined?600:dur});
    };

    /*
      Open on the WHOLE area, not at a zoom somebody guessed.

      A fixed zoom 11 framed Samui about right and left Ko Sichang a green
      speck in the middle of a lot of blue - the areas are different sizes
      and a single number cannot suit them all. Fitting the box suits each
      one, and does it the same way the recentre button does, so the view
      somebody comes back to is the view they started from.

      Skipped when the traveller's own position is known: being shown where
      you are matters more than being shown everything, and the button is
      right there when they want the island back.
    */
    if(!D.here) window.__home(0);

    /*
      The satellite sheet, added once and then only shown or hidden.

      Adding and removing the SOURCE would re-fetch every tile each time it
      was switched on, which offline means it works once and then does not.
      It is laid over the basemap and under nothing: the pins are HTML
      markers, so they float above whatever the map is drawing.
    */
    map.addSource('sat',{type:'raster',tiles:[SAT],tileSize:256,maxzoom:19,attribution:SAT_CREDIT});
    map.addLayer({id:'sat',type:'raster',source:'sat',layout:{visibility:'none'}});
    var on=false, btn=document.getElementById('sat');
    // Hidden, not removed: the outer button still clicks it, so it stays the
    // one place that knows whether the satellite is on.
    if(!D.inlineSatellite) btn.style.display='none';
    btn.addEventListener('click',function(){
      on=!on;
      map.setLayoutProperty('sat','visibility',on?'visible':'none');
      btn.className=on?'on':'';
      post({type:'satellite',on:on});
    });
    /*
      One owner for "is the satellite on", and it is the button above.

      The expanded map draws its OWN satellite button, pinned to the screen
      because this one scrolls off a canvas twice the viewport - and two
      buttons each holding their own boolean is two answers to one question.
      The outer one clicks this one instead.
    */
    window.__sat=function(){ btn.click(); };
    D.pins.forEach(function(p){
      var el=document.createElement('div');
      el.className='pin'+(p.highlighted?' recommended':'');
      el.setAttribute('aria-label',p.label);
      el.style.setProperty('--marker-colour',p.colour);
      el.innerHTML='<span class="pin-tail"></span><span class="pin-core">'+p.html+'</span>';
      el.addEventListener('click',function(){ post({type:'select',id:p.id}); });
      new maplibregl.Marker({element:el}).setLngLat([p.lng,p.lat]).addTo(map);
    });
    var recommended=D.pins.filter(function(p){return p.highlighted;});
    if(recommended.length>1){
      var bounds=new maplibregl.LngLatBounds();
      recommended.forEach(function(p){bounds.extend([p.lng,p.lat]);});
      map.fitBounds(bounds,{padding:54,maxZoom:14,duration:0});
    }else if(recommended.length===1){
      map.easeTo({center:[recommended[0].lng,recommended[0].lat],zoom:14,duration:0});
    }
    D.shopPins.forEach(function(p){
      var el=document.createElement('button');
      el.type='button'; el.className=p.approximate?'shop-pin approx':'shop-pin';
      el.setAttribute('aria-label',p.category+': '+p.name+(p.approximate?'. '+p.note:''));
      el.style.setProperty('--marker-colour',p.colour);
      el.innerHTML='<span class="shop-pin-tail"></span><span class="shop-pin-core">'+p.svg+'</span>'+(p.approximate?'<span class="approx-badge" aria-hidden="true">?</span>':'');
      el.addEventListener('click',function(){ post({type:'selectShop',id:p.id}); });
      new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([p.lng,p.lat]).addTo(map);
    });
    if(D.here){
      var me=document.createElement('div'); me.className='me';
      new maplibregl.Marker({element:me}).setLngLat([D.here.lng,D.here.lat]).addTo(map);
    }
  });
}
var s=document.createElement('script');
s.src='${MAPLIBRE_JS}';
s.onload=start;
s.onerror=function(){ post({type:'error',error:'maplibre script unavailable offline'}); };
document.head.appendChild(s);
</script>
</body></html>`;
}

/**
 * The map, and what to show instead when it cannot be one.
 *
 * `onFallback` fires when MapLibre itself could not start - the library is
 * fetched from a CDN, and the first run of a cold install with no signal has
 * nothing to fetch it from. The caller draws the SVG island in that case,
 * which is why that drawing is kept rather than deleted.
 */
export function WebTerrainMap({
  area, places, highlightedPlaceIds, onSelect, shops = [], onSelectShop, here, height, hour = 12, explored = [], inlineSatellite = true, handleRef, onFallback,
}: WebTerrainMapProps & { onFallback?: () => void }) {
  const web = React.useRef<WebView>(null);
  // `true;` on the end: injectJavaScript warns about a non-boolean result.
  const zoom = React.useCallback((by: number) => {
    web.current?.injectJavaScript(`window.__zoom&&window.__zoom(${by});true;`);
  }, []);
  React.useImperativeHandle(handleRef, () => ({
    zoomIn: () => zoom(1),
    zoomOut: () => zoom(-1),
    toggleSatellite: () => { web.current?.injectJavaScript('window.__sat&&window.__sat();true;'); },
    recentre: () => { web.current?.injectJavaScript('window.__home&&window.__home();true;'); },
  }), [zoom]);
  const byId = React.useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const shopsById = React.useMemo(() => new Map(shops.map((shop) => [shop.id, shop])), [shops]);

  const html = React.useMemo(() => {
    const centre: [number, number] = here
      ? [here.lng, here.lat]
      : [area.center.lng, area.center.lat];
    return page(
      chivagoStyle(hour),
      places.map((p) => ({
        id: p.id, lat: p.lat, lng: p.lng,
        label: `${t(p.name)}, ${t({ en: 'category pin', th: 'หมุดแยกตามประเภท', zh: '分类图钉' })}`,
        colour: placeMarkerVisual(p).colour,
        html: placeMarkerHtml(p),
        highlighted: highlightedPlaceIds?.has(p.id) ?? false,
      })),
      // Every service, one pin: `servicePoints` stands the unpinned ones on
      // the area's ring and flags them, and the page draws them dashed.
      // Guides are people, not places, and have no pin; see `isGuide`.
      servicePoints(mappable(shops), area.center, area.bbox).map((spot) => {
        const shop = spot.source;
        const visual = shopMarkerVisual(shop.category);
        return {
          id: shop.id, lat: spot.lat, lng: spot.lng, name: shop.name, category: shop.category,
          colour: visual.colour, svg: shopMarkerSvg(shop.category),
          approximate: spot.approximate,
          note: spot.approximate ? t(UNPINNED_NOTE) : '',
        };
      }),
      centre,
      here,
      area.bbox,
      inlineSatellite,
    );
    // `here` moves constantly while watched; re-rendering the whole document
    // for every fix would tear the map down mid-pan. The dot is placed from
    // the position the map STARTED with, and the map is not rebuilt for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area.key, places, highlightedPlaceIds, shops, hour]);

  const onMessage = React.useCallback((event: WebViewMessageEvent) => {
    let message: { type?: string; id?: string; error?: string };
    try { message = JSON.parse(event.nativeEvent.data) as typeof message; } catch { return; }
    if (message.type === 'select' && message.id) {
      const place = byId.get(message.id);
      if (place) onSelect(place);
    } else if (message.type === 'selectShop' && message.id) {
      const shop = shopsById.get(message.id);
      if (shop) onSelectShop?.(shop);
    } else if (message.type === 'error') {
      // One honest exit: the drawing below still carries the pins.
      onFallback?.();
    }
  }, [byId, shopsById, onSelect, onSelectShop, onFallback]);

  return (
    <View style={{ height, backgroundColor: color.brandSoft }}>
      <WebView
        ref={web}
        originWhitelist={['*']}
        source={{ html, baseUrl: ORIGIN }}
        onMessage={onMessage}
        onError={() => onFallback?.()}
        // The map handles its own gestures; the WebView must not eat them.
        scrollEnabled={false}
        bounces={false}
        javaScriptEnabled
        domStorageEnabled
        // Cache-first for the shell, so a cold offline start has a chance.
        cacheEnabled
        androidLayerType="hardware"
        style={{ flex: 1, backgroundColor: color.brandSoft }}
      />
      {/*
        The legend is drawn OVER the map, in React Native, not inside the
        document. It is the area's average score and how much of it has been
        reached - a fact about the screen, not about whichever thing is
        drawing the island - and the SVG map has always carried it. Putting
        it in the HTML would have made a second copy to keep in step, and
        would have hidden it from every test that reads this screen.
      */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} pointerEvents="box-none">
        <MapLegend places={places} explored={explored} />
      </View>
    </View>
  );
}
