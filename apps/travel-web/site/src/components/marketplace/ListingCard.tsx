import type { Listing } from "../../types/listing";
import { categoryLabel, formatPrice } from "../../utils/catalogue";
import Icon from "../Icon";
export default function ListingCard({ listing: l }: { listing: Listing }) {
  return (
    <article className="listing-card">
      <a
        className="listing-link"
        href={`#/listing/${encodeURIComponent(l.id)}`}
        aria-label={`View ${l.title}`}
      >
        <div className="listing-image">
          <img
            src={l.images[0].src}
            alt={l.images[0].alt}
            width="700"
            height="500"
            loading="lazy"
          />
          <span className="category-badge">{categoryLabel[l.category]}</span>
          <span className="example-badge">Fictional listing</span>
        </div>
        <div className="listing-copy">
          <p className="listing-location">
            <Icon name="pin" size={14} />
            {l.location}
          </p>
          <h3>{l.title}</h3>
          <div className="listing-meta">
            <span>
              <Icon name="star" size={14} />
              <strong>{l.rating.toFixed(1)}</strong>{" "}
              <span>({l.reviewCount} demo ratings)</span>
            </span>
            <span>
              <Icon name="clock" size={14} />
              {l.duration}
            </span>
          </div>
          <div className="tags">
            {l.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <div className="listing-bottom">
            <p>
              <span className="price-label">From </span>
              <strong>{formatPrice(l.price)}</strong>
              <span className="price-unit"> / {l.priceUnit}</span>
            </p>
            <span className="card-arrow">
              <Icon name="arrow" size={18} />
            </span>
          </div>
        </div>
      </a>
    </article>
  );
}
