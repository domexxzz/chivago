import { MOCK_LISTINGS } from '../data/mockData';
import type { Listing } from '../types/listing';

/** Replace these adapters with API calls; components never import the listing dataset. */
export async function getListings(): Promise<Listing[]> {
  return structuredClone(MOCK_LISTINGS);
}
export async function getListing(id: string): Promise<Listing | undefined> {
  const listing = MOCK_LISTINGS.find((entry) => entry.id === id);
  return listing ? structuredClone(listing) : undefined;
}
