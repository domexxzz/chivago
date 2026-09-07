/**
 * Profile.
 *
 * One screen for the traveller's own record: the name the account was
 * registered with, the level and the rank, how far to the next one, where
 * they stand among the people whose work a host has checked, the companions
 * their visits grew, and the two figures that follow them everywhere -
 * verified points and provinces. Reached from the button at the top of Home.
 *
 * Nothing here is new data. Every figure is already on the wallet, the
 * passport or the standing; this is the one place they sit together, which
 * is what a profile is for.
 *
 * What it refuses to do, on purpose:
 *
 *  - invent a name or a face. The name is the display name the account was
 *    registered with ("Traveller" unless the phone said otherwise) and the
 *    picture is the companion the traveller actually grew - an egg, if that
 *    is as far as it got, and nobody's stock portrait.
 *  - draw a podium for one person. A position is shown only when the island
 *    has enough participants for a ranking to mean anything (`isRankable`),
 *    and the basis of the ranking is printed under it either way.
 */

import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import {
  Compass, Crown, Footprints, Leaf, MapPinned, Settings, Sprout, TreePalm, UserRound,
} from 'lucide-react-native';
// On its own line: the test stub generator reads the braces above for names.
import type { LucideIcon } from 'lucide-react-native';
import {
  MIN_FOR_RANKING, expAtLevel, isRankable, levelProgressPct, passportProgress, strings,
  type Bilingual, type Companion, type RankKey, type TravellerStanding, type Wallet,
} from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync, type Async } from '../state/store.tsx';
import { bar, color, gutter, layout, onFill, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { IconButton } from '../components/Button.tsx';
import { Creature } from '../components/Creature.tsx';
import { PushHeader } from '../components/Shell.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { STAGE_LABEL } from './CompanionHome.tsx';
import { t } from '../i18n/locale.ts';

type Icon = LucideIcon;

/**
 * One drawn mark per rank. The wallet's ladder keeps its numerals; the
 * profile is the one screen where the ranks are the subject rather than a
 * footnote, and five identical squares do not read as a path.
 */
const RANK_ICON: Record<RankKey, Icon> = {
  newcomer: Sprout,
  wanderer: Footprints,
  islandExplorer: Compass,
  samuiInsider: TreePalm,
  chivaLegend: Crown,
};

interface StandingView {
  you: TravellerStanding | null;
  participants: number;
  position: number | null;
  rankedBy: Bilingual;
}

interface CompanionsView {
  companions: Companion[];
  summary: { found: number; total: number; grown: number };
}

const STAGE_ORDER: Record<Companion['stage'], number> = { grown: 2, hatchling: 1, egg: 0 };

/** The companion that stands for the traveller: the most grown, or the first egg. */
export function leadCompanion(list: Companion[]): Companion | null {
  return [...list].sort((a, b) => STAGE_ORDER[b.stage] - STAGE_ORDER[a.stage])[0] ?? null;
}

const companionName = (c: Companion): string =>
  c.stage === 'egg' ? t(c.species.eggName) : t(c.species.name);

export function ProfileScreen({
  onBack, onOpenAccount, onOpenWallet, onOpenPassport, onOpenCompanion,
}: {
  onBack: () => void;
  onOpenAccount: () => void;
  onOpenWallet: () => void;
  onOpenPassport: () => void;
  onOpenCompanion: (c: Companion) => void;
}) {
  const wallet = useAsync(() => api.wallet(), []);
  const standing = useAsync(() => api.standing(), []);
  const passport = useAsync(() => api.passport(), []);
  const companions = useAsync(() => api.companions(), []);
  const lead = companions.data ? leadCompanion(companions.data.companions) : null;
  const name = standing.data?.you?.displayName ?? null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} showsVerticalScrollIndicator={false}>
      <PushHeader
        context={t(strings.profile.context)}
        onBack={onBack}
        right={(
          <IconButton onPress={onOpenAccount} accessibilityLabel={t(strings.profile.account)}>
            <Settings size={16} color={color.text} strokeWidth={2} />
          </IconButton>
        )}
      />

      {wallet.error ? <ErrorState message={wallet.error} onRetry={wallet.reload} /> : null}
      {wallet.loading && !wallet.data ? <LoadingState /> : null}
      {wallet.data ? (
        <>
          <Identity wallet={wallet.data} name={name} lead={lead} />
          <Experience wallet={wallet.data} />
          <RankPath wallet={wallet.data} />
        </>
      ) : null}

      <StandingBlock standing={standing} />
      <CompanionsBlock companions={companions} onOpenCompanion={onOpenCompanion} onSeeAll={onOpenWallet} />
      <Figures wallet={wallet} passport={passport} onOpenWallet={onOpenWallet} onOpenPassport={onOpenPassport} />
      <View style={{ height: 28 }} />
    </ScrollView>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={[shadow.card, {
        marginHorizontal: gutter, marginTop: 12, padding: 16,
        backgroundColor: color.surface, borderRadius: radius.md,
      }]}
    >
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Who: the name, the picture, the rank and the level
// ---------------------------------------------------------------------------

function Identity({ wallet, name, lead }: { wallet: Wallet; name: string | null; lead: Companion | null }) {
  const p = wallet.progression;
  return (
    <View style={{ paddingHorizontal: gutter, paddingTop: 4 }}>
      {/* The band is the app speaking (brand); the card overlaps it, as the conditions card does on Home. */}
      <View style={{ height: 64, backgroundColor: color.brand, borderRadius: radius.md }} />
      <View
        style={[shadow.card, {
          marginTop: -32, marginHorizontal: 10, padding: 16,
          backgroundColor: color.surface, borderRadius: radius.md,
          flexDirection: 'row', alignItems: 'center', gap: 14,
        }]}
      >
        <Avatar lead={lead} />
        <View style={{ flex: 1 }}>
          <Heading size={20} tracking={-0.3}>{name ?? t(strings.profile.traveller)}</Heading>
          <Body size={13} colour={color.neutral700} style={{ marginTop: 2 }}>{t(p.rank.label)}</Body>
          {/* Gold: the level is the game layer, earned by activity, never a host's word. */}
          <View
            style={{
              alignSelf: 'flex-start', marginTop: 8, paddingVertical: 4, paddingHorizontal: 10,
              borderRadius: radius.lg, backgroundColor: color.goldSoft, borderWidth: 1, borderColor: color.gold,
            }}
          >
            <Label size={9} tracking={0.12} colour={color.goldDeep}>
              {t(strings.profile.levelChip(p.level, p.exp))}
            </Label>
          </View>
        </View>
      </View>
    </View>
  );
}

function Avatar({ lead }: { lead: Companion | null }) {
  const said = lead ? `${companionName(lead)}, ${t(STAGE_LABEL[lead.stage])}` : t(strings.profile.traveller);
  return (
    <View
      accessibilityLabel={said}
      style={[shadow.card, {
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: lead?.stage === 'grown' ? color.accent100 : color.neutral100,
        borderWidth: 3, borderColor: color.surface,
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }]}
    >
      {lead
        ? <Creature species={lead.species.key} stage={lead.stage} size={56} />
        : <UserRound size={30} color={color.neutral600} strokeWidth={1.8} />}
    </View>
  );
}

// ---------------------------------------------------------------------------
// How far: lifetime EXP, the level bar, the distance to the next rank
// ---------------------------------------------------------------------------

function Experience({ wallet }: { wallet: Wallet }) {
  const p = wallet.progression;
  const pct = levelProgressPct(p.exp);
  const toRank = p.nextRankAtLevel === null ? null : Math.max(0, expAtLevel(p.nextRankAtLevel) - p.exp);
  const b = bar(pct, color.gold, 10);
  return (
    <Card>
      <Label size={10} tracking={0.14}>{t(strings.profile.experience)}</Label>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
        <Heading size={34} tracking={-0.7}>{p.exp.toLocaleString('en-US')}</Heading>
        <Label size={11} tracking={0.1} colour={color.goldDeep}>EXP</Label>
        <View style={{ flex: 1 }} />
        <Label size={11} tracking={0} colour={color.goldDeep} style={{ textTransform: 'none' }}>{`${pct}%`}</Label>
      </View>
      <View style={[b.track, { marginTop: 8 }]}><View style={b.fill} /></View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
        <Label size={9} tracking={0.06} colour={color.neutral700} style={{ textTransform: 'none' }}>
          {t(strings.wallet.levelBar(p.intoLevel, p.levelSpan))}
        </Label>
        <Label size={9} tracking={0.06} colour={color.neutral700} style={{ textTransform: 'none', flexShrink: 1, textAlign: 'right' }}>
          {p.nextRank && toRank !== null
            ? t(strings.profile.expToRank(toRank, t(p.nextRank.label)))
            : t(strings.wallet.topRank)}
        </Label>
      </View>
      <Label size={9} tracking={0.06} colour={color.neutral600} style={{ marginTop: 6 }}>
        {t(strings.wallet.expNote)}
      </Label>
    </Card>
  );
}

/** The five ranks as a path: earned marks filled, the current one ringed, the rest to come. */
function RankPath({ wallet }: { wallet: Wallet }) {
  const p = wallet.progression;
  const n = p.ladder.length;
  const current = Math.max(0, p.ladder.findIndex((r) => r.key === p.rank.key));
  // Centres sit at (2i + 1) / 2n of the row; the line runs centre to centre.
  const edge = 100 / (2 * n);
  const reached = (current * 100) / n;
  return (
    <Card>
      <Label size={10} tracking={0.14}>{t(strings.profile.ranks)}</Label>
      <View style={{ marginTop: 14 }}>
        <View style={{ position: 'absolute', top: 19, height: 2, left: `${edge}%` as `${number}%`, right: `${edge}%` as `${number}%`, backgroundColor: color.neutral300 }} />
        <View style={{ position: 'absolute', top: 19, height: 2, left: `${edge}%` as `${number}%`, width: `${reached}%` as `${number}%`, backgroundColor: color.gold }} />
        <View style={{ flexDirection: 'row' }}>
          {p.ladder.map((rank) => <RankMark key={rank.key} rank={rank} current={rank.key === p.rank.key} />)}
        </View>
      </View>
    </Card>
  );
}

function RankMark({ rank, current }: { rank: Wallet['progression']['ladder'][number]; current: boolean }) {
  const Mark = RANK_ICON[rank.key];
  const state = rank.earned ? t(strings.profile.reached) : t(strings.profile.lockedUntil(rank.fromLevel));
  return (
    <View accessibilityLabel={`${t(rank.label)}, ${state}`} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
      <View
        style={{
          width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
          backgroundColor: rank.earned ? color.gold : color.surface,
          borderWidth: current ? 3 : layout.ruleStrong,
          borderColor: rank.earned ? (current ? color.goldDeep : color.gold) : color.neutral400,
        }}
      >
        <Mark size={18} color={rank.earned ? onFill.gold : color.neutral500} strokeWidth={2} />
      </View>
      <Label
        size={9}
        tracking={0.04}
        colour={current ? color.goldDeep : rank.earned ? color.text : color.neutral500}
        style={{ textAlign: 'center', textTransform: 'none' }}
      >
        {t(rank.label)}
      </Label>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Where they stand: the only ranking this product draws, and its basis
// ---------------------------------------------------------------------------

function StandingBlock({ standing }: { standing: Async<StandingView> }) {
  return (
    <Card>
      <Label size={10} tracking={0.14}>{t(strings.profile.standing)}</Label>
      {standing.error ? <ErrorState message={standing.error} onRetry={standing.reload} /> : null}
      {standing.loading && !standing.data ? <LoadingState /> : null}
      {standing.data ? <StandingBody data={standing.data} /> : null}
    </Card>
  );
}

function StandingBody({ data }: { data: StandingView }) {
  const { you, participants, position } = data;
  const ranked = position !== null && isRankable(participants);
  return (
    <>
      {ranked ? (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
          <Heading size={34} tracking={-0.7} colour={color.accent700}>{`#${position}`}</Heading>
          <Body size={14} colour={color.neutral700}>{t(strings.profile.of(participants))}</Body>
        </View>
      ) : (
        <Body size={14} colour={color.neutral800} style={{ marginTop: 6 }}>
          {position === null
            ? t(strings.profile.noVerifiedYet)
            : t(strings.profile.notRankable(participants, MIN_FOR_RANKING))}
        </Body>
      )}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <Stat value={(you?.greenVerified ?? 0).toLocaleString('en-US')} unit="G" label={t(strings.profile.verifiedPoints)} tone={color.accent700} />
        <Stat value={String(you?.missionsVerified ?? 0)} unit="" label={t(strings.profile.missionsVerified)} tone={color.text} />
      </View>
      {/* The basis, on the screen rather than assumed - the reading this ranking most needs to prevent is "points". */}
      <Label size={9} tracking={0.04} colour={color.neutral600} style={{ marginTop: 10, textTransform: 'none' }}>
        {t(data.rankedBy)}
      </Label>
    </>
  );
}

function Stat({ value, unit, label, tone }: { value: string; unit: string; label: string; tone: string }) {
  return (
    <View style={{ flex: 1, padding: 12, backgroundColor: color.neutral100, borderRadius: radius.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Heading size={20} colour={tone}>{value}</Heading>
        {unit ? <Label size={9} tracking={0.08} colour={color.neutral600}>{unit}</Label> : null}
      </View>
      <Label size={9} tracking={0.06} colour={color.neutral700} style={{ marginTop: 4, textTransform: 'none' }}>{label}</Label>
    </View>
  );
}

// ---------------------------------------------------------------------------
// What their visits grew
// ---------------------------------------------------------------------------

function CompanionsBlock({
  companions, onOpenCompanion, onSeeAll,
}: {
  companions: Async<CompanionsView>;
  onOpenCompanion: (c: Companion) => void;
  onSeeAll: () => void;
}) {
  const data = companions.data;
  const title = t(strings.profile.companions);
  return (
    <View style={{ paddingTop: 18 }}>
      <View style={{ paddingHorizontal: gutter, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Heading size={16}>{title}</Heading>
        <Pressable
          onPress={onSeeAll}
          accessibilityRole="button"
          accessibilityLabel={`${t(strings.common.seeAll)}: ${title}`}
          style={{ minHeight: 28, justifyContent: 'center' }}
        >
          <Label size={10} tracking={0.1} colour={color.brand}>
            {data ? `${data.summary.found}/${data.summary.total} · ${t(strings.common.seeAll)}` : t(strings.common.seeAll)}
          </Label>
        </Pressable>
      </View>

      {companions.error ? <ErrorState message={companions.error} onRetry={companions.reload} /> : null}
      {data && data.companions.length === 0 ? (
        // Not five locked slots: an empty collection with a lever you cannot see is the shape of a slot machine.
        <Body size={13} colour={color.neutral700} style={{ paddingHorizontal: gutter, marginTop: 8 }}>
          {t(strings.profile.companionsEmpty)}
        </Body>
      ) : null}
      {data && data.companions.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: gutter, marginTop: 8 }}>
          {data.companions.map((c) => (
            <CompanionTile key={c.species.key} companion={c} onPress={() => onOpenCompanion(c)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function CompanionTile({ companion: c, onPress }: { companion: Companion; onPress: () => void }) {
  const name = companionName(c);
  const grown = c.stage === 'grown';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${t(STAGE_LABEL[c.stage])}`}
      style={[shadow.card, {
        flexBasis: '30%', flexGrow: 1, alignItems: 'center', padding: 12,
        backgroundColor: color.surface, borderRadius: radius.md,
        borderWidth: grown ? layout.ruleStrong : 1, borderColor: grown ? color.accent : color.neutral300,
      }]}
    >
      <View
        style={{
          width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
          backgroundColor: grown ? color.accent100 : color.neutral100,
        }}
      >
        <Creature species={c.species.key} stage={c.stage} size={48} />
      </View>
      <Heading size={13} style={{ marginTop: 8, textAlign: 'center' }}>{name}</Heading>
      <Label size={9} tracking={0.1} colour={grown ? color.accent700 : color.neutral600} style={{ marginTop: 2 }}>
        {t(STAGE_LABEL[c.stage])}
      </Label>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// What follows them everywhere: the verified purse and the passport
// ---------------------------------------------------------------------------

function Figures({
  wallet, passport, onOpenWallet, onOpenPassport,
}: {
  wallet: Async<Wallet>;
  passport: Async<{ visited: string[] }>;
  onOpenWallet: () => void;
  onOpenPassport: () => void;
}) {
  const green = wallet.data?.balances.green ?? null;
  const stamps = passport.data ? passportProgress(passport.data.visited) : null;
  return (
    <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: gutter, marginTop: 18 }}>
      <Tile
        Mark={Leaf}
        tone={color.accent700}
        soft={color.accent100}
        value={green === null ? '—' : green.toLocaleString('en-US')}
        unit="G"
        label={t(strings.common.greenPoints)}
        note={t(strings.common.greenPointsNote)}
        onPress={onOpenWallet}
      />
      <Tile
        Mark={MapPinned}
        tone={color.brand}
        soft={color.brandSoft}
        value={stamps ? String(stamps.visited) : '—'}
        unit={stamps ? `/ ${stamps.total}` : ''}
        label={t(strings.profile.passport)}
        note={t(strings.profile.provinces)}
        onPress={onOpenPassport}
      />
    </View>
  );
}

/** One figure in a tappable card. `—` when unknown, which is not the same as 0. */
function Tile({
  Mark, tone, soft, value, unit, label, note, onPress,
}: {
  Mark: Icon; tone: string; soft: string; value: string; unit: string; label: string; note: string; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value} ${unit}`.trim()}
      style={[shadow.card, { flex: 1, minHeight: 44, padding: 14, backgroundColor: color.surface, borderRadius: radius.md }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: soft }}>
          <Mark size={16} color={tone} strokeWidth={2} />
        </View>
        <Label size={9} tracking={0.08} colour={color.neutral700} style={{ flex: 1 }}>{label}</Label>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 10 }}>
        <Heading size={24} colour={tone}>{value}</Heading>
        {unit ? <Label size={10} tracking={0.08} colour={color.neutral600}>{unit}</Label> : null}
      </View>
      <Label size={9} tracking={0.06} colour={color.neutral600} style={{ marginTop: 4, textTransform: 'none' }}>{note}</Label>
    </Pressable>
  );
}
