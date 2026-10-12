/** Browser regression for the integrated screen; uses the isolated app's test dependency. */
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const require = createRequire(
  new URL("../../travel-web/site/package.json", import.meta.url),
);
const { chromium } = require("playwright");
const { expect } = require("@playwright/test");
const output = fileURLToPath(new URL("../dist-travel-qa/", import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
try {
  for (const width of [360, 768, 1280, 1920]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    let releaseListings;
    let firstListings = true;
    const pendingListings = new Promise((resolve) => {
      releaseListings = resolve;
    });
    await page.route("http://localhost:8787/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/listings" && firstListings) {
        firstListings = false;
        await pendingListings;
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            error: "You appear to be offline.",
            code: "OFFLINE",
          }),
        });
      }
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          path === "/listings" || path === "/inquiries"
            ? { ok: true, data: [] }
            : { ok: false, error: "Test API: unavailable", code: "TEST" },
        ),
      });
    });
    await page.goto(process.env.CHIVAGO_WEB_URL ?? "http://127.0.0.1:8081/");
    await page
      .getByRole("button", { name: "Skip", exact: true })
      .click({ timeout: 60000 });
    await page.getByText("Stays & tours", { exact: true }).click();
    const demo = page.getByTestId("travel-marketplace-demo");
    await expect(demo).toBeVisible({ timeout: 60000 });
    await expect(page.getByRole("progressbar").first()).toBeVisible();
    releaseListings();
    const offline = page.getByTestId("stays-error");
    await expect(offline).toBeVisible();
    const retry = offline.getByRole("button", { name: "Retry", exact: true });
    assert.ok((await retry.boundingBox()).width < 160, "Retry stays compact");
    await page.screenshot({ path: `${output}/offline-${width}.png` });
    await retry.click();
    await expect(offline).toHaveCount(0);
    const destinationCards = demo.getByRole("button", {
      name: /^Demo destination:/,
    });
    const cardBoxes = await destinationCards.evaluateAll((nodes) =>
      nodes.map((node) => {
        const r = node.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width };
      }),
    );
    assert.equal(
      new Set(cardBoxes.map((box) => Math.round(box.y))).size,
      width >= 1024 ? 1 : width >= 480 ? 2 : 4,
    );
    const row = page.getByTestId("travel-search-row");
    const fieldBoxes = await row
      .locator("input")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().y),
      );
    assert.equal(
      new Set(fieldBoxes.map(Math.round)).size,
      width >= 1024 ? 1 : 4,
    );
    const container = await page.getByTestId("stays-container").boundingBox();
    assert.ok(
      container.width <= 1280 && container.width >= Math.min(width, 1280) - 1,
    );
    const navigation = await page.getByTestId("stays-navigation").boundingBox();
    assert.ok(navigation.width <= 601);
    await page.getByLabel("Demo destination", { exact: true }).focus();
    assert.equal(
      await page
        .getByTestId("travel-field")
        .first()
        .evaluate((node) => getComputedStyle(node, "::after").opacity),
      "1",
    );
    await page
      .getByLabel("Demo destination", { exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByText("No operator has listed here yet.", { exact: false }),
    ).toBeVisible();
    await expect(demo.getByRole("button", { name: /^View demo:/ })).toHaveCount(
      18,
    );
    await expect
      .poll(() =>
        demo
          .locator("img")
          .evaluateAll((images) =>
            images.every((im) => im.complete && im.naturalWidth > 0),
          ),
      )
      .toBe(true);
    assert.ok(
      (await page.getByTestId("travel-hero-image").boundingBox()).height >= 300,
      "Hero photo fills its banner",
    );
    await page.screenshot({ path: `${output}/integrated-hero-${width}.png` });
    const writes = [];
    page.on("request", (r) => {
      if (r.method() === "POST") writes.push(r.url());
    });
    await page.getByLabel("Demo travelers", { exact: true }).fill("21");
    await page.getByText("Explore demo trips", { exact: true }).click();
    await expect(
      page.getByText("Choose between 1 and 20 travelers.", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Demo travelers", { exact: true }).fill("3");
    await page
      .getByLabel("Demo destination", { exact: true })
      .fill("Koh Samui");
    await page
      .getByLabel("Demo arrival date", { exact: true })
      .fill("2027-02-01");
    await page
      .getByLabel("Demo departure date", { exact: true })
      .fill("2027-02-04");
    await page.getByText("Explore demo trips", { exact: true }).click();
    await page
      .getByRole("button", { name: "Demo category: Experiences", exact: true })
      .click();
    await expect(demo.getByRole("button", { name: /^View demo:/ })).toHaveCount(
      1,
    );
    await page
      .getByRole("button", { name: "Maximum base price: 500 THB", exact: true })
      .click();
    await expect(
      page.getByText("No demo matches. Try resetting the filters.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByText("Reset demo filters", { exact: true }).click();
    await page
      .getByRole("button", {
        name: "View demo: An unhurried island day",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Demo photo 2", exact: true })
      .click();
    await page.getByText("Try demo confirmation", { exact: true }).click();
    await expect(
      page.getByText(
        "Nothing has been reserved or charged. No inquiry was sent.",
        { exact: true },
      ),
    ).toBeVisible();
    await page.screenshot({ path: `${output}/confirmation-${width}.png` });
    await page.keyboard.press("Escape");
    await expect(
      page.getByText("Try demo confirmation", { exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByText("Close demo details", { exact: true }),
    ).toHaveCount(0);
    assert.deepEqual(
      writes,
      [],
      "Demo actions must never send a real inquiry or payment",
    );
    await demo.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/stays-and-tours-${width}.png` });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    if (width === 1920) {
      const card = demo.getByTestId("travel-card").first();
      await card.hover();
      assert.equal(
        await card.evaluate((node) => getComputedStyle(node).transform),
        "none",
      );
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await expect
        .poll(() => card.evaluate((node) => getComputedStyle(node).transform))
        .not.toBe("none");
      await page
        .getByLabel("Demo destination", { exact: true })
        .scrollIntoViewIfNeeded();
      await page.getByLabel("Demo destination", { exact: true }).focus();
      await page.keyboard.press("Tab");
      await expect(
        page.getByLabel("Demo arrival date", { exact: true }),
      ).toBeFocused();
      await page.getByTestId("travel-destinations").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/destinations-${width}.png` });
    }
    console.log(
      `PASS ${width}px: inquiry boundary, 18 listings, validation, combined filters, gallery, confirmation, Escape, no writes`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
