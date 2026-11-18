/**
 * Interactive presentation for the original ChivaGo Explorer illustrations.
 *
 * The supplied PNGs are transparent but flattened: they contain no separate
 * eyelids, head, arm, ear, tongue or tail layers. This renderer therefore
 * never pretends to bend those missing parts. It animates each complete
 * illustration independently with compositor-friendly transforms and exposes
 * the final state names a future Rive rig will use. Replacing this fallback
 * with a `.riv` state machine will not require changing the Backpack events.
 */

import React from 'react';
import {
  Animated, Easing, Image, Platform, Pressable, View,
} from 'react-native';

import explorerArt from '../../assets/backpack/backpack-explorer-v2.png';
import dogArt from '../../assets/backpack/backpack-dog-v2.png';
import { useReduceMotion } from './reduce-motion.ts';
import {
  claimTravelReward, subscribeTravelReward, travelRewardSnapshot,
} from '../state/travel-companion-events.ts';
import { t } from '../i18n/locale.ts';

export type BoyAnimationState =
  | 'idle' | 'blink' | 'wave' | 'thumbs_up' | 'happy' | 'surprised' | 'celebrate';
export type DogAnimationState =
  | 'idle' | 'blink' | 'ear_flop' | 'tail_wag' | 'tongue' | 'head_tilt' | 'sit' | 'jump' | 'happy';

const NATIVE_DRIVER = Platform.OS !== 'web';
const INTERACTION_COOLDOWN_MS = 900;
const PERFORMANCE_STATE_MS = 900;

type MotionValues = {
  y: Animated.Value;
  rotate: Animated.Value;
  scale: Animated.Value;
};

function motionValues(): MotionValues {
  return {
    y: new Animated.Value(0),
    rotate: new Animated.Value(0),
    scale: new Animated.Value(1),
  };
}

function resetMotion(values: MotionValues): void {
  values.y.setValue(0);
  values.rotate.setValue(0);
  values.scale.setValue(1);
}

function timing(value: Animated.Value, toValue: number, duration: number) {
  return Animated.timing(value, {
    toValue,
    duration,
    easing: Easing.inOut(Easing.quad),
    useNativeDriver: NATIVE_DRIVER,
  });
}

function boyPerformance(state: BoyAnimationState, v: MotionValues): Animated.CompositeAnimation {
  if (state === 'celebrate') {
    return Animated.parallel([
      Animated.sequence([timing(v.y, -13, 170), timing(v.y, 0, 230), timing(v.y, -7, 130), timing(v.y, 0, 190)]),
      Animated.sequence([timing(v.rotate, -4, 150), timing(v.rotate, 5, 170), timing(v.rotate, 0, 250)]),
      Animated.sequence([timing(v.scale, 1.07, 170), timing(v.scale, 1, 260)]),
    ]);
  }
  if (state === 'happy' || state === 'thumbs_up') {
    return Animated.parallel([
      Animated.sequence([timing(v.y, -8, 150), timing(v.y, 0, 190), timing(v.y, -4, 120), timing(v.y, 0, 160)]),
      Animated.sequence([timing(v.scale, 1.045, 160), timing(v.scale, 1, 220)]),
    ]);
  }
  if (state === 'surprised') {
    return Animated.sequence([timing(v.scale, 1.07, 110), Animated.delay(180), timing(v.scale, 1, 240)]);
  }
  // The original pose already carries a raised thumb. With no arm layer, a
  // friendly whole-body sway is the honest fallback for the requested wave.
  return Animated.parallel([
    Animated.sequence([
      timing(v.rotate, -4, 120), timing(v.rotate, 5, 130), timing(v.rotate, -4, 130),
      timing(v.rotate, 4, 130), timing(v.rotate, 0, 190),
    ]),
    Animated.sequence([timing(v.y, -4, 170), timing(v.y, 0, 260)]),
  ]);
}

