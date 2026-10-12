import { MOCK_LISTINGS } from "./mockData.ts";
import type { Listing } from "./types/listing.ts";

/** Local demo only; deliberately independent of api.listings()/api.inquire(). */
export async function getTravelListings(): Promise<Listing[]> {
  return MOCK_LISTINGS.map((item) => ({
    ...item,
    tags: [...item.tags],
    images: item.images.map((image) => ({ ...image })),
    reviews: item.reviews.map((review) => ({ ...review })),
  }));
}
