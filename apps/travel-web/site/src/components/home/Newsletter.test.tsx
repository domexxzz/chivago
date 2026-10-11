import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import Newsletter from "./Newsletter";
import { validEmail } from "../../utils/newsletter";
it("rejects malformed email addresses", () => {
  for (const value of ["", "abc", "x@", "@x.com", "a b@c.com", "a@@b.com"])
    expect(validEmail(value)).toBe(false);
  expect(validEmail(" name@example.com ")).toBe(true);
});
it("validates without sending or saving an email", async () => {
  const user = userEvent.setup();
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const storeSpy = vi.spyOn(Storage.prototype, "setItem");
  render(<Newsletter />);
  fireEvent.submit(screen.getByRole("form"));
  expect(screen.getByRole("alert")).toHaveTextContent("valid email");
  await user.type(screen.getByLabelText("Email address"), "demo@example.com");
  await user.click(screen.getByRole("button", { name: "Count me in" }));
  expect(screen.getByRole("status")).toHaveTextContent(
    "You are not subscribed",
  );
  expect(screen.getByLabelText("Email address")).toHaveValue("");
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(storeSpy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});
