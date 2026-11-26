/**
 * What a screen calls the place it is about.
 *
 * The copy was written when every area was an island. Three of the five are
 * now universities, and they were being told to help look after the island.
 */
import type { Area, Bilingual } from '@chivago/core';

export interface AreaWords {
  homeTagline: Bilingual;
  questsTagline: Bilingual;
  questsHint: Bilingual;
  perksBody: Bilingual;
  /** The weather card's own name. Only a coast has a sea to report. */
  weatherTitle: Bilingual;
  /** Under a reading TMD measured. */
  weatherNoteObserved: Bilingual;
  /** Under a reading that is a model's. */
  weatherNoteModel: Bilingual;
  /**
   * The alerts row. A warning reaches everywhere; a ferry does not, and a
   * campus offered ferry status is being told about somebody else's journey.
   */
  alertsTitle: Bilingual;
  alertsNone: Bilingual;
  alertsUnavailable: Bilingual;
  /**
   * The source line when the feed named no provider - the no-reading path,
   * where the server's own `source` says "forecast and marine" whatever the
   * area is. A campus is not told about a marine model or about navigating.
   */
  weatherVia: Bilingual;
  /**
   * Who could agree to run a waste drop-off point here.
   *
   * On an island that is a shop or the municipality, which is who signs for
   * what is handed in. A campus has neither: the university is its own
   * authority, and a student told to wait for the municipality is being sent
   * to the wrong desk.
   */
  dropOffHost: Bilingual;
}

const ISLAND: AreaWords = {
  homeTagline: {
    en: 'Island stories, local people and safer journeys — all in one place.',
    th: 'เรื่องราวของเกาะ ผู้คนท้องถิ่น และการเดินทางที่ปลอดภัยในที่เดียว',
    zh: '岛屿故事、当地人与安心旅程，尽在一处。',
  },
  questsTagline: { en: 'PLAY, EXPLORE & HELP THE ISLAND', th: 'เล่นเกม ออกสำรวจ และช่วยดูแลเกาะ', zh: '畅玩、探索并守护岛屿' },
  dropOffHost: {
    en: 'A point appears here when a shop or the municipality agrees to run one and to sign for what is handed in.',
    th: 'จุดรับจะขึ้นที่นี่เมื่อมีร้านหรือเทศบาลรับเป็นผู้ดูแล และลงนามรับของที่ส่งมอบ',
    zh: '当有商家或市政方同意负责并为所交付的物品签收时，投放点会显示在这里。',
  },
  questsHint: { en: 'Activities around the island', th: 'กิจกรรมที่ทำได้ทั่วเกาะ', zh: '岛上各处的活动' },
  perksBody: {
    en: 'Use your Green and Trip points for café discounts, wellness and island tours.',
    th: 'ใช้แต้มกรีนและแต้มทริป แลกรับส่วนลดคาเฟ่ ร้านอาหาร และกิจกรรมบนเกาะ',
    zh: '用你的绿色积分和旅行积分，兑换咖啡馆折扣、康养和岛上行程。',
  },
  weatherTitle: { en: 'Today’s weather & sea', th: 'อากาศและทะเลวันนี้', zh: '今日天气与海况' },
  weatherNoteObserved: {
    en: 'Land conditions are observed by TMD; waves remain model data. Check official notices before sea travel.',
    th: 'สภาพอากาศบนบกตรวจวัดโดยกรมอุตุนิยมวิทยา ส่วนคลื่นเป็นข้อมูลแบบจำลอง ควรตรวจประกาศทางการก่อนเดินทางทางทะเล',
    zh: '陆地天气来自泰国气象局实测，海浪仍为模型数据；海上出行前请查看官方通知。',
  },
  weatherNoteModel: {
    en: 'Model forecast — check official notices before travelling by sea.',
    th: 'ข้อมูลจากแบบจำลอง ควรตรวจประกาศทางการก่อนเดินทางทางทะเล',
    zh: '模型预报；海上出行前请查看官方通知。',
  },
  alertsTitle: { en: 'Alerts & ferry status', th: 'ประกาศเตือนและสถานะเรือ', zh: '预警与渡轮状态' },
  alertsNone: {
    en: 'No active TMD warning. Ferry status is not connected.',
    th: 'ไม่พบประกาศเตือนที่กำลังใช้งานจากกรมอุตุนิยมวิทยา ส่วนสถานะเรือยังไม่ได้เชื่อมต่อ',
    zh: '泰国气象局暂无有效预警；渡轮状态尚未接入。',
  },
  alertsUnavailable: {
    en: 'Official TMD warnings or ferry status are unavailable.',
    th: 'ยังไม่สามารถอ่านประกาศเตือนจากกรมอุตุนิยมวิทยาหรือสถานะเรือได้',
    zh: '暂时无法读取泰国气象局预警或渡轮状态。',
  },
  weatherVia: {
    en: 'Read from Open-Meteo. Not a forecast for navigation.',
    th: 'อ่านจาก Open-Meteo ไม่ใช่พยากรณ์สำหรับการเดินเรือ',
    zh: '数据来自 Open-Meteo。不作航海预报使用。',
  },
};

