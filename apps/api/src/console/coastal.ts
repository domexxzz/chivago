/**
 * The field team's page: did the model point at the shorelines that mattered?
 *
 * THIS IS THE PAGE THE DRIFT RUN WAS WRITTEN FOR. `coastal-drift.ts` in the
 * app says so in as many words - "a published, uncalibrated particle-run used
 * to decide where a field team should look first" - and until now there was no
 * field team page anywhere in the console. The run only ever appeared on the
 * traveller's map, where it was labelled a forecast of floating rubbish and
 * had nothing to be checked against.
 *
 * So the layout is a calibration sheet's, not a dashboard's:
 *
 *   1. the run, and whether it is still inside its own window, first - a
 *      ranking from an expired run is history, and saying so afterwards is too
 *      late;
 *   2. the agreement between the model's order and the scale's, with its n,
 *      or a plain statement that there is not enough evidence to say;
 *   3. the table, heaviest first, so the eye lands on what was really there;
 *   4. and the three things this page will not claim, with equal weight and
 *      not in a footnote.
 *
 * A reader who takes a per-segment kilogram off this page and publishes it as
 * the mass of that beach has been failed by the page, not by their own
 * carelessness. That is why `attributionNote` is rendered at the top of the
 * table rather than under it.
 */

import { attributionNote, MAX_ATTRIBUTION_M, type CoastalCalibration } from '../coastal-calibration.ts';
import { esc, html, layout, type Raw } from './html.ts';
import type { Locale } from './i18n.ts';

const en = (locale: Locale): boolean => locale === 'en';

const kg = (value: number): string =>
  `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })} kg`;

const whole = (value: number): string => value.toLocaleString('en-US');

/**
 * How to read a rank correlation, in words, for somebody who should not have
 * to remember what 0.42 means.
 *
 * Deliberately coarse. A three-way split is all the evidence supports when n
 * is a dozen shorelines, and a finer scale would invite reading a difference
 * between 0.31 and 0.38 that is not there.
 */
function agreementReading(rho: number, locale: Locale): string {
  if (rho >= 0.5) {
    return en(locale)
      ? 'The model is pointing at roughly the right shorelines.'
      : 'แบบจำลองชี้ไปที่ชายฝั่งที่ถูกต้องเป็นส่วนใหญ่';
  }
  if (rho > -0.2) {
    return en(locale)
      ? 'The model is not yet telling you much about where the weight is.'
      : 'แบบจำลองยังบอกไม่ได้มากนักว่าน้ำหนักอยู่ที่ไหน';
  }
  return en(locale)
    ? 'The model is pointing away from the weight. Worth a look at the run itself.'
    : 'แบบจำลองชี้สวนทางกับน้ำหนักที่เก็บได้ ควรกลับไปดูตัวผลจำลอง';
}

function figure(value: string, label: string, thai: string, lead = false): Raw {
  return html`
    <div class="figure ${lead ? 'figure--lead' : ''}">
      <div class="figure__value">${value}</div>
      <div class="figure__label">${label}</div>
      <div class="figure__label figure__label--th">${thai}</div>
    </div>`;
}

function runSection(report: CoastalCalibration, locale: Locale): Raw {
  const run = report.run;
  if (!run) {
    return html`
      <section class="card">
        <h2>${en(locale) ? 'No model run' : 'ไม่มีผลจำลอง'}</h2>
        <p class="warn">${en(locale)
          ? 'No drift run could be read for Ko Sichang, so there is nothing to compare the '
            + 'weights against. Every weighed cleanup below is listed as unattributed, which is '
            + 'what it is - not a zero.'
          : 'อ่านผลจำลองของเกาะสีชังไม่ได้ จึงไม่มีอะไรให้เทียบกับน้ำหนักที่เก็บได้ '
            + 'การเก็บขยะที่ชั่งแล้วทั้งหมดด้านล่างจึงถูกระบุว่ายังไม่ได้จับคู่กับชายฝั่ง ซึ่งคือสิ่งที่มันเป็น ไม่ใช่ศูนย์'}</p>
      </section>`;
  }
  return html`
    <section class="card">
      <h2>${en(locale) ? 'The run' : 'ผลจำลองที่ใช้'}</h2>
      <dl class="kv">
        <dt>${en(locale) ? 'Model' : 'แบบจำลอง'}</dt><dd>${run.model ?? '—'}</dd>
        <dt>${en(locale) ? 'Issued' : 'ออกผล'}</dt><dd>${run.issued ?? '—'}</dd>
        <dt>${en(locale) ? 'Window' : 'ช่วงเวลา'}</dt>
        <dd>${whole(run.window)} ${en(locale) ? 'hours' : 'ชั่วโมง'}</dd>
        <dt>${en(locale) ? 'Seeding' : 'การปล่อยอนุภาค'}</dt><dd>${run.seeding ?? '—'}</dd>
        <dt>${en(locale) ? 'Source' : 'แหล่งข้อมูล'}</dt><dd>${run.source}</dd>
      </dl>
      ${report.expired
        ? html`<p class="warn">${en(locale)
          ? 'THIS RUN HAS EXPIRED. It described one window of wind and current, and that window '
            + 'has closed, so the ranking below is history rather than tasking. The traveller’s '
            + 'map stops drawing it for the same reason.'
          : 'ผลจำลองชุดนี้หมดอายุแล้ว มันอธิบายลมและกระแสน้ำช่วงเดียว ซึ่งผ่านไปแล้ว '
            + 'อันดับด้านล่างจึงเป็นประวัติ ไม่ใช่การสั่งงาน แผนที่ฝั่งนักท่องเที่ยวก็หยุดวาดด้วยเหตุผลเดียวกัน'}</p>`
        : ''}
      <p class="warn">${en(locale)
        ? 'The run is uncalibrated and its particles start on an even offshore grid, not from '
          + 'debris anybody observed. A contact count is not a count of rubbish.'
        : 'ผลจำลองยังไม่ผ่านการสอบเทียบ และอนุภาคเริ่มจากตะแกรงสม่ำเสมอนอกชายฝั่ง '
          + 'ไม่ใช่จากขยะที่ใครตรวจพบ จำนวนครั้งที่แตะฝั่งไม่ใช่จำนวนชิ้นขยะ'}</p>
    </section>`;
}

