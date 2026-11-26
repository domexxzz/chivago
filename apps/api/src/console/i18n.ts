/**
 * Console localisation.
 *
 * WHY BOTH THE CONSOLE AND THE APP PICK ONE LANGUAGE
 *
 * The app used to print English and Thai together on every screen. At phone
 * width that doubled the length of everything, so it now speaks one language
 * chosen on the Account screen (see apps/mobile/src/i18n/locale.ts). The
 * console has worked that way from the start, for a related reason: its users
 * are a known set of staff at municipal offices, NGOs and hotel partners
 * working through a queue, and doubling every label in a dense review table
 * would halve their scanning speed.
 *
 * Default is Thai: three of the four pilot hosts are Thai organisations, and
 * serving them is the point of the tool.
 *
 * Chinese is here because the app serves Chinese-reading travellers, and a
 * reviewer reading their submissions should be able to work in the language
 * the submission was written in.
 *
 * WHERE THE THAI COPY LIVES
 * Console chrome is here. Anything a VOLUNTEER reads - notably the rejection
 * reasons - lives in packages/core/src/strings.ts with the rest of the app copy,
 * because it is rendered into the app, not into this page.
 *
 * REVIEW STATUS: th strings are DESIGN DRAFT, not yet reviewed by a native
 * speaker. Two files to review: this one and packages/core/src/strings.ts.
 */

import type { Localised } from '@chivago/core';

export type Locale = 'th' | 'en' | 'zh';

export const LOCALES: Locale[] = ['th', 'en', 'zh'];
export const DEFAULT_LOCALE: Locale = 'th';
export const LOCALE_COOKIE = 'chivago_lang';

export const isLocale = (v: unknown): v is Locale => v === 'th' || v === 'en' || v === 'zh';

/** Native names, so the switcher reads correctly whichever side you are on. */
export const LOCALE_NAMES: Record<Locale, string> = { th: 'ไทย', en: 'English', zh: '中文' };

interface Copy {
  th: string;
  en: string;
  /** Simplified Chinese. Optional for the same reason as on `Localised`: see packages/core/src/types.ts. */
  zh?: string;
}

/**
 * Thai first in the argument list because Thai is the console's default, and
 * the default is the one a writer should have to think about hardest.
 */
const c = (th: string, en: string, zh?: string): Copy => ({ th, en, zh });

/** The order to try when the chosen language has nothing. Mirrors the app's `t()`. */
const FALLBACK: Record<Locale, readonly (keyof Copy)[]> = {
  th: ['th', 'en', 'zh'],
  en: ['en', 'th', 'zh'],
  zh: ['zh', 'en', 'th'],
};

/**
 * One string in the reviewer's language, or the best thing available.
 *
 * Exported because console pages render plenty of copy that does NOT live in
 * `consoleStrings` - an organisation's own name, a rejection reason from
 * packages/core - and those used to be written `value[locale]`. That reads
 * fine with two required languages and returns `undefined` the moment one of
 * them is optional, which is how a page ends up printing "undefined" to a
 * municipal officer. Index through here instead.
 */
export const loc = (entry: Localised | Copy, locale: Locale): string => {
  for (const key of FALLBACK[locale]) {
    const s = (entry as Copy)[key];
    if (s) return s;
  }
  return '';
};

