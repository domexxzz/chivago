# 60 — The indicator that refuses

`docs/59` has carried the same line since it was written:

> An indicator mapping layer that **refuses** the wrong indicator, not merely
> suggests the right one. The 306-3 finding generalised: the value is in the
> no. **Still open, and now the largest single item on either side.**

This is the design for it. No code yet, on purpose: the wrong version of this
feature is worse than not having it, and the wrong version is the obvious one.

## What side A is actually buying

Not a report. They have a report. What they do not have is anybody who can
tell them whether what they filed matches the standard they filed under.

The worked example is already in this repository. `57-the-token-question.md`
found that beach-cleanup kilograms are **not** GRI 306-3: GRI defines waste as
what *the holder* discards, and 306-3 covers waste from an organisation's own
activities. Beach litter was discarded by somebody else. The honest home is
GRI 3-3-e-ii as a supplementary indicator, or GRI 306 in the role of a waste
*manager*, said as such and kept apart from the company's own operational
waste.

That finding took a day. It would have survived a review unchallenged. **It is
the product.**

## The obvious version, and why it is wrong

The obvious build is a table: measure in, indicator out. `weight_kg` → GRI
306-3. Ship it as a dropdown.

Three things are wrong with it, and they compound.

**It gets the 306-3 case backwards.** Kilograms are not the problem. A
company's own office waste in kilograms *is* GRI 306-3, correctly and without
argument. What disqualifies the beach cleanup is not the unit, it is **whose
waste it was**. A table keyed on our measure cannot see the fact that decides
the case, so it would answer confidently and wrongly in both directions.

**A recommendation is a liability in a way a refusal is not.** `docs/57` is
explicit that its GRI reading is *a reading, done against published guidance
and not against a ruling or an assurer's opinion.* A layer that answers "file
it under 306-3" invites a company to file on our say-so. If we are wrong,
they are the ones who filed it. A layer that answers "306-3 cannot hold this,
because GRI defines waste as what the holder discards" is bounded by a
definition anybody can go and read.

**A table that returns an answer for every pair is lying about its coverage.**
There is no world in which we have researched every GRI, IFRS S1/S2, SEC
56-1 and GHG Protocol line against every activity a host might run. A layer
that never says "I do not know" has quietly converted absence of research into
approval — the same failure `#76` was built to avoid on declared use, where an
empty list had to be stopped from reading as "nobody used it".

## The shape: refusals, not recommendations

The layer holds **refusals**, with conditions as a second class, and returns
**unknown** for everything it has not been taught.

| verdict | what it means | what it is safe to do with |
|---|---|---|
| `refuses` | a definition in the standard excludes this | do not file it there; the reason is quotable |
| `conditional` | it can go there **if** something is stated | file it with that sentence, not without |
| `unknown` | a rule exists and one fact is missing | answer that fact; **this is not approval** |
| `unexamined` | nobody here has examined this pair | ask a human; **this is not approval** |

There is deliberately no `fits`. The nearest thing to a yes this layer can
produce is a `conditional` whose conditions are all satisfied, and even that
is phrased as *nothing here refuses it*, never as *this is correct*.

**Building it added a fourth.** The table above ran two cases together, and
writing the code separated them: `unknown` is a rule that exists and needs one
more answer — the valuable state, because it names the question — while
`unexamined` is nobody here having looked at the pair at all. They read alike
to an optimist and must not: one is a question we can ask, the other is a gap
in our coverage. Neither is approval, which was the principle and is
unchanged.

That asymmetry is the whole design. It mirrors `esg.ts`, which has always
shipped `NOT_CLAIMABLE` beside every figure rather than a list of things the
figure does prove.

## Rules key on facts about the activity, not on our measure

This is the part the obvious version misses.

A rule needs to test the thing the standard's definition turns on. For 306-3
that is who discarded the material. So the layer needs a small, explicit set
of **activity facts** — the same move `evidence-level.ts` made with
`EvidenceFacts`, where the rungs are decided by named booleans rather than by
a guess about the row.

