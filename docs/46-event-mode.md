# 46 — Event mode

Day four of docs/42. The pitch is one day, Friday 11 September 2026, at the
Si Racha campus, one to two hundred people in the room. Everything here
exists so that the door opens for those hours and shuts after them, and so
the team can run it from a phone on the stage.

## The door

Uploads are refused unless the door is open (docs/44). The door has two
handles, either of which opens it:

- **The console.** A moderator - the platform host's key - has *Open the
  door / Close the door* on `/console/stories`. It writes a row in the new
  `settings` table (`stories_open`, who, when) and takes effect on the next
  request, with no restart. This is the handle for the day: open it when
  the first guest arrives, close it when the talk ends.
- **The environment.** `CHIVAGO_STORIES_OPEN=1` opens it regardless, for a
  rehearsal without a moderator key to hand. Unset in production.

The place screen, the pin feed and the board all say which state the door
is in; a shut door is a sentence, never a button that fails.

## The token

`CHIVAGO_EVENT_TOKEN`, when set on the deployment, must be carried by every
upload. The QR codes carry it (`?event=…`); the app keeps it the way it
keeps the area and sends it with the story; a phone that arrived without it
- somebody who typed the address, or scanned last year's poster - is
refused with `EVENT_TOKEN` and the sentence about the event. Unset, no token
is required, which is what the dev server and the tests run with. The token
is defence in depth: the shut door is what stops next week; the token stops
the wrong door being used on the day.

## The limit

`POST /devices` allows ten registrations per address per hour. Two hundred
phones on one venue Wi-Fi are one address. `CHIVAGO_REGISTRATIONS_PER_HOUR`
is read at start-up; set it to 500 for the day and back to 10 after.

## The notice

Before the camera opens, above the button, in both languages:

> Your clip shows on the screen at the event and stays in the app for 7
> days. Film only people who are happy to be filmed.
>
> คลิปของคุณจะขึ้นจอในงานและอยู่ในแอป 7 วัน ถ่ายเฉพาะคนที่ยินดีให้ถ่าย

The same line sits under the board. Going on to record is the consent;
what is collected is a clip, a caption and a fix inside the fence; the
clip is re-encoded so the phone's EXIF never leaves the server; nothing
carries a name; everything is deleted after seven days by the hourly sweep.
The lawful basis is consent (PDPA §19) for the teller and legitimate
interest with the balancing test (§24(5)) for anyone in frame at a public
event who was told; recommendation 05 of the competitive read - a lawyer's
reading of exactly this - is still owed, and this notice does not replace it.

## The day, in order

**Before the 10th** (the team)

1. `fly launch --no-deploy --copy-config --name chivago` · `fly volumes create
   chivago_data --size 1 --region sin` · `fly deploy` - the Dockerfile builds
   the web app for the same origin and installs ffmpeg.
2. `fly ssh console -C "node --experimental-strip-types apps/api/src/seed-db.ts"`
   and write down every key it prints, once: the team's, and the platform
   host's (the moderator - the one that opens the door).
3. `fly ssh console -C "node --experimental-strip-types apps/api/src/reset-demo.ts --walk"`
   - the demo traveller's five days, driven through the real services, and
   a second traveller with one approved quest, so the standing is a ranking
   and not a mirror. The walk must print PASS on every screen and
   `Standing #1 of 2`; anything else is fixed before going on.
4. The phone on stage has to BE the demo traveller, or it opens as a
   stranger with an empty wallet. Immediately after the reset, before any
   phone opens the app:
   `curl -s -X POST https://chivago.fly.dev/account/link-code -H "x-chivago-user: demo-user"`
   answers with a `code`. The header is honoured only while no device is
   registered - the reset empties that table, and the first phone to open
   the app closes it again - and the code lives ten minutes. On the stage
   phone: the profile button, the gear, *Already have a code?*, the code.
   The phone now shows 1,850 G, #1 of 2, and 5 of 7 medals. If a phone
   registered first, reset again and repeat.
5. `fly secrets set CHIVAGO_EVENT_TOKEN=<32 random characters> CHIVAGO_REGISTRATIONS_PER_HOUR=500`
6. `python scripts/event-qr.py https://chivago.fly.dev --token <the same> --out qr/`
   and print: the room code at A3, the five place codes at A5. Do not commit
   the images.
7. Open `https://chivago.fly.dev/console/stories` on the stage phone, sign in
   as the moderator, leave it open. Open `https://chivago.fly.dev/board/ku-sriracha`
   on the projector laptop.
8. The team's own stories: sign in as the team on the campus, open the door
   for ten minutes, tell three to five, approve them, close the door. These
   are the ones on the wall when the room walks in.

**On the 11th**

- Door open when the first guest scans. Approve on stage, one tap each,
  ten seconds' look. Door closed when the talk ends.
- If the network dies: the backup recording of the same flow, introduced as
  a recording.
- After: `fly secrets set CHIVAGO_REGISTRATIONS_PER_HOUR=10`. The clips
  delete themselves on the 18th.

## What holds it

`story-service.test.ts`: the setting opens the door and the environment
opens it; a token set on the deployment is required, a wrong one is refused,
none configured needs none. `console/routes.test.ts`: a moderator opens and
closes the door and the page says so; a host cannot; a stale CSRF changes
nothing. `hardening.test.ts`: the pin feed's `open` follows the setting.
`area.test.ts` (mobile): `?event=` is read, kept and sent; `stories.test.ts`:
an open door shows the notice.

## Still owed

- The live deployment itself: this machine has no Fly CLI and no Fly
  account; the commands above are the team's to run.
- The room's Wi-Fi, tested with five phones on the 9th.
- The team's photographs of the five places.
- A lawyer's reading of the notice (recommendation 05).
