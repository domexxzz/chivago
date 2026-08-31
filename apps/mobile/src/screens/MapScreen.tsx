/**
 * Smart Map - the hero screen.
 *
 * Healthy Score pins over Koh Samui, the layer filter, and the quests-near-you
 * card. Scores arrive already computed and personalised from the API; the
 * client never calculates one, so the number here and the number in the ESG
 * report come from the same code path.
 */

import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { ChevronRight, LayoutGrid, List } from 'lucide-react-native';
import { strings, type Balances, type Quest, type ScoredPlace } from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync, type LayerKey } from '../state/store.tsx';
import { color, gutter, layout, radius } from '../theme/index.ts';
import { Body, Heading, Label, Thai } from '../components/Type.tsx';
import { Button, IconButton } from '../components/Button.tsx';
import { LayerChips, PlaceFeedRow, SamuiMap, type MapMode } from '../components/SamuiMap.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';

export function MapScreen({
  layers, onToggleLayer, onPlanDay, onOpenPlace, onOpenQuest, onSeeAllQuests, balances,
}: {
  layers: Record<LayerKey, boolean>;
  onToggleLayer: (key: LayerKey) => void;
  onPlanDay: () => void;
  onOpenPlace: (id: string) => void;
  onOpenQuest: (id: string) => void;
  onSeeAllQuests: () => void;
  balances: Balances;
}) {
  const places = useAsync(() => api.places(), []);
  const quests = useAsync(() => api.quests('today'), []);
  const [mode, setMode] = React.useState<MapMode>('map');

  const visible = (places.data ?? []).filter((p) => layers[p.layer]);

  return (
    <ScrollView showsVerticalScrollIndicator={false} stickyHeaderIndices={[0]}>
      <MapHeader
        balances={balances}
        mode={mode}
        onToggleMode={() => setMode(mode === 'map' ? 'feed' : 'map')}
      />

      {places.loading ? <LoadingState /> : null}
      {places.error ? <ErrorState message={places.error} onRetry={places.reload} /> : null}

      {places.data ? (
        <>
          <LayerChips layers={layers} onToggle={(k) => onToggleLayer(k as LayerKey)} />
          {mode === 'map' ? (
            <SamuiMap places={visible} onSelect={(p) => onOpenPlace(p.id)} />
          ) : (
            <View>
              <View style={{ paddingHorizontal: gutter, paddingVertical: 10 }}>
                <View
                  style={{
                    alignSelf: 'flex-start',
                    backgroundColor: color.text,
                    paddingVertical: 4,
                    paddingHorizontal: 8,
                    borderRadius: radius.sm,
                  }}
                >
                  <Label size={10} tracking={0.14} colour={color.bg}>
                    {strings.map.liveNear(visible.length).en}
                  </Label>
                </View>
              </View>
              {[...visible]
                .sort((a, b) => b.healthyScore - a.healthyScore)
                .map((p) => (
                  <PlaceFeedRow key={p.id} place={p} onPress={() => onOpenPlace(p.id)} />
                ))}
            </View>
          )}
          {visible.length === 0 ? (
            <View style={{ padding: gutter }}>
              <Body colour={color.neutral700}>No places match the active layers.</Body>
            </View>
          ) : null}
        </>
      ) : null}

      {/*
        The planner's front door.
        It was reachable only by saving a place first, which meant the one
        feature that answers "what should I do today" could not be found by
        anyone asking that question.
      */}
      <Pressable
        onPress={onPlanDay}
        accessibilityRole="button"
        accessibilityLabel="Plan my day"
        style={{
          marginTop: 16,
          marginHorizontal: gutter,
          padding: 16,
          borderWidth: layout.ruleStrong,
          borderColor: color.accent,
          borderRadius: radius.md,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <Heading size={17} colour={color.accent}>{strings.trip.planCta.en}</Heading>
          <Thai size={11} style={{ marginTop: 3 }}>{strings.trip.planCta.th}</Thai>
          <Body size={13} colour={color.neutral600} style={{ marginTop: 6 }}>
            {strings.trip.planBlurb.en}
          </Body>
        </View>
        <ChevronRight size={20} color={color.accent} strokeWidth={2} />
      </Pressable>

      <QuestsNearYou
        quests={quests.data?.quests ?? []}
        error={quests.error}
        onRetry={quests.reload}
        onOpen={onOpenQuest}
        onSeeAll={onSeeAllQuests}
      />
    </ScrollView>
  );
}

export function MapHeader({
  balances, mode, onToggleMode,
}: { balances: Balances; mode: MapMode; onToggleMode: () => void }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        paddingHorizontal: gutter,
        paddingTop: 16,
        paddingBottom: 12,
        backgroundColor: color.bg,
      }}
    >
      <View style={{ flex: 1 }}>
        <Label size={10} tracking={0.16}>{strings.map.greeting('John').en}</Label>
        <Heading size={24} tracking={-0.48} style={{ marginTop: 4 }}>{strings.map.island.en}</Heading>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {/* Handoff open question 1: the feed is a peer treatment, not a hidden
            debug switch, so the toggle ships. */}
        <IconButton
          onPress={onToggleMode}
          accessibilityLabel={mode === 'map' ? 'Switch to list view' : 'Switch to map view'}
        >
          {mode === 'map'
            ? <List size={16} color={color.text} strokeWidth={2} />
            : <LayoutGrid size={16} color={color.text} strokeWidth={2} />}
        </IconButton>

        <View
          style={{
            borderLeftWidth: layout.ruleStrong,
            borderLeftColor: color.text,
            paddingLeft: 10,
          }}
        >
          {/* Both currencies. One figure here would silently be the wrong
              one half the time, and a check-in that moves nothing visible
              reads as a check-in that failed. */}
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Heading size={22} colour={color.accent700}>
              {`${balances.green.toLocaleString('en-US')} G`}
            </Heading>
            <Heading size={14} colour={color.neutral700}>
              {`${balances.trip.toLocaleString('en-US')} T`}
            </Heading>
          </View>
          {/* "GREEN POINTS" sat under BOTH figures — describing one of them and
              lying about the other. The letter now rides on each number, the
              same way the marketplace does it, and the caption names what the
              pair actually is. */}
          <Label size={9} tracking={0.12}>{strings.wallet.balance.en}</Label>
        </View>
      </View>
    </View>
  );
}

