import { rows, transact, type DB } from './db.ts';

const ARC_ID = 'koh-sichang-first-journey';
const CHAPTER_ID = 'koh-sichang-first-journey-01';
const PUBLISHED_AT = '2026-11-20T00:00:00.000Z';

const nodes = [
  {
    id: 'ks-memory-route-palace', placeId: 'sc-palace', position: 0,
    title: ['Begin at the palace grounds', 'เริ่มต้นที่พระราชวัง', '从王宫旧址启程'],
    story: [
      'Begin slowly. Look around the grounds and choose one detail you want to remember from this journey.',
      'เริ่มต้นอย่างไม่รีบร้อน มองไปรอบพื้นที่ แล้วเลือกหนึ่งรายละเอียดที่คุณอยากจดจำจากการเดินทางครั้งนี้',
      '慢慢开始，环顾四周，选一个你想从这次旅程中记住的细节。',
    ],
    instruction: [
      'Visit the place and complete a verified check-in.',
      'เดินทางไปยังสถานที่และเช็กอินให้ผ่านการตรวจสอบ',
      '前往该地点并完成经验证的签到。',
    ],
  },
  {
    id: 'ks-memory-route-atsadang', placeId: 'sc-atsadang-bridge', position: 1,
    title: ['A bridge beside the sea', 'สะพานริมทะเล', '海边的桥'],
    story: [
      'Follow the coast to the next stop. Notice how the route changes when the island meets the sea.',
      'เดินตามแนวชายฝั่งไปยังจุดถัดไป แล้วสังเกตว่าเส้นทางเปลี่ยนไปอย่างไรเมื่อเกาะมาบรรจบกับทะเล',
      '沿着海岸前往下一站，观察岛屿与海洋相遇时路线如何变化。',
    ],
    instruction: [
      'Reach Atsadang Bridge and complete a verified check-in.',
      'เดินทางถึงสะพานอัษฎางค์และเช็กอินให้ผ่านการตรวจสอบ',
      '抵达阿萨当桥并完成经验证的签到。',
    ],
  },
  {
    id: 'ks-memory-route-khao-khat', placeId: 'sc-chong-khao-khat', position: 2,
    title: ['The western viewpoint', 'มุมมองฝั่งตะวันตก', '西岸观景点'],
    story: [
      'A different side of the island is waiting. Pause here and compare this view with the coast you just left.',
      'อีกด้านหนึ่งของเกาะกำลังรออยู่ หยุดพักตรงนี้แล้วลองเปรียบเทียบวิวกับชายฝั่งที่เพิ่งเดินทางผ่านมา',
      '岛屿的另一面正在等待。停下来，把这里的景色与刚离开的海岸作比较。',
    ],
    instruction: [
      'Reach Chong Khao Khat and complete a verified check-in.',
      'เดินทางถึงช่องเขาขาดและเช็กอินให้ผ่านการตรวจสอบ',
      '抵达崇考卡并完成经验证的签到。',
    ],
  },
  {
    id: 'ks-memory-route-shrine', placeId: 'sc-chao-pho-khao-yai', position: 3,
    title: ['A quiet stop above the island', 'จุดพักสงบบนเกาะ', '岛上的宁静一站'],
    story: [
      'Travel with care and respect. Let this stop be a moment to notice the people and places that care for the island.',
      'เดินทางอย่างระมัดระวังและเคารพสถานที่ ใช้ช่วงเวลานี้สังเกตผู้คนและพื้นที่ที่ช่วยกันดูแลเกาะ',
      '带着尊重与谨慎旅行，用这一刻留意共同守护岛屿的人与地方。',
    ],
    instruction: [
      'Reach Chao Pho Khao Yai Shrine and complete a verified check-in.',
      'เดินทางถึงศาลเจ้าพ่อเขาใหญ่และเช็กอินให้ผ่านการตรวจสอบ',
      '抵达考艾神庙并完成经验证的签到。',
    ],
  },
  {
    id: 'ks-memory-route-thamphang', placeId: 'sc-thamphang', position: 4,
    title: ['The final page by the water', 'หน้าสุดท้ายริมทะเล', '海边的最后一页'],
    story: [
      'End the chapter by the water. Choose what this route meant to you and keep it in your trip journal.',
      'จบบทนี้ริมทะเล เลือกว่าสิ่งใดจากเส้นทางนี้มีความหมายกับคุณ แล้วเก็บไว้ในสมุดบันทึกทริป',
      '在海边结束这一章，选出这段路线对你的意义，并把它留在旅行日志中。',
    ],
    instruction: [
      'Reach Tham Phang Beach and complete a verified check-in.',
      'เดินทางถึงหาดถ้ำพังและเช็กอินให้ผ่านการตรวจสอบ',
      '抵达谭庞海滩并完成经验证的签到。',
    ],
  },
] as const;

