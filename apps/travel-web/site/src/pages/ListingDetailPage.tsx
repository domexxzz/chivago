import { useEffect, useState } from "react";
import { getListing } from "../services/listings";
import type { Listing } from "../types/listing";
import type { SearchContext } from "../types/search";
import { categoryLabel, formatPrice } from "../utils/catalogue";
import Gallery from "../components/detail/Gallery";
import Reviews from "../components/detail/Reviews";
import DemoBookingDialog from "../components/detail/DemoBookingDialog";
import Icon from "../components/Icon";
import NotFoundPage from "./NotFoundPage";

export default function ListingDetailPage({
  id,
  search,
}: {
  id: string;
  search: SearchContext;
}) {
  const [listing, setListing] = useState<Listing>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [booking, setBooking] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    getListing(id)
      .then((value) => {
        if (active) setListing(value);
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
  }, [id, retry]);
  useEffect(() => {
    if (!listing) return;
    document.title = `${listing.title} — ChivaGo demo`;
    return () => {
      document.title = "ChivaGo — A little closer to somewhere good";
    };
  }, [listing]);
  if (loading)
    return (
      <div className="container section empty-state" role="status">
        Opening your little escape…
      </div>
    );
  if (error)
    return (
      <div className="container section empty-state" role="alert">
        <h1>We couldn’t load this listing.</h1>
        <button className="button primary" onClick={() => setRetry(retry + 1)}>
          Try again
        </button>
        <a href="#/">Back to exploring</a>
      </div>
    );
  if (!listing) return <NotFoundPage />;
  return (
    <div className="detail-page container">
      <a className="back-link" href="#/">
        ← Back to exploring
      </a>
      <div className="detail-heading">
        <p className="eyebrow">
          {categoryLabel[listing.category]} · {listing.location}
        </p>
        <h1>{listing.title}</h1>
        <div className="detail-meta">
          <span>
            <Icon name="star" size={16} />
            {listing.rating.toFixed(1)} · {listing.reviewCount} demo ratings
          </span>
          <span>
            <Icon name="clock" size={16} />
            {listing.duration}
          </span>
          <span className="detail-example">Example · not a real business</span>
        </div>
      </div>
      <div className="detail-columns">
        <div>
          <Gallery images={listing.images} />
          <section className="detail-about" aria-labelledby="about-listing">
            <p className="eyebrow">A DIFFERENT KIND OF DAY</p>
            <h2 id="about-listing">A little more about your escape</h2>
            <p>{listing.description}</p>
            <div className="tags">
              {listing.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <p className="muted">
              Everything here is fictional: the operator, price, duration,
              reviews, and itinerary. There are no real inclusions or
              availability.
            </p>
          </section>
          <Reviews listing={listing} />
        </div>
        <aside className="booking-panel" aria-label="Demo booking">
          <p className="eyebrow">MAKE ROOM FOR SOMETHING GOOD</p>
          <p className="detail-price">
            <span>From</span> <strong>{formatPrice(listing.price)}</strong>{" "}
            <small>/ {listing.priceUnit}</small>
          </p>
          <p className="muted">Example base price, not a trip total.</p>
          <div className="booking-context">
            <p>
              <Icon name="calendar" size={17} />
              {search.checkIn
                ? `${search.checkIn} → ${search.checkOut}`
                : "Dates not selected"}
            </p>
            <p>
              <Icon name="people" size={17} />
              {search.travelers}{" "}
              {search.travelers === 1 ? "traveler" : "travelers"}
            </p>
          </div>
          <button className="button primary" onClick={() => setBooking(true)}>
            Book now — demo <Icon name="arrow" size={18} />
          </button>
          <p className="booking-boundary">
            Demo only. Nothing will be reserved or charged.
          </p>
          <div className="booking-assurance">
            <Icon name="leaf" size={18} />
            <span>
              No payment details.
              <br />
              No account needed for this demo.
            </span>
          </div>
        </aside>
      </div>
      {booking ? (
        <DemoBookingDialog
          listing={listing}
          search={search}
          onClose={() => setBooking(false)}
        />
      ) : null}
    </div>
  );
}
