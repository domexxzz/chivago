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
import { Pressable, ScrollView, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import {
  PROVINCES, REGIONS, passportProgress, provinceCollection, provinceCompanions, provincesIn, strings,
  type Province, type ProvinceCompanion, type Region,
} from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, layout, radius } from '../theme/index.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { t } from '../i18n/locale.ts';

/** `noted` is a stamp on the traveller's word - recorded, not scored. Drawn dashed. */
type StampState = 'stamped' | 'noted' | 'open' | 'listed';

const stateOf = (p: Province, visited: Set<string>, noted: Set<string>): StampState =>
  (visited.has(p.code) ? 'stamped'
    : noted.has(p.code) ? 'noted'
      : p.status === 'open' ? 'open' : 'listed');

export function PassportScreen({ onOpenMascots }: { onOpenMascots?: () => void } = {}) {
  const passport = useAsync(() => api.passport(), []);
  const visited = new Set(passport.data?.visited ?? []);
  // Kept apart from `visited` all the way down: the count above the grid is
  // of stamps a geofence gave, and a self-issued one must not inflate it.
  const noted = new Set(passport.data?.selfReported ?? []);
  const progress = passportProgress([...visited]);

  /*
    The companions are assembled HERE, from the small evidence payload plus the
    country and species lists the client already ships. Seventy-five of the
    seventy-seven are sealed eggs, and sending seventy-five rows over a beach
    connection to say "nothing here" would be paying to be told the app's own
    static data.
  */
  const companions = provinceCompanions(passport.data?.evidence ?? []);
  const byCode = new Map(companions.map((c) => [c.province.code, c]));
  const collection = provinceCollection(companions);

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
        <Label size={10} tracking={0.16} colour={color.brandSoft}>{t({ en: 'Province passport', th: 'พาสปอร์ตจังหวัด' })}</Label>

        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 10 }}>
          <Heading size={44} colour={color.surface} tracking={-1}>
            {progress.visited}
          </Heading>
          <Heading size={20} colour={color.brandSoft}>{`/ ${progress.total}`}</Heading>
        </View>

        <Body size={13} colour={color.brandSoft} style={{ marginTop: 6 }}>
          {t({
            en: `${progress.open} provinces are open today. The rest of Thailand is listed and not yet built.`,
            th: `เปิดแล้ว ${progress.open} จังหวัดในวันนี้ จังหวัดที่เหลือทั่วไทยมีอยู่ในรายการแต่ยังไม่เปิด`,
          })}
        </Body>

        {/*
          The collection, on the same panel as the stamps, because they are the
          same seventy-seven things counted twice — where you have been, and
          what is living there because you went.
        */}
        <View
          style={{
            flexDirection: 'row', gap: 18, marginTop: 16,
            paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.18)',
          }}
        >
          <HeroFigure value={collection.found} label="Companions" thai="เพื่อนร่วมทาง" />
          <HeroFigure value={collection.grown} label="Grown" thai="โตเต็มวัย" />
          <HeroFigure value={collection.sealed} label="Sealed" thai="ยังไม่เปิด" />
        </View>
      </View>

      {/* The field guide: every province's mascot, shown, with a stamp on the ones reached. */}
      {onOpenMascots ? (
        <Pressable
          onPress={onOpenMascots}
          accessibilityRole="button"
          accessibilityLabel={t(strings.mascots.door)}
          style={{
            marginHorizontal: gutter, marginBottom: 4, padding: 14, borderRadius: radius.md,
            borderWidth: layout.ruleHair, borderColor: color.neutral300, backgroundColor: color.surface,
            flexDirection: 'row', alignItems: 'center', gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Heading size={15}>{t(strings.mascots.title)}</Heading>
            <Body size={13} colour={color.neutral600} style={{ marginTop: 2 }}>{t(strings.mascots.door)}</Body>
          </View>
          <ChevronRight size={18} color={color.text} strokeWidth={2} />
        </Pressable>
      ) : null}

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
          noted={noted}
          byCode={byCode}
          count={progress.byRegion.find((r) => r.region.key === region.key)!}
        />
      ))}

      <View style={{ paddingHorizontal: gutter, paddingTop: 18, paddingBottom: 36 }}>
        <Label size={9} tracking={0.06} colour={color.neutral600} style={{ textTransform: 'none' }}>
          {t({
            en: 'A province opens when it has real places, measured air and crowding, a licensed photograph and a host who can verify a quest. Not before.',
            th: 'จังหวัดจะเปิดเมื่อมีสถานที่จริง ค่าอากาศและความหนาแน่นที่วัดได้ ภาพถ่ายที่มีสิทธิ์ใช้ และผู้จัดที่ตรวจภารกิจได้ ไม่เปิดก่อนหน้านั้น',
          })}
        </Label>
      </View>
    </ScrollView>
  );
}

