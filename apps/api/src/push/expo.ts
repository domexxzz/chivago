/**
 * Expo Push Service client.
 *
 * WHY EXPO PUSH
 * It delivers to both iOS and Android through one endpoint, with no APNs
 * certificate or FCM project to stand up first. For a pilot that has to be
 * running on Koh Samui rather than negotiating Apple developer accounts, that
 * is the difference between shipping and not. Swapping to raw APNs/FCM later
 * touches only this file.
 */

/** Expo caps a request at 100 messages. */
const CHUNK = 100;
const ENDPOINT = 'https://exp.host/--/api/v2/push/send';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  /** Android channel. Declared on the client. */
  channelId?: string;
}

export type PushOutcome =
  | { token: string; status: 'ok'; receiptId: string | null }
  /** The device uninstalled or reset. The token must be dropped. */
  | { token: string; status: 'unregistered' }
  /** Transient. Worth retrying. */
  | { token: string; status: 'retry'; message: string }
  /** Permanent. Retrying will not help. */
  | { token: string; status: 'failed'; message: string };

/**
 * An Expo push token looks like `ExponentPushToken[xxxxxxxx]`.
 * Validated before storage: a malformed token is a wasted send on every future
 * notification, and the shape is cheap to check.
 */
export const isExpoPushToken = (v: unknown): v is string =>
  typeof v === 'string' && /^Expo(nent)?PushToken\[[^\]\s]+\]$/.test(v);

interface ExpoTicket {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Errors Expo reports that no amount of retrying will fix.
 * Everything else is treated as transient, because guessing wrong in that
 * direction only costs a retry, while guessing wrong the other way silently
 * drops a notification.
 */
const PERMANENT = new Set(['MessageTooBig', 'InvalidCredentials', 'DeveloperError']);

export interface PushTransport {
  send(messages: PushMessage[]): Promise<PushOutcome[]>;
}

/**
 * The real transport.
 *
 * Never throws: a push failure must not propagate into the host's decision.
 * Everything comes back as an outcome the caller can record and retry.
 */
export function expoTransport(timeoutMs = 8000): PushTransport {
  return {
    async send(messages: PushMessage[]): Promise<PushOutcome[]> {
      const outcomes: PushOutcome[] = [];

      for (let i = 0; i < messages.length; i += CHUNK) {
        const batch = messages.slice(i, i + CHUNK);
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), timeoutMs);
        try {
          const res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(batch),
            signal: ctl.signal,
          });

          if (!res.ok) {
            // A 429 or 5xx is Expo asking us to come back later.
            const transient = res.status === 429 || res.status >= 500;
            for (const m of batch) {
              outcomes.push({
                token: m.to,
                status: transient ? 'retry' : 'failed',
                message: `expo responded ${res.status}`,
              });
            }
            continue;
          }

          const body = (await res.json()) as { data?: ExpoTicket[] };
          const tickets = body.data ?? [];
          batch.forEach((m, index) => {
            const ticket = tickets[index];
            if (!ticket) {
              outcomes.push({ token: m.to, status: 'retry', message: 'no ticket returned' });
              return;
            }
            if (ticket.status === 'ok') {
              outcomes.push({ token: m.to, status: 'ok', receiptId: ticket.id ?? null });
              return;
            }
            const code = ticket.details?.error ?? '';
            if (code === 'DeviceNotRegistered') {
              outcomes.push({ token: m.to, status: 'unregistered' });
              return;
            }
            outcomes.push({
              token: m.to,
              status: PERMANENT.has(code) ? 'failed' : 'retry',
              message: ticket.message ?? (code || 'unknown push error'),
            });
          });
        } catch (err) {
          // Network down, DNS, timeout. Always worth another go.
          for (const m of batch) {
            outcomes.push({ token: m.to, status: 'retry', message: (err as Error).message });
          }
        } finally {
          clearTimeout(timer);
        }
      }

      return outcomes;
    },
  };
}