function dogPerformance(state: DogAnimationState, v: MotionValues): Animated.CompositeAnimation {
  if (state === 'jump' || state === 'happy') {
    return Animated.parallel([
      Animated.sequence([timing(v.y, -14, 150), timing(v.y, 0, 230), timing(v.y, -6, 120), timing(v.y, 0, 170)]),
      Animated.sequence([timing(v.scale, 1.06, 150), timing(v.scale, 1, 250)]),
      Animated.sequence([timing(v.rotate, -4, 150), timing(v.rotate, 4, 150), timing(v.rotate, 0, 220)]),
    ]);
  }
  if (state === 'tail_wag' || state === 'ear_flop') {
    return Animated.sequence([
      timing(v.rotate, -5, 105), timing(v.rotate, 5, 105), timing(v.rotate, -4, 105),
      timing(v.rotate, 4, 105), timing(v.rotate, 0, 170),
    ]);
  }
  if (state === 'sit') {
    return Animated.sequence([timing(v.y, 5, 170), Animated.delay(180), timing(v.y, 0, 220)]);
  }
  // Head and body are one bitmap, so this is deliberately a whole-character
  // inquisitive tilt rather than a fake independently rigged neck.
  return Animated.sequence([
    timing(v.rotate, -9, 180), Animated.delay(230), timing(v.rotate, 5, 160), timing(v.rotate, 0, 230),
  ]);
}

function useIdleLoop(still: boolean, duration: number, height: number) {
  const value = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (still) { value.setValue(0); return undefined; }
    const loop = Animated.loop(Animated.timing(value, {
      toValue: 1,
      duration,
      easing: Easing.linear,
      useNativeDriver: NATIVE_DRIVER,
    }));
    loop.start();
    return () => loop.stop();
  }, [duration, still, value]);
  return {
    translateY: value.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -height, 0] }),
    scaleY: value.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.012, 1] }),
  };
}