export const consoleStrings = {
  brand: c('ChivarGo · ระบบตรวจสำหรับผู้จัดภารกิจ', 'ChivarGo · Host Console', 'ChivarGo · 主办方审核台'),

  signIn: c('เข้าสู่ระบบ', 'Sign in', '登录'),
  signOut: c('ออกจากระบบ', 'Sign out', '退出登录'),
  signInTitle: c('ตรวจสอบหลักฐานภารกิจ', 'Review submissions', '审核提交的证据'),
  signInBlurb: c(
    'กรอกรหัสเข้าใช้งานที่ออกให้หน่วยงานของคุณ ชื่อของคุณจะถูกบันทึกไว้กับทุกการตัดสิน เพื่อให้ตรวจสอบย้อนหลังได้',
    'Enter the access key issued to your organisation. Your name is recorded against every decision you make, so the award can be attributed later.',
    '请输入发给贵机构的访问密钥。您的姓名会记录在您作出的每一项决定上，以便日后追溯奖励的归属。',
  ),
  yourName: c('ชื่อของคุณ', 'Your name', '您的姓名'),
  accessKey: c('รหัสเข้าใช้งาน', 'Access key', '访问密钥'),
  signInFailed: c('ไม่พบชื่อและรหัสที่ตรงกัน', 'That name and key combination was not recognised.', '该姓名与密钥的组合无法识别。'),
  signedInAs: c('เข้าสู่ระบบในชื่อ', 'Signed in as', '当前登录身份'),

  queue: c('คิวรอตรวจ', 'Queue', '队列'),
  history: c('ประวัติ', 'History', '历史记录'),

  // -- Review moderation ---------------------------------------------------
  moderation: c('รีวิว', 'Reviews', '评价'),
  sponsor: c('ผู้สนับสนุน', 'Sponsor', '赞助方'),
  esg: c('รายงาน ESG', 'ESG', 'ESG 报告'),
  statement: c('รายการกิจกรรม', 'Statement', '报表'),
  quests: c('ภารกิจและตัวชี้วัด', 'Quests & KPI', '任务与 KPI'),
  questDesk: c('สร้างกิจกรรม', 'Write activities', '创建活动'),
  reviewDeclared: c('ทบทวนไฟล์', 'Review a file', '审核文件'),
  stories: c('สตอรี่', 'Stories', '故事'),
  storiesLive: c('กำลังแสดงบนบอร์ด', 'On the board now', '正在展示'),
  storiesLiveNote: c('กดซ่อนแล้วหายจากหมุดและบอร์ดทันที และนำกลับได้จนกว่าจะหมดอายุ', 'Hide takes a story off its pin and the board at once. It can be put back until it expires.', '隐藏后会立即从地图和看板移除，过期前可以恢复。'),
  storiesLiveEmpty: c('ยังไม่มีสตอรี่บนบอร์ด', 'No stories on the board.', '看板上没有故事。'),
  storiesHidden: c('ซ่อนไว้', 'Hidden', '已隐藏'),
  storiesHiddenEmpty: c('ไม่มีสตอรี่ที่ซ่อนไว้', 'Nothing hidden.', '没有隐藏的故事。'),
  storyAuto: c('ขึ้นอัตโนมัติ ยังไม่มีคนตรวจ', 'Auto-approved, nobody has checked it', '自动通过，尚无人审核'),
  storyExpires: c('หมดอายุ {when}', 'Expires {when}', '{when} 过期'),
  storyHide: c('ซ่อน', 'Hide', '隐藏'),
  storyPutBack: c('นำกลับขึ้นบอร์ด', 'Put back', '恢复展示'),
  storyNoCaption: c('ไม่มีคำบรรยาย', 'No caption', '无说明'),
  inquiries: c('คำสอบถาม', 'Inquiries', '咨询'),
  organisations: c('องค์กร', 'Organisations', '机构'),
  applications: c('ผู้ประกอบการ', 'Operators', '商家'),
  periodOutOfOrder: c('วันที่เริ่มต้นอยู่หลังวันที่สิ้นสุด เลือกช่วงวันที่ใหม่', 'The start date is after the end date. Choose the period again.', '开始日期晚于结束日期。请重新选择时间段。'),
  moderationTitle: c('ดูแลรีวิวจากนักเดินทาง', 'Traveller reviews', '旅行者评价'),
  moderationBlurb: c(
    'ทุกรีวิวที่นี่มาจากคนที่เช็กอินที่สถานที่นั้นจริง การยืนยันนี้ทำให้รีวิวปลอมแพงขึ้น แต่ไม่ได้ทำให้เป็นไปไม่ได้ — คนที่ไปจริงก็ยังเขียนเรื่องที่ต้องนำออกได้',
    'Every review here is from someone who checked in at that place. That makes a fake review expensive, not impossible — someone who really went can still write something that has to come down.',
    '此处的每一条评价都来自在该地点签到过的人。这让虚假评价的代价更高，但并非不可能——真正去过的人同样可能写出必须下架的内容。',
  ),
  filterAppeals: c('อุทธรณ์', 'Appeals', '申诉'),
  filterBatches: c('รอผู้อนุมัติที่สอง', 'Awaiting approval', '待批准'),
  filterReported: c('มีคนรายงาน', 'Reported', '被举报'),
  filterLow: c('หนึ่งถึงสองดาว', 'One and two stars', '一星和二星'),
  filterVisible: c('ที่แสดงอยู่', 'Visible', '显示中'),
  filterHidden: c('ที่นำออกแล้ว', 'Taken down', '已下架'),
  filterAll: c('ทั้งหมด', 'All', '全部'),
  lowLensBlurb: c(
    'ค่าเริ่มต้นคือหนึ่งถึงสองดาว ไม่ใช่เพราะคะแนนต่ำแปลว่าไม่จริง — ส่วนใหญ่จริงและมีประโยชน์ — แต่เพราะปัญหามักกระจุกอยู่ตรงนั้น',
    'One and two stars is the default lens, not because a low rating is suspect — most are honest and useful — but because the trouble concentrates there.',
    '默认视图是一星和二星，并非因为低分就可疑——多数低分诚实且有用——而是因为问题集中在那里。',
  ),
  nothingToModerate: c('ไม่มีรีวิวในมุมมองนี้', 'No reviews in this view', '此视图中没有评价'),
  reportedBy: c('รายงานโดยผู้อ่าน', 'Reported by readers', '读者举报'),
  reportsBlurb: c(
    'การรายงานเป็นสัญญาณ ไม่ใช่การกระทำ ไม่มีจำนวนรายงานเท่าไรที่ทำให้รีวิวหายไปเอง — มีเพียงคุณเท่านั้นที่นำออกได้',
    'A report is a signal, not an action. No number of reports removes anything on its own — only you can.',
    '举报是一种信号，不是一项处置。无论多少次举报都不会自行移除任何内容——只有您可以。',
  ),
  dismissReports: c('ตรวจแล้ว ไม่มีปัญหา', 'Looked at it, it is fine', '已查看，没有问题'),
  reportedNote: c('ข้อความจากผู้รายงาน', 'From the reporter', '举报人留言'),
  reporterRecord: c('ประวัติผู้รายงาน', 'This reporter', '该举报人'),
  appealHeading: c('ผู้เขียนขออุทธรณ์', 'The author is appealing', '作者正在申诉'),
  appealsBlurb: c(
    'ผู้เขียนตอบกลับคำตัดสินของเรา นำหน้าทุกอย่าง — เราบอกเขาว่าอะไรถูกนำออก เขาตอบมาแล้ว และการเงียบใส่แย่กว่าการนำออกครั้งแรก',
    'The author is answering a decision we made. This leads everything: we told them their words came down, they replied, and silence now is worse than the take-down was.',
    '作者是在回应我们作出的决定。此事优先于一切：我们告知其内容已下架，对方作了回复，此时沉默比当初的下架更糟。',
  ),
  appealDecline: c('ยืนตามคำตัดสินเดิม', 'Decision stands', '维持原决定'),
  appealRestoreHint: c(
    'ถ้าเห็นด้วยกับผู้เขียน ให้กด นำกลับมาแสดง — ไม่มีปุ่ม รับอุทธรณ์ แยกต่างหาก',
    'If you agree with them, press Restore — there is no separate Uphold button.',
    '若您认同作者，请按“恢复显示”——没有单独的“维持”按钮。',
  ),
  auditLog: c('บันทึกการตรวจ', 'Audit log', '审核日志'),
  auditBlurb: c(
    'บันทึกแบบเพิ่มอย่างเดียว การนำรีวิวกลับมาลบร่องรอยบนตัวรีวิวโดยตั้งใจ เพื่อไม่ให้ติดตัวผู้เขียน บันทึกนี้จึงเก็บแยกไว้',
    'Append-only. Restoring a review clears the marks on the review itself, deliberately, so nothing follows the author around — which is why this record is kept separately.',
    '仅可追加。恢复一条评价会清除该评价本身上的标记，这是有意为之，以免任何记录跟随作者——因此本记录单独保存。',
  ),
  actionHide: c('นำออก', 'Took down', '已下架'),
  actionRestore: c('นำกลับมาแสดง', 'Restored', '已恢复'),
  actionDismiss: c('ปิดรายงาน', 'Dismissed reports', '已关闭举报'),
  actionAppealDeclined: c('ยืนตามคำตัดสินเดิม', 'Declined appeal', '已驳回申诉'),
  nothingLogged: c('ยังไม่มีการดำเนินการ', 'Nothing has been actioned yet', '尚无任何处置'),
  moderatorActivity: c('การทำงานของผู้ดูแล 24 ชม.', 'Moderator activity, last 24h', '审核员活动，最近 24 小时'),
  watchHeading: c('เทียบกับปกติของแต่ละคน', 'Measured against their own normal', '与其自身常态对比'),
  moderatorActivityBlurb: c(
    'ธงมีสี่แบบ และแต่ละแบบบอกเหตุผลของตัวเอง — ผิดปกติเทียบกับตัวเอง, เยอะในเชิงจำนวน (ขึ้นทุกวันสำหรับคนที่ยุ่งจริง ซึ่งตั้งใจให้เป็นแบบนั้น), ยังไม่มีประวัติให้เทียบ, และการตัดสินถูกกลับบ่อย อ่านเหตุผลก่อนตัดสินใจ',
    'Four kinds of flag, each stating its own reason: unusual for them, a lot in absolute terms (which fires every day for a genuinely busy desk, deliberately), no history to judge against, and calls that keep being reversed. Read the reason before acting on the colour.',
    '标记分四类，每一类都会说明自身的理由：相对其自身异常、绝对数量偏多（对确实繁忙的岗位每天都会触发，这是有意设计）、没有可供对比的历史，以及决定屡被推翻。请先读理由，再据颜色行动。',
  ),
  activityCounts: c('นำออก {hides} · คืน {restores} · ปิดรายงาน {dismissals}', '{hides} down · {restores} back · {dismissals} dismissed', '下架 {hides} · 恢复 {restores} · 关闭举报 {dismissals}'),
  // Each flag names its own rule. A warning that cannot explain itself is an
  // accusation, and the reader has to know whether it means "unusual for
  // them" or "a lot in absolute terms" before acting on it.
  watchSpike: c(
    'มากกว่าปกติของตัวเองหลายเท่า — ปกติวันละ {baseline} วันนี้ {recent}',
    'Well above their own normal — usually {baseline} a day, {recent} today',
    '明显高于其自身常态——通常每天 {baseline} 条，今天 {recent} 条',
  ),
  watchAbsolute: c(
    'นำออก {recent} รายการใน 24 ชม. เยอะในเชิงจำนวน ถึงจะเป็นเรื่องปกติของเขาก็ตาม',
    '{recent} take-downs in 24h — a lot in absolute terms, even if it is routine for them',
    '24 小时内下架 {recent} 条——绝对数量偏多，即便这对其属于常态',
  ),
  watchNoBaseline: c(
    'ยังไม่มีประวัติให้เทียบ ไม่ใช่ข้อสงสัย แต่แปลว่าเรายังตัดสินไม่ได้',
    'No history to compare against — not a suspicion, but we have no basis to judge',
    '没有可供对比的历史——这并非怀疑，但我们无从判断',
  ),
  watchOverturned: c(
    'การตัดสินถูกกลับ {overturned} จาก {total} ครั้ง จำนวนบอกว่ายุ่ง การถูกกลับบอกว่าผิด',
    '{overturned} of {total} take-downs later reversed — volume says busy, reversals say wrong',
    '{total} 次下架中有 {overturned} 次后被推翻——数量说明繁忙，推翻说明判断有误',
  ),
  watchNone: c('ไม่มีอะไรผิดสังเกต', 'Nothing unusual', '没有异常'),
  flaggedCount: c('ผู้ดูแลที่ควรมีคนดู {n} คน', '{n} moderators worth a look', '{n} 名审核员值得查看'),
  baselineLabel: c('ปกติวันละ', 'usually', '通常每天'),
  noBaselineLabel: c('ยังไม่มีประวัติ', 'no history yet', '尚无历史'),
  filterByModerator: c('ทั้งหมด', 'Everyone', '全部人员'),
  overdueAppeal: c('เกินกำหนดแล้ว', 'Past its window', '已超出时限'),

  // -- Bulk take-down ------------------------------------------------------
  batchHeading: c('เสนอนำออกเป็นชุด', 'Propose a bulk take-down', '提议批量下架'),
  batchBlurb: c(
    'เพดานรายคนมีไว้กันบัญชีเดียวที่ถูกยึด ทางออกไม่ใช่การยกเพดาน แต่คือให้คนหนึ่งเสนอ อีกคนอนุมัติ แล้วชุดนั้นจึงทำงานโดยไม่ติดเพดาน',
    'The per-moderator cap contains one compromised account. The way out is not to raise it: one moderator proposes, a different one approves, and the batch then runs without the limit.',
    '单名审核员的上限用于限制单个被盗用账号的影响。解决办法不是提高上限：由一名审核员提议，另一名审核员批准，该批次随即不受上限限制地执行。',
  ),
  batchHonesty: c(
    'นี่คือมาตรการเชิงกระบวนการ ไม่ใช่เชิงความปลอดภัย คีย์สองอันกับชื่อสองชื่อก็ผ่านได้ สิ่งที่ได้คือด่านชะลอและบันทึกที่มีสองชื่อกำกับ',
    'This is a procedural control, not a security one. Two keys and two invented names would defeat it. What it buys is a speed bump and a record with two names on it.',
    '这是流程性控制，不是安全性控制。两把密钥加两个编造的姓名即可绕过。它换来的是一道减速带，以及一条署有两个姓名的记录。',
  ),
  batchSelected: c('เลือกไว้', 'selected', '已选择'),
  batchPropose: c('เสนอเป็นชุด', 'Propose as a batch', '作为批次提议'),
  batchProposedBy: c('เสนอโดย', 'Proposed by', '提议人'),
  batchExpires: c('หมดอายุ', 'Expires', '到期'),
  batchApprove: c('อนุมัติและดำเนินการ', 'Approve and run', '批准并执行'),
  batchCancel: c('ถอนข้อเสนอ', 'Withdraw', '撤回'),
  batchCount: c('{n} รีวิว', '{n} reviews', '{n} 条评价'),
  batchOwnProposal: c(
    'คุณเป็นผู้เสนอชุดนี้เอง ต้องให้ผู้ดูแลคนอื่นอนุมัติ',
    'You proposed this one. It needs a different moderator.',
    '该批次由您提议，需由另一名审核员批准。',
  ),
  batchPreview: c('ตัวอย่างในชุด', 'A few of them', '其中几条'),
  batchPreviewNote: c(
    'อนุมัติรายการที่ไม่มีใครอ่านคือการเซ็นชื่อ ไม่ใช่การตัดสินใจ',
    'Approving a list nobody read is a signature, not a decision.',
    '批准一份无人读过的清单，是签字，不是决定。',
  ),
  nothingAwaiting: c('ไม่มีชุดที่รออนุมัติ', 'Nothing awaiting approval', '没有待批准的批次'),
  batchRan: c('ดำเนินการแล้ว {n} รีวิว', 'Ran: {n} reviews taken down', '已执行：下架 {n} 条评价'),
  reporterRecordDetail: c(
    'รายงานทั้งหมด {filed} · ผู้ดูแลเห็นด้วย {upheld} · ไม่เห็นด้วย {dismissed}',
    '{filed} reports · {upheld} upheld · {dismissed} dismissed',
    '举报 {filed} 次 · 采纳 {upheld} 次 · 驳回 {dismissed} 次',
  ),
  firstReport: c(
    'เป็นการรายงานครั้งแรกของคนนี้',
    'Their first report',
    '这是此人的第一次举报',
  ),
  reviewOf: c('รีวิวของ', 'Review of', '评价对象'),
  writtenIn: c('เขียนเป็นภาษา', 'Written in', '撰写语言'),
  visitedOn: c('เช็กอินเมื่อ', 'Checked in', '签到时间'),
  writtenOn: c('เขียนเมื่อ', 'Written', '撰写时间'),
  takeDown: c('นำรีวิวนี้ออก', 'Take this review down', '下架这条评价'),
  takeDownReason: c('เหตุผล (ผู้เขียนจะได้อ่านในภาษาของตัวเอง)', 'Reason (the author reads this in their own language)', '理由（作者会以其自身语言阅读）'),
  takeDownNote: c('บันทึกภายใน (ผู้เขียนไม่เห็น)', 'Internal note (not shown to the author)', '内部备注（不向作者显示）'),
  takeDownCta: c('นำออก', 'Take down', '下架'),
  restoreCta: c('นำกลับมาแสดง', 'Restore', '恢复显示'),
  takenDownBy: c('นำออกโดย', 'Taken down by', '下架人'),
  authorIsTold: c(
    'ผู้เขียนจะได้รับแจ้งเหตุผลนี้ในภาษาของเขา การนำรีวิวออกโดยไม่บอกเหตุผลคือการเซ็นเซอร์เงียบ',
    'The author is told this reason, in their own language. Taking something down without saying why is censoring quietly.',
    '系统会以作者自身的语言告知这一理由。下架却不说明理由，就是无声的审查。',
  ),
  pointsKept: c(
    'แต้มที่ได้ไปแล้วไม่ถูกเรียกคืน เพราะเขาไปที่นั่นจริง สิ่งที่ผิดคือข้อความ ไม่ใช่การเดินทาง',
    'Points already paid are not clawed back — the visit really happened. What was wrong was the words, not the trip.',
    '已发放的积分不会收回——这次到访确实发生过。有问题的是文字，不是行程。',
  ),
  moderatorsOnly: c('เฉพาะผู้ดูแล', 'Moderators only', '仅限审核员'),
  moderatorsOnlyBlurb: c(
    'บัญชีของคุณตรวจหลักฐานภารกิจของหน่วยงานตัวเองได้ แต่ไม่มีสิทธิ์ดูแลรีวิว รีวิวเป็นเรื่องของสถานที่ ซึ่งไม่มีหน่วยงานใดเป็นเจ้าของ',
    'Your account reviews your own quest submissions. Moderating reviews is a separate permission: reviews are about places, which no host owns.',
    '您的账号可审核本机构自己的任务提交。评价审核是另一项权限：评价关乎地点，而地点不归任何主办方所有。',
  ),
  backToQueue: c('กลับไปที่คิว', 'Back to queue', '返回队列'),

  awaitingReview: c('รอตรวจสอบ', 'Awaiting review', '待审核'),
  pastSla: c('เกิน 24 ชม.', 'Past 24h', '超过 24 小时'),
  oldestWaiting: c('รอนานที่สุด', 'Oldest waiting', '等待最久'),
  nothingToReview: c('ไม่มีรายการรอตรวจ', 'Nothing to review', '没有待审核的内容'),
  nothingToReviewBlurb: c(
    'หลักฐานใหม่จะปรากฏที่นี่เมื่ออาสาสมัครส่งเข้ามา',
    'New submissions appear here as volunteers send them.',
    '志愿者提交后，新的证据会显示在这里。',
  ),
  photo: c('ภาพ', 'photo', '张照片'),
  photos: c('ภาพ', 'photos', '张照片'),
  priorRejections: c('เคยถูกปฏิเสธ', 'prior rejections', '次此前被拒'),

  quest: c('ภารกิจ', 'Quest', '任务'),
  pointsAtStake: c('รางวัลที่จะได้รับ', 'Reward at stake', '可获得的奖励'),
  greenPoints: c('แต้มสีเขียว', 'Green Points', '绿色积分'),
  tripPoints: c('แต้มทริป', 'Trip Points', '旅行积分'),
  reviewerName: c('ชื่อผู้ตรวจ', 'Your name', '审核人姓名'),
  reviewerHint: c('บันทึกไว้กับทุกการตัดสิน เพื่อให้รู้ว่าใครเป็นผู้รับรอง', 'Recorded against every decision, so everyone can see who verified it.', '会记录在每一次判定上，以便知道由谁核实。'),
  reviewerRequired: c('กรุณากรอกชื่อผู้ตรวจ ทุกการตัดสินต้องมีชื่อผู้รับรอง', 'Enter your name. Every decision has to say who made it.', '请填写审核人姓名，每一次判定都必须注明由谁做出。'),
  fence: c('รัศมีพื้นที่', 'fence', '范围'),
  submitted: c('ส่งเมื่อ', 'Submitted', '提交时间'),
  volunteer: c('อาสาสมัคร', 'Volunteer', '志愿者'),
  approvedCount: c('ผ่าน', 'approved', '已通过'),
  rejectedCount: c('ไม่ผ่าน', 'rejected', '未通过'),
  withYou: c('กับหน่วยงานของคุณ', 'with you', '与贵机构'),
  weightLogged: c('น้ำหนักที่บันทึก', 'Weight logged', '记录的重量'),
  newProofWaiting: c('มีหลักฐานใหม่รอตรวจ', 'A new proof is waiting for you', '有新的证据在等您审核'),
  notifyMe: c('แจ้งเตือนเมื่อมีหลักฐานใหม่', 'Notify me of new proofs', '有新证据时通知我'),
  notifyOn: c('แจ้งเตือนเปิดอยู่', 'Notifications on', '通知已开启'),
  // An operator's console (docs/62): its questions, and a way to hear of them.
  newQuestionWaiting: c('มีนักท่องเที่ยวส่งคำถามใหม่มา', 'A traveller has sent you a new question', '有旅行者向您发来新问题'),
  notifyMeQuestions: c('แจ้งเตือนเมื่อมีคำถามใหม่', 'Notify me of new questions', '有新问题时通知我'),
  operatorOnlyTitle: c('บัญชีนี้ใช้ตอบคำถามเท่านั้น', 'This account answers questions', '此账号仅用于回答问题'),
  operatorOnly: c(
    'บัญชีผู้ประกอบการใช้ลงรายการและตอบคำถามของนักท่องเที่ยวเท่านั้น ไม่สามารถตรวจงานอาสา ดูการแจ้งเหตุฉุกเฉิน หรือออกเอกสารรับรองได้',
    'An operator account lists and answers travellers’ questions, and nothing else. It cannot review volunteer work, see emergency alerts or issue statements.',
    '商家账号仅用于发布信息和回答旅行者的问题，此外别无其他权限。它无法审核志愿者的工作、查看紧急警报，也无法出具报表。',
  ),
  partyPresent: c('มาด้วยกัน (อยู่ในรัศมีตอนถ่ายหลักฐาน)', 'With them (inside the fence when this was taken)', '同行人员（拍摄此证据时在范围内）'),
  partyPaysAll: c('อนุมัติครั้งเดียว จ่ายให้ทุกคนในรายชื่อนี้เท่ากัน', 'One approval pays everyone listed the same reward.', '一次批准，向名单上的每个人发放相同的奖励。'),
  none: c('ไม่มี', 'None', '无'),
  photosHeading: c('ภาพถ่ายหลักฐาน', 'Photos', '照片'),
  noPhotos: c('ไม่มีภาพถ่ายแนบมากับหลักฐานนี้', 'No photos were uploaded with this submission.', '此次提交未上传照片。'),
  fromSite: c('จากพื้นที่ภารกิจ', 'from site', '距现场'),
  noLocation: c('ไม่มีข้อมูลตำแหน่ง', 'No location recorded', '未记录位置信息'),

  automaticChecks: c('การตรวจอัตโนมัติ', 'Automatic checks', '自动检查'),
  checksBlurb: c(
    'นี่เป็นเพียงสัญญาณเตือน ไม่ใช่คำตัดสิน คุณคือผู้รับรองงานนี้ โปรดใช้วิจารณญาณและดูภาพถ่ายประกอบ',
    'These are signals, not decisions. You are the one vouching for this work — use your judgement and the photos.',
    '这些是信号，不是决定。为这项工作作保的人是您——请用您的判断，并查看照片。',
  ),
  checkPhotoLocation: c('ตำแหน่งภาพถ่าย', 'Photo location', '照片位置'),
  checkCaptureTime: c('เวลาถ่ายภาพ', 'Capture time', '拍摄时间'),
  checkWeight: c('น้ำหนักที่บันทึก', 'Weight logged', '记录的重量'),
  readFromFile: c('อ่านจากไฟล์ภาพ', 'read from the file', '读自文件'),
  checkReuse: c('เคยส่งภาพนี้มาก่อนหรือไม่', 'Sent before?', '是否重复提交'),
  checkSource: c('ข้อมูลในไฟล์ภาพ', 'The file’s own record', '文件自带信息'),

  decision: c('การตัดสิน', 'Decision', '决定'),
  reasonIfRejecting: c('เหตุผล หากไม่อนุมัติ', 'Reason, if rejecting', '理由，如不通过'),
  selectPlaceholder: c('— เลือก —', '— select —', '— 请选择 —'),
  noteToVolunteer: c('ข้อความถึงอาสาสมัคร (ไม่บังคับ)', 'Note to the volunteer (optional)', '给志愿者的留言（选填）'),
  notePlaceholder: c(
    'สิ่งที่ช่วยให้เขาทำได้ถูกต้องในครั้งต่อไป',
    'Anything that helps them get it right next time.',
    '任何有助于其下次做对的说明。',
  ),
  /**
   * Said plainly, because it changes what a reviewer should write: the preset
   * reason is translated for the volunteer, a free-text note is not.
   */
  noteNotTranslated: c(
    'ข้อความนี้จะแสดงตามที่คุณพิมพ์ ไม่มีการแปล อาสาสมัครอาจอ่านภาษาไทยไม่ได้ — หากต้องการให้แน่ใจ ให้เลือกเหตุผลจากรายการด้านบน',
    'This note is shown exactly as typed, with no translation. The volunteer may not read your language — pick a reason above if you need to be certain they understand.',
    '此留言会按您输入的原文显示，不作翻译。志愿者可能读不懂您的语言——如需确保其理解，请从上方选择一条理由。',
  ),
  approveAndRelease: c('อนุมัติและปล่อยแต้ม', 'Approve and release', '批准并发放'),
  reject: c('ไม่อนุมัติ', 'Reject', '不通过'),
  approveWarning: c(
    'การอนุมัติจะปล่อยแต้มทันทีและบันทึกรายการในบัญชีโดยระบุชื่อ',
    'Approving releases points immediately and writes a ledger entry naming',
    '批准会立即发放积分，并写入一条账目记录，记录中署名',
  ),
  cannotUndo: c('ไม่สามารถย้อนกลับจากหน้านี้ได้', 'This cannot be undone from the console.', '此操作无法在控制台中撤销。'),
  reasonRequired: c('ต้องระบุเหตุผล', 'A reason is required', '必须填写理由'),
  reasonRequiredBlurb: c(
    'เลือกเหตุผลหรือเขียนข้อความ เพื่อให้อาสาสมัครรู้ว่าต้องแก้ไขอะไร',
    'Choose a reason or write a note so the volunteer knows what to change.',
    '请选择一条理由或写下留言，让志愿者知道需要改什么。',
  ),

  recentDecisions: c('การตัดสินล่าสุด', 'Recent decisions', '最近的决定'),
  recentDecisionsBlurb: c(
    'ทุกการตัดสินมีผู้รับผิดชอบระบุไว้ นี่คือหลักฐานเบื้องหลังการให้แต้มแต่ละครั้ง',
    'Every decision is attributed. This is the record behind each award.',
    '每一项决定都有署名。这是每次发放奖励背后的记录。',
  ),
  noDecisions: c('ยังไม่มีการตัดสิน', 'No decisions yet.', '尚无决定。'),
  colQuest: c('ภารกิจ', 'Quest', '任务'),
  colVolunteer: c('อาสาสมัคร', 'Volunteer', '志愿者'),
  colDecision: c('ผลการตัดสิน', 'Decision', '决定结果'),
  colReviewer: c('ผู้ตรวจ', 'Reviewer', '审核人'),
  colWhen: c('เมื่อ', 'When', '时间'),
  approved: c('อนุมัติ', 'Approved', '已通过'),
  rejected: c('ไม่อนุมัติ', 'Rejected', '未通过'),

  notFound: c('ไม่พบรายการ', 'Not found', '未找到'),
  notInYourQueue: c('รายการนี้ไม่อยู่ในคิวของคุณ', 'That submission is not in your queue.', '该提交不在您的队列中。'),
  sessionExpired: c('เซสชันหมดอายุ', 'Session expired', '会话已过期'),
  signInAgain: c('กรุณาเข้าสู่ระบบใหม่แล้วลองอีกครั้ง', 'Please sign in again and retry.', '请重新登录后再试。'),
  back: c('ย้อนกลับ', 'Back', '返回'),
  // -- Check explanations -------------------------------------------------
  // Templated with {placeholders}. The review service returns a key and the
  // numbers; the sentence is built here, where the locale is known.
  geotagNone: c(
    'ไม่มีภาพใดบันทึกตำแหน่ง โทรศัพท์หลายรุ่นตัดข้อมูลนี้ออก โปรดตัดสินจากภาพถ่าย',
    'No photo carries a location. Many phones strip it — judge on the images.',
    '没有照片带有位置信息。许多手机会剥除该信息——请依据画面判断。',
  ),
  geotagPass: c(
    'ภาพที่มีตำแหน่งทั้งหมดอยู่ในระยะ {radius} ม. จากพื้นที่ (ไกลสุด {worst} ม.)',
    'All located photos are within {radius} m of the site (furthest {worst} m).',
    '所有带位置信息的照片都在距现场 {radius} 米以内（最远 {worst} 米）。',
  ),
  geotagWarn: c(
    'ภาพที่ไกลสุดอยู่ห่าง {worst} ม. จากพื้นที่ (รัศมี {radius} ม.) น่าจะเป็นความคลาดเคลื่อนของ GPS',
    'Furthest photo is {worst} m from the site (fence {radius} m). Likely GPS drift.',
    '最远的照片距现场 {worst} 米（范围 {radius} 米）。可能是 GPS 漂移。',
  ),
  geotagFail: c(
    'ภาพที่ไกลสุดอยู่ห่าง {worst} ม. จากพื้นที่ ซึ่งเกินรัศมี {radius} ม. อย่างชัดเจน',
    'Furthest photo is {worst} m from the site — well outside the {radius} m fence.',
    '最远的照片距现场 {worst} 米——明显超出 {radius} 米的范围。',
  ),
  timingNone: c(
    'ไม่มีเวลาถ่ายภาพที่ใช้เทียบกับเวลาเช็คอินได้',
    'No usable timestamps to compare against check-in.',
    '没有可与签到时间比对的可用时间戳。',
  ),
  timingPass: c(
    'ภาพที่มีเวลากำกับทั้งหมดถ่ายหลังเช็คอิน',
    'All timestamped photos were taken after check-in.',
    '所有带时间戳的照片都拍摄于签到之后。',
  ),
  timingBefore: c(
    'ภาพแรกสุดถ่ายก่อนเช็คอิน {minutes} นาที',
    'Earliest photo predates check-in by {minutes} minutes.',
    '最早的一张照片比签到时间早 {minutes} 分钟。',
  ),
  weightNone: c('ไม่ได้ระบุน้ำหนัก', 'No weight submitted.', '未提交重量。'),
  weightInvalid: c('น้ำหนักต้องมากกว่าศูนย์', 'Weight must be positive.', '重量必须为正数。'),
  weightHigh: c(
    '{kg} กก. สูงผิดปกติสำหรับอาสาสมัครหนึ่งคน ควรตรวจสอบเพิ่มเติม',
    '{kg} kg is unusually high for one volunteer — worth confirming.',
    '{kg} kg 对一名志愿者而言异常偏高——值得核实。',
  ),
  weightOk: c('{kg} กก.', '{kg} kg.', '重量 {kg} kg。'),

  // -- Read off the bytes, not off the phone (photo-forensics.ts) ----------
  // Every one of these is a SIGNAL for the reviewer, never a verdict. The
  // wording says what was found and leaves the decision where it belongs.
  reuseUnknown: c(
    'ภาพชุดนี้ส่งมาก่อนระบบจะเริ่มเก็บลายนิ้วมือไฟล์ จึงเทียบกับภาพอื่นไม่ได้',
    'These photos predate file fingerprinting, so they cannot be compared with others.',
    '这些照片早于文件指纹功能，无法与其他照片比对。',
  ),
  reuseNone: c(
    'ไม่พบว่าภาพเหล่านี้เคยถูกส่งให้หน่วยงานของคุณมาก่อน',
    'None of these photos has been submitted to your organisation before.',
    '这些照片此前未曾提交给贵机构。',
  ),
  reuseInThisProof: c(
    'มีภาพซ้ำกันภายในชุดนี้เอง อาจกดส่งไฟล์เดิมหลายครั้ง',
    'The same photo appears more than once in this submission.',
    '本次提交中出现了重复的照片。',
  ),
  reuseSameFile: c(
    'ไฟล์ภาพเดียวกันนี้เคยถูกส่งมาแล้วในงานอื่นเมื่อ {when} (พบ {count} รายการ)',
    'This exact file was already submitted on another job on {when} ({count} match(es)).',
    '同一文件已于 {when} 在另一项任务中提交过（共 {count} 条）。',
  ),
  reuseSameShutter: c(
    'ภาพนี้มาจากการกดชัตเตอร์ครั้งเดียวกับภาพที่ส่งเมื่อ {when} คือเป็นภาพเดิมที่บันทึกใหม่ (พบ {count} รายการ)',
    'Same camera and same shutter moment as a photo submitted on {when} — one original, re-saved ({count} match(es)).',
    '与 {when} 提交的照片为同一相机、同一快门时刻——同一张原图重新保存（共 {count} 条）。',
  ),
  sourceNone: c(
    'ไฟล์ไม่เหลือข้อมูลกล้อง ตรวจสอบกับข้อมูลที่แอปส่งมาไม่ได้ ซึ่งเป็นเรื่องปกติเพราะโทรศัพท์ส่วนใหญ่ตัดข้อมูลนี้ตอนย่อไฟล์',
    'The file kept no camera data, so there is nothing to check the app against. This is normal — most phones strip it when they re-encode.',
    '文件未保留相机信息，无法与应用上报的数据核对。这很常见——多数手机在重新编码时会剥除该信息。',
  ),
  sourceConfirmed: c(
    'ไฟล์ {count} ภาพมีพิกัดของตัวเอง และตรงกับที่แอปรายงาน ระบบใช้ค่าจากไฟล์ในการตรวจ',
    '{count} file(s) carry their own coordinates, matching what the app reported. The checks used the file.',
    '{count} 个文件自带坐标，且与应用上报一致。核查以文件为准。',
  ),
  sourceMismatch: c(
    'พิกัดในไฟล์ห่างจากที่แอปรายงาน {metres} ม. ให้เชื่อค่าจากไฟล์ และควรตรวจสอบเพิ่มเติม',
    'The file’s own coordinates are {metres} m from what the app reported. Trust the file, and look closer.',
    '文件自带坐标与应用上报相差 {metres} 米。请以文件为准并进一步核实。',
  ),

  // -- The AI's opinion (docs/64) -------------------------------------------
  // Always named as the AI's, and always as a helper: the host is the one
  // vouching, and the copy must never let the machine sound like it decided.
  checkAi: c('ความเห็นจาก AI', 'AI opinion', 'AI 意见'),
  aiCardHeading: c('ความเห็นจาก AI · ผู้ช่วย ไม่ใช่ผู้ตัดสิน', 'AI opinion · an assistant, not a decision', 'AI 意见 · 助手，而非决定'),
  aiCardBlurb: c(
    'AI ดูเฉพาะภาพถ่าย ไม่รู้ว่าใครส่ง และอาจผิดได้ คุณเป็นผู้ตัดสินเสมอ',
    'The AI looked only at the photos, does not know who sent them, and can be wrong. You decide.',
    'AI 只看了照片，不知道是谁提交的，也可能出错。由您决定。',
  ),
  aiSuggests: c('AI แนะนำเหตุผล', 'AI suggests', 'AI 建议'),
  aiPhotoNote: c('ภาพที่ {n}', 'Photo {n}', '第 {n} 张照片'),
  aiShown: c(
    'AI เห็นงานของภารกิจนี้ในภาพ และไม่พบสิ่งผิดปกติ',
    'The AI sees this quest’s work in the photos and nothing unusual.',
    'AI 在照片中看到了此任务的工作，未发现异常。',
  ),
  aiNotShown: c(
    'AI ไม่เห็นงานของภารกิจนี้ในภาพ โปรดดูภาพประกอบด้วยตัวเอง',
    'The AI does not see this quest’s work in the photos. Look for yourself.',
    'AI 未在照片中看到此任务的工作。请您自己查看。',
  ),
  aiUnclear: c('AI บอกไม่ได้ว่าภาพแสดงงานหรือไม่', 'The AI cannot tell whether the photos show the work.', 'AI 无法判断照片是否显示了该工作。'),
  aiConcern: c('AI สังเกตเห็น: {concerns}', 'The AI noticed: {concerns}', 'AI 注意到：{concerns}'),
  aiWeight: c('AI เห็นขยะน้อยกว่าน้ำหนักที่แจ้ง', 'The AI sees less than the weight claimed.', 'AI 看到的量少于所申报的重量。'),
  aiPending: c('AI กำลังดูภาพ ไม่ต้องรอก็ตัดสินได้', 'The AI is still looking. You need not wait for it.', 'AI 仍在查看。您不必等它。'),
  aiFailed: c(
    'AI อ่านหลักฐานนี้ไม่สำเร็จ โปรดตัดสินจากภาพถ่าย',
    'The AI could not read this proof. Judge on the images.',
    'AI 无法读取此证据。请依据画面判断。',
  ),
  aiOff: c('ไม่ได้เปิดใช้ผู้ช่วย AI', 'The AI assistant is off.', 'AI 助手未启用。'),
  aiLimit: c('ผู้ช่วย AI ใช้ครบโควตาของวันนี้แล้ว', 'The AI assistant has reached today’s limit.', 'AI 助手已达今日上限。'),
  concern_screen_or_printout: c('ถ่ายจากจอหรือกระดาษ', 'photographed off a screen or a printout', '翻拍自屏幕或打印件'),
  concern_looks_downloaded: c('ดูเหมือนภาพจากเว็บ', 'looks downloaded rather than taken', '看起来是下载的，而非实拍'),
  concern_same_photo_twice: c('มีภาพซ้ำ', 'the same photo twice', '同一张照片出现两次'),
  concern_people_only: c('มีแต่คน ไม่เห็นงาน', 'people, but no work', '只有人，看不到工作'),
  concern_text_instructions: c('ในภาพมีข้อความสั่ง AI', 'text in a photo addressed to the AI', '照片中有写给 AI 的文字'),
} as const;

