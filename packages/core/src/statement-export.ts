/**
 * A statement as a file: CSV for a spreadsheet, PDF for a filing cabinet.
 *
 * The JSON at /statements/:id is the record and the digest is over it;
 * these two are the same record laid out for the two places a hotel's
 * sustainability officer actually puts things. Both carry the id, the
 * digest and the verify URL, so a file that has been forwarded three times
 * still points back to the thing anyone can check.
 *
 * THE PDF IS WRITTEN BY HAND. No library: a PDF with one standard font and
 * text is a few hundred bytes of syntax, and a dependency that renders
 * every font in the world would be the heaviest thing in the API for a
 * document that must, above all, stay simple enough to be checked. The
 * cost is that the standard fonts carry no Thai: the PDF prints the
 * English side of every line and says so, and the Thai is in the JSON.
 */

import type { ActivityStatement, StatementLine } from './statement.ts';

const csvCell = (v: string | number | null): string => {
  if (v === null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * One row per line, then the totals, then the provenance. UTF-8 with a BOM
 * so Excel reads the Thai; CRLF because that is what every spreadsheet
 * expects from a .csv and what RFC 4180 says.
 */
export function statementCsv(s: ActivityStatement, origin: string): string {
  const rows: (string | number | null)[][] = [
    ['statement_id', 'host', 'period_from', 'period_to', 'day', 'quest_id', 'activity_en', 'activity_th', 'pillar', 'verified', 'weight_kg'],
    ...s.lines.map((l: StatementLine) => [
      s.id, s.host.name, s.period.from, s.period.to, l.day, l.questId, l.name.en, l.name.th, l.pillar ?? '', l.verified, l.weightKg,
    ]),
    [],
    ['total_verified', s.verified],
    ['distinct_participants', s.participants],
    ['refused', s.refused],
    ['total_weight_kg', s.weightKg],
    ['issued_at', s.issuedAt],
    ['issued_by', s.issuedBy ?? ''],
    ['digest_sha256', s.digest],
    ['verify_url', `${origin}/verify/${s.id}`],
    ['record_url', `${origin}/statements/${s.id}`],
    ['assurance', s.assurance.en],
    ['boundary', s.boundary.en],
  ];
  return `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

/** What a PDF string literal can hold: escape the delimiters, drop what Helvetica cannot draw. */
const pdfText = (s: string): string => s
  .replace(/[^\x20-\x7e -ÿ]/g, '?')
  .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

const LINES_PER_PAGE = 46;
const LEFT = 56;
const TOP = 790;
const LEADING = 15;

interface Run { text: string; size: number; bold?: boolean }

/** The document as lines of text, before any page is cut. */
export function statementPdfLines(s: ActivityStatement, origin: string): Run[] {
  const h = (text: string): Run => ({ text, size: 15, bold: true });
  const p = (text: string): Run => ({ text, size: 10 });
  const small = (text: string): Run => ({ text, size: 8 });
  const blank = (): Run => ({ text: '', size: 10 });
  const out: Run[] = [
    h(`Statement of verified activity ${s.id}`),
    p(`${s.host.name} · ${s.period.from} to ${s.period.to}`),
    p(`Issued ${s.issuedAt.slice(0, 10)}${s.issuedBy ? ` by ${s.issuedBy}` : ''}`),
    blank(),
    p(`Verified: ${s.verified}   Distinct participants: ${s.participants}   Refused: ${s.refused}${s.weightKg !== null ? `   Weight: ${s.weightKg} kg` : ''}`),
    blank(),
    p('Day         Verified   Activity'),
  ];
  for (const l of s.lines) {
    out.push(p(`${l.day}  ${String(l.verified).padStart(8)}   ${l.name.en}${l.pillar ? ` (${l.pillar})` : ''}${l.weightKg !== null ? ` · ${l.weightKg} kg` : ''}`));
  }
  out.push(blank(), small(s.assurance.en), small(s.boundary.en));
  for (const n of s.notClaimable) out.push(small(`Not claimable: ${n.en}`));
  out.push(
    blank(),
    small(`SHA-256 of the canonical record: ${s.digest}`),
    small(`Check it at ${origin}/verify/${s.id} - the record is ${origin}/statements/${s.id}`),
    small('This PDF prints the English side of each line; the Thai is in the record. Nothing here is a carbon figure.'),
  );
  return out;
}

/**
 * The bytes. Objects: catalog, pages, one page per LINES_PER_PAGE runs,
 * one content stream each, two fonts. The xref table's offsets are the
 * byte offsets of each object, which is the one thing a reader insists on.
 */
export function statementPdf(s: ActivityStatement, origin: string): Uint8Array {
  const runs = statementPdfLines(s, origin);
  const pages: Run[][] = [];
  for (let i = 0; i < runs.length; i += LINES_PER_PAGE) pages.push(runs.slice(i, i + LINES_PER_PAGE));
  if (pages.length === 0) pages.push([]);

  const objects: string[] = [];
  const add = (body: string): number => { objects.push(body); return objects.length; };

  const fontRegular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontBold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const pagesId = objects.length + 1 + pages.length * 2; // filled after the pages
  const pageIds: number[] = [];
  pages.forEach((page, index) => {
    let y = TOP;
    const ops: string[] = ['BT'];
    for (const run of page) {
      ops.push(`/${run.bold ? 'F2' : 'F1'} ${run.size} Tf 1 0 0 1 ${LEFT} ${y} Tm (${pdfText(run.text)}) Tj`);
      y -= run.size >= 15 ? LEADING + 6 : LEADING;
    }
    ops.push(`/F1 8 Tf 1 0 0 1 ${LEFT} 40 Tm (${pdfText(`${s.id} · page ${index + 1} of ${pages.length}`)}) Tj`, 'ET');
    const stream = ops.join('\n');
    const content = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Contents ${content} 0 R /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> >>`);
    pageIds.push(pageId);
  });
  const pagesActual = add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  if (pagesActual !== pagesId) throw new Error(`pages object landed at ${pagesActual}, expected ${pagesId}`);
  const catalog = add(`<< /Type /Catalog /Pages ${pagesActual} 0 R >>`);

  let out = '%PDF-1.4\n%âãÏÓ\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, 'latin1'));
}
