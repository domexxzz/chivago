/**
 * A mascot, drawn. The mark a phone shows and the catalogue lists.
 *
 * Eight silhouettes - one per body - in the mascot's own colours, with what
 * it wears on its head and the one prop it carries, as glyphs. Not the
 * three-dimensional creature; the same creature, recognisable at 56 pixels,
 * seventy-seven times on one screen without a renderer.
 *
 * Primitives rather than path data, as `Creature.tsx` insists: every shape
 * here can be read and adjusted by a person.
 */

import React from 'react';
import Svg, { Circle, Ellipse, G, Line, Path, Polygon, Rect } from 'react-native-svg';
import type { Mascot, MascotCrest, MascotProp } from '@chivago/core';

const BOX = 64;

function Eyes({ cx, cy, r, gap, ink }: { cx: number; cy: number; r: number; gap: number; ink: string }) {
  return (
    <G>
      {[-1, 1].map((s) => (
        <G key={s}>
          <Circle cx={cx + s * gap} cy={cy} r={r} fill={ink} />
          <Circle cx={cx + s * gap + r * 0.35} cy={cy - r * 0.35} r={r * 0.32} fill="#ffffff" />
        </G>
      ))}
    </G>
  );
}

function Crest({ kind, x, y, accent, feature }: { kind: MascotCrest; x: number; y: number; accent: string; feature: string }) {
  switch (kind) {
    case 'crest': return <Polygon points={`${x - 6},${y} ${x - 2},${y - 9} ${x + 2},${y - 3} ${x + 6},${y - 10} ${x + 8},${y}`} fill={accent} />;
    case 'crown': return <Polygon points={`${x - 9},${y} ${x - 9},${y - 8} ${x - 4},${y - 3} ${x},${y - 10} ${x + 4},${y - 3} ${x + 9},${y - 8} ${x + 9},${y}`} fill="#e0b34a" />;
    case 'flower': return (
      <G>
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2;
          return <Ellipse key={i} cx={x + Math.sin(a) * 5} cy={y - 5 + Math.cos(a) * 5} rx={3.2} ry={4.5} fill={accent} transform={`rotate(${(a * 180) / Math.PI} ${x + Math.sin(a) * 5} ${y - 5 + Math.cos(a) * 5})`} />;
        })}
        <Circle cx={x} cy={y - 5} r={2.6} fill="#f2c24e" />
      </G>
    );
    case 'fruit': return <Circle cx={x + 5} cy={y - 4} r={4.5} fill={accent} />;
    case 'leaf': return <G><Line x1={x} y1={y} x2={x} y2={y - 7} stroke={feature} strokeWidth={1.5} /><Ellipse cx={x + 5} cy={y - 9} rx={6} ry={3} fill="#5f8f4a" transform={`rotate(-30 ${x + 5} ${y - 9})`} /></G>;
    case 'spikes': return <Polygon points={`${x - 12},${y + 2} ${x - 8},${y - 7} ${x - 4},${y + 1} ${x},${y - 9} ${x + 4},${y + 1} ${x + 8},${y - 7} ${x + 12},${y + 2}`} fill={feature} />;
    case 'fin': return <Polygon points={`${x - 6},${y + 2} ${x},${y - 9} ${x + 6},${y + 2}`} fill={feature} />;
    case 'whiskers': return <G>{[-1, 1].map((s) => <Line key={s} x1={x + s * 6} y1={y + 12} x2={x + s * 16} y2={y + 9} stroke={feature} strokeWidth={1.4} strokeLinecap="round" />)}</G>;
    case 'antennae': return <G>{[-1, 1].map((s) => <G key={s}><Line x1={x + s * 3} y1={y} x2={x + s * 8} y2={y - 9} stroke={feature} strokeWidth={1.5} strokeLinecap="round" /><Circle cx={x + s * 8} cy={y - 9} r={1.8} fill={accent} /></G>)}</G>;
    case 'flame': return <Path d={`M${x} ${y - 12} C ${x + 6} ${y - 6}, ${x + 4} ${y - 2}, ${x} ${y} C ${x - 4} ${y - 2}, ${x - 6} ${y - 6}, ${x} ${y - 12} Z`} fill="#ff8a3a" />;
    default: return null;
  }
}

