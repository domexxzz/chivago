/**
 * What a shop category is called, and what it looks like.
 *
 * Lifted out of `HomeScreen` when `LocalPicksScreen` needed the same two
 * maps. A second copy of these would have drifted on the first day somebody
 * added a category to one screen: `SHOP_CATEGORIES` in `api/shops.ts` is the
 * list, and these are the only two things the app says about each entry.
 *
 * The Thai string IS the key, because it is what the database stores -
 * `local_shops.category` is free text with no CHECK, and the eight categories
 * are a convention the app keeps, not a constraint the schema enforces. A
 * category nobody has mapped falls through to itself in all three languages
 * rather than to an empty label.
 */
import {
  BedDouble, Car, Dumbbell, Scissors, ShoppingBag, Sparkles, UserRound, Utensils,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { t } from '../i18n/locale.ts';

const LABELS: Record<string, { en: string; th: string; zh?: string }> = {
  'ที่พัก': { en: 'Accommodation', th: 'ที่พัก', zh: '住宿' },
  'ร้านอาหาร': { en: 'Restaurants', th: 'ร้านอาหาร', zh: '餐厅' },
  'ร้านขายของ': { en: 'Souvenirs & shopping', th: 'ของฝาก/ช้อปปิ้ง', zh: '纪念品与购物' },
  'เช่ารถ': { en: 'Car rental', th: 'เช่ารถ', zh: '租车' },
  'เสริมสวย': { en: 'Beauty', th: 'เสริมสวย', zh: '美容' },
  'ตัดผม': { en: 'Haircuts', th: 'ตัดผม', zh: '理发' },
  'ไกด์นำเที่ยว': { en: 'Tour guide', th: 'ไกด์นำเที่ยว', zh: '导游' },
  'กีฬาและนันทนาการ': { en: 'Sports & recreation', th: 'กีฬาและนันทนาการ', zh: '运动与休闲' },
  'อื่นๆ': { en: 'Other', th: 'อื่นๆ', zh: '其他' },
};

export function shopCategoryLabel(category: string): string {
  return t(LABELS[category] ?? { en: category, th: category, zh: category });
}

export const serviceAppearance: Record<string, { icon: LucideIcon; accent: string; pale: string }> = {
  'ที่พัก': { icon: BedDouble, accent: '#0077B6', pale: '#E5F4FF' },
  'ร้านอาหาร': { icon: Utensils, accent: '#C65B16', pale: '#FFF0E5' },
  'ร้านขายของ': { icon: ShoppingBag, accent: '#7953B9', pale: '#F1EBFF' },
  'เช่ารถ': { icon: Car, accent: '#00848F', pale: '#E1F6F5' },
  'เสริมสวย': { icon: Sparkles, accent: '#BE4B78', pale: '#FDECF3' },
  'ตัดผม': { icon: Scissors, accent: '#2776B5', pale: '#E8F3FC' },
  'ไกด์นำเที่ยว': { icon: UserRound, accent: '#16806D', pale: '#E5F5EF' },
  'กีฬาและนันทนาการ': { icon: Dumbbell, accent: '#24834F', pale: '#E7F5EC' },
};

/** The fallback for a category with no look of its own. */
export const DEFAULT_APPEARANCE = { icon: ShoppingBag, accent: '#4A5A6A', pale: '#EEF2F5' };
