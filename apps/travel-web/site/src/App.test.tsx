import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import * as listings from "./services/listings";

beforeEach(() => {
  window.location.hash = "";
  vi.restoreAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
});
it("shows eighteen fictional listings and explicit price bases", async () => {
  render(<App />);
  expect(await screen.findAllByRole('link', { name: /^View / })).toHaveLength(18);
  expect(
    screen.getByText(/All listings, prices, and ratings are fictional/),
  ).toBeInTheDocument();
  expect(screen.getByText(/Not a trip total/)).toBeInTheDocument();
});
it("does not disguise an adapter error as an empty catalogue", async () => {
  vi.spyOn(listings, "getListings").mockRejectedValueOnce(new Error("offline"));
  render(<App />);
  expect(
    await screen.findByRole("button", { name: "Try again" }),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findAllByRole('link', { name: /^View / })).toHaveLength(18);
});
it("combines filters, handles empty results, and resets", async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findAllByRole('link', { name: /^View / });
  await user.selectOptions(screen.getByLabelText("Category"), "stay");
  expect(screen.getAllByRole('link', { name: /^View / })).toHaveLength(6);
  await user.selectOptions(
    screen.getByLabelText("Destination", { selector: "select" }),
    "Krabi",
  );
  expect(screen.getAllByRole('link', { name: /^View / })).toHaveLength(1);
  await user.selectOptions(screen.getByLabelText("Maximum base price"), "500");
  expect(screen.getByText("A little too specific?")).toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "Show all possibilities" }),
  );
  expect(screen.getAllByRole('link', { name: /^View / })).toHaveLength(18);
});
