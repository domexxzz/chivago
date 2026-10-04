# 63 — The terms a dorm states

**Status: draft for owner review. Step 0 is not approved.**

Prepared for Yoshi on 4 October 2026 against `main b65bb7b`, after
[#92](https://github.com/domexxzz/chivago/pull/92) merged. Its merge commit
`a4d08e0` is an ancestor of this baseline. The task brief was written against
`dcd64c7` and the then-pending operator branch; those are historical references,
not the implementation baseline.

Students should see **สิ่งที่หอระบุ** about rent, deposits and utilities before
asking a question. ChivaGo passes that question to the operator and shows the
operator's answer. A sourced comparison may say **เกินเกณฑ์ในประกาศ**; it does
not certify a business or decide its legal liability. There is no booking,
deposit collection or payment through ChivaGo.

This document is the first deliverable. It proposes technical decisions, not
implemented tables, endpoints, screens or legal rules.

The labels distinguish the sources of a statement:

- **Stated:** a requirement in the supplied *dorm × ChivaGo* brief.
- **Observed:** checked in the repository or the explicitly identified source.
- **Inference / proposed decision:** the design author's recommendation, for review.
- **Unknown / pending:** an answer that the repository or research did not establish.

## 01 — Terms and listing model

**Stated:** follow section 05: append new terms, preserve old declarations,
allow missing declared values, derive comparisons on read, and decide between
`stay` and `dorm` before code.

**Observed:** `packages/core/src/inquiry.ts` defines `stay`, `tour`,
`experience` and `transfer`. The `listings.kind` CHECK in
`apps/api/src/migrations.ts` accepts the same four. `fromTHB` is a nullable
whole-baht "from" price with no monthly-rent meaning. Nothing currently
represents dorm rental terms.

**Proposed decision: keep `stay`.** A dorm remains a stay listing with an
optional terms record. It does not need another listing category, a new
listing-kind CHECK, or changes to tour licence requirements. Not every stay
is eligible for these rules; `stay` is not a legal classification.

Use a new `listing_terms` table. Each row is a complete declaration, not a
patch to the preceding row. Metadata is required; declared terms may be null.
The proposed core representation uses camelCase; SQLite uses snake_case.

| Proposed field | Representation and meaning |
|---|---|
| `id`, `listingId` | Required server-generated ID and listing foreign key. |
| `revision` | Required positive integer, unique together with `listingId`. |
| `statedAt`, `statedByHostId` | Required server UTC timestamp and account from the session; never supplied as authority by the form. |
| `status` | Required `stated` or `withdrawn`. Withdrawal is another row, not deletion or mutation. |
| `monthlyRentSatang` | Nullable nonnegative integer satang per month. Independent of `fromTHB`; never copy that price into rent. |
| `depositUnit`, `depositValue` | Nullable `baht` or `months`, with a nullable amount in hundredths of the named unit. เงินประกัน. |
| `advanceRentUnit`, `advanceRentValue` | The same representation for ค่าเช่าล่วงหน้า. |
| `electricityRateSatang` | Nullable nonnegative integer satang per kWh, as stated. |
| `waterMode`, `waterRateSatang`, `waterBasis` | Nullable `per_m3` or `flat`; nullable integer satang; nullable operator-stated calculation basis. Flat charges must display their stated period/basis, not an invented one. |
| `depositReturnDays`, `depositReturnDayKind` | Nullable nonnegative integer days and nullable `calendar` or `working`. คืนเงินประกัน. An unspecified day kind remains unknown. |

**Proposed validation:** accept blank declared values as null and explicit
zero as zero. Accept nonnegative safe integers in the normalized representation;
parse form decimals exactly with at most two fractional digits. Reject invalid
numbers, unsupported units, fractional day counts, and an amount with no unit.
An explicitly selected unit/mode with an unknown amount is allowed and cannot
be evaluated as a complete declaration. A water rate without a water mode is
invalid; a missing calculation basis remains visible as not stated.

Never round silently, use `Number('')` as zero, or add business/legal limits
before those limits are confirmed. A withdrawn row contains no declared values.
An all-null `stated` row is also valid: the operator deliberately states no
figures. Identifiers, ownership and revision metadata are not nullable.

**Unknown:** whether the consenting partner's actual tariff needs precision
beyond this proposed two-decimal input. Confirm this before Step 1; revise
the representation rather than rounding a legal comparison.

## 02 — Versions and inquiry history

**Observed:** SQLite migrations run at startup and guard existing columns.
`statements_are_append_only` uses `BEFORE UPDATE` and `RAISE(ABORT, ...)`.
The inquiry table has no terms reference. Its terminal-state trigger rejects
updates once an inquiry has left `sent`. Traveller account deletion cascades
to that traveller's inquiries.

**Proposed decision:** add `listing_terms_are_append_only`, blocking every
UPDATE on the new table using that existing trigger pattern. Add an index
and UNIQUE constraint on `(listing_id, revision)`. Current terms are the
highest committed revision, not the greatest timestamp; equal timestamps
must not make the current declaration ambiguous.

Saving carries `expectedRevision` (null for the first declaration). In one
transaction, check ownership, compare that revision with the current row,
and insert the next complete revision. A stale save returns a conflict and
inserts nothing. Two tabs cannot silently overwrite each other's declarations.
Publishing withdrawal follows the same process. Do not update `listings`
with a cached terms result or copy a computed verdict into the database.

Add nullable `inquiries.terms_id`, referencing `listing_terms.id`. The new
student client sends the version displayed in the inquiry sheet as
`termsVersionId`, including explicit null when no terms were displayed.
Check that it still matches the current version and bind it to the inquiry
in the same transaction. A mismatch returns a conflict, preserves the typed
question in the sheet, reloads terms, and requires another deliberate send.

Compatibility matters: an older client that omits `termsVersionId` can still
send an inquiry, but its `terms_id` remains null. Do not claim it saw a
version selected by the server. Existing inquiries also remain null: no
backfill can establish what their authors saw. An explicit null from the
new client conflicts if a declaration appeared after the sheet opened.

The traveller's own inquiry shows its bound historical declaration, with
the version/date and operator attribution. Later edits or withdrawal do
not replace it. Null means **no recorded terms version**, not today's terms.
The operator's own inquiry view uses the same reference. No public API
enumerates which students asked about a dorm.

**Deletion decision:** there is no ordinary terms DELETE endpoint. Foreign
keys restrict removing a referenced terms version; pausing a listing and
withdrawing its current declaration preserve history. Do not add a blanket
DELETE trigger that prevents an approved erasure process. Business terms
contain no student identifiers; erasing a traveller still deletes their
inquiries and does not become a way to delete other people's business terms.

**Unknown:** business-data retention and exceptional removal need owner/legal
approval before a real pilot. Append-only ordinary edits are not a claim that
every record may be kept forever.

## 03 — Legal applicability and sources

**Stated:** the brief's numeric examples came from news, not a confirmed
reading of the official text. No example becomes a rule constant, a clause
number, or a demo finding merely by appearing in the brief.

| Source | What was established; what remains pending |
|---|---|
| [สคบ. legal index](https://www.ocpb.go.th/news_view.php?nid=11970) | Official index linking the 2568 notification and standard-contract material. A discovery source, not legal sign-off. |
| [Official-hosted notification PDF](https://www.ocpb.go.th/article_attach/articlefile_2025070314222862724.pdf) | Downloaded from the index on 4 October 2026. Rendered first two pages inspected: Gazette volume 142, special part 211 ง, publication 6 June 2568, printed pages 80–81. The file has 21 PDF pages including further material. Full clause/annex review remains pending. |
| [ราชกิจจานุเบกษา](https://ratchakitcha.soc.go.th/) | Obtain the matching Gazette-hosted publication and check amendments. Automated access was refused; a direct Gazette-hosted document URL has not been independently retrieved. |
| [สคบ. explanation](https://www.ocpb.go.th/news_view.php?nid=17828) | Official research lead on coverage. It is not a substitute for the notification or classification of the pilot partner. |
| [Thai PBS Verify](https://www.thaipbs.or.th/verify/content/13497) and [สภาองค์กรของผู้บริโภค](https://www.tcc.or.th/05112568_rental-place_news) | Secondary sources named in the brief. Use to locate issues to verify, not to establish executable thresholds. |

**Observed source fact:** the first two rendered pages distinguish buildings
covered by the notification from หอพัก under dormitory law and hotels under
hotel law. This makes the everyday word "หอพัก" insufficient to establish
applicability. It does not settle whether the first partner is covered.

**Pending legal register:** every entry below needs the full official clause,
applicable annex/contract form, effective-date basis, exclusions, and named
lawyer confirmation. Thresholds and operative clause references are
intentionally not supplied in this draft.

| Rule / question | What the lawyer must confirm before implementation |
|---|---|
| Coverage | Business definition, unit-count and aggregation rules, registered หอพัก/hotel exclusions, short/long rental distinctions, and classification of the consenting partner. |
| เงินประกัน + ค่าเช่าล่วงหน้า | Limit, calculation basis, conditions and whether the same comparison applies to the pilot's rental category. |
| ค่าไฟ | What provider charge is compared; applicable tariff class and period; Ft, VAT, fixed/shared charges; whether a conservative published upper bound is valid at all. |
| ค่าน้ำ | Provider, unit, tariff period, required calculation method, and what may be said about เหมาจ่าย without inventing a per-unit equivalent. |
| คืนเงินประกัน | Deadline, calendar/working days, triggering event, return conditions and permitted deductions. |
| Rule changes and history | Amendments, transitional provisions, and which date controls comparisons against earlier declarations. An inquiry date is not a signed-contract date. |

The owner obtains written legal confirmation and records its date/reference
in this register. Yoshi turns that confirmed interpretation into tests and
code; Yoshi does not choose the legal figures. Check utility inputs against
the relevant official MEA/PEA and MWA/PWA tariff publications once the
partner's provider and comparison basis are known. Do not assume a provider
from the campus name or infer a tariff from a headline.

## 04 — Derived rule evaluation

**Observed:** `inquiryState` derives expiry from stored facts and a supplied
clock. `indicator.ts` carries sourced reasons and separates missing facts
from unexamined coverage; it does not issue a general approval. Reuse that
discipline, not its ESG-specific rule catalog.

**Proposed interface:** a pure `evaluateDormTerms(terms, context)` in core.
`context` explicitly supplies the evaluation instant, applicable approved
rule set, coverage (`covered`, `not_covered`, `unknown`), and any sourced
tariff/comparison inputs. It never reads the database, network or ambient
clock. Server reads supply context and return derived findings. The demo
uses the same function with explicitly fictional declarations.

Each approved rule carries its identifier, official source URL, exact clause,
effective interval, review date/reference, required inputs and bilingual
reason. No rule is executable while its source or legal approval is pending.
Coverage comes from the lawyer-reviewed pilot facts, not `kind === 'stay'`
or an operator checking a box marked "legal".

| Proposed result | Meaning and display |
|---|---|
| `exceeds` | Approved rule and required facts establish an exceedance. Explain the operator's stated value, comparison basis and source using เกินเกณฑ์ในประกาศ. |
| `no_exceedance_found` | This particular complete comparison found none. Explicitly not certification or a statement that every term was checked. |
| `unknown` | Missing terms, coverage, tariff, date basis or other required input. Name the missing information. Null never supplies a zero. |
| `not_applicable` | Confirmed context excludes this particular rule. Say which notification/rule is not applied; do not imply no other law applies. |
| `unexamined` | No approved rule for this comparison, including pending legal review. A coverage gap, not a pass. |

Normalize mixed months/baht only with a usable stated monthly rent and a
lawyer-approved formula. Otherwise return unknown. Flat-rate water is shown
as เหมาจ่าย with its stated basis; no invented conversion or pass verdict.
Never assume a universal utility ceiling. Missing, expired or out-of-period
tariff context cannot establish an exceedance.

Compare historical declarations again on read, but state the comparison
date and rule version. Until the lawyer confirms the relevant temporal
basis, historical findings are unknown. Do not quietly apply new rules
retroactively or describe an inquiry as an executed rental agreement.
Findings are never stored in `listing_terms`, `inquiries` or a verdict table.

## 05 — API and operator console

**Observed wiring:** traveller routes live in `apps/api/src/server.ts`, not
a separate inquiry-routes module. The API returns its existing `ok/data`
envelope, and listings remain behind device-key authentication. Console
routes use session identity and CSRF, and `OPERATOR_PATHS` is an allowlist.
Ownership checks already live in `inquiry-service.ts`.

The following are proposed additions, not existing endpoints:

| Surface | Proposed contract |
|---|---|
| `GET /listings` | Add optional `terms` to `ListingCard`: null when no declaration exists; otherwise version metadata, declared values and derived findings. Non-pilot listings keep their existing behavior. |
| `POST /listings/:id/inquiries` | Add optional `termsVersionId` as described in section 02. Preserve existing input validation and `INVALID_INQUIRY` errors; add HTTP 409 `TERMS_CHANGED` only for version conflicts. |
| `GET /inquiries` and inquiry send response | Add optional `terms` to `InquiryView`, resolved from that inquiry's `terms_id`, not the latest row. `TravellerInquiry` inherits it. No other traveller gains access. |
| `POST /console/listings/:id/terms` | CSRF-protected complete declaration save with `expectedRevision`; append only. Success redirects 303 to `/console/inquiries`. Invalid input renders that page with errors (400); stale revision renders current values with a conflict (409); non-owned/missing listing returns 404. |
| The same console save | An explicit `withdrawn` status appends withdrawal. It is not a pause/resume action and does not erase earlier terms. |

Allowlist only the exact new terms path, not every listing subpath. Derive
host identity from the session, check listing ownership and `stay` kind in
the service, and permit terms publication only for the owner-enrolled pilot
accounts. Do not require every stay operator to be an `operator` account:
`docs/62` intentionally allows existing hotel/partner accounts to list stays.
Those accounts still need enrollment and ownership to publish dorm terms.

Put the form below the operator's own stay listing in the existing Inquiries
page. Show blanks as not stated, explicit units, source limitations and
revision/date. Never add a checkout, reservation confirmation or dorm-review
form. Until approval gates close, this is a design, not a live publishing form.

Migrations must upgrade an existing database idempotently, create the new
table/trigger/index, and add the nullable foreign key without updating old
terminal inquiries. Existing `fromTHB`, quote semantics, inquiry expiry and
answer/notification transaction stay intact.

Shared wire types belong in core beside the existing inquiry contracts.
Update `apps/mobile/src/api/client.ts`, demo request handling and relevant
contract tests when implementation begins. Optional added response fields
and the optional request field preserve old clients; check Dart/Swift decode
behavior rather than assuming it, and run the existing SDK contract suites
in CI. This PR changes none of those contracts.

## 06 — Student card and language

**Observed:** `AskScreen.tsx` already renders listing rows, an inquiry sheet,
and the traveller's own questions. It is classified in `EVIDENCE_LAYER` in
`apps/mobile/src/components/game-surface.test.ts`. `example` can now come
from `hosts.example` on the real API as well as the in-memory demo. Example
operators receive no response-time trust signal.

**Proposed decision:** extend that screen; do not create a separate dorm map
or screen. Show the latest terms on its listing and in the inquiry sheet.
Show the recorded historical version on the traveller's own question.
Source links must have their own accessible action, not accidentally send
an inquiry through the enclosing listing press target. Use plain evidence
styling, readable labels and text reasons; no verification badge or game surface.

The card/form sketch defines content order, not invented financial values:

```text
Operator name / ชื่อผู้ประกอบการ
[Example · not a real business / ตัวอย่าง · ไม่ใช่ธุรกิจจริง, if marked]
Terms stated by the operator / สิ่งที่หอระบุ
Rent per month / ค่าเช่าต่อเดือน: [stated amount or หอไม่ได้ระบุ]
Deposit / เงินประกัน: [amount and unit or หอไม่ได้ระบุ]
Advance rent / ค่าเช่าล่วงหน้า: [amount and unit or หอไม่ได้ระบุ]
Electricity / ค่าไฟ: [amount and unit or หอไม่ได้ระบุ]
Water / ค่าน้ำ: [mode, amount and calculation basis or หอไม่ได้ระบุ]
Deposit return / คืนเงินประกัน: [days and day kind or หอไม่ได้ระบุ]
Declaration revision/date; historical/current label
Comparison reason or named missing information; comparison date; source link
ChivaGo has not verified these declarations / ChivaGo ยังไม่ได้ตรวจสอบข้อมูลที่หอระบุ
Ask a question / ส่งคำถาม
Existing not-a-booking notice
```

**Proposed bilingual copy:** not stated = "The operator has not stated this"
/ "หอไม่ได้ระบุ"; unrecorded inquiry version = "No terms version was recorded
for this question" / "ไม่มีการบันทึกเวอร์ชันเงื่อนไขสำหรับคำถามนี้"; pending
legal comparison = "The applicable rules have not been confirmed"
/ "ยังไม่ได้ยืนยันเกณฑ์ที่ใช้กับหอนี้". Withdrawn current terms say the operator
no longer states current terms; never substitute an older version as current.

Owner/legal review still approves actual warning wording once rules exist.
Warnings must never say "ผิดกฎหมาย". Absence of warnings is not a green badge.
Every place an example operator appears, including historical terms, keeps
"ตัวอย่าง · ไม่ใช่ธุรกิจจริง". Do not generate answers to new demo inquiries:
existing demo replies are explicitly seeded example history.

## 07 — Boundaries and pilot

**Stated hard lines, at every step and PR:**

1. No feature identifies who lives at which dorm. No resident directory,
   tenancy status, room assignment or dorm link on a student's profile.
2. No booking, deposit collection or money through ChivaGo.
3. No dorm reviews, named-business ratings or review publishing flow.
4. No real dorm seed data without that business's agreement. Fictional
   demos must carry the example label everywhere the business appears.

**Near a hard line:** an inquiry contains a student ID and a listing ID,
but it is a private question, not evidence of residence. Terms history must
not turn that join into occupancy analytics, a public participant list or
new access to student contact/location information. Do not collect room
numbers, move-in records, utility bills identifying tenants, or residency
evidence to make a comparison easier. Public business-location text and
private inquiry access remain distinct.

**Observed:** listing locations are `whereLabel` text; listings have no
structured campus field and `/listings` is not area-filtered. `areas.ts` now
contains `ku-bangkhen` as well as `ku-sriracha` and `rmutt`; that does not
expand the brief's owner choice automatically.

**Proposed pilot:** manually enroll only consenting businesses around the
one owner-selected university: มก. ศรีราชา (`ku-sriracha`) or มทร. ธัญบุรี
(`rmutt`). Keep the existing global inquiry feed. A server-side enrollment
configuration names the permitted listing/account IDs and lawyer-reviewed
comparison context; it contains no student IDs, secrets or verdict cache.
Do not infer a campus from `whereLabel`, geolocation or province, and do not
build campus filtering as an extra feature in this first deliverable.

Use fictional operator/listing fixtures for design and acceptance examples.
The owner handles consent and real account creation using `docs/62` and
`add-host.ts --type operator`; keys are secrets and must not appear in docs,
fixtures, logs or PRs. No real dorm has been selected or contacted by this work.

## 08 — Acceptance, sequence and decisions

### Decision log and owner handoff

The following is the review request; it has not been sent through an external
channel. The owner must record the answers and acceptance here or in the PR.

| Decision | Responsible party | Status / blocks |
|---|---|---|
| First university: มก. ศรีราชา or มทร. ธัญบุรี | Project owner | Pending. Blocks Step 0 completion and real pilot enrollment. |
| First real dorm and documented agreement to participate | Project owner | Pending. Blocks Step 0 completion and real-business onboarding/fixtures. Fictional design examples can proceed. |
| Lawyer confirms applicable regime, pilot coverage, clauses, thresholds, tariff method and time basis | Owner obtains lawyer's written answer | Pending. Blocks Step 0 completion and rule implementation in Step 1. Source discovery is not approval. |
| Retention/exceptional removal and partner precision needs | Owner/legal for retention; Yoshi checks partner inputs | Pending before real pilot and, for precision, before Step 1 types are fixed. |
| `stay`, nullable/scaled values, version references, concurrency and interface design above | Yoshi proposes; owner reviews the doc | Proposed, not accepted. Blocks final technical sign-off and the affected Steps 1–3. |
| Acceptance of docs/63 | Project owner | Pending. Step 0 remains incomplete. |
| #92 merged and included in latest main | Repository/GitHub evidence | Confirmed. No longer a branching blocker. |

### Work sequence

| Step | Deliverable | Completion gate |
|---|---|---|
| 0 | This docs/63 draft, source register, owner questions and acceptance checklist. | Owner accepts the design and resolves section 08 of the brief. Drafting/review may proceed while answers are pending. |
| 1 | Core declaration types, validators, approved pure evaluator and tests. | After Step 0/legal confirmation. Every implemented rule has confirmed clause references and meaningful tests; null is not zero; no warning says ผิดกฎหมาย. |
| 2 | Migration, versioned service, API wiring, operator form and allowlist tests. | Step 1 complete; edits insert new rows; ownership, CSRF and history hold; operator restrictions still pass. |
| 3 | Student terms/history card, bilingual copy and clearly labeled demo. | Step 2 complete; Thai/English at 375px; actual demo walkthrough recorded. |

Today, gather sources, read the code, complete this draft and request review.
Do not implement rules, migrations, operator forms or mobile cards while
Step 0's approvals are pending. Each later step is a separate reviewable
change on a branch from then-current main, with a PR and CI; do not mix a
docs-only approval request with runtime implementation.

### Tests to add when implementation begins

- **Core:** explicit zero versus null; incomplete fields and unit mismatches;
  decimal parsing/precision; valid/invalid day counts; confirmed boundaries
  below/at/above the approved limit; mixed-unit inputs with missing/zero rent;
  flat water without a guessed conversion; unknown/excluded coverage;
  pending/stale tariff or rule context; temporal applicability; changed rule
  sets on unchanged declarations; bilingual, attributed reasons and sources.
- **Storage/service:** fresh and existing DB migrations, repeated migration,
  UPDATE rejection, new revision and withdrawal, same-time ordering, stale
  save and simultaneous writers, no computed verdict persistence, inquiry
  version association in a transaction, unchanged history after edits,
  legacy inquiry null references, and traveller deletion preserving the
  existing inquiry cascade without removing business terms.
- **API/console:** cross-account reads/writes and forged identity/version
  rejection; CSRF; exact operator allowlist including negative paths; HTTP
  409 with no inquiry/notification on a version conflict; legacy sends;
  device-key protection; example flag and null response-time preservation;
  unchanged answer/decline/expiry/notification behavior.
- **Mobile/demo:** current versus inquiry-time terms; missing values and
  withdrawn terms; warnings/unknowns without a pass badge; source-link
  behavior; terms-changed reload retaining the draft question; labels at
  every example appearance; no automated operator reply; no booking or
  resident/review controls. Cover the existing screen test harness and SDK
  contract decode compatibility when wire shapes change.

Relevant existing tests are `packages/core/src/inquiry.test.ts`,
`packages/core/src/indicator.test.ts`, `apps/api/src/migrations.test.ts`,
`apps/api/src/inquiry-service.test.ts`, `apps/api/src/inquiry-routes.test.ts`,
`apps/api/src/console/routes.test.ts`, and
`apps/mobile/test/ask-screen.test.ts`. New rule tests will accompany a new
core module, not be asserted by a documentation-text test.

### Actual app checks for Steps 2–3

With fictional fixtures and two operator accounts: sign in, save declared
terms, open the student sheet and send an inquiry, edit the terms, then
confirm the old question still shows its original revision. Repeat with
withdrawal, blanks, explicit zero, a stale save and a terms change while the
sheet is open. Confirm the other operator cannot see or edit those terms
or questions, and cannot open SOS/review pages even through direct URLs.

Walk Thai and English at 375px: long reasons wrap, no horizontal overflow,
source links work independently of the inquiry action, errors stay in the
sheet, units and day kinds are visible, and both example and not-a-booking
labels remain readable. Confirm a real unconfigured feed remains empty of
invented dorms. Check that changing the active campus does not pretend the
existing global listings feed is filtered. Record screenshots and results
in the implementation PR; green component tests alone do not prove layout.

**This documentation change has no new app behavior to check.** A browser
walkthrough of the future terms UI cannot be claimed before it is built.

### Checks before every PR

**Observed:** `.github/workflows/ci.yml` uses Node 24 and pnpm 10.33.0.
Its TypeScript job runs package suites sequentially. The current packages
have no separate `lint` script; typecheck, tests, Thai review and diff checks
are the available checks, not a claimed ESLint run.

Run the brief's checks without auto-fixing files:

```text
In each of packages/core, packages/tokens, apps/api, apps/mobile:
  npm run typecheck
  npm test
At the repository root:
  npm run test:scripts
  node scripts/thai-review.mjs
  git diff --check
```

Root `pnpm typecheck`, `pnpm test` and `pnpm test:scripts` are the CI
equivalents. Dart analysis/tests and Swift build/tests also run in CI;
local availability is not a claim those jobs passed. Thai review is advisory
in current CI and does not replace reading the Thai, including joined strings.
No new screen is proposed; if that changes, explicitly classify it in
`game-surface.test.ts` before shipping. Commit only this document for Step 0,
open its PR and record CI results. Owner approval is separate from green CI.

### Reading order for the next implementer

1. `docs/61-an-inquiry-is-not-a-booking.md` →
   `docs/62-the-first-operator.md` → `docs/60-the-indicator-that-refuses.md`.
2. `packages/core/src/inquiry.ts` → `packages/core/src/indicator.ts`:
   wire types, null semantics, expiry and sourced unknown/refusal patterns.
3. `apps/api/src/migrations.ts` → `apps/api/src/inquiry-service.ts`:
   constraints, immutable evidence, ownership, transactions and history.
4. `apps/api/src/server.ts` → `apps/api/src/console/routes.ts` →
   `apps/api/src/console/inquiries.ts`: device-key routes, exact operator
   allowlist, CSRF and the form insertion point.
5. `apps/mobile/src/api/client.ts` →
   `apps/mobile/src/screens/AskScreen.tsx` →
   `apps/mobile/src/demo/inquiries.ts`: requests, errors and example history.
6. `packages/core/src/areas.ts` → `apps/api/src/add-host.ts`:
   campus identifiers and deliberate example/operator onboarding.
7. The named tests above →
   `apps/mobile/src/components/game-surface.test.ts` →
   `.github/workflows/ci.yml` and package scripts: regression and review gates.

### Next three actions

1. Owner answers the pilot university, consenting first dorm and legal
   confirmation request above; Yoshi records the responses and sources.
2. Review this document's proposed technical decisions against the actual
   partner inputs and complete the legal/retention register. Change this
   draft rather than filling unknowns with plausible defaults.
3. Owner accepts docs/63. Only then begin Step 1, using confirmed rules and
   clause-referenced tests; proceed to Steps 2 and 3 in order.
