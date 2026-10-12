import type { ImageSourcePropType } from "react-native";
import type { ListingImage } from "./types/listing.ts";
import coast from './assets/coast.webp';
import temple from './assets/temple.webp';
import pool from './assets/pool.webp';
import shore from './assets/shore.webp';
import seaTemple from './assets/sea-temple.webp';
import blueBoat from './assets/blue-boat.webp';

/** Static imports let Metro bundle the same licensed photos on web and native. */
const images: Record<string, ImageSourcePropType> = {
  coast,
  temple,
  pool,
  shore,
  "sea-temple": seaTemple,
  "blue-boat": blueBoat,
};
export function travelImage(photo: ListingImage): ImageSourcePropType {
  // A future adapter can supply absolute image URLs without changing components.
  if (!photo.src.startsWith("/assets/travel-marketplace/"))
    return { uri: photo.src };
  const asset = images[photo.creditId];
  if (!asset) throw new Error(`Unknown travel demo image: ${photo.creditId}`);
  return asset;
}
