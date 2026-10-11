import { useEffect, useState } from "react";
import { getListings } from "./services/listings";
import { parseRoute } from "./utils/route";
import type { Listing } from "./types/listing";
import {
  DEFAULT_FILTERS,
  DEFAULT_SEARCH,
  type SearchContext,
  type SortOrder,
} from "./types/search";
import Header from "./components/layout/Header";
import HomePage from "./pages/HomePage";

export default function App() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [hash, setHash] = useState(window.location.hash);
  const [search, setSearch] = useState({ ...DEFAULT_SEARCH });
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
  const [sort, setSort] = useState<SortOrder>("featured");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    getListings()
      .then((items) => {
        if (active) setListings(items);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const route = parseRoute(hash);
  const section = (id: string) => {
    if (route.kind !== "home") window.location.hash = "/";
    requestAnimationFrame(() =>
      document
        .getElementById(id)
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };
  const applySearch = (value: SearchContext) => {
    setSearch(value);
    section("marketplace");
  };
  const reset = () => {
    setSearch({ ...DEFAULT_SEARCH });
    setFilters({ ...DEFAULT_FILTERS });
    setSort("featured");
  };
  return (
    <>
      <Header onSection={section} />
      <main id="main-content" tabIndex={-1}>
        {route.kind === "home" ? (
          <HomePage
            listings={listings}
            loading={loading}
            error={error}
            search={search}
            filters={filters}
            sort={sort}
            onSearch={applySearch}
            onFilters={setFilters}
            onSort={setSort}
            onReset={reset}
            onRetry={() => setReload(reload + 1)}
          />
        ) : (
          <div className="container section empty-state">
            <h1>Details are coming next.</h1>
            <p>This fictional listing cannot be booked.</p>
            <a className="button primary" href="#/">
              Back to exploring
            </a>
          </div>
        )}
      </main>
    </>
  );
}
