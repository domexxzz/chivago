/**
 * Where a funder gets entered, and what it funded.
 *
 * Moderator only. The funding figures on this page become the money printed
 * on the sponsor page and inside an ESG report, and a host who runs one quest
 * should not be able to set the number their own work is measured against.
 *
 * The form is deliberately plain: two fields and a kind for an organisation,
 * three numbers for a sponsorship. Everything else a contract contains - the
 * term, the parties, the signatures - is not modelled here on purpose,
 * because modelling it would suggest the platform holds the agreement, and it
 * does not. `basis` is the whole of what this page claims to know about that:
 * somebody typed it, or somebody signed something.
 */

import type { FundingBasis, Sponsor, Sponsorship } from '@chivago/core';
import { esc, html, layout, type Raw } from './html.ts';
import type { Locale } from './i18n.ts';

const baht = (n: number): string => `${n.toLocaleString('en-US')} THB`;

const KINDS: { key: string; en: string; th: string }[] = [
  { key: 'university', en: 'University', th: 'มหาวิทยาลัย' },
  { key: 'company', en: 'Company', th: 'บริษัท' },
  { key: 'brand', en: 'Brand', th: 'แบรนด์' },
  { key: 'ngo', en: 'NGO', th: 'องค์กรไม่แสวงกำไร' },
  { key: 'government', en: 'Government', th: 'หน่วยงานรัฐ' },
  { key: 'municipality', en: 'Municipality', th: 'เทศบาล' },
];

export interface OrgView {
  org: Sponsor;
  sponsorships: Sponsorship[];
  basis: FundingBasis;
}

export function organisationsPage(args: {
  locale: Locale;
  hostName: string;
  reviewer: string | null;
  csrf: string;
  views: OrgView[];
  quests: { id: string; name: string }[];
  error?: string | null;
  notice?: string | null;
}): string {
  const { locale, hostName, reviewer, csrf, views, quests } = args;

  const body = html`
    <h1>Organisations · องค์กรผู้สนับสนุน</h1>
    <p class="lede">
      Who funded what. These figures become the money on the sponsor page and in an
      ESG report.
      <span lang="th">ใครสนับสนุนอะไรบ้าง ตัวเลขนี้จะไปขึ้นที่หน้าผู้สนับสนุนและในรายงาน ESG</span>
    </p>

    ${args.error ? html`<p class="flash flash--bad">${esc(args.error)}</p>` : html``}
    ${args.notice ? html`<p class="flash">${esc(args.notice)}</p>` : html``}

    <!--
      The warning that makes the table safe to have at all. A row here is not a
      contract, and the pages downstream say so - but the person typing should
      be told before they type, not after.
    -->
    <section class="panel panel--muted">
      <h2>What this page is not · หน้านี้ไม่ใช่อะไร</h2>
      <p class="note">
        This is not where an agreement is made or kept. A row you add is marked
        <strong>declared</strong> and every page that shows its money says so, until
        somebody marks it signed. The verified counts it gets measured against are
        read from the ledger and nothing on this page can change them.
        <span lang="th">
          ที่นี่ไม่ใช่ที่ทำหรือเก็บสัญญา แถวที่เพิ่มจะถูกทำเครื่องหมายว่า “กรอกไว้” และทุกหน้าที่แสดงยอดจะบอกเช่นนั้น
          จนกว่าจะมีคนระบุว่าลงนามแล้ว ส่วนจำนวนที่ผ่านการตรวจอ่านจากบัญชีจริง หน้านี้แก้ไม่ได้
        </span>
      </p>
    </section>

    <section class="panel">
      <h2>Add an organisation · เพิ่มองค์กร</h2>
      <form method="post" action="/console/organisations">
        <input type="hidden" name="csrf" value="${esc(csrf)}">
        <p>
          <label>Name · ชื่อ<br>
            <input name="name" required maxlength="120" placeholder="Kasetsart University Sriracha">
          </label>
        </p>
        <p>
          <label>Thai name · ชื่อภาษาไทย<br>
            <input name="nameTh" maxlength="120" placeholder="มหาวิทยาลัยเกษตรศาสตร์ วิทยาเขตศรีราชา">
          </label>
        </p>
        <p>
          <label>Kind · ประเภท<br>
            <select name="kind">
              ${KINDS.map((k) => html`<option value="${esc(k.key)}">${esc(k.en)} · ${esc(k.th)}</option>`)}
            </select>
          </label>
        </p>
        <p><button type="submit">Add · เพิ่ม</button></p>
      </form>
    </section>

    ${views.length === 0
    ? html`<section class="panel"><p class="note">
        Nothing here yet. <span lang="th">ยังไม่มีองค์กรในระบบ</span>
      </p></section>`
    : html`${views.map((v) => orgSection(v, quests, csrf, locale))}`}
  `;

  return layout(
    {
      locale, hostName, reviewer, activeNav: 'organisations',
      title: 'Organisations', path: '/console/organisations', canModerate: true,
    },
    body,
  );
}

