/**
 * Say what just changed: to Discord, and to Hermes on this machine.
 *
 *   node scripts/announce.mjs --th "หัวข้อ" "รายละเอียด" --en "title" "detail"
 *   node scripts/announce.mjs --from-git            # last commit, read off HEAD
 *   node scripts/announce.mjs --dry-run --th ...    # print, send nothing
 *
 * THAI FIRST, AND BOTH EVERY TIME. The first two of these ever sent went out
 * in English only, which is the language the commit messages happen to be
 * written in and not the one the team reads. Everything else in this product
 * carries both - `strings.ts` will not let a screen ship half-translated -
 * and an announcement is no different: a teammate should not have to
 * translate a release note to find out what changed. Thai leads because that
 * is who is reading; English follows because the commits, the code and the
 * docs are in it.
 *
 * A message with no Thai still sends, and says loudly in its own body that
 * the Thai is missing. Refusing to send would lose the update; pretending
 * English-only is fine is how it happened the first time.
 *
 * THE RULE THIS FILE FOLLOWS: announcing must never break the thing it is
 * announcing. Every network call is wrapped, the exit code is 0 unless
 * --strict is passed, and a Discord outage or a stopped Hermes is reported on
 * stdout and then forgiven. A release script that fails because a chat
 * message did not send has its priorities backwards.
 *
 * THE WEBHOOK IS A CREDENTIAL. It lives in `.env`, which this repository has
 * ignored since its first commit, and is read from the environment here.
 * Anybody holding that URL can post into the channel as this app, so it is
 * never printed, never echoed back in an error, and never committed. See
 * `.env.example` for the names.
 *
 * Hermes is the memory service on this machine (sentiara-ai, port 8770). It
 * is optional by design: a laptop that is not running it still gets the
 * Discord post, and the script says which of the two landed.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * `.env`, read here rather than by a dependency.
 *
 * Four lines of parsing against a package, a lockfile entry and a supply
 * chain. The format is the subset that is actually used: KEY=value, hashes
 * are comments, surrounding quotes come off.
 */
function loadEnv() {
  try {
    for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
      const text = line.trim();
      if (!text || text.startsWith('#')) continue;
      const at = text.indexOf('=');
      if (at < 1) continue;
      const key = text.slice(0, at).trim();
      if (process.env[key] !== undefined) continue; // a real env var wins
      process.env[key] = text.slice(at + 1).trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // No .env is normal on a machine that passes the webhook in the environment.
  }
}

const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', timeout: 8000 }).trim();
  } catch {
    return '';
  }
};

/**
 * What HEAD says, for `--from-git`.
 *
 * Commits in this repository are written in English, so this fills the
 * English half only and leaves the Thai empty on purpose. `main` below turns
 * that into a visible note in the message rather than a silent English-only
 * post, which is exactly the failure this flag is most likely to cause.
 */
function fromGit() {
  const subject = git('log', '-1', '--pretty=%s');
  const bodyText = git('log', '-1', '--pretty=%b').trim();
  const stat = git('show', '--stat', '--oneline', 'HEAD').split('\n').slice(-1)[0]?.trim() ?? '';
  return {
    en: {
      title: subject || 'Update',
      // The commit body carries the reasoning in this repository, so it is the
      // announcement. Trimmed to what a chat message can hold without becoming
      // a wall nobody reads.
      body: [bodyText.split('\n\n')[0] ?? '', stat].filter(Boolean).join('\n\n'),
    },
    th: { title: '', body: '' },
  };
}

/** Facts worth having beside the message, all read rather than passed in. */
function context() {
  return {
    branch: git('branch', '--show-current') || '?',
    sha: git('rev-parse', '--short', 'HEAD') || '?',
    subject: git('log', '-1', '--pretty=%s'),
    dirty: git('status', '--porcelain').split('\n').filter((l) => l.trim()).length,
  };
}

const REPO_URL = 'https://github.com/domexxzz/chivago';
const clip = (s, n) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);

/**
 * The message body, Thai above English with a rule between them.
 *
 * Thai leads because that is who reads the channel. The English is kept
 * rather than dropped: the commits, the code and the documents are in it, and
 * somebody comparing a release note against a diff needs the same words.
 */
function describe(text) {
  const missingThai = !text.th.body.trim() && !text.th.title.trim();
  const thai = missingThai
    ? '_(ยังไม่มีฉบับภาษาไทยสำหรับข้อความนี้)_'
    : [text.th.title.trim(), text.th.body.trim()].filter(Boolean).join('\n\n');
  const english = [text.en.title.trim(), text.en.body.trim()].filter(Boolean).join('\n\n')
    || '_no detail given_';
  // A visible divider, because two languages run together read as one
  // paragraph that changes script halfway through.
  return `${thai}\n\n───\n\n${english}`;
}

