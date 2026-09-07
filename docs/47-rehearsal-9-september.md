# 47 — The rehearsal, Wednesday 9 September

Day five of docs/42: the whole flow on the campus, on the room's own Wi-Fi,
with five phones, until it passes three times in a row. This is the sheet for
that day - what to bring, what to do in which order, what to write down, and
what counts as a pass. Thai first on every line, because it is read on a phone
in the room; the English is the same line, for the docs.

A tick-box version of the same sheet, for phones, is at
https://claude.ai/code/artifact/2501375b-ded3-4277-adfa-63129b276861
(ซ้อมใหญ่ 9 กันยา; ticks stay on the phone that made them); this file is the
source.

**As of Monday 7 September, 17:40** `https://chivago.fly.dev/health` does not
answer: the deployment in docs/46 has not happened. Without it, Wednesday
rehearses the static demo only (option A) and nothing in section 3 can run.
It is the one line on this sheet with a hard deadline, and it is the team's:
this machine has no Fly account.

## 0 · ก่อนวันพุธ · Before Wednesday — deadline Tue 8 Sep, 20:00

- [ ] API ขึ้น Fly แล้ว จาก `main` ล่าสุด (มี fix แผนที่ 3a75d2d): `https://chivago.fly.dev/health` ตอบ 200
      · The live API is up, built from current `main`, and answers (docs/46, steps 1–3)
- [ ] seed แล้ว จดคีย์ 2 ดอกบนกระดาษ ไม่ใช่ในแชต: ทีม (h-ku-chivago) และ moderator
      · Seed keys written on paper, not in chat: the team's and the platform host's (the moderator)
- [ ] รัน demo reset บน Fly หลัง seed: `fly ssh console -C "node --experimental-strip-types apps/api/src/reset-demo.ts --walk"` ต้องเห็น PASS ทุกจอ และ `Standing #1 of 2` (นักเดินทางคนที่สองที่ทำภารกิจผ่านการตรวจ คือสิ่งที่ทำให้อันดับเป็นอันดับจริง)
      · Run the demo reset on Fly after the seed; the walk must print PASS on every screen, Standing #1 of 2 — the second traveller with one approved quest is what makes the standing a ranking
