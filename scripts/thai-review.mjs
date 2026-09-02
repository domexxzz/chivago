/**
 * Collect every English/Thai pair in the product and check what a machine can.
 *
 *   node scripts/thai-review.mjs                   # summary to the terminal
 *   node scripts/thai-review.mjs --json            # the full set, as data
 *   node scripts/thai-review.mjs --html review.html  # the page a native speaker reads
 *
 * WHY THIS EXISTS. The Thai has never been read by a native speaker, and the
 * reason is not that nobody offered - it is that the copy lives in 23 files
 * next to code, and nobody is going to read a codebase to check a preposition.
 * This puts every pair in one place, in the order a reader meets them.
 *
 * THE PAGE. `--html` writes one self-contained file: every pair, its context
 * line, the machine's flags, and an editable Thai field. The reviewer types
 * corrections and presses "Export corrections", which produces a JSON block
 * they paste back; `thai-apply.mjs` writes it into the source, literal by
 * literal, refusing anything that no longer matches. No account, no server,
 * no build: a file they open in a browser and a block of text they send back.
 *
 * The collector and the checks live in lib/thai-pairs.mjs.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { KINDS, analyse, collectPairs } from './lib/thai-pairs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const pairs = collectPairs(ROOT);
const findings = analyse(pairs);

const htmlAt = process.argv.indexOf('--html');
if (htmlAt !== -1) {
  const out = process.argv[htmlAt + 1] ?? 'thai-review.html';
  writeFileSync(resolve(process.cwd(), out), reviewPage(pairs, findings), 'utf8');
  console.log(`[chivago] ${pairs.length} pairs, ${findings.length} flagged -> ${out}`);
} else if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ pairs, findings }, null, 2));
} else {
  console.log(`\n  ${pairs.length} English/Thai pairs across ${new Set(pairs.map((p) => p.file)).size} files\n`);
  const counts = {};
  for (const f of findings) counts[f.kind] = (counts[f.kind] ?? 0) + 1;
  for (const kind of KINDS) {
    if (counts[kind]) console.log(`  ${String(counts[kind]).padStart(4)}  ${kind}`);
  }
  console.log(`\n  ${findings.length} flagged for a human to look at first.`);
  console.log('  Everything else still needs reading — this only narrows the pile.\n');
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

// A declaration, not a const: it is called from `reviewPage`, which the CLI
// block above runs before this line is reached.
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function reviewPage(pairs, findings) {
  const flagsById = new Map();
  for (const f of findings) {
    const ids = f.kind === 'inconsistent' ? f.variants.flatMap((v) => v.ids) : [f.id];
    for (const id of ids) {
      if (!flagsById.has(id)) flagsById.set(id, []);
      flagsById.get(id).push(f);
    }
  }
  const byFile = new Map();
  for (const p of pairs) {
    if (!byFile.has(p.file)) byFile.set(p.file, []);
    byFile.get(p.file).push(p);
  }
  const data = JSON.stringify(pairs.map((p) => ({ id: p.id, file: p.file, line: p.line, th: p.th })));

  const rows = [...byFile.entries()].map(([file, ps]) => `
    <section class="file">
      <h2><code>${esc(file)}</code> <span class="n">${ps.length}</span></h2>
      ${ps.map((p) => {
        const flags = flagsById.get(p.id) ?? [];
        return `
        <article class="pair${flags.length ? ' flagged' : ''}" data-id="${esc(p.id)}">
          <div class="meta">
            <span class="line">line ${p.line}</span>
            ${p.context ? `<span class="ctx">${esc(p.context)}</span>` : ''}
            ${flags.map((f) => `<span class="flag ${esc(f.kind)}" title="${esc(f.detail)}">${esc(f.kind)}</span>`).join('')}
          </div>
          <div class="en">${esc(p.en)}</div>
          <textarea class="th" lang="th" rows="2" spellcheck="false" data-original="${esc(p.th)}">${esc(p.th)}</textarea>
          ${flags.filter((f) => f.kind === 'inconsistent').map((f) => `<div class="variants">${f.variants.map((v) => `<span>${esc(v.th)}</span>`).join(' · ')}</div>`).join('')}
        </article>`;
      }).join('')}
    </section>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ChivaGo · Thai copy review</title>
<style>
  :root { --ink: #0e2a4f; --ink2: #3d5578; --bg: #eaf2fc; --card: #fff; --line: rgba(14,42,79,.14); --brand: #1e6fd9; --coral: #d32f24; --gold: #8f5a00; --green: #1f7a44; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.6 "IBM Plex Sans Thai", "Anuphan", "Noto Sans Thai", "Sarabun", system-ui, sans-serif; }
  header { position: sticky; top: 0; z-index: 2; background: var(--card); border-bottom: 1px solid var(--line); padding: 12px 20px; display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
  header h1 { font-size: 16px; margin: 0; }
  header .count { color: var(--ink2); font-size: 13px; }
  header label { font-size: 13px; display: inline-flex; gap: 6px; align-items: center; }
  header button { background: var(--brand); color: #fff; border: 0; border-radius: 8px; padding: 8px 14px; font: inherit; font-size: 13px; cursor: pointer; }
  header button.secondary { background: transparent; color: var(--brand); border: 1px solid var(--brand); }
  main { max-width: 900px; margin: 0 auto; padding: 20px; }
  .intro { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; margin-bottom: 20px; font-size: 14px; }
  .intro p { margin: 0 0 8px; }
  .file h2 { font-size: 13px; letter-spacing: .04em; color: var(--ink2); margin: 28px 0 10px; font-weight: 600; }
  .file h2 .n { color: var(--ink2); font-weight: 400; margin-left: 6px; }
  .pair { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; }
  .pair.flagged { border-left: 3px solid var(--gold); }
  .pair.edited { border-left: 3px solid var(--green); }
  body.flagged-only .pair:not(.flagged):not(.edited) { display: none; }
  .meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; font-size: 11.5px; color: var(--ink2); margin-bottom: 6px; }
  .ctx { font-family: ui-monospace, Menlo, monospace; opacity: .8; }
  .flag { border-radius: 999px; padding: 1px 8px; font-size: 10.5px; letter-spacing: .04em; background: #fff3dc; color: var(--gold); }
  .flag.not-thai, .flag.lost-value, .flag.untranslated { background: #fde7e5; color: var(--coral); }
  .flag.inconsistent { background: #dbe9fb; color: var(--brand); }
  .en { font-size: 14px; color: var(--ink2); margin-bottom: 6px; white-space: pre-wrap; }
  .th { width: 100%; font: inherit; font-size: 16px; line-height: 1.6; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; resize: vertical; color: var(--ink); background: #f7faff; }
  .th:focus { outline: 2px solid var(--brand); border-color: transparent; }
  .variants { font-size: 12px; color: var(--brand); margin-top: 6px; }
  #export { display: none; margin: 20px 0; }
  #export textarea { width: 100%; height: 220px; font: 12px/1.5 ui-monospace, Menlo, monospace; }
</style>
</head>
<body>
<header>
  <h1>ChivaGo · Thai copy review · ตรวจคำแปลภาษาไทย</h1>
  <span class="count">${pairs.length} pairs · ${findings.length} flagged · <span id="edited">0</span> edited</span>
  <label><input type="checkbox" id="only"> flagged only · เฉพาะที่ถูกทำเครื่องหมาย</label>
  <button id="do-export">Export corrections · ส่งออกคำแก้</button>
  <button class="secondary" id="do-reset">Reset all</button>
</header>
<main>
  <div class="intro">
    <p><strong>How this works · วิธีใช้:</strong> every English/Thai pair in the app, in source order. Edit the Thai where it is wrong or unnatural — <em>แก้ภาษาไทยได้โดยตรงในช่อง</em>. The yellow flags are what a machine could spot (a dropped number, English left in, the same phrase translated two ways); they are hints, not verdicts, and most strings without a flag still need reading.</p>
    <p>When you are done, press <strong>Export corrections</strong> and send the block of text back. Nothing here is saved anywhere else: reload the page and your edits are gone, so export before you close it. <em>กด Export แล้วส่งข้อความกลับมา หน้านี้ไม่บันทึกอัตโนมัติ</em></p>
    <p>Things worth extra care: anything under <code>safety</code> or <code>quest</code> (a mistranslation there has consequences), the five rank names, the five moderation reasons, and every notification body.</p>
  </div>
  <div id="export"><p>Send this back (paste into an issue, an email, a chat) — <code>node scripts/thai-apply.mjs corrections.json</code> writes it into the source:</p><textarea id="out" readonly></textarea></div>
  ${rows}
</main>
<script>
  const PAIRS = ${data};
  const byId = new Map(PAIRS.map((p) => [p.id, p]));
  const editedCount = () => document.querySelectorAll('.pair.edited').length;
  const refresh = () => { document.getElementById('edited').textContent = editedCount(); };
  for (const ta of document.querySelectorAll('textarea.th')) {
    ta.addEventListener('input', () => {
      ta.closest('.pair').classList.toggle('edited', ta.value !== ta.dataset.original);
      refresh();
    });
  }
  document.getElementById('only').addEventListener('change', (e) => {
    document.body.classList.toggle('flagged-only', e.target.checked);
  });
  document.getElementById('do-reset').addEventListener('click', () => {
    for (const ta of document.querySelectorAll('textarea.th')) { ta.value = ta.dataset.original; ta.closest('.pair').classList.remove('edited'); }
    refresh();
  });
  document.getElementById('do-export').addEventListener('click', () => {
    const corrections = [];
    for (const ta of document.querySelectorAll('textarea.th')) {
      if (ta.value === ta.dataset.original) continue;
      const p = byId.get(ta.closest('.pair').dataset.id);
      corrections.push({ file: p.file, line: p.line, th: p.th, newTh: ta.value });
    }
    const box = document.getElementById('export');
    box.style.display = 'block';
    document.getElementById('out').value = JSON.stringify(corrections, null, 2);
    box.scrollIntoView({ behavior: 'smooth' });
  });
</script>
</body>
</html>
`;
}
