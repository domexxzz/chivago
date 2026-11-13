import type { Bilingual } from '@chivago/core';

export interface SichangPilotBrief {
  code: `SG-0${1 | 2 | 3 | 4 | 5}`;
  summary: Bilingual;
  requirements: Bilingual[];
  note?: Bilingual;
}

/**
 * User-facing pilot criteria transcribed from the signed-off Thai pilot pack.
 *
 * These sit above the server-owned quest workflow as the evidence checklist.
 * GPS arrival and proof submission are checked by the API; the Koh Sichang
 * host reviews the submitted evidence against these criteria before EXP is
 * released. This keeps criteria visible without trusting a client-side tick.
 */
export const SICHANG_PILOT_BRIEFS: Record<string, SichangPilotBrief> = {
  'SG-01': {
    code: 'SG-01',
    summary: {
      en: 'Explore island stories through three places and a six-question quiz.',
      th: 'สำรวจเรื่องราวของเกาะผ่าน 3 จุด และตอบแบบทดสอบ 6 ข้อ',
      zh: '通过三个地点与六道题探索岛屿故事。',
    },
    requirements: [
      { en: 'Check in at 3 designated points', th: 'เช็กอินให้ครบ 3 จุดที่กำหนด', zh: '在 3 个指定地点签到' },
      { en: 'Answer at least 5 of 6 questions correctly', th: 'ตอบถูกอย่างน้อย 5 จาก 6 ข้อ', zh: '6 题中至少答对 5 题' },
    ],
  },
  'SG-02': {
    code: 'SG-02',
    summary: {
      en: 'Discover Koh Sichang flavours through a five-question food challenge.',
      th: 'ตามหารสชาติสีชังผ่านโจทย์อาหาร 5 ข้อ',
      zh: '通过五道美食题发现锡昌岛风味。',
    },
    requirements: [
      { en: 'Answer at least 4 of 5 questions correctly', th: 'ตอบถูกอย่างน้อย 4 จาก 5 ข้อ', zh: '5 题中至少答对 4 题' },
      { en: 'Verify one purchase', th: 'ยืนยันการซื้ออย่างน้อย 1 รายการ', zh: '核验至少 1 笔购买' },
    ],
  },
  'SG-03': {
    code: 'SG-03',
    summary: {
      en: 'Join a supervised island clean-up and submit verified participation.',
      th: 'ร่วมกิจกรรมเก็บขยะที่มีผู้ดูแล และยืนยันการเข้าร่วม',
      zh: '参加有监督的岛屿清洁活动并提交核验。',
    },
    requirements: [
      { en: 'Join a scheduled, supervised clean-up', th: 'เข้าร่วมกิจกรรมเก็บขยะตามรอบที่มีผู้ดูแล', zh: '参加按时段进行且有人监督的清洁活动' },
      { en: 'Have participation verified by the activity team', th: 'ให้ทีมกิจกรรมยืนยันการเข้าร่วม', zh: '由活动团队核验参与情况' },
    ],
    note: {
      en: 'The 0.5 kg and 2-category figures are pilot targets, not mandatory XP conditions.',
      th: 'ตัวเลข 0.5 กก. และ 2 ประเภทเป็นเป้าหมายทดลอง ไม่ใช่เงื่อนไขบังคับในการรับ EXP',
      zh: '0.5 公斤和 2 个类别是试点目标，并非获得 EXP 的强制条件。',
    },
  },
  'SG-04': {
    code: 'SG-04',
    summary: {
      en: 'Visit local shops and learn the stories behind Koh Sichang products.',
      th: 'เยี่ยมร้านท้องถิ่นและเรียนรู้เรื่องราวของดีเกาะสีชัง',
      zh: '走访本地商店，了解锡昌岛好物背后的故事。',
    },
    requirements: [
      { en: 'Visit 2 participating shops', th: 'เยี่ยมร้านที่ร่วมรายการ 2 ร้าน', zh: '走访 2 家参与商店' },
      { en: 'Answer both questions correctly', th: 'ตอบคำถามถูก 2 จาก 2 ข้อ', zh: '2 题全部答对' },
      { en: 'Verify one purchase', th: 'ยืนยันการซื้ออย่างน้อย 1 รายการ', zh: '核验至少 1 笔购买' },
    ],
  },
  'SG-05': {
    code: 'SG-05',
    summary: {
      en: 'Complete a verified low-impact island route and a two-question check.',
      th: 'เดินทางตามเส้นทางเที่ยวเกาะอย่างใส่ใจที่ตรวจสอบแล้ว พร้อมตอบคำถาม 2 ข้อ',
      zh: '完成已核验的低影响环岛路线，并完成两道题。',
    },
    requirements: [
      { en: 'Complete 1 verified route', th: 'ทำเส้นทางที่ตรวจสอบแล้วให้ครบ 1 เส้นทาง', zh: '完成 1 条已核验路线' },
      { en: 'Answer both questions correctly', th: 'ตอบคำถามถูก 2 จาก 2 ข้อ', zh: '2 题全部答对' },
    ],
    note: {
      en: 'The route must be checked before this pilot can open.',
      th: 'ต้องตรวจสอบเส้นทางก่อนจึงจะเปิดทดลองเควสนี้ได้',
      zh: '路线须先完成核验，方可开放此试点任务。',
    },
  },
};

export function sichangPilotBrief(code: string): SichangPilotBrief | null {
  return SICHANG_PILOT_BRIEFS[code.toUpperCase()] ?? null;
}
