import { expect, test } from "@playwright/test";

test("reveals sections, drifts the hero, and floats usable navigation without overflow", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("./");
  await expect(page.locator(".listing-card")).toHaveCount(18);
  // Let the app finish its initial route scroll/focus before exercising scrolling.
  await expect(page.locator("#main-content")).toBeFocused();
  await expect(page.locator(".hero-content h1")).toHaveCSS("animation-name", "coastal-entrance");
  await page.evaluate(() => window.scrollTo(0, 350));
  await expect(page.locator(".site-header")).toHaveClass(/is-floating/);
  await expect.poll(() => page.locator(".hero").evaluate(el => parseFloat((el as HTMLElement).style.getPropertyValue("--hero-drift")))).toBeGreaterThan(0);
  await page.locator("#destinations").scrollIntoViewIfNeeded();
  await expect(page.locator(".destination-card").first()).toHaveClass(/is-revealed/);
  if (testInfo.project.name === "375px") await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Our approach", exact: true }).click();
  await expect(page.locator("#why-chivago")).toBeInViewport();
  await expect(page.locator(".why-intro")).toHaveClass(/is-revealed/);
  await expect(page.locator(".why-intro")).toHaveCSS("opacity", "1");
  await expect.poll(() => page.locator("#why-chivago").evaluate(el => el.getBoundingClientRect().top)).toBeGreaterThan(85);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/motion-${testInfo.project.name}.png` });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator(".site-header")).not.toHaveClass(/is-floating/);
});

test("reduced motion keeps every section visible and disables movement, including live changes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  await expect(page.locator(".listing-card")).toHaveCount(18);
  await expect(page.locator(".motion-ready")).toHaveCount(0);
  await expect(page.locator(".hero-content h1")).toHaveCSS("animation-name", "none");
  await expect(page.locator(".hero-photo")).toHaveCSS("transform", "none");
  await page.getByRole("link", { name: "View An unhurried island day", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("An unhurried island day");
  await page.getByRole("link", { name: "← Back to exploring" }).click();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator(".motion-ready").first()).toBeAttached();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".motion-ready")).toHaveCount(0);
  await expect(page.locator(".hero-photo")).toHaveCSS("transform", "none");
});
