import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement as h } from "react";
import { AskScreen } from "../src/screens/AskScreen.tsx";
import { getTravelListings } from "../src/features/travel-marketplace/data.ts";
import {
  selectListings,
  searchProblems,
} from "../src/features/travel-marketplace/catalogue.ts";
import {
  DEFAULT_FILTERS,
  DEFAULT_SEARCH,
} from "../src/features/travel-marketplace/types/search.ts";
import { mountScreen, server } from "./interact.ts";

test("the copied demo catalogue has 18 independent fictional records", async () => {
  const first = await getTravelListings();
  const second = await getTravelListings();
  assert.equal(first.length, 18);
  assert.equal(new Set(first.map((item) => item.id)).size, 18);
  first[0]!.title = "changed";
  assert.notEqual(second[0]!.title, "changed");
  for (const item of second)
    assert.ok(
      item.images.every((im) =>
        im.src.startsWith("/assets/travel-marketplace/"),
      ),
    );
});

test("combined filters, price boundaries, sorting and date validation match the web prototype", async () => {
  const data = await getTravelListings();
  assert.equal(
    selectListings(
      data,
      { ...DEFAULT_SEARCH, destination: "Koh Samui" },
      { ...DEFAULT_FILTERS, category: "experience", maxPrice: 650 },
      "price-asc",
    ).length,
    1,
  );
  assert.equal(
    selectListings(
      data,
      DEFAULT_SEARCH,
      { ...DEFAULT_FILTERS, category: "stay", maxPrice: 500 },
      "featured",
    ).length,
    0,
  );
  assert.equal(
    selectListings(data, DEFAULT_SEARCH, DEFAULT_FILTERS, "price-asc")[0]!
      .price,
    450,
  );
  assert.ok(
    searchProblems({
      ...DEFAULT_SEARCH,
      checkIn: "2027-02-30",
      checkOut: "2027-03-02",
    }).length,
  );
  assert.ok(searchProblems({ ...DEFAULT_SEARCH, travelers: 21 }).length);
  assert.deepEqual(
    searchProblems({
      ...DEFAULT_SEARCH,
      checkIn: "2027-02-01",
      checkOut: "2027-02-04",
    }),
    [],
  );
});

test("existing operator empty state survives and demo detail actions send no requests", async () => {
  const net = server({ "/listings": [], "/inquiries": [] });
  const ui = await mountScreen(
    h(AskScreen, { onBack: () => {}, onToast: () => {} }),
  );
  try {
    assert.match(ui.text(), /No operator has listed here yet/);
    assert.match(ui.text(), /This is a question, not a booking/);
    assert.match(ui.text(), /18 demo results/);
    await ui.press("Demo category: Stays");
    assert.match(ui.text(), /6 demo results/);
    await ui.press("Reset demo filters");
    await ui.press("View demo: An unhurried island day");
    assert.match(ui.text(), /Fictional reviews/);
    await ui.press("Demo photo 2");
    await ui.pressText("Try demo confirmation");
    assert.match(
      ui.text(),
      /Nothing has been reserved or charged. No inquiry was sent/,
    );
    await ui.pressText("Back to demo details");
    await ui.pressText("Close demo details");
    assert.match(ui.text(), /18 demo results/);
    assert.ok(net.calls.every((call) => call.method === "GET"));
    assert.deepEqual(net.calls.map((call) => call.path).sort(), [
      "/inquiries",
      "/listings",
    ]);
  } finally {
    ui.unmount();
    net.restore();
  }
});
