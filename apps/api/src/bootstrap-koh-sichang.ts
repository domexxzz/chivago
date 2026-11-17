/**
 * Insert-only production bootstrap for the first verified Ko Sichang businesses.
 *
 * The live SQLite database is mounted on a Fly volume, so files committed to
 * Git never replace it. This bootstrap deliberately adds only rows that are
 * absent and never overwrites a profile an operator may already have edited.
 * The operator password remains a deployment secret and is never committed.
 *
 * NOTHING IN HERE MAY THROW. server.ts calls this at the top level of the
 * module, so a thrown error happens during import and ends the process before
 * a port is open - and with `auto_stop_machines = "stop"` in fly.toml the
 * machine then wakes on the next request, crashes again, and the pilot stays
 * dark until somebody edits fly.toml and redeploys. Every refusal below is a
 * warning and a `skipped` result for that reason, and the one case that used
 * to get there by accident - a row renamed after it was planted - is covered
 * by a test.
 */
import { row, transact, type DB } from './db.ts';
import { registerUser } from './user-account-service.ts';

export const KOH_SICHANG_OPERATOR_EMAIL = 'fanta@tst.com';

type BusinessSeed = {
  id: string;
  name: string;
  category: 'ที่พัก' | 'ร้านอาหาร';
  description: string;
  address: string;
  lat: number;
  lng: number;
  phone: string;
  email: string;
  openingHours: string;
  amenities: string[];
};

type AttractionSeed = {
  id: string;
  nameEn: string;
  nameTh: string;
  short: string;
  layer: 'Green' | 'Safe' | 'Wellness';
  descriptionEn: string;
  descriptionTh: string;
  lat: number;
  lng: number;
  tags: string[];
  photoUrl: string;
  photoCredit: string;
  photoLicence: string;
  photoSource: string;
  safetyEn: string;
  safetyTh: string;
};

/**
 * Factual island attractions that are not part of the original six-place
 * field-trial seed. Coordinates are mapped features, not geocoded addresses.
 * Every photograph is a Wikimedia Commons file with a redistribution licence;
 * the attribution and source travel with the row shown by the place screen.
 *
 * The places table predates this import and requires four baseline score
 * inputs. The bootstrap therefore uses the same explicitly modelled island
 * baseline as the existing Ko Sichang places. It does not present those
 * figures as measurements; the factual content added here is the identity,
 * position, description and licensed photograph.
 */
