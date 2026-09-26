/**
 * Somebody else's activity data, read but never adopted.
 *
 * `docs/59` named the limit this module exists to attack: every tool built
 * for a company that ALREADY files reads rows this platform recorded, and
 * that company's numbers are in a spreadsheet, an ERP and somebody's inbox.
 * Until those can come in, side A is a service rather than a product.
 *
 * THE TRAP, AND THE WHOLE DESIGN. Run an imported spreadsheet through the
 * machinery that produces a ChivaGo statement and the output looks identical:
 * the same page, the same digest, the same green. It would be LEVEL ONE
 * evidence — somebody typed it — wearing level three's clothes, and it would
 * be the most damaging thing this codebase could ship, because it is the
 * exact substitution the whole product exists to refuse.
 *
 * So an import produces a REVIEW, never a statement. Different word,
 * different shape, no digest, no verify page, and `DECLARED_NOT_VERIFIED`
 * printed on it. A review says what is wrong with a file. It never says the
 * file is true.
 *
 * WHAT A REVIEW CAN HONESTLY CHECK is everything that is wrong ON THE FACE OF
 * THE FILE, without seeing a single photograph: dates outside the period a
 * report claims, the same line claimed twice, a stated total that is not the
 * sum of its rows, a unit that does not match what is being counted. An
 * assurer finds these in week three. This finds them before anybody signs.
 */

import type { Bilingual } from './types.ts';

/** One row as it arrived. `null` where the file gave nothing usable. */
export interface DeclaredRow {
  /** 1-based line in the file, so a finding can point at it. */
  line: number;
  activity: string;
  /** YYYY-MM-DD, or null when the cell could not be read as a date. */
  date: string | null;
  participants: number | null;
  amount: number | null;
  unit: string | null;
}

export type FindingKind =
  | 'no_date'
  | 'outside_period'
  | 'future_date'
  | 'duplicate_row'
  | 'total_mismatch'
  | 'unit_mismatch'
  | 'no_activity';

export interface Finding {
  kind: FindingKind;
  /** Lines this concerns. Empty when it is about the file as a whole. */
  lines: number[];
  detail: Bilingual;
}

export interface DeclaredReview {
  rows: number;
  /** Rows that survive every check above. Not "verified" - see the constant. */
  clean: number;
  findings: Finding[];
  /** Printed on every review, at the top. */
  standing: Bilingual;
}

/**
 * What an imported row is, said before any figure on the page.
 *
 * The strongest sentence in this module, and it is a refusal.
 */
export const DECLARED_NOT_VERIFIED: Bilingual = {
  en: 'Every row here was declared by the organisation that sent the file. Nobody at ChivaGo '
    + 'verified any of it, and this review does not make it true. It is level 1 evidence: '
    + 'self-reported. What follows is what is wrong on the face of the file.',
  th: 'ทุกบรรทัดในที่นี้เป็นข้อมูลที่องค์กรผู้ส่งไฟล์แจ้งมาเอง ไม่มีใครที่ ChivaGo ตรวจสอบ '
    + 'และการทบทวนนี้ไม่ได้ทำให้ข้อมูลเป็นจริง ถือเป็นหลักฐานระดับ 1 คือผู้แจ้งรายงานเอง '
    + 'สิ่งที่อยู่ด้านล่างคือสิ่งที่ผิดบนหน้าไฟล์',
};

const two = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

/**
 * Read a file against the period it claims to cover.
 *
 * `statedTotal` is what the company's own report says the column adds up to.
 * Null when they did not state one, which is not a finding — plenty of
 * reports do not — but when they did and it disagrees with their own rows,
 * that is the finding an assurer opens with.
 */
