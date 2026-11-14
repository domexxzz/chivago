/**
 * Chivar Bot, in whichever dimension this platform can draw him.
 *
 * On a phone and in the node test harness: the drawn `ChivarBot` SVG. On the
 * web: the same robot as a live 3D model you can turn round, fetched after the
 * screen has painted and laid over the drawing when its first frame is up.
 *
 * The drawing is not a placeholder - it is him, in the same moods - so the
 * swap changes the dimension and not the character, and a machine with no
 * WebGL simply keeps the drawing. Same arrangement as `GreeterScene`, for the
 * reasons written up there: two animation frames, then `import()`, so the
 * first paint never waits behind three.js.
 */

import React from 'react';
import { Platform, View } from 'react-native';
import { ChivarBot, type BotMood } from './ChivarBot.tsx';
import { useReduceMotion } from './reduce-motion.ts';

const inBrowser = Platform.OS === 'web'
  && typeof document !== 'undefined'
  && typeof window !== 'undefined';

type Model = typeof import('./chivarbot3d/ChivarBot3D.tsx')['ChivarBot3D'];

function useModel(): Model | null {
  const [model, setModel] = React.useState<Model | null>(null);
  React.useEffect(() => {
    if (!inBrowser) return undefined;
    let alive = true;
    const outer = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        import('./chivarbot3d/ChivarBot3D.tsx')
          .then((m) => { if (alive) setModel(() => m.ChivarBot3D); })
          // A model that never arrives leaves the drawing - not an error.
          .catch(() => {});
      });
    });
    return () => { alive = false; cancelAnimationFrame(outer); };
  }, []);
  return model;
}

export function ChivarBotScene({
  mood = 'idle', waving = false, width, height, label,
}: {
  mood?: BotMood;
  waving?: boolean;
  width: number;
  height: number;
  label: string;
}) {
  const still = useReduceMotion();
  const Model = useModel();
  const [live, setLive] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const onReady = React.useCallback(() => setLive(true), []);
  const onFail = React.useCallback(() => setFailed(true), []);

  return (
    <View style={{ width, height }} accessible accessibilityLabel={label}>
      {!live ? (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <ChivarBot size={Math.min(width, height)} mood={mood} waving={waving} />
        </View>
      ) : null}
      {Model && !failed ? (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: live ? 1 : 0 }}>
          <Model mood={mood} waving={waving} height={height} label={label} still={still} onReady={onReady} onFail={onFail} />
        </View>
      ) : null}
    </View>
  );
}