async function toDiscord(text, ctx) {
  const url = process.env.CHIVAGO_DISCORD_WEBHOOK;
  if (!url) return { ok: false, why: 'CHIVAGO_DISCORD_WEBHOOK is not set' };

  // The Thai headline is the title when there is one; the English sits in the
  // body with the rest. A title in a language the reader has to decode is the
  // one line they cannot skip.
  const heading = text.th.title.trim() || text.en.title.trim() || 'Update';

  const payload = {
    username: 'ChivaGo',
    embeds: [{
      title: clip(heading, 250),
      description: clip(describe(text), 3800),
      url: ctx.sha === '?' ? undefined : `${REPO_URL}/commit/${ctx.sha}`,
      // The brand teal. A colour makes a stream of these scannable at a glance.
      color: 0x0e7480,
      fields: [
        { name: 'branch · สาขา', value: ctx.branch, inline: true },
        { name: 'commit · คอมมิต', value: ctx.sha, inline: true },
        {
          name: 'working tree · ไฟล์ค้าง',
          // Said plainly: an announcement made from a dirty tree describes
          // something that is not what anybody else can check out.
          value: ctx.dirty === 0 ? 'clean · สะอาด' : `${ctx.dirty} uncommitted · ยังไม่ commit`,
          inline: true,
        },
      ],
      timestamp: new Date().toISOString(),
    }],
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    // The URL is never included in the reason, whatever the status was.
    return res.ok ? { ok: true } : { ok: false, why: `Discord answered ${res.status}` };
  } catch (err) {
    return { ok: false, why: `Discord unreachable (${err.name})` };
  }
}

async function toHermes(text, ctx) {
  const base = process.env.CHIVAGO_HERMES_URL ?? 'http://localhost:8770';
  // Hermes is recalled in Thai far more often than in English, so it gets the
  // same two-language body the channel does rather than a summary of one.
  const content = [
    `[ChivaGo ${ctx.sha}] ${text.th.title.trim() || text.en.title.trim()}`,
    describe(text),
    `branch ${ctx.branch} · ${ctx.dirty === 0 ? 'tree clean' : `${ctx.dirty} uncommitted`} · ${REPO_URL}`,
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch(`${base}/memory/save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'project',
        content,
        tags: ['chivago', 'update'],
        importance: 'normal',
      }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok ? { ok: true } : { ok: false, why: `Hermes answered ${res.status}` };
  } catch (err) {
    // Expected on any machine not running sentiara-ai. Not a failure.
    return { ok: false, why: `Hermes not reachable at ${base} (${err.name})` };
  }
}

/**
 * Split the words after `--th` and after `--en` into a title and a body.
 *
 * The first word of each run is the headline and the rest is the detail, so a
 * caller writes the message the way it reads rather than naming four flags.
 */
function readArgs(argv) {
  const out = { th: { title: '', body: '' }, en: { title: '', body: '' } };
  let lang = null;
  const words = { th: [], en: [] };
  for (const arg of argv) {
    if (arg === '--th' || arg === '--en') { lang = arg.slice(2); continue; }
    if (arg.startsWith('--')) { lang = null; continue; }
    if (lang) words[lang].push(arg);
  }
  for (const l of ['th', 'en']) {
    out[l] = { title: words[l][0] ?? '', body: words[l].slice(1).join('\n') };
  }
  return out;
}

async function main() {
  loadEnv();
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const strict = argv.includes('--strict');
  const useGit = argv.includes('--from-git');

  const ctx = context();
  const text = useGit ? fromGit() : readArgs(argv);

  // Neither language given at all: fall back to the commit rather than send
  // an empty message.
  if (!text.th.title && !text.en.title) text.en = fromGit().en;

  const noThai = !text.th.title.trim() && !text.th.body.trim();

  if (dryRun) {
    console.log('[announce] DRY RUN — nothing sent');
    console.log(`  heading: ${text.th.title || text.en.title}`);
    console.log(`  ---\n${describe(text)}\n  ---`);
    console.log(`  ${ctx.branch} · ${ctx.sha} · ${ctx.dirty} uncommitted`);
    console.log(`  discord: ${process.env.CHIVAGO_DISCORD_WEBHOOK ? 'webhook configured' : 'NOT configured'}`);
    if (noThai) console.log('  WARNING: no Thai. The channel reads Thai — pass --th.');
    return 0;
  }

  const [discord, hermes] = await Promise.all([toDiscord(text, ctx), toHermes(text, ctx)]);
  console.log(`[announce] discord: ${discord.ok ? 'sent' : `skipped — ${discord.why}`}`);
  console.log(`[announce] hermes:  ${hermes.ok ? 'saved' : `skipped — ${hermes.why}`}`);
  // Said after the send, not instead of it. Losing the update would be worse
  // than an English-only one; saying nothing is how it happened the first time.
  if (noThai) console.log('[announce] WARNING: sent without Thai. The channel reads Thai — pass --th next time.');

  // Zero unless asked otherwise. See the rule at the top of this file.
  return strict && !(discord.ok && hermes.ok) ? 1 : 0;
}

main().then((code) => process.exit(code), (err) => {
  console.log(`[announce] failed, and is not stopping anything: ${err.message}`);
  process.exit(0);
});
