/**
 * Insert-only production bootstrap for the first verified Ko Sichang businesses.
 *
 * The live SQLite database is mounted on a Fly volume, so files committed to
 * Git never replace it. This bootstrap deliberately adds only rows that are
 * absent and never overwrites a profile an operator may already have edited.
 * The operator password remains a deployment secret and is never committed.
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

export type BootstrapResult = { accountCreated: boolean; shopsInserted: number; shopsAlreadyPresent: number; skipped: boolean };

export function bootstrapKohSichangBusinesses(db: DB, env: NodeJS.ProcessEnv = process.env): BootstrapResult {
  if (env.CHIVAGO_BOOTSTRAP_KOH_SICHANG !== '1') {
    return { accountCreated: false, shopsInserted: 0, shopsAlreadyPresent: 0, skipped: true };
  }

  let owner = row<{ id: string; account_type: string }>(db.prepare(
    'SELECT id, account_type FROM user_accounts WHERE lower(email) = ?',
  ).get(KOH_SICHANG_OPERATOR_EMAIL));
  let accountCreated = false;

  if (!owner) {
    const password = env.CHIVAGO_BOOTSTRAP_OPERATOR_PASSWORD;
    const phone = env.CHIVAGO_BOOTSTRAP_OPERATOR_PHONE;
    if (!password || !phone) {
      console.warn('[chivago] Ko Sichang bootstrap skipped: set CHIVAGO_BOOTSTRAP_OPERATOR_PASSWORD and CHIVAGO_BOOTSTRAP_OPERATOR_PHONE');
      return { accountCreated: false, shopsInserted: 0, shopsAlreadyPresent: 0, skipped: true };
    }
    const registered = registerUser(db, {
      fullName: 'Fanta', email: KOH_SICHANG_OPERATOR_EMAIL, phone, password,
      accountType: 'operator', businessName: 'Fanta เกาะสีชัง', locale: 'th',
    });
    owner = { id: registered.userId, account_type: 'operator' };
    accountCreated = true;
  }
  if (owner.account_type !== 'operator') {
    throw new Error(`Ko Sichang bootstrap refused: ${KOH_SICHANG_OPERATOR_EMAIL} is not an operator account`);
  }

  let shopsInserted = 0;
  let shopsAlreadyPresent = 0;
  transact(db, () => {
    for (const shop of KOH_SICHANG_BUSINESSES) {
      const existing = row<{ id: string }>(db.prepare(
        'SELECT id FROM local_shops WHERE area_key = ? AND lower(name) = lower(?) LIMIT 1',
      ).get('koh-sichang', shop.name));
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
  return { accountCreated, shopsInserted, shopsAlreadyPresent, skipped: false };
}
