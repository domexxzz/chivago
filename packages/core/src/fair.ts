/**
 * A fair's market, lot by lot (docs/66): which stall is in which lot, found by
 * typing, and shown on the campus map.
 *
 * A fair's plan is rows of numbered lots - A01, A02, ... along an aisle - so
 * that is how one is written down here: each row by where its first lot is,
 * which way it runs and how far apart the lots are. The stalls are a list of
 * lot codes with who is in them. When the organiser's plan arrives it is
 * typed in the same shape; nothing is placed by hand on a map.
 *
 * Like PLACE_STALLS this is static data, bundled with the app: no migration,
 * no API, and the seed stays the one source of places. A fair is NOT a place -
 * its lots never appear in /places, the area scores or Home's place cards.
 *
 * Until the organiser's plan is in, a fair is marked `example`, and every
 * screen that shows it says so. Its stalls are generic descriptions of what a
 * fair like this sells, not real businesses.
 */

import type { AreaKey } from './areas.ts';
import type { Bilingual } from './types.ts';

export interface FairZone {
  /** The letter the zone's lot codes start with. */
  code: string;
  name: Bilingual;
  /** A picture for the zone, so a list of lots reads at a glance. */
  icon: string;
}

/** One row of lots along an aisle: A01 at `start`, A02 `spacingM` further along `bearingDeg`, and so on. */
export interface FairRow {
  zone: string;
  start: { lat: number; lng: number };
  /** The direction the row runs, in degrees clockwise from north. */
  bearingDeg: number;
  count: number;
  spacingM: number;
  /** The number of the row's first lot. 1 unless a zone's lots continue in a second row. */
  firstNumber?: number;
}

export interface FairStall {
  /** The lot code, as printed on the plan: zone letter and two digits. */
  lot: string;
  name: string;
  /** What they sell, in the words people type to look for it. */
  sells: string;
  /** Takes orders ahead in สั่งก่อน: the shop's slug there. */
  orderSlug?: string;
}

export interface Fair {
  id: string;
  name: Bilingual;
  area: AreaKey;
  venue: Bilingual;
  /** "1–9 Feb 2027" as the organiser announces it, or null until they have. */
  dates: Bilingual | null;
  /** Not the organiser's plan yet: the lots and stalls show how it works, and say so. */
  example: boolean;
  zones: FairZone[];
  rows: FairRow[];
  stalls: FairStall[];
}

export interface FairLot {
  code: string;
  zone: FairZone;
  lat: number;
  lng: number;
  /** Who is in the lot, or null when it is free. */
  stall: FairStall | null;
}

const EARTH_M_PER_DEG = 111_320;

/** A point `metres` from `from` in the direction `bearingDeg`. Flat earth: a fair is a hundred metres across. */
export function stepFrom(from: { lat: number; lng: number }, bearingDeg: number, metres: number): { lat: number; lng: number } {
  const b = (bearingDeg * Math.PI) / 180;
  const dLat = (metres * Math.cos(b)) / EARTH_M_PER_DEG;
  const dLng = (metres * Math.sin(b)) / (EARTH_M_PER_DEG * Math.cos((from.lat * Math.PI) / 180));
  return { lat: from.lat + dLat, lng: from.lng + dLng };
}

const lotCode = (zone: string, n: number): string => `${zone}${String(n).padStart(2, '0')}`;

/** Every lot of a fair, in plan order, each with its stall or none. */
export function fairLots(fair: Fair): FairLot[] {
  const stallAt = new Map(fair.stalls.map((s) => [s.lot, s]));
  const lots: FairLot[] = [];
  for (const row of fair.rows) {
    const zone = fair.zones.find((z) => z.code === row.zone);
    if (!zone) continue;
    for (let i = 0; i < row.count; i++) {
      const code = lotCode(row.zone, (row.firstNumber ?? 1) + i);
      const at = stepFrom(row.start, row.bearingDeg, i * row.spacingM);
      lots.push({ code, zone, lat: at.lat, lng: at.lng, stall: stallAt.get(code) ?? null });
    }
  }
  return lots;
}

/**
 * What a search compares: lower case, and without the spaces, dashes and
 * zero-width marks people type or paste differently - "a 12", "A-12" and
 * "A12" are one lot, and "ทุเรียน" with a stray space is still durian.
 */
export const fold = (text: string): string =>
  text.normalize('NFC').toLowerCase().replace(/[\s​-‍⁠﻿\-_.·,/]+/g, '');

/** A query that is a lot code, or the start of one: a letter and up to two digits. */
const CODE_LIKE = /^[a-z]\d{0,2}$/;

/**
 * The lots that match what was typed, best first.
 *
 * Every word must match somewhere. A lot code typed whole comes first, then
 * codes that start with it, then a stall whose name starts with the word,
 * whose name has it, what it sells, and last the zone. An empty search is
 * every occupied lot in plan order - the directory, not nothing.
 */
