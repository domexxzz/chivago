/**
 * Every shared UI string in the app, in both languages.
 *
 * The app shows ONE at a time, chosen from the phone's locale and switchable on
 * the Account screen - see `apps/mobile/src/i18n/locale.ts`. It used to print
 * both, English with the Thai captioned underneath, which doubled the length of
 * every screen on a phone. The pairs are still authored together here so a
 * translation can never drift from what it translates.
 *
 * The exception is anything an emergency responder might read off a
 * traveller's phone - the SOS banner, the Safety screen, the emergency numbers.
 * Those keep both languages whatever the app is set to.
 *
 * WHY ONE FILE
 * Handoff open question 8: "all Thai strings in this bundle were authored for
 * design and need a native review pass before release." Keeping the shared ones
 * here makes that review mostly a single pass over a single file. Screen-local
 * copy may be paired inline as `t({ en, th })`; `pnpm thai:review` collects
 * both shapes, so nothing written either way escapes the review.
 *
 * REVIEW STATUS: th strings are DESIGN DRAFT. Not yet reviewed by a native
 * speaker. See docs/04-open-questions.md.
 */

import type { Bilingual } from './types.ts';

const t = (en: string, th: string): Bilingual => ({ en, th });

export const strings = {
  // -- App shell ----------------------------------------------------------
  tabs: {
    home: t('Home', 'หน้าแรก'),
    map: t('Map', 'แผนที่'),
    quests: t('Missions', 'ภารกิจ'),
    wallet: t('Wallet', 'กระเป๋าแต้ม'),
    impact: t('Impact', 'ผลลัพธ์'),
    safety: t('Safety', 'ความปลอดภัย'),
  },

  common: {
    back: t('Back', 'ย้อนกลับ'),
    seeAll: t('See all', 'ดูทั้งหมด'),
    skip: t('Skip', 'ข้าม'),
    cancel: t('Cancel', 'ยกเลิก'),
    retry: t('Retry', 'ลองอีกครั้ง'),
    loading: t('Loading', 'กำลังโหลด'),
    offline: t('Offline — showing last known data', 'ออฟไลน์ — แสดงข้อมูลล่าสุด'),
    greenPoints: t('Green Points', 'แต้มสีเขียว'),
    tripPoints: t('Trip Points', 'แต้มทริป'),
    // What each currency MEANS, in one line. Shown next to the two balances
    // because a traveller holding both will otherwise assume they are
    // interchangeable, and the difference is the entire point.
    greenPointsNote: t('Verified by a host', 'ผ่านการตรวจจากผู้จัดภารกิจ'),
    tripPointsNote: t('Earned as you explore', 'ได้จากการออกไปเที่ยว'),
  },

  // -- Onboarding ---------------------------------------------------------
  onboarding: {
    step: (n: number) => t(`Step ${n} of 3`, `ขั้นที่ ${n} จาก 3`),
    continueCta: t('Continue', 'ต่อไป'),
    enterCta: t('Enter ChivaGo', 'เข้าสู่ ChivaGo'),
    q1: t('What are you here for?', 'คุณมาเพื่ออะไร'),
    q2: t('How active are your days?', 'ระดับกิจกรรมต่อวัน'),
    q3: t('What should we watch for you?', 'ให้เราดูแลเรื่องอะไร'),
    purposes: {
      wellness: t('Wellness & spa', 'สุขภาพและสปา'),
      nature: t('Nature & green space', 'ธรรมชาติและพื้นที่สีเขียว'),
      food: t('Healthy local food', 'อาหารท้องถิ่นเพื่อสุขภาพ'),
      volunteering: t('Volunteering', 'อาสาสมัคร'),
      quiet: t('Quiet, away from crowds', 'เลี่ยงที่คนเยอะ'),
    },
    activities: {
      gentle: t('Gentle — under 3 km', 'เบา ไม่เกิน 3 กม.'),
      moderate: t('Moderate — 3 to 8 km', 'ปานกลาง 3–8 กม.'),
      full: t('Full days — 8 km+', 'เต็มวัน 8 กม. ขึ้นไป'),
    },
    watch: {
      air: t('Air quality alerts', 'แจ้งเตือนคุณภาพอากาศ'),
      crowd: t('Crowd warnings', 'แจ้งเตือนความหนาแน่น'),
      scam: t('Scam & fraud checks', 'ตรวจสอบการหลอกลวง'),
      location: t('Live location with family', 'แชร์ตำแหน่งกับครอบครัว'),
      language: t('Thai↔English help', 'ช่วยเหลือด้านภาษา'),
    },
    /**
     * PDPA notice. Thailand's PDPA requires informed, specific, logged consent
     * BEFORE a feature that collects personal data is activated. Live location
     * and family sharing are exactly that, so the consent line sits on the
     * screen that switches them on - not buried in a settings page.
     */
    consent: t(
      'Location and health preferences are stored to personalise your Healthy Score. You can change or delete them any time in Profile.',
      'ข้อมูลตำแหน่งและความชอบด้านสุขภาพถูกเก็บเพื่อปรับคะแนนสุขภาวะให้เหมาะกับคุณ แก้ไขหรือลบได้ทุกเมื่อในโปรไฟล์',
    ),
    consentLink: t('Read the privacy notice', 'อ่านประกาศความเป็นส่วนตัว'),
  },

  // -- Map ----------------------------------------------------------------
  map: {
    island: t('Koh Samui', 'เกาะสมุย'),
    legend: (avg: number) => t(`Healthy Score · ${avg} avg today`, `คะแนนสุขภาวะ · เฉลี่ย ${avg} วันนี้`),
    liveNear: (n: number) => t(`Live · ${n} places near you`, `สด · ${n} สถานที่ใกล้คุณ`),
    questsNearYou: t('Quests near you', 'ภารกิจใกล้คุณ'),
    /** A quest's mark on the map: what it is, where, and what it pays. */
    questPin: (points: number) => t(`Quest · +${points} points`, `ภารกิจ · +${points} แต้ม`),
    /** The compass rose. Tapping it returns the camera to the island view. */
    compass: t('Compass. Return to the island view', 'เข็มทิศ แตะเพื่อกลับมุมมองเกาะ'),
    layers: {
      Green: t('Green', 'สีเขียว'),
      Wellness: t('Wellness', 'สุขภาพ'),
      Food: t('Food', 'อาหาร'),
      Safe: t('Safe', 'ปลอดภัย'),
      Quest: t('Quest', 'ภารกิจ'),
    },
  },

  // -- Place --------------------------------------------------------------
  place: {
    context: t('Place', 'สถานที่'),
    healthyScore: t('Healthy Score', 'คะแนนสุขภาวะของพื้นที่'),
    addToRoute: t("Add to today's route", 'เพิ่มลงเส้นทาง'),
    safePath: t('Safe path from here', 'เส้นทางปลอดภัยจากที่นี่'),
    addedToast: t('Added to Day 2', 'เพิ่มแล้ว'),
    /** Opens the score breakdown sheet. A score nobody can interrogate is a trust risk. */
    howCalculated: t('How is this calculated?', 'คำนวณอย่างไร'),
    provenance: {
      live: t('Live', 'ข้อมูลสด'),
      daily: t('Updated daily', 'อัปเดตรายวัน'),
      estimated: t('Estimated', 'ประมาณการ'),
      stale: t('Last known', 'ข้อมูลล่าสุด'),
    },
  },

  // -- Quests -------------------------------------------------------------
  quests: {
    title: t('Missions', 'ภารกิจสีเขียว'),
    subtitle: t('Complete quests for the environment, earn points', 'ทำภารกิจเพื่อสิ่งแวดล้อม แลกเป็นแต้ม'),
    filters: {
      today: t('Today', 'วันนี้'),
      weekend: t('Weekend', 'สุดสัปดาห์'),
      all: t('All', 'ทั้งหมด'),
    },
    by: (host: string) => t(`By ${host}`, `โดย ${host}`),
    footer: t(
      'Quests are posted by municipalities, NGOs, hotels and community groups. Proof is reviewed by the host before points are released.',
      'ภารกิจจัดโดยเทศบาล องค์กรไม่แสวงหากำไร โรงแรม และกลุ่มชุมชน หลักฐานจะถูกตรวจสอบโดยผู้จัดก่อนปล่อยแต้ม',
    ),
    empty: t('No quests match this filter', 'ไม่มีภารกิจที่ตรงกับตัวกรองนี้'),
  },

  // -- Quest detail -------------------------------------------------------
  quest: {
    context: (code: string) => t(`Quest · ${code}`, `ภารกิจ · ${code}`),
    reward: t('Reward', 'รางวัล'),
    duration: t('Duration', 'ระยะเวลา'),
    host: t('Host', 'ผู้ให้ภารกิจ'),
    progress: t('Progress', 'ความคืบหน้า'),
    steps: {
      joined: t('Joined', 'เข้าร่วมภารกิจ'),
      arrived: t('Arrived at site', 'ถึงพื้นที่แล้ว'),
      proof_submitted: t('Proof submitted', 'ส่งหลักฐานแล้ว'),
      host_verification: t('Host verification', 'ผู้ให้ภารกิจตรวจสอบ'),
      complete: t('Complete · points released', 'สำเร็จ ได้รับแต้ม'),
    },
    ctaJoin: t('Join this quest', 'เข้าร่วมภารกิจ'),
    ctaArrive: t("I'm at the site", 'ฉันถึงพื้นที่แล้ว'),
    ctaSend: t('Send for verification', 'ส่งตรวจสอบ'),
    ctaWallet: t('Open wallet', 'เปิดกระเป๋าแต้ม'),
    submitProof: t('Submit proof', 'ส่งหลักฐาน'),
    proofHelper: t(
      'Geo-tagged photos + weight of waste collected. Verified by host within 24h.',
      'ภาพถ่ายพร้อมพิกัด และน้ำหนักขยะที่เก็บได้ ตรวจสอบโดยผู้จัดภายใน 24 ชม.',
    ),
    weightLabel: t('Waste collected (kg)', 'น้ำหนักขยะที่เก็บได้ (กก.)'),
    // The Thai said only 'checking the proof' and dropped WHO is checking it.
    // A traveller waiting on a decision has one question, and it is which host.
    verifying: (host: string) => t(`Verifying with ${host}…`, `${host} กำลังตรวจสอบหลักฐาน`),
    /**
     * Verification can legitimately take up to 24h, so this screen must be
     * leavable and the result must arrive as a notification.
     */
    verifyingLeavable: t(
      'You can leave this screen — we will notify you when the host responds.',
      'ออกจากหน้านี้ได้ เราจะแจ้งเตือนเมื่อผู้จัดตรวจสอบเสร็จ',
    ),
    // A host vouched for the proof. ยืนยัน, not ตรวจสอบ: the same word the
    // concierge, the reviews notice and the merchant registry already use
    // wherever a person stands behind something. ตรวจสอบ is inspection, and
    // it belongs to the safety labels, which is where it now stays.
    verified: t('Verified', 'ยืนยันแล้ว'),
    /**
     * The weight is the one on the proof the host approved, or nothing. A
     * number the app does not hold is not printed: this panel used to say
     * 4.2 kg to everyone, next to a statement that said 3.2.
     */
    verifiedDetail: (kg: number | null) =>
      kg === null
        ? t(
          'Green Points added · logged to the Samui impact ledger',
          'เพิ่มแต้มสีเขียวแล้ว · บันทึกลงบัญชีผลลัพธ์เกาะสมุย',
        )
        : t(
          `Green Points added · ${kg} kg waste logged to Samui impact ledger`,
          `เพิ่มแต้มสีเขียวแล้ว · บันทึกขยะ ${kg} กก. ลงบัญชีผลลัพธ์เกาะสมุย`,
        ),
    /**
     * The host filed this verification in a statement anyone can check - the
     * guest-facing half of the evidence layer (docs/31). The traveller is told
     * their work became a record somebody handed on, and can open it.
     */
    onRecord: t('On record', 'อยู่ในบันทึกแล้ว'),
    onRecordDetail: (host: string, id: string, from: string, to: string) =>
      t(
        `${host} filed this in statement ${id}, covering ${from} to ${to}.`,
        `${host} บันทึกงานนี้ไว้ในรายการกิจกรรม ${id} ช่วง ${from} ถึง ${to}`,
      ),
    onRecordCheck: t('Anyone can check this statement', 'ใครก็ตรวจสอบรายการนี้ได้'),
    /** The design has no rejection state. Real host review rejects submissions. */
    rejected: t('Proof not accepted', 'หลักฐานไม่ผ่าน'),
    resubmit: t('Submit new proof', 'ส่งหลักฐานใหม่'),
    outsideGeofence: t(
      'You need to be at the site to check in',
      'คุณต้องอยู่ในพื้นที่ภารกิจเพื่อเช็กอิน',
    ),
    addPhoto: t('Add a photo', 'เพิ่มรูปถ่าย'),
    photoUnavailable: t(
      'Could not open the camera or photos. Try the other one',
      'เปิดกล้องหรือคลังรูปไม่ได้ ลองอีกทางหนึ่ง',
    ),
    queuedOffline: t(
      'Saved — will upload when you have signal',
      'บันทึกแล้ว จะอัปโหลดเมื่อมีสัญญาณ',
    ),
  },

  // -- Wallet -------------------------------------------------------------
  wallet: {
    balance: t('Balance', 'ยอดแต้ม'),
    ranks: t('Ranks', 'ระดับนักเดินทาง'),
    level: (n: number) => t(`Level ${n}`, `เลเวล ${n}`),
    // "2,480 / 3,900 EXP" - the deck shows the raw figures, and they are more
    // legible than a percentage when the span changes every level.
    levelBar: (into: number, span: number) =>
      t(
        `${into.toLocaleString('en-US')} / ${span.toLocaleString('en-US')} EXP`,
        `${into.toLocaleString('en-US')} / ${span.toLocaleString('en-US')} EXP`,
      ),
    toNextRank: (levels: number, rank: string) =>
      t(
        `${levels} ${levels === 1 ? 'level' : 'levels'} to ${rank}`,
        `อีก ${levels} เลเวลถึง ${rank}`,
      ),
    topRank: t('Top rank reached', 'ถึงระดับสูงสุดแล้ว'),
    // EXP is lifetime and is never spent. Saying so where the number lives
    // stops the obvious wrong assumption that redeeming will cost a level.
    expNote: t('EXP is never spent', 'EXP ไม่ถูกหักเมื่อใช้แต้ม'),
    ledger: t('Ledger', 'ประวัติแต้ม'),
    spendPoints: t('Spend points', 'ใช้แต้ม'),
    /** The two purses, named. Shown beside a figure, so short. */
    green: t('Green', 'เขียว'),
    trip: t('Trip', 'ทริป'),

    emptyLedger: t('No activity yet — join a quest to start earning', 'ยังไม่มีรายการ เริ่มจากเข้าร่วมภารกิจ'),
  },

  // -- Marketplace --------------------------------------------------------
  market: {
    context: t('Marketplace', 'ใช้แต้ม'),
    intro: t(
      'Every redemption pays a local business directly. 100% of the point value is settled to the merchant.',
      'ทุกการแลกจ่ายให้ธุรกิจท้องถิ่นโดยตรง 100% ของมูลค่าแต้มถูกโอนให้ร้านค้า',
    ),
    redeem: t('Redeem', 'แลก'),
    notEnough: t('Not enough points yet', 'แต้มยังไม่พอ'),
    payWith: (currency: string) => t(`Pay with ${currency}`, `จ่ายด้วย${currency}`),
    voucherSent: (merchant: string) => t(`Voucher sent to ${merchant}`, `ส่งบัตรกำนัลให้ ${merchant} แล้ว`),
    voucherTitle: t('Your voucher', 'บัตรกำนัลของคุณ'),
    voucherShow: t('Show this to the merchant', 'แสดงรหัสนี้ให้ร้านค้า'),
    voucherExpires: (when: string) => t(`Expires ${when}`, `หมดอายุ ${when}`),
    voucherRedeemed: t('Redeemed', 'ใช้แล้ว'),
    unavailable: t('Currently unavailable', 'ยังไม่เปิดให้แลก'),
  },

  // -- Impact -------------------------------------------------------------
  impact: {
    title: t('Your impact', 'ผลลัพธ์ของคุณ'),
    subtitle: t('What you have created on Koh Samui', 'ผลลัพธ์ที่คุณสร้างบนเกาะสมุย'),
    community: (year: number) => t(`Samui community total · ${year}`, `ผลรวมชุมชนเกาะสมุย · ${year}`),
    verifiedData: t('Verified activity data', 'ข้อมูลกิจกรรมที่ตรวจสอบแล้ว'),
    verifiedBlurb: t(
      'Your logged hours feed the Samui ESG Impact Report used by partner hotels and sponsors.',
      'ชั่วโมงที่คุณบันทึกถูกรวมในรายงาน ESG เกาะสมุย ที่โรงแรมพันธมิตรและผู้สนับสนุนใช้',
    ),
    exportCard: t('Export my impact card', 'ส่งออกการ์ดผลลัพธ์'),
    exported: t('Impact card exported', 'ส่งออกการ์ดแล้ว'),
    stats: {
      wasteCollected: t('Waste collected', 'ขยะที่เก็บได้'),
      mangrovesPlanted: t('Mangroves planted', 'ต้นโกงกางที่ปลูก'),
      volunteerTime: t('Volunteer time', 'เวลาอาสาสมัคร'),
      questsVerified: t('Quests verified', 'ภารกิจที่ผ่านการตรวจ'),
      treesPlanted: t('Trees planted', 'ต้นไม้ที่ปลูก'),
      volunteerHours: t('Volunteer hours', 'ชั่วโมงอาสาสมัคร'),
      participants: t('Participants', 'ผู้เข้าร่วม'),
      activities: t('Community activities', 'กิจกรรมชุมชน'),
    },
    /** Percentages are progress against the pilot-year target, always computed. */
    ofTarget: (pct: number) => t(`${pct}% of target`, `${pct}% ของเป้าหมาย`),
  },

  // -- Safety -------------------------------------------------------------
  safety: {
    kicker: t('Security Shield', 'เกราะความปลอดภัย'),
    title: t("You're covered", 'เราดูแลคุณ'),
    subtitle: t('Someone is looking out for you the whole trip', 'มีผู้ช่วยดูแลคุณตลอดการเดินทาง'),
    services: {
      tracking: t('Live Tracking', 'ติดตามตำแหน่งสด'),
      trackingNote: t('Shared with 2 family contacts', 'แชร์กับผู้ติดต่อในครอบครัว 2 คน'),
      safePath: t('Safe Path', 'เส้นทางปลอดภัย'),
      safePathNote: t('Night routing avoids 3 unlit stretches', 'เส้นทางกลางคืนเลี่ยงช่วงไม่มีไฟ 3 จุด'),
      antiScam: t('Anti-Scam', 'ป้องกันการหลอกลวง'),
      antiScamNote: t('11 QR merchants verified this trip', 'ตรวจสอบร้านค้า QR แล้ว 11 ร้านในทริปนี้'),
      emergency: t('Emergency Assistance', 'ความช่วยเหลือฉุกเฉิน'),
      emergencyNote: t('Bangkok Hospital Samui · 4.1 km', 'โรงพยาบาลกรุงเทพสมุย · 4.1 กม.'),
      language: t('Language Help', 'ช่วยเหลือด้านภาษา'),
      languageNote: t('Thai↔English interpreter on call', 'ล่ามไทย-อังกฤษพร้อมให้บริการ'),
    },
    states: { on: t('On', 'เปิด'), ready: t('Ready', 'พร้อม'), off: t('Off', 'ปิด') },
    emergency: t('Emergency', 'ฉุกเฉิน'),
    sosIdle: t('Press and hold', 'กดค้างไว้'),
    sosArmed: t('Alert sent', 'ส่งการแจ้งเตือนแล้ว'),
    dispatching: (where: string) => t(`Dispatching · ${where}`, `กำลังส่งความช่วยเหลือ · ${where}`),
    dispatchDetail: t(
      'Bangkok Hospital Samui notified · Live location shared with 2 contacts · Thai↔English interpreter joining',
      'แจ้งโรงพยาบาลกรุงเทพสมุยแล้ว · แชร์ตำแหน่งกับผู้ติดต่อ 2 คน · ล่ามไทย-อังกฤษกำลังเข้าร่วม',
    ),
    cancelAlert: t('Cancel alert', 'ยกเลิกการแจ้งเตือน'),
    /**
     * The window between the hold completing and the alert going out.
     *
     * Worded as a countdown, not a question. "Sending in 4" tells someone who
     * pressed by accident exactly how long they have; "Are you sure?" makes
     * someone who meant it stop and answer. The default has to favour the
     * person in trouble.
     */
    sosSending: (s: number) => t(`Sending in ${s}`, `ส่งใน ${s} วินาที`),
    sosStop: t('Stop', 'หยุด'),
    sosStopped: t('Stopped. Nothing was sent.', 'หยุดแล้ว ยังไม่ได้ส่งอะไรออกไป'),
    antiScamFooter: t(
      'Anti-Scam checks every booking QR against the verified merchant registry before you pay.',
      'ระบบตรวจสอบ QR ทุกการจองกับทะเบียนร้านค้าที่ยืนยันแล้วก่อนคุณชำระเงิน',
    ),
    /**
     * A live alert persists across navigation and shows a global banner.
     *
     * Wording matters here. The prototype's "help is on the way" is a promise
     * this system cannot keep - it does not dispatch anyone. What is true is
     * that the alert is live and being shared.
     */
    activeBanner: t('SOS active — your location is being shared', 'SOS ทำงานอยู่ — กำลังแชร์ตำแหน่งของคุณ'),
    shareLink: t('Share my live location', 'แชร์ตำแหน่งปัจจุบัน'),
    shareMessage: t(
      'I need help. This link shows my live location:',
      'ฉันต้องการความช่วยเหลือ ลิงก์นี้แสดงตำแหน่งปัจจุบันของฉัน:',
    ),
    shareFailed: t('Could not open sharing', 'เปิดการแชร์ไม่ได้'),
    contactsReached: (reached: number, total: number) =>
      t(`${reached} of ${total} contacts reached`, `ติดต่อได้ ${reached} จาก ${total} คน`),
    noContacts: t(
      'No emergency contacts saved — share the link yourself',
      'ยังไม่มีผู้ติดต่อฉุกเฉิน กรุณาแชร์ลิงก์ด้วยตนเอง',
    ),
    notAcknowledged: t('Nobody has picked this up yet', 'ยังไม่มีเจ้าหน้าที่รับเรื่อง'),
    acknowledgedBy: (who: string) => t(`${who} has your alert`, `${who} รับเรื่องแล้ว`),
    /** The line that must never be buried. */
    cannotDispatch: t(
      'ChivaGo cannot send an ambulance. Call 1669 if anyone is hurt.',
      'ChivaGo ส่งรถพยาบาลไม่ได้ หากมีผู้บาดเจ็บ กรุณาโทร 1669',
    ),
    /**
     * Official Thai emergency numbers. Free to call, no airtime credit needed.
     * ChivaGo dispatch never replaces these - it runs alongside them.
     */
    callDirect: t('Or call directly', 'หรือโทรโดยตรง'),
    numbers: {
      ems: t('Medical emergency · 1669', 'เจ็บป่วยฉุกเฉิน · 1669'),
      touristPolice: t('Tourist Police · 1155', 'ตำรวจท่องเที่ยว · 1155'),
      police: t('Police · 191', 'ตำรวจ · 191'),
    },
  },

  // -- Notifications (in-app inbox) ----------------------------------------
  notifications: {
    title: t('Updates', 'อัปเดต'),
    markAllRead: t('Mark all read', 'อ่านทั้งหมดแล้ว'),
    empty: t('Nothing new', 'ไม่มีอัปเดตใหม่'),
    /**
     * Shown when the OS permission was declined. Not a nag - it explains that
     * nothing is lost, which is true, and where to change their mind.
     */
    pushOff: t(
      'Push notifications are off. Updates still appear here.',
      'การแจ้งเตือนถูกปิดอยู่ อัปเดตยังแสดงที่นี่',
    ),
  },

  // -- Check-in -----------------------------------------------------------
  checkin: {
    cta: t('Check in here', 'เช็กอินที่นี่'),
    // The phone could not get a fix at all - tree cover, a timeout, a
    // simulator. Different from a refused permission and from being too far.
    noFix: t(
      'Could not get your position. Move into the open and try again',
      'หาตำแหน่งไม่ได้ ลองย้ายไปที่โล่งแล้วลองใหม่',
    ),
    awarded: (n: number) =>
      t(`Checked in · +${n} Trip Points`, `เช็กอินแล้ว ได้ ${n} แต้มทริป`),
    // Warm, not red. Coming back to a place you liked is the behaviour the
    // product wants; the only thing being refused is a second payout.
    already: t(
      'Already checked in here today — come back tomorrow',
      'วันนี้เช็กอินที่นี่แล้ว พรุ่งนี้มาใหม่ได้',
    ),
    tooFar: (m: number) =>
      t(
        `You need to be at the place to check in — about ${m} m away`,
        `ต้องอยู่ที่สถานที่จริงถึงจะเช็กอินได้ ห่างประมาณ ${m} ม.`,
      ),
    // The other half of a check-in. When the phone cannot prove it, the
    // visit can still be RECORDED - in the passport, marked as self-reported
    // - without being SCORED. Said plainly so nobody thinks the points come
    // later.
    noteOffer: t('Note that I was here · no points', 'บันทึกว่ามาแล้ว · ไม่ได้แต้ม'),
    noted: (left: number) =>
      t(
        `Noted in your passport as self-reported · ${left} more this year`,
        `บันทึกลงพาสปอร์ตแล้ว (ระบุว่าบันทึกเอง) เหลืออีก ${left} ครั้งในปีนี้`,
      ),
    notedAlready: t('Already noted here', 'บันทึกที่นี่ไว้แล้ว'),
    quotaGone: t(
      'All self-reported stamps for this year are used',
      'โควตาบันทึกเองของปีนี้หมดแล้ว',
    ),
  },

  // -- Reviews ------------------------------------------------------------
  reviews: {
    title: t('Reviews', 'รีวิว'),
    // The claim that makes this different from every other review list. It is
    // a statement about the whole section, not a badge on individual rows.
    verifiedOnly: t(
      'Every review here is from someone the app confirmed was standing at this place',
      'ทุกรีวิวที่นี่มาจากคนที่แอปยืนยันแล้วว่าอยู่ที่นี่จริง',
    ),
    none: t('No reviews yet — be the first', 'ยังไม่มีรีวิว มาเป็นคนแรกกัน'),
    // Why the write control is missing. Never show a disabled button with no
    // explanation: the answer is "check in", and the user can act on it.
    lockedUntilCheckin: t(
      'Check in here first — reviews come from people who were actually here',
      'เช็กอินที่นี่ก่อน รีวิวมาจากคนที่มาที่นี่จริง',
    ),
    write: t('Write a review', 'เขียนรีวิว'),
    edit: t('Edit your review', 'แก้ไขรีวิวของคุณ'),
    yours: t('Your review', 'รีวิวของคุณ'),
    // Stands where an author name would go. The pilot has no accounts, so
    // every display name is the default "Traveller" - three identical names
    // read as broken, and the verification is the useful fact anyway.
    verifiedVisit: t('Verified visit', 'ยืนยันการมาเยือนแล้ว'),

    // -- Appeals ----------------------------------------------------------
    takenDown: t('Taken down', 'ถูกนำออกแล้ว'),
    takenDownExplain: (reason: string) =>
      t(`Only you can see this. Reason: ${reason}`, `มีเพียงคุณที่เห็นข้อความนี้ เหตุผล: ${reason}`),
    appeal: t('I think this was wrong', 'คิดว่าการตัดสินนี้ไม่ถูกต้อง'),
    appealTitle: t('Appeal this decision', 'อุทธรณ์คำตัดสิน'),
    appealBlurb: t(
      'A different moderator will read this. Say what you think they got wrong.',
      'ผู้ดูแลอีกคนจะเป็นคนอ่าน บอกได้เลยว่าคุณคิดว่าอะไรไม่ถูกต้อง',
    ),
    appealSubmit: t('Send appeal', 'ส่งอุทธรณ์'),
    appealSent: t('Appeal sent — a moderator will read it', 'ส่งอุทธรณ์แล้ว ผู้ดูแลจะอ่านให้'),
    appealPending: t('Appeal sent — waiting for a decision', 'ส่งอุทธรณ์แล้ว รอผลการพิจารณา'),
    appealDeclined: t('Appealed — the decision stood', 'อุทธรณ์แล้ว ยืนตามคำตัดสินเดิม'),

    // -- Reporting --------------------------------------------------------
    report: t('Report', 'รายงาน'),
    reportTitle: t('Report this review', 'รายงานรีวิวนี้'),
    // Says exactly what a report does and does not do. Someone who expects a
    // report to remove something, and watches it stay up, concludes the
    // button is fake.
    reportBlurb: t(
      'This sends the review to a moderator to look at. It does not remove it — only a moderator can do that.',
      'ระบบจะส่งรีวิวนี้ให้ผู้ดูแลตรวจ การรายงานไม่ได้ลบรีวิว มีเพียงผู้ดูแลเท่านั้นที่ทำได้',
    ),
    reportReason: t('What is wrong with it?', 'มีอะไรไม่ถูกต้อง'),
    reportNote: t('Anything else the moderator should know? (optional)', 'มีอะไรอยากบอกผู้ดูแลเพิ่มไหม (ไม่บังคับ)'),
    reportSubmit: t('Send report', 'ส่งรายงาน'),
    reported: t('Reported — a moderator will look at it', 'รายงานแล้ว ผู้ดูแลจะตรวจสอบให้'),
    reportedAlready: t('You have already reported this', 'คุณรายงานรีวิวนี้ไปแล้ว'),
    submit: t('Post review', 'โพสต์รีวิว'),
    remove: t('Delete', 'ลบ'),
    placeholder: t('What should the next traveller know?', 'อยากบอกอะไรกับคนที่จะมาต่อ'),
    rating: (n: number) =>
      t(`${n} out of 5`, `${n} จาก 5`),
    count: (n: number) =>
      t(`${n} ${n === 1 ? 'review' : 'reviews'}`, `${n} รีวิว`),
    visited: (when: string) =>
      t(`Visited ${when}`, `ไปมาเมื่อ ${when}`),
    posted: (n: number) =>
      t(`Posted · +${n} Trip Points`, `โพสต์แล้ว ได้ ${n} แต้มทริป`),
    // Says plainly that the edit earns nothing, rather than letting the user
    // discover it by watching a number not move.
    updated: t('Review updated', 'อัปเดตรีวิวแล้ว'),
    tooShortForPoints: (n: number) =>
      t(
        `Posted. Write ${n} characters or more to earn Trip Points.`,
        `โพสต์แล้ว เขียนอย่างน้อย ${n} ตัวอักษรถึงจะได้แต้มทริป`,
      ),
    // A review written in a language the reader may not have. We label it and
    // leave it as typed - a machine translation shown as the traveller's own
    // words is a quote they never said.
    inLanguage: (lang: string) =>
      t(`Written in ${lang}`, `เขียนเป็นภาษา${lang}`),
  },

  // -- Trip ---------------------------------------------------------------
  trip: {
    context: (day: number, date: string) => t(`Day ${day} · ${date}`, `วันที่ ${day} · ${date}`),
    walking: t('Walking', 'ระยะเดิน'),
    pointsToday: t('Points today', 'แต้มวันนี้'),
    air: t('Air', 'อากาศ'),
    empty: t('Nothing planned yet — add a place from the map', 'ยังไม่มีแผน เพิ่มสถานที่จากแผนที่'),
    planCta: t('Plan my day', 'จัดแผนวันนี้ให้ฉัน'),
    planBlurb: t(
      'Built from your profile, today’s air and where the quests are — every stop says why.',
      'จัดจากโปรไฟล์ คุณภาพอากาศวันนี้ และตำแหน่งภารกิจ ทุกจุดบอกเหตุผลว่าทำไม',
    ),
  },
} as const;

