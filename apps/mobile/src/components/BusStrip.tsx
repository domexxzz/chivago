/**
 * The bus, on the screen of somebody standing at the gate.
 *
 * Two questions, and the app can only really answer one of them:
 *
 *   WHAT RUNS HERE - answered, from OpenStreetMap. Route 538 terminates at
 *   the Thanyaburi campus and four stops stand at its edge. Real, checkable,
 *   and the card names the operator so the reader knows who to complain to.
 *
 *   WHEN IS THE NEXT ONE - nobody publishes a timetable, so the app measures
 *   instead: riders tap when they see one, and this says how long ago and how
 *   far apart today's reports have been. `sayHeadway` in core writes the
 *   sentence and is careful to name whose knowledge it is. Nothing here
 *   rephrases it, because "every 21 min" without "that is what riders saw"
 *   is a promise the app cannot keep.
 *
 * AND THE EMPTY CASE IS THE POINT. A university with no published shuttle
 * route gets a line of text saying exactly that, not a hidden section. A
 * missing feature that says its own name is a question somebody can go and
 * ask; a section that quietly is not there is one nobody knows to ask about.
 */

import React from 'react';
import { Pressable, View } from 'react-native';
import * as Location from 'expo-location';
import { BusFront, Check, MapPin } from 'lucide-react-native';
import {
  NO_CAMPUS_ROUTE, metresBetween, nearestFirst, sayHeadway, type Headway, type TransitRoute,
} from '@chivago/core';
import { color, gutter, onFill, radius } from '../theme/index.ts';
import { Body, Heading, Label } from './Type.tsx';
import { t } from '../i18n/locale.ts';
import { api } from '../api/client.ts';
import { useHere, type Here } from '../state/here.ts';

type RouteWithHeadway = TransitRoute & { headway: Headway };

const BUS_REPORT_MAX_DISTANCE_M = 500;

export function BusStrip({
  routes, campus, loading, error, onToast,
}: {
  routes: RouteWithHeadway[] | null;
  campus: TransitRoute[] | null;
  loading: boolean;
  error: string | null;
  onToast?: (message: string) => void;
}) {
  // An area with nothing scheduled to it draws nothing at all. Samui has no
  // bus route in the seed, and a card saying so on a beach would be noise.
  if (loading || error || routes === null || routes.length === 0) return null;

  return (
    <View style={{ paddingHorizontal: gutter, paddingBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10 }}>
        <BusFront size={16} color={color.brand} />
        <Heading size={16}>{t({ en: 'Getting here', th: 'มายังไง' })}</Heading>
      </View>

      <RouteCards routes={routes} onToast={onToast} />

      {/*
        The university's own shuttle, when there is not one. `campus` is empty
        because nobody has published a route - said here in a full sentence
        rather than left as a blank space somebody reads as a bug.
      */}
      {campus !== null && campus.length === 0 ? (
        <View style={{ paddingTop: 4 }}>
          <Body size={13} colour={color.neutral600}>{t(NO_CAMPUS_ROUTE)}</Body>
        </View>
      ) : null}
    </View>
  );
}

function RouteCards({ routes, onToast }: { routes: RouteWithHeadway[]; onToast?: (m: string) => void }) {
  // Keep the selected stop current while the rider moves through the campus.
  const here = useHere({ watch: true });
  return routes.map((route) => <RouteCard key={route.id} route={route} here={here} onToast={onToast} />);
}

