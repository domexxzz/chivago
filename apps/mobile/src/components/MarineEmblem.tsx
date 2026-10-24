import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/**
 * Official Marine Meteorological Department Emblem (Figma node 23:2119 / 23:2118)
 */
export function DepartmentSeal({ size = 44 }: { size?: number }) {
  const innerSize = Math.round(size * 0.65);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#002B49',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 5,
        elevation: 3,
      }}
    >
      <Svg width={innerSize} height={Math.round(innerSize * 0.9)} viewBox="0 0 43 39" fill="none">
        <Defs>
          <LinearGradient id="deptEmblemGrad" x1="0" y1="0" x2="0" y2="39" gradientUnits="userSpaceOnUse">
            <Stop stopColor="#28C3B1" />
            <Stop offset="1" stopColor="#064F7D" />
          </LinearGradient>
        </Defs>
        <Path
          d="M3.23276 19.1216C-2.15517 6.37387 8.62068 0 19.3965 0C6.46551 5.31156 9.69827 12.7477 16.1638 13.8101C38.7931 0 49.5689 21.2462 38.7931 30.8071C24.7845 45.6794 6.46551 37.1809 0 29.7447L1.07759 23.3709C9.69827 35.0563 19.3965 33.994 24.7845 26.5578C30.1724 32.9317 37.7155 29.7447 40.9482 24.4332C32.3276 26.5578 25.8621 20.1839 24.7845 10.6231C21.5517 16.997 20.4741 23.3709 14.0086 26.5578C8.62068 27.6201 4.31034 24.4332 3.23276 19.1216Z"
          fill="url(#deptEmblemGrad)"
        />
      </Svg>
    </View>
  );
}

/**
 * Wave symbol badge used in weather metric cards (Figma node 23:2102)
 */
export function WaveSymbolBadge({ size = 38 }: { size?: number }) {
  return (
    <View style={{ width: size, height: Math.round(size * 1.15), borderRadius: size / 2, overflow: 'hidden' }}>
      <Svg width="100%" height="100%" viewBox="0 0 51 59" fill="none">
        <Defs>
          <LinearGradient id="waveSymbolGrad" x1="0" y1="0" x2="0" y2="59" gradientUnits="userSpaceOnUse">
            <Stop stopColor="#008ADE" />
            <Stop offset="1" stopColor="#005295" />
          </LinearGradient>
        </Defs>
        <Rect width="51" height="59" rx="25.5" fill="url(#waveSymbolGrad)" />
        <Path
          d="M10 29.2895C16.2 30.6725 19.3 12.6929 26.5333 14.076C31.7 14.076 33.7667 23.7573 38.9333 20.9912M21.3667 29.2895C25.5 23.7573 27.5667 30.6725 31.7 32.0556C35.8333 34.8216 38.9333 30.6725 41 27.9064M10 44.503C16.2 47.2691 20.3333 37.5877 25.5 37.5877C30.6667 37.5877 33.7667 47.2691 41 40.3538"
          strokeWidth="3.2"
          strokeLinecap="round"
          stroke="#FFFFFF"
        />
      </Svg>
    </View>
  );
}