export type Strings = typeof strings;

// ---------------------------------------------------------------------------
// Rejection reasons
// ---------------------------------------------------------------------------

/**
 * Why a host rejected a proof submission.
 *
 * KEYED, NOT FREE TEXT, and deliberately so.
 *
 * The reviewer is usually Thai municipal staff working in Thai; the volunteer
 * may be a German tourist reading English. If the console stored whatever
 * string the reviewer saw, the volunteer would be shown the reviewer's
 * language. Storing a key means the reason is rendered in the reader's terms,
 * not the writer's.
 *
 * These live in core rather than with the console because they are
 * VOLUNTEER-FACING CONTENT. Console chrome (buttons, nav) lives with the
 * console; anything a traveller reads belongs here with the rest of the copy.
 *
 * The text has to be specific enough to act on. "Rejected" tells someone
 * nothing about how to succeed next time, and a quest they cannot complete is a
 * volunteer who stops volunteering.
 */
/**
 * Why a READER reported a review.
 *
 * Deliberately a different vocabulary from MODERATION_REASONS. A traveller
 * does not think "unverifiable_accusation"; they think "that is not true" or
 * "that names my daughter". Making them pick from the moderator's list would
 * either get the wrong reason or no report at all.
 *
 * The asymmetry is on purpose and worth being plain about: you may report
 * something as untrue, and we will NOT take it down for being untrue. We
 * cannot adjudicate what happened between a traveller and a bar. What the
 * report does is put it in front of a human who can judge whether it breaks
 * a rule we can actually apply.
 */
