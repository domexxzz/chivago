import React from "react";
import { Pressable, View } from "react-native";
import { Body, Heading } from "../../components/Type.tsx";
import { color } from "../../theme/index.ts";
import { PHOTOS } from "./mockData.ts";
import type { Listing } from "./types/listing.ts";
import type { TravelViewport } from "./viewport.ts";
import { LazyPhoto, ThaiLine } from "./BrowseDecor.tsx";
import { Reveal } from "./Motion.tsx";

// Presentation only. Availability of a quick-pick comes from the existing records.
// Safe, non-sacred stock photos stay explicitly illustrative; Ayutthaya has no record.
const DESTINATIONS = [
  { name: "Bangkok", photo: PHOTOS.pool },
  { name: "Chiang Mai", photo: PHOTOS.pool },
  { name: "Phuket", photo: PHOTOS.blueBoat },
  { name: "Krabi", photo: PHOTOS.shore },
  { name: "Ayutthaya", photo: null },
  { name: "Koh Samui", photo: PHOTOS.coast },
] as const;

export function DestinationStrip({
  items,
  onSelect,
  viewport,
}: {
  items: Listing[];
  onSelect: (name: string) => void;
  viewport: TravelViewport;
}) {
  return (
    <View style={{ marginTop: 32, gap: 16 }}>
      <Heading size={24}>Find your rhythm</Heading>
      <Body>From city mornings to island afternoons.</Body>
      <View
        testID="travel-destinations"
        style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}
      >
        {DESTINATIONS.map(({ name, photo }, index) => {
          const available = items.some((item) => item.location === name);
          const content = (
            <>
              <View
                style={{
                  height: 104,
                  backgroundColor: "#f5eedb",
                  justifyContent: "center",
                }}
              >
                {photo ? (
                  <LazyPhoto photo={photo} viewport={viewport} />
                ) : (
                  <ThaiLine large />
                )}
              </View>
              <View style={{ padding: 12, gap: 4 }}>
                <Heading size={16}>{name}</Heading>
                <Body style={{ fontSize: 12 }}>
                  {available ? "Illustrative photo" : "Inspiration only"}
                </Body>
              </View>
            </>
          );
          return (
            <View
              key={name}
              testID="browse-destination-tile"
              style={{ flexBasis: "45%", flexGrow: 1, minWidth: 0 }}
            >
              <Reveal viewport={viewport} delay={index * 60}>
                {available ? (
                  <Pressable
                    testID="browse-destination-link"
                    accessibilityRole="button"
                    accessibilityLabel={`Demo destination: ${name}`}
                    onPress={() => onSelect(name)}
                    style={{
                      overflow: "hidden",
                      borderRadius: 16,
                      backgroundColor: "#fff",
                      borderWidth: 1,
                      borderColor: "#e5e1d7",
                    }}
                  >
                    {content}
                  </Pressable>
                ) : (
                  <View
                    accessibilityLabel={`${name}: decorative inspiration, no demo listings`}
                    style={{
                      overflow: "hidden",
                      borderRadius: 16,
                      backgroundColor: "#fff",
                      borderWidth: 1,
                      borderColor: color.neutral300,
                    }}
                  >
                    {content}
                  </View>
                )}
              </Reveal>
            </View>
          );
        })}
      </View>
    </View>
  );
}
