/**
 * Trip itinerary - a day the server planned.
 *
 * The prototype hard-codes six rows; the first build assembled them on the
 * client from saved places. Neither could answer the question that matters,
 * which is WHY this place at this hour. The plan now comes from
 * `POST /trip/plan`, where the traveller's profile, live air per place and
 * the quest geofences all are, and every row carries its own reason.
 *
 * The reason is the feature. A day plan nobody can argue with is a day plan
 * nobody can correct.
 */

import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import {
  strings,
  type ItineraryItem, type MonthOutlook, type PlanItem, type PriceForecast, type TripPlan,
} from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, layout, radius } from '../theme/index.ts';
import { Body, Heading, Label, Thai } from '../components/Type.tsx';
import { Tag } from '../components/Button.tsx';
import { PushHeader } from '../components/Shell.tsx';
import { EmptyState, ErrorState, LoadingState } from '../components/States.tsx';

export interface TripState {
  dayNumber: number;
  dateLabel: string;
  walkingKm: number;
  pointsToday: number;
  airLabel: string;
  items: ItineraryItem[];
}

type Energy = 'gentle' | 'moderate' | 'full';

const ENERGY_LABEL: Record<Energy, { en: string; th: string }> = {
  gentle: { en: 'Gentle', th: 'เบา' },
  moderate: { en: 'Moderate', th: 'ปานกลาง' },
  full: { en: 'Full day', th: 'เต็มวัน' },
};

