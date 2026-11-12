import React from 'react';
import { ScrollView, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
export interface DetailScrollState { offset: number }
export function useDetailScroll(state?: DetailScrollState, ready = true) {
  const ref = React.useRef<ScrollView>(null);
  const target = React.useRef(state?.offset ?? 0);
  const restored = React.useRef(false);
  return {
    ref, scrollEventThrottle: 32,
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (state && (restored.current || target.current === 0)) state.offset = event.nativeEvent.contentOffset.y;
    },
    onContentSizeChange: (_width: number, height: number) => {
      if (ready && !restored.current && height > target.current) {
        ref.current?.scrollTo({ y: target.current, animated: false });
        restored.current = true;
      }
    },
  };
}
