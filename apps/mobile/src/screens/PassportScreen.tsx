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
import { Check, ChevronRight, LockKeyhole, Map as MapIcon } from 'lucide-react-native';
import {
  PROVINCES, REGIONS, passportProgress, provinceCollection, provinceCompanions, provincesIn, strings,
  type Province, type ProvinceCompanion, type Region,
} from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, layout, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { PushHeader, TravelHeroBackdrop } from '../components/Shell.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { MascotPortrait } from '../components/MascotPortrait.tsx';
import { t } from '../i18n/locale.ts';

/** `noted` is a stamp on the traveller's word - recorded, not scored. Drawn dashed. */
type StampState = 'stamped' | 'noted' | 'open' | 'listed';

const stateOf = (p: Province, visited: Set<string>, noted: Set<string>): StampState =>
  (visited.has(p.code) ? 'stamped'
    : noted.has(p.code) ? 'noted'
      : p.status === 'open' ? 'open' : 'listed');

export function PassportScreen({ onBack, onOpenMascots }: { onBack?: () => void; onOpenMascots?: () => void } = {}) {
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
    <ScrollView style={{ flex: 1, backgroundColor: '#F4FBFC' }} contentContainerStyle={{ width: '100%', maxWidth: 760, alignSelf: 'center', paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
      {onBack ? <PushHeader context={t({ en: 'Thailand passport', th: 'พาสปอร์ตไทย', zh: '泰国护照' })} onBack={onBack} /> : (
        <View style={{ paddingHorizontal: gutter, paddingTop: 18, paddingBottom: 14, backgroundColor: color.surface }}>
          <Heading size={22} colour={color.brandDeep}>{t({ en: 'Thailand Passport', th: 'พาสปอร์ตไทย', zh: '泰国护照' })}</Heading>
        </View>
      )}

      {/* A travel cover with the paper passport sitting over the destination. */}
      <View
        style={[
          shadow.card,
          {
            height: 232,
            marginHorizontal: gutter,
            marginTop: 14,
            marginBottom: 26,
            borderRadius: 24,
            backgroundColor: color.brandDeep,
            overflow: 'hidden',
          },
        ]}
      >
        <TravelHeroBackdrop focalPoint="left" />
        <View style={{ position: 'absolute', left: 20, bottom: 22, maxWidth: '42%' }}>
          <Label size={9} tracking={0.16} colour="#D9F7FA">CHIVAGO</Label>
          <Heading size={22} colour="#FFFFFF" style={{ marginTop: 3 }}>
            {t({ en: 'Travel all over Thailand', th: 'เที่ยวไทยให้ครบทุกจังหวัด', zh: '畅游泰国每一府' })}
          </Heading>
        </View>
        <View
          style={{
            position: 'absolute', right: 18, top: 24, width: 164, height: 178,
            padding: 16, borderRadius: 12, backgroundColor: '#F5E8D1',
            borderWidth: 1, borderColor: '#D7B98C', transform: [{ rotate: '-4deg' }],
            shadowColor: '#003B52', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.24, shadowRadius: 16, elevation: 7,
          }}
        >
          <Label size={9} tracking={0.12} colour="#7B5534">KINGDOM OF THAILAND</Label>
          <Heading size={23} colour="#5F3D28" style={{ marginTop: 8 }}>Thailand</Heading>
          <Body size={13} colour="#7B5534">Travel Passport</Body>
          <View style={{ marginTop: 'auto', alignSelf: 'flex-end', width: 62, height: 62, borderRadius: 31, borderWidth: 3, borderColor: '#C96C56', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '11deg' }] }}>
            <Label size={9} tracking={0.08} colour="#C96C56" style={{ textAlign: 'center' }}>{`${progress.visited} / ${progress.total}\nVISITED`}</Label>
          </View>
        </View>
      </View>

      <View style={{ paddingHorizontal: gutter, marginBottom: 20 }}>
        <Heading size={21}>{t({ en: 'Provinces collected', th: 'จังหวัดที่สะสม', zh: '已收集的府' })}</Heading>
        <Body size={13} colour={color.neutral700} style={{ marginTop: 7 }}>
          {t({
            en: `${progress.open} provinces are open today. The rest of Thailand is listed and not yet built.`,
            th: `เปิดแล้ว ${progress.open} จังหวัด สะสมตราประทับจากการเดินทางจริงของคุณ`,
            zh: `今天已开放 ${progress.open} 个府，其余府已列出但尚未开放。`,
          })}
        </Body>
        <View style={{ flexDirection: 'row', gap: 26, marginTop: 16 }}>
          <HeroFigure value={collection.found} label={strings.mascots.bond.met.en} thai={strings.mascots.bond.met.th} chinese={strings.mascots.bond.met.zh} />
          <HeroFigure value={collection.grown} label={strings.mascots.bond.vouched.en} thai={strings.mascots.bond.vouched.th} chinese={strings.mascots.bond.vouched.zh} />
          <HeroFigure value={collection.sealed} label={strings.mascots.bond.unopened.en} thai={strings.mascots.bond.unopened.th} chinese={strings.mascots.bond.unopened.zh} />
        </View>
      </View>

      {/* The field guide: every province's mascot, shown, with a stamp on the ones reached. */}
      {onOpenMascots ? (
        <Pressable
          onPress={onOpenMascots}
          accessibilityRole="button"
          accessibilityLabel={t(strings.mascots.door)}
          // The same tile the Collect screen opens the seventy-seven from, so
          // the door looks like the same door wherever it is.
          style={[shadow.card, {
            marginHorizontal: gutter, marginBottom: 18, padding: 16, borderRadius: 20,
            backgroundColor: color.surface, borderWidth: 1, borderColor: '#CDEAF2',
            flexDirection: 'row', alignItems: 'center', gap: 12,
          }]}
        >
          <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#DDF4FA', alignItems: 'center', justifyContent: 'center' }}><MapIcon size={24} color={color.brand} strokeWidth={2} /></View>
          <View style={{ flex: 1 }}>
            <Label size={9} tracking={0.12} colour={color.brand}>{t({ en: 'COLLECTION', th: 'คอลเลกชัน', zh: '收藏' })}</Label><Heading size={16}>{t(strings.mascots.title)}</Heading>
            <Body size={13} colour={color.neutral700} style={{ marginTop: 2 }}>{t(strings.mascots.door)}</Body>
          </View>
          <ChevronRight size={20} color={color.brand} strokeWidth={2.2} />
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

      <View style={{ paddingHorizontal: gutter, paddingTop: 18, paddingBottom: 4 }}>
        <Label size={9} tracking={0.06} colour={color.neutral600} style={{ textTransform: 'none' }}>
          {t({
            en: 'An open province has mapped places and a named quest host. Air and crowd figures state their source; photos appear only when licensed.',
            th: 'จังหวัดที่เปิดมีสถานที่บนแผนที่และระบุผู้จัดภารกิจ ข้อมูลอากาศและความหนาแน่นบอกแหล่งที่มา ภาพถ่ายจะแสดงเมื่อมีสิทธิ์ใช้เท่านั้น',
            zh: '已开放的府有标注在地图上的地点和具名的任务主办方。空气与人流数据均注明来源；照片只在获得授权时显示。',
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
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, rowGap: 10, paddingHorizontal: gutter, paddingTop: 2, paddingBottom: 8 }}>
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
    <View style={{ marginTop: 22, paddingHorizontal: gutter }}>
      <View
        style={{
          flexDirection: 'row', alignItems: 'baseline', gap: 10,
          paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: color.divider,
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

      <View style={{ gap: 12, marginTop: 14 }}>
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
        width: '100%', minHeight: 72,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 16,
        borderWidth: stamped ? 2 : open ? layout.ruleStrong : 1,
        // Dashed: a claim, drawn as one. The solid stamps beside it keep
        // meaning what they meant.
        borderStyle: noted ? 'dashed' : 'solid',
        borderColor: open ? color.accent : noted ? color.neutral600 : color.neutral300,
        backgroundColor: stamped ? '#F1FFFA' : color.surface,
        // Listed provinces recede. They are present and findable, not offered.
        opacity: state === 'listed' ? 0.55 : 1,
      }}
    >

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {/*
        The province's own creature, on every card including the sealed ones.

        This used to print the habitat SPECIES, which meant seventy-seven
        cards shared five animals and two different provinces looked
        identical. The mascot is the province's emblem, all seventy-seven
        different, and public before anybody visits - so it can be drawn on
        a card nobody has earned yet without claiming anything. The species
        still exists and is still withheld until earned; it belongs to the
        habitat, and the place it is said is the companion room.
      */}
      {companion ? (
        <MascotPortrait mascot={companion.mascot} size={48} />
      ) : (
        <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#E8EEF0', alignItems: 'center', justifyContent: 'center' }}>
          <LockKeyhole size={20} color={color.neutral500} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Heading size={15}>{t(province.name)}</Heading>
        {companion ? (
          <>
          <Label size={9} tracking={0.04} colour={color.accent700} style={{ marginTop: 3, textTransform: 'none' }}>
            {`${BOND_MARK[companion.bond] ?? ''} ${t(companion.mascot.name)}`}
          </Label>
          {/* The level, only where there is one. Zero is not a level, it is a province nobody has been to. */}
          {companion.level > 0 ? (
            <Label
              size={9}
              tracking={0.04}
              colour={color.neutral600}
              style={{ marginTop: 1, textTransform: 'none' }}
            >
              {t(strings.mascots.level(companion.level))}
            </Label>
          ) : null}
          </>
        ) : <Body size={13} colour={color.neutral600}>{t({ en: 'Keep travelling to unlock', th: 'สะสมเพิ่มเพื่อปลดล็อก', zh: '继续旅行以解锁' })}</Body>}
      </View>
      <View style={{ minWidth: 72, alignItems: 'center', paddingVertical: 7, paddingHorizontal: 8, borderRadius: 12, borderWidth: 2, borderColor: stamped ? color.accent : open ? '#27A8A0' : color.neutral300, transform: [{ rotate: stamped || open ? '-4deg' : '0deg' }] }}>
        {stamped ? <Check size={15} color={color.accent700} strokeWidth={3} /> : null}
        <Label size={9} tracking={0.06} colour={stamped ? color.accent700 : open ? '#16837D' : color.neutral500} style={{ textAlign: 'center' }}>
          {stamped ? t({ en: 'COLLECTED', th: 'สะสมแล้ว', zh: '已收集' }) : open ? t({ en: 'OPEN', th: 'เปิดแล้ว', zh: '已开放' }) : t({ en: 'LOCKED', th: 'ล็อกอยู่', zh: '未解锁' })}
        </Label>
      </View>
      </View>
    </View>
  );
}

/**
 * The ladder, as one character each.
 *
 * A word per rung would not fit seventy-seven times and a colour alone would
 * carry the whole meaning, which fails for anybody who cannot separate the
 * two greens. The mark is redundant with the colour on purpose.
 *
 * `unopened` and `unmet` get nothing rather than an empty circle: a mark on
 * a province nobody can visit yet would read as progress that is available.
 */
const BOND_MARK: Partial<Record<ProvinceCompanion['bond'], string>> = {
  met: '○', known: '◐', vouched: '●',
};

/** One figure on the inverted hero panel. */
function HeroFigure({ value, label, thai, chinese }: { value: number; label: string; thai: string; chinese?: string }) {
  return (
    <View>
      <Heading size={20} colour={color.brandDeep}>{value}</Heading>
      <Label size={9} tracking={0.08} colour={color.neutral600} style={{ marginTop: 2 }}>
        {thai ? t({ en: label, th: thai, zh: chinese }) : label}
      </Label>
    </View>
  );
}

/** Every province appears exactly once, and the grid is the whole country. */
export const PASSPORT_TOTAL = PROVINCES.length;
