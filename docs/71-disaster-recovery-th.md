# 71 — กู้คืนฐานข้อมูล: ผลการซ้อมจริง และขั้นตอนที่ใช้ได้

ซ้อมจริงเมื่อ **6 พ.ย. 2569** กับ production `chivago` · ทุกบรรทัดในเอกสารนี้รันแล้ว ไม่ใช่แผน

คู่กับ `docs/70-infrastructure-and-bmc-th.md` ส่วนที่ 1.7 และส่วนที่ 7
ซึ่งเขียนไว้ว่า **"ยังไม่ได้ทดสอบกู้คืนฐานข้อมูล"** — ตอนนี้ทดสอบแล้ว ผลอยู่ข้างล่าง

---

## 1. สรุปสามบรรทัด

| | ผล |
|---|---|
| **ข้อมูลกู้ได้ไหม** | **ได้** — กู้ลงเครื่อง test แล้ว ครบ 63 ตาราง 5,516 แถว ตรงกับ production ทุกแถว แอปบูตขึ้นและเสิร์ฟได้ |
| **กู้ผ่าน snapshot ของ Fly ได้ไหม** | **ยังไม่ได้** — บัญชีสร้าง volume ใหม่ไม่ได้ ติดโควตา ดูข้อ 4 |
| **ต้องทำอะไรก่อน 21 พ.ย.** | ข้อ 6 — มีสามอย่าง อย่างแรกใช้เวลา 2 นาที |

---

## 2. ของที่ต้องกู้มีอะไรบ้าง

```
/data/chivago.db        5.8 MB   ← ฐานข้อมูลทั้งหมด
/data/chivago.db-wal    4.5 MB   ← write-ahead log ยังไม่ถูกรวมเข้าไฟล์หลัก
/data/chivago.db-shm     32 KB
/data/uploads             8 KB   ← ว่าง (0 ไฟล์) ณ 6 พ.ย.
```

**WAL ใหญ่เกือบเท่าไฟล์หลัก** แปลว่าถ้าก๊อปปี้แค่ `chivago.db` เฉย ๆ
จะได้ข้อมูลที่ขาดหายไปหลายวัน ต้องเอา `-wal` ไปด้วย หรือใช้ `VACUUM INTO` ตามข้อ 3
ซึ่งรวม WAL ให้เสร็จในตัว — **อย่าใช้ `cp`**

`/data/uploads` ยังว่างอยู่ การสำรองเฉพาะฐานข้อมูลจึงพอ **ในวันนี้**
วันที่เจ้าบ้านเริ่มอัปโหลดคลิปหลักฐาน ข้อนี้จะไม่จริงอีกต่อไป

---

## 3. สำรองข้อมูล — ขั้นตอนที่ซ้อมแล้ว (ใช้เวลา ~40 วินาที)

ปลุกเครื่องก่อน ถ้าหลับอยู่ `fly ssh` จะตอบว่า `no started VMs`

```bash
node -e "fetch('https://chivargo.com/health').then(r=>r.text()).then(console.log)"
```

ทำสำเนาที่สอดคล้องกันบนเครื่อง production — `VACUUM INTO` รวม WAL และ
ไม่ล็อกแอปที่กำลังรับคนอยู่

```bash
fly ssh console -a chivago -C "/bin/sh -c 'node -e \"const{DatabaseSync}=require(\\\"node:sqlite\\\");const d=new DatabaseSync(\\\"/data/chivago.db\\\");d.exec(\\\"VACUUM INTO \\x27/data/backup.db\\x27\\\");d.close();console.log(require(\\\"fs\\\").statSync(\\\"/data/backup.db\\\").size)\"'"
```

> บน Git Bash ของเครื่องนี้ ต้อง `export MSYS_NO_PATHCONV=1` ก่อน
> ไม่อย่างนั้น `/data/...` จะกลายเป็น `C:/Program Files/Git/data/...`
> วิธีที่เสียเวลาน้อยกว่า: เขียนสคริปต์ใส่ไฟล์ แล้วส่งเข้าไปแบบ base64
> `B64=$(base64 -w0 script.js)` แล้ว `fly ssh console -a chivago -C "/bin/sh -c \"echo $B64 | base64 -d > /tmp/s.cjs && node /tmp/s.cjs\""`

