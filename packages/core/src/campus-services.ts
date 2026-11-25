/**
 * What a university already runs, and where its own page for it is.
 *
 * RMUTT has a room booking system, a clinic, a sports centre and a library with
 * its own renewals. This app does none of those things and must not start: two
 * systems holding one room would double-book it. It knows which page does what,
 * says the rules before somebody goes there, and reminds them afterwards.
 *
 * WHAT THIS REFUSES.
 *
 *   NOTHING IS READ FROM ANOTHER SYSTEM. RMUTT's public booking table prints
 *   the name of whoever booked each room. A link sends a person to it; nothing
 *   here fetches it. Room status waits for a free-or-busy feed with no names in
 *   it, which is the university's to give.
 *
 *   NO HOURS THAT NOBODY HAS CONFIRMED. The pages that print opening hours are
 *   undated and some contradict themselves, so the hours stay on those pages.
 *   The library's room rules are here because they are dated.
 *
 *   EVERY LINE CITES THE PAGE IT CAME FROM and the day it was read.
 *
 * Read from rmutt.ac.th on 2026-11-26. Not confirmed with any office, and no
 * agreement with the university stands behind any of it.
 */

import type { AreaKey } from './areas.ts';
import type { Localised } from './types.ts';

export interface CampusLink { label: Localised; url: string }

export interface CampusPhone {
  /** Digits only, for `tel:`. */
  dial: string;
  printed: string;
}

export interface BookableBuilding {
  id: string;
  name: Localised;
  /** That building's own page in the university's booking system. */
  url: string;
  /** Group rooms listed there on the day it was read. Omitted where not counted. */
  groupRooms?: number;
}

export interface RoomBooking {
  systemName: string;
  /** The system's front page. */
  url: string;
  buildings: readonly BookableBuilding[];
  /** The library's rules, which the app repeats before sending anybody there. */
  rules: {
    buildingId: string;
    lines: readonly Localised[];
    /** After this long without collecting the key the place is lost. */
    collectWithinMin: number;
    hoursPerDay: number;
    publishedOn: string;
    source: string;
  };
}

export type CampusServiceKey = 'sports' | 'clinic' | 'counselling' | 'books' | 'registrar' | 'dormitory' | 'it';

export interface CampusService {
  key: CampusServiceKey;
  title: Localised;
  about: Localised;
  link: CampusLink;
  phone?: CampusPhone;
  /** Health: never on Home, never in a notification, never counted. */
  private?: true;
  source: string;
}

export interface CampusServices {
  /** The day every page below was read. */
  readOn: string;
  /** Every link must be on this site. */
  site: string;
  rooms: RoomBooking;
  services: readonly CampusService[];
}

const table = (building: number): string => `https://booking.rmutt.ac.th/booking-table?b=${building}`;
const SERVICES_PAGE = 'https://www.rmutt.ac.th/service-rmutt/';