/**
 * Plant one editable, database-backed pilot arc after the real place catalogue
 * exists. INSERT OR IGNORE protects operator edits and published content.
 */
export function bootstrapKohSichangAdventure(db: DB): { inserted: number; skipped: boolean } {
  const required = new Set(nodes.map((node) => node.placeId));
  const existing = new Set(rows<{ id: string }>(
    db.prepare(`SELECT id FROM places WHERE id IN (${nodes.map(() => '?').join(',')})`).all(...required),
  ).map((place) => place.id));
  if ([...required].some((id) => !existing.has(id))) return { inserted: 0, skipped: true };

  return transact(db, () => {
    let inserted = 0;
    inserted += Number(db.prepare(
      `INSERT OR IGNORE INTO adventure_arcs
       (id,area_key,status,title_en,title_th,title_zh,summary_en,summary_th,summary_zh,cover_place_id,created_at,published_at)
       VALUES (?, ?, 'published', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      ARC_ID, 'koh-sichang',
      'The Koh Sichang Memory Route', 'เส้นทางความทรงจำเกาะสีชัง', '阁西昌岛记忆之旅',
      'Explore real places, follow one clue at a time, and keep the moments that matter to you.',
      'สำรวจสถานที่จริง ตามเบาะแสทีละจุด และเก็บช่วงเวลาที่มีความหมายสำหรับคุณ',
      '探索真实地点，逐一追寻线索，收藏对你有意义的时刻。',
      'sc-palace', PUBLISHED_AT, PUBLISHED_AT,
    ).changes ?? 0);
    inserted += Number(db.prepare(
      `INSERT OR IGNORE INTO adventure_chapters
       (id,arc_id,position,title_en,title_th,title_zh,summary_en,summary_th,summary_zh,created_at)
       VALUES (?,?,0,?,?,?,?,?,?,?)`,
    ).run(
      CHAPTER_ID, ARC_ID,
      'Chapter 1 · Traces around the island', 'บทที่ 1 · ร่องรอยรอบเกาะ', '第 1 章 · 环岛足迹',
      'Five real places form one journey. Each verified stop opens the next page.',
      'สถานที่จริงห้าแห่งเชื่อมเป็นหนึ่งการเดินทาง เมื่อผ่านการตรวจสอบแต่ละจุด หน้าถัดไปจะเปิดขึ้น',
      '五个真实地点串成一次旅程，每个通过验证的站点都会开启下一页。',
      PUBLISHED_AT,
    ).changes ?? 0);

    const insertNode = db.prepare(
      `INSERT OR IGNORE INTO adventure_nodes
       (id,chapter_id,position,place_id,title_en,title_th,title_zh,story_en,story_th,story_zh,
        instruction_en,instruction_th,instruction_zh,verification_kind,optional,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'checkin',0,?)`,
    );
    for (const node of nodes) {
      inserted += Number(insertNode.run(
        node.id, CHAPTER_ID, node.position, node.placeId,
        ...node.title, ...node.story, ...node.instruction, PUBLISHED_AT,
      ).changes ?? 0);
    }
    return { inserted, skipped: false };
  });
}
