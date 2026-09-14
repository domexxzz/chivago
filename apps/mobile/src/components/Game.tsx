/**
 * The game layer's surface, as five components.
 *
 * `packages/tokens` carries the argument: this app draws a line between the
 * EVIDENCE layer, where a number is a claim about the world, and the GAME
 * layer of levels, companions, medals and travelling together. The line was
 * already drawn in colour — green means a host verified it, gold is the game —
 * and was never drawn in surface, so a mascot's room and an SOS banner were
 * built out of the same flat rectangle.
 *
 * One of those should look like an object you can pick up. The other should
 * not, and `game-surface.test.ts` fails the build if these reach a screen
 * where they are forbidden.
 *
 * WHAT ACTUALLY MAKES IT LOOK LIKE A GAME, since it is less than people think:
 *
 *   a thick opaque edge under every control, so it reads as resting on the
 *   page rather than printed on it;
 *   a shadow deep enough to see;
 *   a scene behind the content instead of a flat fill;
 *   round numerals in a medallion rather than digits in a box.
 *
 * None of it is new colour. Faces and edges come from `accent`, `gold` and the
 * neutrals that were already there — the sky and the tray are the only new
 * values, and they are scenery nothing is measured against.
 *
 * React Native has no box-shadow and no CSS gradient, so the edge is a real
 * view behind the control and the sky is an SVG. Both work on the phone and in
 * the web export without a new dependency.
 */

import React from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient, Rect, Stop } from 'react-native-svg';
import { color, gameEdge, gameRadius, gameShadow, gameSky, gameTray } from '@chivago/tokens';
import { Body, Heading, Label } from './Type.tsx';

/**
 * The painted ground a game screen sits on.
 *
 * Gradient stops and two soft ellipses, no image file. An illustrated
 * background is a real option later and a real cost; this gets most of the
 * depth for none of it, and it cannot go stale the way a painting of a
 * specific beach would.
 */
export function GameScene({ children, style }: { children?: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={[{ flex: 1, overflow: 'hidden' }, style]}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
        <Svg width="100%" height="100%" viewBox="0 0 100 200" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              {gameSky.map((stop, i) => (
                <Stop key={stop} offset={`${(i / (gameSky.length - 1)) * 100}%`} stopColor={stop} />
              ))}
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="200" fill="url(#sky)" />
          {/* Two hills and a haze. Soft-edged on purpose: a hard horizon would
              read as a chart axis, which is the one thing a scene must not do. */}
          <Ellipse cx="22" cy="196" rx="72" ry="34" fill="#2F6634" opacity={0.5} />
          <Ellipse cx="86" cy="198" rx="64" ry="30" fill="#35703A" opacity={0.45} />
          <Ellipse cx="30" cy="96" rx="46" ry="15" fill="#FFFFFF" opacity={0.55} />
          <Ellipse cx="76" cy="78" rx="34" ry="11" fill="#FFFFFF" opacity={0.45} />
        </Svg>
      </View>
      {children}
    </View>
  );
}

/**
 * A control with a thick bottom edge.
 *
 * This one detail is most of the difference between the reference designs and
 * what this app shipped. A flat capsule is a coloured rectangle; the same
 * capsule with four opaque pixels beneath it is an object resting on a page.
 *
 * `tone` names a role, never a colour, so a screen cannot ask for "the green
 * one" and accidentally claim a host verified something.
 */
export function Chunk({
  label, thai, onPress, tone = 'go', disabled = false, style, accessibilityLabel,
}: {
  label: string;
  thai?: string;
  onPress?: () => void;
  /** `go` acts, `game` is a game-layer action, `quiet` is the secondary. */
  tone?: 'go' | 'game' | 'quiet';
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}) {
  const skin = {
    go: { face: color.accent500, edge: color.accent800, ink: color.surface },
    game: { face: color.gold, edge: color.goldDeep, ink: color.neutral900 },
    quiet: { face: color.surface, edge: color.neutral400, ink: color.neutral800 },
  }[tone];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || onPress === undefined}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        {
          backgroundColor: skin.edge,
          borderRadius: gameRadius.control,
          paddingBottom: gameEdge.height,
          opacity: disabled ? 0.55 : 1,
        },
        gameShadow.lift,
        style,
      ]}
    >
      <View
        style={{
          backgroundColor: skin.face,
          borderRadius: gameRadius.control,
          minHeight: 44,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 16,
        }}
      >
        <Heading size={16} colour={skin.ink} tracking={-0.1}>{thai ?? label}</Heading>
      </View>
    </Pressable>
  );
}

/**
 * The nameplate.
 *
 * Its job is to carry a name over a scene and stay readable on any part of it,
 * which is why it is opaque rather than translucent — a frosted plate over a
 * pale sky is a name nobody can read.
 */
export function Plate({ title, sub }: { title: string; sub?: string }) {
  return (
    <View
      style={[
        {
          alignSelf: 'center',
          backgroundColor: color.surface,
          borderRadius: gameRadius.plate,
          paddingHorizontal: 18,
          paddingVertical: 7,
          alignItems: 'center',
        },
        gameShadow.lift,
      ]}
    >
      <Heading size={22} tracking={-0.4} colour={color.neutral800}>{title}</Heading>
      {sub ? <Label size={10} tracking={0.1} colour={color.neutral600}>{sub}</Label> : null}
    </View>
  );
}

/** A level, as a struck coin rather than a number in a box. */
export function Medal({ value, size = 36 }: { value: number | string; size?: number }) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color.gold,
          borderBottomWidth: gameEdge.height - 1,
          borderBottomColor: color.goldDeep,
          alignItems: 'center',
          justifyContent: 'center',
        },
        gameShadow.lift,
      ]}
    >
      <Heading size={Math.round(size * 0.46)} colour={color.neutral900} tracking={-0.3}>
        {String(value)}
      </Heading>
    </View>
  );
}

/**
 * The warm ground meters sit in, across the foot of a game screen.
 *
 * Ink rather than paper, so the scene above it stays the brightest thing on
 * the screen and the numbers do not compete with the sky.
 */
export function Tray({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View
      style={[
        { backgroundColor: gameTray.bottom, paddingHorizontal: 16, paddingVertical: 14 },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** A line of tray copy, in the tray's own ink. */
export function TrayLine({ children }: { children: React.ReactNode }) {
  return <Body size={13} colour={gameTray.muted}>{children}</Body>;
}

/**
 * A progress bar for the game layer.
 *
 * `pct` is clamped rather than trusted: a bar wider than its track is the
 * classic way a rounding error becomes a visual bug, and there is no reading
 * of "108% of the way to level 6" that helps anybody.
 */
export function GameBar({ pct, height = 14 }: { pct: number; height?: number }) {
  const safe = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  return (
    <View
      style={{
        flex: 1,
        height,
        borderRadius: height / 2,
        backgroundColor: color.neutral900,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${safe}%`,
          height: '100%',
          borderRadius: height / 2,
          backgroundColor: color.accent500,
        }}
      />
    </View>
  );
}
