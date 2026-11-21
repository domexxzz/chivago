# Companions illustration — 21 November 2026

`mascots-beach-day.jpg` was replaced with artwork the owner supplied. It is a
decorative illustration of the app's companions, not a photograph of Ko Sichang
or of any real place, and it is not evidence of anything.

Supplied as WebP at 1584 x 993 and converted here with ffmpeg: cropped one
pixel from the top to an exact 16:10 and encoded at `-q:v 5`, which is
1584 x 990 and 420,315 bytes. The frame it renders in is `aspectRatio: 16 / 10`
with `resizeMode: cover` on both HomeScreen and MascotsScreen, so at this
ratio nothing is cropped away. The image it replaced was 1024 x 768, which that
frame cut top and bottom.

**`mascots-beach-sunset.jpg` is untouched and still shows the previous
characters.** `mascotBeachUri` serves it from 17:00 to 05:59, so the evening
card does not match the daytime one until a sunset version of this artwork
exists, or until both hours point at this file.

The owner is the source of the artwork; how it was produced is theirs to
record here if they want it recorded.

# Image refresh — 10 September 2026

`mangrove-habitat-v1.jpg` is an AI-generated decorative habitat illustration,
not a photograph of Thong Krut or evidence of a completed activity. It is used
only in the existing missing-photo frames for `mangrove` on Home and Place.
The existing no-photograph caption, location data and system icon remain.
Real place photographs, user media, maps, logos and verification badges are unchanged.

Generated with the built-in image_gen tool. JPEG encoding: quality 85,
1672 × 941 pixels, 359823 bytes. The original PNG is preserved outside the
repository in the backup point 1 QA folder and at the tool's original output path.

## Prompt

Create a landscape 16:9 decorative illustration for an existing eco tourism app
image placeholder. Premium lush Thai tropical mangrove habitat, emerald foliage,
intricate mangrove roots and a turquoise tidal channel with one young seedling
in foreground, warm sunlight and atmospheric depth, inspired by polished
sustainable travel imagery. Clearly stylized handcrafted 3D diorama / editorial
illustration, visibly NOT a documentary photograph of any named real place.
No people, no buildings, no map pins, no logos, no letters, no text, no badges,
no phone frame or UI. Strong centered scene that also survives 172x112 and wide
190px-high crops. Keep bottom 15 percent light softly sandy cream so existing
dark caption remains legible. Rich natural colors, refined clean details.
Deliver a single finished image.

## Placement

- HomeScreen.tsx: existing 172 × 112 card image frame; reserve its bottom 24 px
  for the existing place abbreviation.
- PlaceScreen.tsx: existing 190 px hero; reserve its bottom 32 px for the existing
  no-photograph caption.
- Both placements are conditional on `place.id === 'mangrove'` within existing
  missing-photo fallbacks. A real photo supplied by the API still takes precedence.
- No route, API, schema, theme, button or layout changes.

## Backup point 1

`E:/D-drive-rescue/ChivarGo-backups/backup-1-20260910/`

Contains a pre-edit workspace copy and a verified Git bundle. To undo this image
refresh, restore the two screen files from `workspace/apps/mobile/src/screens/`
after checking that they do not contain newer edits, then rebuild the web demo.
The unused illustration can remain on disk; it does not change any screen.

# ChangChang's shore — 13 November 2026

`koh-sichang-shore-v1.jpg` is the backdrop behind the greeter on Home
(`apps/mobile/src/components/GreeterCard.tsx`). The owner supplied it on
13 November 2026; it was converted from a 2.1 MB PNG to JPEG at quality 4,
1672 × 941, 259 KB, which is where the other illustrations in this folder
sit.

**It is a decorative illustration, not a photograph**, and nothing on the
card says otherwise. It is not evidence of a place, not a licensed
photograph of Ko Sichang, and not used in any frame that reports a
measurement. The pavilion on the headland reads as the island to anyone who
knows it, which is the point of standing the mascot in front of it — but the
claim the card makes in words stays what it was: the mascot is a character
made for ChivaGo, not a species and not a statement about the island's
wildlife.

Why the mascot needed a backdrop at all: with none, the owner's words were
that it looked "ลอยๆ" — floating, not part of the app. Two earlier attempts
at a surface (a flat colour band, then the app's own wave graphic) each fixed
part of that. A picture of somewhere fixes the rest, because the problem was
never the colour behind him; it was that he was not anywhere.
