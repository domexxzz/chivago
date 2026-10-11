import { expect, it } from "vitest";
import { getListings } from "../services/listings";
import { DEFAULT_FILTERS, DEFAULT_SEARCH } from "../types/search";
import { searchProblems, selectListings } from "./catalogue";
it("combines filters inclusively without mutating input", async () => {
  const items = await getListings();
  expect(
    selectListings(
      items,
      { ...DEFAULT_SEARCH, destination: " KOH SAMUI " },
      {
        category: "experience",
        maxPrice: 650,
        minRating: 4.9,
        duration: "short",
      },
      "featured",
    ).map((l) => l.id),
  ).toEqual(["samui-sunrise-yoga"]);
  expect(items[0].id).toBe("samui-island-day");
});
it("sorts price and ratings", async () => {
  const items = await getListings();
  expect(
    selectListings(items, DEFAULT_SEARCH, DEFAULT_FILTERS, "price-asc")[0]
      .price,
  ).toBe(450);
  expect(
    selectListings(items, DEFAULT_SEARCH, DEFAULT_FILTERS, "price-desc")[0]
      .price,
  ).toBe(4200);
  expect(
    selectListings(items, DEFAULT_SEARCH, DEFAULT_FILTERS, "rating")[0].rating,
  ).toBe(4.9);
});
it("assigns 4-hour and 24-hour boundaries to one duration group", async () => {
  const items = await getListings();
  const ids = (duration: "short" | "day" | "long") =>
    selectListings(
      items,
      DEFAULT_SEARCH,
      { ...DEFAULT_FILTERS, duration },
      "featured",
    ).map((l) => l.id);
  expect(ids("short")).toContain("phuket-blue-hour");
  expect(ids("day")).not.toContain("phuket-blue-hour");
  expect(ids("day")).toContain("phuket-garden-rooms");
  expect(ids("long")).not.toContain("phuket-garden-rooms");
});
it("validates dates and travelers without pretending to check availability", () => {
  expect(searchProblems(DEFAULT_SEARCH)).toEqual([]);
  expect(
    searchProblems({
      ...DEFAULT_SEARCH,
      travelers: 20,
      checkIn: "2027-01-01",
      checkOut: "2027-01-02",
    }),
  ).toEqual([]);
  for (const travelers of [0, 21, 1.5, NaN])
    expect(searchProblems({ ...DEFAULT_SEARCH, travelers })).not.toEqual([]);
  for (const [checkIn, checkOut] of [
    ["2027-01-01", ""],
    ["2027-02-30", "2027-03-02"],
    ["2027-01-02", "2027-01-02"],
    ["2027-01-03", "2027-01-02"],
  ])
    expect(
      searchProblems({ ...DEFAULT_SEARCH, checkIn, checkOut }),
    ).not.toEqual([]);
});
