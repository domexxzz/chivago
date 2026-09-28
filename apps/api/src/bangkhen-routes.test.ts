import { strict as assert } from 'node:assert';
import { before, describe, test } from 'node:test';
import { KU_BANGKHEN_BBOX, SAFETY_PHRASES, SEED_HOSTS, SEED_PLACES, SEED_QUESTS } from '@chivago/core';

// Route-level coverage uses its own process and never opens the pilot DB.
delete process.env.CHIVAGO_OPEN_IDENTITY;
process.env.CHIVAGO_DB = ':memory:';
const { app, db } = await import('./server.ts');

const campus = SEED_PLACES.filter((p) => p.province === 'TH-10');
const campusIds = [
  'ku-bk-auditorium', 'ku-bk-canteen', 'ku-bk-library', 'ku-bk-park', 'ku-bk-stadium',
];
const quest = SEED_QUESTS.find((q) => q.id === 'q-ku-bk-walk')!;
const host = SEED_HOSTS.kuBangkhen!;
const { minLng, minLat, maxLng, maxLat } = KU_BANGKHEN_BBOX;
const bbox = `${minLng},${minLat},${maxLng},${maxLat}`;

before(() => {
  assert.deepEqual(campus.map((p) => p.id).sort(), campusIds);
  db.prepare('INSERT INTO hosts (id, name, type, role, created_at) VALUES (?,?,?,?,?)')
    .run(host.id, host.name, host.type, 'host', new Date().toISOString());
  const insertPlace = db.prepare(`
    INSERT INTO places (id, name_en, name_th, short, layer, province, lat, lng, meta,
      blurb_en, blurb_th, tags, safety_label_en, safety_label_th,
      crowd_density, aqi, safety_index, walkability, air_station)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const p of campus) {
    const safety = SAFETY_PHRASES[p.id]!;
    insertPlace.run(
      p.id, p.name.en, p.name.th, p.short, p.layer, p.province, p.lat, p.lng, p.meta,
      p.blurb.en, p.blurb.th, JSON.stringify(p.tags), safety.en, safety.th,
      p.metrics.crowdDensity, p.metrics.aqi, p.metrics.safetyIndex, p.metrics.walkability,
      p.airStation ? JSON.stringify(p.airStation) : null,
    );
  }
  db.prepare(`
    INSERT INTO quests (id, code, name_en, name_th, where_label, where_label_th,
      duration, duration_th, reward_points, reward_currency, host_id, kind, lat, lng, geofence_radius_m)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(quest.id, quest.code, quest.name.en, quest.name.th, quest.where.en, quest.where.th,
      quest.duration.en, quest.duration.th, quest.rewardPoints, quest.rewardCurrency,
      host.id, quest.kind, quest.lat, quest.lng, quest.geofenceRadiusM);
});

const data = async (path: string) => {
  const res = await app.request(path, { headers: { origin: 'http://localhost:8085' } });
  assert.equal(res.status, 200);
  assert.ok(res.headers.get('access-control-allow-origin'), `${path} cannot be read by the app`);
  const body = await res.json() as { ok: boolean; data: any };
  assert.equal(body.ok, true);
  return body.data;
};

describe('Bangkhen over the API', () => {
  test('the campus bounding box returns five scored landmarks without a claimed ground station', async () => {
    const places = await data(`/places?bbox=${bbox}`) as any[];
    assert.deepEqual(places.map((p) => p.id).sort(), campusIds);
    for (const place of places) {
      assert.equal(place.province, 'TH-10');
      assert.equal(place.airStation, null);
      assert.equal(place.photo, null);
      assert.notEqual(place.readings.aqi.source, 'Air4Thai ground station');
      assert.equal(place.readings.crowdDensity.provenance, 'estimated');
    }
  });

  test('the local walk is public, host-named, and awards only Trip Points', async () => {
    const { quests } = await data('/quests') as { quests: any[] };
    const found = quests.find((q) => q.id === quest.id);
    assert.ok(found);
    assert.equal(found.host.id, host.id);
    assert.equal(found.rewardCurrency, 'trip');
    assert.equal(found.geofenceRadiusM, 100);
  });
});