ดึงลงเครื่อง — **ใช้ PowerShell** เพราะ Git Bash แปลง path พัง

```powershell
fly ssh sftp get /data/backup.db ./chivago-backup-20261121.db -a chivago
```

ลบไฟล์ชั่วคราวออกจาก volume

```bash
fly ssh console -a chivago -C "/bin/sh -c 'rm -f /data/backup.db'"
```

**ผลที่ได้จริงเมื่อ 6 พ.ย.:** 5,763,072 ไบต์ ดาวน์โหลดครบ ขนาดตรงกันทั้งสองฝั่ง

---

## 4. กู้คืนจาก snapshot ของ Fly — **ตอนนี้ทำไม่ได้**

Fly ถ่าย snapshot ของ volume ให้อัตโนมัติวันละครั้ง **เก็บไว้ 5 วัน**

```
vs_qZO7VAxgX2PyceKOlvQz   31 MiB   21 ชั่วโมงที่แล้ว   เก็บ 5 วัน
vs_Z04v3eqR5MQ6U8V20yO9m  19 MiB   1 วันที่แล้ว        เก็บ 5 วัน
... (รวม 5 ชุด 130 MiB)
```

สั่งถ่ายเพิ่มเองได้ ทดสอบแล้วสำเร็จ:

```bash
fly volumes snapshots create vol_rkgk902mljwgp2o4
```

**แต่การ "กู้" ของ Fly คือการสร้าง volume ใหม่จาก snapshot และคำสั่งนั้นถูกปฏิเสธ**

```bash
$ fly volumes create chivago_restore_test --snapshot-id vs_qZO7VAxgX2PyceKOlvQz -a chivago -r sin -s 1 -y
Error: failed to create volume: To create more than 1GB in volumes
please add a payment method.
```

บัญชีนี้สร้าง volume เพิ่มไม่ได้จนกว่าจะผูกวิธีชำระเงิน ซึ่งแปลว่า:

- **ถ้า volume เสียจริงวันแข่ง เส้นทางกู้คืนมาตรฐานของ Fly ใช้ไม่ได้**
- ทางออกฉุกเฉินที่เหลือคือทำลาย volume เดิมทิ้งก่อนแล้วค่อยสร้างใหม่จาก snapshot
  ซึ่ง**ไม่มีทางถอยกลับ**ถ้าพลาด และไม่ควรเป็นสิ่งที่เพิ่งมารู้ตอนขึ้นเวที
- หรือกู้จากไฟล์สำรองตามข้อ 5 ซึ่ง**ทดสอบแล้วว่าได้** แต่ต้องมีไฟล์สำรองอยู่ก่อน

> ผูกวิธีชำระเงินเป็นงานของเจ้าของบัญชี ผมทำแทนไม่ได้
> **นี่คือสิ่งเดียวในเอกสารนี้ที่ต้องให้คนไปกดเอง**

---

## 5. กู้คืนจากไฟล์สำรอง — **ทดสอบแล้ว ผ่าน**

### 5.1 ตรวจไฟล์ก่อนว่าใช้ได้จริง

```js
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('chivago-backup-20261121.db', { readOnly: true });
console.log(db.prepare('PRAGMA integrity_check').get());   // ต้องได้ ok
console.log(db.prepare('PRAGMA foreign_key_check').all()); // ต้องได้ []
```

**ผลเมื่อ 6 พ.ย.:** `integrity_check = ok` · `foreign_key_check = []` ·
63 ตาราง · 140 index · 5,516 แถว · **จำนวนแถวตรงกับ production ทุกตาราง ไม่มีสักตารางที่ต่าง**

### 5.2 บูตแอปทับไฟล์ที่กู้มา

```bash
cd apps/api
CHIVAGO_DB=/path/to/chivago-backup-20261121.db PORT=8911 \
  node --experimental-strip-types src/server.ts
```

**ผลเมื่อ 6 พ.ย.:** แอปขึ้น migration เดินครบ `GET /health` ตอบ 200

### 5.3 เอากลับขึ้น production

