/**
 * Console localisation.
 *
 * WHY THE CONSOLE PICKS ONE LANGUAGE AND THE APP SHOWS BOTH
 *
 * The mobile app renders English and Thai together, because its audience is
 * split roughly half international, half domestic and a traveller should never
 * have to choose.
 *
 * The console is different. Its users are a known set of staff at municipal
 * offices, NGOs and hotel partners, working through a queue. Doubling every
 * label in a dense review table would halve the scanning speed of the people
 * doing the actual work. So the console has a switcher and shows ONE language.
 *
 * Default is Thai: three of the four pilot hosts are Thai organisations, and
 * serving them is the point of the tool.
 *
 * WHERE THE THAI COPY LIVES
 * Console chrome is here. Anything a VOLUNTEER reads - notably the rejection
 * reasons - lives in packages/core/src/strings.ts with the rest of the app copy,
 * because it is rendered into the app, not into this page.
 *
 * REVIEW STATUS: th strings are DESIGN DRAFT, not yet reviewed by a native
 * speaker. Two files to review: this one and packages/core/src/strings.ts.
 */

export type Locale = 'th' | 'en';

export const LOCALES: Locale[] = ['th', 'en'];
export const DEFAULT_LOCALE: Locale = 'th';
export const LOCALE_COOKIE = 'chivago_lang';

export const isLocale = (v: unknown): v is Locale => v === 'th' || v === 'en';

/** Native names, so the switcher reads correctly whichever side you are on. */
export const LOCALE_NAMES: Record<Locale, string> = { th: 'ไทย', en: 'English' };

interface Copy {
  th: string;
  en: string;
}

const c = (th: string, en: string): Copy => ({ th, en });