function RouteCard({ route, here, onToast }: {
  route: RouteWithHeadway;
  here: Here | null;
  onToast?: (m: string) => void;
}) {
  const [headway, setHeadway] = React.useState<Headway>(route.headway);
  const [sending, setSending] = React.useState(false);
  const [chosenStopId, setChosenStopId] = React.useState<string | null>(null);
  const nearest = here ? nearestFirst(route.stops, here)[0] : undefined;
  const nearbyStop = nearest && here && metresBetween(here, nearest) <= BUS_REPORT_MAX_DISTANCE_M
    ? nearest : undefined;
  // A deliberate choice wins over GPS, but it does not bypass the distance check.
  const stop = route.stops.find((s) => s.id === chosenStopId)
    ?? nearbyStop;
  const nearStop = !!(stop && here && metresBetween(here, stop) <= BUS_REPORT_MAX_DISTANCE_M);

  const report = async () => {
    if (!stop || !nearStop || sending) return;
    setSending(true);
    let nearNow = false;
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission?.granted) {
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const current = { lat: position.coords.latitude, lng: position.coords.longitude };
        nearNow = Number.isFinite(current.lat) && Number.isFinite(current.lng)
          && metresBetween(current, stop) <= BUS_REPORT_MAX_DISTANCE_M;
      }
    } catch {
      // An unavailable fix cannot verify that the rider is at this stop.
    }
    if (!nearNow) {
      setSending(false);
      onToast?.(t({ en: 'Confirm your location within 500 m of this stop to report a bus.',
        th: 'ต้องยืนยันว่าอยู่ห่างจากป้ายนี้ไม่เกิน 500 ม. จึงจะแจ้งรถได้' }));
      return;
    }
    const res = await api.seenBus(route.id, stop.id);
    setSending(false);
    if (!res.ok) { onToast?.(res.error); return; }
    setHeadway(res.data.headway);
    // A second press inside the same-vehicle window is not a failure. Saying
    // "already counted" is the truth and reads as the app keeping up, where a
    // red error for pressing twice reads as the app being broken.
    onToast?.(res.data.recorded
      ? t({ en: 'Thanks - counted', th: 'ขอบคุณ นับแล้ว' })
      : t({ en: 'Already counted just now', th: 'เพิ่งนับไปเมื่อกี้แล้ว' }));
  };

  return (
    <View style={{
      backgroundColor: color.surface, borderRadius: radius.md, borderWidth: 1, borderColor: color.neutral200,
      padding: 14, marginBottom: 10,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        {route.ref ? (
          <View style={{
            backgroundColor: color.text, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4,
          }}>
            <Label size={11} tracking={0.04} colour={onFill.text}>{route.ref}</Label>
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Body size={13}>{t(route.name)}</Body>
          {route.operator ? (
            <Label size={9} tracking={0.08} colour={color.neutral600} style={{ marginTop: 3 }}>
              {route.operator}
            </Label>
          ) : null}
        </View>
      </View>

      {/*
        The stops, with the unnamed ones said to BE unnamed. Three of the four
        here carry no name in OpenStreetMap, and inventing one would put a
        landmark on the map that nobody can find by asking for it.
      */}
      <View style={{ paddingTop: 10, gap: 4 }}>
        <Body size={13} colour={color.neutral600}>
          {t({
            en: nearbyStop ? 'Nearest stop selected. Tap another if needed.'
              : 'Select a stop. Reporting requires your location within 500 m.',
            th: nearbyStop ? 'เลือกป้ายที่ใกล้ที่สุดแล้ว แตะเปลี่ยนได้'
              : 'เลือกป้ายได้ แต่ต้องอยู่ห่างไม่เกิน 500 ม. จึงจะแจ้งรถได้',
          })}
        </Body>
        {route.stops.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => setChosenStopId(s.id)}
            accessibilityRole="radio"
            accessibilityLabel={t({
              en: `Select stop: ${s.name?.en ?? 'Unnamed stop'}`,
              th: `เลือกป้าย: ${s.name?.th ?? 'ป้ายที่ยังไม่มีชื่อบนแผนที่'}`,
            })}
            accessibilityState={{ checked: stop?.id === s.id }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 }}
          >
            <MapPin size={11} color={color.neutral600} />
            <Body size={13} colour={stop?.id === s.id ? color.brand : s.name ? color.neutral800 : color.neutral600}>
              {s.name ? t(s.name) : t({ en: 'Unnamed stop', th: 'ป้ายที่ยังไม่มีชื่อบนแผนที่' })}
            </Body>
            {stop?.id === s.id ? <Check size={14} color={color.brand} /> : null}
          </Pressable>
        ))}
      </View>

      <View style={{ paddingTop: 12, borderTopWidth: 1, borderTopColor: color.neutral200, marginTop: 12 }}>
        <Body size={13} colour={color.neutral800}>{t(sayHeadway(headway))}</Body>
        {/*
          How many people this rests on, next to what it says. Three reports
          is not a survey, and the reader gets to weigh that for themselves
          instead of being handed a number that looks the same either way.
        */}
        {headway.reports > 0 ? (
          <Label size={9} tracking={0.08} colour={color.neutral600} style={{ marginTop: 4 }}>
            {t({
              en: `${headway.reports} report${headway.reports === 1 ? '' : 's'} today, ${headway.vehicles} vehicle${headway.vehicles === 1 ? '' : 's'}`,
              th: `วันนี้มีคนแจ้ง ${headway.reports} ครั้ง เห็นรถ ${headway.vehicles} คัน`,
            })}
          </Label>
        ) : null}
      </View>

      {nearStop ? (
        <Pressable
          onPress={report}
          disabled={sending}
          accessibilityRole="button"
          accessibilityLabel={t({ en: 'I saw one', th: 'เห็นรถแล้ว' })}
          style={{
            marginTop: 12, minHeight: 40, borderRadius: radius.sm, backgroundColor: color.brand,
            alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6,
            opacity: sending ? 0.6 : 1,
          }}
        >
          <Check size={14} color={onFill.brand} />
          <Label size={11} tracking={0.06} colour={onFill.brand}>
            {t({ en: 'I saw one', th: 'เห็นรถแล้ว' })}
          </Label>
        </Pressable>
      ) : null}
    </View>
  );
}
