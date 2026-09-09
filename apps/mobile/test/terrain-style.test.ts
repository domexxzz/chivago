import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  CROWD_M, DRIFT, FOG_BOUNDS, FOG_CORNERS, HERO, PIN_NUDGE_PX, QUEST_FAN_PX, QUEST_MARK_OFFSET, REVEAL_M,
  MAX_PITCH, ROUTE_DASH, ROUTE_PHASES, SAMUI_BOUNDS, SWELLS, SWELL_FPS, SWELL_PX, WIND, chivagoStyle, cloudField,
  CAMPUS_FRAME_PX, CAMPUS_FRAME_ZOOM, CAMPUS_ZOOM_RANGE, campusZoom,
  crest, crowdOffsets, heroPose, introPose, landColours, paletteFor, questMark, questOffsets, revealedPoints, reveals,
  routeDash, settleEasing, swell,
} from '../src/components/terrain-style.ts';
import { exploredCount } from '../src/components/map-parts.tsx';
import {
  EDGE_NUDGE_MAX_PX, HALO_MAX_M, HALO_MIN_M, LABEL_GAP_PX, boxesOverlap, edgeNudge, edgeNudgeTop, haloMetres, insideSamui,
  metreRing, tightPins,
} from '../src/components/map-geometry.ts';
import { SUNRISE, SUNSET, dayArc, hourFrom, hueOf, luminance, mix } from '../src/components/island-clock.ts';
import { lightingFor } from '../src/components/creature3d/rig.ts';
import { heroHeight } from '../src/components/SamuiMap.tsx';
import { SAMUI_BBOX, type QuestProgress } from '@chivago/core';
import { color } from '../src/theme/index.ts';

/**
 * The web hero's style, held to the rules it was drawn under.
 *
 * The map itself needs a browser and a GPU; the STYLE is data, and data can
 * be checked here. What these prove is that the rules survive the next person
 * who "just tweaks a colour".
 */

const style = chivagoStyle();
const layer = (id: string, from = style) => {
  const found = from.layers.find((l) => l.id === id);
  assert.ok(found, `no layer '${id}'`);
  return found;
};

/** A day's worth of hours: dawn, morning, noon, afternoon, dusk, night. */
const HOURS = [0, 3, 6.25, 8, 12, 15, 17.5, 18.4, 19, 21, 23.9];

describe('green is for verified evidence, and nothing on the map wears it', () => {
  test('no layer uses any green from the accent ramp, at any hour', () => {
    // `accent2` is the red. Everything else called accent is the green a host
    // verified, and a forest in it would spend that meaning on trees.
    const greens = Object.entries(color)
      .filter(([name]) => /^accent$|^accent[1-9]00$/.test(name))
      .map(([, hex]) => hex.toLowerCase());
    assert.ok(greens.length >= 5, 'the green ramp should exist');

    for (const hour of HOURS) {
      for (const l of chivagoStyle(hour).layers) {
        const painted = JSON.stringify({ paint: l.paint, layout: l.layout }).toLowerCase();
        for (const green of greens) {
          assert.ok(!painted.includes(green), `at ${hour}h, layer '${l.id}' is painted ${green}`);
        }
      }
    }
  });

  test("the island's greens are olive, held twenty-five degrees of hue from the evidence emerald", () => {
    // A jungle is green. The rule is not "no green"; it is that a forest and
    // a verified score must never be the same green - so every land colour
    // in every hour's palette sits well to the yellow side of the accent.
    const emerald = hueOf(color.accent);
    for (const hour of HOURS) {
      for (const hex of landColours(paletteFor(hour))) {
        const gap = Math.abs(hueOf(hex) - emerald);
        assert.ok(Math.min(gap, 360 - gap) >= 25, `at ${hour}h, ${hex} (hue ${hueOf(hex).toFixed(0)}) is too close to the evidence green (hue ${emerald.toFixed(0)})`);
      }
    }
  });
});

