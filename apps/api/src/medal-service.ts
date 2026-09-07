/**
 * Medals, from the record.
 *
 * The rules live in core (`medals.ts`); this is the one place they meet the
 * database. What they are fed is the same `explored` list the map's mist and
 * the passport read - the geofenced check-ins in the ledger, each place once
 * - and every place the seed knows, so an "every place in the area" medal
 * means exactly that.
 */

import { medalsView, type MedalsView } from '@chivago/core';
import { rows, type DB } from './db.ts';
import { exploredFor } from './visit-service.ts';

export function medalsFor(db: DB, userId: string): MedalsView {
  const places = rows<{ id: string; province: string }>(
    db.prepare('SELECT id, province FROM places').all(),
  );
  return medalsView(exploredFor(db, userId).places, places);
}
