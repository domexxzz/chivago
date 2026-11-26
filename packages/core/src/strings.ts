/**
 * Every shared UI string in the app, in all supported languages.
 *
 * The app shows ONE at a time, chosen from the phone's locale and switchable on
 * the Account screen - see `apps/mobile/src/i18n/locale.ts`. It used to print
 * English with the Thai captioned underneath, which doubled the length of
 * every screen on a phone. The pairs are still authored together here so a
 * every screen on a phone. The translations are still authored together here
 * so they cannot drift from what they translate.
 *
 * The exception is anything an emergency responder might read off a
 * traveller's phone - the SOS banner, the Safety screen, the emergency numbers.
 * Those intentionally keep English and Thai together whatever the app locale.
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

import type { Localised } from './types.ts';
import { type Lang, localise } from './localise.ts';
// One rule for where Thai and Chinese need a space, written beside the turn
// instructions it was first needed for.
import { gapAfter } from './navigation.ts';

const t = (en: string, th: string, zh: string): Localised => ({ en, th, zh });

export const strings = {
  // -- App shell ----------------------------------------------------------
  tabs: {
    home: t('Home', 'หน้าแรก', '首页'),
    map: t('Map', 'แผนที่', '地图'),
    // This destination now contains the bundled games as well as island quests.
    // Keep the product label consistent in every locale: it is the name of the
    // combined section, not a sentence that needs translating independently.
    quests: t('Game&Quest', 'Game&Quest', 'Game&Quest'),
    wallet: t('Wallet', 'กระเป๋าแต้ม', '钱包'),
    /*
      The game tab took the wallet's place on the bar.

      Six tabs is one more than a 375px bar can carry, and the wallet already
      had a door on Home showing both balances - the same trade Impact made
      when it moved off the bar. What had no door at all was the game layer:
      companions, the seventy-seven, medals and the passport were three taps
      down behind a wallet, which is a strange place to keep the part people
      open the app for.
    */
    game: t('Collect', 'สะสม', '收集'),
    /*
      My Backpack. A DESKTOP-ONLY cell: the rail has room for a sixth
      destination and a 375px bar does not, so on a phone the wallet keeps
      the door on Home it has always had. The label names the wallet screen
      as the traveller sees it, which is a backpack full of what they own.
    */
    backpack: t('My Backpack', 'กระเป๋าของฉัน', '我的背包'),
    impact: t('Impact', 'ผลลัพธ์', '成效'),
    safety: t('Safety', 'ความปลอดภัย', '安全'),
  },

  common: {
    back: t('Back', 'ย้อนกลับ', '返回'),
    close: t('Close', 'ปิด', '关闭'),
    seeAll: t('See all', 'ดูทั้งหมด', '查看全部'),
    skip: t('Skip', 'ข้าม', '跳过'),
    cancel: t('Cancel', 'ยกเลิก', '取消'),
    retry: t('Retry', 'ลองอีกครั้ง', '重试'),
    loading: t('Loading', 'กำลังโหลด', '加载中'),
    offline: t('Offline — showing last known data', 'ออฟไลน์ — แสดงข้อมูลล่าสุด', '离线 — 显示最近一次的数据'),
    greenPoints: t('Green Points', 'แต้มสีเขียว', '绿色积分'),
    tripPoints: t('Trip Points', 'แต้มทริป', '旅行积分'),
    // What each currency MEANS, in one line. Shown next to the two balances
    // because a traveller holding both will otherwise assume they are
    // interchangeable, and the difference is the entire point.
    greenPointsNote: t('Verified by a host', 'ผ่านการตรวจจากผู้จัดภารกิจ', '由主办方验证'),
    tripPointsNote: t('Earned as you explore', 'ได้จากการออกไปเที่ยว', '探索途中赚取'),

    /*
      The two network refusals, and the crash screen.

      These live here rather than inline because they are the only copy in the
      app that can appear on ANY screen, and a traveller who meets them has
      already lost the thread once: meeting them in a language they do not
      read loses it twice. The error CODE each one carries is untouched -
      `TIMEOUT` and `NETWORK` are what the callers switch on.
    */
    networkSlow: t('The network is slow right now.', 'เครือข่ายช้าอยู่ในขณะนี้', '当前网络较慢。'),
    networkOffline: t('You appear to be offline.', 'ดูเหมือนคุณออฟไลน์อยู่', '你似乎处于离线状态。'),
    crashTitle: t('Something went wrong', 'เกิดข้อผิดพลาด', '出了点问题'),
    crashBody: t(
      'The screen ran into a problem, but your progress is safe.',
      'หน้านี้มีปัญหา แต่ความคืบหน้าของคุณยังอยู่ครบ',
      '此页面出现问题，但你的进度已保存。',
    ),
    crashRetry: t('Reload screen', 'โหลดหน้านี้ใหม่', '重新加载页面'),

    /** Said before a photographer's name in the alt text of every place photograph. */
    photographedBy: t('photographed by', 'ถ่ายภาพโดย', '摄影：'),
    /** A venue's own mark, not a photograph of the place - said as what it is. */
    logoOf: t('logo of', 'โลโก้ของ', '标志：'),

    /**
     * The beach illustration on Home and the collection. One alt text, two sites.
     *
     * NO ISLAND. It said "Koh Samui beach" in all three languages, which is
     * what a screen reader read out on Koh Sichang - and a blind reader has no
     * second channel to correct it against, so the alt text was the only thing
     * they were told about the picture, and it was wrong.
     */
    companionsAlt: t(
      'ChivarGo companions on the beach',
      'เพื่อนร่วมทาง ChivarGo บนชายหาด',
      'ChivarGo 伙伴在海滩上',
    ),
  },

  // -- Onboarding ---------------------------------------------------------
  onboarding: {
    step: (n: number) => t(`Step ${n} of 3`, `ขั้นที่ ${n} จาก 3`, `第 ${n} 步，共 3 步`),
    continueCta: t('Continue', 'ต่อไป', '继续'),
    enterCta: t('Enter ChivarGo', 'เข้าสู่ ChivarGo', '进入 ChivarGo'),
    q1: t('What are you here for?', 'คุณมาเพื่ออะไร', '你此行的目的是什么？'),
    q2: t('How active are your days?', 'ระดับกิจกรรมต่อวัน', '你每天的活动量如何？'),
    q3: t('What should we watch for you?', 'ให้เราดูแลเรื่องอะไร', '希望我们为你留意什么？'),
    purposes: {
      wellness: t('Wellness & spa', 'สุขภาพและสปา', '养生与水疗'),
      nature: t('Nature & green space', 'ธรรมชาติและพื้นที่สีเขียว', '自然与绿地'),
      food: t('Healthy local food', 'อาหารท้องถิ่นเพื่อสุขภาพ', '当地健康美食'),
      volunteering: t('Volunteering', 'อาสาสมัคร', '志愿服务'),
      quiet: t('Quiet, away from crowds', 'เลี่ยงที่คนเยอะ', '清静，避开人群'),
    },
    activities: {
      gentle: t('Gentle — under 3 km', 'เบา ไม่เกิน 3 กม.', '轻松 — 3 km 以内'),
      moderate: t('Moderate — 3 to 8 km', 'ปานกลาง 3–8 กม.', '适中 — 3 至 8 km'),
      full: t('Full days — 8 km+', 'เต็มวัน 8 กม. ขึ้นไป', '整日 — 8 km 以上'),
    },
    watch: {
      air: t('Air quality alerts', 'แจ้งเตือนคุณภาพอากาศ', '空气质量提醒'),
      crowd: t('Crowd warnings', 'แจ้งเตือนความหนาแน่น', '人流拥挤提醒'),
      scam: t('Scam & fraud checks', 'ตรวจสอบการหลอกลวง', '诈骗与欺诈核查'),
      location: t('Live location with family', 'แชร์ตำแหน่งกับครอบครัว', '与家人共享实时位置'),
      language: t('Thai↔English help', 'ช่วยเหลือด้านภาษา', '泰英语言协助'),
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
      '我们会保存你的位置和健康偏好，用于为你定制健康评分。你可以随时在个人资料中修改或删除。',
    ),
    consentLink: t('Read the privacy notice', 'อ่านประกาศความเป็นส่วนตัว', '阅读隐私声明'),
  },

  // -- Map ----------------------------------------------------------------
  map: {
    legend: (avg: number) => t(`Healthy Score · ${avg} area average`, `คะแนนสุขภาวะ · เฉลี่ยพื้นที่ ${avg}`, `健康评分 · 区域平均 ${avg}`),
    placesInArea: (n: number) => t(`${n} places in this area`, `${n} สถานที่ในพื้นที่นี้`, `此区域有 ${n} 个地点`),
    questsNearYou: t('Quests near you', 'ภารกิจใกล้คุณ', '你附近的任务'),
    /**
     * The dot. Spoken, not tappable: there is nowhere to go by tapping where
     * you already are, and a map full of buttons that do nothing is worse
     * for a screen reader than a map with one graphic that says something.
     */
    youAreHere: t('You are here', 'คุณอยู่ตรงนี้', '你在这里'),
    /** The route banner over the map, once a destination has been chosen. */
    wayTo: (place: string) => t(`Way to ${place}`, `เส้นทางไป${place}`, `前往${place}的路线`),
    wayWalk: t('On foot', 'เดิน', '步行'),
    wayRide: t('By road', 'ทางถนน', '驾车'),
    /** Road distance and time, e.g. "2.4 km · 30 min". */
    waySummary: (distance: string, duration: string) => t(`${distance} · ${duration}`, `${distance} · ${duration}`, `${distance} · ${duration}`),
    wayLoading: t('Finding the way…', 'กำลังหาเส้นทาง…', '正在规划路线…'),
    /**
     * The router did not answer, so the line on the map is the straight one.
     *
     * Said rather than hidden: a dashed line across a bay is a bearing, and
     * a traveller who reads it as a road walks into the sea. The router is a
     * free community server (`packages/core/src/routing.ts`); it going quiet
     * is a normal afternoon, not an error worth a red box.
     */
    wayStraight: t(
      'No road route right now — the dashed line is the direction, not a road.',
      'ตอนนี้หาเส้นทางถนนไม่ได้ เส้นประคือทิศ ไม่ใช่ถนน',
      '暂时找不到道路路线 — 虚线表示方向，不是道路。',
    ),
    wayClear: t('Clear the route', 'ล้างเส้นทาง', '清除路线'),
    /**
     * Too far for this mode, and the traveller can do something about it.
     *
     * The router plans a walk up to a hundred kilometres and refuses past
     * it (`ROUTE_MAX_M`). Saying only "no route" would hide the one fact
     * that helps: the OTHER mode may well answer.
     */
    wayTooFar: t(
      'Too far for this mode. Try by road.',
      'ไกลเกินไปสำหรับโหมดนี้ ลองเลือกทางถนน',
      '此方式距离过远，请改用驾车。',
    ),
    /**
     * The graph has no way through at all - which on an island is the
     * ordinary answer for a car, because the road stops at the water.
     */
    wayNoPath: t(
      'No road goes all the way there. The last part is by boat.',
      'ไม่มีถนนไปถึงที่นั่นตลอดทาง ช่วงสุดท้ายต้องไปทางเรือ',
      '没有道路可以直达，最后一段需要搭船。',
    ),
    /** A quest's mark on the map: what it is, where, and what it pays. */
    questPin: (points: number) => t(`Quest · +${points} points`, `ภารกิจ · +${points} แต้ม`, `任务 · +${points} 积分`),
    /** The legend's second line: how much of the chart this traveller has lifted the mist from. */
    explored: (n: number, total: number) => t(`Explored · ${n} of ${total}`, `สำรวจแล้ว · ${n} จาก ${total}`, `已探索 · ${n}/${total}`),
    /** The compass rose. Tapping it returns the camera to the chosen area's overview. */
    compass: t('Compass. Return to the area overview', 'เข็มทิศ แตะเพื่อกลับไปมุมมองรวมของพื้นที่', '指南针。点按返回区域全览'),
    layers: {
      Green: t('Green', 'สีเขียว', '绿色'),
      Wellness: t('Wellness', 'สุขภาพ', '养生'),
      Food: t('Food', 'อาหาร', '美食'),
      Safe: t('Safe', 'ปลอดภัย', '安全'),
      Quest: t('Quest', 'ภารกิจ', '任务'),
    },
  },

  /*
    -- Turn-by-turn ---------------------------------------------------------

    Everything the navigator says, except the TURNS themselves: those are
    written in `navigation.ts`, beside the maneuver types they belong to, so
    that adding a maneuver and forgetting its sentence is impossible.

    What is here is the frame around them - the banner's distances, the trip
    panel, and the handful of states a navigator can be in that are not
    "drive on". Those states carry most of the honesty in this feature: a
    router that cannot answer, a phone that cannot see the sky, and a cache
    that has a route but no way to compute a new one are three different
    things, and a traveller who is told the right one can act on it.
  */
  navigate: {
    start: t('Start', 'เริ่มนำทาง', '开始导航'),
    stop: t('Stop', 'หยุด', '结束'),
    stopA11y: t('Stop navigation', 'หยุดนำทาง', '结束导航'),
    overview: t('Overview', 'ภาพรวม', '全览'),
    recentre: t('Re-centre', 'จัดกึ่งกลาง', '回到当前位置'),
    /**
     * The banner's distance to the next turn, e.g. "Turn left in 120 m".
     *
     * `gapAfter` is there because the instruction may END in a Latin road
     * name - a great many of this island's roads are in OpenStreetMap under
     * one - and Thai runs its own words together but puts a space around
     * Latin script. Without it a live route reads "Soi Nalatในอีก 2.5 กม.".
     */
    inDistance: (instruction: string, distance: string) =>
      t(
        `${instruction} in ${distance}`,
        `${instruction}${gapAfter(instruction)}ในอีก ${distance}`,
        `${distance}后${instruction}`,
      ),
    /** Close enough that a distance would be read after the junction. */
    now: (instruction: string) =>
      t(`${instruction} now`, `${instruction}${gapAfter(instruction)}ตอนนี้`, `现在${instruction}`),
    remaining: t('Left', 'เหลือ', '剩余'),
    timeLeft: t('Time', 'เวลา', '时间'),
    arrival: t('Arrival', 'ถึงเวลา', '到达'),
    /** The three lines of the trip panel, read by a screen reader as one. */
    tripSummary: (distance: string, duration: string, at: string) =>
      t(`${distance} left, about ${duration}, arriving around ${at}`,
        `เหลือ ${distance} ประมาณ ${duration} ถึงราว ${at}`,
        `剩余 ${distance}，约 ${duration}，预计 ${at} 到达`),

    waitingForGps: t('Waiting for GPS…', 'กำลังรอสัญญาณ GPS…', '正在等待 GPS…'),
    weakGps: t('GPS signal is weak', 'สัญญาณ GPS อ่อน', 'GPS 信号较弱'),
    gpsLost: t('Lost the GPS signal — the route is still here', 'สัญญาณ GPS หาย เส้นทางยังอยู่', 'GPS 信号中断 — 路线仍在'),
    /**
     * The permission refusal. It names the thing to change rather than
     * scolding: a traveller who said no to a dialog three screens ago does
     * not remember doing it, and "enable location" with no verb is not an
     * instruction anybody can follow.
     */
    noPermission: t(
      'Navigation needs your location. Turn it on for ChivarGo in your phone settings.',
      'การนำทางต้องใช้ตำแหน่งของคุณ เปิดการเข้าถึงตำแหน่งให้ ChivarGo ในการตั้งค่าเครื่อง',
      '导航需要你的位置。请在手机设置中为 ChivarGo 开启定位权限。',
    ),
    /**
     * The same failure when nobody refused anything: the server has opened
     * the fence for a trial and the app keeps out of the GPS. Pointing at the
     * phone's settings then would send somebody to change a switch that is
     * not the reason.
     */
    locationPaused: t(
      'Location is switched off for this trial, so the app cannot follow you. Choose a starting place on Ko Sichang to see the route instead.',
      'ช่วงทดลองนี้ปิดการใช้ตำแหน่งไว้ แอปจึงนำทางตามตำแหน่งจริงไม่ได้ เลือกจุดเริ่มต้นบนเกาะสีชังเพื่อดูเส้นทางแทนได้',
      '试用期间已关闭定位，应用无法跟随你的位置。请选择锡昌岛上的起点来查看路线。',
    ),
    finding: t('Finding the route…', 'กำลังหาเส้นทาง…', '正在规划路线…'),
    rerouting: t('Finding a new route…', 'กำลังหาเส้นทางใหม่…', '正在重新规划…'),
    offRoute: t('Off the route', 'ออกนอกเส้นทาง', '已偏离路线'),
    /**
     * The reroute failed and the OLD route is still on screen. Said plainly,
     * because a stale route drawn silently is the one failure in this
     * feature that can walk somebody into the sea.
     */
    rerouteFailed: t(
      'Could not find a new route. The one shown is the old one.',
      'หาเส้นทางใหม่ไม่ได้ เส้นทางที่เห็นคือเส้นทางเดิม',
      '无法重新规划。当前显示的是原路线。',
    ),
    /** Offline with a saved route: progress still works, a new route does not. */
    offlineRoute: t(
      'Offline — following the saved route. A new route needs a connection.',
      'ออฟไลน์ — กำลังใช้เส้นทางที่บันทึกไว้ การหาเส้นทางใหม่ต้องมีสัญญาณ',
      '离线 — 正在沿已保存的路线。重新规划需要网络。',
    ),
    noRoute: t(
      'No route to this place right now.',
      'ตอนนี้หาเส้นทางไปที่นี่ไม่ได้',
      '暂时找不到前往该地点的路线。',
    ),
    /**
     * The heading when the problem is the permission rather than the road.
     *
     * Its own line because "no route to this place" over an explanation
     * about settings is two different failures in one card, and the
     * traveller has to read the small print to find out which one they met.
     */
    locationOff: t('Location is off', 'ตำแหน่งปิดอยู่', '定位未开启'),
    /**
     * The phone has permission and still cannot say where it is.
     *
     * Its own state because the ACTION is different from every other
     * failure here: nothing in the app or its settings will fix it, and the
     * traveller has to move. Before this existed the screen simply sat on a
     * disabled "Waiting for GPS…" button for as long as it was left there,
     * which is the worst of the three - it looks like the app is working.
     */
    tooFarTitle: t('Too far to walk', 'ไกลเกินกว่าจะเดิน', '步行距离过远'),
    noPathTitle: t('No road all the way', 'ไม่มีถนนตลอดเส้นทาง', '无法全程驾车'),
    noFixTitle: t('No position yet', 'ยังหาตำแหน่งไม่ได้', '尚未定位'),
    noFixBody: t(
      'Your phone has not found a position. Somewhere with a clearer view of the sky usually fixes it.',
      'โทรศัพท์ยังหาตำแหน่งไม่พบ ลองย้ายไปที่ที่เห็นท้องฟ้าโล่งขึ้น แล้วลองใหม่',
      '手机尚未取得定位。换到能看见更开阔天空的位置通常就能解决。',
    ),
    arrived: t('You have arrived', 'ถึงจุดหมายแล้ว', '你已到达'),
    arrivedAt: (place: string) => t(`You have arrived at ${place}`, `ถึง${place}แล้ว`, `你已到达${place}`),
    seePlace: t('Open this place', 'ดูรายละเอียดสถานที่', '查看该地点'),
    done: t('Done', 'เสร็จสิ้น', '完成'),
    /** The dot, for a screen reader. A graphic, not a control. */
    you: t('You, and the way you are facing', 'คุณ และทิศที่คุณหันไป', '你与你的朝向'),
  },

  // -- Mascots ------------------------------------------------------------
  mascots: {
    title: t('Seventy-seven mascots', 'มาสคอต 77 จังหวัด', '七十七府吉祥物'),
    door: t('The field guide: one mascot per province', 'คู่มือมาสคอต หนึ่งตัวต่อหนึ่งจังหวัด', '图鉴：每府一个吉祥物'),
    /** The honest line under the title. A mascot is an emblem, not a wildlife claim. */
    note: t(
      'Each one is drawn from something the province is known by - its seal, a fruit, a festival, a legend. An emblem, not a claim about what lives there.',
      'แต่ละตัววาดจากสิ่งที่จังหวัดนั้นเป็นที่รู้จัก เช่น ตราจังหวัด ผลไม้ ประเพณี หรือตำนาน เป็นสัญลักษณ์ ไม่ใช่คำกล่าวอ้างว่ามีสัตว์ชนิดนั้นอยู่จริง',
      '每一个都取自该府广为人知的事物 — 府徽、水果、节庆或传说。它是象征，并非说明当地真有这种生物。',
    ),
    met: t('Been there', 'ไปมาแล้ว', '去过了'),
    notMet: t('Not yet', 'ยังไม่เคยไป', '还没去过'),
    tapToGreet: t('Tap to say hello', 'แตะเพื่อทักทาย', '点按打招呼'),
    drawnFrom: t('Drawn from', 'วาดจาก', '取材自'),
    metCount: (n: number, total: number) => t(`${n} of ${total} met`, `พบแล้ว ${n} จาก ${total}`, `已遇见 ${n}/${total}`),
    /**
     * The ladder, in the emblem's own words (see `MascotBond` in core).
     *
     * Every line describes the TRAVELLER's record, never the creature's body.
     * "Grown" would say a durian reached adulthood; "vouched for" says a host
     * signed off work somebody did in Nonthaburi, which is the thing that
     * actually happened.
     */
    bond: {
      unopened: t('Not open yet', 'ยังไม่เปิด', '尚未开启'),
      unmet: t('Not met', 'ยังไม่ได้เจอ', '尚未遇见'),
      met: t('Met', 'เจอแล้ว', '已遇见'),
      known: t('Known', 'รู้จักแล้ว', '已熟识'),
      vouched: t('Vouched for', 'มีผู้จัดรับรอง', '已获主办方担保'),
    },
    /**
     * The level, and the two things that made it, so the number can be read
     * back. `เลเวล` because that is the word `wallet.level` already uses; a
     * second Thai word for one English one is the drift docs/… keeps catching.
     */
    level: (n: number) => t(`Level ${n}`, `เลเวล ${n}`, `等级 ${n}`),
    levelFrom: (days: number, verified: number) => t(
      `${days} day${days === 1 ? '' : 's'} here · ${verified} verified`,
      `มา ${days} วัน · งานที่ตรวจแล้ว ${verified}`,
      `在此 ${days} 天 · 已验证 ${verified} 项`,
    ),
    /** Said once, where the level is shown, so the arithmetic is never hidden. */
    levelNote: t(
      'A level is days you came plus three for each quest a host verified. Nothing else counts, and it never goes down.',
      'เลเวล คือจำนวนวันที่มา บวกสามต่อหนึ่งภารกิจที่ผู้จัดตรวจแล้ว ไม่มีอย่างอื่นนับ และไม่มีวันลดลง',
      '等级等于你到访的天数，加上每个经主办方验证的任务三分。不计其他，且永不下降。',
    ),
  },

  // -- Place --------------------------------------------------------------
  place: {
    context: t('Place', 'สถานที่', '地点'),
    // A social check-in is a moment ABOUT a place, not proof that the author
    // is standing there. Reviews keep the verified-visit rule below.
    stories: t('Check-in stories', 'เช็กอินสตอรี่', '打卡动态'),
    storiesIntro: t(
      'Little moments about this place — not ratings. Post from anywhere.',
      'โมเมนต์สั้น ๆ เกี่ยวกับสถานที่นี้ ไม่ใช่รีวิว และโพสต์จากที่ไหนก็ได้',
      '分享与这里有关的小瞬间，不是评价；在任何地方都能发布。',
    ),
    storiesEmpty: t('No check-in stories yet. Start the first one.', 'ยังไม่มีเช็กอินสตอรี่ มาโพสต์เป็นคนแรกกัน', '还没有打卡动态，来发布第一条吧。'),
    storiesClosed: t('Posting is temporarily unavailable.', 'ปิดรับโพสต์ชั่วคราว', '暂时无法发布。'),
    tellStory: t('Post a check-in story', 'โพสต์เช็กอินสตอรี่', '发布打卡动态'),
    storyComposeTitle: t('A moment from this place', 'โมเมนต์จากสถานที่นี้', '这里的一个瞬间'),
    storyCaption: t('Write a short caption…', 'เขียนรายละเอียดสั้น ๆ…', '写一句简短说明…'),
    storyFromAnywhere: t(
      'No live location needed. Your post will be attached to this place.',
      'ไม่ต้องเปิดพิกัด โพสต์นี้จะผูกกับสถานที่นี้',
      '无需实时定位，动态会关联到这个地点。',
    ),
    /*
      One entry for everything a person leaves at a place.

      Two buttons - "Write a review" and "Tell a story here" - asked somebody
      to decide which KIND of thing they were leaving before they had said
      anything. One sheet takes the stars, the words and the clip together,
      and the two halves are still stored apart because a rating aggregates
      and lasts while a clip expires in seven days (docs/54).
    */
    leaveSomething: t('Leave something here', 'ฝากอะไรไว้ที่นี่', '在这里留点什么'),
    leaveAgain: t('Edit what you left', 'แก้สิ่งที่ฝากไว้', '修改你留下的内容'),
    addMedia: t('Add a photo or a clip', 'เพิ่มรูปหรือคลิป', '添加照片或短片'),
    mediaAttached: t('Attached', 'แนบแล้ว', '已附加'),
    mediaRemove: t('Remove', 'เอาออก', '移除'),
    /** The stars need a check-in; the words and the clip do not. */
    starsNeedCheckIn: t(
      'Check in here to leave a rating. A photo or a clip needs no rating.',
      'เช็กอินที่นี่เพื่อให้ดาว ส่วนรูปหรือคลิปไม่ต้องมีดาวก็ฝากได้',
      '在此签到即可评分。照片或短片无需评分也能留下。',
    ),
    leaveNothing: t('Add a rating, a photo or a clip.', 'ใส่ดาว รูป หรือคลิป อย่างน้อยหนึ่งอย่าง', '请至少添加评分、照片或短片其中一项。'),
    /*
      The one sheet's one button. Not "Post review": the same press can send
      a clip with no rating at all, and a label that names only one of the
      two halves is wrong half the time it is read.
    */
    leaveSubmit: t('Post', 'โพสต์', '发布'),
    /*
      The bar at the foot of the map. It NAMES the place it will post to,
      because a map shows five and a bar that just said "add a moment" would
      be asking somebody to guess which one their clip lands on.
    */
    moment: (place: string) => t(`Add your moment at ${place}`, `เพิ่มช่วงเวลาของคุณที่${place}`, `添加你在${place}的瞬间`),
    momentNeedsFix: t(
      'Turn on location to post from the map.',
      'เปิดตำแหน่งเพื่อโพสต์จากแผนที่',
      '开启定位后即可从地图发布。',
    ),
    /*
      While it is going up. An upload over an island 4G connection is long
      enough that a button which only greyed out reads as a button that did
      nothing, and the second tap is somebody's instinct.
    */
    momentSending: t('Sending your moment…', 'กำลังส่งช่วงเวลาของคุณ…', '正在发送你的瞬间…'),
    storyPending: t('Sent. It shows once the team has looked at it', 'ส่งแล้ว จะขึ้นเมื่อทีมตรวจแล้ว', '已发送，团队查看后即会显示'),
    /**
     * The same moment, on a deployment where nobody looks first.
     *
     * Warm, and it still says where the clip went. A person who has just
     * pointed a camera at something wants to know it worked and where to
     * find it, not to be told about the moderation policy - which was the
     * red line that used to sit above the button, and which the owner took
     * out on 9 September. What remains before the camera is the consent
     * notice, because that one is about somebody else.
     */
    storyPosted: t(
      'Thank you. Your clip is up on the board.',
      'ขอบคุณ คลิปของคุณขึ้นกระดานแล้ว',
      '谢谢。你的短片已经上墙了。',
    ),
    /** The notice at the door (docs/46). Going on to record is the consent. */
    storyNotice: t(
      'This stays in the app for 7 days. Share only media you have permission to post.',
      'โพสต์จะอยู่ในแอป 7 วัน ใช้เฉพาะรูปหรือคลิปที่คุณมีสิทธิ์โพสต์',
      '动态会在应用内保留 7 天。请只分享你有权发布的照片或短片。',
    ),
    storyNoFix: t('Your position is needed to tell a story here.', 'ต้องมีตำแหน่งเพื่อเล่าสตอรี่ที่นี่', '需要你的位置才能在这里讲故事。'),
    storyPickerUnavailable: t('The photo picker could not open.', 'เปิดตัวเลือกรูปไม่ได้', '无法打开照片选择器。'),
    storyTooLarge: t('That file is over 25 MB. Ten seconds is plenty.', 'ไฟล์เกิน 25 MB ถ่ายสั้นๆ 10 วินาทีก็พอ', '该文件超过 25 MB。拍十秒就够了。'),
    storyHeic: t(
      'iPhone HEIC photos cannot be converted here yet. Set Settings › Camera › Formats to Most Compatible, or send a JPEG.',
      'รูป HEIC จาก iPhone ยังแปลงที่นี่ไม่ได้ ไปที่ การตั้งค่า › กล้อง › รูปแบบ แล้วเลือก เข้ากันได้มากที่สุด หรือส่งเป็น JPEG แทน',
      'iPhone 的 HEIC 照片暂时无法在此转换。请在 设置 › 相机 › 格式 中选择 兼容性最佳，或改发 JPEG。',
    ),
    storyHevc: t(
      'iPhone HEVC clips cannot be converted here yet. Set Settings › Camera › Formats to Most Compatible, then film it again.',
      'คลิป HEVC จาก iPhone ยังแปลงที่นี่ไม่ได้ ไปที่ การตั้งค่า › กล้อง › รูปแบบ แล้วเลือก เข้ากันได้มากที่สุด แล้วถ่ายใหม่',
      'iPhone 的 HEVC 视频暂时无法在此转换。请在 设置 › 相机 › 格式 中选择 兼容性最佳，然后重新拍摄。',
    ),
    storyWebOnly: t('Video plays on the web for now.', 'วิดีโอเล่นบนเว็บก่อน', '视频目前只在网页端播放。'),
    storyViewerHint: t('tap to continue', 'แตะเพื่อดูต่อ', '点按继续'),
    storyPrev: t('Previous story', 'สตอรี่ก่อนหน้า', '上一条故事'),
    storyNext: t('Next story', 'สตอรี่ถัดไป', '下一条故事'),
    healthyScore: t('Healthy Score', 'คะแนนสุขภาวะของพื้นที่', '健康评分'),
    // Said where a place has no picture: the tinted habitat panel on Home and
    // the hero on the place screen. One pair, because the two sites had
    // drifted apart - 'ยังไม่มีรูป' against 'ยังไม่มีภาพถ่าย'.
    noPhotoYet: t('no photograph yet', 'ยังไม่มีรูป', '暂无照片'),
    /** Spoken at the end of a companion tile, on the game screen and in the wallet. */
    visitItsHome: t('Visit its home.', 'ไปที่บ้านของมัน', '去它的家乡看看。'),
    addToRoute: t("Add to today's route", 'เพิ่มลงเส้นทาง', '加入今天的路线'),
    safePath: t('Safe path from here', 'เส้นทางปลอดภัยจากที่นี่', '从这里出发的安全路线'),
    // The place's own booking page. ChivarGo takes no booking and no money.
    book: t('Book on their site', 'จองที่เว็บของสถานที่', '在对方官网预订'),
    /**
     * Getting there (docs/52). The heading is a question because that is the
     * one the traveller is actually asking, and the answer under it is a
     * distance rather than a route: this app hands the roads to a map that
     * has them.
     */
    getThere: t('How far is it?', 'อยู่ไกลแค่ไหน', '有多远？'),
    away: (distance: string, direction: string) =>
      t(`${distance} ${direction} of you`, `ห่างไปทาง${direction} ${distance}`, `在你${direction}方向 ${distance}`),
    onFoot: (minutes: number) =>
      t(`About ${minutes} min on foot`, `เดินราว ${minutes} นาที`, `步行约 ${minutes} 分钟`),
    /** Inside the 250 m fence. The check-in button above it will work. */
    arrived: t("You're here", 'คุณอยู่ที่นี่แล้ว', '你已到达'),
    /**
     * The same fact on a 172 px card in a scrolling row, where the sentence
     * would wrap to three lines and the row would stop being scannable.
     */
    arrivedShort: t('Here', 'ที่นี่', '已到达'),
    /**
     * Said above the row whenever a position has reordered it.
     *
     * Every other number on this screen names where it came from - "Updated
     * daily", "Estimated", "Counted from geofenced check-ins". An order that
     * changes when somebody walks two streets, with nothing saying why, is
     * the same claim made silently.
     */
    nearestFirst: t('Nearest first', 'เรียงจากใกล้ที่สุด', '由近到远'),
    /**
     * A pinned place sits ahead of the order, so the header stops claiming the
     * row is simply nearest-first and says what it actually is (featured.ts).
     */
    featuredThenNearest: t('Featured first, then nearest', 'แนะนำก่อน จากนั้นเรียงจากใกล้ที่สุด', '推荐优先，其余由近到远'),
    featuredFirstOnly: t('Featured first', 'แนะนำก่อน', '推荐优先'),
    /** On the pinned card itself, so a reader knows why it is at the front. */
    featuredBadge: t('Featured', 'แนะนำ', '推荐'),
    /** Draws the route on the app's own map. The first choice, before leaving. */
    showWay: t('Show the way on the map', 'ดูเส้นทางบนแผนที่', '在地图上显示路线'),
    openInMaps: t('Open in Google Maps', 'เปิดใน Google Maps', '在 Google Maps 中打开'),
    /**
     * Shown instead of the distance when the app has no position - permission
     * never given, or a fix that failed. It does not ask for the permission:
     * the check-in button is where that conversation belongs, and a screen
     * that nags for location to show a nice-to-have teaches people to say no
     * to the one request that matters.
     */
    distanceUnknown: t(
      'Distance needs your location. The map below works either way.',
      'ต้องมีตำแหน่งของคุณจึงบอกระยะทางได้ ปุ่มด้านล่างใช้ได้อยู่แล้ว',
      '显示距离需要你的位置。下方地图不受影响。',
    ),
    mapsLeavesApp: t('Opens Google Maps', 'จะเปิดแอป Google Maps', '将打开 Google Maps'),
    addedToast: t('Added to Day 2', 'เพิ่มแล้ว', '已添加'),
    /** Opens the score breakdown sheet. A score nobody can interrogate is a trust risk. */
    howCalculated: t('How is this calculated?', 'คำนวณอย่างไร', '这是如何计算的？'),
    /** The live count beside the crowd estimate. */
    hereNow: t('Here now', 'ตอนนี้', '此刻在场'),
    /** Drawn across the top while the server is not checking positions. */
    unfenced: t(
      'Location checks are OFF on this server. Anyone can check in from anywhere.',
      'เซิร์ฟเวอร์นี้ปิดการตรวจตำแหน่ง ใครก็เช็กอินจากที่ไหนก็ได้',
      '此服务器已关闭位置校验。任何人都可以在任何地方签到。',
    ),
    /** The thirty-day air chart. */
    airHistory: t('Air, last 30 days', 'อากาศ 30 วันที่ผ่านมา', '近 30 天空气'),
    airSince: (date: string) => t(`Recorded here since ${date}.`, `บันทึกที่นี่ตั้งแต่ ${date}`, `自 ${date} 起在此记录。`),
    airNoHistory: t('No readings recorded here yet. The chart fills in as the server records the air, day by day.', 'ยังไม่มีค่าที่บันทึกไว้ที่นี่ กราฟจะค่อย ๆ เติมเมื่อเซิร์ฟเวอร์บันทึกค่าอากาศไปทีละวัน', '这里还没有记录到数据。服务器每天记录空气状况，图表会逐日补全。'),
    airFewDays: (n: number) => t(`${n} day${n === 1 ? '' : 's'} recorded so far.`, `บันทึกแล้ว ${n} วัน`, `目前已记录 ${n} 天。`),
    /** Stalls that take orders ahead, through สั่งก่อน (docs/65). */
    stallsTitle: t('Order ahead', 'สั่งล่วงหน้า', '提前点单'),
    /** The same card on Home, where it has to say which food court. */
    stallsTitleAt: (place: string) => t(`Order food ahead · ${place}`, `สั่งอาหารล่วงหน้า · ${place}`, `提前点餐 · ${place}`),
    stallsIntro: t(
      'Order now, pay by PromptPay and come at the time it says. The wait is each stall\'s own, read from its kitchen queue.',
      'สั่งตอนนี้ จ่ายพร้อมเพย์ แล้วมารับตามเวลาที่บอก เวลารอเป็นของแต่ละร้าน อ่านจากคิวในครัวของร้านเอง',
      '现在下单，用 PromptPay 付款，按提示时间来取。等待时间由各摊位根据自己的后厨排队情况给出。',
    ),
    stallWait: (min: number) => t(`Ready in about ${min} min`, `รอประมาณ ${min} นาที`, `约 ${min} 分钟后可取`),
    /** When a closed stall opens: later today, tomorrow, or a day further out. */
    stallClosedUntil: (clock: string) => t(`Closed · opens ${clock}`, `ปิดอยู่ · เปิด ${clock}`, `休息中 · ${clock} 开门`),
    stallClosedTomorrow: (clock: string) => t(`Closed · opens tomorrow ${clock}`, `ปิดอยู่ · เปิดพรุ่งนี้ ${clock}`, `休息中 · 明天 ${clock} 开门`),
    stallClosedOn: (day: string, clock: string) => t(`Closed · opens ${day}, ${clock}`, `ปิดอยู่ · เปิด ${day} ${clock}`, `休息中 · ${day} ${clock} 开门`),
    stallClosed: t('Closed', 'ปิดอยู่', '休息中'),
    stallPaused: t('Not taking orders ahead right now', 'ไม่รับสั่งล่วงหน้าตอนนี้', '目前不接受提前点单'),
    stallUnpaid: t('Payment is not set up yet', 'ร้านยังไม่พร้อมรับชำระเงิน', '尚未开通收款'),
    /** Open and taking orders, but the kitchen is full or closes before an order could be ready. */
    stallFull: t('No pick-up time free right now', 'ตอนนี้ไม่มีเวลารับที่ว่าง', '目前没有可选的取餐时间'),
    stallOrder: t('Order ahead', 'สั่งล่วงหน้า', '提前点单'),
    stallMenu: t('See the menu', 'ดูเมนู', '查看菜单'),
    stallExample: t('Example · not a stall in this food court', 'ตัวอย่าง · ไม่ใช่ร้านในโรงอาหารนี้', '示例 · 并非本美食广场的摊位'),
    stallsStale: (clock: string) => t(`Could not reach the stalls just now · as of ${clock}`, `ติดต่อร้านไม่ได้ตอนนี้ · ข้อมูลเมื่อ ${clock}`, `暂时联系不上摊位 · 数据截至 ${clock}`),
    /** A live answer left on screen for a while: dated, with no wait claimed from it. */
    stallsAsOf: (clock: string) => t(`Waits as of ${clock}`, `เวลารอเมื่อ ${clock}`, `等待时间截至 ${clock}`),
    stallsAgain: t('Check again', 'เช็กอีกครั้ง', '重新查看'),
    stallsDown: t('Could not reach the stalls just now. Try again in a minute.', 'ติดต่อร้านไม่ได้ตอนนี้ ลองใหม่อีกครั้งในอีกสักครู่', '暂时联系不上摊位。请过一会儿再试。'),
    stallsNone: t('No stall here is taking orders ahead right now.', 'ตอนนี้ยังไม่มีร้านที่นี่รับสั่งล่วงหน้า', '目前这里没有摊位接受提前点单。'),
    /** The static demo: the stalls are named, their status is not read. */
    stallsNoStatus: t('Live status is not read here. Each stall\'s own page has it.', 'ที่นี่ไม่ได้อ่านสถานะสดของร้าน ดูได้ในหน้าของแต่ละร้าน', '此处不读取摊位的实时状态。详见各摊位自己的页面。'),
    // -- The queue, which is not the wait (canteen-queue.ts) --------------
    queueTitle: t('The queue right now', 'คิวตอนนี้', '当前排队情况'),
    queueAsk: t('Standing there? Tell people what you see.', 'อยู่ตรงนั้นอยู่ไหม บอกคนอื่นหน่อย', '你在现场吗？告诉大家你看到的情况。'),
    queueReport: (level: string) => t(`Report: ${level}`, `แจ้งว่า${level}`, `上报：${level}`),
    queueDown: t('Could not read the queue reports.', 'อ่านรายงานคิวไม่ได้', '无法读取排队报告。'),
    queueFailed: t('That report did not go through. Try again.', 'แจ้งไม่สำเร็จ ลองอีกครั้ง', '上报未成功，请再试一次。'),
    stallsVia: t('Orders and payment go through สั่งก่อน, straight to the stall.', 'สั่งและจ่ายผ่านสั่งก่อน เงินเข้าร้านโดยตรง', '点单与付款通过 สั่งก่อน 完成，款项直接进摊位。'),
    /** Courts free now at a place you book before you go (courts.ts). */
    courtsTitle: t('Courts right now', 'สนามตอนนี้', '场地实况'),
    courtsFree: (free: number, total: number) => t(
      `${free} of ${total} court${total === 1 ? '' : 's'} free`,
      `ว่าง ${free} จาก ${total} สนาม`,
      `${total} 片场地中有 ${free} 片空闲`,
    ),
    courtsFull: (total: number) => t(
      `All ${total} court${total === 1 ? '' : 's'} are taken right now`,
      `ตอนนี้ไม่ว่าง ทั้ง ${total} สนาม`,
      `目前 ${total} 片场地全部占用`,
    ),
    /** Shut: the count says nothing about playing now, so the hours are what matters. */
    courtsClosed: t('Closed right now', 'ปิดอยู่ตอนนี้', '目前已关闭'),
    courtsClosedUntil: (clock: string) => t(`Closed · opens ${clock}`, `ปิดอยู่ · เปิด ${clock}`, `休息中 · ${clock} 开门`),
    courtsClosedTomorrow: (clock: string) => t(`Closed · opens tomorrow ${clock}`, `ปิดอยู่ · เปิดพรุ่งนี้ ${clock}`, `休息中 · 明天 ${clock} 开门`),
    courtsClosedOn: (day: string, clock: string) => t(`Closed · opens ${day}, ${clock}`, `ปิดอยู่ · เปิด ${day} ${clock}`, `休息中 · ${day} ${clock} 开门`),
    /** When the count was read, said whenever it is not simply fresh. */
    courtsAsOf: (clock: string) => t(`Counted at ${clock}`, `นับเมื่อ ${clock}`, `统计于 ${clock}`),
    courtsStale: (clock: string) => t(
      `Could not reach the booking system just now · counted at ${clock}`,
      `ติดต่อระบบจองไม่ได้ตอนนี้ · นับเมื่อ ${clock}`,
      `暂时联系不上预订系统 · 统计于 ${clock}`,
    ),
    courtsAgain: t('Check again', 'เช็กอีกครั้ง', '重新查看'),
    /** Nothing known: said plainly, never as nought courts free. */
    courtsDown: t(
      'Could not reach the booking system just now, so how many courts are free is not known. The venue\'s own page has it.',
      'ติดต่อระบบจองไม่ได้ตอนนี้ จึงยังไม่รู้ว่าว่างกี่สนาม ดูได้ในหน้าจองของสนามเอง',
      '暂时联系不上预订系统，因此不清楚有多少片场地空闲。详见场馆自己的页面。',
    ),
    /** The static demo: the venue is named, the count is not read. */
    courtsNoStatus: t(
      'How many courts are free is not read here. The venue\'s own booking page has it.',
      'ที่นี่ไม่ได้อ่านจำนวนสนามว่าง ดูได้ในหน้าจองของสนามเอง',
      '此处不读取空闲场地数量。详见场馆自己的预订页面。',
    ),
    /** The sea and sky above an area, live from Open-Meteo (weather.ts). */
    weatherTitle: t('Sea and sky', 'ทะเลและท้องฟ้า', '海况与天空'),
    weatherWaves: t('Waves', 'คลื่นลม', '浪况'),
    weatherTemp: t('Temp', 'อุณหภูมิ', '气温'),
    weatherWeather: t('Weather', 'อากาศ', '天气'),
    weatherRain: t('Rain', 'ปริมาณฝน', '降雨'),
    weatherWaveHeight: (m: string) => t(`Waves ${m} m`, `คลื่นสูง ${m} ม.`, `浪高 ${m} m`),
    weatherWavePeriod: (s: string) => t(`every ${s} s`, `ทุก ${s} วิ`, `周期 ${s} s`),
    weatherWind: (kn: string) => t(`Wind ${kn} kn`, `ลม ${kn} นอต`, `风速 ${kn} kn`),
    weatherTempNow: (c: string) => t(`${c}°C`, `${c}°C`, `${c} 度`),
    weatherRainNow: (mm: string) => t(`${mm} mm`, `${mm} มม.`, `${mm} 毫米`),
    weatherNoRain: t('No rain right now', 'ตอนนี้ไม่มีฝน', '目前无降雨'),
    /** Read at a moment, said whenever it is not simply fresh. */
    weatherAsOf: (clock: string) => t(`Read at ${clock}`, `อ่านเมื่อ ${clock}`, `读取于 ${clock}`),
    weatherStale: (clock: string) => t(
      `Could not reach the forecast just now · read at ${clock}`,
      `ติดต่อพยากรณ์ไม่ได้ตอนนี้ · ข้อมูลเมื่อ ${clock}`,
      `暂时联系不上预报服务 · 读取于 ${clock}`,
    ),
    /** The forecast answered, but TMD's own forecast for the hour disagrees with it. */
    weatherUnsure: t(
      'The Thai Meteorological Department forecasts differently for this hour · treat as approximate',
      'กรมอุตุนิยมวิทยาพยากรณ์ชั่วโมงนี้ต่างออกไป · ใช้เป็นค่าโดยประมาณ',
      '泰国气象局对这一小时的预报不同 · 仅供参考',
    ),
    weatherAgain: t('Check again', 'เช็กอีกครั้ง', '重新查看'),
    weatherDown: t(
      'Could not reach the forecast just now, so the sea and sky are not known.',
      'ติดต่อพยากรณ์ไม่ได้ตอนนี้ จึงยังไม่รู้สภาพทะเลและท้องฟ้า',
      '暂时联系不上预报服务，因此不清楚海况与天空情况。',
    ),
    weatherNoStatus: t(
      'The sea and sky are not read here.',
      'ที่นี่ไม่ได้อ่านสภาพทะเลและท้องฟ้า',
      '此处不读取海况与天空情况。',
    ),
    weatherVia: t('Read from Open-Meteo. Not a forecast for navigation.', 'อ่านจาก Open-Meteo ไม่ใช่พยากรณ์สำหรับการเดินเรือ', '数据来自 Open-Meteo。不作航海预报使用。'),
    courtsVia: t(
      'Counted by the venue\'s own booking system. Booking and payment happen there, not in ChivarGo.',
      'นับโดยระบบจองของสนามเอง การจองและชำระเงินเกิดขึ้นที่นั่น ไม่ใช่ใน ChivarGo',
      '由场馆自己的预订系统统计。预订和付款在那边完成，不在 ChivarGo 内。',
    ),
    provenance: {
      live: t('Live', 'ข้อมูลสด', '实时'),
      daily: t('Updated daily', 'อัปเดตรายวัน', '每日更新'),
      estimated: t('Estimated', 'ประมาณการ', '估算'),
      stale: t('Last known', 'ข้อมูลล่าสุด', '最近已知'),
    },
  },

  /**
   * The board on Home: where the separate accounts in a room meet.
   * See packages/core/src/board.ts for what is and is not on it.
   */
  /**
   * Monsters (docs/55). The island's problems wearing a face, and every word
   * here has to keep saying that they are made of readings and not of
   * creatures - see packages/core/src/monsters.ts.
   */
  monsters: {
    title: t('What is wrong here', 'ปัญหาที่นี่', '这里的问题'),
    subtitle: t(
      'Based on available signals, with their sources shown. Local work can push a flagged issue back.',
      'อิงข้อมูลที่มีและแสดงแหล่งที่มา การลงมือทำในพื้นที่ช่วยลดปัญหาที่ถูกแจ้งได้',
      '依据现有信号，并标明来源。当地的行动可以把被标记的问题压回去。',
    ),
    /** The best possible outcome, and it must read as good news, not as empty. */
    none: t(
      'No issue is flagged here today. Some conditions may be modelled or unavailable.',
      'วันนี้ยังไม่มีปัญหาที่ถูกแจ้ง บางข้อมูลอาจมาจากแบบจำลองหรือยังไม่มีข้อมูล',
      '今天这里没有被标记的问题。部分情况可能来自模型或暂无数据。',
    ),
    loading: t('Checking this area…', 'กำลังตรวจข้อมูลพื้นที่นี้…', '正在核查本区域…'),
    /** Progress, said as work rather than as damage. Nobody is fighting. */
    pushedBack: (done: number, needed: number) => t(
      `${done} of ${needed} pushed back`,
      `ดันถอยแล้ว ${done} จาก ${needed}`,
      `已压回 ${done}/${needed}`,
    ),
    resting: t('Resting. It comes back if the reading does.', 'พักอยู่ กลับมาถ้าค่ากลับมา', '休眠中。若读数回升，它会再出现。'),
    /** The line that stops the game from lying about the world. */
    doesNotFixIt: t(
      'Pushing one back does not change the reading. The work is the point.',
      'การดันมันถอยไม่ได้ทำให้ค่าที่วัดได้ดีขึ้น งานที่ทำต่างหากคือเรื่องจริง',
      '把它压回去并不会改变读数。真正算数的是做过的事。',
    ),
  },

  board: {
    title: t('The board', 'กระดาน', '留言板'),
    subtitle: t(
      'What people here have posted. Tap one to open the place and add yours.',
      'สิ่งที่คนแถวนี้โพสต์ไว้ แตะเพื่อเปิดสถานที่แล้วเพิ่มของคุณ',
      '这里的人留下的内容。点按一条即可打开该地点并添加你的。',
    ),
    loading: t('Loading the board…', 'กำลังโหลดกระดาน…', '正在加载留言板…'),
    /** Said plainly. A quiet board is a fact, not something to dress up. */
    empty: t(
      'Nothing on the board yet. Check in somewhere, then leave a review or a clip.',
      'ยังไม่มีอะไรบนกระดาน เช็กอินสักที่แล้วเขียนรีวิวหรืออัปคลิปได้เลย',
      '留言板上还没有内容。先去某处签到，再留下评价或短片。',
    ),
    aClip: t('A clip', 'คลิป', '一段短片'),
    aPhoto: t('A photo', 'รูป', '一张照片'),
  },

  // -- Quests -------------------------------------------------------------
  quests: {
    title: t('Missions', 'ภารกิจ', '任务'),
    subtitle: t('Complete quests for the environment, earn points', 'ทำภารกิจเพื่อสิ่งแวดล้อม แลกเป็นแต้ม', '完成环保任务，赚取积分'),
    filters: {
      today: t('Today', 'วันนี้', '今天'),
      weekend: t('Weekend', 'สุดสัปดาห์', '周末'),
      all: t('All', 'ทั้งหมด', '全部'),
    },
    by: (host: string) => t(`By ${host}`, `โดย ${host}`, `由 ${host} 发布`),
    footer: t(
      'Quests are posted by municipalities, NGOs, hotels and community groups. Proof is reviewed by the host before points are released.',
      'ภารกิจจัดโดยเทศบาล องค์กรไม่แสวงหากำไร โรงแรม และกลุ่มชุมชน หลักฐานจะถูกตรวจสอบโดยผู้จัดก่อนปล่อยแต้ม',
      '任务由市政当局、非营利组织、酒店和社区团体发布。证据须经主办方审核后才会发放积分。',
    ),
    empty: t('No quests match this filter', 'ไม่มีภารกิจที่ตรงกับตัวกรองนี้', '没有符合此筛选条件的任务'),
  },

  // -- Quest detail -------------------------------------------------------
  quest: {
    context: (code: string) => t(`Quest · ${code}`, `ภารกิจ · ${code}`, `任务 · ${code}`),
    reward: t('Reward', 'รางวัล', '奖励'),
    duration: t('Duration', 'ระยะเวลา', '时长'),
    host: t('Host', 'ผู้ให้ภารกิจ', '主办方'),
    progress: t('Progress', 'ความคืบหน้า', '进度'),
    steps: {
      joined: t('Joined', 'เข้าร่วมภารกิจ', '已加入'),
      arrived: t('Arrived at site', 'ถึงพื้นที่แล้ว', '已到达现场'),
      proof_submitted: t('Proof submitted', 'ส่งหลักฐานแล้ว', '已提交证据'),
      host_verification: t('Host verification', 'ผู้ให้ภารกิจตรวจสอบ', '主办方验证'),
      complete: t('Complete · points released', 'สำเร็จ ได้รับแต้ม', '已完成 · 积分已发放'),
    },
    ctaJoin: t('Join this quest', 'เข้าร่วมภารกิจ', '加入这个任务'),
    ctaArrive: t("I'm at the site", 'ฉันถึงพื้นที่แล้ว', '我已到达现场'),
    ctaSend: t('Send for verification', 'ส่งตรวจสอบ', '提交验证'),
    ctaWallet: t('Open wallet', 'เปิดกระเป๋าแต้ม', '打开钱包'),
    submitProof: t('Submit proof', 'ส่งหลักฐาน', '提交证据'),
    proofHelper: t(
      'Geo-tagged photos + weight of waste collected. Verified by host within 24h.',
      'ภาพถ่ายพร้อมพิกัด และน้ำหนักขยะที่เก็บได้ ตรวจสอบโดยผู้จัดภายใน 24 ชม.',
      '带地理标记的照片 + 收集到的垃圾重量。主办方会在 24 小时内验证。',
    ),
    /*
      Shown where the photos are about to be sent, whenever the server may
      pass them to the AI host assistant (docs/64). "May", because the app
      shows it when it cannot tell - see server-config.ts. The three facts
      are the ones a traveller would want before tapping send: a machine
      looks, it is not told who they are, and a person still decides.
      DRAFT: to be read by the lawyer with the rest of the notice.
    */
    aiAssistNotice: t(
      'An AI may look at your photos to help the host check them. It is not told who you are, and the host decides.',
      'AI อาจช่วยดูรูปของคุณเพื่อให้ผู้จัดตรวจได้เร็วขึ้น โดย AI ไม่รู้ว่าคุณเป็นใคร และผู้ตัดสินยังเป็นผู้จัด',
      'AI 可能会查看你的照片，帮助主办方核验。它不会知道你是谁，最终由主办方决定。',
    ),
    weightLabel: t('Waste collected (kg)', 'น้ำหนักขยะที่เก็บได้ (กก.)', '收集到的垃圾（kg）'),
    // The Thai said only 'checking the proof' and dropped WHO is checking it.
    // A traveller waiting on a decision has one question, and it is which host.
    verifying: (host: string) => t(`Verifying with ${host}…`, `${host} กำลังตรวจสอบหลักฐาน`, `${host} 正在验证…`),
    /**
     * Verification can legitimately take up to 24h, so this screen must be
     * leavable and the result must arrive as a notification.
     */
    verifyingLeavable: t(
      'You can leave this screen — we will notify you when the host responds.',
      'ออกจากหน้านี้ได้ เราจะแจ้งเตือนเมื่อผู้จัดตรวจสอบเสร็จ',
      '你可以离开此页面 — 主办方回复后我们会通知你。',
    ),
    // A host vouched for the proof. ยืนยัน, not ตรวจสอบ: the same word the
    // concierge, the reviews notice and the merchant registry already use
    // wherever a person stands behind something. ตรวจสอบ is inspection, and
    // it belongs to the safety labels, which is where it now stays.
    verified: t('Verified', 'ยืนยันแล้ว', '已验证'),
    /**
     * The weight is the one on the proof the host approved, or nothing. A
     * number the app does not hold is not printed: this panel used to say
     * 4.2 kg to everyone, next to a statement that said 3.2.
     */
    verifiedDetail: (kg: number | null) =>
      kg === null
        ? t(
          'Green Points added · logged to the ChivarGo impact ledger',
          'เพิ่มแต้มสีเขียวแล้ว · บันทึกลงบัญชีผลลัพธ์ ChivarGo',
          '绿色积分已添加 · 已记入 ChivarGo 成效台账',
        )
        : t(
          `Green Points added · ${kg} kg waste logged to the ChivarGo impact ledger`,
          `เพิ่มแต้มสีเขียวแล้ว · บันทึกขยะ ${kg} กก. ลงบัญชีผลลัพธ์ ChivarGo`,
          `绿色积分已添加 · ${kg} kg 垃圾已记入 ChivarGo 成效台账`,
        ),
    /**
     * The host filed this verification in a statement anyone can check - the
     * guest-facing half of the evidence layer (docs/31). The traveller is told
     * their work became a record somebody handed on, and can open it.
     */
    onRecord: t('On record', 'อยู่ในบันทึกแล้ว', '已存档'),
    onRecordDetail: (host: string, id: string, from: string, to: string) =>
      t(
        `${host} filed this in statement ${id}, covering ${from} to ${to}.`,
        `${host} บันทึกงานนี้ไว้ในรายการกิจกรรม ${id} ช่วง ${from} ถึง ${to}`,
        `${host} 已将此记入报表 ${id}，涵盖 ${from} 至 ${to}。`,
      ),
    onRecordCheck: t('Anyone can check this statement', 'ใครก็ตรวจสอบรายการนี้ได้', '任何人都可以核查这份报表'),
    /** The design has no rejection state. Real host review rejects submissions. */
    rejected: t('Proof not accepted', 'หลักฐานไม่ผ่าน', '证据未通过'),
    resubmit: t('Submit new proof', 'ส่งหลักฐานใหม่', '重新提交证据'),
    outsideGeofence: t(
      'You need to be at the site to check in',
      'คุณต้องอยู่ในพื้นที่ภารกิจเพื่อเช็กอิน',
      '你需要在任务现场才能签到',
    ),
    addPhoto: t('Add a photo', 'เพิ่มรูปถ่าย', '添加照片'),
    photoUnavailable: t(
      'Could not open the camera or photos. Try the other one',
      'เปิดกล้องหรือคลังรูปไม่ได้ ลองอีกทางหนึ่ง',
      '无法打开相机或相册，试试另一个',
    ),
    /** What the quest screen says above the proof box while an upload waits. */
    outboxPending: (n: number) => t(`${n} proof${n === 1 ? '' : 's'} waiting to upload. It will go when you have signal.`, `มีหลักฐาน ${n} ชุดรอส่ง จะส่งเองเมื่อมีสัญญาณ`, `有 ${n} 份证据等待上传。有信号时会自动发送。`),
    outboxSent: t('A saved proof has been uploaded.', 'ส่งหลักฐานที่บันทึกไว้แล้ว', '已上传一份保存的证据。'),
    /** After a proof goes in with party members in the fence. */
    partyRides: (names: string[]) => t(
      `Sent. ${names.join(', ')} ${names.length === 1 ? 'was' : 'were'} here too and will be verified with you.`,
      `ส่งแล้ว ${names.join(', ')} อยู่ที่นี่ด้วยและจะได้รับการตรวจพร้อมคุณ`,
      `已发送。${names.join(', ')} 当时也在场，将与你一同接受验证。`,
    ),
    outboxDropped: t('A saved proof was refused by the server and has been removed. Open the quest to see why.', 'หลักฐานที่บันทึกไว้ถูกเซิร์ฟเวอร์ปฏิเสธและถูกลบออก เปิดภารกิจเพื่อดูเหตุผล', '一份保存的证据被服务器拒收并已移除。打开任务查看原因。'),
    queuedOffline: t(
      'Saved — will upload when you have signal',
      'บันทึกแล้ว จะอัปโหลดเมื่อมีสัญญาณ',
      '已保存 — 有信号时会上传',
    ),
  },

  // -- Wallet -------------------------------------------------------------
  wallet: {
    balance: t('Balance', 'ยอดแต้ม', '余额'),
    ranks: t('Ranks', 'ระดับนักเดินทาง', '等阶'),
    level: (n: number) => t(`Level ${n}`, `เลเวล ${n}`, `等级 ${n}`),
    // "2,480 / 3,900 EXP" - the deck shows the raw figures, and they are more
    // legible than a percentage when the span changes every level.
    levelBar: (into: number, span: number) =>
      t(
        `${into.toLocaleString('en-US')} / ${span.toLocaleString('en-US')} EXP`,
        `${into.toLocaleString('en-US')} / ${span.toLocaleString('en-US')} EXP`,
        `${into.toLocaleString('en-US')} / ${span.toLocaleString('en-US')} 经验值`,
      ),
    toNextRank: (levels: number, rank: string) =>
      t(
        `${levels} ${levels === 1 ? 'level' : 'levels'} to ${rank}`,
        `อีก ${levels} เลเวลถึง ${rank}`,
        `还差 ${levels} 级到${rank}`,
      ),
    topRank: t('Top rank reached', 'ถึงระดับสูงสุดแล้ว', '已达最高等阶'),
    // EXP is lifetime and is never spent. Saying so where the number lives
    // stops the obvious wrong assumption that redeeming will cost a level.
    expNote: t('EXP is never spent', 'EXP ไม่ถูกหักเมื่อใช้แต้ม', '经验值不会被消耗'),
    ledger: t('Ledger', 'ประวัติแต้ม', '积分明细'),
    spendPoints: t('Spend points', 'ใช้แต้ม', '使用积分'),
    /** The two purses, named. Shown beside a figure, so short. */
    green: t('Green', 'เขียว', '绿色'), // thai: intentional - a unit beside a number, not the layer's name
    trip: t('Trip', 'ทริป', '旅行'),

    emptyLedger: t('No activity yet — join a quest to start earning', 'ยังไม่มีรายการ เริ่มจากเข้าร่วมภารกิจ', '还没有记录 — 加入一个任务开始赚取'),
  },

  // -- Profile ------------------------------------------------------------
  // One screen for the traveller's own record, reached from the top of
  // Home. Nothing on it is new data; these are the words that sit it
  // together.
  profile: {
    context: t('Profile', 'โปรไฟล์', '个人资料'),
    /** The account's display name when the phone never gave one. */
    traveller: t('Traveller', 'นักเดินทาง', '旅行者'),
    account: t('Account and devices', 'บัญชีและอุปกรณ์', '账户与设备'),
    experience: t('Your experience', 'ประสบการณ์ของคุณ', '你的经验'),
    levelChip: (level: number, exp: number) =>
      t(`Level ${level} · ${exp.toLocaleString('en-US')} EXP`, `เลเวล ${level} · ${exp.toLocaleString('en-US')} EXP`, `等级 ${level} · ${exp.toLocaleString('en-US')} 经验值`),
    // In EXP, not levels: the wallet says "2 levels to Wanderer", which is
    // true and unhelpful to somebody deciding whether to do one more quest.
    expToRank: (exp: number, rank: string) =>
      t(`${exp.toLocaleString('en-US')} EXP to ${rank}`, `อีก ${exp.toLocaleString('en-US')} EXP ถึง ${rank}`, `还差 ${exp.toLocaleString('en-US')} 经验值到${rank}`),
    ranks: t('Rank path', 'เส้นทางระดับ', '等阶之路'),
    reached: t('reached', 'ถึงแล้ว', '已达成'),
    lockedUntil: (level: number) => t(`from level ${level}`, `ตั้งแต่เลเวล ${level}`, `从等级 ${level} 起`),
    standing: t('Your standing', 'อันดับของคุณ', '你的排名'),
    of: (n: number) => t(`of ${n} ${n === 1 ? 'participant' : 'participants'}`, `จาก ${n} คน`, `共 ${n} 位参与者`),
    // The honest sentence for the island as it is today. A podium with one
    // step on it implies a crowd that does not exist.
    notRankable: (n: number, min: number) =>
      t(
        `Not a ranking yet: ${n} ${n === 1 ? 'participant' : 'participants'} with verified points, and a ranking needs ${min}.`,
        `ยังไม่จัดอันดับ: มีผู้ร่วมที่มีแต้มตรวจแล้ว ${n} คน ต้องมีอย่างน้อย ${min} คน`,
        `暂不排名：有已验证积分的参与者 ${n} 位，排名至少需要 ${min} 位。`,
      ),
    noVerifiedYet: t(
      'No verified work yet. Finish a quest and its host checks it.',
      'ยังไม่มีงานที่ตรวจแล้ว ทำภารกิจให้จบแล้วผู้จัดจะตรวจให้',
      '还没有已验证的工作。完成一个任务，主办方会来核验。',
    ),
    verifiedPoints: t('Green · verified', 'แต้มสีเขียว · ตรวจแล้ว', '绿色积分 · 已验证'),
    missionsVerified: t('Missions verified', 'ภารกิจที่ตรวจแล้ว', '已验证的任务'),
    /**
     * The companions, named once for every screen that shows them.
     *
     * The wallet used to carry its own copy of this word and drifted to
     * สัตว์ประจำถิ่น - "native animals", which is what they are made of but
     * not what they are called. One key, so the app has one name for its
     * own feature.
     */
    companions: t('Companions', 'เพื่อนร่วมทาง', '伙伴'),
    companionsEmpty: t('Check in anywhere to find your first egg.', 'เช็กอินที่ไหนก็ได้ เพื่อพบไข่ใบแรก', '在任何地方签到，找到你的第一颗蛋。'),
    companionsGrown: t('grown', 'โตเต็มวัย', '已长成'),
    passport: t('Travel passport', 'พาสปอร์ตท่องเที่ยว', '旅行护照'),
    provinces: t('provinces', 'จังหวัด', '府'),
  },

  // -- Medals -------------------------------------------------------------
  // For going to places. The rules are in medals.ts; these are the words.
  medals: {
    context: t('Medals', 'เหรียญตรา', '奖章'),
    earnedOf: (n: number, of: number) => t(`${n} of ${of} earned`, `ได้แล้ว ${n} จาก ${of}`, `已获得 ${n}/${of}`),
    earned: t('Earned', 'ได้แล้ว', '已获得'),
    earnedOn: (when: string) => t(`Earned · ${when}`, `ได้เมื่อ ${when}`, `获得于 ${when}`),
    places: (done: number, total: number) => t(`${done} / ${total} places`, `${done} / ${total} แห่ง`, `${done} / ${total} 个地点`),
    areas: (done: number, total: number) => t(`${done} / ${total} areas`, `${done} / ${total} พื้นที่`, `${done} / ${total} 个区域`),
    /** In the check-in toast, beside the points. */
    justEarned: (name: string) => t(`Medal earned: ${name}`, `ได้เหรียญ ${name}`, `获得奖章：${name}`),
  },

  /** A fair's market, lot by lot (docs/66). */
  fair: {
    kicker: t('At the fair', 'ตลาดในงาน', '集市现场'),
    find: t('Find a stall by name, by what it sells, or by its lot number.', 'หาร้านจากชื่อ สินค้าที่ขาย หรือเลขล็อค', '按名称、所售商品或摊位编号查找摊位。'),
    example: t('Example plan · not the organiser\'s plan yet', 'ผังตัวอย่าง · ยังไม่ใช่ผังจริงของงาน', '示例平面图 · 还不是主办方的正式平面图'),
    datesTba: t('Dates to be announced', 'รอประกาศวันงาน', '日期待公布'),
    search: t('Search stalls and lots', 'ค้นหาร้านหรือล็อค', '搜索摊位或铺位'),
    searchHint: t('e.g. durian, coffee, A05', 'เช่น ทุเรียน กาแฟ A05', '例如：榴莲、咖啡、A05'),
    clear: t('Clear', 'ล้าง', '清除'),
    all: t('All', 'ทั้งหมด', '全部'),
    directory: (stalls: number, lots: number) => t(`${stalls} stalls in ${lots} lots`, `${stalls} ร้าน ใน ${lots} ล็อค`, `${lots} 个铺位中的 ${stalls} 家摊位`),
    found: (n: number) => t(`${n} found`, `เจอ ${n} ล็อค`, `找到 ${n} 个`),
    none: (query: string) => t(`Nothing for "${query}". Try what it sells, or a lot number.`, `ไม่เจอ "${query}" ลองพิมพ์สินค้าที่ขาย หรือเลขล็อค`, `找不到“${query}”。试试所售商品或铺位编号。`),
    lot: (code: string) => t(`Lot ${code}`, `ล็อค ${code}`, `铺位 ${code}`),
    free: t('Free lot', 'ล็อคว่าง', '空铺位'),
    showOnMap: t('Show on the map', 'ดูบนแผนที่', '在地图上显示'),
    // What a screen reader says for the two buttons on a lot's row: every row
    // has the same two faces, so the name carries the lot.
    showLotOnMap: (code: string) => t(`Show lot ${code} on the map`, `ดูล็อค ${code} บนแผนที่`, `在地图上显示铺位 ${code}`),
    orderFrom: (name: string) => t(`Order ahead from ${name}`, `สั่งล่วงหน้าจาก ${name}`, `向 ${name} 提前点单`),
    onMap: (code: string, name: string) => t(`Lot ${code} · ${name}`, `ล็อค ${code} · ${name}`, `铺位 ${code} · ${name}`),
    onMapFree: (code: string) => t(`Lot ${code} · free`, `ล็อค ${code} · ว่าง`, `铺位 ${code} · 空`),
    mapHint: t('Every lot of the fair is on the map; this one is marked.', 'ทุกล็อคในงานอยู่บนแผนที่ ล็อคนี้มีป้ายบอก', '集市的每个铺位都在地图上，这一个已标出。'),
    backToList: t('Back to the list', 'กลับไปที่รายการ', '返回列表'),
    close: t('Close', 'ปิด', '关闭'),
    open: t('Find stalls and lots', 'ค้นหาร้านและล็อค', '查找摊位和铺位'),
    noFair: t('No fair is on in this area.', 'พื้นที่นี้ยังไม่มีงานแฟร์', '该区域目前没有集市。'),
  },

  // -- Campus buildings ---------------------------------------------------
  buildings: {
    kicker: t('On this campus', 'ในมหาวิทยาลัย', '在校园内'),
    title: t('Buildings and places', 'อาคารและสถานที่', '建筑与地点'),
    find: t(
      'Find a faculty, an office, a hall of residence, a car park or a toilet.',
      'หาคณะ สำนักงาน หอพัก ลานจอดรถ หรือห้องน้ำ',
      '查找学院、办公室、宿舍、停车场或卫生间。',
    ),
    search: t('Search buildings', 'ค้นหาอาคาร', '搜索建筑'),
    searchHint: t('e.g. nursing, dorm, car park', 'เช่น พยาบาล หอพัก ลานจอด', '例如：护理、宿舍、停车场'),
    clear: t('Clear', 'ล้าง', '清除'),
    all: t('All', 'ทั้งหมด', '全部'),
    // Read from OpenStreetMap, and the date says how old that reading is.
    readOn: (day: string) => t(
      `Read from OpenStreetMap on ${day}`,
      `อ่านจาก OpenStreetMap วันที่ ${day}`,
      `于 ${day} 自 OpenStreetMap 读取`,
    ),
    directory: (n: number) => t(`${n} mapped`, `มีในแผนที่ ${n} แห่ง`, `地图上有 ${n} 处`),
    found: (n: number) => t(`${n} found`, `เจอ ${n} แห่ง`, `找到 ${n} 处`),
    none: (query: string) => t(
      `Nothing for "${query}". Try a faculty's name, or what the place is.`,
      `ไม่เจอ "${query}" ลองพิมพ์ชื่อคณะ หรือสิ่งที่มันเป็น`,
      `找不到“${query}”。试试学院名称，或这个地方是什么。`,
    ),
    showOnMap: t('Show on the map', 'ดูบนแผนที่', '在地图上显示'),
    showOneOnMap: (name: string) => t(`Show ${name} on the map`, `ดู ${name} บนแผนที่`, `在地图上显示 ${name}`),
    onMap: (name: string) => t(name, name, name),
    backToList: t('Back to the list', 'กลับไปที่รายการ', '返回列表'),
    close: t('Close', 'ปิด', '关闭'),
    open: t('Find a building', 'ค้นหาอาคาร', '查找建筑'),
    none_mapped: t(
      'No building on this campus is mapped yet.',
      'ยังไม่มีอาคารของพื้นที่นี้ในแผนที่',
      '该校园尚无建筑被收录。',
    ),
    // Said once, under the list: the honest limit of what this can answer.
    noFloors: t(
      'A floor and a room number are not in OpenStreetMap, so they are not shown here.',
      'ชั้นและเลขห้องไม่มีใน OpenStreetMap จึงยังไม่แสดงที่นี่',
      'OpenStreetMap 没有楼层和房间号，因此这里不显示。',
    ),
    kind: {
      faculty: t('Faculty', 'คณะ', '学院'),
      office: t('Office', 'สำนักงาน', '办公室'),
      hall: t('Hall', 'หอประชุม', '礼堂'),
      residence: t('Residence', 'หอพัก', '宿舍'),
      parking: t('Car park', 'ลานจอดรถ', '停车场'),
      toilets: t('Toilets', 'ห้องน้ำ', '卫生间'),
    },
  },

  // -- Marketplace --------------------------------------------------------
  market: {
    context: t('Marketplace', 'ใช้แต้ม', '积分商城'),
    // Under a sample offer that names a real business which has not joined.
    example: t('Example · not a partner yet', 'ตัวอย่าง · ร้านยังไม่ได้ร่วมโครงการ', '示例 · 商家尚未加入'),
    intro: t(
      'Every redemption pays a local business directly. 100% of the point value is settled to the merchant.',
      'ทุกการแลกจ่ายให้ธุรกิจท้องถิ่นโดยตรง 100% ของมูลค่าแต้มถูกโอนให้ร้านค้า',
      '每一次兑换都直接付给本地商家。积分价值的 100% 结算给商家。',
    ),
    redeem: t('Redeem', 'แลก', '兑换'),
    notEnough: t('Not enough points yet', 'แต้มยังไม่พอ', '积分还不够'),
    payWith: (currency: string) => t(`Pay with ${currency}`, `จ่ายด้วย${currency}`, `用${currency}支付`),
    voucherSent: (merchant: string) => t(`Voucher sent to ${merchant}`, `ส่งบัตรกำนัลให้ ${merchant} แล้ว`, `券已发送至 ${merchant}`),
    voucherTitle: t('Your voucher', 'บัตรกำนัลของคุณ', '你的券'),
    voucherShow: t('Show this to the merchant', 'แสดงรหัสนี้ให้ร้านค้า', '向商家出示此码'),
    voucherExpires: (when: string) => t(`Expires ${when}`, `หมดอายุ ${when}`, `${when} 到期`),
    voucherRedeemed: t('Redeemed', 'ใช้แล้ว', '已使用'),
    unavailable: t('Currently unavailable', 'ยังไม่เปิดให้แลก', '暂不可兑换'),
    tabOffers: t('Explore deals', 'สิทธิพิเศษ', '优惠专区'),
    tabVouchers: t('My vouchers', 'คูปองของฉัน', '我的券'),
    filterAll: t('All', 'ทั้งหมด', '全部'),
    filterAffordable: t('Affordable', 'แลกได้ทันที', '可立即兑换'),
    filterGreen: t('Green Points', 'แต้มกรีน', '绿色积分'),
    filterTrip: t('Trip Points', 'แต้มทริป', '旅行积分'),
    noOffersMatch: t('No offers match this filter.', 'ไม่มีสิทธิพิเศษที่ตรงกับเงื่อนไขนี้', '没有符合此筛选条件的优惠。'),
    noVouchers: t('No vouchers yet', 'ยังไม่มีคูปองที่แลกไว้', '还没有券'),
    noVouchersBlurb: t('Explore partner offers and redeem with your points.', 'เลือกดูสิทธิพิเศษและใช้แต้มแลกรับสิทธิ์ได้เลย', '浏览合作商家的优惠，用积分兑换。'),
    showVoucher: t('Show voucher', 'แสดงคูปอง', '出示券'),
    activeBadge: t('Ready to use', 'พร้อมใช้', '可使用'),
    usedBadge: t('Redeemed', 'ใช้แล้ว', '已使用'),
    expiredBadge: t('Expired', 'หมดอายุ', '已过期'),
    copyCode: t('Copy code', 'คัดลอกรหัส', '复制代码'),
    copied: t('Code copied to clipboard', 'คัดลอกรหัสแล้ว', '代码已复制到剪贴板'),
    codeInstructions: t('Show this code to the staff at the venue to redeem.', 'แสดงรหัสนี้ให้พนักงานหน้าร้านเพื่อรับสิทธิ์', '到店向工作人员出示此代码即可兑换。'),
  },

  // -- Ask an operator (docs/61) ------------------------------------------
  //
  // Every word here was chosen against one misreading: that an inquiry books
  // something. "Ask", "question", "answered" - never "book", "reserve" or
  // "confirm". The refusal itself lives in `inquiry.ts` and is shown whole.
  ask: {
    context: t('Stays & tours', 'ที่พักและทัวร์', '住宿与行程'),
    door: t('Ask a local operator', 'สอบถามผู้ประกอบการท้องถิ่น', '咨询本地商家'),
    doorSub: t('Stays, boats and tours — a question, not a booking', 'ที่พัก เรือ และทัวร์ — การสอบถาม ไม่ใช่การจอง', '住宿、船只和行程 — 这是咨询，不是预订'),
    yourQuestions: t('Your questions', 'คำถามของคุณ', '你的咨询'),
    operators: t('Ask an operator', 'สอบถามผู้ประกอบการ', '咨询商家'),
    none: t(
      'No operator has listed here yet. When one does, you can ask them a question here.',
      'ยังไม่มีผู้ประกอบการลงรายการไว้ เมื่อมีแล้ว คุณจะสอบถามได้ที่นี่',
      '还没有商家在此登记。有商家加入后，你就可以在这里向他们咨询。',
    ),
    noPrice: t('No price stated', 'ไม่ได้ระบุราคา', '未标明价格'),
    fromPrice: (baht: string) => t(`From ${baht} THB, as the operator states`, `เริ่มต้น ${baht} บาท ตามที่ผู้ประกอบการระบุ`, `商家标示：${baht} THB 起`),
    usuallyAnswers: (hours: string) => t(`Usually answers within ${hours} hours`, `ปกติตอบภายใน ${hours} ชั่วโมง`, `通常在 ${hours} 小时内回复`),
    day: t('Which day', 'วันไหน', '哪一天'),
    party: t('How many people', 'กี่คน', '几位'),
    people: (n: number) => t(n === 1 ? '1 person' : `${n} people`, `${n} คน`, `${n} 人`),
    // Heard, not read: the stepper's buttons show only − and +.
    fewer: t('Fewer people', 'ลดจำนวนคน', '减少人数'),
    more: t('More people', 'เพิ่มจำนวนคน', '增加人数'),
    question: t('Your question', 'คำถามของคุณ', '你的问题'),
    questionHint: t(
      'What you want to know. Add a phone number only if you want them to call you.',
      'สิ่งที่อยากรู้ ใส่เบอร์โทรเฉพาะเมื่ออยากให้ผู้ประกอบการโทรกลับ',
      '你想了解的内容。只有在希望对方来电时才填写电话号码。',
    ),
    send: t('Send question', 'ส่งคำถาม', '发送咨询'),
    sent: t('Sent — nothing is reserved', 'ส่งแล้ว — ยังไม่มีการจองใดๆ', '已发送 — 未产生任何预订'),
    withdraw: t('Withdraw', 'ถอนคำถาม', '撤回'),
    theirReason: t('Their reason', 'เหตุผลจากผู้ประกอบการ', '商家给出的理由'),
    // Only ever on the demo build's made-up operator (ListingCard.example).
    example: t('Example · not a real business', 'ตัวอย่าง · ไม่ใช่ธุรกิจจริง', '示例 · 并非真实商家'),
  },

  // -- Impact -------------------------------------------------------------
  impact: {
    title: t('Your impact', 'ผลลัพธ์ของคุณ', '你的成效'),
    community: (year: number) => t(`ChivarGo community total · ${year}`, `ผลรวมชุมชน ChivarGo · ${year}`, `ChivarGo 社区总计 · ${year}`),
    verifiedData: t('Verified activity data', 'ข้อมูลกิจกรรมที่ตรวจสอบแล้ว', '已验证的活动数据'),
    verifiedBlurb: t(
      'Hours a host has verified go into the ESG impact report a sponsor can file.',
      'ชั่วโมงที่เจ้าภาพรับรองแล้วจะถูกรวมในรายงานผลกระทบ ESG ที่ผู้สนับสนุนนำไปใช้ได้',
      '经主办方核实的时长会计入赞助方可提交的 ESG 成效报告。',
    ),
    exportCard: t('Export my impact card', 'ส่งออกการ์ดผลลัพธ์', '导出我的成效卡'),
    exported: t('Impact card exported', 'ส่งออกการ์ดแล้ว', '成效卡已导出'),
    stats: {
      wasteCollected: t('Waste collected', 'ขยะที่เก็บได้', '收集的垃圾'),
      mangrovesPlanted: t('Mangroves planted', 'ต้นโกงกางที่ปลูก', '种下的红树'),
      volunteerTime: t('Volunteer time', 'เวลาอาสาสมัคร', '志愿时长'),
      questsVerified: t('Quests verified', 'ภารกิจที่ผ่านการตรวจ', '已验证的任务'),
      treesPlanted: t('Trees planted', 'ต้นไม้ที่ปลูก', '种下的树'),
      volunteerHours: t('Volunteer hours', 'ชั่วโมงอาสาสมัคร', '志愿小时数'),
      participants: t('Participants', 'ผู้เข้าร่วม', '参与人数'),
      activities: t('Community activities', 'กิจกรรมชุมชน', '社区活动'),
    },
    /** Percentages are progress against the pilot-year target, always computed. */
    ofTarget: (pct: number) => t(`${pct}% of target`, `${pct}% ของเป้าหมาย`, `达成目标的 ${pct}%`),
  },

  // -- Safety -------------------------------------------------------------
  safety: {
    kicker: t('Security Shield', 'เกราะความปลอดภัย', '安全护盾'),
    title: t("You're covered", 'เราดูแลคุณ', '我们守护着你'),
    subtitle: t('Someone is looking out for you the whole trip', 'มีผู้ช่วยดูแลคุณตลอดการเดินทาง', '全程都有人照看你'),
    services: {
      tracking: t('Live Tracking', 'ติดตามตำแหน่งสด', '实时定位'),
      trackingNote: t('Shared with 2 family contacts', 'แชร์กับผู้ติดต่อในครอบครัว 2 คน', '已与 2 位家人联系人共享'),
      safePath: t('Safe Path', 'เส้นทางปลอดภัย', '安全路线'),
      safePathNote: t('Night routing avoids 3 unlit stretches', 'เส้นทางกลางคืนเลี่ยงช่วงไม่มีไฟ 3 จุด', '夜间路线避开 3 段无照明路段'),
      antiScam: t('Anti-Scam', 'ป้องกันการหลอกลวง', '防诈骗'),
      antiScamNote: t('11 QR merchants verified this trip', 'ตรวจสอบร้านค้า QR แล้ว 11 ร้านในทริปนี้', '本次行程已验证 11 家 QR 商户'),
      emergency: t('Emergency Assistance', 'ความช่วยเหลือฉุกเฉิน', '紧急援助'),
      emergencyNote: t('Koh Sichang Hospital emergency room', 'ห้องฉุกเฉิน โรงพยาบาลเกาะสีชัง', '锡昌岛医院急诊室'),
      language: t('Language Help', 'ช่วยเหลือด้านภาษา', '语言协助'),
      languageNote: t('Thai↔English interpreter on call', 'ล่ามไทย-อังกฤษพร้อมให้บริการ', '泰英口译随时待命'),
    },
    states: { on: t('On', 'เปิด', '开'), ready: t('Ready', 'พร้อม', '就绪'), off: t('Off', 'ปิด', '关') },
    emergency: t('Emergency', 'ฉุกเฉิน', '紧急'),
    sosIdle: t('Press and hold', 'กดค้างไว้', '长按'),
    sosArmed: t('Alert sent', 'ส่งการแจ้งเตือนแล้ว', '警报已发送'),
    dispatching: (where: string) => t(`Dispatching · ${where}`, `กำลังส่งความช่วยเหลือ · ${where}`, `正在调度 · ${where}`),
    dispatchDetail: t(
      'Koh Sichang Hospital notified · Live location shared with 2 contacts · Thai↔English interpreter joining',
      'แจ้งโรงพยาบาลเกาะสีชังแล้ว · แชร์ตำแหน่งกับผู้ติดต่อ 2 คน · ล่ามไทย-อังกฤษกำลังเข้าร่วม',
      '已通知锡昌岛医院 · 已与 2 位联系人共享位置 · 泰英口译正在加入',
    ),
    cancelAlert: t('Cancel alert', 'ยกเลิกการแจ้งเตือน', '取消警报'),
    /**
     * The window between the hold completing and the alert going out.
     *
     * Worded as a countdown, not a question. "Sending in 4" tells someone who
     * pressed by accident exactly how long they have; "Are you sure?" makes
     * someone who meant it stop and answer. The default has to favour the
     * person in trouble.
     */
    sosSending: (s: number) => t(`Sending in ${s}`, `ส่งใน ${s} วินาที`, `${s} 秒后发送`),
    sosStop: t('Stop', 'หยุด', '停止'),
    sosStopped: t('Stopped. Nothing was sent.', 'หยุดแล้ว ยังไม่ได้ส่งอะไรออกไป', '已停止，未发送任何内容。'),
    antiScamFooter: t(
      'Anti-Scam checks every booking QR against the verified merchant registry before you pay.',
      'ระบบตรวจสอบ QR ทุกการจองกับทะเบียนร้านค้าที่ยืนยันแล้วก่อนคุณชำระเงิน',
      '防诈骗会在你付款前，将每个预订 QR 与已验证的商户名录逐一核对。',
    ),
    /**
     * A live alert persists across navigation and shows a global banner.
     *
     * Wording matters here. The prototype's "help is on the way" is a promise
     * this system cannot keep - it does not dispatch anyone. What is true is
     * that the alert is live and being shared.
     */
    activeBanner: t('SOS active — your location is being shared', 'SOS ทำงานอยู่ — กำลังแชร์ตำแหน่งของคุณ', 'SOS 已启动 — 正在共享你的位置'),
    shareLink: t('Share my live location', 'แชร์ตำแหน่งปัจจุบัน', '共享我的实时位置'),
    shareMessage: t(
      'I need help. This link shows my live location:',
      'ฉันต้องการความช่วยเหลือ ลิงก์นี้แสดงตำแหน่งปัจจุบันของฉัน:',
      '我需要帮助。此链接显示我的实时位置：',
    ),
    shareFailed: t('Could not open sharing', 'เปิดการแชร์ไม่ได้', '无法打开共享'),
    contactsReached: (reached: number, total: number) =>
      t(`${reached} of ${total} contacts reached`, `ติดต่อได้ ${reached} จาก ${total} คน`, `已联系上 ${total} 位联系人中的 ${reached} 位`),
    noContacts: t(
      'No emergency contacts saved — share the link yourself',
      'ยังไม่มีผู้ติดต่อฉุกเฉิน กรุณาแชร์ลิงก์ด้วยตนเอง',
      '未保存紧急联系人 — 请自行分享链接',
    ),
    notAcknowledged: t('Nobody has picked this up yet', 'ยังไม่มีเจ้าหน้าที่รับเรื่อง', '还没有人受理'),
    acknowledgedBy: (who: string) => t(`${who} has your alert`, `${who} รับเรื่องแล้ว`, `${who} 已收到你的警报`),
    /** The line that must never be buried. */
    cannotDispatch: t(
      'ChivarGo cannot send an ambulance. Call 1669 if anyone is hurt.',
      'ChivarGo ส่งรถพยาบาลไม่ได้ หากมีผู้บาดเจ็บ กรุณาโทร 1669',
      'ChivarGo 无法派出救护车。如有人受伤，请拨打 1669。',
    ),
    /**
     * Official Thai emergency numbers. Free to call, no airtime credit needed.
     * ChivarGo dispatch never replaces these - it runs alongside them.
     */
    callDirect: t('Or call directly', 'หรือโทรโดยตรง', '或直接拨打'),
    numbers: {
      ems: t('Medical emergency · 1669', 'เจ็บป่วยฉุกเฉิน · 1669', '医疗急救 · 1669'),
      touristPolice: t('Tourist Police · 1155', 'ตำรวจท่องเที่ยว · 1155', '旅游警察 · 1155'),
      police: t('Police · 191', 'ตำรวจ · 191', '警察 · 191'),
    },
  },

  // -- Notifications (in-app inbox) ----------------------------------------
  notifications: {
    title: t('Updates', 'อัปเดต', '更新'),
    markAllRead: t('Mark all read', 'อ่านทั้งหมดแล้ว', '全部标为已读'),
    empty: t('Nothing new', 'ไม่มีอัปเดตใหม่', '没有新消息'),
    /**
     * Shown when the OS permission was declined. Not a nag - it explains that
     * nothing is lost, which is true, and where to change their mind.
     */
    pushOff: t(
      'Push notifications are off. Updates still appear here.',
      'การแจ้งเตือนถูกปิดอยู่ อัปเดตยังแสดงที่นี่',
      '推送通知已关闭。更新仍会显示在这里。',
    ),
  },

  // -- Check-in -----------------------------------------------------------
  checkin: {
    cta: t('Check in here', 'เช็กอินที่นี่', '在此签到'),
    checkingIn: t('Checking in…', 'กำลังเช็กอิน…', '正在签到…'),
    // The phone could not get a fix at all - tree cover, a timeout, a
    // simulator. Different from a refused permission and from being too far.
    noFix: t(
      'Could not get your position. Move into the open and try again',
      'หาตำแหน่งไม่ได้ ลองย้ายไปที่โล่งแล้วลองใหม่',
      '无法获取你的位置。请移到开阔处后重试',
    ),
    /** The leg on foot that a check-in closed, paid beside it. */
    walked: (n: number, from: string) => t(`+${n} T for walking here from ${from}`, `+${n} T ที่เดินมาจาก${from}`, `从${from}步行到此 +${n} T`),
    awarded: (n: number) =>
      t(`Checked in · +${n} Trip Points`, `เช็กอินแล้ว ได้ ${n} แต้มทริป`, `已签到 · +${n} 旅行积分`),
    // Warm, not red. Coming back to a place you liked is the behaviour the
    // product wants; the only thing being refused is a second payout.
    already: t(
      'Already checked in here today — come back tomorrow',
      'วันนี้เช็กอินที่นี่แล้ว พรุ่งนี้มาใหม่ได้',
      '今天已在这里签到过 — 明天再来吧',
    ),
    tooFar: (m: number) =>
      t(
        `You need to be at the place to check in — about ${m} m away`,
        `ต้องอยู่ที่สถานที่จริงถึงจะเช็กอินได้ ห่างประมาณ ${m} ม.`,
        `需要到达现场才能签到 — 距离约 ${m} m`,
      ),
    // The other half of a check-in. When the phone cannot prove it, the
    // visit can still be RECORDED - in the passport, marked as self-reported
    // - without being SCORED. Said plainly so nobody thinks the points come
    // later.
    noteOffer: t('Note that I was here · no points', 'บันทึกว่ามาแล้ว · ไม่ได้แต้ม', '记下我来过 · 不计积分'),
    noted: (left: number) =>
      t(
        `Noted in your passport as self-reported · ${left} more this year`,
        `บันทึกลงพาสปอร์ตแล้ว (ระบุว่าบันทึกเอง) เหลืออีก ${left} ครั้งในปีนี้`,
        `已记入护照并标注为自行记录 · 今年还剩 ${left} 次`,
      ),
    notedAlready: t('Already noted here', 'บันทึกที่นี่ไว้แล้ว', '这里已经记过了'),
    quotaGone: t(
      'All self-reported stamps for this year are used',
      'โควตาบันทึกเองของปีนี้หมดแล้ว',
      '今年的自行记录名额已用完',
    ),
  },

  // -- Reviews ------------------------------------------------------------
  reviews: {
    title: t('Reviews', 'รีวิว', '评价'),
    // The claim that makes this different from every other review list. It is
    // a statement about the whole section, not a badge on individual rows.
    verifiedOnly: t(
      'Every review here is from someone the app confirmed was standing at this place',
      'ทุกรีวิวที่นี่มาจากคนที่แอปยืนยันแล้วว่าอยู่ที่นี่จริง',
      '这里的每条评价都来自应用确认当时身处此地的人',
    ),
    none: t('No reviews yet — be the first', 'ยังไม่มีรีวิว มาเป็นคนแรกกัน', '还没有评价 — 来做第一个'),
    // Why the write control is missing. Never show a disabled button with no
    // explanation: the answer is "check in", and the user can act on it.
    lockedUntilCheckin: t(
      'Check in here first — reviews come from people who were actually here',
      'เช็กอินที่นี่ก่อน รีวิวมาจากคนที่มาที่นี่จริง',
      '请先在此签到 — 评价来自真正到过这里的人',
    ),
    write: t('Write a review', 'เขียนรีวิว', '写评价'),
    edit: t('Edit your review', 'แก้ไขรีวิวของคุณ', '修改你的评价'),
    yours: t('Your review', 'รีวิวของคุณ', '你的评价'),
    // Stands where an author name would go. The pilot has no accounts, so
    // every display name is the default "Traveller" - three identical names
    // read as broken, and the verification is the useful fact anyway.
    verifiedVisit: t('Verified visit', 'ยืนยันการมาเยือนแล้ว', '已验证到访'),

    // -- Appeals ----------------------------------------------------------
    takenDown: t('Taken down', 'ถูกนำออกแล้ว', '已下架'),
    takenDownExplain: (reason: string) =>
      t(`Only you can see this. Reason: ${reason}`, `มีเพียงคุณที่เห็นข้อความนี้ เหตุผล: ${reason}`, `只有你能看到这条信息。原因：${reason}`),
    appeal: t('I think this was wrong', 'คิดว่าการตัดสินนี้ไม่ถูกต้อง', '我认为这个判定有误'),
    appealTitle: t('Appeal this decision', 'อุทธรณ์คำตัดสิน', '申诉此判定'),
    appealBlurb: t(
      'A different moderator will read this. Say what you think they got wrong.',
      'ผู้ดูแลอีกคนจะเป็นคนอ่าน บอกได้เลยว่าคุณคิดว่าอะไรไม่ถูกต้อง',
      '将由另一位审核员阅读。说说你认为哪里判错了。',
    ),
    appealSubmit: t('Send appeal', 'ส่งอุทธรณ์', '提交申诉'),
    appealSent: t('Appeal sent — a moderator will read it', 'ส่งอุทธรณ์แล้ว ผู้ดูแลจะอ่านให้', '申诉已提交 — 审核员会阅读'),
    appealPending: t('Appeal sent — waiting for a decision', 'ส่งอุทธรณ์แล้ว รอผลการพิจารณา', '申诉已提交 — 等待结果'),
    appealDeclined: t('Appealed — the decision stood', 'อุทธรณ์แล้ว ยืนตามคำตัดสินเดิม', '已申诉 — 维持原判'),

    // -- Reporting --------------------------------------------------------
    report: t('Report', 'รายงาน', '举报'),
    reportTitle: t('Report this review', 'รายงานรีวิวนี้', '举报这条评价'),
    // Says exactly what a report does and does not do. Someone who expects a
    // report to remove something, and watches it stay up, concludes the
    // button is fake.
    reportBlurb: t(
      'This sends the review to a moderator to look at. It does not remove it — only a moderator can do that.',
      'ระบบจะส่งรีวิวนี้ให้ผู้ดูแลตรวจ การรายงานไม่ได้ลบรีวิว มีเพียงผู้ดูแลเท่านั้นที่ทำได้',
      '这会把该评价送交审核员查看。举报不会删除它 — 只有审核员才能删除。',
    ),
    reportReason: t('What is wrong with it?', 'มีอะไรไม่ถูกต้อง', '它有什么问题？'),
    reportNote: t('Anything else the moderator should know? (optional)', 'มีอะไรอยากบอกผู้ดูแลเพิ่มไหม (ไม่บังคับ)', '还有什么想告诉审核员的吗？（选填）'),
    reportSubmit: t('Send report', 'ส่งรายงาน', '提交举报'),
    reported: t('Reported — a moderator will look at it', 'รายงานแล้ว ผู้ดูแลจะตรวจสอบให้', '已举报 — 审核员会查看'),
    reportedAlready: t('You have already reported this', 'คุณรายงานรีวิวนี้ไปแล้ว', '你已经举报过这条'),
    submit: t('Post review', 'โพสต์รีวิว', '发布评价'),
    remove: t('Delete', 'ลบ', '删除'),
    placeholder: t('What should the next traveller know?', 'อยากบอกอะไรกับคนที่จะมาต่อ', '想对下一位旅行者说点什么？'),
    rating: (n: number) =>
      t(`${n} out of 5`, `${n} จาก 5`, `${n} 分（满分 5 分）`),
    count: (n: number) =>
      t(`${n} ${n === 1 ? 'review' : 'reviews'}`, `${n} รีวิว`, `${n} 条评价`),
    visited: (when: string) =>
      t(`Visited ${when}`, `ไปมาเมื่อ ${when}`, `到访于 ${when}`),
    posted: (n: number) =>
      t(`Posted · +${n} Trip Points`, `โพสต์แล้ว ได้ ${n} แต้มทริป`, `已发布 · +${n} 旅行积分`),
    // Says plainly that the edit earns nothing, rather than letting the user
    // discover it by watching a number not move.
    updated: t('Review updated', 'อัปเดตรีวิวแล้ว', '评价已更新'),
    tooShortForPoints: (n: number) =>
      t(
        `Posted. Write ${n} characters or more to earn Trip Points.`,
        `โพสต์แล้ว เขียนอย่างน้อย ${n} ตัวอักษรถึงจะได้แต้มทริป`,
        `已发布。写满 ${n} 个字符以上才能获得旅行积分。`,
      ),
    // A review written in a language the reader may not have. We label it and
    // leave it as typed - a machine translation shown as the traveller's own
    // words is a quote they never said.
    inLanguage: (lang: string) =>
      t(`Written in ${lang}`, `เขียนเป็นภาษา${lang}`, `以${lang}写成`),
  },

  // -- Trip ---------------------------------------------------------------
  trip: {
    context: (day: number, date: string) => t(`Day ${day} · ${date}`, `วันที่ ${day} · ${date}`, `第 ${day} 天 · ${date}`),
    walking: t('Walking', 'ระยะเดิน', '步行距离'),
    pointsToday: t('Points today', 'แต้มวันนี้', '今日积分'),
    air: t('Air', 'อากาศ', '空气'),
    empty: t('Nothing planned yet — add a place from the map', 'ยังไม่มีแผน เพิ่มสถานที่จากแผนที่', '还没有安排 — 从地图添加地点'),
    planCta: t('Plan my day', 'จัดแผนวันนี้ให้ฉัน', '帮我安排今天'),
    planBlurb: t(
      'Built from your profile, today’s air and where the quests are — every stop says why.',
      'จัดจากโปรไฟล์ คุณภาพอากาศวันนี้ และตำแหน่งภารกิจ ทุกจุดบอกเหตุผลว่าทำไม',
      '依据你的个人资料、今天的空气状况和任务位置来安排 — 每一站都会说明理由。',
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
    '点名或指认了某个人',
  ),
  abusive: t(
    'It is abusive or threatening',
    'มีเนื้อหาคุกคามหรือดูหมิ่น',
    '含有辱骂或威胁内容',
  ),
  not_about_place: t(
    'It is not about this place',
    'ไม่ได้เกี่ยวกับสถานที่นี้',
    '与这个地点无关',
  ),
  spam: t(
    'It is an advert or spam',
    'เป็นโฆษณาหรือสแปม',
    '是广告或垃圾信息',
  ),
  untrue: t(
    'I believe it is untrue',
    'คิดว่าไม่เป็นความจริง',
    '我认为内容不属实',
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
    '该评价已被下架',
  ),
  kept: t(
    'a moderator read it and decided it can stay',
    'ผู้ดูแลอ่านแล้วและเห็นว่ายังคงไว้ได้',
    '审核员已阅读，认为可以保留',
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
    '以姓名或联系方式指认个人',
  ),
  abusive: t(
    'Abusive, threatening or discriminatory',
    'มีเนื้อหาคุกคาม ดูหมิ่น หรือเลือกปฏิบัติ',
    '辱骂、威胁或歧视',
  ),
  not_about_place: t(
    'Not about this place',
    'ไม่ได้เกี่ยวกับสถานที่นี้',
    '与此地点无关',
  ),
  commercial: t(
    'Advertising, spam or a solicitation',
    'เป็นการโฆษณา สแปม หรือชักชวนทางการค้า',
    '广告、垃圾信息或商业招揽',
  ),
  unverifiable_accusation: t(
    'A serious accusation we are not able to verify — please report it to the police',
    'เป็นข้อกล่าวหาร้ายแรงที่เราตรวจสอบไม่ได้ กรุณาแจ้งความกับเจ้าหน้าที่ตำรวจ',
    '我们无法核实的严重指控 — 请向警方报案',
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
    '照片未显示已完成的工作',
  ),
  not_at_site: t(
    'Photos were not taken at the quest site',
    'ภาพถ่ายไม่ได้ถ่ายในพื้นที่ภารกิจ',
    '照片不是在任务现场拍摄的',
  ),
  wrong_day: t(
    'Photos appear to be from a different day',
    'ภาพถ่ายดูเหมือนถ่ายคนละวันกับภารกิจ',
    '照片看起来不是任务当天拍的',
  ),
  weight_mismatch: t(
    'Weight logged does not match the photos',
    'น้ำหนักที่บันทึกไม่ตรงกับภาพถ่าย',
    '记录的重量与照片不符',
  ),
  too_few_photos: t(
    'Not enough photos to verify the work',
    'ภาพถ่ายไม่เพียงพอต่อการตรวจสอบ',
    '照片不足以验证工作',
  ),
  duplicate: t(
    'Duplicate of an earlier submission',
    'ซ้ำกับหลักฐานที่ส่งมาก่อนหน้านี้',
    '与此前提交的证据重复',
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
): Localised | null {
  const preset = reasonKey ? REJECTION_REASONS[reasonKey] : null;
  if (!preset && !note) return null;
  if (!preset) return { en: note!, th: note!, zh: note! };
  if (!note) return preset;
  return { en: `${preset.en} — ${note}`, th: `${preset.th} — ${note}`, zh: `${preset.zh ?? preset.en} — ${note}` };
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
  /**
   * An operator answered a traveller's inquiry.
   *
   * The title says "answered", never "confirmed" or "booked": an inquiry
   * reserves nothing (docs/61), and a push notification is the one place a
   * traveller reads a single line and acts on it without opening anything.
   */
  inquiry_answered: {
    title: t('{operator} answered your question', '{operator} ตอบคำถามของคุณแล้ว', '{operator} 回复了你的咨询'),
    // Each language names the listing in its own language: `{listing}` and
    // `{listingTh}` are both passed, and a Thai traveller reading the English
    // title inside a Thai notification was the first version of this.
    body: t(
      'About {listing}. Nothing is booked until you agree it with them directly.',
      'เรื่อง {listingTh} ยังไม่มีการจองจนกว่าคุณจะตกลงกับผู้ประกอบการโดยตรง',
      '关于 {listing}。在你与对方直接确认之前，不会产生任何预订。',
    ),
  },
  /** An operator could not help. Said plainly, so nobody waits for an answer that is not coming. */
  inquiry_declined: {
    title: t('{operator} can’t help with this one', '{operator} ไม่สามารถรับคำขอนี้ได้', '{operator} 无法处理这项请求'),
    body: t(
      'About {listing}. Nothing was reserved, so there is nothing to cancel.',
      'เรื่อง {listingTh} ไม่มีการจองใดๆ เกิดขึ้น จึงไม่มีอะไรต้องยกเลิก',
      '关于 {listing}。没有产生任何预订，因此无需取消。',
    ),
  },
  quest_approved: {
    title: t('Quest verified', 'ภารกิจผ่านการตรวจสอบ', '任务已验证'),
    body: t(
      '{host} approved {quest}. +{points} Green Points added.',
      '{host} อนุมัติ {quest} แล้ว ได้รับ {points} แต้มสีเขียว',
      '{host} 已通过 {quest}。绿色积分 +{points}。',
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
    title: t('Your review was taken down', 'รีวิวของคุณถูกนำออก', '你的评价已被下架'),
    body: t(
      'Your review of {place} is no longer shown: {reason}',
      'รีวิว {place} ของคุณไม่แสดงแล้ว เนื่องจาก{reason}',
      '你对 {place} 的评价不再显示：{reason}',
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
    title: t('Your review is back', 'รีวิวของคุณกลับมาแล้ว', '你的评价已恢复'),
    body: t(
      'Your review of {place} is published again. Sorry for the interruption.',
      'รีวิว {place} ของคุณกลับมาแสดงแล้ว ขออภัยในความไม่สะดวก',
      '你对 {place} 的评价已重新发布。给你带来不便，很抱歉。',
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
    title: t('Thanks — a moderator looked', 'ผู้ดูแลตรวจแล้ว ขอบคุณ', '审核员已查看，谢谢你'),
    body: t(
      'Your report about a review of {place}: {outcome}',
      'รายงานของคุณเกี่ยวกับรีวิว {place}: {outcome}',
      '你对 {place} 一条评价的举报：{outcome}',
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
    title: t('Your appeal was reviewed', 'ผลการอุทธรณ์ของคุณ', '你的申诉已处理'),
    body: t(
      'A second moderator read your appeal about {place} and the decision stands.',
      'ผู้ดูแลอีกคนอ่านคำอุทธรณ์เรื่อง {place} ของคุณแล้ว และยืนตามคำตัดสินเดิม',
      '另一位审核员已阅读你关于 {place} 的申诉，维持原判。',
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
    title: t('Your appeal is still waiting', 'คำอุทธรณ์ของคุณยังรออยู่', '你的申诉仍在等待'),
    body: t(
      'Nobody has read your appeal about {place} yet. It is still in the queue and we have not forgotten it.',
      'ยังไม่มีผู้ดูแลอ่านคำอุทธรณ์เรื่อง {place} ของคุณ เรื่องยังอยู่ในคิวและเราไม่ได้ลืม',
      '还没有人阅读你关于 {place} 的申诉。它仍在队列中，我们没有忘记。',
    ),
  },
  quest_rejected: {
    title: t('Proof needs another look', 'หลักฐานต้องส่งใหม่', '证据需要重新提交'),
    body: t(
      '{host} could not verify {quest}. Tap to see why and resubmit.',
      '{host} ยังตรวจสอบ {quest} ไม่ผ่าน แตะเพื่อดูเหตุผลและส่งใหม่',
      '{host} 未能验证 {quest}。点按查看原因并重新提交。',
    ),
  },
  /**
   * Fired when a submission has sat unreviewed past the promised window. The
   * design promises "verified by host within 24h"; going quiet past that is
   * how a volunteer decides the whole thing is a gimmick.
   */
  quest_review_delayed: {
    title: t('Still being reviewed', 'ยังอยู่ระหว่างตรวจสอบ', '仍在审核中'),
    body: t(
      '{host} has not finished checking {quest} yet. We will tell you as soon as they do.',
      '{host} ยังตรวจ {quest} ไม่เสร็จ เราจะแจ้งทันทีที่มีผล',
      '{host} 还没有核验完 {quest}。一有结果我们就会告诉你。',
    ),
  },
  /** Sent to an emergency contact who also uses ChivarGo. */
  sos_contact_alerted: {
    title: t('Emergency alert', 'แจ้งเตือนฉุกเฉิน', '紧急警报'),
    body: t(
      '{name} triggered SOS near {where}. Tap to see their live location.',
      '{name} กดขอความช่วยเหลือใกล้ {where} แตะเพื่อดูตำแหน่งปัจจุบัน',
      '{name} 在 {where} 附近触发了 SOS。点按查看其实时位置。',
    ),
  },
  /**
   * Sent to the person who fired it, the moment a named human picks it up.
   * The single most reassuring thing this system can send.
   */
  sos_acknowledged: {
    title: t('Someone is with you', 'มีเจ้าหน้าที่รับเรื่องแล้ว', '已有人在陪着你'),
    body: t(
      '{operator} has your alert and your live location.',
      '{operator} รับเรื่องและเห็นตำแหน่งของคุณแล้ว',
      '{operator} 已收到你的警报和实时位置。',
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
    title: t('Nobody has answered yet', 'ยังไม่มีใครรับเรื่อง', '还没有人回应'),
    body: t(
      'No one has picked up your alert after {minutes} min. Call 1669 now if anyone is hurt.',
      'ผ่านไป {minutes} นาที ยังไม่มีใครรับเรื่องของคุณ หากมีผู้บาดเจ็บ โทร 1669 ทันที',
      '已过 {minutes} 分钟，仍无人受理你的警报。如有人受伤，请立即拨打 1669。',
    ),
  },
  /** Second and final nudge. Blunter, because the first one did not land. */
  sos_still_unacknowledged: {
    title: t('Please call 1669', 'กรุณาโทร 1669', '请拨打 1669'),
    body: t(
      'Your alert has been open {minutes} min with no response. ChivarGo cannot send help — call 1669 or 1155.',
      'การแจ้งเตือนของคุณเปิดมา {minutes} นาทีแล้วโดยไม่มีการตอบรับ ChivarGo ส่งความช่วยเหลือไม่ได้ กรุณาโทร 1669 หรือ 1155',
      '你的警报已持续 {minutes} 分钟无人回应。ChivarGo 无法派出救援 — 请拨打 1669 或 1155。',
    ),
  },
  /** Sent to app-using contacts when the desk has gone quiet. */
  sos_contact_escalated: {
    title: t('Still no response', 'ยังไม่มีการตอบรับ', '仍无回应'),
    body: t(
      "{name}'s alert has been open {minutes} min and nobody has picked it up. Please try to reach them.",
      'การแจ้งเตือนของ {name} เปิดมา {minutes} นาทีแล้วยังไม่มีใครรับเรื่อง กรุณาติดต่อเขา',
      '{name} 的警报已持续 {minutes} 分钟，仍无人受理。请尝试联系他们。',
    ),
  },
  voucher_expiring: {
    title: t('Voucher expiring soon', 'บัตรกำนัลใกล้หมดอายุ', '券即将到期'),
    body: t(
      'Your {merchant} voucher expires in {days} days.',
      'บัตรกำนัล {merchant} จะหมดอายุใน {days} วัน',
      '你的 {merchant} 券将在 {days} 天后到期。',
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
 * be woken at 03:00 island time by a rule meant to protect them.
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
): { title: Localised; body: Localised } {
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
  const resolve = (value: string | number, lang: Lang): string => {
    if (isModerationReasonKey(value)) return localise(MODERATION_REASONS[value], lang);
    if (isReportOutcome(value)) return localise(REPORT_OUTCOMES[value], lang);
    return String(value);
  };

  const fill = (s: string, lang: keyof Localised): string =>
    s.replace(/\{(\w+)\}/g, (whole, name: string) =>
      Object.hasOwn(params, name) ? resolve(params[name]!, lang) : whole,
    );
  /*
   * Every language the product speaks, not two of them.
   *
   * This returned `{en, th}` while all sixteen templates already carried
   * Chinese and `notification-service.ts` already stored and honoured
   * `locale: 'zh'`. The service's `pick` then fell back to English, so a
   * device registered in Chinese was pushed English - including
   * `sos_contact_escalated`, the line that says ChivarGo cannot send help and
   * to call 1669. A notification is the one place somebody reads a single
   * line and acts on it without opening anything.
   *
   * Read through `localise` rather than `.zh` directly: the field is optional
   * on `Localised`, and its fallback chain is the right answer for a template
   * that has not been translated yet.
   */
  const line = (value: Localised, lang: Lang): string => fill(localise(value, lang), lang);
  return {
    title: { en: line(template.title, 'en'), th: line(template.title, 'th'), zh: line(template.title, 'zh') },
    body: { en: line(template.body, 'en'), th: line(template.body, 'th'), zh: line(template.body, 'zh') },
  };
}
