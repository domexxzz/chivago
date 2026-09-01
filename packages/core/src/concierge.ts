/**
 * The concierge: a bilingual chat that recommends places.
 *
 * WHY THIS IS NOT A LANGUAGE MODEL, stated up front because it is the first
 * question anybody will ask.
 *
 * Three reasons, in order of how much they cost to ignore.
 *
 * 1. It could not answer. The demo a judge opens is a static build with no
 *    server behind it - that is the whole point of it - and a client holding
 *    an API key is forbidden in this project by design. A chat that needs a
 *    round trip is a chat that is broken in the one place it gets seen, and
 *    broken again on a beach with one bar of signal.
 *
 * 2. It would break the only rule the product has. Every screen here refuses
 *    to claim more than it can show: a score returns its breakdown, a price is
 *    a band with drivers, a companion stage is derived from the ledger. A model
 *    that can invent a beach, a price or a safety fact would be the single most
 *    off-brand component in the app, and it would be the one users talk to.
 *
 * 3. It cannot be tested. Everything else here is.
 *
 * So this reads the same data the screens read and answers only from it. When
 * it does not know, it says which questions it can answer instead of guessing.
 * Every recommendation carries the measurement it was made from, because a
 * concierge that says "you'll love it" is not giving you a reason - it is
 * giving you a mood.
 *
 * The seam for a model is deliberate and narrow: `classify` turns a sentence
 * into an intent plus filters, and everything after it is pure retrieval. If a
 * model is ever added it replaces that one function, and the answers it can
 * produce stay bounded by the data underneath.
 */

import type { Bilingual, LayerKey, Quest, ScoredPlace } from './types.ts';
import { crowdLabel } from './healthy-score.ts';
import { SAMUI_EMERGENCY } from './emergency.ts';

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

export type Lang = 'th' | 'en';

/**
 * Thai script means Thai. Anything else means English.
 *
 * Detected from the script rather than a setting, because somebody typing Thai
 * into an English UI has told you which language they want more clearly than
 * any preference screen ever did. Mixed input follows the Thai, since a Thai
 * speaker borrowing an English place name is far commoner than the reverse.
 */
export function detectLang(text: string): Lang {
  return /[฀-๿]/.test(text) ? 'th' : 'en';
}

const say = (en: string, th: string): Bilingual => ({ en, th });

// ---------------------------------------------------------------------------
// Intent
// ---------------------------------------------------------------------------

export type Intent =
  | 'emergency'
  | 'recommend'
  | 'plan'
  | 'route'
  | 'price'
  | 'currency'
  | 'unknown';

export interface Filters {
  /** Habitats asked for, e.g. someone saying "nature" or "อาหาร". */
  layers: LayerKey[];
  /** They asked for somewhere quiet. Crowding then outranks everything. */
  quiet: boolean;
  /** They asked about air, or said they have asthma. */
  cleanAir: boolean;
}

export interface Reading {
  intent: Intent;
  filters: Filters;
  lang: Lang;
}

/** Words that mean a habitat, in both languages. Matched as substrings. */
const LAYER_WORDS: Record<LayerKey, string[]> = {
  Green: ['nature', 'green', 'waterfall', 'forest', 'jungle', 'hike', 'walk',
    'ธรรมชาติ', 'น้ำตก', 'ป่า', 'เดินป่า', 'สีเขียว'],
  Food: ['food', 'eat', 'lunch', 'dinner', 'hungry', 'restaurant', 'market',
    'กิน', 'อาหาร', 'ร้านอาหาร', 'หิว', 'ตลาด', 'ข้าว'],
  Wellness: ['spa', 'wellness', 'yoga', 'massage', 'relax', 'rest', 'calm',
    'สปา', 'โยคะ', 'นวด', 'พักผ่อน', 'ผ่อนคลาย', 'สุขภาพ'],
  Safe: ['beach', 'swim', 'sea', 'safe', 'sunset', 'sand',
    'ทะเล', 'หาด', 'ชายหาด', 'ว่ายน้ำ', 'ปลอดภัย', 'พระอาทิตย์'],
  Quest: ['quest', 'volunteer', 'help', 'clean', 'plant', 'mangrove',
    'ภารกิจ', 'อาสา', 'เก็บขยะ', 'ปลูก', 'ป่าชายเลน'],
};

/**
 * Emergency first, always, and matched on the whole word.
 *
 * Someone typing "help" gets 1669, not a beach. This runs before everything
 * else and a false positive here costs a wasted answer; a false negative costs
 * something this project is not willing to risk. But `help` is also the word
 * in "help me find lunch", so the check is deliberately narrow: a lone cry,
 * not any sentence containing the word.
 */
