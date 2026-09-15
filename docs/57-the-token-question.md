# 57 — The token question, and the seven a lawyer has to answer

On 14 September the owner asked whether the points a traveller earns from
verified ESG activity could become a blockchain token, exchangeable for goods
across a network of partner businesses.

The short answer is that Thai law permits it through exactly one route, that
route is narrower than it first appears, and the two features that would make
a token more useful than the coupon system already in `wallet-service.ts` are
the same two features that would destroy the thing this product sells.

Both halves of that — the legal half and the design half — arrived
independently and agreed. That agreement is the reason this document exists.

## The route that is open

Thailand splits ready-to-use utility tokens into two groups. **Group 1 needs
no SEC approval, no ICO portal, no licence and no filing**, and the published
examples of Group 1 name loyalty points directly, alongside coupons, gift
vouchers, event tickets and carbon credits. A token that buys a thing is not
a problem for this route; it is the reason the route exists.

Two conditions apply to every ready-to-use utility token: it must not have
the character of a **means of payment** as the Bank of Thailand defines one,
and the issuer must not accept it back for staking-for-return — verification,
voting and ecosystem participation excepted.

## What the route costs

| forbidden | why it matters here |
| --- | --- |
| listing on a licensed exchange | flat prohibition since June 2021, restated in 2024. Green Points would have no market price, ever. |
| selling points for baht | becomes **e-money** under the Payment Systems Act — a different regulator, a different licence. |
| spending them like money | the means-of-payment condition, enforced by both regulators. |
| bolting a return onto the perk | lands in the full ICO-portal regime. |
| holding keys for users, if Group 1 is lost | the custodial threshold is THB 50m paid-up capital. |

One door did open, and it is worth knowing we cannot walk through it: in
September 2025 the SEC began admitting **tokenised carbon credits and
renewable energy certificates** to licensed exchanges. Loyalty points got no
equivalent. Our points come from environmental evidence but they are not
carbon credits, and `esg.ts` refuses to pretend otherwise — see below.

## The part that matters more than the law

`party.ts` opens with the rule the whole file exists to enforce: *a party
never shares points… the moment it can arrive by standing next to somebody
who earned it, it means nothing, and every number downstream — the sponsor's
report, the host standing, the impact page — is quietly inflated by the size
of people's friend groups.*

Transferability is precisely what that rule forbids. Follow it through the
rest of the repository and the damage is not confined to one file:

- `standing.ts` ranks on `greenVerified` alone, and the types have nowhere to
  put a self-reported balance. A transferable token makes the ranking
  something you can receive rather than earn.
- `esg.ts` counts `participants` as distinct opaque ids so that "we reached
  10,000 people" cannot be assembled from 2,000 people doing five things.
  Points that move between people break the trace the report is built on.
- `low-carbon.ts` pays Trip Points for a walk the *phone* measured, with no
  human verifying it. Make that currency a token and it becomes a token
  mintable by spoofing GPS. This is the worst of the four and it was not
  obvious until the boundary question was asked properly.

Medals and level are untouched. `medals.ts` comes from geofenced check-ins
and `progression.ts` from lifetime EXP; neither is exchangeable, so neither
falls under any of the definitions above.

**The legal constraint and the design constraint point the same way.** Free
peer-to-peer transfer and general merchant spending are what would trigger
the SEC and the Bank of Thailand, and they are also what would make the ESG
report unusable. There is no version of this where we trade one for the other.

## The one blockchain use worth having

`statement.ts` already produces a canonical JSON body and a digest anyone can
recompute, with a public id and a verify URL that survives a file being
forwarded three times. Anchoring that digest on a public chain buys a
timestamp **we ourselves cannot backdate** — which is the only property a
ledger of our own cannot give a sceptical auditor.

It needs no token. It touches no digital-asset law. And it strengthens the
claim the product already makes rather than adding a new one.

Personal data must stay off-chain: PDPA s.33 requires erasure to reach copies
and backups, to be irreversible, and to be paid for by the controller. Only
the commitment goes on the chain.

