/**
 * Wrangler's build step for chivargo.com: refuse to deploy a broken web build.
 *
 *   "build": { "command": "node ../../scripts/deploy-guard.mjs ../mobile/dist-live" }
 *
 * apps/mobile/scripts/check-export.mjs knows what a deployable web export
 * looks like, but only `export:live` ran it. On 19 November a bundle exported
 * by hand, without EXPO_PUBLIC_API_URL=same-origin, went out through a plain
 * `wrangler deploy` and the whole site called the visitor's own
 * localhost:8787 for six and a half hours. Wrangler runs its build command
 * before every deploy, however the deploy was started, so the check lives
 * here as well.
 *
 * WRANGLER_COMMAND is set by wrangler for the build command: `deploy`,
 * `versions upload`, `dev`. Only `dev` is let through, because CI's import
 * test starts `wrangler dev` against an EMPTY dist-live on purpose. Anything
 * else, including no value at all, is treated as a deploy: an unknown
 * caller gets the check, not a free pass.
 */

import { checkExport } from '../apps/mobile/scripts/check-export.mjs';

const out = process.argv[2];
if (!out) {
  console.error('[chivago] deploy-guard: name the web export directory');
  process.exit(1);
}

if (process.env.WRANGLER_COMMAND === 'dev') process.exit(0);

const wrong = checkExport(out, { expect: Number(process.env.CHIVAGO_EXPECT_FILES ?? 100) });
if (wrong.length) {
  console.error(
    `\n[chivago] REFUSING TO DEPLOY ${out}:\n` +
      wrong.map((w) => `  - ${w}`).join('\n') +
      '\n\nBuild it with `pnpm --filter @chivago/mobile export:live`, which sets\n' +
      'EXPO_PUBLIC_API_URL=same-origin and runs these checks itself.\n',
  );
  process.exit(1);
}
console.log(`[chivago] ${out} passes all five checks.`);
