# 35 — Seventy-seven mascots

The companions were five real animals for five Samui habitats, and the
other seventy-five provinces held sealed eggs that named no species —
because you cannot say what lives somewhere nobody has surveyed
(`27-companions.md`). That refusal was about wildlife, and it stands.

A mascot is a different kind of claim. It is the province's emblem drawn as
a small creature: the white elephant on Chiang Mai's seal, the rooster on
Lampang's bowls, Trang's dugong, Nonthaburi's durian, Loei's ghost masks,
Samut Songkhram's mackerel with the bent neck. Seventy-seven of them, one
per province, no two the same creature, in `packages/core/src/mascots.ts`.

## What one is made of

Every mascot is data: a body archetype (bird, beast, sea creature, naga,
bug, sprite, ape, shell), an outline (round, pear, tall, flat, long), what
it wears on its head, its ears, its tail, one prop, four colours, a
nickname, what it is, one line on why, and `basis` — where the emblem came
from: the seal, an animal the province is known for, something it grows or
makes, a craft, a festival, a place, or a legend.

One renderer draws all of them. On the web, `creature3d/mascot-rig.ts`
builds the body from the same primitives as the Samui species — sphere,
capsule, cone, tube — bolts on the parts, and hands the scene a rig it can
breathe, blink and bounce; each body has its own idle and its own answer to
a tap (a bird flaps, a naga rears, a bug buzzes, a shell tucks its head).
On a phone, `MascotMark.tsx` draws the same creature as an SVG mark from
eight silhouettes, small enough for seventy-seven on one screen.

## What it refuses

**No two are the same creature.** A test holds that the signature — body,
outline, crest, main colour — differs between every pair, that every
archetype is used, and that none is half the collection.

**It says where it came from.** Every card prints its `basis`, so a reader
can tell a seal from a famous fruit from a local legend, and somebody who
knows better can correct it. The file's own header says what it is not: it
is not the Ministry's list of provincial trees and flowers, and a `basis`
means "drawn from", never "the official symbol of".

**The guide hides nothing.** The Samui eggs stay sealed, because an egg that
hinted at the species would spend the only surprise the collection has. A
province's emblem is public — it is on the seal — so the field guide shows
all seventy-seven, and records only whether this traveller has been: the
passport's verified provinces stamp a card, and nothing else does.

**No mascot wears the evidence green.** The catalogue's test holds the
colours.

**It wants nothing.** No feeding, no levels. The room is the room.

## Where it is

The passport has a door to the field guide (`MascotsScreen`), grouped by
region with a "met" count per region; a card opens the mascot's room
(`MascotRoom`), the same room a companion has, with the emblem's one line
and its basis under it.

## Still owed

- **The emblems checked.** Each `basis` is the author's best knowledge of
  what the province is known by. Before a province ships, somebody from it
  should read its card.
- **A native Thai read** of the seventy-seven names and lines, on the
  review page.
- **Sound, and a modeller.** As for the companions.
