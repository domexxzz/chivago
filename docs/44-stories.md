# 44 — Stories

Day two of docs/42: a short clip or a photograph, pinned on a place by
somebody who was standing there, shown once a host says so. Built for one
day — Friday 11 September on the Si Racha campus — and kept honest the way
the rest of the product is.

## The rules

**Closed unless opened.** `POST /places/:id/stories` answers
`STORIES_CLOSED` unless the deployment says `CHIVAGO_STORIES_OPEN=1`. The
switch is thrown at the door on the day and back after the talk. A QR code
photographed in the room and shared a week later finds the door shut.

**From the place.** The same 250 m fence a check-in uses, and the second
signal under it (docs/30): a mocked or coarse fix is refused before ffmpeg
runs, and the fix is remembered like any other. Three a day per device.

**Nothing shows until a host says so.** A story is `pending` until a host
that *hosts in that area* approves it on the console — a moderator anywhere,
any other host only where it has a quest, so the team on the campus can and
the hotel on the island cannot. The pin, the place, the board and the public
media route all read `approved` and nothing else. Hide takes it down; either
decision can be reversed. The reviewer's name and host go on the row.

**Nobody is named, and nothing lasts.** There is no display name to show.
Every upload is re-encoded by ffmpeg — H.264 MP4, 720 wide, ten seconds at
most, with a poster frame; a photograph to a 720-wide JPEG — which also
strips the phone's EXIF, position included, before anything becomes public.
Every story expires seven days after it was made; an hourly sweep deletes
the row and its files. The bytes are sniffed, never trusted: MP4 and MOV by
their `ftyp` box, an iPhone's HEIC by the brand inside that same box (a
photograph, so it takes the photo encode - or, on a server whose ffmpeg
cannot read HEIF, a refusal that says what to change in Settings), WebM by
its EBML header, photographs by the proof sniffer's JPEG/PNG/WebP
signatures. 25 MB at most, refused from the request's `content-length` or
cut as it streams, never buffered whole first (docs/47); an 80-character
caption.

## The routes

| Route | Who | What |
|---|---|---|
| `POST /places/:id/stories` | a device, multipart `file` + `caption` + `position` | 201 with the pending story, or the refusal that names why |
| `GET /places/:id/stories` | a device | `{ open, stories }` — approved, unexpired, newest first |
| `GET /areas/:key/stories` | anyone | the board's feed for the screen in the room |
| `GET /stories/:id/media` · `/poster` | anyone | the bytes, approved only; revalidated on every play, so Hide is immediate (docs/47) |
| `GET /console/stories` | a host | what is waiting where this host reviews; reloads itself every ten seconds |
| `GET /console/stories/:id/media` · `/poster` | the reviewing host | a pending story's bytes, to decide |
| `POST /console/stories/:id/approve` · `/hide` | the reviewing host, CSRF | the decision |

## What holds it

`story-service.test.ts`: the door is shut by default and opens on the env;
MP4/MOV/WebM/JPEG are read and a PDF is not; a HEIC is a photograph and a
MOV a clip by the brand in the same box; a HEIC the server cannot convert
is refused with `STORY_HEIC` and words a person can act on; a 9 MB JPEG is
a photograph; too big is refused before a byte is written; a file ffmpeg cannot read leaves nothing on disk; the
caption is trimmed; a story cannot be told from the beach about the park; a
mocked fix never reaches ffmpeg; three a day; a new story is invisible
everywhere and unreadable to the public; the campus host sees it, the island
hotel does not, the moderator sees all; the reviewing host can look before
deciding; approval puts it on the pin and the board with the reviewer on the
record; the hotel cannot approve a campus story; hidden is hidden from
everyone; expiry deletes files; a photograph served is ffmpeg's re-encode,
not the upload.

## Still owed

- ~~The screens (day three)~~ Built: docs/45.
- Event mode (day four): the token in the QR, the registration limit for
  the day, the live API, the notice.
- A device can tell three stories a day; a room of phones behind one NAT is
  one address to the registration limiter, not to this quota — which is why
  the limiter is the thing to raise on the day, not this.

## Verified live

A three-second test clip made by ffmpeg (480×854, H.264 + AAC), pushed through
`submitStory` against the running API's own database on the campus park with
a real fix and `open: true`: ffmpeg re-encoded it (duration 3 s), the story
was pending, the team's host approved it, and the public routes answered -
`/stories/:id/media` 200 `video/mp4` with an `ftyp` box at byte 4 and
`h264 480×854 + aac` by ffprobe, `/stories/:id/poster` 200 `image/jpeg`,
`/places/ku-park/stories` and `/areas/ku-sriracha/stories` listing it with
`open: false`. The same clip sent through `POST /places/ku-park/stories` on
the dev server answered `STORIES_CLOSED`, because the door was shut. The test
story was then deleted, row and files, so no capture can carry it.
