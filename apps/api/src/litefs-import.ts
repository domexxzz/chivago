/**
 * Lift an existing database into LiteFS, once.
 *
 * LiteFS cannot adopt a file that is already on the volume: it has to be
 * WRITTEN through the FUSE mount so every page enters the LTX log and can be
 * streamed to a replica. Copying `/data/chivago.db` to `/litefs/chivago.db`
 * is exactly that write.
 *
 * Runs before the server, on the lease candidate only (see litefs.yml), and
 * is a no-op the moment the destination exists — so a restart, a redeploy and
 * a replica boot all do nothing.
 *
 * A plain byte copy is enough BECAUSE the source is not being written to at
 * this point: the API process has not started yet, and the -wal/-shm are
 * copied with it. Copying a live SQLite database this way would not be safe,
 * which is why this only ever runs at boot.
 */

import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

const source = process.env.CHIVAGO_IMPORT_FROM ?? '/data/chivago.db';
const target = process.env.CHIVAGO_DB ?? '/litefs/chivago.db';

if (existsSync(target)) {
  console.log(`[litefs] ${target} is already here — nothing to import`);
} else if (!existsSync(source)) {
  // A brand-new deployment. The server creates and migrates its own database.
  console.log(`[litefs] no ${source} to import; starting empty`);
} else {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  // The write-ahead log and shared-memory file belong to the same database.
  // Leaving a -wal behind would strand every transaction it still holds.
  for (const suffix of ['-wal', '-shm']) {
    if (existsSync(source + suffix)) copyFileSync(source + suffix, target + suffix);
  }
  console.log(`[litefs] imported ${statSync(target).size} bytes from ${source}`);
}
