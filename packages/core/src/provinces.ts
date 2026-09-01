/**
 * Thailand, all 77 of it — and an honest answer for the 75 we have not opened.
 *
 * The passport in the design shows province stamps and says "เก็บให้ครบทั่วไทย".
 * That promise only works if the whole country is really in the data model: a
 * grid of five provinces with a "coming soon" banner is a mock, and a traveller
 * from Nong Khai finds out in one tap.
 *
 * So every province is here, correctly named and correctly placed in its
 * region, and each one carries its own status. Two are OPEN, because two are
 * all we have real places, real metrics and real photographs for. The rest are
 * listed, findable, and explicitly not yet open — which is a different thing
 * from being absent, and a very different thing from being faked.
 *
 * WHY THIS IS NOT A `Record<string, unknown>` OF 77 GUESSES. The seed for a
 * single island took a day and still has one place without a photograph.
 * Multiply that by 77 and the honest unit of work is not "add a province", it
 * is "find someone who lives there". The status field exists so the app can
 * say that out loud instead of quietly showing an empty province page.
 */

export type RegionKey = 'north' | 'northeast' | 'central' | 'east' | 'west' | 'south';

export interface Region {
  key: RegionKey;
  name: { en: string; th: string };
}

export const REGIONS: Region[] = [
  { key: 'north', name: { en: 'Northern', th: 'ภาคเหนือ' } },
  { key: 'northeast', name: { en: 'Northeastern', th: 'ภาคตะวันออกเฉียงเหนือ' } },
  { key: 'central', name: { en: 'Central', th: 'ภาคกลาง' } },
  { key: 'east', name: { en: 'Eastern', th: 'ภาคตะวันออก' } },
  { key: 'west', name: { en: 'Western', th: 'ภาคตะวันตก' } },
  { key: 'south', name: { en: 'Southern', th: 'ภาคใต้' } },
];

/**
 * `open` means a traveller can arrive and the app has something true to say:
 * real places, measured metrics, a licensed photograph, a host who can verify.
 *
 * `listed` means the province exists, is searchable, and has none of that yet.
 * It is the honest state for 75 of them, and the app must never render it as
 * an empty version of `open`.
 */
export type ProvinceStatus = 'open' | 'listed';

export interface Province {
  /** ISO 3166-2:TH subdivision code, so this joins to outside data later. */
  code: string;
  name: { en: string; th: string };
  region: RegionKey;
  status: ProvinceStatus;
}

/**
 * The list, by region.
 *
 * Six regions and 77 provinces is the standard classification used by the
 * Ministry of Interior; Bangkok sits in Central. The count is asserted by a
 * test rather than trusted, because a country list that quietly loses a
 * province is wrong in a way nobody notices until somebody from there looks.
 */
const P = (code: string, en: string, th: string, region: RegionKey, status: ProvinceStatus = 'listed'): Province =>
  ({ code, name: { en, th }, region, status });

