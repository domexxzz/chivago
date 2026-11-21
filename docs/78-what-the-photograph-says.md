# 78 — What the photograph says about itself

Question 20 in the judges' hack book is "ถ้ามีคนโกง ถ่ายรูปขยะกองเดิมส่งซ้ำ
จับได้ไหม". The honest answer on 21 November 2026 was: the host looks at the
pictures, and the app tells us where and when they were taken. This is the
record of why that second half was worth nothing, and what replaced it.

## The hole

`POST /quests/:id/proof` takes each photo's location and capture time from a
`meta` field the client sends beside the files. Its own comment says why:

> EXIF is read on the device, where the original file still has it, and sent
> alongside. Re-encoting on the phone routinely strips it.

That is true and it is the only way to get EXIF off most phones. It is also a
plain JSON field. A tampered client writes `{"lat": 9.5357, "lng": 100.0617}`
and the beach cleanup it never attended is geotagged on the beach.

**Every check in the console was reading that field.** `geotagCheck` — "the
single most useful thing the console does", by its own comment — was
comparing the quest site against a number the submitter chose. So was
`timingCheck`. The console was showing its work, and the work was the
client's.

## What replaced it

`photo-forensics.ts` reads the bytes **the server stored**, and derives from
them alone:

- a **SHA-256** of the file. Always available, and nothing on the phone can
  forge it;
- the **EXIF the file still carries**, when it carries any: the shutter
  moment, the camera's own GPS, and the make, model and body serial.

Both are stored on `proof_files` beside — never over — what the client sent.
Keeping both is the point: a check that can say the two disagree needs the
claim as well as the file.

### The file outranks the claim

Where the server could read a location out of the bytes, that is what the
existing checks now see; the client's `meta` is the fallback for the stripped
files that are most of them. The console labels which is which, so a reviewer
knows whether the distance under a photograph was measured or asserted.

Rows written before this landed have no EXIF columns, fall back, and behave
exactly as they always did.

### Two new signals

**`reuse` — has this photograph been handed in before?** Two ways one picture
is recognised again:

- **the same bytes.** The literal case the hack book asks about: the same
  file, sent twice.
- **the same shutter.** One camera body cannot record two photographs at the
  same instant, so the same make, model and EXIF moment is one original that
  has been re-saved, cropped or filtered in between. This is the one a
  re-encode does not escape, because it survives the bytes changing.

A match inside one submission is a warning; a match on an earlier submission
is a finding, with the date. Both are signals — a host re-opening a
submission and a volunteer resending after a rejection are honest reasons for
one.

**`source` — does the file back up what the app said?** When the uploaded
file turns out to have kept its own GPS, the two readings started as the same
reading and should agree. More than 100 m apart is reported, and the reviewer
is told to trust the file.

## Three decisions worth defending

**A stripped file is the ordinary case, not a finding.** Most honest
photographs reach us carrying nothing but pixels. Both new checks report
`unknown` for them, in those words. A check that fires on most honest
submissions is a check reviewers learn to click past, and then it is worse
than nothing.

**A zone-less EXIF time is never turned into an instant.** Without
`OffsetTimeOriginal`, an EXIF time is a wall clock. A traveller whose camera
is still on their own country's time would be hours "wrong" through no fault
of theirs, so guessing the island's zone would invent an instant and fail
that traveller. The raw string is kept for comparing one file against another
— equality does not need a zone — and `timingCheck` goes on using what the
phone worked out, which knew.

**Reuse detection does not cross hosts.** `historyFor` already refuses to,
because a cross-host lookup is a reputation file nobody agreed to. The cost
is real and is written down as a passing test: the same photograph sent to
two different organisations is **not** caught. Changing that is the owner's
decision, not this module's.

## Parsing files somebody else chose

Everything here walks offsets taken from a file an attacker supplied. Every
read is bounds-checked and answers null rather than throwing, every loop has
a ceiling, and an offset pointing outside its block ends the walk. A corrupt
or hostile file produces a hash and nothing else — never an exception, never
a hang. A photograph that cannot be parsed must still reach a reviewer, and
the console must not be the thing that falls over.

JPEG, PNG (`eXIf`) and WebP (`EXIF`) are all read, which is the same three
`uploads.ts` accepts.

## What this does not do

- **No backfill.** Proofs submitted before this have no fingerprint and are
  reported as unknown rather than quietly compared against nothing.
- **No perceptual hash.** A crop or a filter that also changes the camera
  tags defeats both signals. Matching pictures that merely *look* alike needs
  pixels decoded, which the Workers runtime has no image library for.
- **It does not decide anything.** Every output is a signal for a human. The
  host is the one vouching.

## What holds it

- `apps/api/src/photo-forensics.test.ts` — 20 tests. The EXIF files are
  **built in the test**, not checked in as binary fixtures, so the layout
  being parsed is reviewable; and eight of them are hostile files that must
  be answered rather than obeyed.
- `apps/api/src/review-service.test.ts` — the two new checks, including the
  cross-host limit above, recorded as a test so it cannot be mistaken for a
  bug.
- `apps/api/src/uploads.test.ts` — the chain end to end: a photograph through
  the real upload path is read on the way in, and the client's claim survives
  untouched beside it.