function Prop({ kind, accent, feature }: { kind: MascotProp | null; accent: string; feature: string }) {
  switch (kind) {
    case 'umbrella': return <G><Path d="M18 16 Q 32 4, 46 16 Z" fill={accent} /><Line x1={32} y1={16} x2={32} y2={26} stroke="#8a6a3c" strokeWidth={1.5} /></G>;
    case 'chedi': return <Polygon points="28,20 36,20 34,12 32,4 30,12" fill="#e0b34a" />;
    case 'lantern': return <G><Line x1={54} y1={14} x2={54} y2={24} stroke="#5c3a1e" strokeWidth={1.2} /><Circle cx={54} cy={28} r={4.5} fill="#ffd27a" /></G>;
    case 'mask': return <G><Ellipse cx={32} cy={32} rx={11} ry={13} fill="#f2b57a" /><Polygon points="32,30 44,34 32,38" fill="#c43c2f" /></G>;
    case 'drum': return <G><Rect x={22} y={48} width={20} height={10} rx={2} fill="#8a4a2a" /><Rect x={22} y={48} width={20} height={3} fill="#f1e6d6" /></G>;
    case 'boat': return <Path d="M10 54 Q 32 62, 54 54 L 50 58 Q 32 64, 14 58 Z" fill="#8a5a3a" />;
    case 'gem': return <Polygon points="50,40 56,46 50,52 44,46" fill={accent} />;
    case 'scarf': return <Rect x={22} y={34} width={20} height={5} rx={2.5} fill={accent} />;
    case 'rocket': return <G><Rect x={50} y={22} width={5} height={18} rx={2} fill="#e8543a" transform="rotate(20 52 31)" /><Polygon points="50,22 55,22 52.5,16" fill="#f2c24e" transform="rotate(20 52 31)" /></G>;
    case 'salt': return <G>{[0, 1, 2].map((i) => <Rect key={i} x={12 + i * 6} y={54} width={4} height={4} fill="#ffffff" stroke="#c9d3dc" strokeWidth={0.6} />)}</G>;
    case 'pearl': return <Circle cx={32} cy={40} r={4} fill="#f6f0ff" stroke="#c9c3d8" strokeWidth={0.8} />;
    case 'steam': return <G>{[0, 1, 2].map((i) => <Circle key={i} cx={14 + i * 6} cy={16 - i * 3} r={3 + i} fill="#ffffff" opacity={0.7} />)}</G>;
    case 'tusks': return <G>{[-1, 1].map((s) => <Path key={s} d={`M${32 + s * 5} 36 q ${s * 3} 6, ${s * 1} 10`} stroke="#f8f4ea" strokeWidth={2.2} fill="none" strokeLinecap="round" />)}</G>;
    case 'trunk': return <Path d="M32 34 q 2 8, -1 14 q -1 3, 3 4" stroke={feature} strokeWidth={4} fill="none" strokeLinecap="round" />;
    case 'pot': return <Path d="M20 40 q 12 -6, 24 0 l -3 14 l -18 0 Z" fill={feature} />;
    case 'book': return <Rect x={42} y={46} width={14} height={10} rx={1.5} fill="#3a4a6b" />;
    case 'wings': return <G>{[-1, 1].map((s) => <Ellipse key={s} cx={32 + s * 16} cy={30} rx={9} ry={5} fill={accent} opacity={0.75} transform={`rotate(${s * 25} ${32 + s * 16} 30)`} />)}</G>;
    case 'shell': return <Path d="M40 30 a 8 8 0 1 1 -1 -6 a 5 5 0 1 0 1 4" fill={feature} />;
    case 'basket': return <Path d="M18 46 h 28 l -3 12 h -22 Z" fill="#c9a06a" />;
    case 'petals': return <G>{[0, 1, 2, 3, 4, 5].map((i) => <Ellipse key={i} cx={32 + Math.sin(i) * 20} cy={54 + Math.cos(i) * 4} rx={4} ry={2} fill={accent} />)}</G>;
    default: return null;
  }
}

