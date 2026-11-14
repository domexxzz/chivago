import React from 'react';
import { View } from 'react-native';
import type { ScoredPlace } from '@chivago/core';
import { ChivarIcon, chivarIconUri, placeIconName, type ChivarIconName } from './ChivarIcon.tsx';

/** Category colours shared by every map implementation. */
const PLACE_COLOURS: Record<ChivarIconName, string> = {
  malePlayer: '#2E7BCB', femalePlayer: '#2E7BCB',
  quest: '#D99400', questNew: '#D99400', questInProgress: '#2E7BCB', questCompleted: '#16806D', questLocked: '#66788A', questNewClue: '#D99400',
  culture: '#B15D99', game: '#D65A6F', food: '#F47A1F', otop: '#8B5BCB', workshop: '#B86B32',
  eco: '#16806D', viewpoint: '#7657D5', pier: '#168DA8', transport: '#008F9C', hospital: '#2E7BCB',
  toilet: '#486581', info: '#486581', treasure: '#D99400',
};

export function placeMarkerVisual(place: Pick<ScoredPlace, 'id' | 'name' | 'layer'> & { meta?: string; tags?: readonly string[] }) {
  const icon = placeIconName(place);
  return { icon, colour: PLACE_COLOURS[icon] };
}

export function placeMarkerHtml(place: Pick<ScoredPlace, 'id' | 'name' | 'layer'> & { meta?: string; tags?: readonly string[] }): string {
  const { icon } = placeMarkerVisual(place);
  const uri = chivarIconUri(icon).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<img src="${uri}" alt="" aria-hidden="true">`;
}

/** The category pin used by the native/SVG fallback map. */
export function PlaceMapMarker({ place }: { place: ScoredPlace }) {
  const visual = placeMarkerVisual(place);
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
        <ChivarIcon name={visual.icon} size={28} />
      </View>
    </View>
  );
}