export type ConsoleStringKey = keyof typeof consoleStrings;

/** Translate one console string. */
export const t = (key: ConsoleStringKey, locale: Locale): string => loc(consoleStrings[key], locale);

/**
 * Translate a templated string, substituting {placeholders}.
 *
 * A missing key renders the key itself rather than throwing: a check that has
 * outrun its copy should degrade to something a reviewer can report, not take
 * the queue down.
 */
export function tf(
  key: string,
  locale: Locale,
  params: Record<string, string | number> = {},
): string {
  const entry = (consoleStrings as Record<string, Copy | undefined>)[key];
  if (!entry) return key;
  return loc(entry, locale).replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : whole,
  );
}

// ---------------------------------------------------------------------------
// Locale-aware formatting
// ---------------------------------------------------------------------------

/**
 * Dates render in the reviewer's language but ALWAYS in the Gregorian calendar.
 *
 * `th-TH` defaults to the Buddhist Era, so 2026 shows as 2569. Thai staff read
 * BE fluently, but this console sits next to ISO timestamps in the API, the
 * ledger and the app - and a queue where one screen says 2569 and the next says
 * 2026 is a support ticket waiting to happen. Thai month names, Gregorian year.
 *
 * Flag this to the client: if the municipality would rather see BE, it is a
 * one-token change here.
 */
