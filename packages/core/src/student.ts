/**
 * A faculty and a year, if somebody chooses to say.
 *
 * A university asks "did engineering turn up, or only arts". Answering needs a
 * faculty and a year and nothing else, so that is all this is.
 *
 * WHAT THIS REFUSES.
 *
 *   NO STUDENT NUMBER. Nothing here can confirm one, and an unconfirmed number
 *   is personal data kept for no reason. Proof of being a student arrives with
 *   the university's own sign-in, if it ever does.
 *
 *   SELF-DECLARED, AND SAID TO BE. No page calls this verified.
 *
 *   NEVER A PERSON. It is read as bands of five, over activities that are over,
 *   and only once twenty people have taken part. A faculty with fewer than five
 *   is not named at all: it is folded into "others", never alone, so it cannot
 *   be worked out from a total or by watching the page while somebody joins
 *   (`facultyBands`).
 *
 *   NOBODY HAS TO. Every activity works without it, and it can be taken back.
 */

import type { AreaKey } from './areas.ts';
import type { Localised } from './types.ts';

/** Bump when the words somebody agrees to change. */
export const STUDENT_CONSENT_VERSION = 'student-1';

export const STUDENT_CONSENT: Localised = {
  en: 'I agree that ChivarGo keeps my faculty and year, and shows organisers roughly how many people from each faculty took part. Groups under five are not named. I can remove this at any time.',
  th: 'ยินยอมให้ ChivarGo เก็บคณะและชั้นปี และแสดงให้ผู้จัดเห็นจำนวนผู้เข้าร่วมโดยประมาณของแต่ละคณะ กลุ่มที่น้อยกว่าห้าคนจะไม่ระบุชื่อคณะ ลบออกได้ทุกเมื่อ',
  zh: '我同意 ChivarGo 保存我的院系和年级，并仅向主办方显示各院系的大致参与人数。少于五人的院系不予列出。我可随时删除。',
};

export interface Faculty { key: string; name: Localised }

/** As listed on https://www.rmutt.ac.th/faculty/, read 2026-11-26. */
const RMUTT_FACULTIES: readonly Faculty[] = [
  { key: 'engineering', name: { en: 'Engineering', th: 'วิศวกรรมศาสตร์', zh: '工程学院' } },
  { key: 'business', name: { en: 'Business Administration', th: 'บริหารธุรกิจ', zh: '工商管理学院' } },
  { key: 'home-economics', name: { en: 'Home Economics Technology', th: 'เทคโนโลยีคหกรรมศาสตร์', zh: '家政技术学院' } },
  { key: 'fine-arts', name: { en: 'Fine and Applied Arts', th: 'ศิลปกรรมศาสตร์', zh: '美术与应用艺术学院' } },
  { key: 'agriculture', name: { en: 'Agricultural Technology', th: 'เทคโนโลยีการเกษตร', zh: '农业技术学院' } },
  { key: 'technical-education', name: { en: 'Technical Education', th: 'ครุศาสตร์อุตสาหกรรม', zh: '工业教育学院' } },
  { key: 'architecture', name: { en: 'Architecture', th: 'สถาปัตยกรรมศาสตร์', zh: '建筑学院' } },
  { key: 'science', name: { en: 'Science and Technology', th: 'วิทยาศาสตร์และเทคโนโลยี', zh: '理工学院' } },
  { key: 'mass-communication', name: { en: 'Mass Communication Technology', th: 'เทคโนโลยีสื่อสารมวลชน', zh: '大众传播技术学院' } },
  { key: 'liberal-arts', name: { en: 'Liberal Arts', th: 'ศิลปศาสตร์', zh: '文学院' } },
  { key: 'integrative-medicine', name: { en: 'Integrative Medicine', th: 'การแพทย์บูรณาการ', zh: '整合医学院' } },
  { key: 'nursing', name: { en: 'Nursing', th: 'พยาบาลศาสตร์', zh: '护理学院' } },
];

const FACULTIES: Readonly<Partial<Record<AreaKey, readonly Faculty[]>>> = { rmutt: RMUTT_FACULTIES };

export const facultiesOf = (university: AreaKey): readonly Faculty[] =>
  (Object.hasOwn(FACULTIES, university) ? FACULTIES[university]! : []);

export const facultyName = (university: AreaKey, key: string): Localised | null =>
  facultiesOf(university).find((f) => f.key === key)?.name ?? null;

export const STUDENT_YEARS = ['1', '2', '3', '4', '5+', 'graduate'] as const;
export type StudentYear = (typeof STUDENT_YEARS)[number];

export const STUDENT_YEAR_LABEL: Record<StudentYear, Localised> = {
  1: { en: 'Year 1', th: 'ปี 1', zh: '一年级' },
  2: { en: 'Year 2', th: 'ปี 2', zh: '二年级' },
  3: { en: 'Year 3', th: 'ปี 3', zh: '三年级' },
  4: { en: 'Year 4', th: 'ปี 4', zh: '四年级' },
  '5+': { en: 'Year 5 or above', th: 'ปี 5 ขึ้นไป', zh: '五年级及以上' },
  graduate: { en: 'Graduate', th: 'บัณฑิตศึกษา', zh: '研究生' },
};

export interface StudentProfile {
  university: AreaKey;
  faculty: string;
  year: StudentYear;
}

export function isStudentProfile(v: unknown): v is StudentProfile {
  if (!v || typeof v !== 'object') return false;
  const s = v as Partial<Record<keyof StudentProfile, unknown>>;
  return typeof s.university === 'string'
    && facultiesOf(s.university as AreaKey).some((f) => f.key === s.faculty)
    && (STUDENT_YEARS as readonly unknown[]).includes(s.year);
}

/** Fewer than this and a count is about people rather than a group. */
export const SMALLEST_GROUP = 5;
/** Fewer people than this in all, and nothing is shown. */
export const SMALLEST_AUDIENCE = 20;

export interface GroupCount { key: string; count: number }

export interface FacultyBand { key: string; from: number; to: number }

export interface FacultyBands {
  bands: FacultyBand[];
  /** Whether some people are in none of the bands. Never how many, never whose. */
  others: boolean;
}

/**
 * Groups as bands of five, or null while there are too few people to show any.
 *
 * A single group left out could be recovered by subtracting the others from a
 * total printed elsewhere, so one is never folded away alone.
 */
export function facultyBands(groups: readonly GroupCount[]): FacultyBands | null {
  const present = groups.filter((g) => g.count > 0);
  if (present.reduce((sum, g) => sum + g.count, 0) < SMALLEST_AUDIENCE) return null;
  const folded = new Set(present.filter((g) => g.count < SMALLEST_GROUP).map((g) => g.key));
  if (folded.size === 1) {
    const next = present.filter((g) => !folded.has(g.key)).sort((a, b) => a.count - b.count)[0];
    if (next) folded.add(next.key);
  }
  return {
    bands: present.filter((g) => !folded.has(g.key)).map((g) => {
      const from = Math.floor(g.count / SMALLEST_GROUP) * SMALLEST_GROUP;
      return { key: g.key, from, to: from + SMALLEST_GROUP - 1 };
    }),
    others: folded.size > 0,
  };
}
