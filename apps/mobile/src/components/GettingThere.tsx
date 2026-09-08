/**
 * How far away this place is, and a way to actually go to it.
 *
 * The app measured this distance on every check-in and only ever said it
 * while refusing one. Here it is said before the attempt, in the place a
 * traveller is deciding whether to make the trip - and beside it, the one
 * button in the app that leaves the app for a map with the roads on it.
 *
 * IT DOES NOT ROUTE. Nothing here draws a line, reads a timetable or claims
 * to know about a songthaew. `packages/core/src/wayfinding.ts` says why that
 * boundary is where it is, and what is deliberately not put in the URL.
 *
 * Three states, and the middle one is the interesting one:
 *
 *   arrived    inside the 250 m fence. Says so, rather than "250 m away"
 *              beside a check-in button that works.
 *   away       the distance, the compass point, the walk in minutes.
 *   unknown    no position, and no permission dialog raised to get one. The
 *              map button still works; Google fills in the origin itself.
 */

import React from 'react';
import { Linking, View } from 'react-native';
import { Compass, ExternalLink } from 'lucide-react-native';
import { mapsDirectionsUrl, strings, wayThere, type ScoredPlace } from '@chivago/core';
import { useHere } from '../state/here.ts';
import { color, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from './Type.tsx';
import { Button } from './Button.tsx';
import { t } from '../i18n/locale.ts';

export function GettingThere({ place }: { place: ScoredPlace }) {
  const here = useHere();
  const way = here ? wayThere(here, place) : null;
  // Walking mode only when a walk is plausible. Opening a map in walking mode
  // for an eleven-kilometre trip is a setting the traveller has to undo
  // before the map is any use to them.
  const url = mapsDirectionsUrl(place, { walking: way?.walkable ?? false });

  // The walk is quoted only when walking is a real choice. "About 105 min on
  // foot" beside an eight-kilometre distance is not information a traveller
  // can use; on this island in this heat it is closer to bad advice, and the
  // distance above it has already said the place is far.
  const line = !way
    ? t(strings.place.distanceUnknown)
    : way.arrived
      ? t(strings.place.arrived)
      : way.walkable
        ? t(strings.place.onFoot(way.minutesOnFoot))
        : null;

  return (
    <View
      style={[shadow.card, {
        marginTop: 14, padding: 14, backgroundColor: color.surface, borderRadius: radius.md,
      }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{
          width: 40, height: 40, borderRadius: 20, backgroundColor: color.brandSoft,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Compass size={18} color={color.brand} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          {way && !way.arrived ? (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
              <Heading size={22}>{t(way.distance)}</Heading>
              <Label size={10} tracking={0.12}>{t(way.direction)}</Label>
            </View>
          ) : (
            <Label size={10} tracking={0.12}>{t(strings.place.getThere)}</Label>
          )}
          {line ? <Body size={13} colour={color.neutral800}>{line}</Body> : null}
        </View>
      </View>

      <Button
        label={t(strings.place.openInMaps)}
        onPress={() => { void Linking.openURL(url); }}
        variant="secondary"
        icon={<ExternalLink size={16} color={color.brand} strokeWidth={2} />}
        height={44}
        style={{ marginTop: 12 }}
      />
    </View>
  );
}