const EMERGENCY_WORDS = [
  'emergency', 'ambulance', 'accident', 'hospital', 'police', 'sos',
  'drowning', 'injured', 'bleeding', 'stolen', 'robbed',
  'ฉุกเฉิน', 'รถพยาบาล', 'อุบัติเหตุ', 'โรงพยาบาล', 'ตำรวจ',
  'จมน้ำ', 'บาดเจ็บ', 'เลือด', 'ขโมย', 'ช่วยด้วย',
];

const CRY_FOR_HELP = /^\s*(help|ช่วย|ช่วยด้วย)\s*!*\s*$/i;

/**
 * Does the sentence contain any of these words?
 *
 * Latin terms match on a WORD BOUNDARY; Thai matches as a plain substring,
 * because Thai is written without spaces between words and a boundary there
 * would match almost nothing.
 *
 * Naive `includes` was the first version and it was wrong twice over, both
 * caught by the tests: "cleanest air" matched `clean` and filed the question
 * under quests, so the answer was the mangrove rather than the place with the
 * cleanest air; and "airspeed velocity" matched `air`, so a nonsense question
 * came back as a confident recommendation. A matcher that fires on fragments
 * produces answers that are wrong in exactly the way that is hardest to
 * notice - fluent, specific, and about something else.
 */
const escape = (w: string): string => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The trailing `s?` covers English plurals: nobody types "what is a green
 * point". It cannot undo the boundary, because the boundary still has to fall
 * after it - "airspeed" fails `\bairs?\b` for the same reason it fails
 * `\bair\b`, since a letter follows either way.
 */
const has = (text: string, words: string[]): boolean =>
  words.some((w) => (/[a-z]/i.test(w)
    ? new RegExp(`\\b${escape(w)}s?\\b`, 'i').test(text)
    : text.includes(w)));

/**
 * A sentence to an intent and a set of filters.
 *
 * The one function a language model would ever replace. Everything downstream
 * of it only reads data, so whatever answers it, the answers stay bounded by
 * what the island actually contains.
 */
export function classify(input: string): Reading {
  const lang = detectLang(input);
  const t = input.toLowerCase();

  const filters: Filters = {
    layers: (Object.keys(LAYER_WORDS) as LayerKey[])
      .filter((layer) => has(t, LAYER_WORDS[layer])),
    quiet: has(t, ['quiet', 'empty', 'not crowded', 'avoid crowd', 'peaceful',
      'เงียบ', 'คนน้อย', 'ไม่พลุกพล่าน', 'สงบ']),
    cleanAir: has(t, ['air', 'asthma', 'smoke', 'breathe', 'pollution',
      'อากาศ', 'หอบหืด', 'ควัน', 'ฝุ่น', 'หายใจ']),
  };

  if (CRY_FOR_HELP.test(input) || has(t, EMERGENCY_WORDS)) {
    return { intent: 'emergency', filters, lang };
  }
  if (has(t, ['green point', 'trip point', 'currency', 'points mean', 'difference between',
    'แต้มสีเขียว', 'แต้มทริป', 'แต้มต่างกัน', 'สองแต้ม'])) {
    return { intent: 'currency', filters, lang };
  }
  if (has(t, ['plan my day', 'plan the day', 'what should i do today', 'itinerary',
    'จัดแผน', 'วางแผน', 'แผนวันนี้', 'ทำอะไรดี'])) {
    return { intent: 'plan', filters, lang };
  }
  if (has(t, ['how do i get', 'how to get', 'get there', 'how far', 'route', 'travel to',
    'ไปยังไง', 'เดินทาง', 'ไกลไหม', 'กี่กิโล'])) {
    return { intent: 'route', filters, lang };
  }
  if (has(t, ['how much', 'price', 'cost', 'cheap', 'expensive', 'budget',
    'ราคา', 'เท่าไหร่', 'กี่บาท', 'ถูก', 'แพง', 'งบ'])) {
    return { intent: 'price', filters, lang };
  }
  if (
    filters.layers.length > 0
    || filters.quiet
    || filters.cleanAir
    || has(t, ['where', 'recommend', 'suggest', 'go', 'visit', 'see',
      'ไปไหน', 'แนะนำ', 'ที่เที่ยว', 'ไปเที่ยว', 'น่าไป'])
  ) {
    return { intent: 'recommend', filters, lang };
  }
  return { intent: 'unknown', filters, lang };
}

// ---------------------------------------------------------------------------
// Answering
// ---------------------------------------------------------------------------