/** The body silhouette, in body/belly, with the face. */
function Body({ m, ink }: { m: Mascot; ink: string }) {
  const { body, belly, feature, accent } = m.colours;
  switch (m.archetype) {
    case 'bird': return (
      <G>
        <Ellipse cx={32} cy={40} rx={15} ry={13} fill={body} />
        <Ellipse cx={30} cy={44} rx={9} ry={8} fill={belly} />
        <Circle cx={34} cy={24} r={11} fill={body} />
        <Polygon points="45,24 53,27 45,30" fill={accent} />
        <Eyes cx={35} cy={23} r={2.2} gap={4} ink={ink} />
        <Crest kind={m.crest} x={34} y={14} accent={accent} feature={feature} />
      </G>
    );
    case 'beast': return (
      <G>
        <Rect x={12} y={30} width={38} height={20} rx={10} fill={body} />
        <Ellipse cx={28} cy={44} rx={12} ry={6} fill={belly} />
        <Circle cx={44} cy={26} r={12} fill={body} />
        <Ellipse cx={48} cy={31} rx={5} ry={3.5} fill={belly} />
        {m.ears === 'round' ? [-1, 1].map((s) => <Circle key={s} cx={44 + s * 8} cy={16} r={4} fill={body} />) : null}
        {m.ears === 'long' ? [-1, 1].map((s) => <Ellipse key={s} cx={44 + s * 6} cy={12} rx={3} ry={8} fill={body} />) : null}
        {m.ears === 'fan' ? [-1, 1].map((s) => <Ellipse key={s} cx={44 + s * 12} cy={26} rx={5} ry={8} fill={body} />) : null}
        {m.ears === 'horns' ? [-1, 1].map((s) => <Polygon key={s} points={`${44 + s * 5},18 ${44 + s * 10},8 ${44 + s * 8},19`} fill={feature} />) : null}
        {m.ears === 'antlers' ? [-1, 1].map((s) => <Path key={s} d={`M${44 + s * 5} 17 l ${s * 4} -8 l ${s * 5} -3 M${44 + s * 7} 12 l ${s * -1} -6`} stroke={feature} strokeWidth={1.8} fill="none" strokeLinecap="round" />) : null}
        {m.ears === 'tufts' ? [-1, 1].map((s) => <Polygon key={s} points={`${44 + s * 4},17 ${44 + s * 7},9 ${44 + s * 9},17`} fill={feature} />) : null}
        {[16, 24, 38, 46].map((x) => <Rect key={x} x={x} y={46} width={5} height={10} rx={2} fill={body} />)}
        {m.tail !== 'none' ? <Path d="M12 36 q -8 -4, -6 -12" stroke={body} strokeWidth={4} fill="none" strokeLinecap="round" /> : null}
        <Eyes cx={45} cy={24} r={2.2} gap={4} ink={ink} />
        <Crest kind={m.crest} x={44} y={16} accent={accent} feature={feature} />
      </G>
    );
    case 'sea': return (
      <G>
        <Ellipse cx={30} cy={36} rx={20} ry={m.shape === 'flat' ? 8 : 12} fill={body} />
        <Ellipse cx={32} cy={40} rx={13} ry={5} fill={belly} />
        <Polygon points="10,36 2,28 4,44" fill={body} />
        <Polygon points="28,26 34,16 40,26" fill={feature} />
        <Eyes cx={42} cy={34} r={2.2} gap={3} ink={ink} />
        <Crest kind={m.crest === 'fin' ? 'none' : m.crest} x={30} y={24} accent={accent} feature={feature} />
      </G>
    );
    case 'naga': return (
      <G>
        <Path d="M10 54 C 20 54, 22 40, 30 40 C 40 40, 34 22, 44 22" stroke={body} strokeWidth={10} fill="none" strokeLinecap="round" />
        <Path d="M10 54 C 20 54, 22 40, 30 40 C 40 40, 34 22, 44 22" stroke={belly} strokeWidth={4} fill="none" strokeLinecap="round" strokeDasharray="3 5" />
        <Circle cx={46} cy={20} r={10} fill={body} />
        <Eyes cx={47} cy={19} r={2.2} gap={3.5} ink={ink} />
        <Crest kind={m.crest} x={46} y={11} accent={accent} feature={feature} />
      </G>
    );
    case 'bug': return (
      <G>
        {[-1, 1].map((s) => <Ellipse key={s} cx={32 + s * 13} cy={30} rx={10} ry={5} fill={accent} opacity={0.7} transform={`rotate(${s * 20} ${32 + s * 13} 30)`} />)}
        <Ellipse cx={32} cy={40} rx={11} ry={m.shape === 'long' ? 14 : 10} fill={body} />
        {m.shape === 'long' ? [34, 42, 50].map((y) => <Line key={y} x1={22} y1={y} x2={42} y2={y} stroke={feature} strokeWidth={1.5} />) : null}
        <Circle cx={32} cy={24} r={8} fill={body} />
        {[-1, 1].map((s) => <Line key={s} x1={32 + s * 6} y1={44} x2={32 + s * 15} y2={54} stroke={feature} strokeWidth={1.5} />)}
        <Eyes cx={32} cy={23} r={2} gap={3} ink={ink} />
        <Crest kind={m.crest} x={32} y={16} accent={accent} feature={feature} />
      </G>
    );
    case 'sprite': {
      const ry = m.shape === 'tall' ? 20 : m.shape === 'flat' ? 12 : 16;
      const rx = m.shape === 'tall' ? 12 : m.shape === 'flat' ? 20 : 16;
      return (
        <G>
          <Ellipse cx={32} cy={38} rx={rx} ry={ry} fill={body} />
          <Ellipse cx={32} cy={44} rx={rx * 0.6} ry={ry * 0.4} fill={belly} />
          <Eyes cx={32} cy={34} r={2.4} gap={5} ink={ink} />
          <Path d="M28 41 q 4 3, 8 0" stroke={ink} strokeWidth={1.4} fill="none" strokeLinecap="round" />
          <Crest kind={m.crest} x={32} y={38 - ry} accent={accent} feature={feature} />
        </G>
      );
    }
    case 'ape': return (
      <G>
        <Ellipse cx={32} cy={42} rx={13} ry={12} fill={body} />
        <Ellipse cx={32} cy={45} rx={8} ry={7} fill={belly} />
        <Circle cx={32} cy={22} r={12} fill={body} />
        <Ellipse cx={32} cy={26} rx={8} ry={6} fill={belly} />
        {[-1, 1].map((s) => <Circle key={s} cx={32 + s * 11} cy={22} r={4} fill={body} />)}
        {[-1, 1].map((s) => <Rect key={s} x={32 + s * 16 - 3} y={36} width={6} height={16} rx={3} fill={body} transform={`rotate(${s * -15} ${32 + s * 16} 44)`} />)}
        <Eyes cx={32} cy={21} r={m.key.includes('loris') ? 3.4 : 2.4} gap={4.5} ink={ink} />
        <Crest kind={m.crest} x={32} y={11} accent={accent} feature={feature} />
      </G>
    );
    case 'shell': return (
      <G>
        <Path d="M12 44 a 20 16 0 0 1 40 0 Z" fill={body} />
        <Rect x={10} y={42} width={44} height={6} rx={3} fill={belly} />
        <Path d="M20 40 a 12 9 0 0 1 24 0" stroke={accent} strokeWidth={2} fill="none" />
        <Circle cx={50} cy={46} r={7} fill={body} />
        {[16, 26, 38].map((x) => <Ellipse key={x} cx={x} cy={52} rx={4} ry={2.5} fill={feature} />)}
        <Eyes cx={51} cy={45} r={1.8} gap={3} ink={ink} />
      </G>
    );
  }
}

export function MascotMark({ mascot, size = 56 }: { mascot: Mascot; size?: number }) {
  const ink = '#2c2622';
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Body m={mascot} ink={ink} />
      <Prop kind={mascot.prop} accent={mascot.colours.accent} feature={mascot.colours.feature} />
    </Svg>
  );
}

/** The egg the catalogue shows before a province is hatched: one shape, the province's region colour on the speckles. */
export function SealedMark({ speckle, size = 56 }: { speckle: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Ellipse cx={32} cy={35} rx={17} ry={22} fill="#f3ede0" stroke="#c9bfae" strokeWidth={2} />
      <Circle cx={26} cy={28} r={2.6} fill={speckle} opacity={0.6} />
      <Circle cx={37} cy={38} r={3.4} fill={speckle} opacity={0.45} />
      <Circle cx={29} cy={45} r={2} fill={speckle} opacity={0.5} />
    </Svg>
  );
}