export const InteractiveTravelDuo = React.memo(function InteractiveTravelDuo({
  compact,
  petSignal,
  mascotSignal,
}: {
  compact: boolean;
  /** Real collection keys. A changed key is what makes the dog happy. */
  petSignal: string | null;
  /** Real passport evidence. A changed mascot makes the explorer celebrate. */
  mascotSignal: string | null;
}) {
  const still = useReduceMotion();
  const boy = React.useRef<MotionValues>(motionValues()).current;
  const dog = React.useRef<MotionValues>(motionValues()).current;
  const boyIdle = useIdleLoop(still, 3_400, 3);
  const dogIdle = useIdleLoop(still, 2_600, 2);
  const [boyState, setBoyState] = React.useState<BoyAnimationState>('idle');
  const [dogState, setDogState] = React.useState<DogAnimationState>('idle');
  const lastBoyAction = React.useRef(0);
  const lastDogAction = React.useRef(0);
  const boyStateTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const dogStateTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousPet = React.useRef(petSignal);
  const previousMascot = React.useRef(mascotSignal);
  const rewardEvent = React.useSyncExternalStore(
    subscribeTravelReward,
    travelRewardSnapshot,
    travelRewardSnapshot,
  );

  const playBoy = React.useCallback((next: BoyAnimationState, bypassCooldown = false) => {
    if (still) return false;
    const now = Date.now();
    if (!bypassCooldown && now - lastBoyAction.current < INTERACTION_COOLDOWN_MS) return false;
    lastBoyAction.current = now;
    boy.y.stopAnimation(); boy.rotate.stopAnimation(); boy.scale.stopAnimation();
    resetMotion(boy);
    setBoyState(next);
    if (boyStateTimer.current) clearTimeout(boyStateTimer.current);
    boyPerformance(next, boy).start(({ finished }) => {
      if (finished) resetMotion(boy);
    });
    boyStateTimer.current = setTimeout(() => setBoyState('idle'), PERFORMANCE_STATE_MS);
    return true;
  }, [boy, still]);

  const playDog = React.useCallback((next: DogAnimationState, bypassCooldown = false) => {
    if (still) return false;
    const now = Date.now();
    if (!bypassCooldown && now - lastDogAction.current < INTERACTION_COOLDOWN_MS) return false;
    lastDogAction.current = now;
    dog.y.stopAnimation(); dog.rotate.stopAnimation(); dog.scale.stopAnimation();
    resetMotion(dog);
    setDogState(next);
    if (dogStateTimer.current) clearTimeout(dogStateTimer.current);
    dogPerformance(next, dog).start(({ finished }) => {
      if (finished) resetMotion(dog);
    });
    dogStateTimer.current = setTimeout(() => setDogState('idle'), PERFORMANCE_STATE_MS);
    return true;
  }, [dog, still]);

  React.useEffect(() => () => {
    if (boyStateTimer.current) clearTimeout(boyStateTimer.current);
    if (dogStateTimer.current) clearTimeout(dogStateTimer.current);
  }, []);

  React.useEffect(() => {
    if (petSignal === null) return;
    if (previousPet.current === null) { previousPet.current = petSignal; return; }
    if (previousPet.current !== petSignal) {
      previousPet.current = petSignal;
      playDog('happy', true);
    }
  }, [petSignal, playDog]);

  React.useEffect(() => {
    if (mascotSignal === null) return;
    if (previousMascot.current === null) { previousMascot.current = mascotSignal; return; }
    if (previousMascot.current !== mascotSignal) {
      previousMascot.current = mascotSignal;
      playBoy('celebrate', true);
    }
  }, [mascotSignal, playBoy]);

  React.useEffect(() => {
    if (!claimTravelReward(rewardEvent)) return undefined;
    playBoy('celebrate', true);
    const dogDelay = setTimeout(() => playDog('happy', true), still ? 0 : 120);
    return () => clearTimeout(dogDelay);
  }, [playBoy, playDog, rewardEvent, still]);

  const boyTransform = [
    { translateY: boyIdle.translateY },
    { translateY: boy.y },
    { rotate: boy.rotate.interpolate({ inputRange: [-10, 10], outputRange: ['-10deg', '10deg'] }) },
    { scaleY: boyIdle.scaleY },
    { scale: boy.scale },
  ];
  const dogTransform = [
    { translateY: dogIdle.translateY },
    { translateY: dog.y },
    { rotate: dog.rotate.interpolate({ inputRange: [-10, 10], outputRange: ['-10deg', '10deg'] }) },
    { scaleY: dogIdle.scaleY },
    { scale: dog.scale },
  ];

  return (
    <View
      style={{
        pointerEvents: 'box-none',
        position: 'absolute', left: compact ? -4 : -12, bottom: compact ? -10 : -19,
        width: compact ? '47%' : '53%', height: compact ? 202 : 276, zIndex: 2,
      }}
    >
      <Pressable
        testID="travel-explorer"
        accessibilityRole="button"
        accessibilityLabel={t({ en: 'Greet the ChivaGo Explorer', th: 'ทักทายนักสำรวจ ChivaGo', zh: '向 ChivaGo 探险家打招呼' })}
        accessibilityHint={t({ en: 'Plays a greeting animation', th: 'เล่นแอนิเมชันทักทาย', zh: '播放问候动画' })}
        accessibilityState={{ busy: boyState !== 'idle' }}
        onPress={() => playBoy('wave')}
        style={{ position: 'absolute', left: 0, bottom: 0, width: '68%', height: '100%' }}
      >
        <Animated.View style={{ flex: 1, transformOrigin: 'bottom center', transform: boyTransform }}>
          <Image source={explorerArt} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
        </Animated.View>
      </Pressable>
      <Pressable
        testID="travel-dog"
        accessibilityRole="button"
        accessibilityLabel={t({ en: 'Play with the ChivaGo Explorer Dog', th: 'เล่นกับสุนัขนักสำรวจ ChivaGo', zh: '和 ChivaGo 探险犬玩耍' })}
        accessibilityHint={t({ en: 'Plays an inquisitive animation', th: 'เล่นแอนิเมชันเอียงตัวอย่างสงสัย', zh: '播放好奇动画' })}
        accessibilityState={{ busy: dogState !== 'idle' }}
        onPress={() => playDog('head_tilt')}
        style={{ position: 'absolute', right: 0, bottom: compact ? 3 : 6, width: '50%', height: '58%' }}
      >
        <Animated.View style={{ flex: 1, transformOrigin: 'bottom center', transform: dogTransform }}>
          <Image source={dogArt} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
        </Animated.View>
      </Pressable>
    </View>
  );
});