export interface Suggestion {
  placeId: string;
  name: Bilingual;
  /** The measurement this was chosen on. Never a feeling. */
  because: Bilingual;
  healthyScore: number;
}

export interface Reply {
  intent: Intent;
  lang: Lang;
  /** The sentence to show, in the language the question was asked in. */
  text: string;
  /** Places to render as cards. Empty for non-recommendation intents. */
  suggestions: Suggestion[];
  /** Emergency numbers, only ever populated for the emergency intent. */
  dial: { name: Bilingual; printed: string; dial: string }[];
  /** A screen the app should offer to open, when one answers better than text. */
  action: 'plan' | 'route' | 'price' | 'wallet' | 'safety' | null;
}

const pick = (b: Bilingual, lang: Lang): string => (lang === 'th' ? b.th : b.en);

/**
 * Why this place, in measurements.
 *
 * Ordered by what was asked for: somebody who said "quiet" is told how busy it
 * is, not how clean the air is. A reason that ignores the question is a reason
 * about the system rather than about the person.
 */
function reasonFor(place: ScoredPlace, filters: Filters): Bilingual {
  const crowd = crowdLabel(place.metrics.crowdDensity);
  if (filters.quiet) {
    return say(
      `${crowd.en} right now · ${place.metrics.crowdDensity.toFixed(1)} people per 100 m²`,
      `ตอนนี้${crowd.th} · ${place.metrics.crowdDensity.toFixed(1)} คนต่อ 100 ตร.ม.`,
    );
  }
  if (filters.cleanAir) {
    return say(
      `Air ${place.metrics.aqi} AQI, measured today`,
      `อากาศ ${place.metrics.aqi} AQI วัดวันนี้`,
    );
  }
  return say(
    `Healthy Score ${place.healthyScore} · ${crowd.en} · air ${place.metrics.aqi} AQI`,
    `คะแนนสุขภาพ ${place.healthyScore} · ${crowd.th} · อากาศ ${place.metrics.aqi} AQI`,
  );
}

/** Rank on what was asked for, then on the score. */
function rank(places: ScoredPlace[], filters: Filters): ScoredPlace[] {
  const wanted = filters.layers.length > 0
    ? places.filter((p) => filters.layers.includes(p.layer))
    : places;

  // Asking for a habitat the island has none of should say so, not silently
  // hand back the whole list as though the filter had been honoured.
  const pool = wanted.length > 0 ? wanted : [];

  return [...pool].sort((a, b) => {
    if (filters.quiet) return a.metrics.crowdDensity - b.metrics.crowdDensity;
    if (filters.cleanAir) return a.metrics.aqi - b.metrics.aqi;
    return b.healthyScore - a.healthyScore;
  });
}

export interface Context {
  places: ScoredPlace[];
  quests: Quest[];
}

/**
 * The answer.
 *
 * Pure: the same question against the same island always produces the same
 * reply, which is why this can be tested and why it behaves the same offline.
 */
