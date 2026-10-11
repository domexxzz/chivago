import { useState, type FormEvent } from "react";
import { PHOTOS } from "../../data/mockData";
import { searchProblems } from "../../utils/catalogue";
import type { SearchContext } from "../../types/search";
import Icon from "../Icon";

export default function HeroSearch({
  search,
  onSearch,
}: {
  search: SearchContext;
  onSearch: (value: SearchContext) => void;
}) {
  const [draft, setDraft] = useState(search);
  const [problems, setProblems] = useState<string[]>([]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const errors = searchProblems(draft);
    setProblems(errors);
    if (!errors.length) onSearch(draft);
  };
  return (
    <section className="hero" aria-labelledby="hero-title">
      <img
        className="hero-photo"
        src={PHOTOS.coast.src}
        alt={PHOTOS.coast.alt}
        width="1400"
        height="934"
        fetchPriority="high"
      />
      <div className="hero-shade" />
      <div className="hero-content">
        <p className="eyebrow">LESS RUSH. MORE WONDER.</p>
        <h1 id="hero-title">
          A little closer to
          <br />
          <em>somewhere good.</em>
        </h1>
        <p>
          Quiet stays. Meaningful moments. A different way
          <br className="desktop-break" /> to find your Thailand.
        </p>
        <span className="hero-note">
          <Icon name="leaf" size={16} /> Thoughtfully paced, beautifully simple.
        </span>
      </div>
      <span className="photo-caption">
        Thailand, at your own pace · illustrative photo
      </span>
      <div className="search-wrap">
        <form
          className="search-form"
          onSubmit={submit}
          noValidate
          aria-label="Find your Thailand trip"
        >
          <label className="search-destination">
            <span>
              <Icon name="pin" size={16} /> WHERE TO?
            </span>
            <input
              aria-label="Destination"
              list="destinations-list"
              placeholder="Somewhere in Thailand"
              value={draft.destination}
              onChange={(e) =>
                setDraft({ ...draft, destination: e.target.value })
              }
            />
            <datalist id="destinations-list">
              {["Koh Samui", "Chiang Mai", "Krabi", "Phuket", "Bangkok"].map(
                (name) => (
                  <option key={name} value={name} />
                ),
              )}
            </datalist>
          </label>
          <div className="search-dates">
            <label>
              <span>
                <Icon name="calendar" size={16} /> ARRIVAL
              </span>
              <input
                aria-label="Arrival date"
                type="date"
                value={draft.checkIn}
                onChange={(e) =>
                  setDraft({ ...draft, checkIn: e.target.value })
                }
              />
            </label>
            <label>
              <span>DEPARTURE</span>
              <input
                aria-label="Departure date"
                type="date"
                value={draft.checkOut}
                onChange={(e) =>
                  setDraft({ ...draft, checkOut: e.target.value })
                }
              />
            </label>
          </div>
          <label className="search-travelers">
            <span>
              <Icon name="people" size={16} /> TRAVELERS
            </span>
            <input
              aria-label="Travelers"
              type="number"
              min="1"
              max="20"
              step="1"
              value={Number.isNaN(draft.travelers) ? "" : draft.travelers}
              onChange={(e) =>
                setDraft({ ...draft, travelers: e.target.valueAsNumber })
              }
            />
          </label>
          <button className="button primary" type="submit">
            Explore trips <Icon name="arrow" size={18} />
          </button>
          {problems.length ? (
            <div className="search-errors" role="alert">
              {problems.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          ) : null}
        </form>
        <p className="search-footnote">
          No pressure. Just possibilities.{" "}
          <span>Dates are for the demo, not live availability.</span>
        </p>
      </div>
    </section>
  );
}
