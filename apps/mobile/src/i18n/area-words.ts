/**
 * What a screen calls the place it is about.
 *
 * The copy was written when every area was an island. Three of the five are
 * now universities, and they were being told to help look after the island.
 */
import type { Area, Bilingual } from '@chivago/core';

export interface AreaWords {
  homeTagline: Bilingual;
  questsTagline: Bilingual;
  questsHint: Bilingual;
  perksBody: Bilingual;
}

const ISLAND: AreaWords = {
  homeTagline: {
    en: 'Island stories, local people and safer journeys — all in one place.',
    th: 'เรื่องราวของเกาะ ผู้คนท้องถิ่น และการเดินทางที่ปลอดภัยในที่เดียว',
    zh: '岛屿故事、当地人与安心旅程，尽在一处。',
  },
  questsTagline: { en: 'PLAY, EXPLORE & HELP THE ISLAND', th: 'เล่นเกม ออกสำรวจ และช่วยดูแลเกาะ', zh: '畅玩、探索并守护岛屿' },
  questsHint: { en: 'Activities around the island', th: 'กิจกรรมที่ทำได้ทั่วเกาะ', zh: '岛上各处的活动' },
  perksBody: {
    en: 'Use your Green and Trip points for café discounts, wellness and island tours.',
    th: 'ใช้แต้มกรีนและแต้มทริป แลกรับส่วนลดคาเฟ่ ร้านอาหาร และกิจกรรมบนเกาะ',
    zh: '用你的绿色积分和旅行积分，兑换咖啡馆折扣、康养和岛上行程。',
  },
};

const CAMPUS: AreaWords = {
  homeTagline: {
    en: 'Campus stories, the people here and safer journeys — all in one place.',
    th: 'เรื่องราวในมหาวิทยาลัย ผู้คนที่นี่ และการเดินทางที่ปลอดภัยในที่เดียว',
    zh: '校园故事、身边的人与安心旅程，尽在一处。',
  },
  questsTagline: { en: 'PLAY, EXPLORE & LOOK AFTER THE CAMPUS', th: 'เล่นเกม ออกสำรวจ และช่วยดูแลมหาวิทยาลัย', zh: '畅玩、探索并守护校园' },
  questsHint: { en: 'Activities around the campus', th: 'กิจกรรมที่ทำได้ในมหาวิทยาลัย', zh: '校园各处的活动' },
  perksBody: {
    en: 'Use your Green and Trip points for discounts at cafés, food stalls and local activities.',
    th: 'ใช้แต้มกรีนและแต้มทริป แลกรับส่วนลดคาเฟ่ ร้านอาหาร และกิจกรรมในพื้นที่',
    zh: '用你的绿色积分和旅行积分，兑换咖啡馆、餐饮和本地活动的优惠。',
  },
};

export const areaWords = (area: Pick<Area, 'university'>): AreaWords => (area.university ? CAMPUS : ISLAND);
