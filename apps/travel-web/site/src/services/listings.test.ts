import { describe, expect, it } from 'vitest';
import { getListing, getListings } from './listings';
import { parseRoute } from '../utils/route';

describe('isolated mock listing adapter', () => {
  it('has eighteen complete fictional listings, six of each category', async () => {
    const listings = await getListings();
    expect(listings).toHaveLength(18);
    expect(new Set(listings.map((l) => l.id)).size).toBe(18);
    for (const category of ['tour', 'stay', 'experience']) expect(listings.filter((l) => l.category === category)).toHaveLength(6);
    for (const listing of listings) {
      expect(listing.currency).toBe('THB');
      expect(listing.price).toBeGreaterThan(0);
      expect(listing.durationHours).toBeGreaterThan(0);
      expect(listing.images).toHaveLength(3);
      expect(listing.images.every((i) => i.src.startsWith(`${import.meta.env.BASE_URL}images/`) && i.alt && i.creditId)).toBeTruthy();
    }
  });
  it('returns independent objects and handles unknown ids', async () => {
    const list = await getListings();
    list[0].title = 'changed';
    expect((await getListing(list[0].id))?.title).not.toBe('changed');
    expect(await getListing('missing')).toBeUndefined();
  });
});
it('parses home, shareable details, and malformed routes', () => {
  expect(parseRoute('')).toEqual({ kind: 'home' });
  expect(parseRoute('#/listing/samui-island-day')).toEqual({ kind: 'listing', id: 'samui-island-day' });
  expect(parseRoute('#/listing/%E0')).toEqual({ kind: 'not-found' });
  expect(parseRoute('#/other')).toEqual({ kind: 'not-found' });
});
