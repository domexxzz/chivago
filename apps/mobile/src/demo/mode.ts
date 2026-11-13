/**
 * Runtime switch for the guest presentation sandbox.
 *
 * The fetch interceptor is installed before React starts, but it only owns
 * API traffic while this flag is true. Members therefore keep using the real
 * API, while a visitor can press every demo action without writing a row to
 * the deployed database. The in-memory demo state dies with the JS session.
 */
let active = false;

export const setGuestSandboxActive = (next: boolean): void => { active = next; };
export const guestSandboxActive = (): boolean => active;