export function TripScreen({
  trip, onBack, onOpenPlace, onOpenQuest,
}: {
  /** Day number and date only; every row now comes from the server. */
  trip: TripState;
  onBack: () => void;
  onOpenPlace?: (id: string) => void;
  onOpenQuest?: (id: string) => void;
}) {
  const [energy, setEnergy] = React.useState<Energy | null>(null);
  const plan = useAsync(() => api.planTrip(energy ?? undefined), [energy]);
  const prices = useAsync(() => api.prices('stay'), []);

  return (
    <View style={{ flex: 1 }}>
      <PushHeader
        context={strings.trip.context(trip.dayNumber, trip.dateLabel).en}
        onBack={onBack}
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        <EnergyPicker
          value={energy ?? plan.data?.energy ?? 'moderate'}
          onChange={setEnergy}
        />

        {plan.loading ? <LoadingState /> : null}
        {plan.error ? <ErrorState message={plan.error} onRetry={plan.reload} /> : null}

        {plan.data ? (
          <>
            <View
              style={{
                flexDirection: 'row',
                gap: 14,
                paddingHorizontal: gutter,
                paddingVertical: 18,
                borderBottomWidth: 1,
                borderBottomColor: color.neutral300,
              }}
            >
              <Stat
                label={strings.trip.walking.en}
                value={`${plan.data.walkingKm.toFixed(1)} km`}
              />
              <Stat
                label={strings.trip.pointsToday.en}
                value={`+${plan.data.pointsAvailable}`}
                accent
              />
              <Stat label="Fares" value={`฿${plan.data.fareTHB}`} />
            </View>

            {plan.data.items.length === 0 ? (
              <EmptyState en={strings.trip.empty.en} th={strings.trip.empty.th} />
            ) : null}

            {plan.data.items.map((item, i) => (
              <PlanRow
                key={`${item.time}-${i}`}
                item={item}
                onPress={
                  item.placeId && onOpenPlace ? () => onOpenPlace(item.placeId!)
                  : item.questId && onOpenQuest ? () => onOpenQuest(item.questId!)
                  : undefined
                }
              />
            ))}

            <Dropped dropped={plan.data.dropped} />
            <PriceOutlook data={prices.data} />
          </>
        ) : null}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

/** How much walking the traveller is up for TODAY, whatever their profile says. */
function EnergyPicker({
  value, onChange,
}: { value: Energy; onChange: (e: Energy) => void }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: color.neutral300,
      }}
    >
      {(Object.keys(ENERGY_LABEL) as Energy[]).map((key) => {
        const active = key === value;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${ENERGY_LABEL[key].en} day`}
            style={{
              flex: 1,
              paddingVertical: 11,
              alignItems: 'center',
              backgroundColor: active ? color.accent : 'transparent',
            }}
          >
            <Label size={10} tracking={0.12} colour={active ? color.bg : color.neutral700}>
              {ENERGY_LABEL[key].en}
            </Label>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * One row of the day.
 *
 * Transit legs are drawn quieter and indented: they are how you get there,
 * not somewhere you go, and a plan that gives a songthaew the same weight as
 * a waterfall reads as a bus timetable.
 */
function PlanRow({ item, onPress }: { item: PlanItem; onPress?: () => void }) {
  const transit = item.kind === 'transit';
  const body = (
    <View
      style={{
        flexDirection: 'row',
        gap: 14,
        paddingVertical: transit ? 9 : 14,
        paddingHorizontal: gutter,
        paddingLeft: transit ? gutter + 22 : gutter,
        borderBottomWidth: 1,
        borderBottomColor: color.neutral300,
        opacity: transit ? 0.72 : 1,
      }}
    >
      <View style={{ width: 48 }}>
        <Heading size={transit ? 11 : 13} colour={transit ? color.neutral600 : color.text}>
          {item.time}
        </Heading>
      </View>
      <View style={{ flex: 1 }}>
        <Heading size={transit ? 12 : 15} colour={transit ? color.neutral600 : color.text}>
          {transit ? `${item.name.en} · ${item.km} km` : item.name.en}
        </Heading>

        {/*
          Moving, waiting and paying, split apart.
          The deck promises "เวลาต่อรถ" and a total that folds the wait into
          the ride is the lie that makes a plan wrong: a twelve-minute
          songthaew is not a twelve-minute journey when it comes every eight.
        */}
        {transit ? (
          <Body size={13} colour={color.neutral600} style={{ marginTop: 2 }}>
            {[
              `${item.minutes - (item.waitMinutes ?? 0)} min moving`,
              (item.waitMinutes ?? 0) > 0 ? `${item.waitMinutes} min wait` : null,
              (item.fareTHB ?? 0) > 0 ? `฿${item.fareTHB}` : 'free',
            ].filter(Boolean).join(' · ')}
          </Body>
        ) : null}
        {!transit ? (
          <Thai size={11} style={{ marginTop: 2 }}>{item.name.th}</Thai>
        ) : null}

        {/* The reason. This is the whole point of planning it server-side. */}
        <Body size={13} colour={color.neutral600} style={{ marginTop: transit ? 2 : 6 }}>
          {item.why.en}
        </Body>

        {!transit ? (
          <View style={{ flexDirection: 'row', marginTop: 8 }}>
            <Tag accent={item.isPointsRelated}>{item.tag}</Tag>
          </View>
        ) : null}
      </View>
    </View>
  );

  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

/**
 * What the planner refused to schedule, and why.
 *
 * Leaving it out would make "we watched the air for you" unfalsifiable: a day
 * with no mention of a place looks the same whether we considered it or never
 * knew it existed.
 */
function Dropped({ dropped }: { dropped: TripPlan['dropped'] }) {
  if (dropped.length === 0) return null;
  return (
    <View style={{ paddingHorizontal: gutter, paddingTop: 20 }}>
      <Label size={10} tracking={0.14} colour={color.neutral600}>
        Left out of today
      </Label>
      {dropped.map((d) => (
        <View
          key={d.name.en}
          style={{
            marginTop: 10,
            padding: 12,
            borderWidth: 1,
            borderColor: color.neutral400,
            borderRadius: radius.sm,
          }}
        >
          <Heading size={13} colour={color.neutral700}>{d.name.en}</Heading>
          <Body size={13} colour={color.neutral600} style={{ marginTop: 4 }}>
            {d.reason.en}
          </Body>
          <Thai size={10} style={{ marginTop: 3 }}>{d.reason.th}</Thai>
        </View>
      ))}
    </View>
  );
}

function Stat({
  label, value, accent = false,
}: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Label size={10} tracking={0.12}>{label}</Label>
      <Heading size={18} colour={accent ? color.accent700 : color.text} style={{ marginTop: 4 }}>
        {value}
      </Heading>
    </View>
  );
}

/**
 * What a night costs, and when it costs least.
 *
 * A band, never a number, with its confidence and its caveat both on screen.
 * People budget against this, so the two things it must never do are quote a
 * price and hide how sure it is.
 */
function PriceOutlook({
  data,
}: {
  data: { today: PriceForecast; outlook: MonthOutlook[]; cheapest: MonthOutlook | null } | null;
}) {
  if (!data) return null;
  const { today, outlook, cheapest } = data;
  const peak = Math.max(...outlook.map((m) => m.band.high), 1);

  return (
    <View style={{ marginTop: 26, borderTopWidth: layout.ruleStrong, borderTopColor: color.text }}>
      <View style={{ paddingHorizontal: gutter, paddingTop: 18 }}>
        <Label size={10} tracking={0.16}>A night on Samui · ราคาที่พักต่อคืน</Label>

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 8 }}>
          <Heading size={30} colour={color.accent}>
            {`฿${today.band.low.toLocaleString()}–${today.band.high.toLocaleString()}`}
          </Heading>
          <Label size={9} tracking={0.12} colour={color.neutral600} style={{ marginBottom: 8 }}>
            {today.confidence.toUpperCase()}
          </Label>
        </View>

        {/* What moved it. A forecast nobody can argue with cannot be corrected. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {today.drivers.map((d) => (
            <View
              key={d.label.en}
              style={{
                paddingVertical: 5,
                paddingHorizontal: 10,
                borderWidth: 1,
                borderColor: d.effect > 1.25 ? color.accent2 : color.neutral400,
                borderRadius: radius.lg,
              }}
            >
              <Label size={9} tracking={0.08} colour={color.neutral700}>
                {`${d.label.en} ${d.effect > 1 ? '+' : '−'}${Math.abs(Math.round((d.effect - 1) * 100))}%`}
              </Label>
            </View>
          ))}
        </View>
      </View>

      {/* Six months, so somebody can see WHEN to come, not only what today costs. */}
      <View style={{ paddingHorizontal: gutter, paddingTop: 18 }}>
        {outlook.map((m) => {
          const best = cheapest?.month === m.month;
          return (
            <View key={m.month} style={{ marginTop: 9 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                <Body size={13} colour={best ? color.accent : color.neutral700}>
                  {`${m.month}  ${m.label.en}${m.hasFestival ? ' · festival' : ''}`}
                </Body>
                <Body size={13} colour={best ? color.accent : color.neutral600}>
                  {`฿${m.band.typical.toLocaleString()}`}
                </Body>
              </View>
              <View style={{ height: 4, backgroundColor: color.neutral300, marginTop: 4 }}>
                <View
                  style={{
                    width: `${Math.round((m.band.typical / peak) * 100)}%`,
                    height: '100%',
                    backgroundColor: best ? color.accent : color.neutral500,
                  }}
                />
              </View>
            </View>
          );
        })}
      </View>

      <View style={{ paddingHorizontal: gutter, paddingTop: 16 }}>
        <Body size={13} colour={color.neutral600}>{today.caveat.en}</Body>
        <Thai size={10} style={{ marginTop: 4 }}>{today.caveat.th}</Thai>
      </View>
    </View>
  );
}
