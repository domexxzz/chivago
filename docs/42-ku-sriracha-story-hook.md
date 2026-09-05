# 42 — KU Sriracha story hook: a feasibility read

Written before any code, on 2026-09-05. The idea: map Kasetsart University's
Si Racha campus as a second demo model, pin short story clips on it, and let
the audience at the pitch scan a QR and upload their own stories in the app,
as the opening hook. This is what is true about it, what it would take, and
what has to be decided first. The Thai version with the full tables is the
artifact linked from the status page; this is the record.

## Verdict

All four pieces are feasible. Two of them are two or three days in the demo
that exists; the other two are a further five to seven days plus a rehearsal,
and they hang on questions only the owner can answer, chiefly **where the
pitch is held**.

| Piece | Verdict |
|---|---|
| Map KU Sriracha | Yes. OSM has the campus outline and 37 buildings; an Air4Thai station sits 300 m away, which Samui never had. |
| Story clips on the pin | Yes, for clips the team makes in advance; they fit the static demo. |
| QR for audience uploads | Yes, but only with a live API, server-side transcoding, moderation before display, and a PDPA notice. |
| Live on stage | Yes, and the strongest version: a named host approves on stage, which demonstrates the product's thesis rather than decorating it. |

## What was checked, not assumed

- **OpenStreetMap** (Overpass, 2026-09-05): way 1408248543 "Kasetsart
  University Si Racha Campus", 56 nodes, 0.33 km², centre 13.1205 100.9205.
  Inside it: 37 buildings (25 named — อาคาร 1, 2, 3, 6, 10, 13, 17, 20, 23,
  24–27, หอสมุดอนุสรณ์ 10 ปี …), only **one** with a height or level count;
  51 service roads, 22 unclassified, 22 footways; 15 car parks, 3 pitches,
  2 cafés, 2 parks, 2 sports centres, 1 convenience store.
- **Air quality**: Air4Thai station `o61`, สนามกีฬาเทศบาลแหลมฉบัง, ต.ทุ่งสุขลา,
  **0.3 km** from the campus centre; PM2.5 13.4 µg/m³ at 22:00 on 2026-09-05.
  The next station is 20.6 km away. Chonburi would be the first province
  where the Healthy Score stands on a ground station rather than the 11 km
  model Samui stands on.
- **Deployment**: `fly.toml` and the `Dockerfile` already describe API plus
  web on one origin, SQLite on a volume, region `sin`, HTTPS forced. A live
  API is a day, not a design.
- **Uploads today**: JPEG/PNG/WebP only, 8 MB, three per proof, magic-byte
  sniffed. No video path exists; stories are a new pipeline.
- **Accounts**: no sign-up, a device holds its key. Registration is limited to
  **10 per address per rolling hour** (`CHIVAGO_REGISTRATIONS_PER_HOUR`) and
  the production opening balance is zero. An audience behind one venue NAT is
  one address; the limit has to be raised for the day.
- **iPhone video**: since iOS 13.6.1 Safari hands a file input the original
  camera-roll file, usually HEVC `.mov`. MediaRecorder on iOS yields MP4/H.264,
  Chrome on Android yields WebM/VP8; Safari plays WebM from iOS 15. Every clip
  must be transcoded to H.264 MP4 on the server or it will not play across
  devices.
- **Expo on web**: `expo-camera` cannot record video on web. The reliable
  path is `<input type="file" accept="video/*" capture>`, which opens the
  device's own camera.
- **Map**: OpenFreeMap, already the app's source, carries a `building` layer
  with `render_height`; Protomaps' `pmtiles extract --bbox` cuts an offline
  PMTiles of the campus for the static demo. Google's photorealistic 3D tiles
  are metered per session (docs/05) and need a key in a public demo.
- **Cost**: Fly shared-cpu-1x 256 MB about $2 a month, volume $0.15/GB;
  Cloudflare Stream $5 per 1,000 minutes stored and $1 per 1,000 delivered if
  transcoding is outsourced. An event's 100 clips × 10 s is 17 minutes;
  ffmpeg on the VM is enough.