export function searchFair(lots: readonly FairLot[], query: string): FairLot[] {
  // "a 05" is one lot code typed with a space, not the words "a" and "05".
  const whole = fold(query);
  const words = CODE_LIKE.test(whole) ? [whole] : query.split(/\s+/).map(fold).filter(Boolean);
  if (!words.length) return lots.filter((l) => l.stall);
  const scored: { lot: FairLot; score: number; i: number }[] = [];
  lots.forEach((lot, i) => {
    const code = fold(lot.code);
    const name = lot.stall ? fold(lot.stall.name) : '';
    const sells = lot.stall ? fold(lot.stall.sells) : '';
    const zone = fold(lot.zone.name.th) + fold(lot.zone.name.en);
    let total = 0;
    for (const w of words) {
      let s = 0;
      // "a5" is how people say A05.
      const padded = /^[a-z]\d$/.test(w) ? `${w[0]}0${w[1]}` : null;
      if (code === w || code === padded) s = 100;
      else if (CODE_LIKE.test(w) && code.startsWith(w)) s = 80;
      else if (name.startsWith(w)) s = 70;
      else if (name.includes(w)) s = 60;
      else if (sells.includes(w)) s = 50;
      else if (zone.includes(w)) s = 30;
      if (s === 0) return;
      total += s;
    }
    // A free lot is found by its code and nothing else: there is nobody in it to match.
    if (!lot.stall && total < 80 * words.length) return;
    scored.push({ lot, score: total, i });
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map((x) => x.lot);
}

/** The fairs on in an area. */
export const fairsIn = (area: AreaKey): Fair[] => FAIRS.filter((f) => f.area === area);

/** A fair by id; Object.hasOwn-safe because it searches a list. */
export const fairById = (id: string): Fair | null => FAIRS.find((f) => f.id === id) ?? null;

/**
 * The stall's order page in สั่งก่อน. Built from the slug the plan names, the
 * same way the food court's are (stalls.ts) - never a link from elsewhere.
 */
export const fairOrderUrl = (slug: string): string => `https://sangkon.fly.dev/s/${slug}`;

/*
  RMUTT's agricultural fair - EXAMPLE PLAN.

  No plan has been published, so this is a stand-in that shows how the
  directory works: four zones of ten lots in rows on the south sports field
  (OpenStreetMap way 547540105, centre 14.03194, 100.72414), lots ten metres
  apart, aisles fourteen. The stalls are generic descriptions of what an
  agricultural fair sells, not businesses. Replace `rows` and `stalls` with
  the organiser's plan and set `example: false`.
*/
const FIELD = { lat: 14.03194, lng: 100.72414 };
const ROW_GAP_M = 14;
const LOT_M = 10;
const EAST = 90;
/** The first lot of each row: rows run west to east, stacked north to south, centred on the field. */
const rowStart = (k: number) => stepFrom(stepFrom(FIELD, 0, (1.5 - k) * ROW_GAP_M), 270, 4.5 * LOT_M);

const RMUTT_AGRI_FAIR: Fair = {
  id: 'rmutt-agri-fair',
  name: { en: 'RMUTT agricultural fair', th: 'งานเกษตรแฟร์ มทร.ธัญบุรี' },
  area: 'rmutt',
  venue: { en: 'South sports field', th: 'สนามกีฬาฝั่งใต้' },
  dates: null,
  example: true,
  zones: [
    { code: 'A', name: { en: 'Plants and seedlings', th: 'ต้นไม้และกล้าไม้' }, icon: '🌱' },
    { code: 'B', name: { en: 'Farm produce', th: 'ผลผลิตการเกษตร' }, icon: '🥭' },
    { code: 'C', name: { en: 'Food and drinks', th: 'อาหารและเครื่องดื่ม' }, icon: '🍢' },
    { code: 'D', name: { en: 'Crafts and farm goods', th: 'ของแปรรูปและงานฝีมือ' }, icon: '🧺' },
  ],
  rows: ['A', 'B', 'C', 'D'].map((zone, k) => ({ zone, start: rowStart(k), bearingDeg: EAST, count: 10, spacingM: LOT_M })),
  stalls: [
    { lot: 'A01', name: 'กล้าไม้ผล', sells: 'กล้าทุเรียน กล้ามะม่วง ขนุน มะพร้าวน้ำหอม' },
    { lot: 'A02', name: 'ไม้ด่างและไม้ใบ', sells: 'มอนสเตอร่า ฟิโลเดนดรอน ไม้ด่าง' },
    { lot: 'A03', name: 'แคคตัสและไม้อวบน้ำ', sells: 'แคคตัส กุหลาบหิน ไม้อวบน้ำ' },
    { lot: 'A04', name: 'กล้วยไม้', sells: 'กล้วยไม้ หวาย แวนด้า' },
    { lot: 'A05', name: 'ปุ๋ยและดินปลูก', sells: 'ปุ๋ยอินทรีย์ ปุ๋ยหมัก ดินผสม ขุยมะพร้าว' },
    { lot: 'A07', name: 'ไม้ประดับในบ้าน', sells: 'ลิ้นมังกร พลูด่าง ไม้ฟอกอากาศ' },
    { lot: 'A08', name: 'เมล็ดพันธุ์ผักสวนครัว', sells: 'เมล็ดผัก พริก กะเพรา โหระพา ผักบุ้ง' },
    { lot: 'A09', name: 'บอนไซ', sells: 'บอนไซ ไม้แคระ' },
    { lot: 'A10', name: 'กระถางและอุปกรณ์ปลูก', sells: 'กระถางดินเผา บัวรดน้ำ ช้อนปลูก' },
    { lot: 'B01', name: 'ผลไม้ตามฤดูกาล', sells: 'มะม่วง ส้มโอ ฝรั่ง ชมพู่' },
    { lot: 'B02', name: 'ผักปลอดสาร', sells: 'ผักสลัด คะน้า ผักบุ้ง กวางตุ้ง' },
    { lot: 'B03', name: 'ข้าวและธัญพืช', sells: 'ข้าวหอมมะลิ ข้าวไรซ์เบอร์รี่ ข้าวกล้อง' },
    { lot: 'B04', name: 'น้ำผึ้งชันโรง', sells: 'น้ำผึ้ง เกสรผึ้ง' },
    { lot: 'B05', name: 'ไข่ไก่สด', sells: 'ไข่ไก่ ไข่เป็ด ไข่เค็ม' },
    { lot: 'B06', name: 'เห็ดสด', sells: 'เห็ดนางฟ้า เห็ดหูหนู เห็ดฟาง' },
    { lot: 'B08', name: 'ผลผลิตจากฟาร์มนักศึกษา', sells: 'ผักและผลไม้จากแปลงทดลอง' },
    { lot: 'B09', name: 'กล้วยและมะพร้าว', sells: 'กล้วยหอม กล้วยน้ำว้า มะพร้าวน้ำหอม' },
    { lot: 'B10', name: 'สมุนไพรสด', sells: 'ขมิ้น ตะไคร้ ข่า ฟ้าทะลายโจร' },
    { lot: 'C01', name: 'ไก่ย่างส้มตำ', sells: 'ไก่ย่าง ส้มตำ ข้าวเหนียว' },
    { lot: 'C02', name: 'ลูกชิ้นปิ้ง', sells: 'ลูกชิ้น ไส้กรอก หมูปิ้ง' },
    { lot: 'C03', name: 'ข้าวเหนียวมะม่วง', sells: 'ข้าวเหนียวมะม่วง ข้าวเหนียวมูน' },
    { lot: 'C04', name: 'น้ำผลไม้ปั่น', sells: 'น้ำมะม่วงปั่น น้ำแตงโมปั่น สมูทตี้' },
    { lot: 'C05', name: 'กาแฟสด', sells: 'กาแฟ ชาไทย โกโก้' },
    { lot: 'C06', name: 'ขนมไทย', sells: 'ขนมชั้น ทองหยิบ ขนมเปียกปูน' },
    { lot: 'C07', name: 'ไอศกรีมกะทิ', sells: 'ไอศกรีมกะทิ ไอติมมะพร้าว' },
    { lot: 'C09', name: 'บะหมี่หน้าหอ (ร้านตัวอย่าง)', sells: 'มาม่า บะหมี่ ยำมาม่า', orderSlug: 'demo' },
    { lot: 'C10', name: 'น้ำแข็งใส', sells: 'น้ำแข็งใส ทับทิมกรอบ' },
    { lot: 'D01', name: 'สบู่และสมุนไพรแปรรูป', sells: 'สบู่สมุนไพร ยาหม่อง ลูกประคบ' },
    { lot: 'D02', name: 'ผ้าทอและผ้ามัดย้อม', sells: 'ผ้าทอมือ ผ้ามัดย้อม กระเป๋าผ้า' },
    { lot: 'D03', name: 'เครื่องจักสาน', sells: 'ตะกร้าไม้ไผ่ กระด้ง หมวกสาน' },
    { lot: 'D04', name: 'ผลไม้แปรรูป', sells: 'แยมมะม่วง กล้วยตาก มะม่วงอบแห้ง' },
    { lot: 'D05', name: 'น้ำพริกและเครื่องแกง', sells: 'น้ำพริกเผา น้ำพริกตาแดง พริกแกง' },
    { lot: 'D06', name: 'อุปกรณ์การเกษตร', sells: 'จอบ เสียม กรรไกรตัดกิ่ง สายยาง' },
    { lot: 'D08', name: 'สินค้าชุมชน', sells: 'ของฝาก ผลิตภัณฑ์ชุมชน' },
    { lot: 'D09', name: 'ผลิตภัณฑ์จากนม', sells: 'นมสด โยเกิร์ต ชีส' },
  ],
};

export const FAIRS: readonly Fair[] = [RMUTT_AGRI_FAIR];
