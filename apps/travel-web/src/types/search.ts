import type { Category } from "./listing";
export interface SearchContext {
  destination: string;
  checkIn: string;
  checkOut: string;
  travelers: number;
}
export type DurationFilter = "all" | "short" | "day" | "long";
export type SortOrder = "featured" | "price-asc" | "price-desc" | "rating";
export interface Filters {
  category: Category | "all";
  maxPrice: number;
  minRating: number;
  duration: DurationFilter;
}
export const DEFAULT_SEARCH: SearchContext = {
  destination: "",
  checkIn: "",
  checkOut: "",
  travelers: 2,
};
export const DEFAULT_FILTERS: Filters = {
  category: "all",
  maxPrice: 5000,
  minRating: 0,
  duration: "all",
};
