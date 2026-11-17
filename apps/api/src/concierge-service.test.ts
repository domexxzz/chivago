import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import {
  SAFETY_PHRASES, SEED_PLACES, classifyTravel, emptyConversationContext, type AreaKey,
} from '@chivago/core';
import { gridKey } from './air.ts';
import { conversationFor, conversationHistory } from './concierge-context.ts';
import { processConcierge } from './concierge-service.ts';
import { recommendPlaces } from './place-recommendation.ts';
import { listScoredPlaces } from './repo.ts';
import { openTestDb } from './db-node.ts';
import { groqConciergeConfig } from './groq-concierge.ts';
import { WEATHER_TTL_MS, __resetWeather, getWeather } from './weather.ts';

const NOW = new Date('2026-11-16T08:00:00.000Z');
const OFF = groqConciergeConfig({});

const weatherBody = (url: string): unknown => url.includes('marine-api')
  ? { current: { time: '2026-11-16T15:00', wave_height: 0.2, wave_period: 2.5 } }
  : { current: { time: '2026-11-16T15:00', temperature_2m: 30.5, precipitation: 0.1, wind_speed_10m: 4, weather_code: 2 } };

const weatherFetch: typeof fetch = async (url) => new Response(JSON.stringify(weatherBody(String(url))), {
  status: 200, headers: { 'content-type': 'application/json' },
});

