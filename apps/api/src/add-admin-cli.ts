/** Create or rotate one administrator without putting its password in Git. */
import { parseArgs } from 'node:util';
import { openDb } from './db-node.ts';
import { upsertAdmin } from './admin-account.ts';

const { values } = parseArgs({ options: { username: { type: 'string' } } });
const password = process.env.CHIVAGO_ADMIN_PASSWORD ?? '';
if (!values.username || !password) {
  console.error('usage: set CHIVAGO_ADMIN_PASSWORD, then pnpm admin:add -- --username <name>');
  process.exit(2);
}
const result = upsertAdmin(openDb(), { username: values.username, password });
console.log(`[chivago] administrator ready: ${result.username}`);
console.log('[chivago] sign in at /console/login; only a salted password hash was stored.');
