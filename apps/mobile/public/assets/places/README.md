# Place photographs · รูปสถานที่

รูปที่ทีมถ่ายเองของสถานที่ในแอป วางไฟล์ไว้ในโฟลเดอร์นี้ Expo คัดลอกทั้งโฟลเดอร์
`public/` เข้า export ทุกครั้ง ไฟล์จึงไปอยู่ที่ `/assets/places/` ของเว็บ (ทั้งเดโม
สาธารณะบน Vercel และเซิร์ฟเวอร์จริงบน Fly ซึ่งเสิร์ฟ `/assets/*` จาก export เดียวกัน)
ตรวจแล้ว 8 ก.ย.: ไฟล์ทดสอบในโฟลเดอร์นี้โผล่ที่ `dist-demo/assets/places/` หลัง `demo:web`

Photographs the team took of the app's places. Drop the files here; Expo copies
the whole `public/` folder into every web export, so they land at
`/assets/places/` — on the public demo on Vercel and on the live server on Fly,
which serves `/assets/*` from the same export. Checked on 8 September: a test
file placed here appeared under `dist-demo/assets/places/` after `demo:web`.

## กติกา · The rules

- **ต้องเป็นรูปของสถานที่นั้นจริง** ถ่ายเอง หรือมีสิทธิ์ใช้ชัดเจน รูปจากเว็บ
  มหาวิทยาลัย เฟซบุ๊ก หรือกูเกิล ใช้ไม่ได้ถ้าไม่มีอนุญาตเป็นลายลักษณ์อักษร
  · A real photograph of that place, taken by us or licensed in writing.
  Nothing lifted from the university's site, Facebook or a search.
- **ไม่มีหน้าคนที่ไม่ยินยอม** · No face that did not agree (docs/46, PDPA).
- **ชื่อไฟล์ = id ของสถานที่** ใน `packages/core/src/seed.ts`: `ku-library.jpg`,
  `ku-park.jpg`, `ku-viewpoint.jpg`, `ku-sports.jpg`, `ku-shops.jpg`,
  `ku-building13.jpg`
- **แนวนอน 16:9** กว้าง 1600 px JPEG คุณภาพ 80 (ไฟล์ละไม่เกิน 400 KB) แอปครอปตรงกลาง
  · Landscape 16:9, 1600 px wide, JPEG at quality 80, under 400 KB; the app crops to the centre.

## ต่อสายเข้าแอป · Wiring it in

ใน `packages/core/src/seed.ts` เติม `photo` ของสถานที่นั้น (แทน `photo: null`)
· In `packages/core/src/seed.ts`, give the place its `photo` in place of `photo: null`:

```ts
photo: {
  url: '/assets/places/ku-library.jpg',
  credit: 'ChivaGo team · KU Sriracha',
  licence: 'Team photograph · used with permission',
  sourceUrl: 'https://github.com/domexxzz/chivago/tree/main/apps/mobile/public/assets/places',
},
```

URL ที่ขึ้นต้นด้วย `/` คือไฟล์บน origin เดียวกับหน้าเว็บ บนโทรศัพท์แอปจะเติม
ที่อยู่ของ API ให้เอง (`photoUri` ใน `apps/mobile/src/api/photos.ts`)
· A URL beginning with `/` is a file on the page's own origin; on a phone the
app prefixes the API's address itself.

แล้ว · Then:

```bash
pnpm -r test && pnpm typecheck
fly ssh console --app chivago -C "node --experimental-strip-types apps/api/src/seed-db.ts"   # อัปเดตแถวเดิม (ON CONFLICT DO UPDATE)
fly deploy --app chivago                                                                       # export ใหม่พร้อมไฟล์รูป
pnpm --filter @chivago/api demo:capture && cd apps/mobile && pnpm demo:web && pnpm demo:deploy   # เดโมสาธารณะ
```

เทสต์ `apps/mobile/test/place-photos.test.ts` จะล้มถ้า seed ชี้ไฟล์ที่ไม่มีอยู่ในโฟลเดอร์นี้
· The test in `apps/mobile/test/place-photos.test.ts` fails when the seed names a
file that is not here.
