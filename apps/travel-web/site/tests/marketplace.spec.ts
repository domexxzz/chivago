import { test, expect } from "@playwright/test";
test("search → filters → detail → keyboard-safe demo confirmation → retained catalogue", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const external: string[] = [];
  page.on("request", (request) => {
    if (
      !request.url().startsWith("http://127.0.0.1:5173/") &&
      !request.url().startsWith("data:")
    )
      external.push(request.url());
  });
  await page.goto("./");
  await expect(page.getByRole("article")).toHaveCount(21); // 18 listings + 3 benefits; testimonial figures are not articles.
  await expect(page.locator(".listing-card")).toHaveCount(18);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator('input[aria-label="Destination"]').fill("Koh Samui");
  await page.getByLabel("Arrival date").fill("2027-02-01");
  await page.getByLabel("Departure date").fill("2027-02-04");
  await page.getByLabel("Travelers").fill("3");
  await page
    .getByRole("button", { name: "Explore trips", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("experience");
  await expect(page.locator(".listing-card")).toHaveCount(1);
  await page
    .getByRole("combobox", { name: "Sort by", exact: true })
    .selectOption("price-asc");
  await page
    .getByRole("link", { name: "View Sunrise, stretch & sea", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Sunrise, stretch & sea",
  );
  await page.getByRole("button", { name: "Show photo 2", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Show photo 2" }),
  ).toHaveAttribute("aria-pressed", "true");
  const book = page.getByRole("button", {
    name: "Book now — demo",
    exact: true,
  });
  await book.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Nothing has been reserved or charged.");
  await expect(dialog).toContainText("2027-02-01 → 2027-02-04");
  const close = page.getByRole("button", { name: "Close demo confirmation" });
  const keep = page.getByRole("button", {
    name: "Keep exploring",
    exact: true,
  });
  await expect(close).toBeFocused();
  await close.press("Shift+Tab");
  await expect(keep).toBeFocused();
  await keep.press("Tab");
  await expect(close).toBeFocused();
  await page.screenshot({
    path: `artifacts/confirmation-${testInfo.project.name}.png`,
  });
  await close.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(book).toBeFocused();
  await page
    .getByRole("link", { name: "← Back to exploring", exact: true })
    .click();
  await expect(page.locator(".listing-card")).toHaveCount(1);
  await expect(
    page.getByRole("combobox", { name: "Category", exact: true }),
  ).toHaveValue("experience");
  await page
    .getByRole("combobox", { name: "Maximum base price", exact: true })
    .selectOption("500");
  await expect(
    page.getByRole("heading", { name: "A little too specific?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show all possibilities" }).click();
  await expect(page.locator(".listing-card")).toHaveCount(18);
  if (testInfo.project.name === "375px") {
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole("button", { name: "Our approach", exact: true }).click();
    await expect(page.locator("#why-chivago")).toBeInViewport();
  }
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  await page
    .getByRole("link", { name: "ChivaGo home", exact: true })
    .first()
    .click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `artifacts/home-${testInfo.project.name}.png`,
  });
});
test("validates search, handles missing routes, and never submits newsletter data", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByLabel("Travelers").fill("21");
  await page
    .getByRole("button", { name: "Explore trips", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("between 1 and 20");
  await page.getByLabel("Travelers").fill("2");
  await page.getByLabel("Arrival date").fill("2027-02-01");
  await page
    .getByRole("button", { name: "Explore trips", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "both arrival and departure",
  );
  const submissions: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET") submissions.push(r.url());
  });
  await page.getByLabel("Email address").fill("invalid");
  await page.getByRole("button", { name: "Count me in", exact: true }).click();
  await expect(page.locator(".newsletter-error")).toContainText("valid email");
  await page.getByLabel("Email address").fill("demo@example.com");
  await page.getByRole("button", { name: "Count me in", exact: true }).click();
  await expect(page.locator(".newsletter-success")).toContainText(
    "You are not subscribed",
  );
  expect(submissions).toEqual([]);
  await page.goto("./#/listing/missing");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "That possibility isn’t here.",
  );
  await page.goto("./#/listing/samui-palm-house");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Palm House hideaway",
  );
  await expect(page.locator(".detail-price")).toContainText("/ night");
});
