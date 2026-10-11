import Icon from "../Icon";
export default function WhyChivaGo({ onExplore }: { onExplore: () => void }) {
  return (
    <section
      className="why-section"
      id="why-chivago"
      aria-labelledby="why-title"
    >
      <div className="container why-grid">
        <div className="why-intro">
          <span className="why-emblem" aria-hidden="true">
            <Icon name="leaf" size={48} />
          </span>
          <p className="eyebrow">WHY EXPLORE WITH CHIVAGO?</p>
          <h2 id="why-title">
            Good for your trip.
            <br />
            <em>Better for your pace.</em>
          </h2>
          <p>
            Travel doesn’t have to be a race. Make room for the places, people,
            and small moments that make a journey yours.
          </p>
          <button className="button lime-button" onClick={onExplore}>
            Find your kind of good <Icon name="arrow" size={18} />
          </button>
          <small>Explore fictional examples. No booking commitment.</small>
        </div>
        <div className="why-benefits">
          <article>
            <span>01</span>
            <div>
              <h3>Room to slow down</h3>
              <p>
                Explore a collection built around quiet stays, gentle
                adventures, and space between the plans.
              </p>
            </div>
          </article>
          <article>
            <span>02</span>
            <div>
              <h3>Find what feels like you</h3>
              <p>
                Clear prices, duration, and simple filters help you find the
                right kind of day without the overwhelm.
              </p>
            </div>
          </article>
          <article>
            <span>03</span>
            <div>
              <h3>Clarity, not pressure</h3>
              <p>
                This prototype labels every example and makes no promises about
                live availability, verification, or reservations.
              </p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
