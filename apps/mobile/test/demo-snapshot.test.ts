import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AREAS, SEED_PLACES, SEED_QUESTS, inArea } from '@chivago/core';

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

  test('every seeded quest opens', () => {
    for (const q of SEED_QUESTS) assert.ok(`/quests/${q.id}` in snapshot, `/quests/${q.id} is not in the demo snapshot`);
  });
});