export function answer(input: string, ctx: Context): Reply {
  const { intent, filters, lang } = classify(input);

  const base: Reply = { intent, lang, text: '', suggestions: [], dial: [], action: null };

  if (intent === 'emergency') {
    // No filtering, no cleverness, no delay. The four national lines, in the
    // order somebody in trouble needs them, plus the button that shares a
    // location. This is the one answer that must never be a paragraph.
    return {
      ...base,
      text: pick(say(
        'Call 1669 for an ambulance — free, 24 hours, answered anywhere in Thailand. '
        + '1155 is the Tourist Police and they speak English. '
        + 'The Safety tab shares your live location while you talk.',
        'โทร 1669 เรียกรถพยาบาล ฟรี ตลอด 24 ชั่วโมง รับสายทั่วประเทศ '
        + '1155 คือตำรวจท่องเที่ยว พูดภาษาอังกฤษได้ '
        + 'แท็บความปลอดภัยจะแชร์ตำแหน่งคุณระหว่างที่คุยสาย',
      ), lang),
      dial: SAMUI_EMERGENCY
        .filter((n) => n.scope === 'national')
        .map((n) => ({ name: n.name, printed: n.printed, dial: n.dial })),
      action: 'safety',
    };
  }

  if (intent === 'currency') {
    return {
      ...base,
      text: pick(say(
        'Green Points come only from a quest a host approved — that is why they are the '
        + 'ones that count toward an impact figure. Trip Points come from checking in '
        + 'somewhere: real, spendable, and never counted as verified.',
        'แต้มสีเขียวได้จากภารกิจที่ผู้จัดยืนยันแล้วเท่านั้น จึงเป็นแต้มเดียวที่นับเข้ารายงานผลกระทบได้ '
        + 'ส่วนแต้มทริปได้จากการเช็กอิน ใช้ได้จริง แต่ไม่นับว่าผ่านการตรวจสอบ',
      ), lang),
      action: 'wallet',
    };
  }

  if (intent === 'plan') {
    return {
      ...base,
      text: pick(say(
        'I can build the whole day — it reads your profile, today’s air and where the '
        + 'quests are, and every stop tells you why it is there.',
        'จัดให้ได้ทั้งวัน โดยดูจากโปรไฟล์ของคุณ อากาศวันนี้ และตำแหน่งภารกิจ '
        + 'ทุกจุดจะบอกด้วยว่าทำไมถึงเลือกที่นั่น',
      ), lang),
      action: 'plan',
    };
  }

  if (intent === 'route') {
    return {
      ...base,
      text: pick(say(
        'Tell me which place and I will route it — it separates waiting from moving, '
        + 'so a ferry that leaves in 40 minutes is not shown as a 40 minute journey.',
        'บอกชื่อสถานที่มาได้เลย ระบบจะคำนวณเส้นทางให้ โดยแยกเวลารอออกจากเวลาเดินทาง '
        + 'เรือที่ออกอีก 40 นาที จะไม่ถูกนับเป็นเดินทาง 40 นาที',
      ), lang),
      action: 'route',
    };
  }

  if (intent === 'price') {
    return {
      ...base,
      text: pick(say(
        'I can show a price band with what moves it and how confident it is. '
        + 'Never a single number — nobody can promise you one.',
        'ดูช่วงราคาให้ได้ พร้อมบอกว่าอะไรทำให้ราคาขยับและมั่นใจแค่ไหน '
        + 'ไม่ให้เป็นตัวเลขเดียว เพราะไม่มีใครรับประกันได้',
      ), lang),
      action: 'price',
    };
  }

  if (intent === 'recommend') {
    const ranked = rank(ctx.places, filters);

    if (ranked.length === 0) {
      // Asked for something the island does not have. Say that, and say what
      // it does have, rather than quietly answering a different question.
      const available = [...new Set(ctx.places.map((p) => p.layer))].join(', ');
      return {
        ...base,
        text: pick(say(
          `Nothing on the island matches that yet. Right now I can suggest: ${available}.`,
          `ยังไม่มีที่ไหนบนเกาะตรงกับที่ถามมา ตอนนี้แนะนำได้: ${available}`,
        ), lang),
      };
    }

    const top = ranked.slice(0, 3);
    const lead = top[0]!;
    const head = filters.quiet
      ? say('Quietest right now', 'เงียบที่สุดตอนนี้')
      : filters.cleanAir
        ? say('Cleanest air right now', 'อากาศดีที่สุดตอนนี้')
        : say('Best scoring right now', 'คะแนนดีที่สุดตอนนี้');

    return {
      ...base,
      text: `${pick(head, lang)} — ${pick(lead.name, lang)}. ${pick(reasonFor(lead, filters), lang)}`,
      suggestions: top.map((p) => ({
        placeId: p.id,
        name: p.name,
        because: reasonFor(p, filters),
        healthyScore: p.healthyScore,
      })),
    };
  }

  // Unknown. Say what CAN be answered — a chat that only says "I don't
  // understand" teaches the user to stop typing.
  return {
    ...base,
    text: pick(say(
      'I can suggest where to go — try “somewhere quiet”, “good air”, “food”, or '
      + '“a beach”. I can also plan your day, price a trip, or find help fast.',
      'แนะนำที่เที่ยวได้ ลองพิมพ์ “ที่เงียบ ๆ”, “อากาศดี”, “ร้านอาหาร” หรือ “ทะเล” '
      + 'จัดแผนวัน ดูราคา หรือหาความช่วยเหลือด่วนก็ได้',
    ), lang),
  };
}

/**
 * Openers shown before the first message.
 *
 * Real questions the engine can actually answer, in both languages. A chat
 * that opens with an empty box makes the user guess what it is for, and they
 * usually guess something it cannot do.
 */
export const OPENERS: Bilingual[] = [
  say('Somewhere quiet', 'ที่เงียบ ๆ'),
  say('Where has the cleanest air?', 'ที่ไหนอากาศดีที่สุด'),
  say('I want a beach', 'อยากไปทะเล'),
  say('Somewhere to eat', 'หาร้านอาหาร'),
  say('Plan my day', 'จัดแผนวันนี้ให้หน่อย'),
  say('What are Green Points?', 'แต้มสีเขียวคืออะไร'),
];
