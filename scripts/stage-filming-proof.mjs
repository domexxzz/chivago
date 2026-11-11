/**
 * Puts one pending submission into the host console queue, so the approval
 * shot can be filmed (docs/71, shots 11-13). One run = one take.
 *
 *   node scripts/stage-filming-proof.mjs
 *
 * LOCAL ONLY. It backdates the arrival timestamp in the local SQLite file so
 * the ten-minute dwell guard in `presence.ts` is satisfied without waiting ten
 * minutes. That is a real check doing its job; this writes around it the way
 * `seed-showcase.ts` backdates its demo check-ins, and for the same reason.
 * Never point it at the pilot server.
 *
 * The proof photo is the team's own photograph OF THE PLACE THE QUEST IS AT,
 * so nothing that appears on camera claims to be somewhere it is not.
 */
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const API = process.env.CHIVAGO_API ?? 'http://localhost:8787';
const DB = process.env.CHIVAGO_DB ?? 'apps/api/data/chivago.db';
const QUEST = 'q7';                 // เก็บขยะรอบจุดชมวิวสะพานดาว · host h-ku-chivago
const LAT = 13.12189, LNG = 100.92055;
const PHOTO = 'apps/mobile/dist/media/places/ku-viewpoint.jpg';

if (!/localhost|127\.0\.0\.1/.test(API)) {
  console.error(`refusing to stage against ${API} — this script is for a local API only`);
  process.exit(1);
}

const post = async (path, { key, json } = {}) => {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { 'x-chivago-device-key': key } : {}) },
    body: JSON.stringify(json ?? {}),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) { console.error(`FAIL ${path} [${res.status}]`, JSON.stringify(body)); process.exit(1); }
  return body;
};

const device = (await post('/devices', {
  json: { displayName: 'นักท่องเที่ยวตัวอย่าง (อัดคลิป)', label: 'filming', locale: 'th' },
})).data;
const key = device.deviceKey;

await post(`/quests/${QUEST}/join`, { key });
await post(`/quests/${QUEST}/arrive`, { key, json: { lat: LAT, lng: LNG, accuracyM: 12, mocked: false } });

// the dwell guard, satisfied by moving the clock back rather than waiting
const db = new DatabaseSync(DB);
const back = new Date(Date.now() - 16 * 60 * 1000).toISOString();
db.prepare('UPDATE quest_progress SET joined_at=?, arrived_at=? WHERE user_id=? AND quest_id=?')
  .run(back, back, device.userId, QUEST);

const bytes = await readFile(PHOTO);
const form = new FormData();
form.append('photo', new File([bytes], 'ku-viewpoint.jpg', { type: 'image/jpeg' }));
form.append('meta', JSON.stringify([{ lat: LAT, lng: LNG, takenAt: new Date().toISOString() }]));
form.append('position', JSON.stringify({ lat: LAT, lng: LNG, accuracyM: 12, mocked: false }));
form.append('weightKg', '3.5');

const res = await fetch(`${API}/quests/${QUEST}/proof`, {
  method: 'POST', headers: { 'x-chivago-device-key': key }, body: form,
});
const out = await res.json().catch(() => null);
if (!res.ok) { console.error('FAIL proof', res.status, JSON.stringify(out)); process.exit(1); }

const link = await post('/account/link-code', { key });

console.log('staged one pending submission');
console.log(`  console      ${API}/console`);
console.log(`  proof page   ${API}/console/proof/${out.data.proofId}`);
console.log(`  reward       +120 green, released only when the host approves`);
console.log(`  traveller    ${device.userId}`);
console.log(`  device key   ${key}`);
console.log(`  link code    ${link.data.code}  (valid ${Math.round(link.data.expiresInMs / 60000)} min)`);
