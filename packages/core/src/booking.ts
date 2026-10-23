/**
 * A link the app may open as a place's booking page.
 *
 * https only, to a named host, with no credentials in it. The seed writes
 * these, the API serves them, and the phone checks again before a tap can
 * take anybody anywhere - a row edited by hand must not become a way to send
 * a visitor to a look-alike payment page.
 */
const BOOKING_LINK = /^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?::\d{1,5})?(?:\/[^\s@]*)?$/i;

export const isBookingLink = (url: string | null | undefined): url is string =>
  typeof url === 'string' && url.length <= 300 && BOOKING_LINK.test(url);
