import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ACTIVE_QUESTS, AREAS, PLACE_COURTS, SEED_PLACES, inArea } from '@chivago/core';
import { demoCourts } from '../src/demo/courts.ts';
import { demoQuestDetail, demoQuestList } from '../src/demo/quests.ts';

/**
 * The public demo replays a snapshot (src/demo/fixtures.json), and a snapshot
 * falls behind the seed without a sound.
 *
 * It did. RMUTT and KU Bangkhen went into the seed and their chips onto Home,
 * and the demo opened both onto an empty campus: the snapshot still held the
 * ten places it was taken with. KU Sriracha's sixth place was never in it, and
 * its two quests were listed and would not open. A place or a quest added to
 * the seed now fails here until the demo is captured again
 * (apps/api/src/capture-demo.ts, which reads its routes from the same seed).
 */

const snapshot = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'src', 'demo', 'fixtures.json'), 'utf8'),
) as Record<string, unknown>;
const places = snapshot['/places'] as { id: string; lat: number; lng: number }[];

describe('the public demo has what the seed has', () => {
  test('EVERY AREA A TRAVELLER CAN PICK SHOWS ALL ITS PLACES IN THE DEMO', () => {
    for (const area of AREAS) {
      const seeded = SEED_PLACES.filter((p) => inArea(area, p)).map((p) => p.id).sort();
      const shown = places.filter((p) => inArea(area, p)).map((p) => p.id).sort();
      assert.ok(seeded.length > 0, `${area.key} has no seeded places at all`);
      assert.deepEqual(shown, seeded,
        `${area.key}: the demo shows ${shown.length} of its ${seeded.length} places - capture the demo again`);
    }
  });

  test('every seeded place opens, with its reviews, air history and stories', () => {
    for (const p of SEED_PLACES) {
      for (const route of [`/places/${p.id}`, `/places/${p.id}/reviews`, `/places/${p.id}/history`, `/places/${p.id}/stories`]) {
        assert.ok(route in snapshot, `${route} is not in the demo snapshot`);
      }
    }
  });

  test('only the active Koh Sichang quests list and open', () => {
    assert.deepEqual(demoQuestList().quests.map((q) => q.id).sort(), ACTIVE_QUESTS.map((q) => q.id).sort());
    for (const quest of ACTIVE_QUESTS) {
      assert.equal(demoQuestDetail(quest.id)?.quest.id, quest.id, `${quest.id} does not open in the demo`);
    }
    assert.equal(demoQuestDetail('q1'), null, 'a retired quest still opens in the demo');
  });

  test('every place shows the demo the same picture the seed gives it', () => {
    // A photograph added to the seed and not captured leaves the demo showing
    // the placeholder, which reads as "nobody has licensed one" when somebody
    // has. The URL is the whole claim, so the URL is what is compared.
    const rows = new Map(places.map((p) => [p.id, p as { id: string; photo?: { url: string } | null }]));
    for (const p of SEED_PLACES) {
      const row = rows.get(p.id);
      assert.ok(row, `${p.id} is not in the demo at all`);
      assert.equal(row.photo?.url ?? null, p.photo?.url ?? null,
        `${p.id}: the demo's picture is not the seed's - capture the demo again`);
    }
  });

  test('every venue with live court counts is in the demo, and the demo invents none', () => {
    for (const [placeId, src] of Object.entries(PLACE_COURTS)) {
      assert.ok(places.some((p) => p.id === placeId),
        `${placeId} reports court counts but is not in the demo - capture the demo again`);
      // The demo answers this route rather than replaying it, so it is not in
      // the snapshot. What it answers must name the venue and claim no figure:
      // a captured "2 courts free" would be shown as if it were now.
      const demo = demoCourts(placeId);
      assert.equal(demo.provider, src.provider, placeId);
      assert.equal(demo.provenance, 'stale', `${placeId}: the demo never calls a count live`);
      assert.equal(demo.observedAt, null, `${placeId}: the demo never dates a count it did not read`);
      assert.equal(demo.count, null, `${placeId}: the demo must show no count, not a nought`);
    }
  });
});