## Options

| | What | Effort | Needs | Take |
|---|---|---|---|---|
| A · Static hook | KU on the existing demo map, team clips on the pin, QR opens the demo, no uploads | 2–3 days | nothing new to host | The floor. Do this first regardless. |
| B · Live, unmoderated | Audience uploads appear on the big screen at once | 5–7 days | live API, transcode | **No.** One stranger with one clip ends the pitch, and it contradicts what we sell. |
| C · Live, approved on stage | A + uploads by QR + a named host approves in the console + the screen updates + the verified count moves | 5–7 days + one rehearsal | chivago.fly.dev, ffmpeg, event env, PDPA notice, a real host, a backup clip | **Recommended**, after A. |
| D · Off-app | Hashtag or a third-party upload form | 1 day | someone else's account | Not the ask, and shows no verification. |

Recommendation: **A within the first week, then C** if the questions below
are answered — above all the venue and the host on stage. A backup recording
of the whole flow exists in every version, and is introduced as a recording.

## Risks and what holds them

- **An unacceptable clip on the big screen**: nothing displays before a host
  approves it, the host previews ten seconds, and there is a hide control on
  the board.
- **Venue Wi-Fi and NAT**: raise the registration limit for the day; clips
  ≤ 10 s and ≤ 25 MB; rehearse with five phones on the real network.
- **HEVC from iPhones**: transcode everything to 720p H.264 with a poster,
  60 s timeout per file, container sniffed before ffmpeg runs.
- **Web permissions**: HTTPS only (fly.dev provides it); ask for the camera
  and the position on the button press, not on page load; a refused position
  falls to recorded-not-scored (docs/29).
