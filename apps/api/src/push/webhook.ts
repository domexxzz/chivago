/**
 * On-call webhook.
 *
 * A generic JSON POST, shaped so it works unchanged with Slack and Discord
 * incoming webhooks (both read `text`) while still carrying the structured
 * fields a purpose-built ops tool would want.
 *
 * Deliberately not tied to a vendor. Whoever runs the pilot already has a group
 * chat; asking them to adopt a new tool to receive an emergency page is how the
 * page ends up going nowhere.
 */

export interface OncallPage {
  text: string;
  alertId: string;
  locationLabel: string;
  /** Null when the phone gave no fix. Say "position unknown", never (0, 0). */
  lat: number | null;
  lng: number | null;
  minutesOpen: number;
  mapsUrl: string | null;
  liveUrl: string;
  deskUrl: string;
}

export interface OncallTransport {
  /** Returns null when no webhook is configured for this deployment. */
  page(payload: OncallPage): Promise<boolean | null>;
}

export const oncallConfigured = (): boolean => Boolean(process.env.CHIVAGO_ONCALL_WEBHOOK);

export function webhookTransport(timeoutMs = 6000): OncallTransport {
  return {
    async page(payload: OncallPage): Promise<boolean | null> {
      const url = process.env.CHIVAGO_ONCALL_WEBHOOK;
      // Null, not false: "nobody configured a pager" and "the pager failed" are
      // different facts, and the desk shows which one happened.
      if (!url) return null;

      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: ctl.signal,
        });
        return res.ok;
      } catch {
        // Never throws. A failed page must not stop the rest of the rung -
        // notifying the traveller matters more than notifying us.
        return false;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