function Legend() {
  const items: [StampState, string, string][] = [
    ['stamped', 'Been', 'ไปมาแล้ว'],
    ['noted', 'Self-reported', 'บันทึกเอง'],
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
              borderStyle: state === 'noted' ? 'dashed' : 'solid',
              borderColor: state === 'open' ? color.accent : state === 'noted' ? color.neutral600 : color.neutral400,
              backgroundColor: state === 'stamped' ? color.accent : 'transparent',
            }}
          />
          <Label size={9} tracking={0.06} colour={color.neutral700}>{t({ en, th })}</Label>
        </View>
      ))}
    </View>
  );
}

function RegionBlock({
  region, visited, noted, count, byCode,
}: {
  region: Region;
  visited: Set<string>;
  noted: Set<string>;
  count: { visited: number; total: number };
  byCode: Map<string, ProvinceCompanion>;
}) {
  return (
    <View style={{ marginTop: 20, paddingHorizontal: gutter }}>
      <View
        style={{
          flexDirection: 'row', alignItems: 'baseline', gap: 10,
          paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: color.divider,
        }}
      >
        <Heading size={15}>{t(region.name)}</Heading>

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
          <Stamp
            key={p.code}
            province={p}
            state={stateOf(p, visited, noted)}
            companion={byCode.get(p.code) ?? null}
          />
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
function Stamp({
  province, state, companion,
}: { province: Province; state: StampState; companion: ProvinceCompanion | null }) {
  const stamped = state === 'stamped';
  const noted = state === 'noted';
  const open = state === 'open';

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={
        `${t(province.name)}. ${
          stamped ? 'Visited' : noted ? 'Self-reported visit, not verified' : open ? 'Open, not yet visited' : 'Not open yet'
        }.`
      }
      style={{
        minWidth: 96,
        paddingVertical: 9,
        paddingHorizontal: 11,
        borderRadius: radius.sm,
        borderWidth: stamped ? 0 : open ? layout.ruleStrong : 1,
        // Dashed: a claim, drawn as one. The solid stamps beside it keep
        // meaning what they meant.
        borderStyle: noted ? 'dashed' : 'solid',
        borderColor: open ? color.accent : noted ? color.neutral600 : color.neutral300,
        backgroundColor: stamped ? color.accent : color.surface,
        // Listed provinces recede. They are present and findable, not offered.
        opacity: state === 'listed' ? 0.55 : 1,
      }}
    >

      <Label
        size={9}
        tracking={0.06}
        colour={stamped ? color.accent100 : color.neutral600}
        style={{ marginTop: 2, textTransform: 'none' }}
      >
        {t(province.name)}
      </Label>

      {/*
        What is living there, and ONLY when it is actually known. A sealed
        province says nothing about its animal, because nobody has surveyed it
        — that silence is the honest half of a seventy-seven creature
        collection, and filling it with a guess is the whole thing this design
        refuses to do.
      */}
      {companion?.species ? (
        <Label
          size={9}
          tracking={0.04}
          colour={stamped ? color.surface : color.accent700}
          style={{ marginTop: 4, textTransform: 'none' }}
        >
          {`${STAGE_MARK[companion.state] ?? ''} ${t(companion.species.name)}`}
        </Label>
      ) : null}
    </View>
  );
}

/**
 * The ladder, as one character each.
 *
 * A word per stage would not fit seventy-seven times and a colour alone would
 * carry the whole meaning, which fails for anybody who cannot separate the
 * two greens. The mark is redundant with the colour on purpose.
 */
const STAGE_MARK: Partial<Record<ProvinceCompanion['state'], string>> = {
  egg: '○', hatchling: '◐', grown: '●',
};

/** One figure on the inverted hero panel. */
function HeroFigure({ value, label, thai }: { value: number; label: string; thai: string }) {
  return (
    <View>
      <Heading size={22} colour={color.surface}>{value}</Heading>
      <Label size={9} tracking={0.08} colour={color.brandSoft} style={{ marginTop: 2 }}>
        {thai ? t({ en: label, th: thai }) : label}
      </Label>
    </View>
  );
}

/** Every province appears exactly once, and the grid is the whole country. */
export const PASSPORT_TOTAL = PROVINCES.length;