export const REPORT_REASONS = {
  personal_info: t(
    'It names or identifies someone',
    'มีการระบุชื่อหรือตัวตนของบุคคล',
  ),
  abusive: t(
    'It is abusive or threatening',
    'มีเนื้อหาคุกคามหรือดูหมิ่น',
  ),
  not_about_place: t(
    'It is not about this place',
    'ไม่ได้เกี่ยวกับสถานที่นี้',
  ),
  spam: t(
    'It is an advert or spam',
    'เป็นโฆษณาหรือสแปม',
  ),
  untrue: t(
    'I believe it is untrue',
    'คิดว่าไม่เป็นความจริง',
  ),
} as const;

export type ReportReasonKey = keyof typeof REPORT_REASONS;

export const REPORT_REASON_KEYS = Object.keys(REPORT_REASONS) as ReportReasonKey[];

/** Object.hasOwn, never `in` - see isRejectionReasonKey for the hole that closes. */
export const isReportReasonKey = (v: unknown): v is ReportReasonKey =>
  typeof v === 'string' && Object.hasOwn(REPORT_REASONS, v);

/**
 * What a moderator decided, told to the reporter.
 *
 * Keyed and localised like every other decision the platform reports. Both
 * outcomes are stated plainly: "we looked and left it up" is a real answer,
 * and hiding it would let the reporter assume nobody read it.
 */