describe('the map is lit by the island clock', () => {
  test('the sun rises at six and sets at half past, the same clock the companion room keeps', () => {
    assert.equal(SUNRISE, 6);
    assert.equal(SUNSET, 18.5);
    assert.equal(dayArc(5.9).day, false);
    assert.equal(dayArc(6).day, true);
    assert.equal(dayArc(18.4).day, true);
    assert.equal(dayArc(18.5).day, false);
    assert.ok(dayArc(12.25).arc > 0.99, 'noon is the top of the arc');
    assert.ok(dayArc(6.5).golden > 0.6 && dayArc(12).golden === 0, 'golden at the edges, none at noon');
    // The room and the map cannot disagree: the rig reads the same arc.
    assert.equal(lightingFor(23).glowVisible, true);
    assert.equal(lightingFor(12).glowVisible, false);
  });

  test('night is darker than noon, dawn is warmer, and the sea is never lighter than the sand', () => {
    const noon = paletteFor(12), dawn = paletteFor(6.5), night = paletteFor(22);
    assert.equal(noon.night, false);
    assert.equal(night.night, true);
    assert.ok(luminance(night.sea) < luminance(noon.sea));
    assert.ok(luminance(night.sky) < luminance(noon.sky));
    assert.ok(luminance(night.lowland) < luminance(noon.lowland));
    const warmth = (hex: string) => parseInt(hex.slice(1, 3), 16) - parseInt(hex.slice(5, 7), 16);
    assert.ok(warmth(dawn.sky) > warmth(noon.sky), 'a dawn sky is peach, a noon sky is blue');
    assert.ok(warmth(dawn.highlight) > warmth(noon.highlight), 'the low sun is gold');
    for (const hour of HOURS) {
      const p = paletteFor(hour);
      assert.ok(luminance(p.sea) < luminance(p.sand), `at ${hour}h the sea outshines the beach`);
      assert.ok(luminance(p.ink) !== luminance(p.halo), `at ${hour}h a label has no contrast with its halo`);
    }
  });

  test('a night map is not a cellar: the labels invert and the shallows still read', () => {
    const night = paletteFor(21);
    assert.ok(luminance(night.ink) > luminance(night.halo), 'light ink on a dark halo after dark');
    assert.ok(luminance(paletteFor(12).ink) < luminance(paletteFor(12).halo));
    assert.ok(luminance(night.shallow) > luminance(night.deep), 'the reef flat is paler than the deep, even by moonlight');
  });

  test('the hillshade sun moves: east in the morning, west in the evening, fixed to the map', () => {
    const hill = (h: number) => layer('hillshade', chivagoStyle(h)).paint as Record<string, unknown>;
    assert.ok((hill(7)['hillshade-illumination-direction'] as number) < 120, 'morning light from the east');
    assert.ok((hill(17)['hillshade-illumination-direction'] as number) > 240, 'evening light from the west');
    assert.equal(hill(12)['hillshade-illumination-anchor'], 'map');
    assert.equal(paletteFor(12).illumination, paletteFor(12.0).illumination);
  });

  test('hours wrap, and mixing is a straight line', () => {
    assert.deepEqual(paletteFor(25), paletteFor(1));
    assert.deepEqual(paletteFor(-2), paletteFor(22));
    assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
    assert.equal(mix('#102030', '#102030', 0.3), '#102030');
  });

  test('`?hour=` is an override, and a typo is not midnight', () => {
    assert.equal(hourFrom('?hour=13'), 13);
    assert.equal(hourFrom('?x=1&hour=6.5'), 6.5);
    assert.equal(hourFrom(''), null);
    assert.equal(hourFrom('?hour='), null);
    assert.equal(hourFrom('?hour=noon'), null);
  });
});

describe('the land is coloured by its real height', () => {
  test('a colour-relief layer reads the terrarium elevation and sits under the hillshade and the sea', () => {
    const relief = layer('relief') as { type: string; source: string; paint: Record<string, unknown> };
    assert.equal(relief.type, 'color-relief');
    const src = style.sources[relief.source] as { type: string; encoding?: string };
    assert.equal(src.type, 'raster-dem');
    assert.equal(src.encoding, 'terrarium');
    const order = style.layers.map((l) => l.id);
    assert.ok(order.indexOf('relief') < order.indexOf('hillshade'));
    assert.ok(order.indexOf('relief') < order.indexOf('sea'));
  });

  test('the stops climb from the reef to the top of Khao Pom, and the top is the real height', () => {
    const relief = layer('relief') as { paint: { 'color-relief-color': unknown[] } };
    const expr = relief.paint['color-relief-color'];
    const stops = expr.slice(3).filter((_, i) => i % 2 === 0) as number[];
    for (let i = 1; i < stops.length; i += 1) assert.ok(stops[i]! > stops[i - 1]!, 'stops must ascend');
    assert.ok(stops[0]! < 0, 'there is bathymetry');
    const top = stops[stops.length - 1]!;
    assert.ok(top >= 630 && top <= 660, `Khao Pom is 635 m; the top stop is ${top}`);
  });

  test('the mountain is exaggerated, and it says by how much', () => {
    assert.ok(HERO.exaggeration >= 1 && HERO.exaggeration <= 2.5, 'a hill, not an alp');
  });

  test('buildings stand up only when the camera is close enough for a house to be a house', () => {
    const b = layer('buildings') as { type: string; minzoom?: number };
    assert.equal(b.type, 'fill-extrusion');
    assert.ok((b.minzoom ?? 0) >= 12);
  });

  test('the ferry lines are dotted routes, not roads across the sea', () => {
    const ferry = layer('ferry') as { paint: Record<string, unknown> };
    const dash = ferry.paint['line-dasharray'] as number[];
    assert.ok(dash[0]! < dash[1]!, 'a dot and a gap');
  });
});

