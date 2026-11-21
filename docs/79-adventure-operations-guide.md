# ChivaGo Adventure Operations Guide

Date: 2026-11-21

Audience: ChivaGo administrators, content editors and authorized hosts

This guide describes the local/staging operating flow. Never publish production content or run a production migration without the normal approval, backup and rollback process.

## 1. Roles and access

- **Admin** manages Places, Adventures, Story structure, Seasons and content lifecycle.
- **Host** reviews only evidence and activities assigned to the host's authorized scope.
- **Traveller** can submit only for the authenticated account and cannot set completion, rewards or verification status.

Use the existing console authentication. Do not share console sessions, host keys, QR signing secrets or machine integration secrets.

## 2. Create and publish an Adventure

1. Sign in to the console with an Admin account.
2. Open `/console/admin/adventures`.
3. Create the Adventure as **Draft** with TH/EN/ZH title and description.
4. Add chapters in the intended order.
5. Add location nodes by selecting existing Place records; do not create duplicate Places.
6. Bind an existing Quest only when the node needs Quest completion.
7. Configure unlock order and the verification policy.
8. Review validation errors. Missing translation, Place, unlock data or invalid ordering must be fixed before publish.
9. Publish only after preview and content-owner approval.

For a substantial change to published content, use **Clone to Draft**, edit the new version, test it, and publish it deliberately. Do not rewrite historical requirements in place.

## 3. Create Story content and clues

- Use an Adventure arc as the top-level story.
- Chapters define order; nodes define the real Place, clue copy and unlock method.
- Supply all three languages before publishing.
- Keep optional side content explicitly optional so it cannot block the main route.
- Use existing media/storage references; do not paste Base64 data into content fields.
- Confirm the previous node unlocks the intended next node and that no node ID is reused.

## 4. Manage locations and geofences

1. Open the existing Place administration area.
2. Select or create the real Place once, with verified latitude/longitude.
3. Confirm the coordinate on the existing map.
4. Set the geofence radius appropriate to GPS conditions; avoid an unrealistically narrow boundary near buildings or cliffs.
5. Bind the Adventure node to that Place ID.
6. For high-value rewards, combine GPS with signed QR or Host approval.

Never publish private routes, continuous location history or staff-only coordinates in traveller content.

## 5. Configure Quest and rewards

- Reuse an existing Quest template and Quest progress engine.
- Bind the Quest to the Adventure node or Season; do not create a second progress record.
- Configure rewards through the existing Ledger/reward path.
- Give each reward a deterministic source and verify retry behavior before release.
- Never enter a reward amount in a client-only component.

## 6. Configure signed QR

Open the Host/Admin Adventure QR management page.

### Static QR

Use for a permanent location sign:

1. Select the authorized Place/node and activity.
2. Create a **Static** QR.
3. Print only the generated token/URL; no secret is embedded.
4. Test with a different user and confirm that each user can satisfy policy once while one scan does not revoke the sign for everyone.

### Dynamic QR

Use for staff-led or higher-risk activities:

1. Select the location/activity and a short expiry suitable for the event.
2. Generate immediately before use.
3. Show it only during the activity.
4. Confirm expiry and one-time replay behavior after the session.

### Revoke or rotate

- Revoke a damaged, copied or misplaced code immediately.
- Create a replacement instead of editing the signed payload.
- Check QR history for rejected bursts, location mismatch or replay attempts.

## 7. Choose a verification policy

| Policy | Suitable use |
|---|---|
| GPS only | Low-value open-place discovery |
| QR only | Indoor or staffed location where GPS is unreliable |
| GPS + QR | Standard location reward |
| GPS + Evidence | Visual activity requiring later review |
| QR + Host | Staff-led community/shop activity |
| GPS + QR + Host | High-value or sensitive reward |

The server owns the policy. Test every required branch, including denied camera/location permission and offline submission, before enabling it.

## 8. Review Adventure evidence

1. Sign in as the authorized Host.
2. Open `/console/adventure/evidence` or the Adventure review queue.
3. Verify the Place, activity, traveller submission time, QR/GPS checks and photo.
4. Approve only when all required evidence is visible and consistent.
5. When rejecting, choose or enter a useful reason. The reason is recorded with reviewer and timestamp.
6. Do not approve the same submission through another browser; duplicate decisions are refused but should still be investigated.

