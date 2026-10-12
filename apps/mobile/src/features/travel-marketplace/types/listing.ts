export type Category = "tour" | "stay" | "experience";
export interface ListingImage {
  src: string;
  alt: string;
  creditId: string;
}
export interface Review {
  id: string;
  name: string;
  rating: number;
  text: string;
}
export interface Listing {
  id: string;
  title: string;
  location: string;
  category: Category;
  price: number;
  currency: "THB";
  priceUnit: "person" | "night";
  rating: number;
  reviewCount: number;
  duration: string;
  durationHours: number;
  images: ListingImage[];
  description: string;
  tags: string[];
  featuredOrder: number;
  reviews: Review[];
}
