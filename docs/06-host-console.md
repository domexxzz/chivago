# Host console

The web tool municipalities, NGOs and hotel partners use to review quest proof
and release points. Mounted on the API at `/console`.

Before this existed, `POST /internal/verify` worked but no human could reach it,
so the core loop could not close in production. That gap is now closed.

---

## Signing in

The seed issues one access key per host and prints it **once**:

```bash
pnpm --filter @chivago/api seed
```

```
[chivago] Host console access keys — shown ONCE, store them now:
          http://localhost:8787/console/login

          chv_6AWYW-C4WX6-VDQZA-HQPUI   Samui Municipality
          chv_EBSTJ-AURIB-50M0R-MSYS9   Samui Green Foundation (NGO)
          ...
```

Only a salted scrypt hash is stored. Re-seeding to update content leaves
existing keys alone — it must never lock a municipality out mid-pilot. To rotate
a lost key, clear `hosts.api_key_hash` for that host and re-run the seed.

The reviewer types their **name** alongside the key. That name is written to
every decision, so an award can be attributed to a person later, not just to an
organisation.

---

## What a reviewer sees

**Queue** — pending submissions, oldest first. Newest-first would quietly starve
the oldest item forever, and the design promises review within 24 hours.
Counters show pending, past-SLA, and how long the oldest has waited.

**Detail** — the photos, the volunteer, the weight, and three automatic checks.

**History** — every past decision with its reviewer and reason.

### The automatic checks

Presented as **signals, never verdicts**. The host is the party vouching for the
work; the software only shows its own reasoning.

| Check | What it does | Why it is shaped that way |
| --- | --- | --- |
| **Photo location** | EXIF coordinates vs the quest geofence | The single most useful thing here. A photo 11 km from the beach is not proof of a beach cleanup, and no reviewer should have to work that out from a map. |
| **Capture time** | Earliest photo vs the geofenced check-in | A photo timestamped before arrival came from somewhere else, or another day. |
| **Weight logged** | Plausibility of the claimed kilograms | Advisory. 250 kg for one volunteer is worth a question, not an automatic refusal. |

Three deliberate softenings:

- **A missing geotag is `unknown`, never `fail`.** Many phones strip EXIF.
  Penalising a volunteer for their privacy settings would be unfair, and a good
  way to lose volunteers.
- **Just outside the fence is `warn`, not `fail`.** GPS drifts near buildings
  and tree cover; 400 m against a 250 m fence is ordinary.
- **The worst photo decides.** One bad photo is not hidden by three good ones.

### Rejection needs a reason

The console refuses a rejection with neither a preset reason nor a note.
"Rejected" tells a volunteer nothing about how to succeed next time, and a quest
someone cannot complete is a volunteer who stops volunteering. The reason
reaches them in the app, and their check-in is preserved so they can resubmit
without walking back to the site.

---

## Languages

The console is **bilingual Thai / English**, with a switcher in the header.

**It shows one language, unlike the app, which shows both.** That is a
deliberate divergence. The app's audience is travellers split roughly half
international, half domestic, and a traveller should never have to choose. The
console's users are a known set of staff working through a queue — doubling
every label in a dense review table would halve the scanning speed of the people
doing the actual work.

Resolution order:

1. an explicit choice, persisted for a year in a `SameSite=Strict` cookie;
2. the browser's `Accept-Language`, parsed properly with q-values — a hotel
   partner in Singapore should not be forced into Thai;
3. **Thai** by default, because three of the four pilot hosts are Thai
   organisations and serving them is the point of the tool.

### The cross-language problem, and how it is solved

A Thai officer picks a reason in Thai. The volunteer may be a German tourist
reading English. If the console stored the sentence the reviewer saw, that
volunteer would be shown a language they cannot read.

So **rejection reasons are stored as KEYS, never as text**:

```
console (Thai)     DB                      volunteer's app
────────────────   ─────────────────────   ─────────────────────────────────
ภาพถ่ายไม่ได้ถ่าย  →  reason_key =         →  EN: Photos were not taken at
ในพื้นที่ภารกิจ        'not_at_site'             the quest site
                                              TH: ภาพถ่ายไม่ได้ถ่ายในพื้นที่ภารกิจ
```

The app renders both lines, like every other piece of its copy. The same key
renders in English for an English-speaking reviewer looking at the history page.

A reviewer's **free-text note cannot be translated**, so it passes through
verbatim and appears on both lines. The console says so, in the reviewer's own
language, right under the textarea — silently machine-translating a municipal
officer's words into something they cannot check would be worse than leaving
them alone.

### Dates

Thai renders with Thai month names but the **Gregorian** year. `th-TH` defaults
to the Buddhist Era, which would show 2026 as 2569; this console sits next to
ISO timestamps in the API, the ledger and the app, and a queue where one screen
says 2569 and the next says 2026 is a support ticket waiting to happen.

**Flag to the client:** if the municipality would rather see BE, it is a
one-token change in `console/i18n.ts`.

### Where the Thai copy lives

Two files, and the split is principled:

