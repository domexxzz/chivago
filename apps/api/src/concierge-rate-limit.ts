/** Small in-process guard in front of the Groq-backed concierge route. */
export interface ConciergeRateLimiter {
  take: (identity: string, now?: number) => boolean;
  reset: () => void;
  size: () => number;
}

export function createConciergeRateLimiter(
  maxCalls = 20,
  windowMs = 60_000,
  maxEntries = 2_000,
): ConciergeRateLimiter {
  const windows = new Map<string, { startsAt: number; calls: number }>();

  const prune = (now: number): void => {
    for (const [key, value] of windows) {
      if (now - value.startsAt >= windowMs) windows.delete(key);
    }
    // If every entry is current, discard the oldest identities. Authentication
    // prevents anonymous key churn, but the limiter must still bound itself.
    while (windows.size > maxEntries) windows.delete(windows.keys().next().value!);
  };

  return {
    take(identity, now = Date.now()) {
      const current = windows.get(identity);
      if (!current || now - current.startsAt >= windowMs) {
        windows.delete(identity);
        windows.set(identity, { startsAt: now, calls: 1 });
        if (windows.size > maxEntries) prune(now);
        return true;
      }
      if (current.calls >= maxCalls) return false;
      current.calls += 1;
      return true;
    },
    reset: () => windows.clear(),
    size: () => windows.size,
  };
}
