# 45 — The story screens

Day three of docs/42: what a phone and a projector show of the stories in
docs/44.

## On the place

`StoriesBlock` (`components/Stories.tsx`) sits under the live figures on the
place screen. A row of round posters, gold-ringed, one per approved story,
newest first, each with its length. Under the row, the door: *Tell a story
here* when the deployment has opened it, and *Stories open at the event, at
the place* when it has not - a sentence that says when, never a button that
fails. A sent story is counted as pending, with the line *Sent. It shows once
the team has looked at it*, and stays out of the row until it is approved.

*Tell a story* opens the phone's own camera: `expo-image-picker`'s
`launchCameraAsync` with `mediaTypes: ['videos', 'images']`, which on the
web is a file input with `capture` - the browser hands over the recording
the OS made, HEVC and all, and the API re-encodes it. Then a fix from the
phone, with its accuracy and mock flag, and the multipart upload; the reply
is the pending story or the refusal that names why (outside the fence, a
mocked fix, the third of the day, the door shut).

## The viewer

Full screen, black, one story at a time. A segment per story across the
top, the seen ones filled. On the web the clip plays in the browser's own
`<video>`, muted - a room full of phones is loud enough - and the next one
starts when it ends; a photograph stands still. Tap the right two thirds
for the next, the left third for the last, the way every phone already
knows; the caption sits at the bottom with *n / N · tap to continue*. On a
phone without a player the poster shows and says *Video plays on the web
for now*.

## On the map

`GET /areas/:key/stories` once per area, and every pin with a story wears
the newest photograph taken there - a round, gold-ringed poster hanging off
the left of the chip. Both maps: the drawn island through `PinChip`, the web
map through `.cg-tale` in `TerrainMap`'s marker CSS. Gold is the colour the
app already uses for what is self-reported (Trip Points), which a story is.

The ring alone was the first version, and it was a footnote about a
photograph rather than the photograph. On a map the picture somebody took
at that beach is most of the point.

Two doors on one pin, and they are not the same door: the chip opens the
place, the poster opens the clip. A pin that wears one is `TALE_W` wider
than one that does not, and `layoutPins` is told which pins those are, or
de-collision would clear two chips of each other and then draw a picture
over the neighbour it had just made room for. The stem stays under the chip
alone: centring it under chip-plus-poster would slide the tip twenty pixels
east of the point it marks, which on a map of one island is a different
beach.

The drawn island's bubble is 26 px, not the web map's 46. It was sized in a
browser rather than chosen: at 40 and at 30 its lower edge crossed into the
top of the chip below, because Chaweng, Fisherman's Village and Lamai share
a band on that 344 px drawing barely wider than three chips. At the chip's
own height the rhythm survives untouched, and it is aligned to the chip's
TOP edge - centred hung it eight pixels low, since the thing it is centred
against is the chip plus its 16 px stem. Bigger is a better photograph and a
worse map, and the photograph is one tap away at full size.

## What is attached, before it is sent

The one sheet shows the picture, not a file name. "Attached - image.jpg" is
a receipt and answers the wrong question: what somebody wants to know just
after pointing a phone at something is whether they got the shot, and only
the shot can answer that. A video gets a tile with a play mark instead -
nothing in the app can decode a frame before the file is uploaded, and a
black rectangle would read as a clip that failed to record.

## Posting from the map

The bar at the foot of the map (`strings.place.moment`) posts without
opening a place first, which is where the user-journey sketch starts. It
NAMES the place it will post to, because a map shows five pins and a clip
has to land on one of them - the nearest, and said on the face of the
control rather than in a toast afterwards. With no fix there is no nearest,
and it asks for location instead of guessing: a clip filed at a beach
somebody is not standing on is a false record. The three steps and the four
refusals live once, in `apps/mobile/src/state/tell-story.ts`, shared with
the place screen's sheet.

## The board

`GET /board/:area` is the page on the projector: one HTML file the API
serves, no session, no build, dark. It polls the area feed every three
seconds and shows every approved story newest first and largest, muted,
looping, with the caption and the place; a card that stays is not rebuilt,
so its clip does not restart on every tick. It says at the top whether the
door is open. It reads the feed and nothing else, so it cannot show what a
host has not approved.

## The demo

The static demo answers `/places/:id/stories` from the snapshot - empty
lists and `open: false`, which is the truth on the 5th - and refuses the
upload with the sentence about the 11th. A multipart body is not JSON, and
the demo's fetch stand-in now says so instead of throwing.

## Tests

`stories.test.ts` (mobile): a shut door says when it opens and offers no
button; an open door offers the camera and a press asks for it; a sent
story is counted and not in the row; a tapped poster opens that story with
its caption and its place in the row; the place screen asks for the stories
and shows the door's state. `hardening.test.ts`: the board is public, names
the area and polls the feed; an area we do not have is not a board; the
feed says the door is shut.

## Still owed

- Sound on the viewer, behind a tap; a player on phones.
- Event mode (day four): the token in the QR, the registration limit for the
  day, the live API, the notice at the door.

## Verified live

Against the running API with two approved test clips on the campus (the
ffmpeg test pattern, three seconds each, at the park and the library), in a
real Chrome at phone width on the Expo web build:

- The place screen for the park showed the STORIES row with one gold-ringed
  poster labelled *3 s*, and under it *Stories open at the event, at the
  place*, because the door was shut.
- Tapping the poster opened the viewer: a `<video>` filling the viewport
  (627 × 809), playing (`paused: false`, `readyState 4`, muted), the caption
  *ยามเย็นริมบึง · evening by the lake* in white at the bottom, *1 / 1 · tap to
  continue*, and it closed itself when the clip ended - which is why a
  screenshot taken four seconds after the tap shows the place again.
- The board at `/board/ku-sriracha` showed *มก. ศรีราชา · KU Sriracha ·
  2 stories · closed*, the newest clip large and playing, updating every three
  seconds.
- On the map, the library and the park - the two places with a story -
  wore the gold ring (`cg-storied`, box-shadow 2 px page, 5 px gold) and
  the other three did not. It had not lit at first: the feed sat before the
  CORS middleware and the Expo dev origin could not read it, exactly the
  hole the statement route had (c80903f). The feed and the media now
  answer any origin, and a test holds the header.
- A first-time visitor arriving by QR met onboarding first and, on
  finishing, landed on the place the QR named - the jump to Home had been
  wiping the push before this.

The test clips were deleted, row and files, before the demo was captured.
