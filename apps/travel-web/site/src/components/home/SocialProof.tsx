import { MOCK_TESTIMONIALS } from "../../data/mockData";
import Icon from "../Icon";
export default function SocialProof() {
  return (
    <section
      className="section container social-proof"
      aria-labelledby="social-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">THE MOMENTS THAT STAY</p>
          <h2 id="social-title">Less itinerary. More feeling.</h2>
        </div>
        <p>
          A glimpse of what a slower trip could feel like.
          <br />
          <strong>Fictional testimonials · not real endorsements.</strong>
        </p>
      </div>
      <div className="testimonials-grid">
        {MOCK_TESTIMONIALS.map((testimonial) => (
          <figure className="testimonial" key={testimonial.name}>
            <div
              className="testimonial-stars"
              aria-label={`${testimonial.rating} out of 5, fictional rating`}
            >
              {Array.from({ length: testimonial.rating }, (_, i) => (
                <Icon key={i} name="star" size={14} />
              ))}
              <span>Demo rating</span>
            </div>
            <blockquote>“{testimonial.quote}”</blockquote>
            <figcaption>
              <span className="testimonial-avatar" aria-hidden="true">
                {testimonial.initials}
              </span>
              <span>
                <strong>{testimonial.name} · fictional traveler</strong>
                <small>{testimonial.location}</small>
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="trust-row" aria-label="Prototype safeguards">
        <span>
          <Icon name="leaf" />
          Clearly labeled examples
        </span>
        <span>
          <Icon name="people" />
          No account required
        </span>
        <span>
          <Icon name="star" />
          No payment collected
        </span>
      </div>
    </section>
  );
}