/*
  PHOTOGRAPHS AT 1280, NOT AT WHATEVER THE CAMERA SHOT.

  Four of these pointed straight at the original upload - 3648 x 2736 and up,
  several megabytes each - which a phone on the island would have to pull over
  whatever signal it has, to show in a card a few hundred pixels wide.
  `Special:Redirect/file/NAME?width=1280` asks Commons for a thumbnail of the
  same file, keeps the credit and the licence exactly as they were, and was
  checked at 1280 for every one of the six.

  THIS IS THE ONLY MOMENT THESE CAN BE SET. The insert below skips any id that
  already exists, so a row written once keeps the url it was written with; a
  later correction here would not reach a database that already has the place.
*/
export const KOH_SICHANG_ATTRACTIONS: readonly AttractionSeed[] = [
  {
    id: 'sc-atsadang-bridge', nameEn: 'Atsadang Bridge', nameTh: 'สะพานอัษฎางค์', short: 'Atsadang Bridge', layer: 'Wellness',
    descriptionEn: 'The white wooden bridge in the Phra Chudadhuj Palace grounds, built during the reign of King Rama V.',
    descriptionTh: 'สะพานไม้สีขาวภายในพระจุฑาธุชราชฐาน สร้างขึ้นในสมัยรัชกาลที่ 5 และเป็นส่วนหนึ่งของเส้นทางชมพระราชฐานริมทะเล',
    lat: 13.1504555, lng: 100.8180568, tags: ['History', 'Bridge', 'Walking'],
    photoUrl: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Phra_Chuthathut_Palace_(II).jpg?width=1280',
    photoCredit: 'Supanut Arunoprayote', photoLicence: 'CC BY 4.0',
    photoSource: 'https://commons.wikimedia.org/wiki/File:Phra_Chuthathut_Palace_(II).jpg',
    safetyEn: 'Staffed palace grounds', safetyTh: 'อยู่ในเขตพระราชฐานที่มีเจ้าหน้าที่ดูแล',
  },
  {
    id: 'sc-wat-atsadang', nameEn: 'Wat Atsadang Nimit', nameTh: 'วัดอัษฎางคนิมิตร', short: 'Atsadang Nimit', layer: 'Wellness',
    descriptionEn: 'A hilltop circular ordination hall beneath a Sri Lankan-style chedi, with Gothic arches and stained-glass windows.',
    descriptionTh: 'พระเจดีย์อุโบสถบนไหล่เขา ตัวอุโบสถอยู่ใต้เจดีย์ทรงลังกา มีซุ้มโค้งแบบโกธิคและช่องแสงประดับกระจกสี',
    lat: 13.146586, lng: 100.816643, tags: ['Temple', 'History', 'Viewpoint'],
    photoUrl: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Phra_Chedi.jpg?width=1280',
    photoCredit: 'Guido Johannes Joerg', photoLicence: 'CC BY-SA 2.5',
    photoSource: 'https://commons.wikimedia.org/wiki/File:Phra_Chedi.jpg',
    safetyEn: 'Religious site', safetyTh: 'ศาสนสถาน',
  },
  {
    id: 'sc-chao-pho-khao-yai', nameEn: 'Chao Pho Khao Yai Shrine', nameTh: 'ศาลเจ้าพ่อเขาใหญ่', short: 'Khao Yai Shrine', layer: 'Safe',
    descriptionEn: 'A Chinese-style shrine on the northern hillside, visited by island residents and travellers paying respect.',
    descriptionTh: 'ศาลเจ้าจีนบนเนินเขาทางตอนเหนือของเกาะ เป็นสถานที่สักการะสำคัญของชาวเกาะและผู้มาเยือน',
    lat: 13.1681837, lng: 100.8066588, tags: ['Shrine', 'Culture', 'Viewpoint'],
    photoUrl: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/San_Jao_Phaw_Khao_Yai_Chinese_Temple_-_panoramio_%2815%29.jpg?width=1280',
    photoCredit: 'ekeidar', photoLicence: 'CC BY-SA 3.0',
    photoSource: 'https://commons.wikimedia.org/wiki/File:San_Jao_Phaw_Khao_Yai_Chinese_Temple_-_panoramio_(15).jpg',
    safetyEn: 'Religious site', safetyTh: 'ศาสนสถาน',
  },
  {
    id: 'sc-buddha-footprint', nameEn: 'Buddha Footprint Mondop', nameTh: 'มณฑปรอยพระพุทธบาท', short: 'Buddha Footprint', layer: 'Wellness',
    descriptionEn: 'A hilltop mondop housing a replica Buddha footprint, reached by steps above Chao Pho Khao Yai Shrine.',
    descriptionTh: 'มณฑปบนยอดเขาประดิษฐานรอยพระพุทธบาทจำลอง เข้าถึงด้วยบันไดจากบริเวณศาลเจ้าพ่อเขาใหญ่และมองเห็นทิวทัศน์รอบเกาะ',
    lat: 13.1691171, lng: 100.8054852, tags: ['Buddhist site', 'Viewpoint', 'Walking'],
    photoUrl: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Budha_Footprint_-_panoramio.jpg?width=1280',
    photoCredit: 'ekeidar', photoLicence: 'CC BY-SA 3.0',
    photoSource: 'https://commons.wikimedia.org/wiki/File:Budha_Footprint_-_panoramio.jpg',
    safetyEn: 'Steep stair access', safetyTh: 'ทางขึ้นเป็นบันไดสูง',
  },
  {
    id: 'sc-wat-tham-yai-prik', nameEn: 'Wat Tham Yai Prik', nameTh: 'วัดถ้ำยายปริก', short: 'Tham Yai Prik', layer: 'Wellness',
    descriptionEn: 'An island temple and meditation site with caves, Buddha images and elevated views over Ko Sichang.',
    descriptionTh: 'วัดและสถานปฏิบัติธรรมบนเกาะ มีถ้ำ พระพุทธรูป และพื้นที่สูงที่มองเห็นทิวทัศน์ของเกาะสีชัง',
    lat: 13.1564464, lng: 100.8075131, tags: ['Temple', 'Cave', 'Meditation'],
    photoUrl: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/The_Yellow_Budha_-_panoramio_%281%29.jpg?width=1280',
    photoCredit: 'ekeidar', photoLicence: 'CC BY-SA 3.0',
    photoSource: 'https://commons.wikimedia.org/wiki/File:The_Yellow_Budha_-_panoramio_(1).jpg',
    safetyEn: 'Religious site', safetyTh: 'ศาสนสถาน',
  },
  {
    id: 'sc-ko-kham-yai', nameEn: 'Ko Kham Yai', nameTh: 'เกาะขามใหญ่', short: 'Ko Kham Yai', layer: 'Green',
    descriptionEn: 'A small fishing-community island northeast of Ko Sichang, known for local life, fishing and coastal scenery.',
    descriptionTh: 'เกาะชุมชนประมงขนาดเล็กทางตะวันออกเฉียงเหนือของเกาะสีชัง เหมาะสำหรับสัมผัสวิถีชุมชน ตกปลา และชมทิวทัศน์ชายฝั่ง',
    lat: 13.1679437, lng: 100.8245248, tags: ['Island', 'Fishing community', 'Coast'],
    photoUrl: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Ko_Sichang_06.JPG?width=1280',
    photoCredit: 'Ruslik0', photoLicence: 'CC BY-SA 4.0',
    photoSource: 'https://commons.wikimedia.org/wiki/File:Ko_Sichang_06.JPG',
    safetyEn: 'Boat access', safetyTh: 'เดินทางด้วยเรือ',
  },
] as const;