export function QuestsNearYou({
  quests, error = null, onRetry, onOpen, onSeeAll,
}: {
  quests: Quest[];
  /**
   * A failed quest fetch has to say so. Without this the strip renders its
   * heading over nothing, which reads as "there is nothing on today" - and a
   * traveller who believes that closes the app.
   */
  error?: string | null;
  onRetry?: () => void;
  onOpen: (id: string) => void;
  onSeeAll: () => void;
}) {
  const top = quests[0];
  return (
    <View style={{ paddingHorizontal: gutter, paddingTop: 16, paddingBottom: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Label size={10} tracking={0.16}>{strings.map.questsNearYou.en}</Label>
        <Button label={strings.common.seeAll.en} onPress={onSeeAll} variant="ghost" />
      </View>

      {top ? (
        <View
          style={{
            borderWidth: layout.ruleStrong,
            borderColor: color.text,
            borderRadius: radius.md,
            padding: 14,
            marginTop: 10,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Heading size={17}>{top.name.en}</Heading>
              <Thai size={11} style={{ marginTop: 3 }}>{`${top.name.th} · ${top.where}`}</Thai>
            </View>
            <View style={{ backgroundColor: color.accent, paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.sm }}>
              <Heading size={13} colour={color.bg}>
                {`+${top.rewardPoints} ${top.rewardCurrency === 'green' ? 'G' : 'T'}`}
              </Heading>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 14, marginTop: 12 }}>
            <Label size={11} tracking={0} style={{ textTransform: 'none' }}>{top.where}</Label>
            <Label size={11} tracking={0} style={{ textTransform: 'none' }}>{top.duration}</Label>
          </View>

          <Button
            label={strings.quest.ctaJoin.en}
            onPress={() => onOpen(top.id)}
            height={44}
            style={{ marginTop: 12 }}
            icon={<ChevronRight size={18} color={color.bg} strokeWidth={2} />}
          />
        </View>
      ) : null}

      {error ? <ErrorState message={error} onRetry={onRetry} /> : null}
    </View>
  );
}