A first set, drawn from the cases we actually have:

- `materialOrigin` — `own_operations` · `third_party` · `mixed` · `unknown`
- `organisationRole` — `generator` · `manager` · `funder` · `unknown`
- `boundary` — whether the activity sits inside the reporting entity's
  operational boundary at all
- `measuredBy` — `host_verified` · `declared` · `unknown`, which is where
  `evidence-level.ts` and `declared.ts` plug in

**`unknown` is a first-class value and it does not pass.** If nobody has said
whose waste it was, the layer cannot refuse 306-3 and must not permit it. It
returns `unknown` **and names the fact that would settle it.**

That last clause is what turns this from a gate into a product. The answer a
company gets is not "no" and not "yes" but:

> This cannot be placed until you say whether the material was discarded by
> your own operations or by somebody else. GRI defines waste as what the
> holder discards, so that one fact decides whether 306-3 is available to you.

A consultant charges for that question. Most of them do not ask it.

## What a rule must carry to be worth trusting

Every rule is a claim about a document somebody else wrote. So each one
carries, as data and not as a comment:

- the **framework and line** it is about — GRI 306-3, IFRS S2 29(a), GHG
  Protocol Scope 3 Category 12
- the **clause it rests on**, quoted short and attributed
- the **fact it tests** and the value that triggers it
- **when it was read, and by whom**
- what was **not** checked

The last two are not decoration. `docs/57` could not read the SEC's own pages
— they refuse automated access — and said so in the document rather than
letting the gap sit silently inside a conclusion. A rule with no read-date is
a rule nobody can tell has gone stale, and these standards move: IFRS S1/S2
are being adopted in Thailand on a timetable, GRI revises sector standards,
and the Thailand Taxonomy is on phase two.

**A stale rule must be able to expire loudly rather than answer quietly.** A
rule read more than N months ago still answers, and says how old its reading
is, every time.

## Where it sits

```
                 ┌────────────────────────────┐
  our measures ──┤                            │
  (kpi.ts)       │   indicator rules          │──▶ refuses / conditional / unknown
                 │   + activity facts         │    + the clause it rests on
  their file  ───┤                            │    + what would settle it
  (declared.ts)  └────────────────────────────┘
```

Both sides feed it, which is the point of doing it once.

**Side B** — we ran the activity, so the facts are ours to state, and the
layer runs when a quest's plan is fixed (`#77`), catching a wrong indicator
*before* anything is measured rather than at filing season.

**Side A** — they hand us a file, `declared.ts` reviews its arithmetic and
dates (`#73`), and this layer reviews where they have put it. A review page
already exists and stores nothing; this adds a column to it.

## What it refuses to do

**It does not file anything.** It produces a verdict and the reason; a human
writes the disclosure.

**It does not become an assurance opinion.** `countersign.ts` exists for an
accredited firm's conclusion and this is not one. A refusal is ChivaGo's
reading, and the page says so with the same weight `DECLARED_NOT_VERIFIED`
gets today.

**It does not convert.** No rule may output a number. The moment a mapping
layer can say "and therefore 2.4 tCO2e" it has become the emission-factor
table `esg.ts` has refused since it was written, wearing a different hat.

**It does not carry a rule nobody can source.** If the reason cannot be traced
to a clause, the rule does not exist. An opinion held confidently by the team
is not a rule; it is a conversation, and `kpi.ts` already established what
happens to those — they get a commit that can be reviewed, or they stay
conversations.

## What could not be verified

**No company has been through this.** Every claim here about what side A wants
is inference from `docs/59`, from `57`, and from what the standards require —
not from a signed engagement.

**The rules do not exist yet.** The only one that has been researched to the
standard described above is the 306-3 case, and even that was a reading of
published guidance, not a ruling or an assurer's opinion.