function orgSection(view: OrgView, quests: { id: string; name: string }[], csrf: string, locale: Locale): Raw {
  const { org, sponsorships, basis } = view;
  const names = new Map(quests.map((q) => [q.id, q.name]));
  const total = sponsorships.reduce((sum, s) => sum + s.fundedTHB, 0);
  const received = sponsorships.reduce((sum, s) => sum + s.receivedTHB, 0);

  return html`
    <section class="panel">
      <h2>${esc(org.name[locale])}</h2>
      <p class="note">
        ${esc(KINDS.find((k) => k.key === org.kind)?.en ?? org.kind)}
        · ${esc(basis === 'signed' ? 'signed agreement' : 'declared, not signed')}
        · ${baht(total)} committed, ${baht(received)} received
      </p>

      ${sponsorships.length === 0
    ? html`<p class="note">Nothing funded yet. <span lang="th">ยังไม่ได้สนับสนุนภารกิจใด</span></p>`
    : html`
      <table>
        <thead>
          <tr><th>Quest</th><th>Funded</th><th>Received</th><th>Per verified</th><th>Basis</th><th></th></tr>
        </thead>
        <tbody>
          ${sponsorships.map((s) => html`
            <tr>
              <td>${esc(names.get(s.questId) ?? s.questId)}</td>
              <td>${baht(s.fundedTHB)}</td>
              <!--
                Received sits beside Funded rather than replacing it, and the
                form is inline on the row: the moderator recording a transfer
                is looking at the agreement it belongs to, and a separate page
                would be one more place for the two figures to drift apart.
              -->
              <td>
                <form method="post" action="/console/organisations/${esc(org.id)}/paid">
                  <input type="hidden" name="csrf" value="${esc(csrf)}">
                  <input type="hidden" name="questId" value="${esc(s.questId)}">
                  <input name="receivedTHB" type="number" min="0" step="1"
                         value="${String(s.receivedTHB)}" style="width:110px">
                  <button type="submit">Save</button>
                </form>
                ${s.receivedAt === null
    ? html`<span class="muted">not received · ยังไม่ได้รับ</span>`
    : html`<span class="muted">${esc(s.receivedAt.slice(0, 10))}</span>`}
              </td>
              <td>${baht(s.perVerifiedTHB)}</td>
              <td>${esc(basis)}</td>
              <td>
                <form method="post" action="/console/organisations/${esc(org.id)}/unfund">
                  <input type="hidden" name="csrf" value="${esc(csrf)}">
                  <input type="hidden" name="questId" value="${esc(s.questId)}">
                  <button type="submit">Remove</button>
                </form>
              </td>
            </tr>`)}
        </tbody>
      </table>`}

      <h3>Fund a quest · สนับสนุนภารกิจ</h3>
      <form method="post" action="/console/organisations/${esc(org.id)}/fund">
        <input type="hidden" name="csrf" value="${esc(csrf)}">
        <p>
          <label>Quest · ภารกิจ<br>
            <select name="questId">
              ${quests.map((q) => html`<option value="${esc(q.id)}">${esc(q.name)}</option>`)}
            </select>
          </label>
        </p>
        <p>
          <label>Funded, THB · ยอดสนับสนุน<br>
            <input name="fundedTHB" type="number" min="0" step="1" required>
          </label>
        </p>
        <p>
          <label>Per verified submission, THB · จ่ายต่อหนึ่งงานที่ผ่านการตรวจ<br>
            <input name="perVerifiedTHB" type="number" min="0" step="1" required>
          </label>
        </p>
        <p>
          <label>
            <input type="checkbox" name="basis" value="signed">
            A signed agreement stands behind this · มีสัญญาที่ลงนามแล้วรองรับ
          </label>
        </p>
        <p><button type="submit">Save · บันทึก</button></p>
      </form>
    </section>`;
}