const CAMPUS: AreaWords = {
  homeTagline: {
    en: 'Campus stories, the people here and safer journeys — all in one place.',
    th: 'เรื่องราวในมหาวิทยาลัย ผู้คนที่นี่ และการเดินทางที่ปลอดภัยในที่เดียว',
    zh: '校园故事、身边的人与安心旅程，尽在一处。',
  },
  questsTagline: { en: 'PLAY, EXPLORE & LOOK AFTER THE CAMPUS', th: 'เล่นเกม ออกสำรวจ และช่วยดูแลมหาวิทยาลัย', zh: '畅玩、探索并守护校园' },
  dropOffHost: {
    en: 'A point appears here when a shop or the university agrees to run one and to sign for what is handed in.',
    th: 'จุดรับจะขึ้นที่นี่เมื่อมีร้านหรือมหาวิทยาลัยรับเป็นผู้ดูแล และลงนามรับของที่ส่งมอบ',
    zh: '当有商家或校方同意负责并为所交付的物品签收时，投放点会显示在这里。',
  },
  questsHint: { en: 'Activities around the campus', th: 'กิจกรรมที่ทำได้ในมหาวิทยาลัย', zh: '校园各处的活动' },
  perksBody: {
    en: 'Use your Green and Trip points for discounts at cafés, food stalls and local activities.',
    th: 'ใช้แต้มกรีนและแต้มทริป แลกรับส่วนลดคาเฟ่ ร้านอาหาร และกิจกรรมในพื้นที่',
    zh: '用你的绿色积分和旅行积分，兑换咖啡馆、餐饮和本地活动的优惠。',
  },
  weatherTitle: { en: 'Today’s weather', th: 'อากาศวันนี้', zh: '今日天气' },
  weatherNoteObserved: {
    en: 'Land conditions are observed by TMD.',
    th: 'สภาพอากาศบนบกตรวจวัดโดยกรมอุตุนิยมวิทยา',
    zh: '陆地天气来自泰国气象局实测。',
  },
  weatherNoteModel: {
    en: 'Model forecast — not a measured reading.',
    th: 'ข้อมูลจากแบบจำลอง ไม่ใช่ค่าที่ตรวจวัดจริง',
    zh: '模型预报，并非实测数值。',
  },
  alertsTitle: { en: 'Weather alerts', th: 'ประกาศเตือน', zh: '天气预警' },
  alertsNone: {
    en: 'No active TMD warning.',
    th: 'ไม่พบประกาศเตือนที่กำลังใช้งานจากกรมอุตุนิยมวิทยา',
    zh: '泰国气象局暂无有效预警。',
  },
  alertsUnavailable: {
    en: 'Official TMD warnings are unavailable.',
    th: 'ยังไม่สามารถอ่านประกาศเตือนจากกรมอุตุนิยมวิทยาได้',
    zh: '暂时无法读取泰国气象局预警。',
  },
  weatherVia: {
    en: 'Read from Open-Meteo.',
    th: 'อ่านจาก Open-Meteo',
    zh: '数据来自 Open-Meteo。',
  },
};

export const areaWords = (area: Pick<Area, 'university'>): AreaWords => (area.university ? CAMPUS : ISLAND);
