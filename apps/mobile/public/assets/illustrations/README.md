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

`E:/D-drive-rescue/Chivago-backups/backup-1-20260910/`

Contains a pre-edit workspace copy and a verified Git bundle. To undo this image
refresh, restore the two screen files from `workspace/apps/mobile/src/screens/`
after checking that they do not contain newer edits, then rebuild the web demo.
The unused illustration can remain on disk; it does not change any screen.
