import type { Listing } from "../types/listing";
import type { Filters, SearchContext, SortOrder } from "../types/search";

export function selectListings(
  listings: Listing[],
  search: SearchContext,
  filters: Filters,
  sort: SortOrder,
): Listing[] {
  const destination = search.destination.trim().toLowerCase();
  return listings
    .filter(
      (l) =>
        (!destination || l.location.toLowerCase().includes(destination)) &&
        (filters.category === "all" || l.category === filters.category) &&
        l.price <= filters.maxPrice &&
        l.rating >= filters.minRating &&
        (filters.duration === "all" ||
          (filters.duration === "short" && l.durationHours <= 4) ||
          (filters.duration === "day" &&
            l.durationHours > 4 &&
            l.durationHours <= 24) ||
          (filters.duration === "long" && l.durationHours > 24)),
    )
    .sort((a, b) => {
      const order =
        sort === "price-asc"
          ? a.price - b.price
          : sort === "price-desc"
            ? b.price - a.price
            : sort === "rating"
              ? b.rating - a.rating
              : a.featuredOrder - b.featuredOrder;
      return order || a.featuredOrder - b.featuredOrder;
    });
}
function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function searchProblems(search: SearchContext): string[] {
  const problems: string[] = [];
  if (
    !Number.isInteger(search.travelers) ||
    search.travelers < 1 ||
    search.travelers > 20
  )
    problems.push("Choose between 1 and 20 travelers.");
  if (search.checkIn || search.checkOut) {
    if (!validDate(search.checkIn) || !validDate(search.checkOut))
      problems.push("Choose valid dates for both arrival and departure.");
    else if (search.checkOut <= search.checkIn)
      problems.push("Departure must be after arrival.");
  }
  return problems;
}
export const formatPrice = (price: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(price);
export const categoryLabel = {
  tour: "Tour",
  stay: "Stay",
  experience: "Experience",
};