describe('what a quest\'s mark says', () => {
  const at = (stage: QuestProgress['stage'], rejectedAt: string | null = null): QuestProgress => ({
    questId: 'q', userId: 'u', stage, joinedAt: '2026-09-01', arrivedAt: null, proofSubmittedAt: null,
    verifiedAt: null, rejectedAt, rejectionReason: null,
  });

  test('open until joined, active while it is yours, done only once a host verified', () => {
    assert.equal(questMark(undefined), 'open');
    assert.equal(questMark(null), 'open');
    assert.equal(questMark(at('joined')), 'active');
    assert.equal(questMark(at('arrived')), 'active');
    assert.equal(questMark(at('proof_submitted')), 'active');
    assert.equal(questMark(at('host_verification')), 'active');
    assert.equal(questMark(at('complete')), 'done');
  });

  test('a rejected proof puts the X back on the chart', () => {
    assert.equal(questMark(at('proof_submitted', '2026-09-02')), 'open');
  });

  test('the mark stands beside the place it shares a point with, not under it', () => {
    const [dx, dy] = QUEST_MARK_OFFSET;
    assert.ok(dx > 0 && dy > 0 && Math.hypot(dx, dy) < 40);
  });

  test('three quests on one beach are three marks in a row, and a quest alone keeps its place', () => {
    const chaweng = { lat: 9.5357, lng: 100.0617 };
    const fan = questOffsets([
      { id: 'a', ...chaweng },
      { id: 'b', lat: chaweng.lat + 0.001, lng: chaweng.lng },
      { id: 'c', lat: chaweng.lat, lng: chaweng.lng + 0.002 },
      { id: 'far', lat: 9.4179, lng: 99.9433 },
    ]);
    assert.deepEqual(fan.get('far'), QUEST_MARK_OFFSET, 'Thong Krut is on its own');
    const xs = ['a', 'b', 'c'].map((id) => fan.get(id)![0]);
    assert.deepEqual(xs, [QUEST_MARK_OFFSET[0] - QUEST_FAN_PX, QUEST_MARK_OFFSET[0], QUEST_MARK_OFFSET[0] + QUEST_FAN_PX]);
    for (const id of ['a', 'b', 'c']) assert.equal(fan.get(id)![1], QUEST_MARK_OFFSET[1], 'fanned sideways, not down');
    assert.ok(QUEST_FAN_PX >= 40, 'a mark is 38 px wide; the fan must clear it');
  });

  test('the golden hour is visible: half past five is warmer than one o\'clock, by a margin', () => {
    const warmth = (hex: string) => parseInt(hex.slice(1, 3), 16) - parseInt(hex.slice(5, 7), 16);
    const one = paletteFor(13), late = paletteFor(17.5);
    assert.ok(warmth(late.sand) - warmth(one.sand) > 40, 'the sand is gilded');
    assert.ok(warmth(late.highlight) - warmth(one.highlight) > 60, 'the low sun is gold');
    assert.ok(luminance(late.sea) < luminance(one.sea) + 0.02, 'the sea does not brighten at dusk');
  });
});

describe('the camera keeps turning, for a while', () => {
  test('the drift is slow, bounded, and short of a full turn', () => {
    assert.ok(DRIFT.degrees > 0 && DRIFT.degrees < 90);
    assert.ok(DRIFT.ms >= 20_000 && DRIFT.ms <= 90_000);
    // Degrees per second: slower than a clock's second hand.
    assert.ok(DRIFT.degrees / (DRIFT.ms / 1000) < 1);
  });

  test('the hero grows with the screen and stops where the list is still in view', () => {
    assert.equal(heroHeight(390), 344);
    assert.ok(heroHeight(1024) > 344 && heroHeight(1024) < 560);
    assert.equal(heroHeight(1900), 560);
  });
});

