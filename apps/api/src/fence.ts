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

/** True when the fence has been deliberately opened for this deployment. */
export const fenceOff = (): boolean => process.env.CHIVAGO_FENCE_OFF === '1';

/**
 * What the app needs to know to describe itself honestly.
 * Public, because the band has to be drawn before anybody signs in.
 */
export interface PublicConfig {
  /** Presence is not being checked. The app must say so where it counts. */
  fenceOff: boolean;
}

export const publicConfig = (): PublicConfig => ({ fenceOff: fenceOff() });