export const REPORT_OUTCOMES = {
  removed: t(
    'it has been taken down',
    'รีวิวนั้นถูกนำออกแล้ว',
  ),
  kept: t(
    'a moderator read it and decided it can stay',
    'ผู้ดูแลอ่านแล้วและเห็นว่ายังคงไว้ได้',
  ),
} as const;

export type ReportOutcome = keyof typeof REPORT_OUTCOMES;

export const isReportOutcome = (v: unknown): v is ReportOutcome =>
  typeof v === 'string' && Object.hasOwn(REPORT_OUTCOMES, v);

/** Hard cap on a reporter note. Long enough for context, short enough to read. */
export const REPORT_MAX_NOTE = 300;

/**
 * Reports one reader may file in a rolling window.
 *
 * One-per-review already stops repeat-flagging a single target. This is the
 * other axis: nothing otherwise stopped one account reporting a hundred
 * different reviews in a minute and burying a moderator, which is the cheapest
 * denial-of-service a review system has.
 *
 * Ten an hour is far above any honest use - a reader who genuinely finds ten
 * bad reviews in an hour has found a spam wave, and the desk needs to see that
 * - and far below what an attack needs.
 */
export const REPORT_LIMIT_PER_WINDOW = 10;
export const REPORT_WINDOW_MINUTES = 60;

