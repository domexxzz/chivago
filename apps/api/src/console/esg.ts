/**
 * The ESG partner's page.
 *
 * The sponsor page answers "what did my money do". This answers the narrower
 * question a partner asks in filing season: what can I put in the report, and
 * what will survive somebody asking how I know.
 *
 * So the layout is an auditor's, not a marketer's. Period first — a figure
 * with no dates on it is not a reportable figure. Then the boundary, then the
 * numbers, then, with equal weight and not in a footnote, the three things
 * this report will not claim. A reader who takes the verified count and calls
 * it a carbon saving has been failed by the page, not by their own
 * carelessness.
 */

import {
  ESG_PILLARS, PILLAR_LABEL, esgHeadline,
  type EsgReport, type FundingBasis, type Sponsor,
} from '@chivago/core';
import { esc, html, layout, type Raw } from './html.ts';
import { basisNote, orgPicker } from './org-parts.ts';
import type { Locale } from './i18n.ts';

const baht = (n: number): string => `${n.toLocaleString('en-US')} THB`;

function figure(value: string, label: string, thai: string, tone: 'lead' | 'plain' = 'plain'): Raw {
  return html`
    <div class="figure ${tone === 'lead' ? 'figure--lead' : ''}">
      <div class="figure__value">${value}</div>
      <div class="figure__label">${label}</div>
      <div class="figure__label figure__label--th">${thai}</div>
    </div>`;
}