export function reviewDeclared(
  rows: readonly DeclaredRow[],
  period: { from: string; to: string },
  statedTotal: number | null = null,
  today: string = new Date().toISOString().slice(0, 10),
): DeclaredReview {
  const findings: Finding[] = [];
  const bad = new Set<number>();
  const flag = (kind: FindingKind, lines: number[], detail: Bilingual) => {
    findings.push({ kind, lines, detail });
    for (const l of lines) bad.add(l);
  };

  const noActivity = rows.filter((r) => r.activity.trim() === '').map((r) => r.line);
  if (noActivity.length > 0) {
    flag('no_activity', noActivity, {
      en: `${noActivity.length} row(s) name no activity. A figure with nothing attached to it cannot be checked by anybody.`,
      th: `${noActivity.length} บรรทัดไม่ได้ระบุกิจกรรม ตัวเลขที่ไม่มีกิจกรรมกำกับ ไม่มีใครตรวจได้`,
    });
  }

  const noDate = rows.filter((r) => r.date === null).map((r) => r.line);
  if (noDate.length > 0) {
    flag('no_date', noDate, {
      en: `${noDate.length} row(s) carry no readable date, so they are in no period — including this one.`,
      th: `${noDate.length} บรรทัดไม่มีวันที่ที่อ่านได้ จึงไม่อยู่ในช่วงเวลาใดเลย รวมถึงช่วงนี้`,
    });
  }

  const outside = rows
    .filter((r) => r.date !== null && (r.date < period.from || r.date > period.to))
    .map((r) => r.line);
  if (outside.length > 0) {
    flag('outside_period', outside, {
      en: `${outside.length} row(s) fall outside ${period.from} — ${period.to}. `
        + 'A lifetime-to-date figure inside a fiscal-year report is the quiet kind of wrong that survives review.',
      th: `${outside.length} บรรทัดอยู่นอกช่วง ${period.from} ถึง ${period.to} `
        + 'ตัวเลขสะสมทั้งหมดที่ใส่ในรายงานปีบัญชี คือความผิดเงียบ ๆ ที่รอดการตรวจไปได้',
    });
  }

  const future = rows.filter((r) => r.date !== null && r.date > today).map((r) => r.line);
  if (future.length > 0) {
    flag('future_date', future, {
      en: `${future.length} row(s) are dated after today.`,
      th: `${future.length} บรรทัดลงวันที่หลังวันนี้`,
    });
  }

  // The same activity, on the same day, with the same figure. Two rows like
  // that are either a real repeat nobody distinguished or a paste that
  // happened twice, and the file cannot tell which - so it is reported as a
  // question rather than removed.
  const seen = new Map<string, number[]>();
  for (const r of rows) {
    const key = `${r.activity.trim().toLowerCase()}|${r.date ?? ''}|${r.participants ?? ''}|${r.amount ?? ''}`;
    seen.set(key, [...(seen.get(key) ?? []), r.line]);
  }
  for (const lines of seen.values()) {
    if (lines.length > 1) {
      flag('duplicate_row', lines, {
        en: 'Identical activity, date and figures on more than one row. Either a real repeat '
          + 'nobody distinguished, or a paste that happened twice — the file cannot say which.',
        th: 'กิจกรรม วันที่ และตัวเลขซ้ำกันมากกว่าหนึ่งบรรทัด อาจเป็นการทำซ้ำจริงที่ไม่ได้แยกไว้ '
          + 'หรือการวางข้อมูลซ้ำ ไฟล์บอกไม่ได้ว่าอันไหน',
      });
    }
  }

  const units = new Set(rows.map((r) => (r.unit ?? '').trim().toLowerCase()).filter((u) => u !== ''));
  if (units.size > 1) {
    flag('unit_mismatch', rows.filter((r) => r.unit !== null).map((r) => r.line), {
      en: `More than one unit in the same column: ${[...units].join(', ')}. A total across them is not a number.`,
      th: `มีหน่วยมากกว่าหนึ่งแบบในคอลัมน์เดียวกัน คือ ${[...units].join(', ')} ผลรวมข้ามหน่วยไม่ใช่ตัวเลข`,
    });
  }

  if (statedTotal !== null) {
    const summed = rows.reduce((n, r) => n + (r.amount ?? 0), 0);
    if (Math.abs(summed - statedTotal) > 0.005) {
      flag('total_mismatch', [], {
        en: `The report states ${two(statedTotal)} and its own rows add up to ${two(summed)}.`,
        th: `รายงานระบุ ${two(statedTotal)} แต่บรรทัดของรายงานเองรวมได้ ${two(summed)}`,
      });
    }
  }

  return {
    rows: rows.length,
    clean: rows.filter((r) => !bad.has(r.line)).length,
    findings,
    standing: DECLARED_NOT_VERIFIED,
  };
}

