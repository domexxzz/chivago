import React from 'react';
import { View } from 'react-native';
import {
  BedDouble, Car, MapPin, Scissors, ShoppingBag, Sparkles, Store, Utensils,
  type LucideIcon,
} from 'lucide-react-native';

/**
 * One visual language for service markers on both map implementations.
 * The category remains data, while colour and symbol make it recognisable at
 * map-reading distance without opening every marker.
 */
const SHOP_MARKERS: Record<string, { colour: string; icon: LucideIcon; svg: string }> = {
  'ที่พัก': {
    colour: '#7657D5', icon: BedDouble,
    svg: '<path d="M3 18v-8m18 8v-8M3 14h18M7 10V6h10v4M3 18h18"/>',
  },
  'ร้านอาหาร': {
    colour: '#F47A1F', icon: Utensils,
    svg: '<path d="M7 3v8m-3-8v5a3 3 0 0 0 6 0V3M7 11v10M16 3v18m0-18c3 2 4 5 4 8h-4"/>',
  },
  'ร้านขายของ': {
    colour: '#8B5BCB', icon: ShoppingBag,
    svg: '<path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
  },
  'เช่ารถ': {
    colour: '#008F9C', icon: Car,
    svg: '<path d="m5 17-1-2v-4l2-5h12l2 5v4l-1 2M4 12h16M7 15h.01M17 15h.01M6 17v2m12-2v2"/>',
  },
  'เสริมสวย': {
    colour: '#DF5C91', icon: Sparkles,
    svg: '<path d="m12 3 1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8L12 3ZM5 15l.7 2.3L8 18l-2.3.7L5 21l-.7-2.3L2 18l2.3-.7L5 15Zm14-2 .7 2.3 2.3.7-2.3.7L19 19l-.7-2.3L16 16l2.3-.7L19 13Z"/>',
  },
  'ตัดผม': {
    colour: '#2E7BCB', icon: Scissors,
    svg: '<circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="m8.5 8.5 11 7M8.5 15.5 19 9"/>',
  },
  'ไกด์นำเที่ยว': {
    colour: '#16806D', icon: MapPin,
    svg: '<path d="M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3Z"/><path d="M9 3v15m6-12v15"/><circle cx="15" cy="11" r="2"/>',
  },
  'อื่นๆ': {
    colour: '#486581', icon: Store,
    svg: '<path d="M4 10v11h16V10M3 4h18l-2 6H5L3 4Z"/><path d="M8 21v-6h8v6"/>',
  },
};

const FALLBACK = SHOP_MARKERS['อื่นๆ'];

export const shopMarkerVisual = (category: string) => SHOP_MARKERS[category] ?? FALLBACK;

/** Native/SVG-fallback marker. The tip, not the circle centre, is the coordinate. */
export function ShopMapMarker({ category }: { category: string }) {
  const visual = shopMarkerVisual(category);
  const Icon = visual.icon;
  return (
    <View style={{ width: 46, height: 51, alignItems: 'center' }}>
      <View style={{
        position: 'absolute', top: 33, width: 14, height: 14,
        backgroundColor: visual.colour, borderRightWidth: 2.5, borderBottomWidth: 2.5,
        borderColor: '#FFFFFF', transform: [{ rotate: '45deg' }],
      }} />
      <View style={{
        width: 42, height: 42, borderRadius: 21, backgroundColor: visual.colour,
        borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
        shadowColor: '#082A46', shadowOpacity: 0.34, shadowRadius: 5, shadowOffset: { width: 0, height: 3 },
        elevation: 5,
      }}>
        <Icon size={21} strokeWidth={2.4} color="#FFFFFF" />
      </View>
    </View>
  );
}

/** Inline icon for MapLibre's DOM marker. Paths deliberately use currentColor. */
export const shopMarkerSvg = (category: string): string => {
  const visual = shopMarkerVisual(category);
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${visual.svg}</svg>`;
};