/**
 * Take-downs one moderator may make in a rolling hour.
 *
 * Reporting is rate limited and moderating is the more dangerous of the two:
 * a compromised moderator account can clear every review on the island, and
 * nothing else stops it.
 *
 * Thirty an hour is a real trade. A genuine spam wave of a hundred reviews
 * takes four hours to clear instead of one, which is survivable - the reviews
 * are already published and another hour changes little. An attacker needs ten
 * hours to do serious damage, which is long enough for somebody to notice.
 * The proper answer is a bulk action with a second approver; this is the
 * blast-radius cap until that exists.
 */
export const TAKEDOWN_LIMIT_PER_WINDOW = 30;
export const TAKEDOWN_WINDOW_MINUTES = 60;

// -- Watching the moderators ------------------------------------------------
//
// The first version of this compared every moderator against one fixed number,
// which fails in both directions at once. A busy moderator on a big island
// trips it every day until nobody reads the flag; a quiet one who suddenly
// does twelve take-downs never trips it at all, and that is the case worth
// catching.
//
// So the comparison is against their OWN normal, and every flag has to say
// which rule fired - a warning that cannot explain itself is an accusation.

/** Days of history compared against, ending where the recent window begins. */
export const WATCH_BASELINE_DAYS = 14;

/** How recent counts as recent. */
export const WATCH_RECENT_HOURS = 24;