A Host must not be able to view another Host's evidence. If cross-host content appears, stop review activity and escalate as a security incident.

## 9. Manage Hosts

- Bind Host access to the correct location/activity scope using the existing host administration system.
- Use the least privilege needed for review.
- Remove access promptly when responsibilities change.
- Never reuse a traveller device key as a Host credential.
- Review audit history for unusual bulk approvals, repeated rejections or activity outside expected hours.

## 10. Operate Party Adventure

1. The Party owner selects an existing Quest.
2. Start the instance only after the roster is correct; starting snapshots eligible members.
3. For Cooperative mode, assign each roster member a clear task.
4. Monitor individual contribution and team progress separately.
5. Members may complete at different times before the deadline.
6. Complete the instance only when the server says the selected rule is satisfied.
7. Confirm individual and team rewards appear once in Ledger history.

Leaving/rejoining does not transfer another member's contribution. Do not manually edit progress to resolve a roster dispute; preserve the audit history and use the documented moderation process.

## 11. Create and operate a Season

1. Open `/console/admin/seasons`.
2. Create the Season in **Draft** with TH/EN/ZH name, description, dates and theme.
3. Bind existing Quests and configure Memory Coin rewards.
4. Add collection items with type, ownership source, required progress and catch-up cost.
5. Validate dates, Quest references and rewards.
6. Move through the supported lifecycle: Draft → Scheduled/Active → Ended → Archived.
7. After activation, watch progress and exchange audit rows; do not change past participation dates.

Catch-up exchange returns old cosmetic/collection items only under the configured policy. It must not grant competitive power or recreate historical participation.

## 12. Manage collection items

- Use stable item IDs and existing costume/companion catalogue keys where applicable.
- Set one verifiable source for each item.
- Confirm ownership uniqueness and retry behavior.
- Do not delete an item already owned; archive or stop offering it.
- For a mistaken reward, use the audited reversal process rather than direct database edits.

## 13. Monitor progress and integrity

Regularly inspect:

- QR rejection/replay history.
- Pending evidence age and Host decision time.
- Ledger rows with duplicate source references.
- Travel Events without valid source records.
- Story progress inconsistent with node order.
- Pet Memory tied to reversed events.
- Journal/trip ownership and privacy.
- Party instances past deadline or missing roster rows.
- Season progress and exchange balances.

Never repair production data with an ad-hoc SQL update. Record the incident, reproduce it in a safe environment, implement a transactional repair and retain an audit trail.

## 14. Offline and sync support

- A pending offline item is not a completed activity.
- Ask the traveller to reconnect and keep the app open until sync finishes.
- Server rejection after reconnect is final for that attempt; explain the specific localized reason.
- A QR that expired while offline must be replaced; do not backdate it.
- Journal conflicts require reloading the server copy before applying the user's note again.
- Never promise a reward visible only in local pending state.

## 15. Incident and rollback checklist

For suspicious QR, reward or evidence activity:

1. Pause the affected QR/activity or Season offer; do not delete audit rows.
2. Record IDs, timestamps, user/host scope and source references.
3. Revoke compromised QR codes or Host access.
4. Use Ledger reversal for issued rewards.
5. Confirm dependent Story, Pet, Journal and Season projections no longer treat the reversed source as valid.
6. Preserve personal Journal notes unless they themselves violate policy.
7. Test the correction locally/staging before any production action.

## 16. Pre-release operations checklist

- [ ] Content reviewed in TH/EN/ZH.
- [ ] Places and geofences verified on-site.
- [ ] QR signs tested and revocation contact assigned.
- [ ] Host scopes and backup reviewers confirmed.
- [ ] Rewards and retries verified against Ledger.
- [ ] Offline/reconnect path tested.
- [ ] Android and iOS camera/location UAT completed.
- [ ] Storage retention/deletion and privacy notice reviewed.
- [ ] Migration rehearsed with backup and rollback plan.
- [ ] Explicit deployment authorization obtained.