function agreementSection(report: CoastalCalibration, locale: Locale): Raw {
  const agreement = report.agreement;
  return html`
    <section class="card">
      <h2>${en(locale) ? 'Model against scale' : 'แบบจำลองเทียบกับตาชั่ง'}</h2>
      ${agreement
        ? html`
          <div class="figures">
            ${figure(
              agreement.rho.toFixed(2),
              'Rank agreement (Spearman)',
              'ความสอดคล้องของอันดับ',
              true,
            )}
            ${figure(
              whole(agreement.segments),
              'Shorelines with a weight',
              'ชายฝั่งที่มีน้ำหนักจริง',
            )}
          </div>
          <p>${agreementReading(agreement.rho, locale)}</p>
          <p class="muted">${en(locale)
            ? 'Ranks, not values: a contact count and a kilogram are different quantities and no '
              + 'straight line relates them. Only shorelines with a measured weight take part - a '
              + 'shoreline nobody has cleaned is an absence of evidence, not a zero.'
            : 'เทียบอันดับ ไม่ใช่ค่า เพราะจำนวนครั้งที่แตะฝั่งกับกิโลกรัมเป็นปริมาณต่างชนิดและไม่มีเส้นตรงเชื่อมกัน '
              + 'นับเฉพาะชายฝั่งที่มีน้ำหนักวัดได้ ชายฝั่งที่ยังไม่มีใครไปเก็บคือการไม่มีหลักฐาน ไม่ใช่ศูนย์'}</p>`
        : html`
          <p>${en(locale)
            ? 'Not enough cleaned shorelines in this period to say anything about agreement. This '
              + 'is the honest answer, not a missing figure: a coefficient off four beaches would '
              + 'be a coin toss with a decimal point.'
            : 'จำนวนชายฝั่งที่เก็บขยะแล้วในช่วงนี้ยังน้อยเกินกว่าจะบอกเรื่องความสอดคล้องได้ '
              + 'นี่คือคำตอบที่ตรงไปตรงมา ไม่ใช่ตัวเลขที่หายไป ค่าสหสัมพันธ์จากชายหาดสี่แห่งคือการโยนหัวก้อยที่มีจุดทศนิยม'}</p>`}
    </section>`;
}

/*
  THE SEGMENT NUMBER IS NOT DECORATION. The sidecar's `near` is the nearest
  NAMED PLACE, not a name for the segment, so a coast of 43 pieces produces
  eight rows all called หาดท่าวัง. Seen on the rendered page: without the id
  the table cannot answer the only question a field team asks of it - which
  stretch do we walk - and two rows that differ by 200 metres and 40 contacts
  look like the same row twice.
*/
/**
 * Where a real calibration actually stands, which is not what the agreement
 * above measures.
 *
 * The agreement asks whether TODAY's run orders the shorelines the way the
 * period's weights do - a sanity check, and a useful one. Calibration asks
 * something stricter: did the run that was STANDING when somebody filled a bag
 * predict that bag. Those are different questions and the page would mislead
 * by answering only the easy one.
 */