export const KOH_SICHANG_BUSINESSES: readonly BusinessSeed[] = [
  {
    id: 'bootstrap-koh-sichang-novotel', name: 'Novotel Koh Si Chang', category: 'ที่พัก',
    description: 'โรงแรมและรีสอร์ตบนเกาะสีชัง มีห้องพัก ร้านอาหาร บาร์ อาหารเช้า ห้องประชุม Wi-Fi และบริการรถรับส่ง ข้อมูลจากเว็บไซต์เครือ Accor; กรุณาตรวจสอบราคาและรอบบริการกับสถานประกอบการโดยตรง',
    address: '333 ตำบลท่าเทววงษ์ อำเภอเกาะสีชัง ชลบุรี 20120', lat: 13.1752, lng: 100.80699,
    phone: '033-265-800', email: 'H9775-RE@accor.com', openingHours: '00:00-23:59',
    amenities: ['Wi-Fi', 'ร้านอาหาร', 'บาร์', 'อาหารเช้า', 'ห้องประชุม', 'รถรับส่ง', 'รองรับรถเข็น'],
  },
  {
    id: 'bootstrap-koh-sichang-somewhere', name: 'Somewhere Koh Sichang', category: 'ที่พัก',
    description: 'โรงแรมบูทีคบนเกาะสีชัง มีห้องพัก ร้านอาหารและบาร์ สระว่ายน้ำ ห้องประชุม บริการ Concierge และกิจกรรมเดินเที่ยว ข้อมูลจาก Fact Sheet ของโรงแรม',
    address: '194, 194/1 หมู่ 3 ตำบลท่าเทววงษ์ อำเภอเกาะสีชัง ชลบุรี 20120', lat: 13.156173, lng: 100.812065,
    phone: '038-109-400', email: 'reservations@somewhere-kohsichang.com', openingHours: '00:00-23:59',
    amenities: ['Wi-Fi', 'ร้านอาหาร', 'บาร์', 'สระว่ายน้ำ', 'ห้องประชุม', 'Concierge'],
  },
  {
    id: 'bootstrap-koh-sichang-paree-hut', name: 'Paree Hut Resort', category: 'ที่พัก',
    description: 'รีสอร์ตและบังกะโลฝั่งตะวันตกของเกาะสีชัง บรรยากาศธรรมชาติ เหมาะสำหรับชมพระอาทิตย์ตก รายละเอียดห้องพักและการเปิดบริการควรยืนยันกับสถานประกอบการก่อนเดินทาง',
    address: '60 หมู่ 3 ตำบลท่าเทววงษ์ อำเภอเกาะสีชัง ชลบุรี 20120', lat: 13.135476, lng: 100.807065,
    phone: '', email: '', openingHours: '', amenities: ['ที่พัก', 'วิวทะเล', 'ชมพระอาทิตย์ตก'],
  },
  {
    id: 'bootstrap-koh-sichang-tiew-pai', name: 'Tiew Pai Park Resort', category: 'ที่พัก',
    description: 'เกสต์เฮาส์และที่พักบริเวณใกล้วัดถ้ำยายปริกและท่าเรือท่าล่าง ข้อมูลตำแหน่งอ้างอิงจาก OpenStreetMap; กรุณาตรวจสอบรายละเอียดห้องและการเปิดบริการก่อนเดินทาง',
    address: 'ตำบลท่าเทววงษ์ อำเภอเกาะสีชัง ชลบุรี 20120', lat: 13.15839, lng: 100.80952,
    phone: '', email: '', openingHours: '', amenities: ['ที่พัก', 'ใกล้ท่าเรือ'],
  },
  {
    id: 'bootstrap-koh-sichang-tamperr', name: 'Tamperr Koh Sichang', category: 'ร้านอาหาร',
    description: 'คาเฟ่และร้านกาแฟบนเกาะสีชัง เวลาอ้างอิง เสาร์-พุธ 09:30-17:00 น. ปิดพฤหัสบดีและศุกร์ ควรตรวจสอบวันหยุดกับร้านก่อนเดินทาง',
    address: 'ตำบลท่าเทววงษ์ อำเภอเกาะสีชัง ชลบุรี 20120', lat: 13.1647801, lng: 100.8049036,
    phone: '099-645-1946', email: '', openingHours: '09:30-17:00', amenities: ['กาแฟ', 'เครื่องดื่ม', 'คาเฟ่'],
  },
  {
    id: 'bootstrap-koh-sichang-islandish', name: 'Islandish Cafe', category: 'ร้านอาหาร',
    description: 'คาเฟ่สไตล์วินเทจบนเกาะสีชัง ให้บริการกาแฟ เครื่องดื่ม ขนม และเมนูฟิวชัน ข้อมูลเวลาและเบอร์โทรจากหลายแหล่งไม่ตรงกัน จึงควรตรวจสอบกับร้านก่อนเดินทาง',
    address: 'ตำบลท่าเทววงษ์ อำเภอเกาะสีชัง ชลบุรี 20120', lat: 13.1570905, lng: 100.8108719,
    phone: '', email: '', openingHours: '', amenities: ['กาแฟ', 'ขนม', 'อาหารฟิวชัน', 'คาเฟ่'],
  },
  {
    id: 'bootstrap-koh-sichang-sichangboy', name: 'Sichangboy Slowbar', category: 'ร้านอาหาร',
    description: 'คาเฟ่และสโลว์บาร์บนเกาะสีชัง เวลาอ้างอิง จันทร์-ศุกร์ 08:30-17:00 น. และเสาร์-อาทิตย์ 08:00-18:00 น. ควรตรวจสอบเวลาอีกครั้งก่อนเดินทาง',
    address: 'ตำบลท่าเทววงษ์ อำเภอเกาะสีชัง ชลบุรี 20120', lat: 13.156645, lng: 100.8112074,
    phone: '', email: '', openingHours: '08:30-17:00', amenities: ['กาแฟ', 'เครื่องดื่ม', 'Slow bar'],
  },
  {
    id: 'bootstrap-koh-sichang-new-kid', name: 'New Kid In Town Café', category: 'ร้านอาหาร',
    description: 'คาเฟ่บนเกาะสีชัง ให้บริการกาแฟ เครื่องดื่ม และขนม เวลาเปิดอ้างอิง 08:00-17:00 น. ควรตรวจสอบวันหยุดกับร้านก่อนเดินทาง',
    address: 'ตำบลท่าเทววงษ์ อำเภอเกาะสีชัง ชลบุรี 20120', lat: 13.15413, lng: 100.805757,
    phone: '086-179-4283', email: '', openingHours: '08:00-17:00', amenities: ['กาแฟ', 'เครื่องดื่ม', 'ขนม', 'คาเฟ่'],
  },
] as const;

