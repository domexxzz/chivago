# Adventure Travel audit and incremental architecture

Date: 2026-11-20

This document records what was verified in the repository before the first
Adventure vertical slice was added. It separates reusable production paths
from planned work so the UI never implies that an unsupported feature exists.

## Verified reusable systems

| Capability | Existing implementation | Reuse decision |
|---|---|---|
| Authentication | Device keys, account sessions and server-owned `userId` context in `apps/api/src/server.ts` | Reuse. Adventure never accepts a user id from the client. |
| Places | `places`, scored place repository, licensed photo metadata and Koh Sichang catalogue | Reuse place ids, coordinates, copy and photography. No second location table. |
| Verified presence | `presence-service.ts`, `checkin-service.ts`, geofence checks, accuracy and mocked-location checks | Reuse check-in Ledger rows as Adventure completion evidence. |
| Rewards | Wallet plus immutable Ledger source references | Reuse. Phase 1 displays only the server-confirmed Check-in result. |
| Quest | `quests`, `quest_progress`, proofs and host verification | Reuse for later node verification bridges; do not duplicate quest progress. |
| Party Quest | Instance and roster foundation in `party-quest-service.ts` | Preserve. Its progress projection still needs instance-isolated contribution records before Narrative Party nodes can depend on it. |
| Map | `SamuiMap` / MapLibre and the area catalogue | Reuse with the `koh-sichang` area and real Place objects. |
| Companion and costume | Core companion and costume catalogues plus ledger-derived progression | Reused by verified Pet Memory. The current species catalogue is Samui-oriented; Koh Sichang-specific companion art/content still requires an approved catalogue rather than invented production data. |
| Offline | Public area cache and native outbox | Reuse only after an Adventure cache contract and server deduplication are added. Offline must never grant completion. |
| Localization | Shared localized values plus the existing `t()` locale resolver | All new API content carries EN/TH/ZH. |

## Gaps found

| Requirement | Status after Phase 1 | Next safe step |
|---|---|---|
| Chapter / clue narrative | Implemented foundation | Add draft/publish/archive Admin editing and content validation. |
| Four Adventure screens | Implemented foundation | Device UAT, accessibility review and final visual tuning. |
| Travel Event core | Implemented for Check-in and verified Quest | Extend the same envelope to Party Quest and future signed QR outcomes; Ledger remains the reward authority. |
| QR and host node unlock | Quest host verification integrated; signed standalone QR pending | Reuse a replay-safe signed QR token before exposing QR Adventure nodes. |
| Pet Memory | Implemented foundation | Memory rows require an existing companion key and a non-reversed verified event. Gesture/Bond progression remains pending. |
| Travel Journal | Implemented foundation | Private-by-default verified entries, editable personal note and explicit sharing choice are live. Photo selection and trip grouping remain pending. |
| Community Quest | Existing Shop, Quest, proof and Host pieces are reusable | Bind an existing Quest to a real Shop; add replay-safe signed QR tokens. |
| Async Party narrative | Pending | First isolate Party Quest contributions by `party_quest_id`; never project team progress from legacy user Quest state. |
| Season / catch-up | Pending | Add after event/reward idempotency is shared across individual and Party paths. |
| Adventure offline sync | Pending | Cache read-only content first; queue only evidence submissions, then revalidate on the server. |

## Phase 1 data flow

1. Published Adventure content names existing Place ids.
2. The authenticated API reads standing Check-in Ledger rows for the caller.
3. The API computes Locked, Available and Completed states in sequence.
4. The mobile UI renders the projection and cannot set progress.
5. A Check-in requests real foreground location and sends accuracy/mock metadata.
6. The existing Check-in service validates it and writes the idempotent Ledger row.
7. The Adventure projection is re-read; the next clue becomes available.
8. The result screen shows only values confirmed by the Check-in response.

## Phase 2 verified event flow

1. Check-in or Host Verification completes through the existing service.
2. Wallet/EXP is written through the existing idempotent Ledger source ref.
3. In the same transaction, the event service verifies that standing Ledger
   row and records the immutable Travel Event.
4. Eligible Adventure content is unlocked in story order. A later real visit
   remains a visit but cannot skip an earlier clue.
5. Pet Memory and Journal entries point back to the verified event; neither
   accepts a client-supplied completion or reward.
6. Retrying the source returns the original records and creates no duplicate.
7. Reversing the Ledger movement preserves audit rows with `invalidated_at`
   while removing them from Adventure, Pet Memory and Journal projections.

Implemented authenticated endpoints:

- `GET /travel/events`
- `GET /travel/journal`
- `PATCH /travel/journal/:id`
- `GET /companions/memories`

## Security and privacy boundaries

- Location remains permission-gated and is submitted only when the traveller
  explicitly checks in.
- Adventure reads the authenticated caller from server context.
- Reversed Ledger rows do not complete a node.
- Reversed sources remain auditable but no longer appear as valid memories or
  journal entries.
- A client cannot submit completion, rewards or an ownership id.
- No continuous GPS trail is introduced.
- QR, evidence, Pet Memory, stamps and Season rewards are not shown as earned
  until their server-side bridges exist.

## Recommended order after Phase 1

1. Add Admin narrative authoring with draft/publish validation.
2. Add a replay-safe signed QR verification path and connect it to Adventure.
3. Add Travel Journal trip grouping and user-selected photos without turning
   unverified notes into reward evidence.
4. Fix Party Quest instance-isolated contributions, then emit Party events.
5. Add Seasons and catch-up exchange after reward idempotency is shared.
6. Add offline content caching and replay-safe evidence synchronization.