function calibrationSection(report: CoastalCalibration, locale: Locale): Raw {
  const set = report.calibrationSet;
  return html`
    <section class="card">
      <h2>${en(locale) ? 'Towards a calibration' : 'ระยะทางสู่การสอบเทียบ'}</h2>
      <div class="figures">
        ${figure(whole(set.paired), 'Cleanups paired with their own run', 'การเก็บที่จับคู่กับผลจำลองของวันนั้นได้', true)}
        ${figure(whole(set.unpaired), 'With no run kept for that moment', 'ไม่มีผลจำลองของช่วงเวลานั้นเก็บไว้')}
        ${figure(whole(set.runsKept), 'Runs in the archive', 'ผลจำลองที่เก็บไว้ทั้งหมด')}
      </div>
      <p>${en(locale)
        ? 'A cleanup tests the run that was standing when somebody filled the bag, not whichever '
          + 'run happens to be on disk today. Until the archive existed, every run but the latest '
          + 'was overwritten by the next one - so nothing collected before it can ever be paired, '
          + 'and that is counted above rather than hidden.'
        : 'การเก็บขยะหนึ่งครั้งทดสอบผลจำลองที่ยืนอยู่ตอนที่คนกำลังเก็บ ไม่ใช่ผลจำลองที่บังเอิญอยู่บนดิสก์วันนี้ '
          + 'ก่อนจะมีคลัง ผลจำลองทุกชุดยกเว้นชุดล่าสุดถูกชุดถัดไปเขียนทับ '
          + 'ของที่เก็บก่อนหน้านั้นจึงจับคู่ไม่ได้ตลอดไป และนับไว้ข้างบนแทนที่จะซ่อน'}</p>
      ${set.archiveFrom
        ? html`<p class="muted">${en(locale) ? 'Archive starts' : 'คลังเริ่มเก็บตั้งแต่'}: ${set.archiveFrom}</p>`
        : html`<p class="warn">${en(locale)
          ? 'The archive is empty. It fills the first time this page reads a published run, so it '
            + 'starts today and not before.'
          : 'คลังยังว่าง มันจะเริ่มเก็บครั้งแรกที่หน้านี้อ่านผลจำลองที่เผยแพร่อยู่ '
            + 'จึงเริ่มนับจากวันนี้ ไม่ใช่ย้อนหลัง'}</p>`}
    </section>`;
}

function table(report: CoastalCalibration, locale: Locale): Raw {
  if (report.segments.length === 0) {
    return html`<p class="muted">${en(locale)
      ? 'No shorelines to show.'
      : 'ไม่มีชายฝั่งที่จะแสดง'}</p>`;
  }
  return html`
    <table class="table">
      <thead>
        <tr>
          <th>${en(locale) ? 'Segment and shoreline' : 'ช่วงและชายฝั่ง'}</th>
          <th class="num">${en(locale) ? 'Weighed' : 'น้ำหนักที่ชั่งได้'}</th>
          <th class="num">${en(locale) ? 'Cleanups' : 'ครั้งที่เก็บ'}</th>
          <th class="num">${en(locale) ? 'Modelled contacts' : 'ครั้งที่แบบจำลองแตะฝั่ง'}</th>
          <th class="num">${en(locale) ? 'Nearest pin' : 'หมุดใกล้สุด'}</th>
        </tr>
      </thead>
      <tbody>
        ${report.segments.map((segment) => html`
          <tr class="${segment.weightKg > 0 ? 'has-evidence' : ''}">
            <td>
              <span class="seg-id">${whole(segment.id)}</span>
              ${segment.name ?? (en(locale) ? 'unnamed shoreline' : 'ชายฝั่งไม่มีชื่อ')}
            </td>
            <td class="num">${segment.weightKg > 0 ? kg(segment.weightKg) : '—'}</td>
            <td class="num">${segment.cleanups > 0 ? whole(segment.cleanups) : '—'}</td>
            <td class="num">${whole(segment.predicted)}</td>
            <td class="num">${segment.nearestMetres === null
              ? '—'
              : `${whole(segment.nearestMetres)} m`}</td>
          </tr>`)}
      </tbody>
    </table>`;
}

