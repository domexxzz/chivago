export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
export const FLOATING_NAV_SCROLL_PX = 240;

/** Update React only when crossing the threshold, not on every scroll frame. */
export function watchFloatingNavigation(onChange: (floating: boolean) => void): () => void {
  let floating = window.scrollY > FLOATING_NAV_SCROLL_PX;
  let frame = 0;
  onChange(floating);
  const update = () => {
    frame = 0;
    const next = window.scrollY > FLOATING_NAV_SCROLL_PX;
    if (next !== floating) {
      floating = next;
      onChange(next);
    }
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
  };
}

/** Progressive enhancement: without these APIs, all content stays visible. */
export function enhanceHomeMotion(root: HTMLElement): () => void {
  if (!window.matchMedia || !window.IntersectionObserver) return () => {};
  const preference = window.matchMedia(REDUCED_MOTION_QUERY);
  let teardown = () => {};
  const configure = () => {
    teardown();
    if (preference.matches) return;
    let frame = 0;
    const pending = new Set<Element>();
    const reveal = (element: Element) => {
      element.classList.add("is-revealed");
      observer.unobserve(element);
      pending.delete(element);
    };
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) reveal(entry.target);
      }),
      { threshold: 0.12, rootMargin: "0px 0px -32px 0px" },
    );
    const discover = () => {
      // Filters can remove cards before they enter the viewport.
      pending.forEach((element) => {
        if (!root.contains(element)) {
          observer.unobserve(element);
          pending.delete(element);
        }
      });
      root.querySelectorAll<HTMLElement>(
        ".section-heading, .destination-card, .listing-card, .testimonial, .why-intro, .why-benefits article, .newsletter > div, .trust-row",
      ).forEach((element, index) => {
        if (element.classList.contains("motion-ready")) return;
        element.style.setProperty("--reveal-delay", `${(index % 3) * 65}ms`);
        element.classList.add("motion-ready");
        // Don't hide already-visible content on filters, restored scroll, or initial load.
        if (element.getBoundingClientRect().top < window.innerHeight) reveal(element);
        else {
          pending.add(element);
          observer.observe(element);
        }
      });
    };
    const focus = (event: FocusEvent) => {
      if (event.target instanceof Element) {
        const element = event.target.closest(".motion-ready");
        if (element) reveal(element);
      }
    };
    const updateImage = () => {
      frame = 0;
      const hero = root.querySelector<HTMLElement>(".hero");
      if (!hero) return;
      const bounds = hero.getBoundingClientRect();
      if (bounds.bottom <= 0 || bounds.top >= window.innerHeight) return;
      const progress = Math.max(0, Math.min(1, -bounds.top / bounds.height));
      hero.style.setProperty("--hero-drift", `${(progress * 18).toFixed(2)}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(updateImage);
    };
    const mutation = new MutationObserver(() => { discover(); schedule(); });
    discover();
    mutation.observe(root, { childList: true, subtree: true });
    root.addEventListener("focusin", focus);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    teardown = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      observer.disconnect();
      mutation.disconnect();
      root.removeEventListener("focusin", focus);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      root.querySelectorAll<HTMLElement>(".motion-ready").forEach((element) => {
        element.classList.remove("motion-ready", "is-revealed");
        element.style.removeProperty("--reveal-delay");
      });
      root.querySelector<HTMLElement>(".hero")?.style.removeProperty("--hero-drift");
    };
  };
  configure();
  preference.addEventListener("change", configure);
  return () => {
    preference.removeEventListener("change", configure);
    teardown();
  };
}

export function sectionScrollBehavior(): ScrollBehavior {
  return window.matchMedia?.(REDUCED_MOTION_QUERY).matches ? "instant" : "smooth";
}
