import { useState } from "react";
import type { ListingImage } from "../../types/listing";

export default function Gallery({ images }: { images: ListingImage[] }) {
  const [selected, setSelected] = useState(0);
  return (
    <div className="gallery">
      <img
        className="gallery-main"
        src={images[selected].src}
        alt={images[selected].alt}
        width="1400"
        height="934"
        fetchPriority="high"
      />
      <div
        className="gallery-thumbnails"
        role="group"
        aria-label="Choose gallery photo"
      >
        {images.map((image, index) => (
          <button
            key={`${image.creditId}-${index}`}
            aria-label={`Show photo ${index + 1}`}
            aria-pressed={index === selected}
            onClick={() => setSelected(index)}
          >
            <img
              src={image.src}
              alt=""
              width="180"
              height="120"
              loading="lazy"
            />
          </button>
        ))}
      </div>
      <p className="muted">
        Illustrative stock photography, not photos of a real listed business.
      </p>
    </div>
  );
}
