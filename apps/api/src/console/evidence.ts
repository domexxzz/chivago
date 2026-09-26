/**
 * The pack an assurance provider is handed.
 *
 * The public page at /verify/:id is the statement laid out for a stranger.
 * This is the layer under it, and it is NOT public: a row per approval is a
 * person's day, even with a reference where the name would be. It opens from
 * the console, for the host whose statement it is.
 *
 * The reconciliation leads. Everything below it is the sample.
 */

import {
  EVIDENCE_LEVEL, EVIDENCE_PRIVACY, SAMPLING_NOTE,
  type ActivityStatement, type EvidenceItem, type Reconciliation,
} from '@chivago/core';
import { esc, html, layout, type Raw } from './html.ts';
import type { Locale } from './i18n.ts';

const kg = (n: number | null): string =>
  n === null ? '—' : `${n.toLocaleString('en-US', { maximumFractionDigits: 1 })} kg`;

const STANDING_LABEL: Record<EvidenceItem['standing'], [string, string]> = {
  approved: ['Stands', 'ยังคงอยู่'],
  withdrawn: ['Withdrawn since', 'ถูกเพิกถอนภายหลัง'],
  gone: ['No record', 'ไม่พบบันทึก'],
};

export function evidencePage(args: {
  locale: Locale;
  hostName: string;
  statement: ActivityStatement;
  items: EvidenceItem[];
  reconciliation: Reconciliation;
  origin: string;
}): string {
  const { locale, hostName, statement, items, reconciliation: r, origin } = args;
  const th = locale === 'th';

  return layout({
    locale,
    hostName,
    title: `Evidence ${statement.id}`,
    signedIn: true,
    activeNav: 'statement',
    path: `/console/evidence?id=${statement.id}`,
  }, html`
    <h1>Evidence pack</h1>
    <p class="muted">
      ${esc(statement.id)} · ${esc(statement.period.from)} — ${esc(statement.period.to)}
      · <a href="${esc(origin)}/statements/${esc(statement.id)}">the statement itself</a>
    </p>

    <!--
      The reconciliation leads, and it is the same shape whether the answer is
      comfortable or not. A pack that buried a withdrawal below the table
      would be a pack nobody could rely on.
    -->
    <section class="panel ${r.agrees ? '' : 'panel--muted'}">
      <h2>Does the evidence still match · หลักฐานยังตรงกับเอกสารหรือไม่</h2>
      <p class="${r.agrees ? 'lede' : 'note danger'}" ${r.agrees ? '' : 'style="padding:12px"'}>
        ${esc(th ? r.verdict.th : r.verdict.en)}
      </p>
      <table>
        <tbody>
          <tr><th>Stated when issued · ที่ระบุตอนออกเอกสาร</th><td>${r.stated}</td></tr>
          <tr><th>Still standing · ยังคงอยู่</th><td>${r.standing}</td></tr>
          ${r.withdrawn > 0
    ? html`<tr><th>Withdrawn since · ถูกเพิกถอนภายหลัง</th><td>${r.withdrawn}</td></tr>` : ''}
          ${r.gone > 0
    ? html`<tr><th>No record · ไม่พบบันทึก</th><td>${r.gone}</td></tr>` : ''}
          ${r.appeared > 0
    ? html`<tr><th>Approved after issue, not part of it · ผ่านการตรวจหลังออกเอกสาร ไม่อยู่ในเอกสารนี้</th><td>${r.appeared}</td></tr>` : ''}
        </tbody>
      </table>
      <p class="note">${esc(th ? EVIDENCE_LEVEL.th : EVIDENCE_LEVEL.en)}</p>
      <p class="note">${esc(th ? SAMPLING_NOTE.th : SAMPLING_NOTE.en)}</p>
      <p class="note">${esc(th ? EVIDENCE_PRIVACY.th : EVIDENCE_PRIVACY.en)}</p>
    </section>

    <section class="panel">
      <h2>The sample · รายการสำหรับสุ่มตรวจ</h2>
      <p class="actions">
        <a href="/console/evidence?id=${esc(statement.id)}&amp;format=csv">Download CSV · ดาวน์โหลด CSV</a>
      </p>
      ${items.length === 0
    ? html`<p class="note">No approvals in this period. <span lang="th">ไม่มีรายการในช่วงนี้</span></p>`
    : html`
      <table>
        <thead>
          <tr>
            <th>Day</th><th>Quest</th><th>Participant</th>
            <th>Reviewed by</th><th>Photos</th><th>Weight</th><th>Standing</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((i) => html`
            <tr>
              <td>${esc(i.day)}</td>
              <td>${esc(th ? i.questName.th : i.questName.en)}</td>
              <td><code>${esc(i.participantRef)}</code></td>
              <td>${esc(i.reviewedBy ?? '—')}</td>
              <td>${i.photos}</td>
              <td>${esc(kg(i.weightKg))}</td>
              <td>${esc(th ? STANDING_LABEL[i.standing][1] : STANDING_LABEL[i.standing][0])}</td>
            </tr>`)}
        </tbody>
      </table>`}
    </section>`);
}

/**
 * The same rows as a file.
 *
 * The header carries the statement id, its digest and the verdict, so a sheet
 * forwarded to an assurer still says which document it belongs to and whether
 * it agreed with it on the day it was taken.
 */
export function evidenceCsv(
  statement: ActivityStatement, items: readonly EvidenceItem[], r: Reconciliation, origin: string,
): string {
  const q = (v: string | number | null): string => {
    const s = v === null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [
    `# ChivaGo evidence pack,${q(statement.id)}`,
    `# statement,${q(`${origin}/statements/${statement.id}`)}`,
    `# digest,${q(statement.digest)}`,
    `# period,${q(statement.period.from)},${q(statement.period.to)}`,
    `# taken,${q(new Date().toISOString())}`,
    `# reconciliation,${q(r.verdict.en)}`,
    `# level,${q(EVIDENCE_LEVEL.en)}`,
    `# participants,${q(EVIDENCE_PRIVACY.en)}`,
    '',
    'day,quest_id,quest,participant_ref,reviewed_by,photos,weight_kg,standing',
  ];
  for (const i of items) {
    lines.push([
      q(i.day), q(i.questId), q(i.questName.en), q(i.participantRef),
      q(i.reviewedBy), q(i.photos), q(i.weightKg), q(i.standing),
    ].join(','));
  }
  return `${lines.join('\n')}\n`;
}
