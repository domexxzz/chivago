/** Actual-browser regression: card → details → mock confirmation → card. */
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const require = createRequire(
  new URL("../../travel-web/site/package.json", import.meta.url),
);
const { chromium } = require("playwright");
const { expect } = require("@playwright/test");
const browser = await chromium.launch({ channel: "msedge" });
await mkdir("dist-travel-qa", { recursive: true });
try {
  for (const width of [375, 768, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: width === 1280 ? "no-preference" : "reduce",
      hasTouch: width === 375,
    });
    const page = await context.newPage();
    const errors = [];
    const writes = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      // Device registration belongs to app startup, outside the mock flow.
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname !== "/devices"
      )
        writes.push(request.url());
    });
    await page.route("http://localhost:8787/**", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          ["/listings", "/inquiries"].includes(
            new URL(route.request().url()).pathname,
          )
            ? { ok: true, data: [] }
            : { ok: false, error: "Test API: unavailable", code: "TEST" },
        ),
      }),
    );
    await page.goto(process.env.CHIVAGO_WEB_URL ?? "http://127.0.0.1:8165/");
    await page
      .getByRole("button", { name: "Skip", exact: true })
      .click({ timeout: 60000 });
    await page.getByText("Stays & tours", { exact: true }).click();
    const card = page.getByTestId("travel-card").first();
    const opener = card.getByRole("button", {
      name: "Open details: An unhurried island day",
      exact: true,
    });
    const dialog = page.getByRole("dialog");
    const close = page.getByRole("button", { name: "Close", exact: true });
    const box = page.getByTestId("marketplace-modal-box");
    const modalScroll = page.getByTestId("marketplace-modal-scroll");
    const assertClosed = async () => {
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
      assert.notEqual(
        await page.evaluate(() => document.body.style.overflow),
        "hidden",
      );
    };
    const assertOpen = async () => {
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute("aria-modal", "true");
      await expect(close).toBeFocused();
      const bounds = await close.boundingBox();
      assert.ok(bounds.width >= 40 && bounds.height >= 40);
      assert.equal(
        await page.evaluate(() => document.body.style.overflow),
        "hidden",
      );
      for (const key of ["Shift+Tab", ...Array(12).fill("Tab")]) {
        await page.keyboard.press(key);
        assert.ok(
          await box.evaluate((node) => node.contains(document.activeElement)),
          "Focus stays inside the box",
        );
      }
    };
    const outside = async () => {
      await page.mouse.click(4, 450);
    };
    const drag = async (from, to) => {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 8 });
      await page.mouse.up();
    };
    // Heart remains an independent button, not an accidental details opener.
    await card.getByTestId("browse-save").click();
    await expect(dialog).toHaveCount(0);
    await card.getByTestId("browse-save").click();
    for (const view of ["details", "confirmation"]) {
      for (const method of ["backdrop", "x", "escape"]) {
        // Click the image/text area, not the old View demo CTA.
        await opener.click({ position: { x: 50, y: 100 } });
        await assertOpen();
        if (view === "confirmation") {
          await page
            .getByText("Try demo confirmation", { exact: true })
            .click();
          await assertOpen();
          await expect(dialog).toHaveAccessibleName(
            "Demo only — nothing booked",
          );
          await expect(
            dialog.getByText(
              "Nothing has been reserved or charged. No inquiry was sent.",
              { exact: true },
            ),
          ).toBeVisible();
        }
        await expect(
          dialog.getByText("FICTIONAL DEMO", { exact: true }),
        ).toBeVisible();
        // Interior click and drags in either direction must never dismiss.
        await dialog.getByText("FICTIONAL DEMO", { exact: true }).click();
        const rect = await box.boundingBox();
        const inside = { x: rect.x + 28, y: rect.y + 72 };
        await drag(inside, { x: 4, y: 450 });
        await expect(dialog).toBeVisible();
        await drag({ x: 4, y: 450 }, inside);
        await expect(dialog).toBeVisible();
        const backgroundBefore = await page
          .getByTestId("browse-heading")
          .boundingBox();
        await page.mouse.move(4, 450);
        await page.mouse.wheel(0, 500);
        await page.waitForTimeout(100);
        const backgroundAfter = await page
          .getByTestId("browse-heading")
          .boundingBox();
        assert.equal(
          backgroundBefore.y,
          backgroundAfter.y,
          "Backdrop scrolling cannot move the page",
        );
        if (view === "details") {
          await modalScroll.evaluate((node) => {
            node.scrollTop = node.scrollHeight;
          });
          await expect(
            page.getByText("Try demo confirmation", { exact: true }),
          ).toBeVisible();
        }
        await page.screenshot({
          path: `dist-travel-qa/modal-${view}-${width}.png`,
        });
        if (method === "backdrop") await outside();
        else if (method === "x") await close.click();
        else await page.keyboard.press("Escape");
        await assertClosed();
      }
    }
    // Keyboard-only opening works with both activation keys; confirmation
    // receives focus after its old Book/confirmation button is unmounted.
    for (const key of ["Enter", "Space"]) {
      await opener.focus();
      await page.keyboard.press(key);
      await assertOpen();
      await close.focus();
      for (let step = 0; step < 4; step++) await page.keyboard.press("Tab");
      await expect(
        page.getByRole("button", {
          name: "Try demo confirmation",
          exact: true,
        }),
      ).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(close).toBeFocused();
      await page.keyboard.press("Escape");
      await assertClosed();
    }
    await card.getByRole("button", { name: /^View demo:/ }).click();
    await close.click();
    await assertClosed();
    if (width === 375) {
      await opener.tap();
      const bounds = await box.boundingBox();
      const inside = { x: bounds.x + 28, y: bounds.y + 72 };
      const session = await context.newCDPSession(page);
      const touchDrag = async (from, to) => {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ ...from, id: 1 }],
        });
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ ...to, id: 1 }],
        });
        await session.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
      };
      await touchDrag({ x: 4, y: 450 }, inside);
      await expect(dialog).toBeVisible();
      await touchDrag(inside, { x: 4, y: 450 });
      await expect(dialog).toBeVisible();
      await session.detach();
      await page.touchscreen.tap(4, 450);
      await assertClosed();
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, []);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    console.log(
      `${width}px: card, keyboard, both dialogs, X/backdrop/Escape, drag safety, focus trap/return, scroll lock, no writes PASS`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
