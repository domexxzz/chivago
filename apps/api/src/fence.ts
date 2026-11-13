/**
 * The fence, and the one switch that opens it.
 *
 * Everything this product claims about presence rests on one idea: a
 * check-in, a quest arrival and a story are only recorded when the phone was
 * actually within a few hundred metres of the place. The app says so on
 * screen - "Counted from geofenced check-ins, not estimated" - and the Green
 * Points an auditor is asked to trust are built on rows that passed it.
 *
 * `CHIVAGO_FENCE_OFF=1` opens the fence. Every distance check and every
 * presence check (mock flag, accuracy, implied travel) stops running, and
 * anybody can check in at anywhere from anywhere. It exists because testing
 * the flows end to end otherwise means faking a GPS fix on every device, and
 * the owner asked for the switch by name.
 *
 * TWO RULES COME WITH IT, and they are not optional.
 *
 * 1. It is OFF unless the environment says otherwise. Not a database row, not
 *    a setting a console can flip by accident: an environment variable, which
 *    means turning it on is a deploy somebody performed on purpose.
 *
 * 2. WHILE IT IS ON, THE APP SAYS SO. `GET /config` reports it, the app wears
 *    a band across the top, and the line under the visitor count stops
 *    claiming the number came from a fence. A system that quietly drops the
 *    check while still printing the claim is not a relaxed demo, it is a
 *    false statement about evidence - which is the one thing this product
 *    cannot afford to make.
 *
 * The travel and accuracy checks go with the distance check rather than
 * staying behind. They exist to make a CLAIMED POSITION credible; with no
 * position to check they only produce refusals that read as bugs, like the
 * 450 km jump between an island beach and the Si Racha campus.
 */

import { assistConfig } from './assist-service.ts';

/** True when the fence has been deliberately opened for this deployment. */
export const fenceOff = (): boolean => process.env.CHIVAGO_FENCE_OFF === '1';

/**
 * Clips and photographs go up the moment they are posted, with nobody
 * looking at them first.
 *
 * The design was a queue: a traveller posts, a host passes it, and only then
 * does it reach the pin, the board and the projector. That queue is why the
 * screen in a room full of people is safe to point at. `CHIVAGO_STORIES_AUTO_APPROVE=1`
 * takes it away, because the owner asked for posting to be immediate.
 *
 * What that costs, said plainly: anyone who can reach the app can put a clip
 * on a public screen with no human between them and it. The mitigations that
 * remain are real but they are all AFTER the fact - the console can hide any
 * story in one click, a hide takes it off every surface at once, and every
 * clip expires by itself in seven days.
 *
 * Same two rules as the fence. Off unless the environment says otherwise,
 * and while it is on the app says so where somebody is about to post.
 */
export const storiesAutoApprove = (): boolean => process.env.CHIVAGO_STORIES_AUTO_APPROVE === '1';

/**
 * What the app needs to know to describe itself honestly.
 * Public, because the band has to be drawn before anybody signs in.
 */
export interface PublicConfig {
  /** Presence is not being checked. The app must say so where it counts. */
  fenceOff: boolean;
  /**
   * CLIPS AND PHOTOGRAPHS people post go public with nobody looking at them
   * first. The app must say so before posting.
   *
   * It is named for what it governs because the old name did not. Read on its
   * own, `autoApprove` sounds like the thing this product exists to refuse -
   * quest proof approved without a host - and somebody reading `/config` over
   * the presenter's shoulder has no way to tell that it is not. Proof is never
   * auto-approved: `resolveVerification` is the only path that mints a Green
   * Point, and a named host has to call it.
   */
  storiesAutoApprove: boolean;
  /**
   * @deprecated Use `storiesAutoApprove`. Same value, kept because `/config`
   * is public and older app builds and the SDKs read this name. Removing it
   * would break them for a rename, so both ship until those have moved.
   */
  autoApprove: boolean;
  /**
   * Proof photos are shown to an AI for the host (docs/64). The app must say
   * so where somebody is about to send them.
   */
  aiAssist: boolean;
}

export const publicConfig = (): PublicConfig => {
  // One read, two names: an alias that could disagree with the field it
  // aliases would be worse than no alias at all.
  const stories = storiesAutoApprove();
  return {
    fenceOff: fenceOff(),
    storiesAutoApprove: stories,
    autoApprove: stories,
    aiAssist: assistConfig(process.env).enabled,
  };
};
