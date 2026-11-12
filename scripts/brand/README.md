# The logo, from artwork to every file in the app

Two scripts. The first lifts artwork off whatever background it arrived on;
the second cuts that one source into every logo and icon the app ships.

```bash
node scripts/brand/key-background.mjs <artwork.png|webp> <keyed.png>
node scripts/brand/build-logo.mjs <keyed.png> apps/mobile
```

Both need `ffmpeg` on the machine and nothing else.

## What they write

| File | What it holds |
| --- | --- |
| `assets/chivago-logo.png` | the full lockup, 1035 × 814, transparent |
| `assets/chivago-color-logo.png` | the same lockup; the auth screens import this name |
| `public/media/brand/chivago-logo.png` | the same lockup, for the web origin |
| `public/icons/icon-512.png`, `icon-192.png` | the CG mark alone, transparent, 86% inset |
| `public/icons/favicon-32.png` | the mark at 94% inset — small sizes want less margin |
| `public/icons/icon-maskable-512.png` | the mark at 60%, clear of Android's 80% safe circle |
| `public/icons/apple-touch-icon.png` | the mark **flattened onto white** |
| `public/favicon.ico` | the mark at 16 / 32 / 48 / 64 |

Two of those are not free choices and both are written down beside the link
tags in `apps/mobile/public/index.html`:

- **apple-touch-icon is white-backed.** iOS composites a home-screen icon over
  black, and the mark's dark outlines vanish into it.
- **favicon.ico holds four sizes.** Google's crawler wants 48 or a multiple of
  it and fetches `/favicon.ico` whether or not a tag points at it, so that
  file decides the mark in search results. A single 16 looks right in a tab
  and quietly costs that.

## Why the keying is not a colour-key

Deleting every pixel near the background colour gives a one-bit cutout, and
every antialiased edge pixel is part background — so it either survives as a
pale fringe or is deleted and leaves the curve jagged. On a wordmark at 32
pixels that is the whole image.

`key-background.mjs` treats the background as what it is, a layer behind a
partly transparent painting, and solves for the painting:

```
alpha  = how far this pixel is from the background, normalised
colour = (pixel - background × (1 - alpha)) / alpha
```

An edge pixel that is 40% ink over cream comes back as 100% ink at 40% alpha,
so it composites correctly onto anything afterwards. Checked against white,
the teal header `#028090` and near-black before the files were replaced.

The background colour is read off the four corners rather than passed in, and
the script warns if they disagree by more than a couple of levels — which is
how it would tell you the artwork has a gradient behind it and this approach
does not apply.

## Splitting the mark from the wordmark

`build-logo.mjs` does not have the crop typed into it. The only band of fully
empty rows across the lockup is the gap between the mark and the word, so the
file says where it divides; redrawn artwork with different proportions still
divides in the right place. If that band ever disappears the script stops
rather than guessing.

Icons are the mark alone because a wordmark at sixteen pixels is a smudge, and
a browser tab is sixteen pixels. That is also what the files being replaced
already were — checked before anything was overwritten.

The in-app headers are a different call and go the other way: all five of them
(Home, Map, Missions, Safety, Game) show the **full lockup** at 68 × 48. A
mark-only header was tried there and taken back out — the script can emit one
by copying its internal `mark` to `assets/`, which is the two lines to add if
it is ever wanted again.