- **PDPA**: faces of bystanders are personal data. A notice at the QR and in
  the app before recording ("this will be shown at the event and kept in the
  app for 30 days"); the basis is §24(5) legitimate interest with a balancing
  test, or §19 consent; automatic deletion after 30 days; no face
  recognition; a lawyer reads it first (recommendation 05 is still open).
- **The university's name and premises**: written permission from the
  university or the hosting unit; place names as signposted; no crest.
- **Music in clips**: none in the team's clips; audience clips play muted on
  the big screen.
- **Building heights**: OSM has one. Extrude every building to the same 12 m
  and say so on the map, rather than invent heights.
- **The five-minute pitch**: the hook is 90 seconds; the QR is on screen
  before the pitch starts; the host approves two or three clips live.
- **The public demo**: untouched. There are two static demos today,
  chivago-demo.vercel.app (domezzxx's account, deployed from this machine)
  and chivago-demo-sigma.vercel.app (electiction's, the one the README now
  names); one of them has to be chosen. A second "event" build points at
  chivago.fly.dev on the same origin; uploads close after the event and the
  pages stay.

## The 90-second hook, if C

1. The KU map turns slowly on the big screen; the story ring on the library
   pin is filling.
2. "Everyone in this room is on this map." The QR has been up since before the
   talk.
3. A phone on screen: scan, open, check in at the library (the geofence passes
   if the venue is the campus).
4. "Tell a story": record eight seconds, send, status *waiting for the host*.
5. The console on screen: the named host approves; the story appears on the
   pin; the verified count ticks up by one.
6. "A point is only worth something if somebody had to check it. This is the
   evidence layer hotels do not have." Into the pitch.
7. If the network dies: the backup recording of the same flow, introduced as
   a recording.

## The plan, if C

| Day | Work | Done when |
|---|---|---|
| 1 | Open TH-20; 5–6 places from OSM; a named host; station o61 in the air service; campus PMTiles and an area switcher; new fixtures | The static demo shows KU (= option A) |
| 2 | `stories` table; upload, container sniff, ffmpeg to H.264 + poster; pending queue; 30-day expiry | An iPhone `.mov` uploaded with curl plays on Android |
| 3 | Ring on the pin; vertical player; "tell a story" via input capture; console page to approve or hide; big-screen board polling every 3 s | Phone → approve → big screen inside 10 s |
| 4 | Web deep link `?place=&story=`; event env (limit, close-after); deploy chivago.fly.dev; QR; PDPA notice; 3–5 team clips | A phone outside the team completes the flow from the QR |
| 5 | Rehearsal at the venue with five phones on its Wi-Fi; record the backup; fix what breaks | The flow passes three times in a row on the real network |

Estimated from this codebase's pace: recommendations 02–04 took about a day
each with tests. Every day above includes tests and a live check; none
includes filming.

## Questions to answer before starting

1. Where and when is the pitch? At the campus the geofence works for real;
   elsewhere the path is recorded-not-scored, which still shows but the words
   on stage change.
2. Who is the named host on stage? A real person from a real unit, with a
   console key issued before the day.
3. Does the university allow it: its place names, filming on the premises,
   audience uploads from the campus?
4. How many people, and what is the venue's Wi-Fi? Thirty on 4G is not three
   hundred on one access point.
5. Video, or photo plus caption? Photo is a day on the existing pipeline;
   video is a new pipeline end to end.
6. The public demo stays as it is, and the event gets its own build?
7. What happens to the clips afterwards? Proposed: automatic deletion after
   30 days, and no marketing use without asking again.

## Sources

OpenStreetMap via Overpass (2026-09-05, way 1408248543 and its contents) ·
Air4Thai `getNewAQI_JSON.php` (2026-09-05 22:00, station o61) ·
WebKit blog "MediaRecorder API" · Apple developer forums thread 658708 (iOS
13.6.1 upload behaviour) · Expo Camera docs and expo/expo#13625 · MapLibre
"display buildings in 3D" · Stadia Maps tutorial on OpenMapTiles
`render_height` · Protomaps pmtiles CLI docs · Cloudflare Stream pricing ·
Fly.io pricing · PDPA B.E. 2562 §19, §24(5) and the balancing-test guidance
at thailibrary.in.th · in the repo: `fly.toml`, `apps/api/src/uploads.ts`,
`apps/api/src/server.ts`, `apps/mobile/src/components/terrain-style.ts`,
docs/05, docs/29, docs/30.

Not checked: the university's filming rules, and the venue's network.

## The calendar, from the date

The pitch is **Friday 11 September 2026**, at the campus, one day. Counted
back from it (today is Saturday the 5th; day one, the campus itself, is
docs/43 and done):

| Day | Date | Work | Done when |
|---|---|---|---|
| 2 | Sun 6 | Stories: the table, upload with the second signal, container sniff, ffmpeg to H.264 720p + poster, pending queue, 7-day expiry, "a host reviews where it hosts" | An iPhone `.mov` uploaded with curl plays on Android, and only after approval |
| 3 | Mon 7 | The ring on the pin, the vertical viewer, "tell a story" via the phone's own camera, the console's pending page, the big-screen board polling every 3 s | Phone → approve → board inside 10 s |
| 4 | Tue 8 | Event mode: uploads open only on the day, an event token in the QR, the registration limit for the day, `chivago.fly.dev` up, the QR, the PDPA notice, the team's own stories, the backup recording | A phone outside the team completes the flow from the QR |
| 5 | Wed 9 | Rehearsal on the campus with five phones (iOS and Android) on the venue's Wi-Fi; fix what breaks | Three clean runs in a row on the real network |
| — | Thu 10 | Freeze. Print the QR, load the team's clips, second rehearsal, sleep | Nothing changes after noon |
| — | Fri 11 | Open uploads at the door, approve on stage, close uploads after the talk; clips deleted after 7 days | — |

Owed by the team before day 4: photographs of the five places, the room and
its Wi-Fi, and who stands at the console on stage.
