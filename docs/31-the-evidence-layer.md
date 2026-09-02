# 31 — The evidence layer

Recommendation 04 of the competitive read: stop selling "a travel app" and
sell **the evidence layer hotels do not have**. This document is what that
sentence means in code, what it refuses to mean, and what is still owed.

## The claim, and why it is defensible

The numbers a hotel reports today are its own. HCMI, the Hotel Carbon
Measurement Initiative, is a methodology the hotel applies to its own utility
bills; CHSB, Cornell's benchmarking index, is built from what hotels submit;
Thailand's CF-Hotels (ททท.) is a free carbon calculator the hotel fills in
against ISO 14064-1. Every one of them is a back-office figure with no surface
a guest ever touches, and none of them can show a third party that a specific
thing happened on a specific day and that somebody stood behind it. (The reach
figures — HCMI 30,000+ properties, CHSB 31,500+, CF-Hotels 900+ registered and
216 certified — are from the competitive read and were not re-verified here.)

That last property is the one thing this ledger has always held. Green Points
are only ever released when a **named host** approves a geotagged submission
inside a fence, and since `docs/30` that fence has a second signal under it.
So the product is not a competitor to CF-Hotels — the competitive read is
explicit: *do not touch hotel carbon measurement* — it is the layer those
reports cannot produce, attached to them as evidence rather than replacing a
number in them.

The pitch changed accordingly, in `README.md` and in the deck audit
(`docs/10`). The traveller-facing app is unchanged: for the guest it is still
เที่ยวอย่างสุขภาพดี. What changed is who the second customer is and what they
are handed.

## What a hotel is handed: a statement

A **statement of verified activity** (`packages/core/src/statement.ts`,
`apps/api/src/statement-service.ts`) is what a host issues for a period. Three
properties make it evidence rather than one more self-reported figure.

**Issued, not computed on demand.** `/console/statement` drafts the period for
free; pressing *Issue* writes the body down with an id and a digest, and from
then on it is the record. The `statements` table carries a `BEFORE UPDATE`
trigger that aborts, so the only way to change what a hotel filed is to file
another statement with another id. A row replaced behind the trigger is caught
on read: the digest is recomputed from the stored body every time and a
mismatch is refused (`StatementTampered`), never served.

**Checkable by anyone.** Every statement has a public id — `CG-2026-XXXXXX`,
Crockford base32, no I, L, O or U, so it survives being read off paper over
the phone — and a SHA-256 digest of its canonical JSON. `GET /verify/<id>` is
the record laid out for a stranger, no session, no account; `GET
/statements/<id>` is the canonical JSON. An auditor holding the hotel's report
compares the id and the digest. Neither route needs a device key: they sit
next to the public live-location page in `server.ts`, exempt from the
traveller middleware by design.

**Nobody is in it.** Lines are *per activity, per day, with a count*.
Participants are counted distinctly across the statement and never named. A
guest's history across places is exactly what this platform must not hand a
business — the PDPA question in recommendation 05 — and the statement is
built so that it cannot: `StatementActivity` carries ids on the way in,
`StatementLine` has no field for them on the way out, and a core test greps
the canonical text for a traveller id.

It also carries what a self-report never does: **how many proofs the host
refused** in the period. A host that never says no is not checking.

### The four refusals

The ESG report ships three refusals (`docs/29` and before: no carbon figure,
no independent assurance, no additionality). A statement ships those three
and a fourth, worded for the reader it is for:

> A property carbon figure. This statement measures no building and does not
> replace HCMI, CHSB or CF-Hotels. Attach it to such a report as activity
> evidence; it changes no number in them.

They render on the public page with the same weight as the figures, above the
digest. `statement.test.ts` walks every key of a built statement at every
depth and fails on `co2`, `carbon`, `emissions`, `offset`, `credits` or `sroi`.

### The boundary

