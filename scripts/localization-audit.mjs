/**
 * AST-based trilingual localization guard.
 *
 * The older review script remains the native-language quality workbench. This
 * guard answers a narrower, mechanical question for CI: did new TypeScript UI
 * copy bypass `en`/`th`/`zh`, lose an interpolation, or use a legacy bilingual
 * component without Chinese? Suspected bare JSX is reported for review but is
 * not a build failure because names, units and data labels can be intentional.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const ROOTS = ['apps/mobile/App.tsx', 'apps/mobile/src', 'packages/core/src'];
const baseline = JSON.parse(readFileSync(join(ROOT, 'scripts/localization-baseline.json'), 'utf8'));
const baselineEntries = baseline.interpolationReview ?? [];
const legacyLimits = baseline.legacyLimits ?? {};
const literalReview = baseline.literalReview ?? [];
const UI_TAGS = new Set(['Text', 'Heading', 'Body', 'Label', 'Button', 'Thai']);
const USER_PROPS = new Set(['accessibilityLabel', 'accessibilityHint', 'placeholder', 'label', 'title']);

const files = [];
const add = (path) => {
  const stat = readdirSafe(path);
  if (stat === null) { if (/\.tsx?$/.test(path) && !/\.test\./.test(path)) files.push(path); return; }
  for (const entry of stat) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      if (!/node_modules|dist|\.expo/.test(entry.name)) add(child);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) files.push(child);
  }
};
function readdirSafe(path) { try { return readdirSync(path, { withFileTypes: true }); } catch { return null; } }
for (const root of ROOTS) add(join(ROOT, root));

const confirmed = [];
const suspected = [];
const counts = { files: files.length, localised: 0, en: 0, th: 0, zh: 0 };
const at = (sf, node) => {
  const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  return { file: relative(ROOT, sf.fileName).split('\\').join('/'), line: pos.line + 1 };
};
const report = (bucket, sf, node, kind, detail) => bucket.push({ ...at(sf, node), kind, detail });
const propertyMap = (node) => {
  if (!ts.isObjectLiteralExpression(node)) return null;
  const map = new Map();
  for (const p of node.properties) {
    if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) map.set(p.name.text, p.initializer);
    if (ts.isShorthandPropertyAssignment(p)) map.set(p.name.text, p.name);
  }
  return map;
};
const slots = (node, sf) => (node?.getText(sf).match(/\$\{[^}]+\}/g) ?? [])
  .map((s) => s.slice(2, -1).replace(/\s+/g, '').replace(/\.(en|th|zh)\b/g, '.LANG'))
  // Grammar and language-specific sentence construction legitimately differ.
  // Only plain identifiers/member paths are values whose loss is unambiguous.
  .filter((s) => /^[A-Za-z_$][\w$]*(?:\?*\.[A-Za-z_$][\w$]*)*$/.test(s));
const checkLocalised = (sf, node, map) => {
  if (!map?.has('en') || !map.has('th')) return;
  counts.localised += 1; counts.en += 1; counts.th += 1;
  if (!map.has('zh')) report(confirmed, sf, node, 'missing-zh', 'Localised copy has en/th but no zh.');
  else counts.zh += 1;
  const enSlots = slots(map.get('en'), sf);
  for (const locale of ['th', 'zh']) {
    if (!map.has(locale)) continue;
    const localeSlots = slots(map.get(locale), sf);
    const missing = enSlots.filter((s) => !localeSlots.includes(s));
    if (missing.length) report(confirmed, sf, map.get(locale), 'interpolation-mismatch', `${locale} drops ${missing.join(', ')}.`);
  }
};

for (const file of files.sort()) {
  const source = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node) => {
    const map = propertyMap(node);
    if (map) checkLocalised(sf, node, map);

    // The original 77-province mascot catalogue stores name, creature and
    // rationale as positional EN/TH tuples. Keep this debt visible until the
    // Chinese catalogue has had a contextual native review; a new tuple above
    // the tracked limit is still a CI failure.
    if (
      relative(ROOT, sf.fileName).split('\\').join('/') === 'packages/core/src/mascots.ts'
      && ts.isArrayLiteralExpression(node)
      && node.elements.length === 2
      && node.elements.every((item) => ts.isStringLiteralLike(item))
    ) {
      counts.localised += 1; counts.en += 1; counts.th += 1;
      report(confirmed, sf, node, 'legacy-array-missing-zh', 'Legacy positional copy has en/th but no zh.');
    }

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't') {
      if (node.arguments.length >= 2 && node.arguments.every((a) => ts.isStringLiteralLike(a))) {
        counts.localised += 1; counts.en += 1; counts.th += 1;
        if (node.arguments.length < 3) report(confirmed, sf, node, 'missing-zh', 'Positional translation has no Chinese argument.');
        else counts.zh += 1;
      }
    }

    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tag = opening.tagName.getText(sf);
      const attrs = new Map(opening.attributes.properties.filter(ts.isJsxAttribute).map((a) => [a.name.text, a]));
      if (tag === 'Button' && attrs.has('label') && attrs.has('thai') && !attrs.has('chinese') && !attrs.get('label')?.initializer?.getText(sf).startsWith('{')) {
        report(confirmed, sf, opening, 'legacy-button-missing-zh', 'Legacy Button has English/Thai copy but no Chinese copy.');
      }
      for (const [name, attr] of attrs) {
        if (name === 'label' && attrs.has('thai') && attrs.has('chinese')) continue;
        if (name === 'accessibilityLabel' && attr.initializer && ts.isStringLiteral(attr.initializer) && attr.initializer.text === 'ChivarGo') continue;
        if (USER_PROPS.has(name) && attr.initializer && ts.isStringLiteral(attr.initializer)) {
          report(suspected, sf, attr, 'literal-user-prop', `${name} is a literal; review whether it should be localised.`);
        }
      }
      if (ts.isJsxElement(node) && UI_TAGS.has(tag)) {
        for (const child of node.children) {
          if (ts.isJsxText(child) && /[A-Za-z\u0E00-\u0E7F\u4E00-\u9FFF]{2}/.test(child.text.trim())) {
            report(suspected, sf, child, 'literal-jsx-text', `Bare text inside <${tag}>; review whether it should be localised.`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const fingerprint = (item) => `${item.file}|${item.kind}|${item.detail}`;
const remainingBaseline = [...baselineEntries];
const remainingLimits = { ...legacyLimits };
const newConfirmed = [];
const legacyConfirmed = [];
for (const item of confirmed) {
  const key = fingerprint(item);
  const index = remainingBaseline.indexOf(key);
  const limitKey = `${item.file}|${item.kind}`;
  if (index === -1 && (remainingLimits[limitKey] ?? 0) > 0) {
    legacyConfirmed.push(item);
    remainingLimits[limitKey] -= 1;
  } else if (index === -1) newConfirmed.push(item);
  else {
    legacyConfirmed.push(item);
    remainingBaseline.splice(index, 1);
  }
}
const legacySummary = Object.fromEntries(
  [...new Set(legacyConfirmed.map((item) => item.kind))]
    .sort()
    .map((kind) => [kind, legacyConfirmed.filter((item) => item.kind === kind).length]),
);
const remainingLiteralReview = [...literalReview];
const validated = [];
const newSuspected = [];
for (const item of suspected) {
  const index = remainingLiteralReview.findIndex((entry) => entry.fingerprint === fingerprint(item));
  if (index === -1) newSuspected.push(item);
  else {
    validated.push({ ...item, reason: remainingLiteralReview[index].reason });
    remainingLiteralReview.splice(index, 1);
  }
}
const result = {
  counts,
  confirmed: newConfirmed,
  legacy: legacyConfirmed,
  legacySummary,
  resolvedBaseline: remainingBaseline,
  suspected: newSuspected,
  validated,
  staleLiteralReview: remainingLiteralReview,
};
if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`[localization] ${counts.localised} localised values across ${counts.files} files`);
  console.log(`[localization] en=${counts.en} th=${counts.th} zh=${counts.zh} new=${newConfirmed.length} legacy-review=${legacyConfirmed.length} suspected=${newSuspected.length} validated=${validated.length}`);
  for (const item of newConfirmed) console.log(`  ERROR ${item.file}:${item.line} ${item.kind} — ${item.detail}`);
  if (legacyConfirmed.length) {
    const detail = Object.entries(legacySummary).map(([kind, count]) => `${kind}=${count}`).join(', ');
    console.log(`  LEGACY ${legacyConfirmed.length} baseline issues (${detail}; no new debt allowed)`);
  }
  if (remainingBaseline.length) console.log(`  RESOLVED ${remainingBaseline.length} baseline entries no longer detected (remove after review)`);
  if (newSuspected.length) console.log(`  REVIEW ${newSuspected.length} literal JSX/props (reported, not blocking)`);
  if (validated.length) console.log(`  VALIDATED ${validated.length} non-translatable literals (brand, identifiers, units or examples)`);
  if (remainingLiteralReview.length) console.log(`  STALE ${remainingLiteralReview.length} reviewed literals no longer detected (remove after review)`);
}
if (process.argv.includes('--check') && newConfirmed.length) process.exitCode = 1;
