import { API_BASE } from './client.ts';

export const SHOP_CATEGORIES = ['ที่พัก', 'ร้านอาหาร', 'ร้านขายของ', 'เช่ารถ', 'เสริมสวย', 'ตัดผม', 'ไกด์นำเที่ยว', 'อื่นๆ'] as const;
export type ShopCategory = typeof SHOP_CATEGORIES[number];

export interface Shop {
  id: string; name: string; category: string; areaKey: string;
  description: string; address: string; lat: number | null; lng: number | null;
  phone: string; email: string; openingHours: string; amenities: string[];
  active: boolean; rating: number | null; reviewCount: number;
  coverUrl: string | null; owner: boolean; createdAt: string; updatedAt: string;
  serviceType: 'business' | 'guide'; guideLanguages: string[]; guideSkills: string[]; guideMeetingPoint: string;
  guideStatus: 'not_required' | 'pending' | 'approved' | 'rejected'; hasGuideDocument: boolean;
}
export interface ShopDetail extends Shop { images: { id: string; kind: string; url: string }[] }
export interface ShopReview {
  id: string; rating: number; body: string; author: string; mine: boolean;
  ownerReply: string | null; createdAt: string; updatedAt: string; photoUrl: string | null;
}
export type ShopInput = Pick<Shop, 'name' | 'category' | 'areaKey' | 'description' | 'address' | 'lat' | 'lng' | 'phone' | 'email' | 'openingHours' | 'amenities' | 'active' | 'serviceType' | 'guideLanguages' | 'guideSkills' | 'guideMeetingPoint'>;

/** User uploads live on the API origin, including when Expo serves the web bundle. */
export const shopImageUri = (path: string) => path.startsWith('/') ? `${API_BASE.replace(/\/$/, '')}${path}` : path;

export const shopOpenNow = (hours: string, now = new Date()) => {
  const match = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(hours);
  if (!match) return false;
  const current = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now).replace(':', ''));
  const start = Number(match[1] + match[2]);
  const end = Number(match[3] + match[4]);
  return start <= end ? current >= start && current < end : current >= start || current < end;
};
