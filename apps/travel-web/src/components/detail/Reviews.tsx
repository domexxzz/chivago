import type { Listing } from "../../types/listing";
import Icon from "../Icon";
export default function Reviews({ listing }: { listing: Listing }) {
  return (
    <section className="reviews" aria-labelledby="reviews-title">
      <div className="reviews-heading">
        <h2 id="reviews-title">A few imagined moments</h2>
        <span>
          <Icon name="star" size={18} /> {listing.rating.toFixed(1)}{" "}
          <small>({listing.reviewCount} demo ratings)</small>
        </span>
      </div>
      <p className="muted">
        Fictional review excerpts and aggregate ratings for interface
        demonstration only.
      </p>
      {listing.reviews.map((review) => (
        <article className="review" key={review.id}>
          <div className="review-avatar" aria-hidden="true">
            {review.name[0]}
          </div>
          <div>
            <h3>{review.name}</h3>
            <span className="review-rating">
              {review.rating} out of 5 · fictional review
            </span>
            <p>{review.text}</p>
          </div>
        </article>
      ))}
    </section>
  );
}
