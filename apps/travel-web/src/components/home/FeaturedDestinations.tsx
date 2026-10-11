import { MOCK_DESTINATIONS } from "../../data/mockData";
import Icon from "../Icon";
export default function FeaturedDestinations({
  onChoose,
}: {
  onChoose: (name: string) => void;
}) {
  return (
    <section
      className="section container"
      id="destinations"
      aria-labelledby="destinations-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">A PLACE TO BEGIN</p>
          <h2 id="destinations-title">Where will you find your rhythm?</h2>
        </div>
        <p>
          From island mornings to mountain moments.
          <br />
          Let somewhere new feel a little like you.
        </p>
      </div>
      <div className="destinations-grid">
        {MOCK_DESTINATIONS.map((d, i) => (
          <button
            className="destination-card"
            key={d.name}
            onClick={() => onChoose(d.name)}
            aria-label={`Explore ${d.name}`}
          >
            <img
              src={d.image.src}
              alt={d.image.alt}
              width="700"
              height="800"
              loading="lazy"
            />
            <span className="destination-number">0{i + 1}</span>
            <span className="destination-copy">
              <strong>{d.name}</strong>
              <span>{d.caption}</span>
            </span>
            <span className="destination-arrow">
              <Icon name="arrow" />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