export function esgPage(
  locale: Locale, hostName: string, reviewer: string | null,
  /** Null before any organisation exists, which is how a deployment starts. */
  report: EsgReport | null,
  organisations: Sponsor[] = [],
  basis: FundingBasis = 'declared',
): string {
  const th = locale === 'th';

  // Nothing funded is nothing to file. Said plainly, with no example partner.
  if (!report) {
    return layout(
      {
        locale, hostName, reviewer, activeNav: 'esg', title: 'ESG', path: '/console/esg',
      },
      html`
        <h1>ESG</h1>
        <p class="lede">No organisation has been added yet.
          <span lang="th">ยังไม่มีองค์กรผู้สนับสนุนในระบบ</span></p>
        <section class="panel">
          <p class="note">
            A report needs a funder and a period. Until a moderator adds one there is
            no boundary to report inside, and this page will not draw one.
            <span lang="th">รายงานต้องมีผู้สนับสนุนและช่วงเวลา ถ้ายังไม่มี หน้านี้จะไม่สร้างขอบเขตขึ้นมาเอง</span>
          </p>
        </section>`,
    );
  }

  const headline = esgHeadline(report);

  const body = html`
    <h1>${esc(report.partner.name[locale])}</h1>
    ${orgPicker(organisations, report.partner.id, '/console/esg')}
    ${basisNote(basis)}

    <!--
      The dates lead. Every other number on this page is meaningless without
      them, and a report that states a figure before it states its period is
      inviting the figure to be quoted on its own.
    -->
    <p class="lede">
      <strong>${esc(report.period.from)} → ${esc(report.period.to)}</strong>
    </p>
    <p class="lede">${esc(th ? headline.th : headline.en)}</p>

    <section class="panel panel--muted">
      <h2>What is counted · ขอบเขตของรายงาน</h2>
      <p>${esc(th ? report.boundary.th : report.boundary.en)}</p>
      <p class="note">${esc(th ? report.assurance.th : report.assurance.en)}</p>
      <!--
        The sentence a filer cannot get anywhere else, in the section about
        what the report covers rather than in a footnote. When it reads as a
        guarantee it has been earned: every approval in the period had exactly
        one funder, checked across every partner on this platform.
      -->
      <p class="${report.sharedVerified > 0 ? 'note danger' : 'note'}"
         ${report.sharedVerified > 0 ? 'style="padding:12px"' : ''}>
        <strong>One activity, one filer ·  หนึ่งกิจกรรม หนึ่งผู้ยื่น</strong><br>
        ${esc(th ? report.exclusivity.th : report.exclusivity.en)}
      </p>
      <p class="note">${esc(th ? report.exclusivityBoundary.th : report.exclusivityBoundary.en)}</p>
      ${report.excludedUnclassified > 0
    ? html`
      <p class="note">
        <strong>${report.excludedUnclassified}</strong> funded ${report.excludedUnclassified === 1 ? 'activity has' : 'activities have'}
        no ESG classification and ${report.excludedUnclassified === 1 ? 'is' : 'are'} excluded from every figure below.
        <span lang="th">กิจกรรมที่ยังไม่ได้จัดหมวด ESG ไม่ถูกนับในตัวเลขทั้งหมดนี้</span>
      </p>`
    : ''}
    </section>

    <section class="figures">
      ${figure(String(report.verified), 'Activities verified', 'กิจกรรมที่ผ่านการตรวจ', 'lead')}
      ${figure(
    String(report.exclusiveVerified), 'Yours alone', 'ของรายนี้รายเดียว',
  )}
      ${figure(String(report.participants), 'People involved', 'จำนวนคน')}
      ${figure(baht(report.paidTHB), 'Reached hosts', 'ถึงมือผู้จัด')}
      ${figure(baht(report.fundedTHB), 'Committed', 'ที่ให้ไว้')}
    </section>

    <!--
      People are counted DISTINCTLY, and the note says so. Summing per-activity
      participants is how "we reached 10,000 people" happens when 2,000 did
      five things each - arithmetic rather than dishonesty, which is exactly
      why it survives review.
    -->
    <p class="note">
      People are counted once each, however many activities they joined.
      <span lang="th">นับคนหนึ่งคนครั้งเดียว ไม่ว่าจะร่วมกี่กิจกรรม</span>
    </p>

    <section class="panel">
      <h2>By pillar · แยกตามเสาหลัก</h2>
      <table>
        <thead>
          <tr><th>Pillar</th><th>Activities</th><th>Verified</th><th>People</th><th>To hosts</th></tr>
        </thead>
        <tbody>
          ${ESG_PILLARS.map((pillar) => {
    const p = report.byPillar[pillar];
    return html`
            <tr>
              <td>${esc(PILLAR_LABEL[pillar].en)} · <span lang="th">${esc(PILLAR_LABEL[pillar].th)}</span></td>
              <td>${p.activities}</td>
              <td><strong>${p.verified}</strong></td>
              <td>${p.participants}</td>
              <td>${baht(p.paidTHB)}</td>
            </tr>`;
  })}
        </tbody>
      </table>
      <p class="note">
        Pillar totals count people once within each pillar. The figure above
        counts them once across the whole report, so the pillars do not add up
        to it — and should not.
        <span lang="th">ยอดรวมของทั้งรายงานไม่เท่ากับผลบวกของสามเสา เพราะนับคนซ้ำไม่ได้</span>
      </p>
    </section>

    <section class="panel">
      <h2>Every activity · รายกิจกรรม</h2>
      ${report.activities.length === 0
    ? html`<p class="note">No verified activity in this period. <span lang="th">ยังไม่มีกิจกรรมที่ผ่านการตรวจในช่วงนี้</span></p>`
    : html`
      <table>
        <thead>
          <tr><th>Activity</th><th>Pillar</th><th>Verified by</th><th>Verified</th><th>To host</th></tr>
        </thead>
        <tbody>
          ${report.activities.map((a) => html`
            <tr>
              <td>${esc(a.name.en)}</td>
              <td>${esc(PILLAR_LABEL[a.pillar].en)}</td>
              <!--
                The host's name is a column, not a footnote. The entire
                assurance claim on this page is that a named party stood
                behind each row.
              -->
              <td>${esc(a.hostName)}</td>
              <td><strong>${a.verified}</strong></td>
              <td>${baht(a.paidTHB)}</td>
            </tr>`)}
        </tbody>
      </table>`}
    </section>

    <!--
      Equal weight, and above the fold on a phone. These three are the reason
      to believe the rest of the page.
    -->
    <section class="panel panel--muted">
      <h2>What this report does not claim · สิ่งที่รายงานนี้ไม่ได้อ้าง</h2>
      <ul>
        ${report.notClaimable.map((n) => html`
          <li>
            ${esc(n.en)}
            <span lang="th" class="note">${esc(n.th)}</span>
          </li>`)}
      </ul>
    </section>`;

  return layout(
    {
      title: 'ESG',
      locale,
      hostName,
      reviewer,
      signedIn: true,
      activeNav: 'esg',
      path: '/console/esg',
    },
    body,
  );
}