describe('the coastline is real, and drawn the right way up', () => {
  test('the land is the background and the sea is a fill over it', () => {
    // OpenMapTiles has no land polygon. Getting this backwards renders the
    // whole island as sea - which is exactly what the first version did.
    assert.equal(style.layers[0]?.type, 'background');
    const sea = layer('sea');
    assert.equal(sea.type, 'fill');
    assert.equal((sea as { 'source-layer'?: string })['source-layer'], 'water');
  });

  test('the sea covers the hillshade, so the elevation model cannot shade the water', () => {
    const order = style.layers.map((l) => l.id);
    assert.ok(order.indexOf('hillshade') < order.indexOf('sea'));
  });

  test('the 3D mesh and the hillshade read separate elevation sources', () => {
    // One shared source makes MapLibre warn that quality suffers. Two names
    // for the same tiles cost nothing: the browser cache serves the second.
    const hill = layer('hillshade') as { source?: string };
    assert.notEqual(hill.source, 'terrain');
    for (const id of ['terrain', hill.source!]) {
      const src = style.sources[id] as { type: string; encoding?: string };
      assert.equal(src.type, 'raster-dem', `${id} should be elevation`);
      assert.equal(src.encoding, 'terrarium', `${id}: the wrong encoding renders plausible wrong heights`);
    }
  });
});

describe('what the labels say', () => {
  const labels = layer('place-labels') as { filter?: unknown; layout?: { 'text-field'?: unknown } };
  const textField = JSON.stringify(labels.layout?.['text-field']);
  const filter = JSON.stringify(labels.filter);

  test('place names lead in English, fall back to Latin, then to whatever there is', () => {
    assert.ok(textField.includes('["coalesce",["get","name:en"],["get","name:latin"],["get","name"]]'));
  });

  test('the "Baan" that OpenStreetMap prefixes to a village is dropped, so the label matches the pin', () => {
    // Chaweng, not Baan Chaweng: the pin says CHAWENG and so does everybody.
    assert.ok(textField.includes('"Baan "'), 'the five-letter prefix');
    assert.ok(textField.includes('"Ban "'), 'and the four-letter spelling of the same word');
  });

  test('only places with an English name are labelled', () => {
    assert.ok(filter.includes('["has","name:en"]'));
  });

  test('"Moo N" - administrative village number N - is not a place name and is not shown', () => {
    assert.ok(filter.includes('"Moo "'));
  });
});

