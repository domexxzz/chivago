import React from 'react';
import Svg, { Circle, Path, Polygon, Rect } from 'react-native-svg';
import { t } from '../i18n/locale.ts';

const languageNames = {
  'ไทย': { en: 'Thai', th: 'ไทย', zh: '泰语' }, Thai: { en: 'Thai', th: 'ไทย', zh: '泰语' },
  English: { en: 'English', th: 'อังกฤษ', zh: '英语' }, 'อังกฤษ': { en: 'English', th: 'อังกฤษ', zh: '英语' },
  '中文': { en: 'Chinese', th: 'จีน', zh: '中文' }, Chinese: { en: 'Chinese', th: 'จีน', zh: '中文' }, 'จีน': { en: 'Chinese', th: 'จีน', zh: '中文' },
  '日本語': { en: 'Japanese', th: 'ญี่ปุ่น', zh: '日语' }, Japanese: { en: 'Japanese', th: 'ญี่ปุ่น', zh: '日语' },
  '한국어': { en: 'Korean', th: 'เกาหลี', zh: '韩语' }, Korean: { en: 'Korean', th: 'เกาหลี', zh: '韩语' },
  Français: { en: 'French', th: 'ฝรั่งเศส', zh: '法语' }, French: { en: 'French', th: 'ฝรั่งเศส', zh: '法语' },
  Deutsch: { en: 'German', th: 'เยอรมัน', zh: '德语' }, German: { en: 'German', th: 'เยอรมัน', zh: '德语' },
  Español: { en: 'Spanish', th: 'สเปน', zh: '西班牙语' }, Spanish: { en: 'Spanish', th: 'สเปน', zh: '西班牙语' },
  'Русский': { en: 'Russian', th: 'รัสเซีย', zh: '俄语' }, Russian: { en: 'Russian', th: 'รัสเซีย', zh: '俄语' },
  'العربية': { en: 'Arabic', th: 'อาหรับ', zh: '阿拉伯语' }, Arabic: { en: 'Arabic', th: 'อาหรับ', zh: '阿拉伯语' },
} as const;

/** Localized presentation only; the stored language value remains unchanged. */
export const guideLanguageLabel = (language: string): string =>
  t((languageNames as Record<string, { en: string; th: string; zh?: string }>)[language]
    ?? { en: language, th: language, zh: language });

const languageCode = (language: string) => ({
  'ไทย': 'th', Thai: 'th',
  English: 'gb', 'อังกฤษ': 'gb',
  '中文': 'cn', Chinese: 'cn', 'จีน': 'cn',
  '日本語': 'jp', Japanese: 'jp',
  '한국어': 'kr', Korean: 'kr',
  Français: 'fr', French: 'fr',
  Deutsch: 'de', German: 'de',
  Español: 'es', Spanish: 'es',
  'Русский': 'ru', Russian: 'ru',
  'العربية': 'sa', Arabic: 'sa',
} as Record<string, string>)[language] ?? 'globe';

/** SVG flags render consistently on web and native; platform emoji often falls back to TH/GB/CN text. */
export function GuideLanguageFlag({ language, size = 22 }: { language: string; size?: number }) {
  const code = languageCode(language);
  const height = Math.round(size * 0.72);
  const common = { width: size, height, viewBox: '0 0 30 20' };
  const outline = <Rect x="0.5" y="0.5" width="29" height="19" rx="2" fill="none" stroke="#B8D1DB" />;
  if (code === 'th') return <Svg {...common}><Rect width="30" height="20" fill="#A51931" /><Rect y="4" width="30" height="12" fill="#fff" /><Rect y="6" width="30" height="8" fill="#2D2A4A" />{outline}</Svg>;
  if (code === 'gb') return <Svg {...common}><Rect width="30" height="20" fill="#1F4E96" /><Path d="M0 0L30 20M30 0L0 20" stroke="#fff" strokeWidth="5" /><Path d="M0 0L30 20M30 0L0 20" stroke="#C8102E" strokeWidth="2" /><Path d="M15 0V20M0 10H30" stroke="#fff" strokeWidth="7" /><Path d="M15 0V20M0 10H30" stroke="#C8102E" strokeWidth="3.5" />{outline}</Svg>;
  if (code === 'cn') return <Svg {...common}><Rect width="30" height="20" fill="#DE2910" /><Polygon points="6,2 7.2,5.3 10.7,5.4 7.9,7.5 8.9,10.8 6,8.8 3.1,10.8 4.1,7.5 1.3,5.4 4.8,5.3" fill="#FFDE00" />{outline}</Svg>;
  if (code === 'jp') return <Svg {...common}><Rect width="30" height="20" fill="#fff" /><Circle cx="15" cy="10" r="5.6" fill="#BC002D" />{outline}</Svg>;
  if (code === 'kr') return <Svg {...common}><Rect width="30" height="20" fill="#fff" /><Path d="M15 4a6 6 0 0 0 0 12c0-3 3-3 3-6a6 6 0 0 0-3-6" fill="#CD2E3A" /><Path d="M15 4a6 6 0 0 1 0 12c0-3-3-3-3-6a6 6 0 0 1 3-6" fill="#0F64B3" />{outline}</Svg>;
  if (code === 'fr') return <Svg {...common}><Rect width="10" height="20" fill="#1B4E9B" /><Rect x="10" width="10" height="20" fill="#fff" /><Rect x="20" width="10" height="20" fill="#E03C31" />{outline}</Svg>;
  if (code === 'de') return <Svg {...common}><Rect width="30" height="6.67" fill="#111" /><Rect y="6.67" width="30" height="6.67" fill="#DD0000" /><Rect y="13.34" width="30" height="6.66" fill="#FFCE00" />{outline}</Svg>;
  if (code === 'es') return <Svg {...common}><Rect width="30" height="20" fill="#AA151B" /><Rect y="5" width="30" height="10" fill="#F1BF00" />{outline}</Svg>;
  if (code === 'ru') return <Svg {...common}><Rect width="30" height="6.67" fill="#fff" /><Rect y="6.67" width="30" height="6.67" fill="#0039A6" /><Rect y="13.34" width="30" height="6.66" fill="#D52B1E" />{outline}</Svg>;
  if (code === 'sa') return <Svg {...common}><Rect width="30" height="20" fill="#006C35" /><Path d="M8 13h14" stroke="#fff" strokeWidth="1.2" /><Circle cx="15" cy="8" r="2.5" fill="none" stroke="#fff" strokeWidth="1" />{outline}</Svg>;
  return <Svg {...common}><Rect width="30" height="20" rx="2" fill="#EAF7FB" /><Circle cx="15" cy="10" r="5" fill="none" stroke="#35738A" strokeWidth="1.5" />{outline}</Svg>;
}
