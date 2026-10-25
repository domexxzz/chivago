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
  name: { en: string; th: string; zh?: string };
}

export const REGIONS: Region[] = [
  { key: 'north', name: { en: 'Northern', th: 'ภาคเหนือ', zh: '北部' } },
  { key: 'northeast', name: { en: 'Northeastern', th: 'ภาคตะวันออกเฉียงเหนือ', zh: '东北部' } },
  { key: 'central', name: { en: 'Central', th: 'ภาคกลาง', zh: '中部' } },
  { key: 'east', name: { en: 'Eastern', th: 'ภาคตะวันออก', zh: '东部' } },
  { key: 'west', name: { en: 'Western', th: 'ภาคตะวันตก', zh: '西部' } },
  { key: 'south', name: { en: 'Southern', th: 'ภาคใต้', zh: '南部' } },
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
  name: { en: string; th: string; zh?: string };
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
const P = (
  code: string, en: string, th: string, zh: string, region: RegionKey, status: ProvinceStatus = 'listed',
): Province => ({ code, name: { en, th, zh }, region, status });

export const PROVINCES: Province[] = [
  // ---- ภาคเหนือ · 9 -------------------------------------------------------
  P('TH-50', 'Chiang Mai', 'เชียงใหม่', '清迈', 'north'),
  P('TH-57', 'Chiang Rai', 'เชียงราย', '清莱', 'north'),
  P('TH-52', 'Lampang', 'ลำปาง', '南邦', 'north'),
  P('TH-51', 'Lamphun', 'ลำพูน', '南奔', 'north'),
  P('TH-58', 'Mae Hong Son', 'แม่ฮ่องสอน', '夜丰颂', 'north'),
  P('TH-55', 'Nan', 'น่าน', '难府', 'north'),
  P('TH-56', 'Phayao', 'พะเยา', '帕夭', 'north'),
  P('TH-54', 'Phrae', 'แพร่', '帕府', 'north'),
  P('TH-53', 'Uttaradit', 'อุตรดิตถ์', '程逸', 'north'),

  // ---- ภาคตะวันออกเฉียงเหนือ · 20 -----------------------------------------
  P('TH-46', 'Kalasin', 'กาฬสินธุ์', '加拉信', 'northeast'),
  P('TH-40', 'Khon Kaen', 'ขอนแก่น', '孔敬', 'northeast'),
  P('TH-36', 'Chaiyaphum', 'ชัยภูมิ', '猜也蓬', 'northeast'),
  P('TH-48', 'Nakhon Phanom', 'นครพนม', '那空拍侬', 'northeast'),
  P('TH-30', 'Nakhon Ratchasima', 'นครราชสีมา', '呵叻', 'northeast'),
  P('TH-38', 'Bueng Kan', 'บึงกาฬ', '汶干', 'northeast'),
  P('TH-31', 'Buri Ram', 'บุรีรัมย์', '武里南', 'northeast'),
  P('TH-44', 'Maha Sarakham', 'มหาสารคาม', '玛哈沙拉堪', 'northeast'),
  P('TH-49', 'Mukdahan', 'มุกดาหาร', '穆达汉', 'northeast'),
  P('TH-35', 'Yasothon', 'ยโสธร', '益梭通', 'northeast'),
  P('TH-45', 'Roi Et', 'ร้อยเอ็ด', '黎逸', 'northeast'),
  P('TH-42', 'Loei', 'เลย', '黎府', 'northeast'),
  P('TH-33', 'Si Sa Ket', 'ศรีสะเกษ', '四色菊', 'northeast'),
  P('TH-47', 'Sakon Nakhon', 'สกลนคร', '沙功那空', 'northeast'),
  P('TH-32', 'Surin', 'สุรินทร์', '素辇', 'northeast'),
  P('TH-43', 'Nong Khai', 'หนองคาย', '廊开', 'northeast'),
  P('TH-39', 'Nong Bua Lam Phu', 'หนองบัวลำภู', '农磨兰普', 'northeast'),
  P('TH-41', 'Udon Thani', 'อุดรธานี', '乌隆', 'northeast'),
  P('TH-34', 'Ubon Ratchathani', 'อุบลราชธานี', '乌汶', 'northeast'),
  P('TH-37', 'Amnat Charoen', 'อำนาจเจริญ', '安纳乍能', 'northeast'),

  // ---- ภาคกลาง · 22 (รวมกรุงเทพมหานคร) ------------------------------------
  P('TH-10', 'Bangkok', 'กรุงเทพมหานคร', '曼谷', 'central', 'open'),
  P('TH-62', 'Kamphaeng Phet', 'กำแพงเพชร', '甘烹碧', 'central'),
  P('TH-18', 'Chai Nat', 'ชัยนาท', '猜纳', 'central'),
  P('TH-26', 'Nakhon Nayok', 'นครนายก', '那空那育', 'central'),
  P('TH-73', 'Nakhon Pathom', 'นครปฐม', '佛统', 'central'),
  P('TH-60', 'Nakhon Sawan', 'นครสวรรค์', '北榄坡', 'central'),
  P('TH-12', 'Nonthaburi', 'นนทบุรี', '暖武里', 'central'),
  P('TH-13', 'Pathum Thani', 'ปทุมธานี', '巴吞他尼', 'central', 'open'),
  P('TH-14', 'Phra Nakhon Si Ayutthaya', 'พระนครศรีอยุธยา', '大城', 'central'),
  P('TH-66', 'Phichit', 'พิจิตร', '披集', 'central'),
  P('TH-65', 'Phitsanulok', 'พิษณุโลก', '彭世洛', 'central'),
  P('TH-67', 'Phetchabun', 'เพชรบูรณ์', '碧差汶', 'central'),
  P('TH-16', 'Lop Buri', 'ลพบุรี', '华富里', 'central'),
  P('TH-11', 'Samut Prakan', 'สมุทรปราการ', '北榄', 'central'),
  P('TH-75', 'Samut Songkhram', 'สมุทรสงคราม', '夜功', 'central'),
  P('TH-74', 'Samut Sakhon', 'สมุทรสาคร', '龙仔厝', 'central'),
  P('TH-17', 'Sing Buri', 'สิงห์บุรี', '信武里', 'central'),
  P('TH-64', 'Sukhothai', 'สุโขทัย', '素可泰', 'central'),
  P('TH-72', 'Suphan Buri', 'สุพรรณบุรี', '素攀武里', 'central'),
  P('TH-19', 'Saraburi', 'สระบุรี', '北标', 'central'),
  P('TH-15', 'Ang Thong', 'อ่างทอง', '红统', 'central'),
  P('TH-61', 'Uthai Thani', 'อุทัยธานี', '乌泰他尼', 'central'),

  // ---- ภาคตะวันออก · 7 ----------------------------------------------------
  P('TH-22', 'Chanthaburi', 'จันทบุรี', '尖竹汶', 'east'),
  P('TH-24', 'Chachoengsao', 'ฉะเชิงเทรา', '北柳', 'east'),
  // Open: Bang Saen and Pattaya are in the design's own example, and it is the
  // province most Thai travellers can check us on from memory.
  P('TH-20', 'Chon Buri', 'ชลบุรี', '春武里', 'east', 'open'),
  P('TH-23', 'Trat', 'ตราด', '桐艾', 'east'),
  P('TH-25', 'Prachin Buri', 'ปราจีนบุรี', '巴真武里', 'east'),
  P('TH-21', 'Rayong', 'ระยอง', '罗勇', 'east'),
  P('TH-27', 'Sa Kaeo', 'สระแก้ว', '沙缴', 'east'),

  // ---- ภาคตะวันตก · 5 -----------------------------------------------------
  P('TH-71', 'Kanchanaburi', 'กาญจนบุรี', '北碧', 'west'),
  P('TH-63', 'Tak', 'ตาก', '达府', 'west'),
  P('TH-77', 'Prachuap Khiri Khan', 'ประจวบคีรีขันธ์', '巴蜀', 'west'),
  P('TH-76', 'Phetchaburi', 'เพชรบุรี', '碧武里', 'west'),
  P('TH-70', 'Ratchaburi', 'ราชบุรี', '叻丕', 'west'),

  // ---- ภาคใต้ · 14 --------------------------------------------------------
  P('TH-81', 'Krabi', 'กระบี่', '甲米', 'south'),
  P('TH-86', 'Chumphon', 'ชุมพร', '春蓬', 'south'),
  P('TH-92', 'Trang', 'ตรัง', '董里', 'south'),
  P('TH-80', 'Nakhon Si Thammarat', 'นครศรีธรรมราช', '洛坤', 'south'),
  P('TH-96', 'Narathiwat', 'นราธิวาส', '陶公', 'south'),
  P('TH-82', 'Phangnga', 'พังงา', '攀牙', 'south'),
  P('TH-93', 'Phatthalung', 'พัทลุง', '博他仑', 'south'),
  P('TH-83', 'Phuket', 'ภูเก็ต', '普吉', 'south'),
  P('TH-95', 'Yala', 'ยะลา', '惹拉', 'south'),
  P('TH-85', 'Ranong', 'ระนอง', '拉廊', 'south'),
  P('TH-90', 'Songkhla', 'สงขลา', '宋卡', 'south'),
  P('TH-91', 'Satun', 'สตูล', '沙敦', 'south'),
  // Open: the pilot. Ko Samui is in Surat Thani, and everything the app can
  // currently prove — places, metrics, photographs, hosts — is here.
  P('TH-84', 'Surat Thani', 'สุราษฎร์ธานี', '素叻他尼', 'south', 'open'),
  P('TH-94', 'Pattani', 'ปัตตานี', '北大年', 'south'),
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