- [ ] ทันทีหลัง reset ก่อนเครื่องไหนเปิดแอป: ขอรหัสผูกเครื่องของ demo-user ด้วย `curl -s -X POST https://chivago.fly.dev/account/link-code -H "x-chivago-user: demo-user"` (ได้ `code` ใช้ได้ 10 นาที; header นี้ใช้ได้เฉพาะตอนยังไม่มีเครื่องไหนลงทะเบียน) แล้วบนโทรศัพท์เวที: ไอคอนโปรไฟล์ → ฟันเฟือง → "มีรหัสอยู่แล้ว?" → ใส่รหัส → เครื่องบนเวทีกลายเป็น demo-user (ต้องเห็น 1,850 G, อันดับ #1 จาก 2 คน, เหรียญ 5/7)
      · Immediately after the reset, before any phone opens the app, ask for demo-user's link code by header (open only while no device exists); enter it on the stage phone under Profile → gear → "Already have a code?" — the stage phone becomes the demo traveller: 1,850 G, #1 of 2, 5/7 medals
- [ ] ถ้ามีเครื่องลงทะเบียนไปก่อนขอรหัส: รัน reset อีกครั้ง (ล้าง device_keys) แล้วทำข้อบนใหม่
      · If a phone registered before the code was asked for: reset again and repeat
- [ ] ตั้ง secrets: `CHIVAGO_EVENT_TOKEN` (32 ตัวอักษรสุ่ม) และ `CHIVAGO_REGISTRATIONS_PER_HOUR=500`
      · Secrets set: the event token and the registration limit for the day
- [ ] สร้าง QR ด้วย token จริง แล้วพิมพ์กระดาษธรรมดา 6 ใบ (ห้อง 1 + สถานที่ 5) ห้าม commit รูป
      · `python scripts/event-qr.py https://chivago.fly.dev --token … --out qr/` — six codes on plain paper for the rehearsal; never commit the images
- [ ] โทรศัพท์เวที: เปิด `https://chivago.fly.dev/console/stories` ล็อกอินด้วยคีย์ moderator ค้างไว้
      · Stage phone signed in as the moderator on the stories page — a moderator sees every queue and has the door (one key on stage is enough)
- [ ] โน้ตบุ๊กโปรเจกเตอร์: เปิด `https://chivago.fly.dev/board/ku-sriracha` เต็มจอ ปิด sleep ปิด notification
      · Board laptop: full screen, sleep off, notifications off
- [ ] นัดคนดูแลห้องของ มก. ให้อยู่ตอนซ้อม: รหัส Wi-Fi, captive portal, โปรเจกเตอร์, ปลั๊ก
      · The venue contact present: Wi-Fi password, captive portal, projector, power
- [ ] วิดีโอสำรอง: ยังไม่มี อัดวันพุธ (ข้อ 5)
      · Backup recording: none yet; made on Wednesday (section 5)

## 1 · ของที่ต้องเอาไป · Kit

- [ ] โทรศัพท์ 5 เครื่อง: iOS อย่างน้อย 2, Android อย่างน้อย 2, อย่างน้อย 1 เครื่องที่ไม่เคยเปิด ChivaGo, อย่างน้อย 1 เครื่องมี 4G
      · Five phones: two or more iOS, two or more Android, at least one that has never opened ChivaGo, at least one with mobile data
- [ ] โทรศัพท์เวที (console) และโน้ตบุ๊ก (board) พร้อมสาย HDMI/adapter ที่ชาร์จ และ power bank
      · The stage phone, the board laptop, HDMI and adapter, chargers, a power bank
- [ ] QR พิมพ์แล้ว 6 ใบ และเทปกาว
      · The six printed codes and tape
- [ ] คีย์ทั้งสองบนกระดาษ
      · The two keys on paper
- [ ] เครื่องที่ 6 หรือกล้อง สำหรับอัดวิดีโอสำรอง
      · A sixth phone or a camera for the backup recording
- [ ] นาฬิกาจับเวลา ปากกา และเช็กลิสต์นี้
      · A stopwatch, a pen, this sheet

## 2 · เช็กเน็ตก่อน · Network first — 09:00–09:30, in the actual room

- [ ] ทุกเครื่องต่อ Wi-Fi ของห้อง จด SSID, มี captive portal ไหม, หลุดเองไหมภายใน 30 นาที
      · Every device on the room's Wi-Fi; note the SSID, any captive portal, and whether it drops within 30 minutes
- [ ] ทุกเครื่องเปิด `https://chivago.fly.dev/health` ได้
      · Every device reaches the API
- [ ] สแกน QR ห้องทีละเครื่อง ลงทะเบียนสำเร็จครบ 5 เครื่องหลัง NAT เดียวกัน (limit 500 ทำงาน)
      · Scan the room code on each phone: five registrations behind one address succeed (the limit for the day holds)
- [ ] จับเวลาอัปโหลด 1 คลิป 10 วินาที ต่อเครื่อง: กด ส่ง → "ส่งแล้ว จะขึ้นเมื่อทีมตรวจแล้ว"
      · Time one ten-second upload per phone, send → sent
- [ ] ทำซ้ำบน 4G 1 เครื่อง
      · Repeat once on mobile data
- [ ] โน้ตบุ๊ก board ต่อโปรเจกเตอร์: เห็นหน้า board มุมบนบอก "closed · ปิดรับ" หรือ "open · เปิดรับ" และ footer "updates every 3 s" เดินอยู่
      · The board on the wall shows the door state and keeps ticking

ถ้าคลิป 10 วินาทีจาก iPhone เกิน 25 MB (4K/60) แอปจะบอก "A story must be under
25 MB. Ten seconds is plenty." — ตั้งกล้อง iPhone เป็น 1080p ที่ 30 fps
(Settings › Camera › Record Video) แล้วลองใหม่ · If a ten-second iPhone clip
is over 25 MB (4K at 60 fps is), set the camera to 1080p at 30 fps and retry.

## 3 · รอบซ้อมหลัก ต้องผ่าน 3 รอบติด · The flow, three clean runs — 09:30–11:00

เตรียม: moderator กด "Open the door · เปิดประตู" บนโทรศัพท์เวที · Door open.
แต่ละรอบใช้เครื่องคนละเครื่อง สลับ iOS/Android; รอบที่ 1 ต้องเป็นเครื่องที่ไม่เคยเปิดแอป
· Each run on a different phone; run 1 on the one that has never opened the app.

1. [ ] สแกน QR ห้อง → แอปเปิดที่ "มก. ศรีราชา" (หัวหน้าจอ) ผ่าน onboarding
       · Scan the room code: the app opens on the campus and onboarding runs
2. [ ] แท็บแผนที่: เห็นแผนที่แคมปัส (ตึก 3 มิติ) กับหมุด 5 จุด ไม่ใช่เกาะสมุย; กดชิป "เกาะสมุย" แล้วกลับ "มก. ศรีราชา" แผนที่ต้องสลับตาม
       · Map tab shows the campus with five pins; the chip switches the map both ways (fixed 7 Sep)
3. [ ] สแกน QR หอสมุด → หน้า "หอสมุดอนุสรณ์ 10 ปี"
       · The library code lands on the library
4. [ ] เช็กอินที่หอสมุด: ผ่านรั้ว 250 ม. และ second signal (ไม่ mock, accuracy พอ, ไม่เดินทางเร็วผิดปกติ); บนเครื่องที่ไม่เคยเปิดแอป ข้อความต้องเป็น "เช็กอินแล้ว ได้ 20 แต้มทริป · ได้เหรียญ ก้าวแรก"
       · Check in at the library: the fence and the second signal both pass; on the phone that never opened the app the toast ends with the first medal
5. [ ] "เล่าสตอรี่ที่นี่": เห็นข้อความ "คลิปของคุณจะขึ้นจอในงานและอยู่ในแอป 7 วัน ถ่ายเฉพาะคนที่ยินดีให้ถ่าย" → อัดไม่เกิน 10 วิ → ส่ง → "ส่งแล้ว จะขึ้นเมื่อทีมตรวจแล้ว"
       · Tell a story: the notice, record ten seconds at most, send, sent
6. [ ] โทรศัพท์เวที: `/console/stories` โชว์คลิปภายใน 10 วิ (หน้า reload เองทุก 10 วิ) → ดูโปสเตอร์และเปิดคลิปดูให้จบ → "Approve · แสดง"
       · The console shows it within ten seconds; watch it to the end; approve
7. [ ] จอใหญ่: คลิปขึ้น board ภายใน 10 วิ หลัง approve ตัวนับ +1
       · The board shows it within ten seconds of the approval; the count goes up by one
8. [ ] กลับที่แอป: หมุดหอสมุดมีวงแหวนทอง แถว "สตอรี่" มีคลิป แตะแล้วเล่น (ไม่มีเสียง) แล้วปิดเองเมื่อจบ
       · Back on the phone: the gold ring on the pin, the row, the viewer plays muted and closes itself
9. [ ] หน้าแรก → ไอคอนโปรไฟล์มุมขวาบน: เครื่องเวที (demo-user) เห็นอันดับ "#1 จาก 2 คน" และเหรียญ 5/7; เครื่องแขกเห็นเหรียญ "ก้าวแรก" ได้แล้ว และ "ทั่วแคมปัส 1/5"
       · Home → the profile button: the stage phone shows #1 of 2 and 5/7 medals; a guest phone shows First steps earned and the campus at 1/5

ผ่าน = ข้อ 1–8 ครบโดยไม่ต้องลองซ้ำขั้นไหน และ approve → board ไม่เกิน 10 วิ
นับ 3 รอบติด ล้มรอบไหน แก้แล้วเริ่มนับใหม่ที่ 1
· A pass is all eight with no retry and approve-to-wall inside ten seconds.
Three in a row; a failure resets the count.

คลิปที่ approve ในรอบซ้อมจะอยู่บนจอจนหมดอายุ (7 วัน = พุธ 16) และคอนโซลยัง
ไม่มีปุ่มเอาคลิปที่ approve แล้วลง — ถ่ายรอบซ้อมให้เป็นคลิปที่ยินดีให้อยู่บนจอ
วันศุกร์ได้เลย (นับเป็นคลิปของทีม) · Clips approved in the rehearsal stay on
the wall until they expire on the 16th, and the console has no take-down for
an approved clip yet: film the rehearsal runs as clips the team is happy to
keep on the wall on Friday.

## 4 · ซ้อมตอนพัง · Failure drills — 11:00–12:00

Each drill: do it, read what the phone says, write the sentence down if it is
not the one here. ทุกข้อ: ทำ อ่านที่แอปพูด ถ้าไม่ตรงกับที่เขียนไว้ให้จดมา

- [ ] ประตูปิด: moderator กด "Close the door · ปิดประตู" → หน้าสถานที่บอก "สตอรี่เปิดรับที่งาน ณ สถานที่จริง" ไม่มีปุ่ม ไม่มี error → เปิดประตูใหม่ → ส่งได้ทันที ไม่ต้อง restart
      · Door closed: the place says stories open at the event; no button, no error. Reopen: sending works at once, no restart
- [ ] ไม่มี token: พิมพ์ที่อยู่เว็บเอง (ไม่ผ่าน QR) บนเครื่องที่ไม่เคยเปิดแอป → ส่ง → ถูกปฏิเสธ "This is not the event this door is open for. Scan the code in the room." → สแกน QR ห้องแล้วส่งใหม่ ผ่าน
      · No token: type the address instead of scanning; the send is refused with the sentence about the room; scan and it passes
- [ ] ปิด location บนเครื่อง → "ต้องมีตำแหน่งเพื่อเล่าสตอรี่ที่นี่"
      · Location off: your position is needed
- [ ] ยืนนอกรั้ว 250 ม. (หน้าประตูมหาวิทยาลัย หรือลานจอดรถไกล ๆ) → ส่งไม่ผ่าน จดประโยคที่แอปพูด
      · Outside the fence: refused; write down the sentence
- [ ] Android 1 เครื่อง เปิด mock location (Developer options) → เช็กอินและสตอรี่ถูกปฏิเสธ (MOCK_LOCATION, docs/30)
      · Mock location on one Android: check-in and story both refused
- [ ] เครื่องเดียวส่ง 4 คลิปในวันเดียว → คลิปที่ 4 ถูกปฏิเสธ "That is 3 stories today already. Tomorrow is another day."
      · Four from one phone: the fourth is refused
- [ ] คลิปไม่เหมาะสมมาถึงคอนโซล → กด "Hide · ไม่แสดง" → ไม่ขึ้น board ไม่นับ
      · An unsuitable clip in the queue: hide it; it never shows and is not counted
- [ ] iPhone อัด .mov (HEVC) → หลัง approve เล่นได้บน Android และบนโน้ตบุ๊ก board
      · An iPhone HEVC clip plays on Android and on the board after transcoding
- [ ] Wi-Fi ล่ม: ปิด Wi-Fi ทุกเครื่อง → โทรศัพท์เวทีใช้ 4G โน้ตบุ๊ก board ต่อ hotspot → flow ยังเดินไหม จับเวลา
      · Wi-Fi dies: stage phone on 4G, board on a hotspot; does the flow still run, and how long
- [ ] captive portal หลุดกลางทาง: ต่อใหม่แล้วกดส่งซ้ำ → จดว่าเกิดอะไร (คลิปซ้ำ 2 อัน? โควตานับกี่ครั้ง?)
      · Captive portal drops mid-send: reconnect and send again; write down what happened (two copies? how many against the quota?)
- [ ] ถ้าทุกอย่างพัง: เปิดวิดีโอสำรองจากโน้ตบุ๊กบนโปรเจกเตอร์ แล้วพูดว่า "นี่คือบันทึกของ flow เดียวกัน"
      · If everything dies: play the backup from the laptop and say it is a recording of the same flow

## 5 · วิดีโอสำรอง · The backup recording — 13:00–13:30

- [ ] อัด flow เต็ม 1 รอบ 60–90 วิ: มือถือ (สแกน → เช็กอิน → อัด → ส่ง) → คอนโซล approve → board ขึ้น; กล้องเครื่องที่ 6 ถ่ายให้เห็นมือถือและจอในเฟรมเดียว และอัดหน้าจอโน้ตบุ๊ก board แยกอีกไฟล์
      · One clean 60–90 s take of the whole flow, phone and wall in one frame, plus a screen recording of the board
- [ ] เก็บ 2 ที่: โน้ตบุ๊ก board และโทรศัพท์เวที; เปิดเล่นทดสอบจากโน้ตบุ๊กบนโปรเจกเตอร์ 1 ครั้ง
      · Stored in two places; played once from the laptop on the projector
- [ ] ไม่มีเพลง ไม่มีหน้าคนที่ไม่ได้ยินยอม
      · No music, no face that did not agree

## 6 · สตอรี่และรูปของทีม · The team's own stories and photographs — 13:30–15:00

- [ ] เดินครบ 5 จุด: จุดชมวิวสะพานดาว, สวนและบึง, หอสมุด, ศูนย์กีฬา, แถวร้านค้าหน้าอาคาร 25
      · All five places on foot
- [ ] ที่ละจุด ถ่ายรูปสถานที่ (แนวนอน ไม่มีหน้าคนแปลกหน้า) สำหรับหน้าสถานที่
      · A landscape photograph of each place for its screen (docs/46, still owed)
- [ ] เล่าสตอรี่ของทีม 3–5 คลิป: ประตูเปิด 10 นาที → approve → ปิดประตู; นี่คือคลิปบนจอตอนคนเดินเข้าห้องวันศุกร์ (อัดพุธ 9 อยู่ถึงพุธ 16)
      · Three to five team stories, door open ten minutes, approved, door closed; these are on the wall on Friday and last until the 16th
- [ ] คลิปจากรอบ drills ที่ไม่ควรอยู่บนจอ: กด Hide ทั้งหมดในคอนโซล ก่อนปิดประตู
      · Everything from the drills that should not be on the wall: hidden in the console before the door closes

## 7 · ตำแหน่งบนเวทีวันศุกร์ · Stage positions — 15:00–15:30, one dry run

| ใคร · Who | ทำอะไร · Does |
|---|---|
| ผู้พูด · Presenter | ฮุก 90 วินาที ตาม docs/42 พูดตามที่จอทำ ไม่พูดล่วงหน้า · The 90-second hook; narrates what the wall shows, never ahead of it |
| คนคุมคอนโซล · Console | โทรศัพท์เวที คีย์ moderator ดูให้จบก่อนกด Approve ภายใน 10 วิ · Stage phone, moderator key; watches the clip through, approves inside ten seconds |
| คนคุม board · Board | โน้ตบุ๊ก เต็มจอ ปิดเสียง ปิด sleep ปิด notification · Laptop full screen, muted, sleep and notifications off |
| "ผู้ชม" · The guest | ถือมือถือ ทำ flow บนเวที ให้ผู้พูดเล่า · One phone, the flow on stage, for the presenter to narrate |
| คนจับเวลา · Timer | จับเวลา ถือวิดีโอสำรอง พร้อมกดเล่นถ้าเน็ตล่ม · Times it, holds the backup, plays it if the network dies |

- [ ] มือถือขึ้นจอได้ไหม: ทดสอบ scrcpy (Android, USB) หรือ QuickTime/AirPlay (iPhone) บนโน้ตบุ๊ก board; ถ้าไม่ได้ ผู้พูดเล่าหน้าจอมือถือ และ board เป็นหลักฐาน
      · Can the phone be mirrored (scrcpy for Android over USB, QuickTime or AirPlay for iPhone)? If not, the presenter narrates the phone and the wall is the proof
- [ ] QR ห้อง (A3) อยู่บนจอหรือหน้าห้องก่อนเริ่มพูด
      · The room code is up before the talk starts
- [ ] ซ้อมพูด 90 วิ 1 รอบพร้อม flow จริง จับเวลา
      · One timed run of the hook with the real flow

## 8 · ปิดวัน · Closing the day — 15:30

- [ ] ปิดประตู · Close the door
- [ ] กรอกตารางด้านล่างให้ครบ · Fill in the table below
- [ ] รายการที่พัง: แก้พุธเย็นถึงพฤหัสเช้า; freeze พฤหัส 10 ก.ย. เที่ยง หลังจากนั้นไม่แก้อะไร (docs/42)
      · What broke is fixed Wednesday evening to Thursday morning; freeze Thursday at noon, nothing changes after
- [ ] Go / No-go: ผ่าน 3 รอบติด และมีวิดีโอสำรอง → วันศุกร์เล่นสด (option C); ไม่ผ่าน → วันศุกร์ใช้ static demo กับวิดีโอสำรอง (option A/B) และตัดสินใจก่อนเที่ยงพฤหัส
      · Three in a row and a backup in hand: Friday is live (option C). Otherwise Friday is the static demo and the recording (A/B), decided before Thursday noon

พฤหัส 10: พิมพ์ QR ตัวจริง (ห้อง A3 สถานที่ A5), ซ้อมครั้งที่สองสั้น ๆ, นอน
· Thursday: print the real codes, a short second rehearsal, sleep.

## ตัวเลขที่ต้องจด · The numbers

| รอบ · Run | เครื่อง / OS · Phone | เน็ต · Network | สแกน → หน้าแรก (วิ) · Scan → home (s) | เช็กอิน (วิ) · Check-in (s) | ส่ง → ส่งแล้ว (วิ) · Send → sent (s) | approve → board (วิ) | ผล · Result |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |
| 4G | | | | | | | |
| drill | | | | | | | |

## Still owed, found while writing this

- **A take-down for an approved clip.** The console lists only what is
  pending; once a clip is approved there is no button that removes it from
  the wall, only the seven-day expiry. Docs/42 promised "a hide control on
  the board" against exactly the risk of a wrong clip on the big screen. The
  route already accepts `hide` for any story; what is missing is a "Shown
  now" list on `/console/stories` with a take-down button, and a test.
- **The deployment**, the photographs, the lawyer's reading of the notice:
  unchanged from docs/46.