/**
 * A pasted sheet, read into rows.
 *
 * COLUMNS ARE MATCHED BY NAME, NEVER BY POSITION. A sustainability lead
 * pastes from Excel with the columns in whatever order their template uses,
 * and a parser that assumed the third column was the date would silently
 * review the wrong numbers - which is the one failure mode worse than
 * refusing the file.
 *
 * Both languages are accepted for every header, because the file was written
 * by a Thai team for a Thai filing and then, often, exported in English.
 */
const HEADERS: Record<keyof ParsedColumns, readonly string[]> = {
  activity: ['activity', 'quest', 'กิจกรรม', 'โครงการ'],
  date: ['date', 'วันที่', 'วันที่ทำ'],
  participants: ['participants', 'people', 'ผู้เข้าร่วม', 'จำนวนคน'],
  amount: ['amount', 'quantity', 'value', 'จำนวน', 'ปริมาณ', 'น้ำหนัก'],
  unit: ['unit', 'หน่วย'],
};

interface ParsedColumns {
  activity: number; date: number; participants: number; amount: number; unit: number;
}

export interface ParsedSheet {
  rows: DeclaredRow[];
  /** Headers the file did not carry. `activity` and `date` are required. */
  missing: (keyof ParsedColumns)[];
}

/** One line of CSV, honouring quotes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',' || ch === '\t') { out.push(cell); cell = ''; }
    else cell += ch;
  }
  out.push(cell);
  return out.map((c) => c.trim());
}

/** ISO, or `null` when the cell is not a date this can read without guessing. */
function readDate(cell: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(cell);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // d/m/yyyy and d-m-yyyy, which is what a Thai Excel exports by default.
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(cell);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }
  return null;
}

const readNumber = (cell: string): number | null => {
  const n = Number(cell.replace(/,/g, ''));
  return cell.trim() !== '' && Number.isFinite(n) ? n : null;
};

export function parseDeclaredCsv(text: string): ParsedSheet {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return { rows: [], missing: ['activity', 'date'] };

  const header = splitCsvLine(lines[0]!).map((h) => h.toLowerCase());
  const at = (key: keyof ParsedColumns): number =>
    header.findIndex((h) => HEADERS[key].some((name) => h === name));

  const col: ParsedColumns = {
    activity: at('activity'), date: at('date'), participants: at('participants'),
    amount: at('amount'), unit: at('unit'),
  };
  const missing = (['activity', 'date'] as const).filter((k) => col[k] === -1);
  if (missing.length > 0) return { rows: [], missing };

  const cell = (cells: string[], i: number): string => (i === -1 ? '' : cells[i] ?? '');

  return {
    rows: lines.slice(1).map((line, i) => {
      const cells = splitCsvLine(line);
      return {
        // +2: one for the header row, one because a person counts from 1.
        line: i + 2,
        activity: cell(cells, col.activity),
        date: readDate(cell(cells, col.date)),
        participants: readNumber(cell(cells, col.participants)),
        amount: readNumber(cell(cells, col.amount)),
        unit: cell(cells, col.unit) === '' ? null : cell(cells, col.unit),
      };
    }),
    missing: [],
  };
}