/**
 * Days of history needed before a baseline means anything.
 *
 * A ratio computed from three data points is noise wearing the costume of
 * statistics. Below this the absolute rule applies instead, and the flag says
 * so.
 */
export const WATCH_MIN_BASELINE_DAYS = 5;

/** How far above their own median counts as a spike. */
export const WATCH_SPIKE_MULTIPLE = 3;

/**
 * A spike still needs a floor.
 *
 * Somebody whose normal is half a take-down a day would otherwise be flagged
 * for doing two, which is not news about anything.
 */
export const WATCH_SPIKE_FLOOR = 5;

/**
 * Take-downs in a day that are worth a look whatever the history says.
 *
 * Half the hourly cap. Applies when there is no baseline, and as a backstop
 * when there is.
 */
export const WATCH_ABSOLUTE = Math.floor(TAKEDOWN_LIMIT_PER_WINDOW / 2);

/**
 * Share of a moderator’s take-downs later reversed before it is worth asking
 * about, and the minimum volume before the share means anything.
 *
 * This is the strongest signal here and the least obvious: volume says a
 * moderator is BUSY, and reversals say they are WRONG. Somebody quietly
 * getting a third of their calls overturned never trips a volume rule.
 */
export const WATCH_OVERTURN_RATE = 0.3;
export const WATCH_OVERTURN_MIN = 5;

// -- Bulk take-down ---------------------------------------------------------
//
// The per-moderator cap contains a compromised account and makes a genuine
// spam wave take four hours to clear. This is the way out that does not
// simply raise the cap: one moderator proposes, a DIFFERENT one approves, and
// the batch then executes without the individual limit.
//
// It is a procedural control, not a cryptographic one. Two console keys and
// two invented names would defeat it. What it buys is a speed bump and an
// audit trail with two names on it, and that is worth saying plainly rather
// than dressing up as security.

/**
 * Reviews one batch may contain.
 *
 * Enough for a real spam wave; small enough that "approve" is a decision a
 * human can actually take responsibility for. A batch of five thousand is
 * not a decision, it is a signature on something nobody read.
 */
export const BATCH_MAX_REVIEWS = 200;

/**
 * How long a proposal stays approvable.
 *
 * A day-old proposal is a decision about a situation that has changed. If
 * nobody approved it in twenty-four hours the answer is not to approve it
 * late - it is that nobody was at the desk, which is a different problem.
 */
export const BATCH_EXPIRY_HOURS = 24;

/** Reviews shown to the approver before they can act. */
export const BATCH_PREVIEW = 5;

/** Hard cap on an appeal. Room to argue, not room to file a brief. */
export const APPEAL_MAX_MESSAGE = 800;

/**
 * How long a proof may sit unreviewed before we admit it.
 *
 * The design promises "verified by host within 24h". Going quiet past that is
 * how a volunteer decides the whole thing is a gimmick - so the promise being
 * broken has to produce a message rather than nothing.
 */
export const PROOF_SLA_HOURS = 24;

/**
 * How long an appeal may sit unread.
 *
 * Longer than a proof because a second moderator has to be found, and shorter
 * than a week because the person waiting has had their words removed and is
 * being told nothing.
 */
export const APPEAL_SLA_HOURS = 48;

/**
 * Why a review was taken down.
 *
 * KEYED, like a rejection reason and for the same reason: the moderator picks
 * in their language and the author reads it in theirs. An operator note can be
 * added alongside for the record, and is NOT shown to the author, because a
 * sentence typed in Thai is no use to a German traveller.
 *
 * `unverifiable_accusation` is the one that needs explaining. A review saying
 * "the owner drugged my drink" may be true and may be defamation, and a travel
 * app cannot adjudicate which. Taking it down while telling the author to
 * report it to the police is the only honest handling: we neither publish an
 * unproven accusation nor pretend nothing was said.
 */