**The fact set above is drawn from one example.** `materialOrigin` and
`organisationRole` are what the 306-3 case needed. A second researched case
will almost certainly add a fact, and may show that one of these two was
badly drawn. That is expected and is the reason to build the mechanism around
three or four real rules rather than around a taxonomy invented up front.

**Nobody has priced it.** `docs/59` prices side A per engagement and says the
arithmetic there is modelled, not quoted. Nothing in this document changes
that.

## What to build first, and what to build never

The staging matters more than the schema.

**First: one rule, end to end, and the machinery it forces.** The 306-3 case,
with its clause, its facts, its read-date, and the `unknown` path that asks
whose waste it was. One rule exercises every part of the design and is small
enough to throw away if the shape is wrong. **Done in `#83`** — it found the
fourth verdict above and otherwise held.

**Second: the console column.** On the review page `#73` already has, beside
each declared line. This is where a real file first meets the layer, and it
will be the first honest test of whether the fact set survives contact.
**Done in `#84`.** The fact set survived, with one correction: **one of the
four facts is not a question.** `measuredBy` looked like a fourth thing to ask
the customer, and on this page it cannot be — a pasted file is self-declared
by definition, and asking would invite the answer *verified*, which
`DECLARED_NOT_VERIFIED` at the top of that page exists to refuse. It is fixed
rather than offered, and the declared basis still reaches the conditions when
a placement is allowed. The second finding was smaller and sharper: the
measure has to be read off **their** unit column, so `measureFromUnit` refuses
to guess and the page prints which measure it concluded, because a wrong
reading there makes every answer below it about the wrong kind of figure.

**Third: the pre-flight on a fixed plan.** When `#77` locks a quest's
measurement plan, run the layer against the indicator the partner intends. A
wrong indicator caught before the activity runs is worth more than the same
finding at filing season, and it is the same rule doing it. **Done in `#85`**,
and it finished the finding stage two started: `measuredBy` is never a
question on *either* side. A pasted file is declared by definition; a quest's
figure is host-verified by definition. It is fixed by which side of the
business the figure came from, so the fact set is really three questions and
one piece of context. Two decisions went the other way from what the design
implied: the intended line is **not** in the plan's digest, because where a
figure is reported is not what was measured; and it is **not** frozen by a
plan lock, because the point of catching a wrong line early is being able to
correct it without superseding a measurement plan that was never wrong.

**Never: a dropdown of indicators to pick from.** The moment the UI offers a
list of GRI codes, somebody picks the nearest one and the layer's whole
contribution — *asking whether it belongs there at all* — has been designed
out of the product.

## What the second rule taught

The design said a second researched case would *almost certainly add a fact,
and may show that one of these two was badly drawn.* The second rule is GHG
Protocol Scope 3 Category 5, written in `#86` from the Technical Guidance
chapter itself — read directly, pages 72–80, not through a summary. The
prediction was half right, and the half it got wrong is the more useful one.

**The same fact decides two standards.** Category 5 is defined by waste
*generated in the reporting company's owned or controlled operations* —
which is the fact GRI 306-3 turns on, reached from a different document by a
different body. Keying rules on facts about the activity rather than on our
measures was a bet made on one example. Two independent standards landing on
the same fact is the first evidence it was right, and it has a direct
commercial consequence: **a customer answers "whose waste was it?" once, and
it settles both lines.** A test holds the two rules to the same verdict for
every answer.

**Not every rule needs every fact.** Category 5 never asks about the
organisation's role, because its clause does not turn on it. The design
implied a fixed questionnaire; it is actually each rule asking only what its
clause needs.

**A weight can be an input without being the answer.** For a company's own
waste, kilograms are exactly the activity data Category 5's calculation starts
from — and still not the Category 5 figure, which is in CO2e and needs
emission factors this platform does not hold. That is a kind of `conditional`
the first rule never produced, and it is the most useful sentence the second
rule says.

