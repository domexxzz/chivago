# 47 — Before the room fills

Docs/44–46 built stories and the door for Friday 11 September at the Si
Racha campus. A read of that code with the room in mind - one QR code, one
to two hundred phones, one API on one Fly machine - found three things
that would have gone wrong on the day and one number that was stale. All
four are fixed here, and each one has a test that fails on the old code.

## 1. The ceiling was checked after the body was in memory

`POST /places/:id/stories` called `c.req.parseBody()` first and compared
the file to `STORY_MAX_BYTES` second. `parseBody` buffers the whole request
before the route runs, and nothing in the server set a body limit, so
anyone in the room with the code could send a 2 GB file and hold the API in
`formData()` with that file in RAM. The 25 MB rule was real; it was just
consulted too late to protect anything.

`boundedForm(c, maxBytes)` in `http.ts` replaces `parseBody` on both
multipart routes - stories and quest proofs. Two refusals, both before a
byte is kept:

- the declared `content-length`, which every browser and both mobile
  runtimes send for a FormData body, refuses an honest oversize at once
  with the same `STORY_TOO_LARGE` 413 the app already knows;
- a chunked body with no declaration is counted as it streams and cut the
  moment it passes the ceiling, so an upload that lies about its size costs
  the ceiling and no more.

The ceiling is the file limit plus 64 KB for the caption, the position and
the boundaries (`STORY_FORM_MAX_BYTES`; three photos at the photo limit for
a proof). What comes back is the same `FormData` `parseBody` produced, so
the routes read `form.get(...)` and nothing else changed.

## 2. An iPhone photograph was sent to the video encoder

`sniffStory` called anything with an `ftyp` box at offset 4 a video. An
iPhone's HEIC has that same box - it is the same ISO container - so a
photograph from the phone most people in the room will be holding went to
ffmpeg as a clip, ffmpeg refused, and the person read "it could not be read
(moov atom not found)".

The brand inside the box is the difference: `heic`, `mif1` and their
family mean a still picture; `avif` too. Those go to the photo encode now,
under their own extension, and an ffmpeg that reads HEIF (7.1 and later)
turns them into the 720-wide JPEG every photograph becomes. On an ffmpeg
that cannot, the refusal is `STORY_HEIC` with a sentence a person can act
on - set Settings › Camera › Formats to Most Compatible, or send a JPEG -
and the app shows that in its own two languages rather than the server's
English. One more thing the same read found: the proof sniffer's 8 MB
ceiling was being applied to a story's photograph, so a 9 MB JPEG was told
it was "not JPEG, PNG or WebP". The signatures are read on a prefix now.

## 3. Hide took up to five minutes on the board

The public media route carried `cache-control: public, max-age=300`. A clip
a host had just hidden on stage could go on playing on the board, and in
any browser that held it, for up to five minutes - the one place Hide has
to be immediate. The bytes are immutable while a story is live, so the
route now answers with `no-cache` and an ETag: a browser holding the clip
asks before every play and is told 304 with no bytes while the story is
live, and 404 the moment it is hidden or expired. The board's `<video>`
element loops without re-downloading; Hide is one poll away.

## 4. The count

README said 1,425 tests; the tree had 1,514 before this change. The
number in README is now the number the CI prints.

## What holds it

`hardening.test.ts`, "before the room fills": an oversize is refused from
its `content-length` before the body is read; a chunked body that would run
to 200 MB is cut at the ceiling, and the test counts the chunks the server
pulled; the proof route has the same ceiling; a proof under it is parsed
exactly as before. "Hide is immediate on the board": a live clip carries
`no-cache` and a tag, a revalidation is a 304 with no bytes, and a hidden
story answers 404 to the same tag. `story-service.test.ts`, "what an iPhone
sends": a HEIC is a photograph and a MOV a clip by the brand in the same
box; a HEIC the server can convert becomes a JPEG through the photo encode;
one it cannot is refused with `STORY_HEIC` and the words about Settings;
a 9 MB JPEG is a photograph. `stories.test.ts` on the phone: `STORY_HEIC`
and `STORY_TOO_LARGE` are shown in the app's words, everything else in the
server's.
