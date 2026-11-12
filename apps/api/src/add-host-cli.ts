/**
 * `pnpm host:add` - the command line around `addHost`.
 *
 * WHY IT IS NOT IN `add-host.ts`. `operator-application-service.ts` imports
 * `addHost`, so that file is in the Worker's import graph - and while the CLI
 * lived beside it, the graph pulled `node:util` and, through `openDb`,
 * `node:sqlite`. Neither exists on Workers. The function is portable; only
 * the command is not.
 *
 *   pnpm --filter @chivago/api host:add -- --id <id> --name "<name>" --type <type>
 *
 * The console key is printed ONCE and only its hash is stored, so there is no
 * way to read it back. Capture it from this output.
 */

import { parseArgs } from 'node:util';

import { openDb } from './db-node.ts';
import { HOST_TYPES, addHost, isHostType } from './add-host.ts';

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