## A second finding, from the same week

The research that ran alongside this one asked whether a beach cleanup can be
converted to tCO2e. It cannot, and the evidence is unusually clean:

- the GHG Protocol Scope 3 Standard says avoided emissions from recycling
  **must not** be included in or deducted from the inventory;
- no CDM, T-VER or Verra methodology covers litter collection — T-VER's
  plastic methodology credits recycled pellets displacing virgin resin, with
  chemical equivalence proved and transport netted off, which sun-degraded
  beach plastic cannot meet;
- Verra, which has thought hardest about monetising plastic collection,
  denominates its credits in **tonnes of plastic, not carbon**.

`esg.ts` has refused to publish a carbon figure since it was written, on the
grounds that *inventing one is how a cleanup becomes a carbon credit, and it
is the single most common lie in this field.* That refusal is now sourced.

One correction the same research forced: **kilograms collected cannot go in
GRI 306-3.** GRI defines waste as what *the holder* discards, and 306-3
covers waste from an organisation's own activities. Beach litter was
discarded by somebody else. The honest home is GRI 3-3-e-ii, as a
supplementary indicator — or GRI 306 in the role of a waste *manager*, said
explicitly and kept separate from our own operational waste.

## What could not be verified

`sec.or.th` and `publish.sec.or.th` refuse automated access; the Thai
material was read through a text proxy, and image-based tables on those pages
did not come through. Consequently:

- the **numbers of the seven August 2024 notifications** are unknown, and no
  statutory wording anywhere here is verbatim;
- the **final notification** implementing the ISSB requirements has not been
  seen — only the principles announced on 28 November 2025;
- **no Thai company** was found that issued its own loyalty token and claimed
  the Group 1 exemption publicly. The one operator at scale converted points
  into an already-listed coin through a non-licensed affiliate, which is the
  structure the 2024 separate-entity rule was written to discipline.

Absence of a precedent is not a prohibition. It does mean there is no
practice to copy, and that the questions below cannot be answered by reading.

## The seven questions

Ordered so that the first three decide whether any code gets written.

1. Is the means-of-payment condition a **classification test** applied at
   issue, or a **continuing obligation** with a penalty if users later behave
   that way? The two imply very different detection systems.
2. How much transferability can a Group 1 token carry before it is
   re-characterised? Would a capped transfer inside a travelling party
   survive?
3. Do points that are **earned and never sold** fall outside the e-money
   definition — and does sponsor money reaching the platform create advance
   receipt indirectly?
4. The notification numbers, and the Group 1 list as enacted. We need to know
   whether "คะแนนสะสม" is in the operative text or only in commentary.
5. Does the Group 1 carve-out from digital-asset business extend to **holding
   keys** for users?
6. Does a partner merchant accepting points become a regulated operator? This
   one decides whether partners will sign at all.
7. If we ever measured carbon properly, what is the route into the September
   2025 carbon-credit door?

An eighth item is not a question but a recommendation: **the same engagement
should cover the other seven areas of law this system already touches** — SOS
relay and duty of care, intermediary liability for user reviews under the
Computer Crime Act and criminal defamation, background location under PDPA,
user-uploaded photographs, tax on payments to hosts, whether trip planning
needs a tourism licence, and minors. The token is not the largest exposure in
that list. The review queue is.

**Prizes joined that list on 16 September.** When the owner settled who funds
the goods behind a drop — sponsors do, in goods, discounts and cash — it moved
the product next to the Gambling Act, which nothing in this document touches.
`58-the-prize-question.md` carries it, with eight more questions for the same
engagement, and the minors question appears in both.

## What holds it

Nothing in this document changed any code. `party.ts`, `standing.ts`,
`esg.ts` and `low-carbon.ts` are unchanged and correct as they stand; this is
the record of why they must stay that way, and of what a lawyer has to settle
before that changes.

The full brief, with sources, is the private artifact circulated with this
commit.
