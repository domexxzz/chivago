# 51 — The Samui five

The companions are now the team's own mascots. On 8 September the team
brought five reference renders — a monkey holding a coconut, a cream bird
with a crest of leaves carrying a tiffin, an octopus, a turtle, a buffalo —
and asked for the five species in the app to be replaced with them and the
models rebuilt to match. This is what changed, and the two things the art
left for somebody to decide.

## The five

| Habitat | Was | Now | Scientific | IUCN | Its own thing |
| --- | --- | --- | --- | --- | --- |
| Green | Dusky langur | Southern pig-tailed macaque · ลิงกัง | *Macaca nemestrina* | VU | the coconut it was trained to pick; round ears; the tuft |
| Wellness | Oriental pied hornbill | Red junglefowl · ไก่ป่า | *Gallus gallus* | LC | a crest of four leaf feathers, teal wings, orange feet; the tiffin |
| Food | Brahminy kite | Day octopus · หมึกสาย | *Octopus cyanea* | LC | eight arms, one of them waving; cream suckers; a sprout |
| Safe | Green sea turtle | Green sea turtle · เต่าตนุ (kept, redrawn) | *Chelonia mydas* | EN | the sprout, the spotted head, the brown shell |
| Quest | Fiddler crab | Water buffalo · ควาย | *Bubalus bubalis* | NE | the horns; a sprout of its own |

The buffalo is the domestic animal, which the Red List does not assess; its
wild ancestor *Bubalus arnee* is EN, and the record says so in a comment
rather than borrowing the category. `SPECIES_AS_OF` moved to 2026-09-08.

Each still carries one checkable fact, as `27-companions.md` requires: the
macaques that pick Samui's coconuts; the junglefowl as the ancestor of every
chicken; the day octopus changing colour in under a second; the turtle
returning to its hatching beach; a buffalo bout ending when one animal turns
away. **Verify all five before the pitch** with somebody who would know — the
same rule as the conservation categories.

## Two decisions the art did not make

**Which bird.** A cream body, a crest of four leaf-shaped feathers (three
gold, one orange), teal tufts at the ears, teal wings, a small orange beak,
orange three-toed feet. It is read here as a junglefowl: the crest is a comb
drawn as leaves and the feet are a chicken's, and the red junglefowl is a real
bird of Samui's hill forest. If the team meant another bird, the change is
one record in `packages/core/src/companions.ts` and the crest in
`companion-rig.ts`; nothing else names it.

**Which room the bird gets, and which the octopus.** The bird carries a
tiffin, which says food. But the Wellness room is a hill forest with no water
and the Food room is a fishing shore with the sea behind it, and an octopus
on a hill is wrong in a way a bird carrying its lunch up a hill is not. So the
junglefowl took Wellness — the hill forest edge, which is where the real bird
lives — and the octopus took Food, the reef off the fishing villages. The
tiffin stays in the bird's hand.

## What "to the reference" meant

The earlier five were field-guide animals: a langur on all fours, a kite in
the air, a crab in the mud. The art is a set of plush mascots, and the models
now are too:

- **standing upright**, a head near half the height, big eyes with
  catchlights, thin brows, a mouth open in a smile — every one of the five is
  drawn mid-laugh;
- **waving**, the right hand raised, on all five; the left hand holds the
  coconut or the tiffin, or hangs;
- **the wardrobe**: a patterned sash from shoulder to hip with two
  coconut-shell buttons where it crosses the chest, shorts, a rope belt with
  its knot and tassels. The cloth is a lattice of diamonds — the motif on
  all five sashes — drawn on a small canvas at run time from three colours.
  No image is shipped, which keeps the rule the room has always kept;
- **each animal's own thing**, in the table above, in the animal's own
  colours from the art (`rig.ts`, `LOOKS`, now with a `wear` block per
  species). Still none of them wears the evidence green; the leaf three of
  them wear is `LEAF_GREEN`, and the test holds the two apart;
- **a reaction each**: the macaque hops and holds the coconut up; the
  junglefowl flaps and hops, and pecks on its own clock while idle; the
  octopus lifts all seven resting arms and squashes like a bag of water; the
  turtle tucks its head and peeks; the buffalo tosses its horns and stamps a
  front hoof.

The five builders moved out of `Creature3D.tsx` into
`creature3d/companion-rig.ts`, beside the provincial `mascot-rig.ts`; the
scene file now owns only the room. The drawn marks in `Creature.tsx` — what
a phone shows, and what the wallet's list shows everywhere — were redrawn
face-on to match: the macaque with its coconut, the junglefowl's leaf crest,
the octopus with one arm up, the turtle's sprout over its shell, the buffalo's
horns.

## The reference art

`docs/assets/mascots/*.jpg`, five files, 720×960, downsized from the
1086×1448 images the team sent. Supplied by the ChivaGo team in chat on
8 September 2026. **Not shipped in the app** — the app renders its own
primitives — the images are here so the models can be checked against them.

Their licence is the team's to state. If they were made with a generating
tool, record the tool and its terms here before the images go anywhere public
— the rule that every image in this project carries a credit and a licence
applies to these, and today they carry a credit and an open question.

## Held by test

- `apps/mobile/test/creature-rig.test.ts` — every species in core has a look
  and every look names its species; no colour in fur or cloth is the evidence
  green and the leaf green is not it either; the field marks are the art's (a
  paler face on the macaque, a gold crest and teal wings, cream suckers on
  coral, dark spots under a brown shell, dark horns); every one is dressed.
- `apps/mobile/test/screens-detail.test.ts` — an egg does not name the
  junglefowl inside it; a sealed province names none of the species.
- `packages/core/src/mascots.test.ts` — the mascot for Surat Thani is an
  emblem, not a second macaque.

## Still owed

- **The bird**, confirmed by the team; and a native read of the four new Thai
  names.
- **The prints.** The sash and shorts carry one diamond lattice in each
  animal's colours, not the five different prints in the art.
- **The native app** still draws the marks only, as before.
- **Illustration is not modelling**, still. These are better primitives than
  the last set, built to a picture; a modeller with a week would do better.