*This host's own quests, approved by this host, between the dates shown.* A
hotel that also sponsors an NGO's cleanup has the ESG page for that. Anything
a traveller recorded without a host (`docs/29`) is excluded by construction —
self-visits never join the ledger, so they cannot reach a statement. Days are
UTC, the same convention as the ESG report, so the two never disagree about
whether 31 December is in the year.

## What the guest sees

The competitive read asked for the layer to be *visible to the guest*, and it
is, in one place: a verified quest tells the traveller whose record it is on.
`GET /me/statements` returns the statements that count this traveller's work
— membership read from the statement's own lines, so work verified after a
statement was issued is inside the dates and correctly *not* in it — and
`QuestDetail` shows *On record: Samui Municipality filed this in statement
CG-2026-…, covering … to …*, with a link to the same public page an auditor
would open. In the static demo the link is left off rather than left dead,
because there is no API behind the demo to open it on.

## Verified live

Against the running API, after `demo:reset` issued the municipality's
statement for the calendar year:

- `GET /statements/CG-2026-S1EB7V` answered without a key. The digest was
  recomputed **independently in Python** (`json.dumps(body, sort_keys=True,
  separators=(',', ':'), ensure_ascii=False)` → SHA-256) and matched the one
  served: `9cb9fb7c…b05ef9`.
- `GET /verify/CG-2026-S1EB7V` answered 200 with the full digest, the hotel
  refusal, one line (`2026-09-02 · Beach Cleanup · 1 · 3.2 kg`), and no
  traveller id anywhere in the page.
- `GET /verify/CG-2026-000000` answered 404 with the re-reading hint;
  `GET /statements/CG-2026-000000` answered `NO_STATEMENT`.
- `GET /me/statements` as the demo traveller returned the statement with
  `quests: [q1]`; the captured fixture and the exported bundle both carry it.
- In a real Chrome, signed in as Ocean Lab (the hotel host, key rotated by
  the documented path): the draft for the calendar year read *verified no
  activity* — correct, the demo verifies nothing of Ocean Lab's — and
  pressing *Issue* wrote `CG-2026-QZBWB0`, redirected to the listed row with
  its digest and public link, and the public page opened for it. A
  statement of nothing is still a statement.
- The console flow — draft scoped to the signed-in host, issue via CSRF-guarded
  POST, redirect to the listed row, the trigger refusing an `UPDATE`, a stale
  CSRF and an out-of-order period each writing nothing — is held by
  `console/routes.test.ts` and `hardening.test.ts` at route level.
- The static demo, opened at phone width: Missions → Beach Cleanup shows the
  green field and, under it, *On record: Samui Municipality filed this in
  statement CG-2026-S1EB7V, covering 2026-01-01 to 2026-12-31.*

One thing the live run caught that was not this feature's: the success
panel said **4.2 kg** to everyone — a constant in the screen — while the
statement beside it said 3.2, the weight actually on the approved proof.
`QuestProgress` now carries `weightKg` from the approved proof and the panel
prints that figure or no figure at all.

## Still owed

- **The digest proves the paper matches our record, not that our record is
  true.** What the record rests on is a named reviewer approving geotagged
  proof, and the page says so. An independent signature (a key ChivaGo does
  not hold) would let a statement be checked without trusting ChivaGo's
  database at all; that is the next honest step, and it is not built.
- **No PDF, no CSV.** A hotel copies the id and the digest by hand. Fine for
  a pilot; not for a chain.
- **Which schemes accept it, and where.** Nothing here has been checked
  against what CF-Hotels, TAT STAR or a GSTC-recognised standard will actually
  take as supporting evidence. "Attach it to the report you already file" is a
  claim about our artefact, not about their forms.
- **One host per statement.** A hotel cannot yet state activity it funded but
  did not run; that remains the ESG page's job, and the two are not yet
  cross-referenced.
- **Thai copy** on the statement pages has not been read by a native speaker,
  like the rest of the console.
