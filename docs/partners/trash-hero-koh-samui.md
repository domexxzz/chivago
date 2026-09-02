# Trash Hero Koh Samui — ข้อเสนอความร่วมมือ / Partnership proposal

**สถานะ: ร่างสำหรับส่ง ยังไม่ได้ส่ง** · Draft, not yet sent. Nothing in the app
refers to Trash Hero until they have agreed; a host record for an organisation
that has not said yes would be a fabricated record.

## ช่องทางติดต่อที่ตรวจแล้ว / Verified contact (2 Sep 2026)

| | |
|---|---|
| Email | kohsamui@trashhero.org |
| Facebook (ช่องทางที่เขาบอกว่าดีที่สุด) | https://www.facebook.com/TrashHeroKohSamui/ |
| Instagram | https://www.instagram.com/trashherokohsamui/ |
| นัดประจำ | ทุกวันอาทิตย์ 16:00 — "There is no cost, no sign-up, just show up! Cleaning materials are provided." |
| เครือข่าย | หนึ่งใน 17 chapter ของ Trash Hero Thailand (ตรวจจาก trashhero.org/our-network) |
| สิ่งที่เขารับ | "donations in kind for cleaning materials, refreshments for volunteers, and transportation. You can also participate by sending staff to our cleanups, or becoming a bottle refill station." |

**ข้อควรระวัง:** หน้า chapter บนเว็บไม่ได้อัปเดตตั้งแต่ 31 ม.ค. 2018
ให้ยืนยันบน Facebook ก่อนว่านัดวันอาทิตย์ยังเดินอยู่ แล้วค่อยส่ง

---

## ข้อความที่จะส่ง (ภาษาไทย)

เรียน ทีม Trash Hero Koh Samui

ผม/ดิฉันชื่อ ______ ทำแอปชื่อ ChivaGo สำหรับนักท่องเที่ยวบนเกาะสมุย
แอปนี้ให้แต้มกับการกระทำที่**มีคนตรวจแล้วจริง** ไม่ใช่การเช็คอินเฉย ๆ
กิจกรรมเก็บขยะทุกวันอาทิตย์ของ Trash Hero คือสิ่งที่เราอยากให้เป็นภารกิจแรกของแอป

สิ่งที่เราขอจาก Trash Hero มีอย่างเดียว คือ **การกดยืนยัน**
หลังกิจกรรม อาสาสมัครที่ใช้แอปจะถ่ายรูปในพื้นที่กิจกรรม (แอปตรวจพิกัดเอง)
แล้วผู้ประสานงานของ Trash Hero กดอนุมัติในหน้าเว็บที่เราเตรียมให้ ใช้เวลาไม่ถึงหนึ่งนาทีต่อคน
แต้มจะออกก็ต่อเมื่อ Trash Hero กดเท่านั้น และชื่อ Trash Hero จะปรากฏบนทุกแต้มที่ออก

สิ่งที่ Trash Hero จะได้:

- **บันทึกจำนวนคนและจำนวนครั้งที่ตรวจแล้ว** ที่แก้ย้อนหลังไม่ได้ ใช้ยื่นขอสปอนเซอร์หรือรายงานได้
- **นักท่องเที่ยวรู้จักนัดวันอาทิตย์** ผ่านแอปโดยไม่ต้องหาใน Facebook
- **ไม่ต้องลงทะเบียนอาสาสมัคร** กิจกรรมยังเป็น "แค่มา" เหมือนเดิม คนที่ไม่ใช้แอปก็มาได้ตามปกติ
- **ไม่มีค่าใช้จ่าย** และเราไม่ขอข้อมูลอาสาสมัครจาก Trash Hero เลย

สิ่งที่เรา**ไม่ทำ** และอยากบอกไว้ก่อน: เราจะไม่แปลงกิจกรรมนี้เป็นคาร์บอนเครดิต
ไม่อ้างว่าเป็นการรับรองโดยผู้ตรวจอิสระ และไม่ใช้ชื่อ Trash Hero กับอะไรที่ Trash Hero ไม่ได้กดยืนยันเอง

ถ้าสนใจ ผม/ดิฉันขอไปร่วมเก็บขยะวันอาทิตย์หน้าก่อน แล้วค่อยคุยกันหลังกิจกรรม

ขอบคุณครับ/ค่ะ
______ · โทร ______ · LINE ______

---

## The message (English)

Dear Trash Hero Koh Samui team,

My name is ______. I am building ChivaGo, an app for travellers on Koh Samui
that pays points only for actions **somebody actually verified** — not for
checking in. Your Sunday cleanup is the activity we most want as the app's
first quest.

We ask one thing of Trash Hero: **a tap.** After a cleanup, a volunteer using
the app photographs the site (the app checks the position itself), and a Trash
Hero coordinator approves it on a web page we provide — under a minute per
person. Points are released only when Trash Hero taps, and Trash Hero's name
is on every point released.

What Trash Hero gets:

- **A tamper-proof count of verified people and sessions**, usable in sponsor
  applications and reports
- **Travellers who find the Sunday cleanup in the app** without searching
  Facebook
- **No volunteer registration.** The cleanup stays "just show up"; people
  without the app come as they always have
- **No cost**, and we ask Trash Hero for no volunteer data at all

What we will **not** do, stated up front: we will not convert this into carbon
credits, will not describe it as independently assured, and will not put Trash
Hero's name on anything Trash Hero did not itself approve.

If this is interesting, I would like to join a Sunday cleanup first and talk
afterwards.

Thank you,
______ · phone ______ · LINE ______

---

## หลังจากเขาตอบตกลง / Once they say yes

1. `pnpm --filter @chivago/api host:add --id h-trash-hero-samui --name "Trash Hero Koh Samui" --type ngo`
   — creates the host and prints its console key **once**. Hand it to the
   coordinator in person, not over Facebook.
2. Add the recurring Sunday quest to the seed with `host: trashHero`, a
   geofence around the meeting beach (confirm the exact beach on Facebook —
   it moves), `kind: 'weekend'`, and a reward the sponsor has actually agreed
   to fund. Do not invent the number.
3. The coordinator signs in at `/console/login`, sees the queue, and approves
   or rejects with a named reason. The 24-hour SLA sweep covers the rest.
4. Their first approved proof is the first Green Point in the pilot that a
   real organisation vouched for. Everything before it was seed data.
