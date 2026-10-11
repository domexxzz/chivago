import { useEffect, useRef, useState } from "react";
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
import ListingDetailPage from "./pages/ListingDetailPage";
import NotFoundPage from "./pages/NotFoundPage";
import Footer from "./components/layout/Footer";

export default function App() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [hash, setHash] = useState(window.location.hash);
  const [search, setSearch] = useState({ ...DEFAULT_SEARCH });
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
  const [sort, setSort] = useState<SortOrder>("featured");
  const homeScroll = useRef(0);
  const pendingSection = useRef<string | null>(null);
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
    const update = () => {
      if (parseRoute(hash).kind === "home") homeScroll.current = window.scrollY;
      setHash(window.location.hash);
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, [hash]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (pendingSection.current) {
        document
          .getElementById(pendingSection.current)
          ?.scrollIntoView({ behavior: "instant", block: "start" });
        pendingSection.current = null;
      } else {
        window.scrollTo({
          top: parseRoute(hash).kind === "home" ? homeScroll.current : 0,
          behavior: "instant",
        });
      }
      document.getElementById("main-content")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [hash]);
  const route = parseRoute(hash);
  const section = (id: string) => {
    if (route.kind !== "home") {
      pendingSection.current = id;
      window.location.hash = "/";
      return;
    }
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
        ) : route.kind === "listing" ? (
          <ListingDetailPage key={route.id} id={route.id} search={search} />
        ) : (
          <NotFoundPage />
        )}
      </main>
      <Footer onSection={section} />
    </>
  );
}
