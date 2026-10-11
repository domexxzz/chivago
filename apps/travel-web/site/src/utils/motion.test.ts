import { afterEach, expect, it, vi } from "vitest";
import { enhanceHomeMotion, sectionScrollBehavior, watchFloatingNavigation } from "./motion";

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; });

function fixture(reduced = false) {
  let change = () => {};
  const preference = { matches: reduced, addEventListener: vi.fn((_event, callback) => { change = callback; }), removeEventListener: vi.fn() };
  vi.stubGlobal("matchMedia", vi.fn(() => preference));
  const disconnect = vi.fn();
  const observe = vi.fn();
  const unobserve = vi.fn();
  let intersect: (entries: Partial<IntersectionObserverEntry>[]) => void = () => {};
  vi.stubGlobal("IntersectionObserver", class {
    observe = observe; unobserve = unobserve; disconnect = disconnect;
    constructor(callback: typeof intersect) { intersect = callback; }
  });
  const root = document.createElement("div");
  root.innerHTML = '<article class="listing-card"><a href="#/listing/test">View example</a></article>';
  document.body.append(root);
  const card = root.querySelector<HTMLElement>("article")!;
  vi.spyOn(card, "getBoundingClientRect").mockReturnValue({ top: 2000 } as DOMRect);
  return { root, card, preference, change: () => change(), disconnect, observe, unobserve, intersect: () => intersect([{ target: card, isIntersecting: true }]) };
}

it("reveals offscreen cards once on intersection and disconnects on cleanup", () => {
  const f = fixture();
  const cleanup = enhanceHomeMotion(f.root);
  expect(f.card).toHaveClass("motion-ready");
  expect(f.card).not.toHaveClass("is-revealed");
  expect(f.observe).toHaveBeenCalledWith(f.card);
  f.intersect();
  expect(f.card).toHaveClass("is-revealed");
  expect(f.unobserve).toHaveBeenCalledWith(f.card);
  cleanup();
  expect(f.disconnect).toHaveBeenCalled();
  expect(f.card).not.toHaveClass("motion-ready");
});

it("reveals keyboard-focused cards immediately without waiting for scroll", () => {
  const f = fixture();
  const cleanup = enhanceHomeMotion(f.root);
  f.card.querySelector("a")!.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  expect(f.card).toHaveClass("is-revealed");
  cleanup();
});

it("does not conceal content with reduced motion and responds to preference changes", () => {
  const f = fixture(true);
  const cleanup = enhanceHomeMotion(f.root);
  expect(f.observe).not.toHaveBeenCalled();
  expect(f.card).not.toHaveClass("motion-ready");
  expect(sectionScrollBehavior()).toBe("instant");
  f.preference.matches = false;
  f.change();
  expect(f.card).toHaveClass("motion-ready");
  f.preference.matches = true;
  f.change();
  expect(f.card).not.toHaveClass("motion-ready");
  expect(f.disconnect).toHaveBeenCalled();
  cleanup();
});

it("leaves content visible when browser enhancement APIs are unavailable", () => {
  const f = fixture();
  vi.stubGlobal("IntersectionObserver", undefined);
  const cleanup = enhanceHomeMotion(f.root);
  expect(f.card).not.toHaveClass("motion-ready");
  expect(sectionScrollBehavior()).toBe("smooth");
  cleanup();
});

it("discovers filtered-in cards and releases removed offscreen cards", async () => {
  const f = fixture();
  const cleanup = enhanceHomeMotion(f.root);
  f.card.remove();
  const replacement = document.createElement("article");
  replacement.className = "listing-card";
  f.root.append(replacement);
  await Promise.resolve(); // Deliver the native mutation observer callback.
  expect(f.unobserve).toHaveBeenCalledWith(f.card);
  expect(replacement).toHaveClass("motion-ready", "is-revealed");
  cleanup();
});

it("floats navigation only beyond 240px and coalesces scroll/resize updates", () => {
  let scheduled: FrameRequestCallback = () => {};
  const request = vi.fn((callback: FrameRequestCallback) => { scheduled = callback; return 1; });
  const cancel = vi.fn();
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", cancel);
  vi.stubGlobal("scrollY", 240);
  const change = vi.fn();
  const cleanup = watchFloatingNavigation(change);
  expect(change).toHaveBeenLastCalledWith(false);
  vi.stubGlobal("scrollY", 241);
  window.dispatchEvent(new Event("scroll"));
  window.dispatchEvent(new Event("resize"));
  expect(request).toHaveBeenCalledTimes(1);
  scheduled(0);
  expect(change).toHaveBeenLastCalledWith(true);
  window.dispatchEvent(new Event("scroll"));
  scheduled(0);
  expect(change).toHaveBeenCalledTimes(2);
  vi.stubGlobal("scrollY", 0);
  window.dispatchEvent(new Event("scroll"));
  scheduled(0);
  expect(change).toHaveBeenLastCalledWith(false);
  cleanup();
  expect(cancel).toHaveBeenCalled();
  const count = request.mock.calls.length;
  window.dispatchEvent(new Event("scroll"));
  expect(request).toHaveBeenCalledTimes(count);
});