const DATE_LOCALE: Record<Locale, string> = {
  th: 'th-TH-u-ca-gregory',
  en: 'en-GB',
  zh: 'zh-CN',
};

export const formatDateTime = (iso: string, locale: Locale): string =>
  new Intl.DateTimeFormat(DATE_LOCALE[locale], {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(iso));

export const formatNumber = (n: number, locale: Locale): string =>
  new Intl.NumberFormat(DATE_LOCALE[locale]).format(n);

/**
 * "3 minutes ago" / "2 hours ago" / "30 hours ago".
 *
 * Uses Intl.RelativeTimeFormat rather than hand-built strings: Thai does not
 * pluralise the way English does, and hard-coding "hours"/"hour" would produce
 * either broken Thai or an if-ladder per language.
 */
export function formatWaiting(hours: number, locale: Locale): string {
  const rtf = new Intl.RelativeTimeFormat(DATE_LOCALE[locale], { numeric: 'auto' });
  if (hours < 1) return rtf.format(-Math.max(1, Math.round(hours * 60)), 'minute');
  if (hours < 48) return rtf.format(-Math.floor(hours), 'hour');
  return rtf.format(-Math.floor(hours / 24), 'day');
}

/**
 * The HTML `lang` attribute, so screen readers use the right voice.
 *
 * `zh-Hans` rather than `zh`: a screen reader handed bare `zh` has to guess
 * the script, and the guess is wrong often enough to matter.
 */
export const htmlLang = (locale: Locale): string =>
  locale === 'th' ? 'th' : locale === 'zh' ? 'zh-Hans' : 'en';

/**
 * Pick a locale from an Accept-Language header.
 *
 * Parses properly rather than substring-matching. A naive `/th/.test(header)`
 * looks fine until a tag like `pt-BR` or a token containing "th" flips a
 * Portuguese speaker into Thai - and the regex is also easy to mangle in a
 * refactor, which is exactly what happened here the first time.
 *
 * Returns null when nothing is supported, so the caller decides the fallback.
 */
export function localeFromAcceptLanguage(header: string | undefined): Locale | null {
  if (!header) return null;

  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params
        .map((p) => /^\s*q=([\d.]+)\s*$/.exec(p))
        .find(Boolean);
      return {
        // "th-TH" -> "th". Region is dropped: we serve one Thai, one English
        // and one Chinese, so every zh-* variant lands on Simplified.
        base: (tag ?? '').trim().toLowerCase().split('-')[0] ?? '',
        q: q ? Number(q[1]) : 1,
      };
    })
    .filter((entry) => entry.base.length > 0 && Number.isFinite(entry.q) && entry.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const entry of ranked) {
    if (isLocale(entry.base)) return entry.base;
    // A wildcard means "anything"; take the default rather than guessing.
    if (entry.base === '*') return DEFAULT_LOCALE;
  }
  return null;
}
