import { t } from '../i18n/locale.ts';
export function ratingMeaning(rating: number): string {
  const labels = [
    { en: 'Choose a rating', th: 'เลือกคะแนน', zh: '请选择评分' },
    { en: 'Needs improvement', th: 'ต้องปรับปรุง', zh: '需要改进' },
    { en: 'Below expectations', th: 'ต่ำกว่าที่คาดหวัง', zh: '低于预期' },
    { en: 'Fair', th: 'พอใช้', zh: '一般' },
    { en: 'Good', th: 'ดี', zh: '好' },
    { en: 'Excellent', th: 'ดีมาก', zh: '非常好' },
  ];
  return `${rating > 0 ? `${rating} — ` : ''}${t(labels[rating] ?? labels[0]!)}`;
}