export const MODERATION_REASONS = {
  personal_data: t(
    'Identifies an individual by name or contact details',
    'ระบุตัวบุคคลด้วยชื่อหรือข้อมูลติดต่อ',
  ),
  abusive: t(
    'Abusive, threatening or discriminatory',
    'มีเนื้อหาคุกคาม ดูหมิ่น หรือเลือกปฏิบัติ',
  ),
  not_about_place: t(
    'Not about this place',
    'ไม่ได้เกี่ยวกับสถานที่นี้',
  ),
  commercial: t(
    'Advertising, spam or a solicitation',
    'เป็นการโฆษณา สแปม หรือชักชวนทางการค้า',
  ),
  unverifiable_accusation: t(
    'A serious accusation we are not able to verify — please report it to the police',
    'เป็นข้อกล่าวหาร้ายแรงที่เราตรวจสอบไม่ได้ กรุณาแจ้งความกับเจ้าหน้าที่ตำรวจ',
  ),
} as const;

export type ModerationReasonKey = keyof typeof MODERATION_REASONS;

export const MODERATION_REASON_KEYS =
  Object.keys(MODERATION_REASONS) as ModerationReasonKey[];

/** Object.hasOwn, never `in` - see isRejectionReasonKey for the hole that closes. */
export const isModerationReasonKey = (v: unknown): v is ModerationReasonKey =>
  typeof v === 'string' && Object.hasOwn(MODERATION_REASONS, v);

export const REJECTION_REASONS = {
  no_work_shown: t(
    'Photos do not show the completed work',
    'ภาพถ่ายไม่แสดงงานที่ทำเสร็จแล้ว',
  ),
  not_at_site: t(
    'Photos were not taken at the quest site',
    'ภาพถ่ายไม่ได้ถ่ายในพื้นที่ภารกิจ',
  ),
  wrong_day: t(
    'Photos appear to be from a different day',
    'ภาพถ่ายดูเหมือนถ่ายคนละวันกับภารกิจ',
  ),
  weight_mismatch: t(
    'Weight logged does not match the photos',
    'น้ำหนักที่บันทึกไม่ตรงกับภาพถ่าย',
  ),
  too_few_photos: t(
    'Not enough photos to verify the work',
    'ภาพถ่ายไม่เพียงพอต่อการตรวจสอบ',
  ),
  duplicate: t(
    'Duplicate of an earlier submission',
    'ซ้ำกับหลักฐานที่ส่งมาก่อนหน้านี้',
  ),
} as const;

export type RejectionReasonKey = keyof typeof REJECTION_REASONS;

export const REJECTION_REASON_KEYS = Object.keys(REJECTION_REASONS) as RejectionReasonKey[];

/**
 * Validate a reason key arriving from a form post.
 *
 * `Object.hasOwn`, NOT `in`. `'__proto__' in REJECTION_REASONS` is true for any
 * plain object, so `in` would accept `__proto__`, `constructor` and `toString`
 * as valid reasons - and looking one up then yields Object.prototype, whose
 * `.en` is undefined. The volunteer would be told their proof was rejected
 * because "undefined".
 */
export const isRejectionReasonKey = (v: unknown): v is RejectionReasonKey =>
  typeof v === 'string' && Object.hasOwn(REJECTION_REASONS, v);

/**
 * Compose the message a volunteer sees.
 *
 * The preset reason is translated; a reviewer's free-text note CANNOT be, so it
 * is returned as typed and the console warns the reviewer about that before
 * they write it. Silently machine-translating a municipal officer's words into
 * a language they cannot check would be worse than leaving them as-is.
 */
