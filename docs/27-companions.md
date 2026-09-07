# Companions

An egg per habitat, hatched by the evidence you already earn.

## The question a collection mechanic has to answer

What makes one rare?

Spending points would make this a shop. A random roll would make it a slot
machine. Neither is a thing a conservation app should teach, and both were
available and easier.

So the ladder is the **evidence ladder the rest of the app already runs on**,
made visible as a creature:

| Stage | What it means | Evidence standard |
| --- | --- | --- |
| **egg** | you were there | geofenced check-in, self-verified |
| **hatchling** | you covered the habitat | a *second place* in the same habitat |
| **grown** | somebody vouched for your work | a host-approved quest — the Green-Point standard |

A companion is therefore not a prize. It is a picture of what kind of evidence
somebody has accumulated in one habitat, and it cannot be bought, rolled for,
or granted by any route. There is no `POST /companions`.

Two properties are enforced by test:

- **Hatching needs breadth, not repetition.** Checking in twice at the same
  beach is one place. Otherwise the mechanic rewards loitering.
- **Nothing moves a companion backwards** — the same reason spending points
  never lowers a level. A collection that can shrink teaches people not to use
  the app.

## Derived, never stored

`GET /companions` reads the ledger: `kind='checkin'` rows joined to their place
for the habitat, `kind='quest_reward'` rows for the verified quests. There is
no companions table.

A stored collection would be a second record of facts the ledger already holds,
and two records of one fact eventually disagree. This project avoided that once
already by reading visit history out of the ledger rather than keeping a visits
table beside it.

## Real animals, not invented monsters

One species per habitat, each with its binomial and one fact somebody could
check:

| Habitat | Species | | IUCN |
| --- | --- | --- | --- |
| Green | Southern pig-tailed macaque · ลิงกัง | *Macaca nemestrina* | VU |
| Wellness | Red junglefowl · ไก่ป่า | *Gallus gallus* | LC |
| Food | Day octopus · หมึกสาย | *Octopus cyanea* | LC |
| Safe | Green sea turtle · เต่าตนุ | *Chelonia mydas* | EN |
| Quest | Water buffalo · ควาย | *Bubalus bubalis* | NE |

Invented creatures would have been easier and would have taught nothing. An app
whose whole argument is that the island is worth looking after can name what
actually lives on it.

Since 8 September the five are the team's own mascots — the animals people
on Samui actually meet, drawn upright and waving — and the models and marks
follow the team's reference art (`51-the-samui-five.md`, which also records
the two decisions the art left open: which bird, and which room). The first
five — dusky langur, pied hornbill, brahminy kite, fiddler crab, and the
turtle drawn from above — are in the history.

The conservation categories carry `SPECIES_AS_OF`, because IUCN status is
exactly the kind of claim that ages — the same rule the fare table and the
price baselines follow.

## An egg names its habitat, not the filter chip

The first build called them "Safe egg" and "ไข่สายGreen": the layer key, which
is the name of a filter chip rather than of anywhere a traveller has been — and
in Thai it was not translated at all. They are now "Beach egg · ไข่จากหาดทราย",
"Forest egg · ไข่จากป่า" and so on. An egg says **where** it came from, which is
the whole idea of one per area, while still not saying **which** animal is
inside. A test asserts an egg name never begins with its layer key.

## Still owed

- **A biologist should check the five species and their IUCN categories**
  before this is shown to anybody who would know. A stale category is the same
  credibility loss as an invented photograph.
- **No artwork.** Each companion is type and a border today. Illustrated
  creatures would carry this feature much further, and — unlike photographs of
  real places — a drawing of a langur is honestly a drawing.
- **Five habitats, five species.** More places on the island would want more,
  and the mapping is one-per-layer rather than one-per-place.
- **Native Thai review** of the species copy and the next-step lines.