**The predicted new fact did arrive — and was deliberately not made a
question.** Category 5 also requires the waste to be treated by a *third
party*; a company's own facility is scope 1 and 2. That is a genuine new
fact. It is carried as a condition on the permitted branch rather than asked,
because the activities this platform runs are never treated in a customer's
own plant, and a question every customer answers the same way is a cost with
no finding in it. The day a rule needs it to change a verdict, it becomes a
question.

**What the design did not predict at all was line identity.** GRI has one
canonical code per disclosure. The GHG Protocol does not — *Category 5*,
*Cat 5* and *Scope 3 Category 5* are the same line, and a partner types
whichever they use. So a rule now lists its aliases, matched exactly after a
deterministic normalisation. Never fuzzily: a bare "5" or "Category 50" stays
`unexamined`, for the same reason `measureFromUnit` refused to guess a unit.

**And one of the first rule's own guards was wrong.** The test that no verdict
carries a converted figure refused the string "CO2e" outright, and only walked
306-3's branches. The first flaw would have stopped the second rule saying the
one thing it most needs to say — that Category 5 is reported in CO2e, and a
weight is not. The second meant the guard silently covered less as the rules
grew. It now walks every branch of every rule and forbids a *quantity* in a
carbon unit, which is what it was always for.

## What the third rule taught

The third rule is GRI 413-1 against a count of people — the first on the
social side, written in `#87` from GRI 413: Local Communities 2016 itself.

**The first rule that asks nothing.** 413-1's figure is a *percentage of the
organisation's operations*. No answer about the activity turns a headcount
into that, so the rule reads no fact and refuses at once. A question whose
answer cannot change the verdict is not asked — it would spend the customer's
time to produce the same sentence.

**The one case the obvious table gets right.** This document opened by arguing
against a table from our measure to an indicator, because 306-3 turned on a
fact the measure could not see. Here the clause turns on the *unit*, and the
measure alone decides it — which is exactly what a table handles. So the
design was never "facts instead of measures". It is **facts where the clause
turns on the activity, and the measure where it turns on the unit.** That is a
more exact statement of the design than the one this document started with.

**People who took part are not, by that alone, local community.** GRI defines
local communities as people living or working in areas the organisation's
activities affect. The people on this platform are very often travellers. A
report calling four hundred visiting volunteers "local community members
engaged" would misstate who they were, and the redirect says so.

**And building it found a defect in the first two.** Every rule's Thai is a
long string split across source lines, and a space left at a join is right in
English and wrong in Thai whenever the join falls mid-phrase. Twelve such
splits had shipped in `#83` and `#86` — a possessive torn from its noun, the
placement limit that prints on every result — and four more were written into
this rule. No test caught them. Neither did the Thai review script, which
never sees a concatenated literal as one string, so the one place this defect
lives is the one place it cannot look. Reading the Thai caught them. A guard
now fails on the shapes that shipped, across every module in the package; it
does not replace reading.

## What holds it

The thing this layer sells is a sentence a company cannot get anywhere else
cheaply: **that is the wrong line, and here is the definition that says so.**
Everything in this design is arranged to keep that sentence true — which
mostly means keeping the layer quiet about everything it has not actually
studied.

The temptation will be coverage. A layer that answers ten questions will look
worse in a demo than one that answers a thousand, and the one that answers a
thousand will be wrong in a way nobody notices until it is inside somebody's
filing. `esg.ts` has held that line for a month by refusing to publish a
carbon figure. This is the same discipline applied to a harder surface.

One more thing that follows from the design rather than from taste. Because
the layer refuses rather than recommends, **it can be wrong safely in one
direction only**: a missing rule costs us a finding we could have made, and a
bad rule costs a customer a disclosure they should have filed. The first is a
lost sale. The second is the business. Every judgement call in the build
should be resolved in favour of saying less.