export const consoleStrings = {
  brand: c('ChivaGo · ระบบตรวจสำหรับผู้จัดภารกิจ', 'ChivaGo · Host Console'),

  signIn: c('เข้าสู่ระบบ', 'Sign in'),
  signOut: c('ออกจากระบบ', 'Sign out'),
  signInTitle: c('ตรวจสอบหลักฐานภารกิจ', 'Review submissions'),
  signInBlurb: c(
    'กรอกรหัสเข้าใช้งานที่ออกให้หน่วยงานของคุณ ชื่อของคุณจะถูกบันทึกไว้กับทุกการตัดสิน เพื่อให้ตรวจสอบย้อนหลังได้',
    'Enter the access key issued to your organisation. Your name is recorded against every decision you make, so the award can be attributed later.',
  ),
  yourName: c('ชื่อของคุณ', 'Your name'),
  accessKey: c('รหัสเข้าใช้งาน', 'Access key'),
  signInFailed: c('ไม่พบชื่อและรหัสที่ตรงกัน', 'That name and key combination was not recognised.'),
  signedInAs: c('เข้าสู่ระบบในชื่อ', 'Signed in as'),

  queue: c('คิวรอตรวจ', 'Queue'),
  history: c('ประวัติ', 'History'),

  // -- Review moderation ---------------------------------------------------
  moderation: c('รีวิว', 'Reviews'),
  moderationTitle: c('ดูแลรีวิวจากนักเดินทาง', 'Traveller reviews'),
  moderationBlurb: c(
    'ทุกรีวิวที่นี่มาจากคนที่เช็กอินที่สถานที่นั้นจริง การยืนยันนี้ทำให้รีวิวปลอมแพงขึ้น แต่ไม่ได้ทำให้เป็นไปไม่ได้ — คนที่ไปจริงก็ยังเขียนเรื่องที่ต้องนำออกได้',
    'Every review here is from someone who checked in at that place. That makes a fake review expensive, not impossible — someone who really went can still write something that has to come down.',
  ),
  filterAppeals: c('อุทธรณ์', 'Appeals'),
  filterBatches: c('รอผู้อนุมัติที่สอง', 'Awaiting approval'),
  filterReported: c('มีคนรายงาน', 'Reported'),
  filterLow: c('หนึ่งถึงสองดาว', 'One and two stars'),
  filterVisible: c('ที่แสดงอยู่', 'Visible'),
  filterHidden: c('ที่นำออกแล้ว', 'Taken down'),
  filterAll: c('ทั้งหมด', 'All'),
  lowLensBlurb: c(
    'ค่าเริ่มต้นคือหนึ่งถึงสองดาว ไม่ใช่เพราะคะแนนต่ำแปลว่าไม่จริง — ส่วนใหญ่จริงและมีประโยชน์ — แต่เพราะปัญหามักกระจุกอยู่ตรงนั้น',
    'One and two stars is the default lens, not because a low rating is suspect — most are honest and useful — but because the trouble concentrates there.',
  ),
  nothingToModerate: c('ไม่มีรีวิวในมุมมองนี้', 'No reviews in this view'),
  reportedBy: c('รายงานโดยผู้อ่าน', 'Reported by readers'),
  reportsBlurb: c(
    'การรายงานเป็นสัญญาณ ไม่ใช่การกระทำ ไม่มีจำนวนรายงานเท่าไรที่ทำให้รีวิวหายไปเอง — มีเพียงคุณเท่านั้นที่นำออกได้',
    'A report is a signal, not an action. No number of reports removes anything on its own — only you can.',
  ),
  dismissReports: c('ตรวจแล้ว ไม่มีปัญหา', 'Looked at it, it is fine'),
  reportedNote: c('ข้อความจากผู้รายงาน', 'From the reporter'),
  reporterRecord: c('ประวัติผู้รายงาน', 'This reporter'),
  appealHeading: c('ผู้เขียนขออุทธรณ์', 'The author is appealing'),
  appealsBlurb: c(
    'ผู้เขียนตอบกลับคำตัดสินของเรา นำหน้าทุกอย่าง — เราบอกเขาว่าอะไรถูกนำออก เขาตอบมาแล้ว และการเงียบใส่แย่กว่าการนำออกครั้งแรก',
    'The author is answering a decision we made. This leads everything: we told them their words came down, they replied, and silence now is worse than the take-down was.',
  ),
  appealDecline: c('ยืนตามคำตัดสินเดิม', 'Decision stands'),
  appealRestoreHint: c(
    'ถ้าเห็นด้วยกับผู้เขียน ให้กด นำกลับมาแสดง — ไม่มีปุ่ม รับอุทธรณ์ แยกต่างหาก',
    'If you agree with them, press Restore — there is no separate Uphold button.',
  ),
  auditLog: c('บันทึกการตรวจ', 'Audit log'),
  auditBlurb: c(
    'บันทึกแบบเพิ่มอย่างเดียว การนำรีวิวกลับมาลบร่องรอยบนตัวรีวิวโดยตั้งใจ เพื่อไม่ให้ติดตัวผู้เขียน บันทึกนี้จึงเก็บแยกไว้',
    'Append-only. Restoring a review clears the marks on the review itself, deliberately, so nothing follows the author around — which is why this record is kept separately.',
  ),
  actionHide: c('นำออก', 'Took down'),
  actionRestore: c('นำกลับมาแสดง', 'Restored'),
  actionDismiss: c('ปิดรายงาน', 'Dismissed reports'),
  actionAppealDeclined: c('ยืนตามคำตัดสินเดิม', 'Declined appeal'),
  nothingLogged: c('ยังไม่มีการดำเนินการ', 'Nothing has been actioned yet'),
  moderatorActivity: c('การทำงานของผู้ดูแล 24 ชม.', 'Moderator activity, last 24h'),
  watchHeading: c('เทียบกับปกติของแต่ละคน', 'Measured against their own normal'),
  moderatorActivityBlurb: c(
    'ธงมีสี่แบบ และแต่ละแบบบอกเหตุผลของตัวเอง — ผิดปกติเทียบกับตัวเอง, เยอะในเชิงจำนวน (ขึ้นทุกวันสำหรับคนที่ยุ่งจริง ซึ่งตั้งใจให้เป็นแบบนั้น), ยังไม่มีประวัติให้เทียบ, และการตัดสินถูกกลับบ่อย อ่านเหตุผลก่อนตัดสินใจ',
    'Four kinds of flag, each stating its own reason: unusual for them, a lot in absolute terms (which fires every day for a genuinely busy desk, deliberately), no history to judge against, and calls that keep being reversed. Read the reason before acting on the colour.',
  ),
  activityCounts: c('นำออก {hides} · คืน {restores} · ปิดรายงาน {dismissals}', '{hides} down · {restores} back · {dismissals} dismissed'),
  // Each flag names its own rule. A warning that cannot explain itself is an
  // accusation, and the reader has to know whether it means "unusual for
  // them" or "a lot in absolute terms" before acting on it.
  watchSpike: c(
    'มากกว่าปกติของตัวเองหลายเท่า — ปกติวันละ {baseline} วันนี้ {recent}',
    'Well above their own normal — usually {baseline} a day, {recent} today',
  ),
  watchAbsolute: c(
    'นำออก {recent} รายการใน 24 ชม. เยอะในเชิงจำนวน ถึงจะเป็นเรื่องปกติของเขาก็ตาม',
    '{recent} take-downs in 24h — a lot in absolute terms, even if it is routine for them',
  ),
  watchNoBaseline: c(
    'ยังไม่มีประวัติให้เทียบ ไม่ใช่ข้อสงสัย แต่แปลว่าเรายังตัดสินไม่ได้',
    'No history to compare against — not a suspicion, but we have no basis to judge',
  ),
  watchOverturned: c(
    'การตัดสินถูกกลับ {overturned} จาก {total} ครั้ง จำนวนบอกว่ายุ่ง การถูกกลับบอกว่าผิด',
    '{overturned} of {total} take-downs later reversed — volume says busy, reversals say wrong',
  ),
  watchNone: c('ไม่มีอะไรผิดสังเกต', 'Nothing unusual'),
  flaggedCount: c('ผู้ดูแลที่ควรมีคนดู {n} คน', '{n} moderators worth a look'),
  baselineLabel: c('ปกติวันละ', 'usually'),
  noBaselineLabel: c('ยังไม่มีประวัติ', 'no history yet'),
  filterByModerator: c('ทั้งหมด', 'Everyone'),
  overdueAppeal: c('เกินกำหนดแล้ว', 'Past its window'),

  // -- Bulk take-down ------------------------------------------------------
  batchHeading: c('เสนอนำออกเป็นชุด', 'Propose a bulk take-down'),
  batchBlurb: c(
    'เพดานรายคนมีไว้กันบัญชีเดียวที่ถูกยึด ทางออกไม่ใช่การยกเพดาน แต่คือให้คนหนึ่งเสนอ อีกคนอนุมัติ แล้วชุดนั้นจึงทำงานโดยไม่ติดเพดาน',
    'The per-moderator cap contains one compromised account. The way out is not to raise it: one moderator proposes, a different one approves, and the batch then runs without the limit.',
  ),
  batchHonesty: c(
    'นี่คือมาตรการเชิงกระบวนการ ไม่ใช่เชิงความปลอดภัย คีย์สองอันกับชื่อสองชื่อก็ผ่านได้ สิ่งที่ได้คือด่านชะลอและบันทึกที่มีสองชื่อกำกับ',
    'This is a procedural control, not a security one. Two keys and two invented names would defeat it. What it buys is a speed bump and a record with two names on it.',
  ),
  batchSelected: c('เลือกไว้', 'selected'),
  batchPropose: c('เสนอเป็นชุด', 'Propose as a batch'),
  batchProposedBy: c('เสนอโดย', 'Proposed by'),
  batchExpires: c('หมดอายุ', 'Expires'),
  batchApprove: c('อนุมัติและดำเนินการ', 'Approve and run'),
  batchCancel: c('ถอนข้อเสนอ', 'Withdraw'),
  batchCount: c('{n} รีวิว', '{n} reviews'),
  batchOwnProposal: c(
    'คุณเป็นผู้เสนอชุดนี้เอง ต้องให้ผู้ดูแลคนอื่นอนุมัติ',
    'You proposed this one. It needs a different moderator.',
  ),
  batchPreview: c('ตัวอย่างในชุด', 'A few of them'),
  batchPreviewNote: c(
    'อนุมัติรายการที่ไม่มีใครอ่านคือการเซ็นชื่อ ไม่ใช่การตัดสินใจ',
    'Approving a list nobody read is a signature, not a decision.',
  ),
  nothingAwaiting: c('ไม่มีชุดที่รออนุมัติ', 'Nothing awaiting approval'),
  batchRan: c('ดำเนินการแล้ว {n} รีวิว', 'Ran: {n} reviews taken down'),
  reporterRecordDetail: c(
    'รายงานทั้งหมด {filed} · ผู้ดูแลเห็นด้วย {upheld} · ไม่เห็นด้วย {dismissed}',
    '{filed} reports · {upheld} upheld · {dismissed} dismissed',
  ),
  firstReport: c(
    'เป็นการรายงานครั้งแรกของคนนี้',
    'Their first report',
  ),
  reviewOf: c('รีวิวของ', 'Review of'),
  writtenIn: c('เขียนเป็นภาษา', 'Written in'),
  visitedOn: c('เช็กอินเมื่อ', 'Checked in'),
  writtenOn: c('เขียนเมื่อ', 'Written'),
  takeDown: c('นำรีวิวนี้ออก', 'Take this review down'),
  takeDownReason: c('เหตุผล (ผู้เขียนจะได้อ่านในภาษาของตัวเอง)', 'Reason (the author reads this in their own language)'),
  takeDownNote: c('บันทึกภายใน (ผู้เขียนไม่เห็น)', 'Internal note (not shown to the author)'),
  takeDownCta: c('นำออก', 'Take down'),
  restoreCta: c('นำกลับมาแสดง', 'Restore'),
  takenDownBy: c('นำออกโดย', 'Taken down by'),
  authorIsTold: c(
    'ผู้เขียนจะได้รับแจ้งเหตุผลนี้ในภาษาของเขา การนำรีวิวออกโดยไม่บอกเหตุผลคือการเซ็นเซอร์เงียบ',
    'The author is told this reason, in their own language. Taking something down without saying why is censoring quietly.',
  ),
  pointsKept: c(
    'แต้มที่ได้ไปแล้วไม่ถูกเรียกคืน เพราะเขาไปที่นั่นจริง สิ่งที่ผิดคือข้อความ ไม่ใช่การเดินทาง',
    'Points already paid are not clawed back — the visit really happened. What was wrong was the words, not the trip.',
  ),
  moderatorsOnly: c('เฉพาะผู้ดูแล', 'Moderators only'),
  moderatorsOnlyBlurb: c(
    'บัญชีของคุณตรวจหลักฐานภารกิจของหน่วยงานตัวเองได้ แต่ไม่มีสิทธิ์ดูแลรีวิว รีวิวเป็นเรื่องของสถานที่ ซึ่งไม่มีหน่วยงานใดเป็นเจ้าของ',
    'Your account reviews your own quest submissions. Moderating reviews is a separate permission: reviews are about places, which no host owns.',
  ),
  backToQueue: c('กลับไปที่คิว', 'Back to queue'),

  awaitingReview: c('รอตรวจสอบ', 'Awaiting review'),
  pastSla: c('เกิน 24 ชม.', 'Past 24h'),
  oldestWaiting: c('รอนานที่สุด', 'Oldest waiting'),
  nothingToReview: c('ไม่มีรายการรอตรวจ', 'Nothing to review'),
  nothingToReviewBlurb: c(
    'หลักฐานใหม่จะปรากฏที่นี่เมื่ออาสาสมัครส่งเข้ามา',
    'New submissions appear here as volunteers send them.',
  ),
  photo: c('ภาพ', 'photo'),
  photos: c('ภาพ', 'photos'),
  priorRejections: c('เคยถูกปฏิเสธ', 'prior rejections'),

  quest: c('ภารกิจ', 'Quest'),
  pointsAtStake: c('แต้มสีเขียวที่จะได้รับ', 'Green Points at stake'),
  fence: c('รัศมีพื้นที่', 'fence'),
  submitted: c('ส่งเมื่อ', 'Submitted'),
  volunteer: c('อาสาสมัคร', 'Volunteer'),
  approvedCount: c('ผ่าน', 'approved'),
  rejectedCount: c('ไม่ผ่าน', 'rejected'),
  withYou: c('กับหน่วยงานของคุณ', 'with you'),
  weightLogged: c('น้ำหนักที่บันทึก', 'Weight logged'),
  none: c('ไม่มี', 'None'),
  photosHeading: c('ภาพถ่ายหลักฐาน', 'Photos'),
  noPhotos: c('ไม่มีภาพถ่ายแนบมากับหลักฐานนี้', 'No photos were uploaded with this submission.'),
  fromSite: c('จากพื้นที่ภารกิจ', 'from site'),
  noLocation: c('ไม่มีข้อมูลตำแหน่ง', 'No location recorded'),

  automaticChecks: c('การตรวจอัตโนมัติ', 'Automatic checks'),
  checksBlurb: c(
    'นี่เป็นเพียงสัญญาณเตือน ไม่ใช่คำตัดสิน คุณคือผู้รับรองงานนี้ โปรดใช้วิจารณญาณและดูภาพถ่ายประกอบ',
    'These are signals, not decisions. You are the one vouching for this work — use your judgement and the photos.',
  ),
  checkPhotoLocation: c('ตำแหน่งภาพถ่าย', 'Photo location'),
  checkCaptureTime: c('เวลาถ่ายภาพ', 'Capture time'),
  checkWeight: c('น้ำหนักที่บันทึก', 'Weight logged'),

  decision: c('การตัดสิน', 'Decision'),
  reasonIfRejecting: c('เหตุผล หากไม่อนุมัติ', 'Reason, if rejecting'),
  selectPlaceholder: c('— เลือก —', '— select —'),
  noteToVolunteer: c('ข้อความถึงอาสาสมัคร (ไม่บังคับ)', 'Note to the volunteer (optional)'),
  notePlaceholder: c(
    'สิ่งที่ช่วยให้เขาทำได้ถูกต้องในครั้งต่อไป',
    'Anything that helps them get it right next time.',
  ),
  /**
   * Said plainly, because it changes what a reviewer should write: the preset
   * reason is translated for the volunteer, a free-text note is not.
   */
  noteNotTranslated: c(
    'ข้อความนี้จะแสดงตามที่คุณพิมพ์ ไม่มีการแปล อาสาสมัครอาจอ่านภาษาไทยไม่ได้ — หากต้องการให้แน่ใจ ให้เลือกเหตุผลจากรายการด้านบน',
    'This note is shown exactly as typed, with no translation. The volunteer may not read your language — pick a reason above if you need to be certain they understand.',
  ),
  approveAndRelease: c('อนุมัติและปล่อยแต้ม', 'Approve and release'),
  reject: c('ไม่อนุมัติ', 'Reject'),
  approveWarning: c(
    'การอนุมัติจะปล่อยแต้มทันทีและบันทึกรายการในบัญชีโดยระบุชื่อ',
    'Approving releases points immediately and writes a ledger entry naming',
  ),
  cannotUndo: c('ไม่สามารถย้อนกลับจากหน้านี้ได้', 'This cannot be undone from the console.'),
  reasonRequired: c('ต้องระบุเหตุผล', 'A reason is required'),
  reasonRequiredBlurb: c(
    'เลือกเหตุผลหรือเขียนข้อความ เพื่อให้อาสาสมัครรู้ว่าต้องแก้ไขอะไร',
    'Choose a reason or write a note so the volunteer knows what to change.',
  ),

  recentDecisions: c('การตัดสินล่าสุด', 'Recent decisions'),
  recentDecisionsBlurb: c(
    'ทุกการตัดสินมีผู้รับผิดชอบระบุไว้ นี่คือหลักฐานเบื้องหลังการให้แต้มแต่ละครั้ง',
    'Every decision is attributed. This is the record behind each award.',
  ),
  noDecisions: c('ยังไม่มีการตัดสิน', 'No decisions yet.'),
  colQuest: c('ภารกิจ', 'Quest'),
  colVolunteer: c('อาสาสมัคร', 'Volunteer'),
  colDecision: c('ผลการตัดสิน', 'Decision'),
  colReviewer: c('ผู้ตรวจ', 'Reviewer'),
  colWhen: c('เมื่อ', 'When'),
  approved: c('อนุมัติ', 'Approved'),
  rejected: c('ไม่อนุมัติ', 'Rejected'),

  notFound: c('ไม่พบรายการ', 'Not found'),
  notInYourQueue: c('รายการนี้ไม่อยู่ในคิวของคุณ', 'That submission is not in your queue.'),
  sessionExpired: c('เซสชันหมดอายุ', 'Session expired'),
  signInAgain: c('กรุณาเข้าสู่ระบบใหม่แล้วลองอีกครั้ง', 'Please sign in again and retry.'),
  back: c('ย้อนกลับ', 'Back'),
  // -- Check explanations -------------------------------------------------
  // Templated with {placeholders}. The review service returns a key and the
  // numbers; the sentence is built here, where the locale is known.
  geotagNone: c(
    'ไม่มีภาพใดบันทึกตำแหน่ง โทรศัพท์หลายรุ่นตัดข้อมูลนี้ออก โปรดตัดสินจากภาพถ่าย',
    'No photo carries a location. Many phones strip it — judge on the images.',
  ),
  geotagPass: c(
    'ภาพที่มีตำแหน่งทั้งหมดอยู่ในระยะ {radius} ม. จากพื้นที่ (ไกลสุด {worst} ม.)',
    'All located photos are within {radius} m of the site (furthest {worst} m).',
  ),
  geotagWarn: c(
    'ภาพที่ไกลสุดอยู่ห่าง {worst} ม. จากพื้นที่ (รัศมี {radius} ม.) น่าจะเป็นความคลาดเคลื่อนของ GPS',
    'Furthest photo is {worst} m from the site (fence {radius} m). Likely GPS drift.',
  ),
  geotagFail: c(
    'ภาพที่ไกลสุดอยู่ห่าง {worst} ม. จากพื้นที่ ซึ่งเกินรัศมี {radius} ม. อย่างชัดเจน',
    'Furthest photo is {worst} m from the site — well outside the {radius} m fence.',
  ),
  timingNone: c(
    'ไม่มีเวลาถ่ายภาพที่ใช้เทียบกับเวลาเช็คอินได้',
    'No usable timestamps to compare against check-in.',
  ),
  timingPass: c(
    'ภาพที่มีเวลากำกับทั้งหมดถ่ายหลังเช็คอิน',
    'All timestamped photos were taken after check-in.',
  ),
  timingBefore: c(
    'ภาพแรกสุดถ่ายก่อนเช็คอิน {minutes} นาที',
    'Earliest photo predates check-in by {minutes} minutes.',
  ),
  weightNone: c('ไม่ได้ระบุน้ำหนัก', 'No weight submitted.'),
  weightInvalid: c('น้ำหนักต้องมากกว่าศูนย์', 'Weight must be positive.'),
  weightHigh: c(
    '{kg} กก. สูงผิดปกติสำหรับอาสาสมัครหนึ่งคน ควรตรวจสอบเพิ่มเติม',
    '{kg} kg is unusually high for one volunteer — worth confirming.',
  ),
  weightOk: c('{kg} กก.', '{kg} kg.'),
} as const;

export type ConsoleStringKey = keyof typeof consoleStrings;

/** Translate one console string. */
export const t = (key: ConsoleStringKey, locale: Locale): string => consoleStrings[key][locale];

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
  return entry[locale].replace(/\{(\w+)\}/g, (whole, name: string) =>
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
  const rtf = new Intl.RelativeTimeFormat(locale === 'th' ? 'th-TH' : 'en-GB', {
    numeric: 'auto',
  });
  if (hours < 1) return rtf.format(-Math.max(1, Math.round(hours * 60)), 'minute');
  if (hours < 48) return rtf.format(-Math.floor(hours), 'hour');
  return rtf.format(-Math.floor(hours / 24), 'day');
}

/** The HTML `lang` attribute, so screen readers use the right voice. */
export const htmlLang = (locale: Locale): string => (locale === 'th' ? 'th' : 'en');

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
        // "th-TH" -> "th". Region is irrelevant: we serve one Thai and one English.
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