| File | What | Why there |
| --- | --- | --- |
| `apps/api/src/console/i18n.ts` | Console chrome — nav, buttons, check explanations | Never rendered into the app; keeping it out of `core` keeps admin copy out of the mobile bundle |
| `packages/core/src/strings.ts` | Rejection reasons | **Volunteer-facing.** Rendered into the app, so it belongs with the rest of the app copy |

Both are still design draft and need a native review pass.

### Check explanations

The review service returns a **key plus the numbers**, never a finished
sentence — the reviewer's language is not known there. An earlier version
formatted English prose in the service, so a Thai reviewer got Thai labels above
English explanations, and the explanation is the part they actually read.

```ts
{ key: 'geotag', status: 'fail', detailKey: 'geotagFail',
  params: { worst: 11370, radius: 250 } }
```

A test asserts both languages of every template use the **same placeholders** —
a translation that quietly drops `{worst}` would lose the number the reviewer is
deciding on.

---

## Security

**Host scoping is the rule this whole surface exists to enforce.** A host may
only see and decide submissions for quests it posted.

That is not a permissions nicety. The host's name goes on the ledger entry — the
municipality is the party vouching for the work — so cross-host approval breaks
the trust model the points economy rests on.

| Control | Where |
| --- | --- |
| Per-host keys, salted scrypt, constant-time compare | `host-auth.ts` |
| Session cookie: HttpOnly, SameSite=Strict, `Path=/console`, 8h | `console/routes.ts` |
| CSRF token on the decision form | `console/routes.ts` |
| Every queue/detail/history query scoped by `host_id` | `review-service.ts` |
| Photo access scoped **in the SQL**, not the route | `uploads.ts` |
| Uploads sniffed by magic bytes, not declared type | `uploads.ts` |
| Generated filenames — never client-supplied | `uploads.ts` |
| Every interpolation HTML-escaped by default | `console/html.ts` |

Two things worth calling out, because both were found by tests rather than by
reading:

1. **An empty-hash authentication bypass.** `Buffer.from('zz', 'hex')` silently
   returns an *empty* buffer rather than failing, and `timingSafeEqual(empty,
   empty)` is `true`. A corrupt `api_key_hash` would therefore have
   authenticated **every** key against that row. Both lengths are now pinned
   before any comparison. Regression-tested against eight malformed shapes.

2. **The escaping boundary.** The first `html` tag returned a plain string, so a
   nested template was escaped into visible tag soup — the photo gallery
   rendered as literal `<div class="photos">…` text on the page. It now returns
   a `Raw` type: markup composes, values are still escaped. A review note is
   free text typed by a person and shown back to other staff, which is exactly
   the shape of an injection.

The load-bearing test is
`A HOST CANNOT DECIDE ANOTHER HOST SUBMISSION, even with a valid session and CSRF`
— a legitimately signed-in reviewer reaching for work that is not theirs, which
is what CSRF and SameSite do *not* protect against.

---

## Why server-rendered HTML

No build step, no bundle, no separate deployment. The console is used by
municipal and NGO staff at office desks, sometimes on old machines and often on
the island's patchy connection. A 2 MB SPA to render a list of twelve
submissions would be the wrong trade.

It links the real Modernist stylesheet, so the console and the app are visibly
the same product.

---

## Photo upload

Proof photos previously existed only as phone-local `file://` URIs — meaningless
to anyone else. `POST /quests/:id/proof` now also accepts `multipart/form-data`:

```
photo=@a.jpg  photo=@b.jpg
meta=[{"lat":9.5357,"lng":100.0617,"takenAt":"2026-08-31T04:10:00Z"}, ...]
weightKg=4.2
```

EXIF is read **on the device**, where the original file still carries it, and
sent alongside — re-encoding on the phone routinely strips it.

The state machine runs before any bytes are written, so an invalid transition
cannot leave orphaned files on disk. Files are sharded by proof id; local disk
is right for the pilot, and `storagePath` is the only thing that changes when
this moves to S3/R2.

The JSON body is still accepted, for tests and for a client that uploaded out of
band.

---

## Still owed

- **Notification to the volunteer.** A decision is recorded and visible in the
  app, but nothing pushes it. Someone whose proof is approved eight hours later
  finds out only by reopening the app.
- **Chunked upload.** One multipart request with three photos is a poor fit for
  a mangrove site on one bar of signal. Per-photo upload with resume is the next
  step.
- **Key rotation from inside the console.** Today it is a database edit.
- **Bulk actions.** Fine at pilot volume; a municipality processing a hundred
  beach-cleanup submissions after a festival weekend will want them.
- **Native Thai review.** The Thai copy is design draft. Two files, listed above.
- **More languages.** The switcher and `Locale` type take a third language
  without restructuring, but nothing else is prepared for one.

---

## The statement page

`/console/statement` — this host's own verified activity for a period, drafted
free and issued on purpose. Issuing writes an immutable record with a public id
(`CG-2026-XXXXXX`) and a SHA-256 digest; `/verify/<id>` on the API shows the
same record to anyone, with no session. Scoped to the host's own quests: a
hotel that also sponsors an NGO's cleanup has the ESG page for that. See
`31-the-evidence-layer.md`.
