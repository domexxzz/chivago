/**
 * Which building, and where.
 *
 * The campus had five places on 1.23 km2 and not one faculty, so a student
 * looking for คณะพยาบาลศาสตร์ found nothing. This lists what OpenStreetMap
 * has mapped inside the campus - faculties, offices, the auditorium, the halls
 * of residence, the car parks and the toilets - and hands one to the Map tab,
 * which flies to it.
 *
 * The same shape as `FairScreen`, deliberately: a search that narrows with
 * every word, chips for the kinds, and a row per result with one action. What
 * it does NOT have is a floor or a room, because OpenStreetMap has neither;
 * the list says so under itself rather than leaving somebody to assume.
 *
 * No colour per kind. The fair's zones earned their palette because a lot's
 * colour on the map is how a row is recognised; a faculty is found by its
 * name, and a sixth palette would only compete with the five layer colours
 * that already mean something.
 */

import React from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { MapPin, Search, X } from 'lucide-react-native';
import {
  BUILDINGS_READ_ON, UNNAMED_KIND, buildingsIn, findBuildings, strings,
  type BuildingKind, type CampusBuilding,
} from '@chivago/core';
import { Button } from '../components/Button.tsx';
import { PushHeader } from '../components/Shell.tsx';
import { Body, Heading, Label } from '../components/Type.tsx';
import { useArea } from '../state/area.ts';
import { color, gutter, onFill, radius, shadow } from '../theme/index.ts';
import { t } from '../i18n/locale.ts';

/** What the list shows: the words typed and the kind chip picked. */
export interface BuildingsView {
  query: string;
  kind: BuildingKind | null;
}

export const ALL_OF_THE_CAMPUS: BuildingsView = { query: '', kind: null };

/** The chips, in the order a student is likeliest to want them. */
const KINDS: readonly BuildingKind[] = ['faculty', 'office', 'hall', 'residence', 'parking', 'toilets'];

/** What to call one, named or not. */
export const buildingLabel = (b: CampusBuilding): string =>
  b.name ? t(b.name) : t(UNNAMED_KIND[b.kind]);

export function BuildingsScreen({ onBack, onShowOnMap, initialView = ALL_OF_THE_CAMPUS, onViewChange }: {
  onBack: () => void;
  /** The Map tab takes it from here: it flies to the building and marks it. */
  onShowOnMap: (building: CampusBuilding) => void;
  /**
   * The list to open on. A trip to the map leaves this screen and takes the
   * search with it, so the app keeps it - the same reason the fair does.
   */
  initialView?: BuildingsView;
  onViewChange?: (view: BuildingsView) => void;
}) {
  const area = useArea();
  const all = React.useMemo(() => buildingsIn(area.key), [area.key]);
  const [query, setQueryState] = React.useState(initialView.query);
  const [kind, setKindState] = React.useState<BuildingKind | null>(initialView.kind);
  const setQuery = (next: string) => {
    setQueryState(next);
    onViewChange?.({ query: next, kind });
  };
  const setKind = (next: BuildingKind | null) => {
    setKindState(next);
    onViewChange?.({ query, kind: next });
  };
  const found = React.useMemo(
    () => findBuildings(area.key, query).filter((b) => kind === null || b.kind === kind),
    [area.key, query, kind],
  );

  if (all.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        <PushHeader context={t(strings.buildings.kicker)} onBack={onBack} />
        <Body size={14} colour={color.neutral700} style={{ paddingHorizontal: gutter }}>
          {t(strings.buildings.none_mapped)}
        </Body>
      </View>
    );
  }

  const typed = query.trim();
  // Only the kinds this campus actually has: an empty chip is a dead end.
  const kinds = KINDS.filter((k) => all.some((b) => b.kind === k));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} keyboardShouldPersistTaps="handled">
      <PushHeader context={t(strings.buildings.kicker)} onBack={onBack} />
      <View style={{ paddingHorizontal: gutter, paddingTop: 16, paddingBottom: 32 }}>
        <Heading size={26} tracking={-0.4}>{t(strings.buildings.title)}</Heading>
        <Body size={14} colour={color.neutral700} style={{ marginTop: 6 }}>{t(area.name)}</Body>
        <Body size={13} colour={color.neutral700} style={{ marginTop: 10 }}>{t(strings.buildings.find)}</Body>

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
            placeholder={t(strings.buildings.searchHint)}
            placeholderTextColor={color.neutral500}
            accessibilityLabel={t(strings.buildings.search)}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            style={{ flex: 1, fontSize: 17, paddingVertical: 12, color: color.text }}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={t(strings.buildings.clear)} hitSlop={12}>
              <X size={20} color={color.neutral600} strokeWidth={2.2} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 14 }}>
          <KindChip label={t(strings.buildings.all)} on={kind === null} onPress={() => setKind(null)} />
          {kinds.map((k) => (
            <KindChip
              key={k}
              label={t(strings.buildings.kind[k])}
              on={kind === k}
              onPress={() => setKind(kind === k ? null : k)}
            />
          ))}
        </ScrollView>

        <View accessibilityLiveRegion="polite">
          <Label size={10} tracking={0.12} colour={color.neutral600}>
            {typed || kind ? t(strings.buildings.found(found.length)) : t(strings.buildings.directory(all.length))}
          </Label>
        </View>

        {found.length === 0 ? (
          <Body size={14} colour={color.neutral700} style={{ marginTop: 12 }}>{t(strings.buildings.none(typed))}</Body>
        ) : null}
        {found.map((b) => (
          <BuildingRow key={b.id} building={b} onShowOnMap={() => onShowOnMap(b)} />
        ))}

        {/* What this cannot answer, said once rather than guessed at per row. */}
        <Body size={13} colour={color.neutral600} style={{ marginTop: 18 }}>{t(strings.buildings.noFloors)}</Body>
        <Label size={9} tracking={0.02} colour={color.neutral600} style={{ marginTop: 6, textTransform: 'none' }}>
          {t(strings.buildings.readOn(BUILDINGS_READ_ON))}
        </Label>
      </View>
    </ScrollView>
  );
}

function KindChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={{
        minHeight: 40, paddingHorizontal: 14, borderRadius: 20, justifyContent: 'center',
        borderWidth: 2, borderColor: on ? color.text : '#CBE7F0',
        backgroundColor: on ? color.text : color.surface,
      }}
    >
      <Body size={14} colour={on ? onFill.text : color.text} style={{ fontWeight: '700' }}>{label}</Body>
    </Pressable>
  );
}

function BuildingRow({ building, onShowOnMap }: { building: CampusBuilding; onShowOnMap: () => void }) {
  const name = buildingLabel(building);
  return (
    <View
      style={[shadow.card, {
        marginTop: 10, padding: 12, gap: 10,
        backgroundColor: color.surface, borderRadius: radius.md,
        borderWidth: 1, borderColor: '#DCEFF5',
      }]}
    >
      <View>
        <Heading size={16}>{name}</Heading>
        <Label size={9} tracking={0.06} colour={color.neutral600} style={{ marginTop: 5, textTransform: 'none' }}>
          {/* The kind, and the feature it was read from, so the row can be checked against the map. */}
          {`${t(strings.buildings.kind[building.kind])} · OpenStreetMap ${building.osm}`}
        </Label>
      </View>
      <Button
        label={t(strings.buildings.showOnMap)}
        accessibilityLabel={t(strings.buildings.showOneOnMap(name))}
        onPress={onShowOnMap}
        variant="secondary"
        height={40}
        icon={<MapPin size={16} color={color.brand} strokeWidth={2} />}
      />
    </View>
  );
}
