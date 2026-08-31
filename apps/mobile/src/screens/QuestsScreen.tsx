/**
 * Green Quest list.
 *
 * Quests are posted by municipalities, NGOs, hotels and community groups - the
 * host is named on every row, because "who is vouching for this" is the whole
 * trust model.
 */

import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { strings, type Quest, type QuestProgress } from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, layout, radius } from '../theme/index.ts';
import { Body, Heading, Label, Thai } from '../components/Type.tsx';
import { EmptyState, ErrorState, LoadingState } from '../components/States.tsx';

type Filter = 'today' | 'weekend' | 'all';

export function QuestsScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const [filter, setFilter] = React.useState<Filter>('today');

  // Fetch ALL quests once and filter locally. Two reasons:
  //  - the "All 24" segment must show the TOTAL, not the current filter's
  //    count; refetching per filter made it read "All 2" while showing today's
  //    two quests;
  //  - an island has tens of quests, not thousands, so switching filters should
  //    be instant rather than a network round-trip on a weak beach signal.
  const data = useAsync(() => api.quests(), []);

  const all = data.data?.quests ?? [];
  const visible = filter === 'all' ? all : all.filter((q) => q.kind === filter);

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={{ paddingHorizontal: gutter, paddingTop: 18, paddingBottom: 14 }}>
        <Heading size={26} tracking={-0.52}>{strings.quests.title.en}</Heading>
        <Thai size={11} style={{ marginTop: 4 }}>{strings.quests.subtitle.th}</Thai>
      </View>

      <SegmentedFilter value={filter} total={all.length} onChange={setFilter} />

      {data.loading ? <LoadingState /> : null}
      {data.error ? <ErrorState message={data.error} onRetry={data.reload} /> : null}

      {!data.loading && visible.length === 0 ? (
        <EmptyState en={strings.quests.empty.en} th={strings.quests.empty.th} />
      ) : null}

      {visible.map((quest) => (
        <QuestRow
          key={quest.id}
          quest={quest}
          progress={data.data?.progress[quest.id] ?? null}
          onPress={() => onOpen(quest.id)}
        />
      ))}

      <View style={{ paddingHorizontal: gutter, paddingVertical: 20 }}>
        <Body size={13} colour={color.neutral700}>{strings.quests.footer.en}</Body>
        <Thai size={11} style={{ marginTop: 8 }}>{strings.quests.footer.th}</Thai>
      </View>
    </ScrollView>
  );
}

function SegmentedFilter({
  value, total, onChange,
}: { value: Filter; total: number; onChange: (f: Filter) => void }) {
  const options: [Filter, string][] = [
    ['today', strings.quests.filters.today.en],
    ['weekend', strings.quests.filters.weekend.en],
    ['all', `${strings.quests.filters.all.en} ${total}`],
  ];
  return (
    <View
      style={{
        flexDirection: 'row',
        borderTopWidth: layout.ruleStrong,
        borderTopColor: color.text,
        borderBottomWidth: 1,
        borderBottomColor: color.neutral300,
      }}
    >
      {options.map(([key, label], i) => {
        const active = key === value;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={{
              flex: 1,
              paddingVertical: 9,
              paddingHorizontal: 4,
              alignItems: 'center',
              backgroundColor: active ? color.accent : 'transparent',
              borderRightWidth: i < options.length - 1 ? 1 : 0,
              borderRightColor: color.neutral300,
            }}
          >
            <Label size={11} tracking={0.1} colour={active ? color.bg : color.neutral700}>{label}</Label>
          </Pressable>
        );
      })}
    </View>
  );
}

export function QuestRow({
  quest, progress, onPress,
}: { quest: Quest; progress: QuestProgress | null; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        `${quest.name.en}, ${quest.rewardPoints} `
        + `${quest.rewardCurrency === 'green' ? 'Green' : 'Trip'} Points, `
        + `at ${quest.where}, by ${quest.host.name}`
      }
      style={{
        flexDirection: 'row',
        gap: 14,
        paddingVertical: 16,
        paddingHorizontal: gutter,
        borderBottomWidth: 1,
        borderBottomColor: color.neutral300,
      }}
    >
      {/* The quest code in a 44x44 ink square. This IS the system's icon -
          do not swap in an illustration. */}
      <View
        style={{
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: layout.ruleStrong,
          borderColor: color.text,
          borderRadius: radius.sm,
        }}
      >
        <Heading size={11}>{quest.code}</Heading>
      </View>

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Heading size={16}>{quest.name.en}</Heading>
            <Thai size={11} style={{ marginTop: 2 }}>{quest.name.th}</Thai>
          </View>
          <View style={{ backgroundColor: color.accent, paddingVertical: 3, paddingHorizontal: 7, borderRadius: radius.sm }}>
            <Heading size={13} colour={color.bg}>
              {`+${quest.rewardPoints} ${quest.rewardCurrency === 'green' ? 'G' : 'T'}`}
            </Heading>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
          <Label size={11} tracking={0} style={{ textTransform: 'none' }}>{quest.where}</Label>
          <Label size={11} tracking={0} style={{ textTransform: 'none' }}>{quest.duration}</Label>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <Label size={10} tracking={0.1}>{strings.quests.by(quest.host.name).en}</Label>
          {/* Progress is surfaced on the row so a half-finished quest is not
              lost behind a tap. The design has no such affordance. */}
          {progress && progress.stage !== 'complete' ? (
            <Label size={10} tracking={0.1} colour={color.accent700}>· IN PROGRESS</Label>
          ) : null}
          {progress?.stage === 'complete' ? (
            <Label size={10} tracking={0.1} colour={color.accent700}>· DONE</Label>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