export type BootstrapResult = {
  accountCreated: boolean;
  shopsInserted: number;
  shopsAlreadyPresent: number;
  attractionsInserted: number;
  attractionsAlreadyPresent: number;
  skipped: boolean;
};

export function bootstrapKohSichangBusinesses(db: DB, env: NodeJS.ProcessEnv = process.env): BootstrapResult {
  if (env.CHIVAGO_BOOTSTRAP_KOH_SICHANG !== '1') {
    return { accountCreated: false, shopsInserted: 0, shopsAlreadyPresent: 0, attractionsInserted: 0, attractionsAlreadyPresent: 0, skipped: true };
  }

  // Landmarks are public map content and must not depend on an operator
  // password. This makes a normal Git deploy sufficient to add new landmark
  // rows to an existing production volume when the bootstrap switch is on.
  let attractionsInserted = 0;
  let attractionsAlreadyPresent = 0;
  transact(db, () => {
    for (const attraction of KOH_SICHANG_ATTRACTIONS) {
      const existing = row<{ id: string }>(db.prepare('SELECT id FROM places WHERE id = ?').get(attraction.id));
      if (existing) { attractionsAlreadyPresent += 1; continue; }
      db.prepare(`INSERT INTO places
        (id, name_en, name_th, short, layer, province, lat, lng, meta, blurb_en, blurb_th,
         tags, photo_url, photo_credit, photo_licence, photo_source, safety_label_en,
         safety_label_th, crowd_density, aqi, safety_index, walkability)
        VALUES (?, ?, ?, ?, ?, 'TH-20', ?, ?, 'Ko Sichang attraction · Air modelled', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1.5, 40, 6.0, 6.0)`).run(
        attraction.id, attraction.nameEn, attraction.nameTh, attraction.short, attraction.layer,
        attraction.lat, attraction.lng, attraction.descriptionEn, attraction.descriptionTh,
        JSON.stringify(attraction.tags), attraction.photoUrl, attraction.photoCredit,
        attraction.photoLicence, attraction.photoSource, attraction.safetyEn, attraction.safetyTh,
      );
      attractionsInserted += 1;
    }
  });

  // Businesses are intentionally owner-managed. Keep the previously prepared
  // records available for an explicit migration, but never create an account
  // or publish service profiles during an ordinary landmark deployment.
  if (env.CHIVAGO_BOOTSTRAP_KOH_SICHANG_BUSINESSES !== '1') {
    return {
      accountCreated: false, shopsInserted: 0, shopsAlreadyPresent: 0,
      attractionsInserted, attractionsAlreadyPresent, skipped: false,
    };
  }

  let owner = row<{ id: string; account_type: string }>(db.prepare(
    'SELECT id, account_type FROM user_accounts WHERE lower(email) = ?',
  ).get(KOH_SICHANG_OPERATOR_EMAIL));
  let accountCreated = false;

  if (!owner) {
    const password = env.CHIVAGO_BOOTSTRAP_OPERATOR_PASSWORD;
    const phone = env.CHIVAGO_BOOTSTRAP_OPERATOR_PHONE;
    if (!password || !phone) {
      console.warn('[chivago] Ko Sichang business bootstrap skipped: set CHIVAGO_BOOTSTRAP_OPERATOR_PASSWORD and CHIVAGO_BOOTSTRAP_OPERATOR_PHONE');
      return { accountCreated: false, shopsInserted: 0, shopsAlreadyPresent: 0, attractionsInserted, attractionsAlreadyPresent, skipped: false };
    }
    const registered = registerUser(db, {
      fullName: 'Fanta', email: KOH_SICHANG_OPERATOR_EMAIL, phone, password,
      accountType: 'operator', businessName: 'Fanta เกาะสีชัง', locale: 'th',
    });
    owner = { id: registered.userId, account_type: 'operator' };
    accountCreated = true;
  }
  if (owner.account_type !== 'operator') {
    // Refuse, but do not throw. server.ts calls this while it is still being
    // imported, so an exception here never reaches a handler: it kills the
    // process before the port is open. Attaching eight businesses to an
    // account that is not the operator would be wrong, and taking the pilot
    // off the air to say so would be worse.
    console.warn(
      `[chivago] Ko Sichang bootstrap refused: ${KOH_SICHANG_OPERATOR_EMAIL} is not an operator account`,
    );
    // The attractions counts are here because the refusal path predates them
    // and `BootstrapResult` requires them: nothing was planted, so both are
    // zero, the same as the shop counts beside them.
    return {
      accountCreated,
      shopsInserted: 0,
      shopsAlreadyPresent: 0,
      attractionsInserted: 0,
      attractionsAlreadyPresent: 0,
      skipped: true,
    };
  }

  let shopsInserted = 0;
  let shopsAlreadyPresent = 0;
  transact(db, () => {
    for (const shop of KOH_SICHANG_BUSINESSES) {
      // BY ID FIRST, because the id is what the INSERT below is keyed on and
      // the name is not. Checking the name alone missed a row this bootstrap
      // had already planted as soon as its operator renamed it, and the
      // INSERT then hit `UNIQUE constraint failed: local_shops.id` - which,
      // called from the top of server.ts, took the whole deployment down.
      //
      // The name is still checked, for the other case: a shop somebody added
      // by hand before this ever ran keeps its own row and gets no twin.
      const existing = row<{ id: string }>(db.prepare(
        'SELECT id FROM local_shops WHERE id = ? OR (area_key = ? AND lower(name) = lower(?)) LIMIT 1',
      ).get(shop.id, 'koh-sichang', shop.name));
      if (existing) { shopsAlreadyPresent += 1; continue; }
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO local_shops
        (id, owner_id, name, category, area_key, description, address, lat, lng, phone, email,
         opening_hours, amenities, active, created_at, updated_at, service_type)
        VALUES (?, ?, ?, ?, 'koh-sichang', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'business')`).run(
        shop.id, owner.id, shop.name, shop.category, shop.description, shop.address, shop.lat, shop.lng,
        shop.phone, shop.email, shop.openingHours, shop.amenities.join(','), now, now,
      );
      shopsInserted += 1;
    }
  });
  return { accountCreated, shopsInserted, shopsAlreadyPresent, attractionsInserted, attractionsAlreadyPresent, skipped: false };
}