describe('free, and stays free', () => {
  test('no source URL carries a key or token', () => {
    const urls = Object.values(style.sources).flatMap((s) => {
      const src = s as { url?: string; tiles?: string[] };
      return [src.url, ...(src.tiles ?? [])].filter((u): u is string => !!u);
    });
    assert.ok(urls.length >= 3);
    for (const url of urls) {
      assert.doesNotMatch(url, /key=|token=|access_token|apikey/i, url);
    }
    assert.match(style.glyphs ?? '', /^https:\/\/tiles\.openfreemap\.org\//);
  });
});

describe('pins that share a coast', () => {
  const chaweng = { id: 'chaweng', lat: 9.531, lng: 100.062 };
  const fishermans = { id: 'fishermans', lat: 9.556, lng: 100.045 };
  const thongKrut = { id: 'thong-krut', lat: 9.416, lng: 99.972 };

  test('two pins a beach apart are pushed apart, north up and south down', () => {
    const nudge = crowdOffsets([chaweng, fishermans, thongKrut]);
    assert.deepEqual(nudge.get('fishermans'), [0, -PIN_NUDGE_PX]);
    assert.deepEqual(nudge.get('chaweng'), [0, PIN_NUDGE_PX]);
  });

  test('a pin on its own is left exactly on its place', () => {
    const nudge = crowdOffsets([chaweng, fishermans, thongKrut]);
    assert.equal(nudge.has('thong-krut'), false, 'Thong Krut is 15 km from anything');
  });

  test('the crowd radius is a few kilometres, not the whole island', () => {
    assert.ok(CROWD_M >= 3000 && CROWD_M <= 6000);
  });
});

describe('where the camera sits', () => {
  test('the settled pose is lifted from the flat fit, inside the island, at a pitch MapLibre allows', () => {
    const pose = heroPose(10.2);
    assert.ok(Math.abs(pose.zoom - (10.2 + HERO.zoomAboveFlat)) < 1e-9);
    // MapLibre clamps pitch to 60 by default and asking for more silently
    // gets less; the map raises the ceiling to MAX_PITCH, and the hero
    // sits above sixty so the horizon is in the frame, and below the ceiling.
    assert.ok(pose.pitch > 60 && pose.pitch <= MAX_PITCH, 'the sky is in view');
    assert.ok(MAX_PITCH <= 85, 'MapLibre allows no more');
    const [lng, lat] = pose.center;
    assert.ok(lng > SAMUI_BBOX.minLng && lng < SAMUI_BBOX.maxLng);
    assert.ok(lat > SAMUI_BBOX.minLat && lat < SAMUI_BBOX.maxLat);
  });

  test('the bounds handed to MapLibre are the island, south-west first', () => {
    assert.deepEqual(SAMUI_BOUNDS, [
      [SAMUI_BBOX.minLng, SAMUI_BBOX.minLat],
      [SAMUI_BBOX.maxLng, SAMUI_BBOX.maxLat],
    ]);
  });

  test('the intro starts lower, flatter and further round than where it settles', () => {
    const settled = heroPose(10.2);
    const intro = introPose(settled);
    assert.ok(intro.zoom < settled.zoom, 'further off');
    assert.ok(intro.pitch >= settled.pitch && intro.pitch <= MAX_PITCH, 'lower over the water');
    assert.notEqual(intro.bearing, settled.bearing);
    assert.ok(intro.center[1] < settled.center[1], 'the approach is from the sea to the south');
    // And still inside the box the map is locked to, or the camera snaps.
    assert.ok(intro.center[1] > SAMUI_BBOX.minLat - 0.14 && intro.center[0] < SAMUI_BBOX.maxLng + 0.14);
  });

  test('the settle easing starts at 0, ends at 1 and never overshoots', () => {
    assert.equal(settleEasing(0), 0);
    assert.equal(settleEasing(1), 1);
    let last = 0;
    for (let t = 0; t <= 1; t += 0.05) {
      const v = settleEasing(t);
      assert.ok(v >= last && v <= 1);
      last = v;
    }
  });
});

describe('you are here', () => {
  const CHAWENG = { lat: 9.5357, lng: 100.0617 };

  test('the halo is a closed ring of real ground, the right size', () => {
    // Ground, not pixels: the terrain map is pitched sixty degrees, so a
    // circle of pixels would claim the fix is more certain to the north
    // than to the east.
    const ring = metreRing(CHAWENG, 100);
    assert.deepEqual(ring[0], ring[ring.length - 1], 'the ring is not closed');
    const R = 6_371_000, toRad = (d: number) => (d * Math.PI) / 180;
    for (const [lng, lat] of ring) {
      const dLat = toRad(lat - CHAWENG.lat), dLng = toRad(lng - CHAWENG.lng);
      const h = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(CHAWENG.lat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
      const metres = 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
      assert.ok(Math.abs(metres - 100) < 1, `a point ${metres.toFixed(1)} m out, not 100`);
    }
  });

  test('the halo has a floor and a ceiling', () => {
    // A fix claiming three metres is being optimistic, and a halo that small
    // is a dot with a rim. A bad indoor fix must not cover the island.
    assert.equal(haloMetres(3), HALO_MIN_M);
    assert.equal(haloMetres(null), HALO_MIN_M);
    assert.equal(haloMetres(9_000), HALO_MAX_M);
    assert.equal(haloMetres(60), 60);
  });

  test('the drawn island only places a traveller who is on it', () => {
    // `project` is linear and unclamped, so a position on the mainland would
    // be placed confidently off the edge of a drawing that does not contain it.
    assert.ok(insideSamui(CHAWENG));
    assert.ok(!insideSamui({ lat: 13.1, lng: 100.92 }), 'KU Sriracha is not on Samui');
    assert.ok(!insideSamui({ lat: 9.5357, lng: 101.5 }));
  });
});

/**
 * Naming the pins.
 *
 * A pin used to show a score and nothing else on a phone, which told a
 * traveller the air was good somewhere and left them to tap five pins to
 * find out where. Every pin carries its name now, and this is the rule that
 * keeps that from turning the map into a pile of overlapping words.
 *
 * The map itself needs a browser to measure anything. The DECISION does not:
 * given rectangles, which pin has to give up its name is arithmetic, and
 * arithmetic can be held to account here.
 */
/**
 * The campus, framed by ground rather than by a number.
 *
 * A fixed zoom shows a different amount of the world on every screen. It was
 * chosen against a laptop, and on a phone it cropped the sports fields and
 * the viewpoint clean off the map - which is a worse failure than an
 * unnamed pin, because you cannot tap what is not drawn.
 */
describe('the campus frame', () => {
  test('the width it was judged at gives the zoom it was judged with', () => {
    assert.equal(campusZoom(CAMPUS_FRAME_PX), CAMPUS_FRAME_ZOOM);
  });

  test('a doubling of the frame is worth a zoom level, so the ground is the same', () => {
    // Checked inside the range, which allows only 0.6 either side of the
    // judged zoom - a full doubling runs into the clamp, tested below.
    const near = campusZoom(CAMPUS_FRAME_PX * 1.3);
    const far = campusZoom(CAMPUS_FRAME_PX / 1.3);
    const expected = 2 * Math.log2(1.3);
    assert.ok(Math.abs((near - far) - expected) < 0.02, `${far} to ${near}, wanted ${expected} between`);
  });

  test('a phone stands back, a laptop leans in', () => {
    const phone = campusZoom(390);
    const laptop = campusZoom(900);
    assert.ok(phone < CAMPUS_FRAME_ZOOM, 'a 390px frame is further out than 620px');
    assert.ok(laptop > CAMPUS_FRAME_ZOOM, 'a 900px frame is closer in');
  });

  test('it never backs off until the buildings are a smudge, nor presses its nose to one hall', () => {
    const [floor, ceiling] = CAMPUS_ZOOM_RANGE;
    assert.equal(campusZoom(1), floor);
    assert.equal(campusZoom(100_000), ceiling);
    for (const width of [0, 240, 320, 390, 430, 627, 768, 900, 1440, 2560]) {
      const z = campusZoom(width);
      assert.ok(z >= floor && z <= ceiling, `${width}px gave ${z}`);
    }
  });

  test('a container that has not been measured yet still gets a usable frame', () => {
    // The pose is built inside the mount effect, and a lazy chunk landing in
    // a scroll view can report zero width for one frame.
    assert.equal(campusZoom(0), CAMPUS_FRAME_ZOOM);
  });
});

describe('pins say what they are', () => {
  const box = (left: number, top: number, width: number, height = 22) =>
    ({ left, top, right: left + width, bottom: top + height });

  test('two chips with the sea between them both keep their names', () => {
    const tight = tightPins([
      { id: 'a', rank: 90, named: box(0, 0, 90), slim: box(25, 0, 40) },
      { id: 'b', rank: 80, named: box(300, 0, 90), slim: box(325, 0, 40) },
    ]);
    assert.equal(tight.size, 0);
  });

  test('when two cannot both fit, the better score keeps its name', () => {
    // Chaweng and Fisherman's, near enough on screen to touch.
    const tight = tightPins([
      { id: 'fishermans', rank: 78, named: box(60, 0, 90), slim: box(85, 0, 40) },
      { id: 'chaweng', rank: 86, named: box(0, 0, 90), slim: box(25, 0, 40) },
    ]);
    assert.deepEqual([...tight], ['fishermans']);
  });

  test('a pin that lost its name still takes up room', () => {
    // The score does not vanish, so a third chip has to clear the SLIM box
    // rather than treating the loser as empty ground.
    const tight = tightPins([
      { id: 'a', rank: 90, named: box(0, 0, 90), slim: box(25, 0, 40) },
      { id: 'b', rank: 80, named: box(70, 0, 90), slim: box(95, 0, 40) },
      { id: 'c', rank: 70, named: box(100, 0, 90), slim: box(125, 0, 40) },
    ]);
    assert.deepEqual([...tight].sort(), ['b', 'c']);
  });

  test('nothing is hidden outright - the losers are named, not removed', () => {
    const pins = [
      { id: 'a', rank: 90, named: box(0, 0, 90), slim: box(25, 0, 40) },
      { id: 'b', rank: 80, named: box(10, 0, 90), slim: box(35, 0, 40) },
    ];
    const tight = tightPins(pins);
    // Every id is still a pin on the map; `tight` only ever names the ones
    // that fall back to their score.
    assert.ok(tight.size < pins.length);
  });

  test('a tie resolves the same way every frame', () => {
    const pins = [
      { id: 'zulu', rank: 80, named: box(10, 0, 90), slim: box(35, 0, 40) },
      { id: 'alfa', rank: 80, named: box(0, 0, 90), slim: box(25, 0, 40) },
    ];
    // Same input, either order in: the same pin gives way. A flicker between
    // two equally good places would be worse than either outcome.
    assert.deepEqual([...tightPins(pins)], ['zulu']);
    assert.deepEqual([...tightPins([...pins].reverse())], ['zulu']);
  });

  test('chips that merely graze each other count as touching', () => {
    // They bob by three pixels, so a rectangle measured now is not quite
    // where the same chip sits a second later.
    assert.ok(LABEL_GAP_PX >= 6);
    assert.ok(boxesOverlap(box(0, 0, 90), box(94, 0, 90)), 'four pixels apart is touching');
    assert.ok(!boxesOverlap(box(0, 0, 90), box(120, 0, 90)), 'thirty pixels apart is not');
  });

  test('chips on different rows do not fight', () => {
    assert.ok(!boxesOverlap(box(0, 0, 90), box(0, 40, 90)));
  });

  test('a chip hanging over the edge slides back onto the map', () => {
    const frame = { left: 0, right: 390 };
    // The campus sports fields, nine pixels over the left edge at 390.
    assert.equal(edgeNudge({ left: -9, right: 70 }, frame), 9);
    assert.equal(edgeNudge({ left: 320, right: 400 }, frame), -10);
  });

  test('a chip that already fits is left where it is', () => {
    assert.equal(edgeNudge({ left: 40, right: 130 }, { left: 0, right: 390 }), 0);
  });

  /*
    Upright, and only at the top. A pin is anchored at its point, so the
    bottom edge cuts the ground under a mark rather than the mark, and a
    point off the bottom is a place behind the camera.
  */
  test('a pin that has climbed off the top is pushed back down', () => {
    // Building 13, 21 px above the campus frame once its pin wore a photo.
    assert.equal(edgeNudgeTop({ top: 183, bottom: 229 }, { top: 204 }), 21);
  });

  test('a pin already inside is left alone, and one below the top too', () => {
    assert.equal(edgeNudgeTop({ top: 240, bottom: 286 }, { top: 204 }), 0);
  });

  test('a pin far above the frame is left off it rather than dragged down', () => {
    assert.equal(edgeNudgeTop({ top: 20, bottom: 66 }, { top: 204 }), 0);
  });

  test('a chip too far out is left cut off rather than dragged in', () => {
    // Past the cap the honest picture is a clipped label: the place itself
    // is no longer really in the frame, and a name pulled back to the edge
    // would point at nothing.
    const far = edgeNudge({ left: -200, right: -110 }, { left: 0, right: 390 });
    assert.equal(far, 0);
    assert.ok(EDGE_NUDGE_MAX_PX < 200);
  });
});

describe('uncharted: the mist lifts only where they have been', () => {
  test('a visit clears a circle of a walkable size, in the right place on the canvas', () => {
    assert.ok(REVEAL_M >= 500 && REVEAL_M <= 3000, 'a beach and a walk, not a province');
    const centre = {
      lat: (FOG_BOUNDS.minLat + FOG_BOUNDS.maxLat) / 2,
      lng: (FOG_BOUNDS.minLng + FOG_BOUNDS.maxLng) / 2,
    };
    const [c] = reveals([centre], 1000);
    assert.ok(Math.abs(c!.x - 500) < 1 && Math.abs(c!.y - 500) < 1, 'the middle of the box is the middle of the canvas');
    const [big] = reveals([centre], 2000);
    assert.ok(Math.abs(big!.r - c!.r * 2) < 1e-6, 'the radius scales with the canvas, so it is the same size on the ground');
    assert.ok(c!.r > 5 && c!.r < 60, `1.5 km on a 1000 px canvas is a few pixels, not ${c!.r.toFixed(1)}`);
    // North is up: a place further north is higher on the canvas.
    const [n, s] = reveals([{ ...centre, lat: centre.lat + 0.1 }, centre], 1000);
    assert.ok(n!.y < s!.y);
  });

  test('the canvas corners run north-west, north-east, south-east, south-west, as MapLibre wants', () => {
    const [nw, ne, se, sw] = FOG_CORNERS;
    assert.ok(nw[1] === ne[1] && nw[1] > se[1] && se[1] === sw[1]);
    assert.ok(nw[0] === sw[0] && nw[0] < ne[0] && ne[0] === se[0]);
    assert.ok(nw[0] < SAMUI_BBOX.minLng && ne[0] > SAMUI_BBOX.maxLng, 'the mist runs past the island');
  });

  test('the points come from the ledger through the places on screen; an unknown id clears nothing', () => {
    const places = [{ id: 'chaweng', lat: 9.53, lng: 100.06 }, { id: 'lamai', lat: 9.47, lng: 100.05 }];
    assert.deepEqual(revealedPoints([{ placeId: 'lamai' }, { placeId: 'nowhere' }], places), [{ lat: 9.47, lng: 100.05 }]);
    assert.deepEqual(revealedPoints([], places), []);
  });

  test('nothing explored is the truthful start: the count is printed as zero', () => {
    const places = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    assert.equal(exploredCount(places, []), 0);
    assert.equal(exploredCount(places, [{ placeId: 'b', firstAt: 'x', how: 'checkin' }, { placeId: 'zz', firstAt: 'x', how: 'self' }]), 1);
  });
});

describe('the sea moves', () => {
  test('the sea wears the swell pattern', () => {
    const sea = layer('sea') as { paint: Record<string, unknown> };
    assert.equal(sea.paint['fill-pattern'], 'sea-swell');
  });

  test('the pattern tiles: the left edge meets the right and the top meets the bottom', () => {
    for (const t of [0, 1.3, 7.7]) {
      for (let i = 0; i < SWELL_PX; i += 37) {
        assert.ok(Math.abs(swell(0, i, t) - swell(SWELL_PX, i, t)) < 1e-9, `x seam at y=${i}`);
        assert.ok(Math.abs(swell(i, 0, t) - swell(i, SWELL_PX, t)) < 1e-9, `y seam at x=${i}`);
      }
    }
  });

  test('the water is between the trough and the crest, and it moves', () => {
    let changed = false;
    for (let x = 0; x < SWELL_PX; x += 13) {
      for (let y = 0; y < SWELL_PX; y += 17) {
        const a = swell(x, y, 0);
        assert.ok(a >= 0 && a <= 1);
        if (Math.abs(a - swell(x, y, 2)) > 0.05) changed = true;
      }
    }
    assert.ok(changed, 'two seconds later the sea is somewhere else');
    assert.equal(crest(0.5), 0, 'no foam in a trough');
    assert.equal(crest(1), 1, 'full foam on the top of a crest');
    assert.ok(crest(0.9) > 0 && crest(0.9) < 1);
  });

  test('it is water, not a phone-warmer', () => {
    assert.ok(SWELL_FPS >= 8 && SWELL_FPS <= 15);
    assert.ok(SWELL_PX <= 256, 'a stamp, repainted; not a poster');
    const total = SWELLS.reduce((a, s) => a + s.weight, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, 'the weights sum to one so the height stays in range');
    for (const s of SWELLS) assert.ok(Number.isInteger(s.cx) && Number.isInteger(s.cy), 'integer cycles, or it does not tile');
  });
});

describe('the weather', () => {
  test('the same clouds every visit, drifting on the wind, and coming round again', () => {
    assert.deepEqual(cloudField(0), cloudField(0));
    const now = cloudField(0), later = cloudField(10);
    assert.equal(now.length, later.length);
    for (let i = 0; i < now.length; i += 1) {
      for (const c of [now[i]!, later[i]!]) {
        assert.ok(c.x >= 0 && c.x < 1 && c.y >= 0 && c.y < 1, 'wrapped into the box');
        assert.ok(c.rx > 0 && c.ry > 0 && c.ry < c.rx, 'a shadow is wider than it is tall');
        assert.ok(c.depth > 0 && c.depth < 1);
      }
      assert.notEqual(now[i]!.x, later[i]!.x, 'it moved');
    }
    // A full crossing takes a couple of minutes, not a couple of seconds.
    assert.ok(1 / Math.hypot(WIND.x, WIND.y) > 60);
  });

  test('the route dots walk: five phases, each a step along, and back to the start', () => {
    assert.deepEqual(routeDash(0), [...ROUTE_DASH]);
    assert.deepEqual(routeDash(ROUTE_PHASES), routeDash(0));
    const period = ROUTE_DASH[0] + ROUTE_DASH[1];
    for (let p = 1; p < ROUTE_PHASES; p += 1) {
      const d = routeDash(p);
      assert.equal(d.length, 4);
      assert.equal(d[0], 0, 'a zero-length lead is what shifts the phase');
      const total = d.reduce((a, v) => a + v, 0);
      assert.ok(Math.abs(total - period) < 1e-9, 'the period never changes, only the phase');
      assert.ok(d[1]! > routeDash(p - 1)[1]! || p === 1, 'each phase is further along');
    }
  });
});
