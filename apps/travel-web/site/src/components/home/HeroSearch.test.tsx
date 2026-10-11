import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import HeroSearch from "./HeroSearch";
import { DEFAULT_SEARCH } from "../../types/search";
it("submits the actual native date controls and validates incomplete ranges", () => {
  const onSearch = vi.fn();
  render(<HeroSearch search={DEFAULT_SEARCH} onSearch={onSearch} />);
  const arrival = screen.getByLabelText("Arrival date") as HTMLInputElement;
  const departure = screen.getByLabelText("Departure date") as HTMLInputElement;
  arrival.value = "2027-02-01";
  fireEvent.submit(screen.getByRole("form"));
  expect(onSearch).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "both arrival and departure",
  );
  arrival.value = "2027-02-01";
  departure.value = "2027-02-04";
  fireEvent.submit(screen.getByRole("form"));
  expect(onSearch).toHaveBeenCalledWith({
    ...DEFAULT_SEARCH,
    checkIn: "2027-02-01",
    checkOut: "2027-02-04",
  });
});