function fixtureDb() {
  const db = openTestDb();
  db.prepare('INSERT INTO users(id,display_name,created_at) VALUES(?,?,?)').run('u1', 'Traveller', NOW.toISOString());
  const insert = db.prepare(`
    INSERT INTO places (id,name_en,name_th,short,layer,province,lat,lng,meta,blurb_en,blurb_th,tags,
      safety_label_en,safety_label_th,crowd_density,aqi,safety_index,walkability)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const place of SEED_PLACES.filter((item) => item.id.startsWith('sc-') || item.province === 'TH-84')) {
    const safety = SAFETY_PHRASES[place.id] ?? { en: 'Town street', th: 'ถนนในเมือง' };
    insert.run(
      place.id, place.name.en, place.name.th, place.short, place.layer, place.province,
      place.lat, place.lng, place.meta, place.blurb.en, place.blurb.th, JSON.stringify(place.tags),
      safety.en, safety.th, place.metrics.crowdDensity, place.metrics.aqi,
      place.metrics.safetyIndex, place.metrics.walkability,
    );
    db.prepare('INSERT OR REPLACE INTO air_cache(grid_key,aqi,pm25,fetched_at) VALUES(?,?,?,?)')
      .run(gridKey(place.lat, place.lng), place.metrics.aqi, null, new Date().toISOString());
  }
  return db;
}

const ask = (
  db: ReturnType<typeof fixtureDb>,
  message: string,
  conversationId: string | null = null,
  over: Partial<Parameters<typeof processConcierge>[2]> = {},
  area: AreaKey = 'koh-sichang',
) => processConcierge(db, {
  userId: 'u1', message, area, conversationId,
  location: { lat: 13.1614, lng: 100.8104, accuracyM: 12 },
}, { groq: OFF, now: NOW, ...over });

describe('hybrid concierge data integration', () => {
  beforeEach(() => __resetWeather());

  test('retrieves restaurant and accommodation records without claiming price or availability', async () => {
    const db = fixtureDb();
    const food = await ask(db, 'หาร้านอาหารใกล้ฉัน');
    assert.equal(food.analysis.intent, 'RESTAURANT');
    assert.deepEqual(food.reply.suggestions.map((item) => item.placeId), ['sc-shops']);
    assert.ok(food.reply.suggestions[0]!.distanceKm !== null);
    assert.equal(food.evidence[0]?.source, 'ChivaGo database');

    const stay = await ask(db, 'หาที่พักบนเกาะ');
    assert.equal(stay.analysis.intent, 'ACCOMMODATION');
    assert.ok(stay.reply.suggestions.some((item) => item.placeId === 'sc-koniix-garden-cottage'));
    assert.match(stay.reply.text, /ยืนยันห้องว่างหรือราคาปัจจุบันไม่ได้/);
    db.close();
  });

  test('labels crowd estimates and last-hour check-ins instead of presenting a live headcount', async () => {
    const db = fixtureDb();
    const result = await ask(db, 'ที่ไหนคนน้อย');
    assert.equal(result.analysis.intent, 'CROWD');
    assert.equal(result.evidence.find((item) => item.kind === 'crowd')?.validity, 'estimated');
    assert.ok(result.reply.suggestions.every((item) => item.crowd?.provenance === 'live-checkins-plus-estimate'));
    assert.ok(result.reply.suggestions.every((item) => item.healthyScore === undefined));
    assert.ok(result.recommendations, 'crowd comparison fell back to legacy health cards');
    assert.match(result.reply.text, /ไม่ใช่จำนวนคนทั้งหมด/);
    db.close();
  });

  test('resolves a verified named destination and hands navigation to the existing router', async () => {
    const db = fixtureDb();
    const found = await ask(db, 'อยากไปหาดถ้ำพัง');
    assert.equal(found.analysis.entities.placeName, 'Tham Phang Beach');
    assert.deepEqual(found.reply.suggestions.map((item) => item.placeId), ['sc-thamphang']);

    const route = await ask(db, 'ไปยังไง', found.conversationId);
    assert.equal(route.analysis.intent, 'NAVIGATION');
    assert.equal(route.reply.action, 'route');
    assert.deepEqual(route.reply.suggestions.map((item) => item.placeId), ['sc-thamphang']);
    assert.match(route.evidence.find((item) => item.kind === 'routing')?.source ?? '', /router opens/);
    db.close();
  });

  test('keeps current, future-unavailable and stale weather provenance distinct', async () => {
    const liveDb = fixtureDb();
    const live = await ask(liveDb, 'วันนี้อากาศเป็นอย่างไร', null, { fetchImpl: weatherFetch });
    assert.equal(live.weather?.provenance, 'live');
    assert.equal(live.evidence.find((item) => item.kind === 'weather')?.validity, 'live');
    liveDb.close();

    __resetWeather();
    const futureDb = fixtureDb();
    const future = await ask(futureDb, 'พรุ่งนี้อากาศเป็นอย่างไร', null, { fetchImpl: weatherFetch });
    assert.match(future.reply.text, /ยังไม่มีพยากรณ์/);
    futureDb.close();

    __resetWeather();
    await getWeather('koh-sichang', { now: Date.now() - WEATHER_TTL_MS - 1_000, fetchImpl: weatherFetch });
    const staleDb = fixtureDb();
    const stale = await ask(staleDb, 'ตอนนี้อากาศเป็นอย่างไร', null, {
      fetchImpl: async () => { throw new Error('weather offline'); },
    });
    assert.equal(stale.weather?.provenance, 'stale');
    assert.equal(stale.evidence.find((item) => item.kind === 'weather')?.validity, 'stale');
    staleDb.close();
  });

  test('honestly falls back on Groq errors and never sends safety through the model', async () => {
    const db = fixtureDb();
    const enabled = groqConciergeConfig({ CHIVAGO_GROQ: 'on', GROQ_API_KEY: 'test-key', GROQ_RETRIES: '0' });
    const failed = await ask(db, 'แนะนำที่เที่ยว', null, {
      groq: enabled,
      fetchImpl: async () => new Response('{}', { status: 503 }),
    });
    assert.equal(failed.source, 'rules');
    assert.equal(failed.retryable, true);
    assert.match(failed.aiNotice ?? '', /Groq ตอบไม่สำเร็จ/);

    let calls = 0;
    const safety = await ask(db, 'ช่วยด้วย มีคนบาดเจ็บ', null, {
      groq: enabled,
      fetchImpl: async () => { calls += 1; throw new Error('must not run'); },
    });
    assert.equal(safety.analysis.intent, 'SAFETY');
    assert.equal(safety.reply.intent, 'emergency');
    assert.equal(calls, 0);
    db.close();
  });

  test('keeps the verified fallback available when the shared Groq quota is full', async () => {
    const db = fixtureDb();
    let fetchCalls = 0;
    const enabled = {
      ...groqConciergeConfig({ CHIVAGO_GROQ: 'on', GROQ_API_KEY: 'test-key', GROQ_RETRIES: '1' }),
      takeQuota: () => false,
    };
    const result = await ask(db, 'แนะนำที่เที่ยว', null, {
      groq: enabled,
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error('must not reach Groq');
      },
    });
    assert.equal(result.source, 'rules');
    assert.equal(result.retryable, false);
    assert.match(result.aiNotice ?? '', /Groq ตอบไม่สำเร็จ/);
    assert.equal(fetchCalls, 0);
    db.close();
  });

  test('does not let Groq override a high-confidence contextual rule', async () => {
    const db = fixtureDb();
    const first = await ask(db, 'แนะนำที่เที่ยวธรรมชาติ');
    const enabled = groqConciergeConfig({ CHIVAGO_GROQ: 'on', GROQ_API_KEY: 'test-key', GROQ_RETRIES: '0' });
    let analysisCalls = 0;
    const result = await ask(db, 'ที่ไหนคนน้อย', first.conversationId, {
      groq: enabled,
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { response_format?: { json_schema?: { name?: string } } };
        if (body.response_format?.json_schema?.name === 'chivago_travel_analysis') {
          analysisCalls += 1;
          return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
            intent: 'TOURISM', confidence: 1, language: 'th',
            entities: { category: null, placeName: null, time: null, budgetBaht: null, travelMode: null, quiet: false, indoor: false, nearMe: false, familyFriendly: false, showMore: false, closest: false },
            contextReference: 'none', requiredActions: [], needsClarification: false, sentiment: 'neutral',
          }) } }] }), { status: 200 });
        }
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ text: 'ข้อมูลความหนาแน่นแสดงบนการ์ดครับ' }) } }] }), { status: 200 });
      },
    });
    assert.equal(analysisCalls, 0);
    assert.equal(result.analysis.intent, 'CROWD');
    assert.equal(result.source, 'groq');
    db.close();
  });

  test('merges context from concurrent requests rather than losing one branch', async () => {
    const db = fixtureDb();
    const [nature, food] = await Promise.all([
      ask(db, 'แนะนำที่เที่ยวธรรมชาติ'),
      ask(db, 'หาร้านอาหาร'),
    ]);
    assert.equal(nature.conversationId, food.conversationId);
    const stored = conversationFor(db, 'u1', 'koh-sichang', nature.conversationId, 'resume', NOW);
    assert.ok(stored.context.preferredCategories.includes('nature'));
    assert.ok(stored.context.preferredCategories.includes('food'));
    assert.ok(stored.context.selectedPlaces.includes('sc-shops'));
    assert.equal(conversationHistory(db, 'u1', nature.conversationId)?.length, 4);
    db.close();
  });

  test('returns structured recommendations made only from ChivaGo place records', async () => {
    const db = fixtureDb();
    const result = await ask(db, 'แนะนำที่เที่ยวบนเกาะ');
    const recommendations = result.recommendations;
    assert.ok(recommendations);
    assert.ok(recommendations.items.length > 0);
    const realIds = new Set(SEED_PLACES.filter((place) => place.id.startsWith('sc-')).map((place) => place.id));
    for (const item of recommendations.items) {
      assert.ok(realIds.has(item.placeId), `invented place ${item.placeId}`);
      assert.equal(item.source.name, 'ChivaGo database');
      assert.equal(item.openingStatus, null, 'opening status was invented');
      assert.ok(item.coordinates.lat >= -90 && item.coordinates.lat <= 90);
      assert.ok(item.coordinates.lng >= -180 && item.coordinates.lng <= 180);
      assert.ok(item.score >= 0 && item.score <= 100);
      const applied = item.scoreBreakdown.reduce((sum, part) => sum + part.appliedWeight, 0);
      assert.ok(Math.abs(applied - 1) < 0.001, `available weights did not normalize: ${applied}`);
      assert.doesNotMatch(`${item.reason.en} ${item.reason.th}`, /Healthy Score|คะแนนสุขภาพ|AQI/i);
    }
    assert.deepEqual(
      new Set(recommendations.items.map((item) => item.placeId)),
      new Set(['sc-thamphang', 'sc-palace', 'sc-marinestation']),
      'operational, safety, accommodation and generic shop records entered Tourism',
    );
    assert.deepEqual(
      result.reply.suggestions.map((item) => item.placeId),
      recommendations.items.map((item) => item.placeId),
    );
    db.close();
  });

  test('keeps destination and real filters through the complete Thai follow-up conversation', async () => {
    const db = fixtureDb();
    const initial = await ask(db, 'แนะนำที่เที่ยวเกาะสีชังหน่อย');
    const initialIds = initial.recommendations?.items.map((item) => item.placeId) ?? [];
    assert.deepEqual(new Set(initialIds), new Set(['sc-thamphang', 'sc-palace', 'sc-marinestation']));
    assert.ok(initial.reply.suggestions.every((item) => item.healthyScore === undefined));

    const nature = await ask(db, 'ขอแบบธรรมชาติ', initial.conversationId);
    assert.equal(nature.analysis.entities.category, 'nature');
    assert.ok((nature.recommendations?.items.length ?? 0) > 0, 'refinement incorrectly excluded previously shown places');
    assert.ok(nature.recommendations?.items.every((item) => !['sc-hospital', 'sc-koniix-garden-cottage'].includes(item.placeId)));

    const waterfall = await ask(db, 'มีน้ำตกไหม', initial.conversationId);
    assert.deepEqual(waterfall.recommendations?.items, []);
    assert.match(waterfall.reply.text, /ยังไม่พบสถานที่จริง/);

    const crowd = await ask(db, 'มีที่ไหนคนไม่เยอะบ้าง', initial.conversationId);
    assert.equal(crowd.analysis.intent, 'CROWD');
    assert.equal(crowd.analysis.entities.quiet, true);
    assert.ok(crowd.recommendations);
    assert.ok(crowd.reply.suggestions.every((item) => item.healthyScore === undefined));
    assert.equal(crowd.evidence.find((item) => item.kind === 'crowd')?.validity, 'estimated');

    const more = await ask(db, 'ขออีก 3 ที่', initial.conversationId);
    assert.equal(more.analysis.entities.showMore, true);
    const shown = new Set(initialIds);
    assert.ok(more.recommendations?.items.every((item) => !shown.has(item.placeId)));

    const closest = await ask(db, 'ที่ไหนใกล้ที่สุด', initial.conversationId);
    assert.equal(closest.recommendations?.items.length, 1);
    const target = closest.recommendations?.items[0];
    assert.ok(target);

    const route = await ask(db, 'นำทางไปที่นั่น', initial.conversationId);
    assert.equal(route.reply.action, 'route');
    assert.equal(route.reply.suggestions[0]?.placeId, target.placeId);
    assert.match(route.evidence.find((item) => item.kind === 'routing')?.source ?? '', /router opens/);
    db.close();
  });

  test('a named island overrides the open screen area and persists for follow-ups', async () => {
    const db = fixtureDb();
    const samui = await ask(db, 'แนะนำที่เที่ยวเกาะสมุย', null, {}, 'koh-sichang');
    assert.ok((samui.recommendations?.items.length ?? 0) > 0);
    const samuiIds = new Set(SEED_PLACES.filter((place) => place.province === 'TH-84').map((place) => place.id));
    assert.ok(samui.recommendations?.items.every((item) => samuiIds.has(item.placeId)));

    const waterfall = await ask(db, 'มีน้ำตกไหม', samui.conversationId, {}, 'koh-sichang');
    assert.deepEqual(waterfall.recommendations?.items.map((item) => item.placeId), ['namuang']);
    db.close();
  });

  test('supports category, proximity and closest follow-ups without inventing location', async () => {
    const db = fixtureDb();
    const beach = await ask(db, 'Recommend a beach');
    assert.equal(beach.analysis.entities.category, 'beach');
    assert.deepEqual(beach.recommendations?.items.map((item) => item.placeId), ['sc-thamphang']);

    const nearby = await ask(db, 'Find places near me');
    assert.equal(nearby.analysis.entities.nearMe, true);
    assert.ok(nearby.recommendations?.items.every((item) => item.distanceKm !== null));
    const closest = await ask(db, 'Which one is closest?', nearby.conversationId);
    assert.equal(closest.analysis.entities.closest, true);
    const nearestPrior = [...(nearby.recommendations?.items ?? [])]
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))[0];
    assert.equal(closest.recommendations?.items[0]?.placeId, nearestPrior?.placeId);
    db.close();
  });

  test('show more paginates and never repeats a previously recommended place', async () => {
    const db = fixtureDb();
    const first = await ask(db, 'แนะนำที่เที่ยว');
    assert.equal(first.recommendations?.items.length, 3);
    assert.equal(first.recommendations?.hasMore, false);
    const second = await ask(db, 'ดูสถานที่เพิ่ม', first.conversationId);
    assert.equal(second.analysis.entities.showMore, true);
    const firstIds = new Set(first.recommendations?.items.map((item) => item.placeId));
    assert.ok(second.recommendations?.items.every((item) => !firstIds.has(item.placeId)));
    const third = await ask(db, 'ขอที่เที่ยวธรรมชาติอีก 3 ที่', second.conversationId);
    const allIds = [
      ...(first.recommendations?.items ?? []),
      ...(second.recommendations?.items ?? []),
      ...(third.recommendations?.items ?? []),
    ].map((item) => item.placeId);
    assert.equal(new Set(allIds).size, allIds.length);
    assert.equal(third.recommendations?.hasMore, false);
    assert.deepEqual(third.recommendations?.items, [], 'the service invented extra nature places after the real pool was exhausted');
    db.close();
  });

  /**
   * MEASURED 17 November on Ko Sichang, which has three attractions.
   *
   * Asking for more after the third produced "ยังไม่พบสถานที่จริงในพื้นที่นี้ที่
   * ตรงกับคำขอ" - the sentence for a search that found nothing. To a traveller
   * who has just been shown three places it reads as the island going empty,
   * and the pagination test above passed the whole time because it only
   * checked that the CARDS were empty, never what was said over them.
   */
  test('the end of the list sounds like the end, not like an empty island', async () => {
    const db = fixtureDb();
    const first = await ask(db, 'แนะนำที่เที่ยว');
    assert.equal(first.recommendations?.items.length, 3);

    // The phrasing a person actually uses, not the one the old list held.
    const more = await ask(db, 'แล้วที่อื่นล่ะ', first.conversationId);
    assert.equal(more.analysis.entities.showMore, true, 'a natural follow-up did not count as asking for more');

    const exhausted = await ask(db, 'ขอเพิ่มอีก', more.conversationId);
    assert.deepEqual(exhausted.recommendations?.items ?? [], []);
    assert.match(exhausted.reply.text, /หมดแล้ว/, 'the end of the list must say so');
    assert.doesNotMatch(exhausted.reply.text, /ยังไม่พบสถานที่จริง/, 'an exhausted list is not an empty area');
    db.close();
  });
  test('separates a multi-stop trip recommendation and orders only real attractions', async () => {
    const db = fixtureDb();
    const result = await ask(db, 'ช่วยจัดทริปครึ่งวัน 3 ที่');
    assert.equal(result.analysis.intent, 'TRIP_PLANNING');
    assert.ok(result.tripRecommendation);
    assert.equal(result.tripRecommendation.stops.length, 3);
    assert.deepEqual(result.tripRecommendation.stops.map((stop) => stop.order), [1, 2, 3]);
    assert.deepEqual(
      new Set(result.tripRecommendation.stops.map((stop) => stop.placeId)),
      new Set(['sc-thamphang', 'sc-palace', 'sc-marinestation']),
    );
    assert.equal(result.tripRecommendation.routeStatus, 'calculate-on-map');
    assert.match(result.tripRecommendation.limitation.en, /Routing calculates the actual route/);
    db.close();
  });

  test('states missing GPS, unverified budget and family metadata instead of guessing', async () => {
    const db = fixtureDb();
    const noGps = await processConcierge(db, {
      userId: 'u1', message: 'Recommend nearby places under 500 baht', area: 'koh-sichang', conversationId: null, location: null,
    }, { groq: OFF, now: NOW });
    assert.ok(noGps.recommendations?.items.every((item) => item.distanceKm === null));
    assert.ok(noGps.recommendations?.limitations.some((item) => /Location permission/.test(item.en)));
    assert.ok(noGps.recommendations?.limitations.some((item) => /admission prices/.test(item.en)));

    const family = await ask(db, 'หาที่เที่ยวเหมาะกับเด็กและครอบครัว');
    assert.equal(family.analysis.entities.familyFriendly, true);
    assert.deepEqual(family.recommendations?.items, []);
    assert.ok(family.recommendations?.limitations.some((item) => /explicitly tagged/.test(item.en)));
    db.close();
  });

  test('drops invalid coordinates and does not present missing freshness as zero or current', async () => {
    const db = fixtureDb();
    const real = (await listScoredPlaces(db, 'u1')).find((place) => place.id === 'sc-palace')!;
    const invalid = { ...real, id: 'invalid-coordinate', lat: 999 };
    const stale = {
      ...real,
      id: 'stale-but-valid-record',
      name: { en: 'Stale test record', th: 'ข้อมูลทดสอบเก่า', zh: '旧测试记录' },
      readings: {},
      photo: null,
    };
    const ranked = recommendPlaces({
      places: [invalid, stale],
      analysis: classifyTravel('Recommend a place'),
      context: emptyConversationContext('en'),
      location: null,
      now: NOW,
    });
    assert.deepEqual(ranked.set.items.map((item) => item.placeId), ['stale-but-valid-record']);
    assert.equal(ranked.set.items[0]?.source.lastUpdatedAt, null);
    const freshness = ranked.set.items[0]?.scoreBreakdown.find((part) => part.key === 'freshness');
    assert.equal(freshness?.score, null);
    assert.equal(freshness?.appliedWeight, 0);
    assert.equal(ranked.set.items[0]?.verificationStatus, 'partially-verified');
    db.close();
  });
});
