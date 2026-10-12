/** One shared frame clock for all reveals; scroll never rerenders the catalogue. */
export function createTravelViewport() {
  const checks = new Set<() => void>();
  let frame: ReturnType<typeof requestAnimationFrame> | null = null;
  return {
    subscribe(check: () => void) {
      checks.add(check);
      return () => {
        checks.delete(check);
      };
    },
    check() {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        checks.forEach((check) => check());
      });
    },
    dispose() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      checks.clear();
    },
  };
}
export type TravelViewport = ReturnType<typeof createTravelViewport>;