export function coastalPage(
  locale: Locale,
  hostName: string,
  reviewer: string | null,
  report: CoastalCalibration,
): string {
  const body = html`
    <h1>${en(locale) ? 'Shoreline calibration' : 'สอบเทียบชายฝั่ง'}</h1>
    <p class="lede">${en(locale)
      ? 'What the drift model predicted for each shoreline of Ko Sichang, against what cleanup '
        + 'crews actually weighed there.'
      : 'สิ่งที่แบบจำลองการพัดพาคาดไว้สำหรับแต่ละชายฝั่งของเกาะสีชัง เทียบกับน้ำหนักที่ทีมเก็บขยะชั่งได้จริง'}</p>

    <form method="get" class="period">
      <label>${en(locale) ? 'From' : 'จาก'}
        <input type="date" name="from" value="${esc(report.from)}"></label>
      <label>${en(locale) ? 'To' : 'ถึง'}
        <input type="date" name="to" value="${esc(report.to)}"></label>
      <button type="submit">${en(locale) ? 'Show' : 'แสดง'}</button>
    </form>

    ${runSection(report, locale)}
    ${agreementSection(report, locale)}
    ${calibrationSection(report, locale)}

    <section class="card">
      <h2>${en(locale) ? 'Shoreline by shoreline' : 'ทีละชายฝั่ง'}</h2>
      <div class="figures">
        ${figure(kg(report.totals.weightKg), 'Weighed in period', 'น้ำหนักรวมในช่วงนี้', true)}
        ${figure(whole(report.totals.cleanups), 'Approved cleanups', 'การเก็บที่อนุมัติแล้ว')}
        ${figure(whole(report.totals.predicted), 'Modelled contacts', 'ครั้งที่แบบจำลองแตะฝั่ง')}
      </div>
      <p class="warn">${en(locale) ? attributionNote.en : attributionNote.th}</p>
      ${table(report, locale)}
      ${report.unattributed.cleanups > 0
        ? html`<p class="muted">${en(locale)
          ? `${whole(report.unattributed.cleanups)} weighed cleanup(s), `
            + `${kg(report.unattributed.weightKg)}, could not be matched to any shoreline: the `
            + `quest pin sat further than ${whole(MAX_ATTRIBUTION_M)} m from one. Listed here `
            + 'rather than dropped, so the totals above still equal the rows.'
          : `มีการเก็บที่ชั่งแล้ว ${whole(report.unattributed.cleanups)} ครั้ง `
            + `รวม ${kg(report.unattributed.weightKg)} ที่จับคู่กับชายฝั่งไหนไม่ได้ `
            + `เพราะหมุดเควสอยู่ไกลกว่า ${whole(MAX_ATTRIBUTION_M)} เมตร `
            + 'แสดงไว้ที่นี่แทนการตัดออก เพื่อให้ยอดรวมด้านบนยังเท่ากับผลรวมของแถว'}</p>`
        : ''}
    </section>

    <section class="card">
      <h2>${en(locale) ? 'What this page does not claim' : 'สิ่งที่หน้านี้ไม่ได้อ้าง'}</h2>
      <ul class="limits">
        <li>${en(locale)
          ? 'Not a mass per beach. A kilogram is credited to the shoreline nearest its quest pin, '
            + 'and a cleanup that walked two segments is credited entirely to one.'
          : 'ไม่ใช่น้ำหนักต่อชายหาด น้ำหนักถูกนับให้ชายฝั่งที่ใกล้หมุดเควสที่สุด '
            + 'และการเก็บที่เดินผ่านสองช่วงจะถูกนับให้ช่วงเดียวทั้งหมด'}</li>
        <li>${en(locale)
          ? 'Not a calibrated model, and nothing here can make it one: the model lives in '
            + 'electiction/chivargo-sichang, and calibrating it means changing its seeding and '
            + 'fitting its parameters there. What this page can do is keep the runs and count the '
            + 'evidence, so that work has something to fit against.'
          : 'ไม่ใช่แบบจำลองที่สอบเทียบแล้ว และไม่มีอะไรที่นี่ทำให้มันเป็นได้ '
            + 'ตัวแบบจำลองอยู่ใน electiction/chivargo-sichang การสอบเทียบคือการเปลี่ยนการปล่อยอนุภาคและปรับพารามิเตอร์ที่นั่น '
            + 'สิ่งที่หน้านี้ทำได้คือเก็บผลจำลองไว้และนับหลักฐาน เพื่อให้งานนั้นมีอะไรให้ปรับเข้าหา'}</li>
        <li>${en(locale)
          ? 'Not everything that was collected. Only approved proofs that carry a weight appear: '
            + 'an unreviewed proof is a claim and a rejected one is a claim that failed.'
          : 'ไม่ใช่ทุกอย่างที่เก็บได้ แสดงเฉพาะหลักฐานที่อนุมัติแล้วและมีน้ำหนักกำกับ '
            + 'หลักฐานที่ยังไม่ตรวจคือคำกล่าวอ้าง และที่ถูกปฏิเสธคือคำกล่าวอ้างที่ไม่ผ่าน'}</li>
      </ul>
    </section>`;

  return layout(
    {
      title: en(locale) ? 'Shoreline calibration' : 'สอบเทียบชายฝั่ง',
      locale,
      hostName,
      reviewer,
      signedIn: true,
      activeNav: 'coastal',
      path: '/console/coastal',
    },
    body,
  );
}
