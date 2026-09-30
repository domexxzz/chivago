/**
 * Add one host and print its console key, once.
 *
 *   pnpm --filter @chivago/api host:add -- --id h-trash-hero-samui \
 *     --name "Trash Hero Koh Samui" --type ngo
 *
 * `--example` marks it as a made-up operator rather than a business: every
 * screen showing one of its listings says "Example · not a real business",
 * and it is never given a response time. For walking the flow where no real
 * operator has signed up yet. The mark can be put on but not taken off here.
 *
 * A business that lists stays, boats or tours takes `--type operator`. Its
 * key signs in to a console that reaches its listings and its travellers'
 * questions and nothing else - no review queue, no SOS desk, no statements -
 * and it is left off the host board. docs/62 is the whole runbook.
 *
 * The seed creates the pilot's five hosts. A real organisation joining the
 * pilot is not seed content - putting it in `SEED_HOSTS` before it has agreed
 * would be a fabricated record, and re-running the seed to add it afterwards
 * re-asserts everything else as well. This does the one row, the way the seed
 * does it: only a salted hash is stored, the key is shown here and nowhere
 * else, and a host that already has a key keeps it.
 *
 * The role is always `host`. Moderating reviews is a separate, deliberate
 * UPDATE - see seed-db.ts for why no partner gets it by default.
 */

import { parseArgs } from 'node:util';
import type { QuestHost } from '@chivago/core';
import { openDb, row, type DB } from './db.ts';
import { generateApiKey, hashApiKey } from './host-auth.ts';

/** Kept in step with `QuestHost['type']` by the assignment below it. */
export const HOST_TYPES = ['municipality', 'ngo', 'hotel', 'platform', 'community', 'operator'] as const;
// A compile-time check only: adding a type to core without adding it here fails here.
const _everyHostType: readonly QuestHost['type'][] = HOST_TYPES;
void _everyHostType;

export type HostType = (typeof HOST_TYPES)[number];

export const isHostType = (v: unknown): v is HostType =>
  typeof v === 'string' && (HOST_TYPES as readonly string[]).includes(v);

export function addHost(
  db: DB,
  args: { id: string; name: string; type: HostType; example?: boolean; now?: Date },
): { created: boolean; key: string | null } {
  if (!args.id.trim() || !args.name.trim()) throw new Error('a host needs an id and a name');
  if (!isHostType(args.type)) throw new Error(`type must be one of ${HOST_TYPES.join(', ')}`);

  const before = row<{ api_key_hash: string | null }>(
    db.prepare('SELECT api_key_hash FROM hosts WHERE id = ?').get(args.id),
  );

  /*
    The example mark goes on, and never comes off by accident.

    `MAX` rather than `excluded.example`: re-running this for an existing
    example operator without the flag would otherwise quietly un-label it, and
    the app would start presenting a made-up boat co-op as a business. Taking
    the mark off is a deliberate UPDATE by somebody who means it.
  */
  db.prepare(
    `INSERT INTO hosts (id, name, type, role, created_at, example) VALUES (?, ?, ?, 'host', ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type,
       example = MAX(hosts.example, excluded.example)`,
  ).run(args.id, args.name, args.type, (args.now ?? new Date()).toISOString(), args.example ? 1 : 0);

  if (before?.api_key_hash) return { created: false, key: null };

  const key = generateApiKey();
  db.prepare('UPDATE hosts SET api_key_hash = ? WHERE id = ?').run(hashApiKey(key), args.id);
  return { created: before === undefined, key };
}

// CLI entry. Guarded so the test harness can import `addHost` without running it.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('/add-host.ts')) {
  const { values } = parseArgs({
    options: {
      id: { type: 'string' }, name: { type: 'string' }, type: { type: 'string' },
      example: { type: 'boolean' },
    },
  });
  if (!values.id || !values.name || !isHostType(values.type)) {
    console.error(`usage: host:add -- --id <id> --name "<name>" --type <${HOST_TYPES.join('|')}> [--example]`);
    process.exit(2);
  }
  const result = addHost(openDb(), {
    id: values.id, name: values.name, type: values.type, example: values.example,
  });
  if (values.example) {
    console.log('[chivago] AN EXAMPLE, not a business. Every listing it makes carries');
    console.log('          "Example · not a real business" in both languages, and it is shown');
    console.log('          no response time - nobody real answers its questions.');
  }
  if (result.key) {
    console.log(`[chivago] host ${result.created ? 'created' : 'updated'}: ${values.name}`);
    console.log('[chivago] Console access key - shown ONCE, hand it over in person:');
    console.log(`          ${result.key}`);
    if (values.type === 'operator') {
      console.log('[chivago] An OPERATOR account: it signs in at /console and reaches its listings and');
      console.log('          its questions only - no review queue, no SOS desk, no statements. docs/62.');
    }
  } else {
    console.log(`[chivago] host updated: ${values.name}. It already had a key; nothing was reissued.`);
    console.log('          To rotate a lost key, clear hosts.api_key_hash for it and run this again.');
  }
}
