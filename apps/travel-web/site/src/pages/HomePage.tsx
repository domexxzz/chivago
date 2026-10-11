import { useEffect, useRef } from "react";
import type { Listing } from "../types/listing";
import type {
  Filters as FilterValues,
  SearchContext,
  SortOrder,
} from "../types/search";
import HeroSearch from "../components/home/HeroSearch";
import FeaturedDestinations from "../components/home/FeaturedDestinations";
import Filters from "../components/marketplace/Filters";
import ListingCard from "../components/marketplace/ListingCard";
import { selectListings } from "../utils/catalogue";
import SocialProof from "../components/home/SocialProof";
import WhyChivaGo from "../components/home/WhyChivaGo";
import Newsletter from "../components/home/Newsletter";
import { enhanceHomeMotion, sectionScrollBehavior } from "../utils/motion";
export default function HomePage({
  listings,
  loading,
  error,
  search,
  filters,
  sort,
  onSearch,
  onFilters,
  onSort,
  onReset,
  onRetry,
}: {
  listings: Listing[];
  loading: boolean;
  error: boolean;
  search: SearchContext;
  filters: FilterValues;
  sort: SortOrder;
  onSearch: (search: SearchContext) => void;
  onFilters: (filters: FilterValues) => void;
  onSort: (sort: SortOrder) => void;
  onReset: () => void;
  onRetry: () => void;
}) {
  const visible = selectListings(listings, search, filters, sort);
  const page = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (page.current) return enhanceHomeMotion(page.current);
  }, []);
  return (
    <div className="home-page" ref={page}>
      <HeroSearch
        key={JSON.stringify(search)}
        search={search}
        onSearch={onSearch}
      />
      <div className="intro-strip container">
        <span>
          <span className="strip-symbol">✳</span> A slower kind of adventure
        </span>
        <span>Small moments. Lasting memories.</span>
        <span>Made for your kind of Thailand.</span>
      </div>
      <FeaturedDestinations
        onChoose={(destination) => onSearch({ ...search, destination })}
      />
      <section
        className="market-section"
        id="marketplace"
        aria-labelledby="market-title"
      >
        <div className="container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">FIND YOUR KIND OF GOOD</p>
              <h2 id="market-title">Good days start here.</h2>
            </div>
            <p>
              Tours, stays, and little discoveries.
              <br />A collection to make your own.
            </p>
          </div>
          <p className="catalogue-disclosure">
            All listings, prices, and ratings are fictional examples. Stock
            photos are illustrative.
          </p>
          <Filters
            filters={filters}
            destination={search.destination}
            onChange={onFilters}
            onDestination={(destination) =>
              onSearch({ ...search, destination })
            }
            onReset={onReset}
          />
          <div className="results-toolbar">
            <p aria-live="polite">
              {loading ? (
                "Loading possibilities…"
              ) : error ? (
                "Catalogue unavailable"
              ) : (
                <>
                  <strong>{visible.length}</strong>{" "}
                  {visible.length === 1 ? "possibility" : "possibilities"}
                  {search.destination
                    ? ` in ${search.destination}`
                    : " to explore"}
                </>
              )}
            </p>
            <label>
              Sort by{" "}
              <select
                value={sort}
                onChange={(e) => onSort(e.target.value as SortOrder)}
              >
                <option value="featured">Our picks</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
                <option value="rating">Highest demo rating</option>
              </select>
            </label>
          </div>
          <p className="price-explainer">
            Filters use the advertised base price: per person for
            tours/experiences, per night for stays. Not a trip total.
          </p>
          {loading ? (
            <div className="empty-state" role="status">
              Gathering a little inspiration…
            </div>
          ) : error ? (
            <div className="empty-state" role="alert">
              <h3>We couldn’t load the catalogue.</h3>
              <p>Please try again. Your filters are still here.</p>
              <button className="button primary" onClick={onRetry}>
                Try again
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="empty-state">
              <h3>A little too specific?</h3>
              <p>
                Try another destination or give your filters a little more room.
              </p>
              <button className="button primary" onClick={onReset}>
                Show all possibilities
              </button>
            </div>
          ) : (
            <div className="listing-grid">
              {visible.map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          )}
        </div>
      </section>
      <SocialProof />
      <WhyChivaGo
        onExplore={() =>
          document
            .getElementById("marketplace")
            ?.scrollIntoView({ behavior: sectionScrollBehavior(), block: "start" })
        }
      />
      <Newsletter />
    </div>
  );
}
