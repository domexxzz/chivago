import type { Category } from "../../types/listing";
import type {
  DurationFilter,
  Filters as FilterValues,
} from "../../types/search";
import { formatPrice } from "../../utils/catalogue";
export default function Filters({
  filters: f,
  destination,
  onChange,
  onDestination,
  onReset,
}: {
  filters: FilterValues;
  destination: string;
  onChange: (value: FilterValues) => void;
  onDestination: (value: string) => void;
  onReset: () => void;
}) {
  const destinations = [
    "Koh Samui",
    "Chiang Mai",
    "Krabi",
    "Phuket",
    "Bangkok",
  ];
  return (
    <div className="filters">
      <label>
        Destination
        <select
          value={destination}
          onChange={(e) => onDestination(e.target.value)}
        >
          {destination && !destinations.includes(destination) ? (
            <option value={destination}>{destination}</option>
          ) : null}
          <option value="">All Thailand</option>
          {destinations.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </label>
      <label>
        Category
        <select
          value={f.category}
          onChange={(e) =>
            onChange({ ...f, category: e.target.value as Category | "all" })
          }
        >
          <option value="all">All kinds of good</option>
          <option value="tour">Tours</option>
          <option value="stay">Stays</option>
          <option value="experience">Experiences</option>
        </select>
      </label>
      <label>
        Maximum base price
        <select
          value={f.maxPrice}
          onChange={(e) => onChange({ ...f, maxPrice: Number(e.target.value) })}
        >
          {[500, 1000, 2000, 3000, 5000].map((price) => (
            <option key={price} value={price}>
              {formatPrice(price)}
              {price === 5000 ? " · Any price" : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        Minimum demo rating
        <select
          value={f.minRating}
          onChange={(e) =>
            onChange({ ...f, minRating: Number(e.target.value) })
          }
        >
          <option value="0">Any rating</option>
          <option value="4.8">4.8 and above</option>
          <option value="4.9">4.9 and above</option>
        </select>
      </label>
      <label>
        Duration
        <select
          value={f.duration}
          onChange={(e) =>
            onChange({ ...f, duration: e.target.value as DurationFilter })
          }
        >
          <option value="all">Any duration</option>
          <option value="short">Up to 4 hours</option>
          <option value="day">Over 4–24 hours</option>
          <option value="long">Over 24 hours</option>
        </select>
      </label>
      <button className="reset-button" onClick={onReset}>
        Reset filters
      </button>
    </div>
  );
}
