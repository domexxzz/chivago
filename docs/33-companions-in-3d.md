# 33 — Companions in three dimensions

The room you visit a companion in (`27-companions.md`) shipped with a drawn
mark: five SVG animals, each built from the one feature you would name it by,
tinted by stage. It was honest and it was flat. This is the room with the
animal in it.

## What is on screen

On the web, `apps/mobile/src/components/creature3d/Creature3D.tsx` renders a
real-time scene: the animal built from primitives, on a patch of the ground it
lives on, with the things that live there too, lit by the island's clock. A
coconut macaque in the forest at Na Muang; a green sea turtle on the sand at
Chaweng with the sea behind it; a water buffalo in the mangrove under prop
roots; a day octopus on a fishing shore; a junglefowl on the hill; an egg in
a nest. Since 8 September the five are built to the team's own reference art
— upright, waving, in a sash and shorts — in `creature3d/companion-rig.ts`
(`51-the-samui-five.md`); the room around them is what this note describes.

It is alive in the ways an animal is and a mascot is not:

- it **breathes**, and an egg wobbles instead;
- it **blinks**, at intervals that are not a metronome;
- it **looks at your finger**, head only, within what a neck allows;
- it **answers a tap** the way that animal would — all five wave, as drawn,
  and then the macaque hops and holds up its coconut, the junglefowl flaps
  and hops, the octopus lifts its resting arms and squashes, the turtle tucks
  its head and peeks, the buffalo tosses its horns and stamps;
- it **turns slowly** while nobody is touching it, and you can drag it round.

The light is the island's. `rig.ts` maps the hour in Bangkok to a sun that
rises at six and sets at half past, golden at the edges and white at noon, and
to a blue moon at night that still lights the room — a companion opened after
dinner, which is when people open it, is not a silhouette in a dark box.
Fireflies show only when it is dark enough to see them. `?hour=13` on the
URL shows the room at that hour, for a demo given at midnight that wants the
beach in daylight.

## What it refuses

**Primitives, still.** No model file, for the same reason the SVG marks have
no photograph: a downloaded monkey carries somebody's licence and somebody's
idea of a monkey. Every shape is a sphere, a capsule, a cone or a tube along
a curve, placed by a number a person can read and change. The one texture —
the diamond lattice on the sashes and shorts — is drawn on a canvas at run
time from three colours, so there is no image file either.

**The animals wear their own colours.** The marks were tinted by stage
because they were marks. A three-dimensional turtle is olive because a turtle
is olive. The stage is said by size (a hatchling is smaller, with the bigger
head and eyes that young animals have), by the egg, and by the badge beside
it — never by colour, and never by the app's evidence green, which a test in
`creature-rig.test.ts` holds no animal may wear.

**An egg gives nothing away.** One egg for five species, speckled in the
colour of its habitat. The speckles are seeded by the habitat, not the
animal.

**It wants nothing.** No hunger, no sleep, no feed button. The meters under
the room are the habitat's measured air and crowding, as they were, and
nothing in the scene writes to them. A tap gets a reaction and a few hearts,
and that is all a tap is worth.

**Reduce-motion means still.** Not slower: one composed frame and no loop.

## What it costs, and where it does not run

three.js is 720 KB of browser code, split into its own chunk and fetched the
first time a room is opened. A phone never evaluates it — `expo-gl` needs a
development build the app has never had — so the native screens keep the
drawn marks through `CreatureScene.tsx`, the same switch the map uses. It
is still in the native bundle, as MapLibre is, until a `.web.tsx` split the
test harness can follow exists.

The scene draws one frame immediately, before any animation. A document that
is hidden at mount — a background tab, an embedded preview — gets no
animation frames, and the first version rendered nothing in that state; the
still image is the floor and the loop runs on top of it.

## Still owed

- **Illustration is not modelling.** These are good primitives, now built to
  a picture. A modeller with a week would do better, and — unlike a
  photograph of a real place — a sculpted macaque is honestly a sculpture.
- **No sound.** A junglefowl's crow would be worth having and would need a
  recording somebody holds the rights to.
- **The native app.** `expo-gl` and a development build; the rig would carry
  over as it stands.
- **A native Thai read** of the two new strings.
