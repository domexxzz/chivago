import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import ListingDetailPage from "./ListingDetailPage";
import { DEFAULT_SEARCH } from "../types/search";
import * as service from "../services/listings";
afterEach(() => vi.restoreAllMocks());
it("wraps focus at both dialog boundaries and handles cancellation", async () => {
  render(<ListingDetailPage id="samui-island-day" search={DEFAULT_SEARCH} />);
  await userEvent.click(
    await screen.findByRole("button", { name: /Book now/ }),
  );
  const first = screen.getByRole("button", { name: "Close demo confirmation" });
  const last = screen.getByRole("button", { name: "Keep exploring" });
  first.focus();
  fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
  expect(last).toHaveFocus();
  fireEvent.keyDown(last, { key: "Tab" });
  expect(first).toHaveFocus();
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { bubbles: true, cancelable: true }),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("loads details and carries search context into a non-booking confirmation", async () => {
  const user = userEvent.setup();
  render(
    <ListingDetailPage
      id="samui-island-day"
      search={{
        ...DEFAULT_SEARCH,
        checkIn: "2027-02-01",
        checkOut: "2027-02-04",
        travelers: 3,
      }}
    />,
  );
  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "An unhurried island day",
    }),
  ).toBeInTheDocument();
  const book = screen.getByRole("button", { name: /Book now/ });
  await user.click(book);
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveAttribute("open");
  expect(
    screen.getByText(
      "Demo confirmation only. Nothing has been reserved or charged.",
    ),
  ).toBeInTheDocument();
  expect(dialog).toHaveTextContent("2027-02-01 → 2027-02-04");
  expect(dialog).toHaveTextContent("Travelers3");
  await user.click(
    screen.getByRole("button", { name: "Close demo confirmation" }),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(book).toHaveFocus();
});
it("lets keyboard users switch photos using native buttons", async () => {
  const user = userEvent.setup();
  render(<ListingDetailPage id="samui-island-day" search={DEFAULT_SEARCH} />);
  const second = await screen.findByRole("button", { name: "Show photo 2" });
  await user.click(second);
  expect(second).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Show photo 1" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
it("shows not-found for unknown ids", async () => {
  render(<ListingDetailPage id="missing" search={DEFAULT_SEARCH} />);
  expect(
    await screen.findByRole("heading", {
      name: "That possibility isn’t here.",
    }),
  ).toBeInTheDocument();
});
it("offers retry for a detail adapter error", async () => {
  vi.spyOn(service, "getListing").mockRejectedValueOnce(new Error("offline"));
  render(<ListingDetailPage id="samui-island-day" search={DEFAULT_SEARCH} />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Try again" }),
  );
  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "An unhurried island day",
    }),
  ).toBeInTheDocument();
});
