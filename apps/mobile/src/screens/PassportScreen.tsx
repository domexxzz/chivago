/**
 * The passport. Seventy-seven stamps, two of them earnable today.
 *
 * The design shows a stamp grid and the line เก็บให้ครบทั่วไทย. That promise
 * only survives contact with a traveller from Nong Khai if the whole country
 * is really here — so it is, and each province says which of three things it
 * is:
 *
 *   STAMPED   they have been. Derived from the ledger, through the place they
 *             checked in at. Never a record the passport keeps for itself.
 *   OPEN      the app has real places, measured metrics and a host who can
 *             verify. Two provinces. Go and it counts.
 *   LISTED    real, findable, and not yet opened. Seventy-five of them.
 *
 * The third state is the one most products would hide behind a "coming soon"
 * screen or, worse, fill with plausible content. Showing it plainly is what
 * makes the other two mean anything: a stamp is worth having because it could
 * not have been given away.
 *
 * The denominator is 77 and never the two we happen to have opened. "2 of 2"
 * would flatter the app and lie about the size of the thing being collected.
 */

import React from 'react';
import { ScrollView, View } from 'react-native';
import {
  PROVINCES, REGIONS, passportProgress, provincesIn,
  type Province, type Region,
} from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, layout, radius } from '../theme/index.ts';
import { Body, Heading, Label, Thai } from '../components/Type.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';

type StampState = 'stamped' | 'open' | 'listed';

const stateOf = (p: Province, visited: Set<string>): StampState =>
  (visited.has(p.code) ? 'stamped' : p.status === 'open' ? 'open' : 'listed');

export function PassportScreen() {
  const passport = useAsync(() => api.passport(), []);
  const visited = new Set(passport.data?.visited ?? []);
  const progress = passportProgress([...visited]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} showsVerticalScrollIndicator={false}>
      {/*
        The inverted panel — the one dark surface in a light app, used where a
        screen has a single headline number worth stopping on.
      */}
      <View
        style={{
          margin: gutter,
          padding: 22,
          borderRadius: radius.md,
          backgroundColor: color.paper,
        }}
      >
        <Label size={10} tracking={0.16} colour={color.brandSoft}>
          Province passport · พาสปอร์ตจังหวัด
        </Label>

        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 10 }}>
          <Heading size={44} colour={color.surface} tracking={-1}>
            {progress.visited}
          </Heading>
          <Heading size={20} colour={color.brandSoft}>{`/ ${progress.total}`}</Heading>
        </View>

        <Body size={13} colour={color.brandSoft} style={{ marginTop: 6 }}>
          {`${progress.open} provinces are open today. The rest of Thailand is listed and not yet built.`}
        </Body>
        <Thai size={11} colour={color.brandSoft} style={{ marginTop: 4 }}>
          เก็บให้ครบทั่วไทย · เปิดแล้ว {progress.open} จังหวัด
        </Thai>
      </View>

      {passport.loading ? <LoadingState /> : null}
      {passport.error ? (
        <ErrorState message={passport.error} onRetry={passport.reload} />
      ) : null}

      <Legend />

      {REGIONS.map((region) => (
        <RegionBlock
          key={region.key}
          region={region}
          visited={visited}
          count={progress.byRegion.find((r) => r.region.key === region.key)!}
        />
      ))}

      <View style={{ paddingHorizontal: gutter, paddingTop: 18, paddingBottom: 36 }}>
        <Label size={9} tracking={0.06} colour={color.neutral600} style={{ textTransform: 'none' }}>
          A province opens when it has real places, measured air and crowding, a
          licensed photograph and a host who can verify a quest. Not before.
        </Label>
      </View>
    </ScrollView>
  );
}

function Legend() {
  const items: [StampState, string, string][] = [
    ['stamped', 'Been', 'ไปมาแล้ว'],
    ['open', 'Open', 'เปิดแล้ว'],
    ['listed', 'Not yet', 'ยังไม่เปิด'],
  ];
  return (
    <View style={{ flexDirection: 'row', gap: 16, paddingHorizontal: gutter, paddingBottom: 4 }}>
      {items.map(([state, en, th]) => (
        <View key={state} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View
            style={{
              width: 12, height: 12, borderRadius: 3,
              borderWidth: state === 'stamped' ? 0 : 1,
              borderColor: state === 'open' ? color.accent : color.neutral400,
              backgroundColor: state === 'stamped' ? color.accent : 'transparent',
            }}
          />
          <Label size={9} tracking={0.06} colour={color.neutral700}>{`${en} · ${th}`}</Label>
        </View>
      ))}
    </View>
  );
}

function RegionBlock({
  region, visited, count,
}: {
  region: Region;
  visited: Set<string>;
  count: { visited: number; total: number };
}) {
  return (
    <View style={{ marginTop: 20, paddingHorizontal: gutter }}>
      <View
        style={{
          flexDirection: 'row', alignItems: 'baseline', gap: 10,
          paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: color.divider,
        }}
      >
        <Heading size={15}>{region.name.en}</Heading>
        <Thai size={11} colour={color.neutral700}>{region.name.th}</Thai>
        <Label
          size={9}
          tracking={0.08}
          colour={count.visited > 0 ? color.accent700 : color.neutral600}
          style={{ marginLeft: 'auto' }}
        >
          {`${count.visited} / ${count.total}`}
        </Label>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {provincesIn(region.key).map((p) => (
          <Stamp key={p.code} province={p} state={stateOf(p, visited)} />
        ))}
      </View>
    </View>
  );
}

/**
 * One province.
 *
 * A stamp, not a card: small, repeatable seventy-seven times, and legible as a
 * set rather than as a list. The three states differ in weight rather than in
 * shape, so the grid still reads as one country.
 */
function Stamp({ province, state }: { province: Province; state: StampState }) {
  const stamped = state === 'stamped';
  const open = state === 'open';

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={
        `${province.name.en}. ${
          stamped ? 'Visited' : open ? 'Open, not yet visited' : 'Not open yet'
        }.`
      }
      style={{
        minWidth: 96,
        paddingVertical: 9,
        paddingHorizontal: 11,
        borderRadius: radius.sm,
        borderWidth: stamped ? 0 : open ? layout.ruleStrong : 1,
        borderColor: open ? color.accent : color.neutral300,
        backgroundColor: stamped ? color.accent : color.surface,
        // Listed provinces recede. They are present and findable, not offered.
        opacity: state === 'listed' ? 0.55 : 1,
      }}
    >
      <Thai
        size={12}
        colour={stamped ? color.surface : open ? color.accent700 : color.neutral700}
      >
        {province.name.th}
      </Thai>
      <Label
        size={9}
        tracking={0.06}
        colour={stamped ? color.accent100 : color.neutral600}
        style={{ marginTop: 2, textTransform: 'none' }}
      >
        {province.name.en}
      </Label>
    </View>
  );
}

/** Every province appears exactly once, and the grid is the whole country. */
export const PASSPORT_TOTAL = PROVINCES.length;
