import React from "react";
import { Image, View, useWindowDimensions } from "react-native";
import Svg, { Path } from "react-native-svg";
import { travelImage } from "./images.ts";
import type { ListingImage } from "./types/listing.ts";
import type { TravelViewport } from "./viewport.ts";

/** Original, secular lotus/leaf linework. Decoration never sits behind text. */
export function ThaiLine({ large = false }: { large?: boolean }) {
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ opacity: large ? 0.6 : 0.28, alignItems: "center" }}
    >
      <Svg
        width={large ? 180 : 120}
        height={large ? 92 : 32}
        viewBox="0 0 180 80"
      >
        <Path
          d="M10 64 Q45 45 72 64 M108 64 Q140 45 170 64 M90 64 C62 50 67 24 90 8 C113 24 118 50 90 64 Z M90 64 C56 64 43 42 45 27 C70 29 85 41 90 64 M90 64 C124 64 137 42 135 27 C110 29 95 41 90 64 M34 72 Q90 60 146 72"
          fill="none"
          stroke="#9b701c"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

/** Reserve the image box immediately, fetch only as it approaches the viewport. */
export function LazyPhoto({
  photo,
  viewport,
}: {
  photo: ListingImage;
  viewport: TravelViewport;
}) {
  const ref = React.useRef<View>(null);
  const [visible, setVisible] = React.useState(false);
  const { height } = useWindowDimensions();
  React.useEffect(() => {
    if (visible) return;
    const check = () =>
      ref.current?.measureInWindow((_x, y, _w, h) => {
        if (y < height + 300 && y + h > -300) setVisible(true);
      });
    const stop = viewport.subscribe(check);
    viewport.check();
    return stop;
  }, [height, viewport, visible]);
  return (
    <View
      ref={ref}
      onLayout={viewport.check}
      testID="browse-photo"
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#e9e6dd",
        overflow: "hidden",
      }}
    >
      {visible ? (
        <Image
          source={travelImage(photo)}
          accessibilityLabel={photo.alt}
          style={{ width: "100%", height: "100%" }}
        />
      ) : (
        <View style={{ flex: 1, justifyContent: "center" }}>
          <ThaiLine />
        </View>
      )}
    </View>
  );
}
