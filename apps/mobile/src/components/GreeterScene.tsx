/**
 * The island's greeter, in whichever dimension this platform can draw it.
 *
 * On a phone, and in the node harness: the painted portrait, breathing. On the
 * web: the same character as a live model, fetched after the screen has been
 * painted, dropped in over the portrait when it arrives.
 *
 * THE PORTRAIT IS NOT A PLACEHOLDER, and this is the same decision
 * `CreatureScene` writes up at length: the thing to put in the space where
 * the mascot goes is the mascot. A spinner, a grey box or an empty frame all
 * say "something is loading" to a developer and "broken" to everyone else,
 * and the first open - the one at a pitch, on a projector, on hotel wifi - is
 * the open where that matters most. The portrait is a render of the very same
 * model, so the swap changes the dimension and not the character.
 *
 * `import()` from an effect behind two animation frames, not `React.lazy`:
 * lazy starts its import during render and suspends the first commit, which
 * puts the screen's first paint behind ~700 KB of three.js and a megabyte of
 * mascot. The first frame fires before the paint that follows this commit,
 * the second after it - which is how you say AFTER THE BROWSER HAS ACTUALLY
 * PAINTED in a language that has no such event.
 */

import React from 'react';
import { Image, Platform, View, useWindowDimensions } from 'react-native';
import type { Greeter } from '@chivago/core';
import { photoUri } from '../api/photos.ts';
import { GreeterIdle } from './GreeterIdle.tsx';
import { wantsDetailedBuild } from './greeter3d/build-choice.ts';
import { useReduceMotion } from './reduce-motion.ts';

const inBrowser = Platform.OS === 'web'
  && typeof document !== 'undefined'
  && typeof window !== 'undefined';

/**
 * Which of the two builds this machine should be sent: 771 KB of vertex
 * colour, or 7.4 MB with the textures - the build with eyes. The rule, and why
 * a mouse OR a tablet-sized screen earns the big one, is in `build-choice.ts`.
 */
function wantsDetail(): boolean {
  if (!inBrowser) return false;
  const connection = (navigator as { connection?: { saveData?: boolean } }).connection;
  const screen = window.screen;
  return wantsDetailedBuild({
    pointerFine: typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: fine)').matches,
    saveData: !!connection?.saveData,
    screenShortSidePx: screen ? Math.min(screen.width, screen.height) : Number.NaN,
  });
}

type RoomComponent = typeof import('./greeter3d/Greeter3D.tsx')['Greeter3D'];

function useRoom(wanted: boolean): RoomComponent | null {
  const [room, setRoom] = React.useState<RoomComponent | null>(null);
  React.useEffect(() => {
    if (!wanted || !inBrowser) return undefined;
    let alive = true;
    const outer = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        import('./greeter3d/Greeter3D.tsx')
          // A room that never arrives is not an error worth showing anybody.
          .then((m) => { if (alive) setRoom(() => m.Greeter3D); })
          .catch(() => {});
      });
    });
    return () => { alive = false; cancelAnimationFrame(outer); };
  }, [wanted]);
  return room;
}

export function GreeterScene({
  greeter, label, height: fixedHeight, onTap, onLive,
}: {
  greeter: Greeter;
  /** Spoken name of what is on screen, e.g. "ChangChang, a travelling squirrel". */
  label: string;
  /** Override the measured height, for a card that has its own idea of one. */
  height?: number;
  onTap?: () => void;
  /**
   * Called when the live model arrives, and again if it never does.
   *
   * The card above wants to invite a tap, and only something that answers a
   * tap deserves the invitation - the painted portrait does not. This is the
   * only place that knows which of the two is on screen.
   */
  onLive?: (live: boolean) => void;
}) {
  const { width } = useWindowDimensions();
  const still = useReduceMotion();
  const Room = useRoom(inBrowser);

  /*
    ChangChang's voice, which plays ONLY on a tap and only when the tap
    started the greeting - not when it jumps, not when it dances, and never
    when the card first appears and greets by itself. Sound nobody asked for
    on a home screen is the kind of thing people close an app over, and a
    browser would refuse to play it unprompted anyway.

    One audio element, reused: a fresh one per tap stacks half a dozen
    ChangChangs talking over each other if somebody taps quickly.
  */
  const voice = React.useRef<HTMLAudioElement | null>(null);
  const speak = React.useCallback((clip: string) => {
    if (!inBrowser || clip !== 'greet' || still || !greeter.voice) return;
    if (!voice.current) {
      voice.current = new Audio(photoUri(greeter.voice));
      voice.current.preload = 'none';
    }
    voice.current.currentTime = 0;
    // A refusal is not worth a word: autoplay policy, a missing file and a
    // muted device all land here, and none of them is the traveller's
    // problem or something the card can do anything about.
    voice.current.play().catch(() => {});
  }, [greeter.voice, still]);

  React.useEffect(() => () => { voice.current?.pause(); voice.current = null; }, []);
  React.useEffect(() => { onLive?.(Room !== null && !still); }, [Room, still, onLive]);

  // Taller on a wide screen, where there is room; a phone gets close to square.
  const height = fixedHeight ?? Math.round(Math.min(340, Math.max(230, width * 0.58)));

  if (Room) {
    return (
      <View style={{ height, justifyContent: 'center' }}>
        <Room
          greeter={greeter}
          modelUri={photoUri(wantsDetail() ? greeter.modelDetailed : greeter.model)}
          height={height}
          label={label}
          still={still}
          onTap={(clip) => { speak(clip); onTap?.(); }}
        />
      </View>
    );
  }

  return (
    <View style={{ height, alignItems: 'center', justifyContent: 'flex-end' }}>
      {/*
        The same idle the header mark runs, at full strength: this one has a
        card to itself and nothing beside it to disturb.
      */}
      <GreeterIdle>
        <Image
          source={{ uri: photoUri(greeter.portrait) }}
          // The render is 626 x 760 with its alpha trimmed to the character,
          // so the box is the character and `contain` cannot letterbox it.
          style={{ width: Math.round(height * 0.83), height, resizeMode: 'contain' }}
          accessibilityLabel={label}
          accessible
        />
      </GreeterIdle>
    </View>
  );
}