export function rejectionMessage(
  reasonKey: RejectionReasonKey | null,
  note: string | null,
): Bilingual | null {
  const preset = reasonKey ? REJECTION_REASONS[reasonKey] : null;
  if (!preset && !note) return null;
  if (!preset) return { en: note!, th: note! };
  if (!note) return preset;
  return { en: `${preset.en} — ${note}`, th: `${preset.th} — ${note}` };
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * Push and in-app notification content.
 *
 * KEYED with {placeholders}, for the same reason the rejection reasons are:
 * the event is created by a Thai municipal officer and read by whoever the
 * volunteer happens to be. Storing a rendered sentence would freeze the
 * language at write time.
 *
 * Kept SHORT. A push notification is read on a lock screen, often one-handed,
 * often while walking. The title carries the outcome, the body carries the one
 * fact that decides whether to open the app.
 */
export const NOTIFICATIONS = {
  quest_approved: {
    title: t('Quest verified', 'ภารกิจผ่านการตรวจสอบ'),
    body: t(
      '{host} approved {quest}. +{points} Green Points added.',
      '{host} อนุมัติ {quest} แล้ว ได้รับ {points} แต้มสีเขียว',
    ),
  },
  /**
   * Sent to the author when their review is taken down.
   *
   * Not optional. Removing what someone wrote and saying nothing is how a
   * platform earns the reputation of censoring quietly - and under PDPA the
   * subject of a decision about their own content is owed the reason.
   */
  review_hidden: {
    title: t('Your review was taken down', 'รีวิวของคุณถูกนำออก'),
    body: t(
      'Your review of {place} is no longer shown: {reason}',
      'รีวิว {place} ของคุณไม่แสดงแล้ว เนื่องจาก{reason}',
    ),
  },
  /**
   * Sent to the author when a take-down is reversed.
   *
   * The other half of `review_hidden`. Telling someone their words were
   * removed and never telling them they are back is the wrong way round: the
   * bad news travels and the good news does not.
   */
  review_restored: {
    title: t('Your review is back', 'รีวิวของคุณกลับมาแล้ว'),
    body: t(
      'Your review of {place} is published again. Sorry for the interruption.',
      'รีวิว {place} ของคุณกลับมาแสดงแล้ว ขออภัยในความไม่สะดวก',
    ),
  },
  /**
   * Sent to everyone who reported a review, once a moderator has decided.
   *
   * Deferred at first on the theory that outcome notifications help someone
   * probe the system. That reasoning was wrong: the outcome is ALREADY
   * observable - open the place and see whether the review is still there.
   * Withholding it hides nothing and only teaches the reporter that nobody
   * looked, which is how a report button dies.
   */
  report_reviewed: {
    title: t('Thanks — a moderator looked', 'ผู้ดูแลตรวจแล้ว ขอบคุณ'),
    body: t(
      'Your report about a review of {place}: {outcome}',
      'รายงานของคุณเกี่ยวกับรีวิว {place}: {outcome}',
    ),
  },
  /**
 * Sent to the author when their appeal is refused.
   *
   * The accountability has to run both ways. We told them it came down; if
   * they answer and we say no, they are owed that too - silence after an
   * appeal is worse than the original take-down.
   */
  appeal_declined: {
    title: t('Your appeal was reviewed', 'ผลการอุทธรณ์ของคุณ'),
    body: t(
      'A second moderator read your appeal about {place} and the decision stands.',
      'ผู้ดูแลอีกคนอ่านคำอุทธรณ์เรื่อง {place} ของคุณแล้ว และยืนตามคำตัดสินเดิม',
    ),
  },
  /**
   * Sent to the author when their appeal has sat unread past its window.
   *
   * Not an apology for its own sake. Somebody whose words were removed and who
   * then hears nothing for two days concludes the appeal went nowhere, and
   * they are nearly right - so say it before they decide it.
   */
  appeal_still_open: {
    title: t('Your appeal is still waiting', 'คำอุทธรณ์ของคุณยังรออยู่'),
    body: t(
      'Nobody has read your appeal about {place} yet. It is still in the queue and we have not forgotten it.',
      'ยังไม่มีผู้ดูแลอ่านคำอุทธรณ์เรื่อง {place} ของคุณ เรื่องยังอยู่ในคิวและเราไม่ได้ลืม',
    ),
  },
  quest_rejected: {
    title: t('Proof needs another look', 'หลักฐานต้องส่งใหม่'),
    body: t(
      '{host} could not verify {quest}. Tap to see why and resubmit.',
      '{host} ยังตรวจสอบ {quest} ไม่ผ่าน แตะเพื่อดูเหตุผลและส่งใหม่',
    ),
  },
  /**
   * Fired when a submission has sat unreviewed past the promised window. The
   * design promises "verified by host within 24h"; going quiet past that is
   * how a volunteer decides the whole thing is a gimmick.
   */
  quest_review_delayed: {
    title: t('Still being reviewed', 'ยังอยู่ระหว่างตรวจสอบ'),
    body: t(
      '{host} has not finished checking {quest} yet. We will tell you as soon as they do.',
      '{host} ยังตรวจ {quest} ไม่เสร็จ เราจะแจ้งทันทีที่มีผล',
    ),
  },
  /** Sent to an emergency contact who also uses ChivaGo. */
  sos_contact_alerted: {
    title: t('Emergency alert', 'แจ้งเตือนฉุกเฉิน'),
    body: t(
      '{name} triggered SOS near {where}. Tap to see their live location.',
      '{name} กดขอความช่วยเหลือใกล้ {where} แตะเพื่อดูตำแหน่งปัจจุบัน',
    ),
  },
  /**
   * Sent to the person who fired it, the moment a named human picks it up.
   * The single most reassuring thing this system can send.
   */
  sos_acknowledged: {
    title: t('Someone is with you', 'มีเจ้าหน้าที่รับเรื่องแล้ว'),
    body: t(
      '{operator} has your alert and your live location.',
      '{operator} รับเรื่องและเห็นตำแหน่งของคุณแล้ว',
    ),
  },
  /**
   * The most important notification in the product.
   *
   * Sent to the person who fired SOS when nobody has picked it up. If our
   * channel has demonstrably failed, the honest thing is not to keep trying
   * quietly - it is to say so and push them to the service that can actually
   * help. Every word here is chosen to move them toward 1669.
   */
  sos_unacknowledged: {
    title: t('Nobody has answered yet', 'ยังไม่มีใครรับเรื่อง'),
    body: t(
      'No one has picked up your alert after {minutes} min. Call 1669 now if anyone is hurt.',
      'ผ่านไป {minutes} นาที ยังไม่มีใครรับเรื่องของคุณ หากมีผู้บาดเจ็บ โทร 1669 ทันที',
    ),
  },
  /** Second and final nudge. Blunter, because the first one did not land. */
  sos_still_unacknowledged: {
    title: t('Please call 1669', 'กรุณาโทร 1669'),
    body: t(
      'Your alert has been open {minutes} min with no response. ChivaGo cannot send help — call 1669 or 1155.',
      'การแจ้งเตือนของคุณเปิดมา {minutes} นาทีแล้วโดยไม่มีการตอบรับ ChivaGo ส่งความช่วยเหลือไม่ได้ กรุณาโทร 1669 หรือ 1155',
    ),
  },
  /** Sent to app-using contacts when the desk has gone quiet. */
  sos_contact_escalated: {
    title: t('Still no response', 'ยังไม่มีการตอบรับ'),
    body: t(
      "{name}'s alert has been open {minutes} min and nobody has picked it up. Please try to reach them.",
      'การแจ้งเตือนของ {name} เปิดมา {minutes} นาทีแล้วยังไม่มีใครรับเรื่อง กรุณาติดต่อเขา',
    ),
  },
  voucher_expiring: {
    title: t('Voucher expiring soon', 'บัตรกำนัลใกล้หมดอายุ'),
    body: t(
      'Your {merchant} voucher expires in {days} days.',
      'บัตรกำนัล {merchant} จะหมดอายุใน {days} วัน',
    ),
  },
} as const;

export type NotificationKind = keyof typeof NOTIFICATIONS;

/**
 * Notification kinds that ignore quiet hours.
 *
 * The list is short on purpose and every entry has to earn its place: an
 * emergency, and being told a human has picked it up. Everything else - a
 * quest approved, a review taken down, points awarded - can wait until
 * morning, and waking somebody at 03:00 to say a moderator hid a review is
 * how an app gets its notifications turned off for ever.
 */
export const URGENT_KINDS: readonly NotificationKind[] = [
  'sos_contact_alerted',
  'sos_acknowledged',
] as const;

export const isUrgentKind = (kind: NotificationKind): boolean =>
  URGENT_KINDS.includes(kind);

/**
 * Quiet hours, in ISLAND time.
 *
 * The device's clock is the wrong one: a traveller still set to Europe would
 * be woken at 03:00 Samui time by a rule meant to protect them.
 */
export const QUIET_FROM_HOUR = 22;
export const QUIET_UNTIL_HOUR = 7;

export const NOTIFICATION_KINDS = Object.keys(NOTIFICATIONS) as NotificationKind[];

export const isNotificationKind = (v: unknown): v is NotificationKind =>
  typeof v === 'string' && Object.hasOwn(NOTIFICATIONS, v);

/**
 * Render a notification for one reader.
 *
 * Substitution is single-pass, so a parameter that happens to contain
 * "{points}" cannot be re-substituted - quest names come from hosts and are not
 * trusted input.
 */
export function renderNotification(
  kind: NotificationKind,
  params: Record<string, string | number>,
): { title: Bilingual; body: Bilingual } {
  const template = NOTIFICATIONS[kind];

  /**
   * A parameter whose value is itself a KEY is resolved per language.
   *
   * `review_hidden` carries the moderation reason as a key, not a sentence,
   * because the moderator decided in Thai and the author may read only
   * English. Substituting the raw key into both languages would show the
   * traveller the word "personal_data". `report_reviewed` does the same with
   * its outcome.
   *
   * The keys are snake_case identifiers nobody types as a place name, so the
   * risk of translating a value that was meant literally is not real.
   */
  const resolve = (value: string | number, lang: keyof Bilingual): string => {
    if (isModerationReasonKey(value)) return MODERATION_REASONS[value][lang];
    if (isReportOutcome(value)) return REPORT_OUTCOMES[value][lang];
    return String(value);
  };

  const fill = (s: string, lang: keyof Bilingual): string =>
    s.replace(/\{(\w+)\}/g, (whole, name: string) =>
      Object.hasOwn(params, name) ? resolve(params[name]!, lang) : whole,
    );
  return {
    title: { en: fill(template.title.en, 'en'), th: fill(template.title.th, 'th') },
    body: { en: fill(template.body.en, 'en'), th: fill(template.body.th, 'th') },
  };
}