export const PROVINCES: Province[] = [
  // ---- ภาคเหนือ · 9 -------------------------------------------------------
  P('TH-50', 'Chiang Mai', 'เชียงใหม่', 'north'),
  P('TH-57', 'Chiang Rai', 'เชียงราย', 'north'),
  P('TH-52', 'Lampang', 'ลำปาง', 'north'),
  P('TH-51', 'Lamphun', 'ลำพูน', 'north'),
  P('TH-58', 'Mae Hong Son', 'แม่ฮ่องสอน', 'north'),
  P('TH-55', 'Nan', 'น่าน', 'north'),
  P('TH-56', 'Phayao', 'พะเยา', 'north'),
  P('TH-54', 'Phrae', 'แพร่', 'north'),
  P('TH-53', 'Uttaradit', 'อุตรดิตถ์', 'north'),

  // ---- ภาคตะวันออกเฉียงเหนือ · 20 -----------------------------------------
  P('TH-46', 'Kalasin', 'กาฬสินธุ์', 'northeast'),
  P('TH-40', 'Khon Kaen', 'ขอนแก่น', 'northeast'),
  P('TH-36', 'Chaiyaphum', 'ชัยภูมิ', 'northeast'),
  P('TH-48', 'Nakhon Phanom', 'นครพนม', 'northeast'),
  P('TH-30', 'Nakhon Ratchasima', 'นครราชสีมา', 'northeast'),
  P('TH-38', 'Bueng Kan', 'บึงกาฬ', 'northeast'),
  P('TH-31', 'Buri Ram', 'บุรีรัมย์', 'northeast'),
  P('TH-44', 'Maha Sarakham', 'มหาสารคาม', 'northeast'),
  P('TH-49', 'Mukdahan', 'มุกดาหาร', 'northeast'),
  P('TH-35', 'Yasothon', 'ยโสธร', 'northeast'),
  P('TH-45', 'Roi Et', 'ร้อยเอ็ด', 'northeast'),
  P('TH-42', 'Loei', 'เลย', 'northeast'),
  P('TH-33', 'Si Sa Ket', 'ศรีสะเกษ', 'northeast'),
  P('TH-47', 'Sakon Nakhon', 'สกลนคร', 'northeast'),
  P('TH-32', 'Surin', 'สุรินทร์', 'northeast'),
  P('TH-43', 'Nong Khai', 'หนองคาย', 'northeast'),
  P('TH-39', 'Nong Bua Lam Phu', 'หนองบัวลำภู', 'northeast'),
  P('TH-41', 'Udon Thani', 'อุดรธานี', 'northeast'),
  P('TH-34', 'Ubon Ratchathani', 'อุบลราชธานี', 'northeast'),
  P('TH-37', 'Amnat Charoen', 'อำนาจเจริญ', 'northeast'),

  // ---- ภาคกลาง · 22 (รวมกรุงเทพมหานคร) ------------------------------------
  P('TH-10', 'Bangkok', 'กรุงเทพมหานคร', 'central'),
  P('TH-62', 'Kamphaeng Phet', 'กำแพงเพชร', 'central'),
  P('TH-18', 'Chai Nat', 'ชัยนาท', 'central'),
  P('TH-26', 'Nakhon Nayok', 'นครนายก', 'central'),
  P('TH-73', 'Nakhon Pathom', 'นครปฐม', 'central'),
  P('TH-60', 'Nakhon Sawan', 'นครสวรรค์', 'central'),
  P('TH-12', 'Nonthaburi', 'นนทบุรี', 'central'),
  P('TH-13', 'Pathum Thani', 'ปทุมธานี', 'central'),
  P('TH-14', 'Phra Nakhon Si Ayutthaya', 'พระนครศรีอยุธยา', 'central'),
  P('TH-66', 'Phichit', 'พิจิตร', 'central'),
  P('TH-65', 'Phitsanulok', 'พิษณุโลก', 'central'),
  P('TH-67', 'Phetchabun', 'เพชรบูรณ์', 'central'),
  P('TH-16', 'Lop Buri', 'ลพบุรี', 'central'),
  P('TH-11', 'Samut Prakan', 'สมุทรปราการ', 'central'),
  P('TH-75', 'Samut Songkhram', 'สมุทรสงคราม', 'central'),
  P('TH-74', 'Samut Sakhon', 'สมุทรสาคร', 'central'),
  P('TH-17', 'Sing Buri', 'สิงห์บุรี', 'central'),
  P('TH-64', 'Sukhothai', 'สุโขทัย', 'central'),
  P('TH-72', 'Suphan Buri', 'สุพรรณบุรี', 'central'),
  P('TH-19', 'Saraburi', 'สระบุรี', 'central'),
  P('TH-15', 'Ang Thong', 'อ่างทอง', 'central'),
  P('TH-61', 'Uthai Thani', 'อุทัยธานี', 'central'),

  // ---- ภาคตะวันออก · 7 ----------------------------------------------------
  P('TH-22', 'Chanthaburi', 'จันทบุรี', 'east'),
  P('TH-24', 'Chachoengsao', 'ฉะเชิงเทรา', 'east'),
  // Open: Bang Saen and Pattaya are in the design's own example, and it is the
  // province most Thai travellers can check us on from memory.
  P('TH-20', 'Chon Buri', 'ชลบุรี', 'east', 'open'),
  P('TH-23', 'Trat', 'ตราด', 'east'),
  P('TH-25', 'Prachin Buri', 'ปราจีนบุรี', 'east'),
  P('TH-21', 'Rayong', 'ระยอง', 'east'),
  P('TH-27', 'Sa Kaeo', 'สระแก้ว', 'east'),

  // ---- ภาคตะวันตก · 5 -----------------------------------------------------
  P('TH-71', 'Kanchanaburi', 'กาญจนบุรี', 'west'),
  P('TH-63', 'Tak', 'ตาก', 'west'),
  P('TH-77', 'Prachuap Khiri Khan', 'ประจวบคีรีขันธ์', 'west'),
  P('TH-76', 'Phetchaburi', 'เพชรบุรี', 'west'),
  P('TH-70', 'Ratchaburi', 'ราชบุรี', 'west'),

  // ---- ภาคใต้ · 14 --------------------------------------------------------
  P('TH-81', 'Krabi', 'กระบี่', 'south'),
  P('TH-86', 'Chumphon', 'ชุมพร', 'south'),
  P('TH-92', 'Trang', 'ตรัง', 'south'),
  P('TH-80', 'Nakhon Si Thammarat', 'นครศรีธรรมราช', 'south'),
  P('TH-96', 'Narathiwat', 'นราธิวาส', 'south'),
  P('TH-82', 'Phangnga', 'พังงา', 'south'),
  P('TH-93', 'Phatthalung', 'พัทลุง', 'south'),
  P('TH-83', 'Phuket', 'ภูเก็ต', 'south'),
  P('TH-95', 'Yala', 'ยะลา', 'south'),
  P('TH-85', 'Ranong', 'ระนอง', 'south'),
  P('TH-90', 'Songkhla', 'สงขลา', 'south'),
  P('TH-91', 'Satun', 'สตูล', 'south'),
  // Open: the pilot. Ko Samui is in Surat Thani, and everything the app can
  // currently prove — places, metrics, photographs, hosts — is here.
  P('TH-84', 'Surat Thani', 'สุราษฎร์ธานี', 'south', 'open'),
  P('TH-94', 'Pattani', 'ปัตตานี', 'south'),
];

export const PROVINCE_COUNT = 77;

export const provincesIn = (region: RegionKey): Province[] =>
  PROVINCES.filter((p) => p.region === region);

export const openProvinces = (): Province[] => PROVINCES.filter((p) => p.status === 'open');

export const findProvince = (code: string): Province | null =>
  PROVINCES.find((p) => p.code === code) ?? null;

/**
 * How far through the country a traveller is.
 *
 * Denominator is the whole country, deliberately. Showing "2 of 2" because
 * only two are open would flatter the app and mislead the traveller about what
 * collecting Thailand actually means.
 */
export function passportProgress(visitedCodes: string[]): {
  visited: number;
  total: number;
  open: number;
  byRegion: { region: Region; visited: number; total: number }[];
} {
  const seen = new Set(visitedCodes);
  return {
    visited: PROVINCES.filter((p) => seen.has(p.code)).length,
    total: PROVINCE_COUNT,
    open: openProvinces().length,
    byRegion: REGIONS.map((region) => {
      const inRegion = provincesIn(region.key);
      return {
        region,
        visited: inRegion.filter((p) => seen.has(p.code)).length,
        total: inRegion.length,
      };
    }),
  };
}