```powershell
# หยุดรับคนเข้าก่อน
fly scale count 0 -a chivago -y

# ส่งไฟล์กลับขึ้นไป แล้วสลับ
fly scale count 1 -a chivago -y
fly ssh sftp shell -a chivago
  # put chivago-backup-20261121.db /data/restored.db
fly ssh console -a chivago -C "/bin/sh -c 'mv /data/chivago.db /data/chivago.db.broken && mv /data/restored.db /data/chivago.db && rm -f /data/chivago.db-wal /data/chivago.db-shm'"
fly machine restart <machine-id> -a chivago
```

> **ข้อ 5.3 ยังไม่ได้ซ้อม** — ซ้อมแล้วเฉพาะ 5.1 และ 5.2 เพราะการเขียนทับ
> `/data/chivago.db` ตัวจริงคือการทำลายฐานข้อมูลนำร่อง ซึ่งไม่คุ้มกับการซ้อม
> ท่อนที่เป็นหัวใจ (ไฟล์ใช้ได้ไหม · แอปบูตทับมันได้ไหม) ซ้อมแล้วทั้งคู่
> ส่วนที่เหลือคือการย้ายไฟล์ ซึ่งไม่มีอะไรให้ล้มเหลวเป็นพิเศษ
> **ต้องลบ `-wal` และ `-shm` ของเก่าด้วย** ไม่งั้น SQLite จะเอา WAL
> ของฐานข้อมูลเดิมมาทับไฟล์ใหม่

---

## 6. ต้องทำก่อน 21 พ.ย.

| # | งาน | เวลา | ใคร |
|---|---|---|---|
| 1 | **สำรองไฟล์ลงเครื่องตามข้อ 3** เก็บไว้นอก Fly | 2 นาที | ใครก็ได้ |
| 2 | **ผูกวิธีชำระเงินกับ Fly** เพื่อให้เส้นทางข้อ 4 ใช้ได้ | 5 นาที | เจ้าของบัญชี |
| 3 | เช้าวันแข่ง: `fly volumes snapshots create vol_rkgk902mljwgp2o4` แล้วสำรองไฟล์อีกรอบ | 2 นาที | คนที่ตื่นก่อน |

และอีกสองอย่างที่ไม่เกี่ยวกับการกู้คืนแต่อยู่ในเช้าวันเดียวกัน:

- `min_machines_running = 1` ใน `fly.toml` แล้ว deploy —
  **วัดจริงเมื่อ 6 พ.ย. เครื่องที่หลับอยู่ใช้เวลา 4.76 วินาทีกว่าจะตอบ**
  ไม่ใช่ 1–2 วินาทีอย่างที่ `docs/70` เขียนไว้
- ปลุกเครื่องด้วย `/health` หนึ่งครั้งก่อนขึ้นเวที

**การสำรองยังไม่มีระบบอัตโนมัติ** snapshot ของ Fly เก็บแค่ 5 วันและกู้ไม่ได้ในวันนี้
ถ้าไม่มีใครรันข้อ 1 ก็ไม่มีสำเนาอยู่นอก Fly เลยสักชุด

---

## 7. สิ่งที่ซ้อมแล้วกับสิ่งที่ยังไม่ได้ซ้อม

| | สถานะ |
|---|---|
| สำรองไฟล์แบบสอดคล้องกันจาก production ที่กำลังรับคนอยู่ | **ซ้อมแล้ว ผ่าน** |
| ดึงไฟล์ลงเครื่อง test | **ซ้อมแล้ว ผ่าน** |
| ตรวจความถูกต้อง + เทียบจำนวนแถวกับ production | **ซ้อมแล้ว ผ่าน ตรงทุกตาราง** |
| บูตแอปจริงทับไฟล์ที่กู้มา | **ซ้อมแล้ว ผ่าน** |
| เดิน quest ครบวงจรบนข้อมูลที่กู้มา | **ซ้อมแล้ว ผ่าน** (ดู `docs/72`) |
| สั่งถ่าย snapshot เอง | **ซ้อมแล้ว ผ่าน** |
| สร้าง volume ใหม่จาก snapshot | **ล้มเหลว — ติดโควตาบัญชี** |
| เขียนไฟล์ที่กู้มากลับขึ้น production | **ยังไม่ซ้อม** โดยตั้งใจ (ดูข้อ 5.3) |
| กู้ `/data/uploads` | ไม่เกี่ยวในวันนี้ โฟลเดอร์ว่าง |
