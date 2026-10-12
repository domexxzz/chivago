import React from "react";
import {
  Animated,
  Easing,
  Platform,
  View,
  useWindowDimensions,
} from "react-native";
import { useReduceMotion } from "../../components/reduce-motion.ts";

import type { TravelViewport } from "./viewport.ts";
export function Reveal({
  children,
  viewport,
  delay = 0,
}: {
  children: React.ReactNode;
  viewport: TravelViewport;
  delay?: number;
}) {
  const node = React.useRef<View>(null);
  const value = React.useRef(new Animated.Value(1)).current;
  const revealed = React.useRef(false);
  const still = useReduceMotion();
  const { height } = useWindowDimensions();
  React.useEffect(() => {
    if (still) {
      revealed.current = true;
      value.stopAnimation();
      value.setValue(1);
      return;
    }
    const check = () => {
      if (revealed.current) return;
      node.current?.measureInWindow((_x, y, _width, h) => {
        if (y < height && y + h > 0 && !revealed.current) {
          revealed.current = true;
          value.setValue(0);
          Animated.timing(value, {
            toValue: 1,
            duration: 420,
            delay,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: Platform.OS !== "web",
          }).start();
        }
      });
    };
    const unsubscribe = viewport.subscribe(check);
    viewport.check();
    return () => {
      unsubscribe();
      value.stopAnimation();
    };
  }, [still, height, value, viewport, delay]);
  return (
    <Animated.View
      ref={node}
      onLayout={viewport.check}
      style={{
        opacity: value.interpolate({
          inputRange: [0, 1],
          outputRange: [0.45, 1],
        }),
        transform: [
          {
            translateY: value.interpolate({
              inputRange: [0, 1],
              outputRange: [14, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
