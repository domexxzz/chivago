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
import { useReduceMotion } from './reduce-motion.ts';

const inBrowser = Platform.OS === 'web'
  && typeof document !== 'undefined'
  && typeof window !== 'undefined';

/**
 * Which of the two builds this machine should be sent.
 *
 * 771 KB against 7.4 MB, and the big one is worth every byte on a screen
 * somebody is presenting from - it is the build with eyes. It is not worth
 * seven megabytes on a phone on island mobile data, where the room is small,
 * the detail is invisible, and the download is the whole experience.
 *
 * POINTER, NOT WIDTH. A narrow window on a laptop is still a laptop, and the
 * pitch demo is viewed in a phone-shaped frame on exactly such a machine - a
 * width test would have sent that screen the small build, which is the one
 * case this choice exists to get right. `(pointer: fine)` asks the question
 * that actually matters: is there a mouse on the other end of this.
 *
 * Data Saver overrides it either way. Somebody who has asked their browser
 * to spend less has asked us too.
 */
function wantsDetail(): boolean {
  if (!inBrowser) return false;
  const connection = (navigator as { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return false;
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: fine)').matches;
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
          onTap={onTap}
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
