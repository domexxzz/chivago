import { strict as assert } from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { openTestDb, type DB } from './db-node.ts';
import {
  AdventureCmsError, addAdventureChapter, addAdventureNode, adventureContentDetail,
  cloneAdventureToDraft, createAdventureContent, setAdventureContentStatus, validateAdventureForPublish,
} from './adventure-cms-service.ts';

let db: DB;
const now = new Date('2026-11-21T00:00:00.000Z');
const texts = {
  titleEn: 'Island clues', titleTh: 'เบาะแสรอบเกาะ', titleZh: '岛屿线索',
  summaryEn: 'Follow verified places.', summaryTh: 'สำรวจสถานที่ที่ตรวจสอบได้', summaryZh: '探索经验证的地点。',
};

beforeEach(() => {
  db = openTestDb();
  db.prepare("INSERT INTO hosts (id,name,type,role) VALUES ('admin','Admin','community','admin')").run();
  db.prepare(`INSERT INTO places
    (id,name_en,name_th,short,layer,lat,lng,meta,blurb_en,blurb_th,tags,safety_label_en,safety_label_th,crowd_density,aqi,safety_index,walkability)
    VALUES ('place','Place','สถานที่','Place','culture',13.1,100.8,'','','','[]','','',0,0,80,70)`).run();
});
describe('Adventure CMS', () => {
  test('publishes only complete, translated content and stores immutable versions', () => {
    createAdventureContent(db, 'admin', { id: 'island-clues', areaKey: 'koh-sichang', coverPlaceId: 'place', ...texts }, now);
    assert.deepEqual(validateAdventureForPublish(db, 'island-clues'), ['At least one chapter is required.']);
    assert.throws(
      () => setAdventureContentStatus(db, 'admin', 'island-clues', 'published', now),
      (error: unknown) => error instanceof AdventureCmsError && error.code === 'ADVENTURE_PUBLISH_INVALID',
    );
    addAdventureChapter(db, 'admin', 'island-clues', { id: 'island-clues-01', position: 0, ...texts }, now);
    addAdventureNode(db, 'admin', 'island-clues', 'island-clues-01', {
      id: 'island-clues-place', position: 0, placeId: 'place', verificationKind: 'checkin',
      ...texts,
      storyEn: 'Look around.', storyTh: 'มองไปรอบ ๆ', storyZh: '环顾四周。',
      instructionEn: 'Verify your visit.', instructionTh: 'ยืนยันการเดินทาง', instructionZh: '验证到访。',
    }, now);
    assert.deepEqual(validateAdventureForPublish(db, 'island-clues'), []);
    setAdventureContentStatus(db, 'admin', 'island-clues', 'published', now);
    const detail = adventureContentDetail(db, 'island-clues');
    assert.equal(detail.arc.status, 'published');
    assert.equal(detail.arc.version, 4);
    assert.throws(
      () => addAdventureChapter(db, 'admin', 'island-clues', { id: 'later', position: 1, ...texts }, now),
      /immutable/,
    );
    assert.equal((db.prepare('SELECT COUNT(*) n FROM adventure_content_versions WHERE arc_id=?').get('island-clues') as { n: number }).n, 4);
    assert.equal((db.prepare("SELECT COUNT(*) n FROM admin_audit_log WHERE target_type='adventure'").get() as { n: number }).n, 4);
  });

  test('clones published content to a new editable draft without changing original node ids', () => {
    createAdventureContent(db, 'admin', { id: 'source-arc', areaKey: 'koh-sichang', coverPlaceId: 'place', ...texts }, now);
    addAdventureChapter(db, 'admin', 'source-arc', { id: 'source-chapter', position: 0, ...texts }, now);
    addAdventureNode(db, 'admin', 'source-arc', 'source-chapter', {
      id: 'source-node', position: 0, placeId: 'place', verificationKind: 'checkin', ...texts,
      storyEn: 'Story', storyTh: 'เรื่อง', storyZh: '故事',
      instructionEn: 'Go', instructionTh: 'ไป', instructionZh: '前往',
    }, now);
    addAdventureChapter(db, 'admin', 'source-arc', { id: 'source-chapter-two', position: 1, ...texts }, now);
    addAdventureNode(db, 'admin', 'source-arc', 'source-chapter-two', {
      id: 'source-node-two', position: 0, placeId: 'place', verificationKind: 'checkin', ...texts,
      storyEn: 'Story two', storyTh: 'เรื่องสอง', storyZh: '故事二',
      instructionEn: 'Continue', instructionTh: 'ไปต่อ', instructionZh: '继续',
    }, now);
    setAdventureContentStatus(db, 'admin', 'source-arc', 'published', now);
    const draft = cloneAdventureToDraft(db, 'admin', 'source-arc', 'source-arc-v2', now);
    assert.equal(draft.status, 'draft');
    assert.equal(draft.version, 1);
    const cloned = adventureContentDetail(db, draft.id);
    assert.equal(cloned.chapters.length, 2);
    assert.equal(cloned.chapters[0]!.nodes.length, 1);
    assert.notEqual(cloned.chapters[0]!.nodes[0]!.id, 'source-node');
    assert.notEqual(cloned.chapters[0]!.nodes[0]!.id, cloned.chapters[1]!.nodes[0]!.id);
    assert.equal(adventureContentDetail(db, 'source-arc').arc.status, 'published');
  });
});