const RMUTT: CampusServices = {
  readOn: '2026-11-26',
  site: 'rmutt.ac.th',
  rooms: {
    systemName: 'Booking RMUTT',
    url: 'https://booking.rmutt.ac.th/',
    buildings: [
      { id: 'library', name: { en: 'Central Library', th: 'อาคารวิทยบริการ (หอสมุด)', zh: '中央图书馆' }, url: table(101), groupRooms: 15 },
      { id: 'b13', name: { en: '13-storey classroom building', th: 'อาคารเรียนรวมและปฏิบัติการ 13 ชั้น', zh: '13 层综合教学楼' }, url: table(102), groupRooms: 18 },
      { id: 'training', name: { en: 'Training Building', th: 'อาคารฝึกอบรม', zh: '培训楼' }, url: table(103) },
      { id: 'iwork', name: { en: 'I WORK', th: 'อาคาร I WORK', zh: 'I WORK 楼' }, url: table(104) },
      { id: 'ict', name: { en: 'ICT Building', th: 'อาคาร ICT', zh: 'ICT 楼' }, url: table(105) },
      { id: 'president', name: { en: 'Office of the President', th: 'อาคารสำนักงานอธิการบดี', zh: '校长办公楼' }, url: table(106) },
      { id: 'teched', name: { en: 'Technical Education', th: 'อาคารครุศาสตร์อุตสาหกรรม', zh: '工业教育楼' }, url: table(107) },
      { id: 'science', name: { en: 'Science Building', th: 'อาคารคณะวิทยาศาสตร์และเทคโนโลยี', zh: '理学楼' }, url: table(108) },
      { id: 'architecture', name: { en: 'Architecture Building', th: 'อาคารคณะสถาปัตยกรรมศาสตร์', zh: '建筑学院楼' }, url: table(111) },
      { id: 'engineering', name: { en: 'Engineering Centre', th: 'อาคารเรียนรวมคณะวิศวกรรมศาสตร์', zh: '工程综合楼' }, url: table(112) },
      { id: 'engineering9', name: { en: 'Engineering, 9 floors', th: 'อาคาร 9 ชั้น คณะวิศวกรรมศาสตร์', zh: '工程学院 9 层楼' }, url: table(113) },
      { id: 'computer', name: { en: 'Computer Engineering', th: 'ภาควิชาวิศวกรรมคอมพิวเตอร์', zh: '计算机工程系' }, url: table(114) },
      { id: 'gate3', name: { en: 'Amazon, gate 3', th: 'Amazon ประตู 3', zh: 'Amazon（3 号门）' }, url: table(115) },
      { id: 'masscom', name: { en: 'Mass Communication Technology', th: 'อาคารคณะเทคโนโลยีสื่อสารมวลชน', zh: '大众传播技术楼' }, url: table(118) },
    ],
    rules: {
      buildingId: 'library',
      lines: [
        { en: 'RMUTT students only.', th: 'เฉพาะนักศึกษา มทร.ธัญบุรี', zh: '仅限 RMUTT 学生。' },
        { en: 'Booking opens at 06:00 each day.', th: 'เปิดให้จองเวลา 06.00 น. ของทุกวัน', zh: '每天 06:00 开放预订。' },
        { en: 'Three hours a day each.', th: 'คนละ 3 ชั่วโมงต่อวัน', zh: '每人每天 3 小时。' },
        { en: 'Swap a student or ID card for the key, within 15 minutes or the room is given up.', th: 'ใช้บัตรนักศึกษาหรือบัตรประชาชนแลกกุญแจ ภายใน 15 นาที ไม่อย่างนั้นถือว่าสละสิทธิ์', zh: '须在 15 分钟内用学生证或身份证换取钥匙，否则视为放弃。' },
        { en: 'Not for anything that earns money.', th: 'ห้ามใช้เพื่อแสวงหาผลกำไร', zh: '不得用于营利。' },
      ],
      collectWithinMin: 15,
      hoursPerDay: 3,
      publishedOn: '2026-06-16',
      source: 'https://www.library.rmutt.ac.th/2026/06/rmutt-library-booking-room/',
    },
  },
  services: [
    {
      key: 'sports',
      title: { en: 'Sports and fitness', th: 'สนามกีฬา ฟิตเนส และสระ', zh: '体育与健身' },
      about: {
        en: 'Walk in. No booking system was found. Check the hours on the university page before you go.',
        th: 'เดินเข้าใช้ได้ ไม่พบระบบจองออนไลน์ ดูเวลาเปิดในหน้าของมหาวิทยาลัยก่อนไป',
        zh: '可直接前往，未发现在线预订系统。出发前请在校方页面查看开放时间。',
      },
      link: { label: { en: 'Hours and rules', th: 'เวลาและระเบียบ', zh: '时间与规定' }, url: 'https://hspd.rmutt.ac.th/stadium-services-rmutt/' },
      phone: { dial: '025493687', printed: '0 2549 3687' },
      source: 'https://hspd.rmutt.ac.th/stadium-services-rmutt/',
    },
    {
      key: 'clinic',
      title: { en: 'Clinic', th: 'ห้องพยาบาล', zh: '医务室' },
      about: {
        en: 'A doctor on weekdays and a nurse. See the hours on the university page.',
        th: 'มีแพทย์ในวันธรรมดา และพยาบาลวิชาชีพ ดูเวลาในหน้าของมหาวิทยาลัย',
        zh: '工作日有医生，并有护士。时间见校方页面。',
      },
      link: { label: { en: 'Clinic hours', th: 'เวลาทำการ', zh: '开放时间' }, url: SERVICES_PAGE },
      phone: { dial: '025494010', printed: '0 2549 4010' },
      private: true,
      source: SERVICES_PAGE,
    },
    {
      key: 'counselling',
      title: { en: 'Talk to a counsellor', th: 'ปรึกษานักจิตวิทยา', zh: '心理咨询' },
      about: {
        en: 'The university’s counselling service takes appointments. Its notice is from 2024, so call to check.',
        th: 'งานบริการให้คำปรึกษาของมหาวิทยาลัยรับนัด ประกาศนี้เป็นของปี 2567 โทรตรวจก่อน',
        zh: '校方心理咨询服务接受预约。公告为 2024 年，请先致电确认。',
      },
      link: { label: { en: 'The notice', th: 'ประกาศของมหาวิทยาลัย', zh: '校方公告' }, url: 'https://www.rmutt.ac.th/2024/02/20/consulting-services/' },
      phone: { dial: '025493024', printed: '0 2549 3024' },
      private: true,
      source: 'https://www.rmutt.ac.th/2024/02/20/consulting-services/',
    },
    {
      key: 'books',
      title: { en: 'Library books', th: 'จองและยืมหนังสือต่อ', zh: '图书预约与续借' },
      about: {
        en: 'Hold and renew in the library’s own catalogue.',
        th: 'จองและยืมต่อในระบบของหอสมุด',
        zh: '在图书馆自有系统中预约和续借。',
      },
      link: { label: { en: 'RMUTT Library', th: 'หอสมุด มทร.ธัญบุรี', zh: 'RMUTT 图书馆' }, url: 'https://www.library.rmutt.ac.th/' },
      source: 'https://www.library.rmutt.ac.th/2026/05/how-to-hold/',
    },
    {
      key: 'registrar',
      title: { en: 'Registrar', th: 'งานทะเบียน', zh: '注册处' },
      about: {
        en: 'Requests and academic documents.',
        th: 'คำร้องและเอกสารการศึกษา',
        zh: '申请与学业文件。',
      },
      link: { label: { en: 'Registrar’s site', th: 'เว็บงานทะเบียน', zh: '注册处网站' }, url: 'https://oreg.rmutt.ac.th/' },
      phone: { dial: '025493690', printed: '0 2549 3690' },
      source: 'https://www.rmutt.ac.th/faculty/',
    },
    {
      key: 'dormitory',
      title: { en: 'Dormitory', th: 'หอพักนักศึกษา', zh: '学生宿舍' },
      about: {
        en: 'No online booking was found. Ask the dormitory office.',
        th: 'ไม่พบระบบจองออนไลน์ ติดต่อสำนักงานหอพัก',
        zh: '未发现在线预订，请联系宿舍办公室。',
      },
      link: { label: { en: 'Dormitory page', th: 'หน้าหอพัก', zh: '宿舍页面' }, url: 'https://www.rmutt.ac.th/dormitory-within-the-university/' },
      phone: { dial: '025494897', printed: '0 2549 4897' },
      source: SERVICES_PAGE,
    },
    {
      key: 'it',
      title: { en: 'IT help and internet account', th: 'ไอที และรหัสอินเทอร์เน็ต', zh: 'IT 支持与上网账号' },
      about: {
        en: 'The account you book rooms with comes from here.',
        th: 'รหัสที่ใช้จองห้องขอได้ที่นี่',
        zh: '预订房间所用的账号在此办理。',
      },
      link: { label: { en: 'ARIT', th: 'สำนักวิทยบริการฯ (สวส.)', zh: 'ARIT' }, url: 'https://www.arit.rmutt.ac.th/' },
      phone: { dial: '025493074', printed: '0 2549 3074' },
      source: SERVICES_PAGE,
    },
  ],
};

const CAMPUS_SERVICES: Readonly<Partial<Record<AreaKey, CampusServices>>> = { rmutt: RMUTT };

/** What a campus runs, or null where nobody has read its pages. */
export const campusServicesFor = (area: AreaKey): CampusServices | null => CAMPUS_SERVICES[area] ?? null;

/** https, on the university's own site. Checked again before a tap opens anything. */
export function isCampusLink(services: CampusServices, url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.username === '' && u.password === ''
      && (u.hostname === services.site || u.hostname.endsWith(`.${services.site}`));
  } catch {
    return false;
  }
}
