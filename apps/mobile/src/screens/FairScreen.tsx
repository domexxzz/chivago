/**
 * A fair's market, lot by lot (docs/66).
 *
 * Type a stall's name, a thing it sells or a lot number - "ทุเรียน", "กาแฟ",
 * "a5" - and the lots that match come first, each with its lot code in its
 * zone's colour. "Show on the map" hands the lot to the Map tab, which flies to
 * it with every other lot of the fair around it; on a phone, where the campus
 * has no map yet, the list and its lot codes are the directory on their own.
 *
 * Until the organiser's plan is in, the fair is an example and says so on its
 * first line, in the coral the rest of the app uses for "not real yet".
 */

import React from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ExternalLink, MapPin, Search, X } from 'lucide-react-native';
import {
  fairLots, fairOrderUrl, fairsIn, isOrderLink, searchFair, strings, type Fair, type FairLot,
} from '@chivago/core';
import { Button } from '../components/Button.tsx';
import { PushHeader } from '../components/Shell.tsx';
import { Body, Heading, Label } from '../components/Type.tsx';
import { zoneTone } from '../components/fair-tones.ts';
import { useArea } from '../state/area.ts';
import { color, gutter, onFill, radius, shadow } from '../theme/index.ts';
import { t } from '../i18n/locale.ts';

export function FairScreen({ onBack, onShowOnMap }: {
  onBack: () => void;
  /** The Map tab takes it from here: it flies to the lot and marks it. */
  onShowOnMap: (fair: Fair, lot: FairLot) => void;
}) {
  const area = useArea();
  const fair = fairsIn(area.key)[0] ?? null;
  const lots = React.useMemo(() => (fair ? fairLots(fair) : []), [fair]);
  const [query, setQuery] = React.useState('');
  const [zone, setZone] = React.useState<string | null>(null);
  const found = React.useMemo(
    () => searchFair(lots, query).filter((l) => zone === null || l.zone.code === zone),
    [lots, query, zone],
  );

  if (!fair) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        <PushHeader context={t(strings.fair.kicker)} onBack={onBack} />
        <Body size={14} colour={color.neutral700} style={{ paddingHorizontal: gutter }}>{t(strings.fair.none(''))}</Body>
      </View>
    );
  }

  const stalls = lots.filter((l) => l.stall).length;
  const typed = query.trim();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} keyboardShouldPersistTaps="handled">
      <PushHeader context={t(strings.fair.kicker)} onBack={onBack} />
      <View style={{ paddingHorizontal: gutter, paddingBottom: 32 }}>
        <Heading size={26} tracking={-0.4}>{t(fair.name)}</Heading>
        {fair.example ? (
          <Label size={10} tracking={0.12} colour={color.accent2} style={{ marginTop: 6 }}>{t(strings.fair.example)}</Label>
        ) : null}
        <Body size={14} colour={color.neutral700} style={{ marginTop: 6 }}>
          {`${t(fair.venue)} · ${fair.dates ? t(fair.dates) : t(strings.fair.datesTba)}`}
        </Body>
        <Body size={13} colour={color.neutral700} style={{ marginTop: 10 }}>{t(strings.fair.find)}</Body>

        <View
          style={[shadow.card, {
            marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14,
            minHeight: 54, borderRadius: radius.lg, backgroundColor: color.surface, borderWidth: 2, borderColor: color.brand,
          }]}
        >
          <Search size={20} color={color.brand} strokeWidth={2.2} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t(strings.fair.searchHint)}
            placeholderTextColor={color.neutral500}
            accessibilityLabel={t(strings.fair.search)}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            style={{ flex: 1, fontSize: 17, paddingVertical: 12, color: color.text }}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={t(strings.fair.clear)} hitSlop={12}>
              <X size={20} color={color.neutral600} strokeWidth={2.2} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 14 }}>
          <ZoneChip label={t(strings.fair.all)} on={zone === null} onPress={() => setZone(null)} />
          {fair.zones.map((z) => (
            <ZoneChip
              key={z.code}
              label={`${z.icon} ${z.code} · ${t(z.name)}`}
              tone={zoneTone(z.code)}
              on={zone === z.code}
              onPress={() => setZone(zone === z.code ? null : z.code)}
            />
          ))}
        </ScrollView>

        <View accessibilityLiveRegion="polite">
          <Label size={10} tracking={0.12} colour={color.neutral600}>
            {typed ? t(strings.fair.found(found.length)) : t(strings.fair.directory(stalls, lots.length))}
          </Label>
        </View>

        {found.length === 0 ? (
          <Body size={14} colour={color.neutral700} style={{ marginTop: 12 }}>{t(strings.fair.none(typed))}</Body>
        ) : null}
        {found.map((lot) => (
          <LotRow key={lot.code} lot={lot} onShowOnMap={() => onShowOnMap(fair, lot)} />
        ))}
      </View>
    </ScrollView>
  );
}

function ZoneChip({ label, on, tone, onPress }: { label: string; on: boolean; tone?: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={{
        minHeight: 40, paddingHorizontal: 14, borderRadius: 20, justifyContent: 'center',
        borderWidth: 2, borderColor: on ? (tone ?? color.text) : color.neutral300,
        backgroundColor: on ? (tone ?? color.text) : color.surface,
      }}
    >
      <Body size={14} colour={on ? onFill.text : color.text} style={{ fontWeight: '700' }}>{label}</Body>
    </Pressable>
  );
}

function LotRow({ lot, onShowOnMap }: { lot: FairLot; onShowOnMap: () => void }) {
  const tone = zoneTone(lot.zone.code);
  const order = lot.stall?.orderSlug ? fairOrderUrl(lot.stall.orderSlug) : null;
  return (
    <View
      style={[shadow.card, {
        marginTop: 10, padding: 12, gap: 12, flexDirection: 'row',
        backgroundColor: color.surface, borderRadius: radius.md,
      }]}
    >
      {/* The lot code in its zone's colour - the same colour as its dot on the map. */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ alignItems: 'center', width: 60 }}>
        <View
          style={{
            width: 60, height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
            backgroundColor: lot.stall ? tone : color.surface, borderWidth: 2, borderColor: tone,
          }}
        >
          <Heading size={19} tracking={-0.2} colour={lot.stall ? '#ffffff' : tone}>{lot.code}</Heading>
        </View>
        <Text style={{ fontSize: 20, marginTop: 4 }}>{lot.zone.icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Heading size={16}>{lot.stall ? lot.stall.name : t(strings.fair.free)}</Heading>
        {lot.stall ? <Body size={13} colour={color.neutral700} style={{ marginTop: 2 }}>{lot.stall.sells}</Body> : null}
        <Label size={9} tracking={0.06} colour={color.neutral600} style={{ marginTop: 5, textTransform: 'none' }}>
          {`${t(strings.fair.lot(lot.code))} · ${t(lot.zone.name)}`}
        </Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          <Button
            label={t(strings.fair.showOnMap)}
            onPress={onShowOnMap}
            variant="secondary"
            height={40}
            icon={<MapPin size={16} color={color.brand} strokeWidth={2} />}
            style={{ flexGrow: 1 }}
          />
          {order && isOrderLink(order) ? (
            <Button
              label={t(strings.place.stallOrder)}
              onPress={() => { void Linking.openURL(order); }}
              height={40}
              icon={<ExternalLink size={16} color={onFill.brand} strokeWidth={2} />}
              style={{ flexGrow: 1 }}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}
