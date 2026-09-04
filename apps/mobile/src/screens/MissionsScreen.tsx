/**
 * Missions.
 *
 * Missions are posted by municipalities, NGOs, hotels and community groups —
 * the host is named on every row, because "who is vouching for this" is the
 * whole trust model.
 *
 * Under the list sit the two things the design asks for, and both of them are
 * traps if built the obvious way:
 *
 * THE LEADERBOARD ranks HOSTS, not travellers, and on APPROVALS, not points.
 * Two reasons, either of which alone would be enough. Ranking travellers by
 * points would rank them partly on Trip Points, which are self-verified — a
 * board that pays people to claim. And there is exactly one traveller on this
 * island, so a ranking of them is a mirror; `isRankable` in core makes the
 * screen say that rather than draw a podium with one step.
 *
 * PARTNER REWARDS show what the points actually buy, which is the half that
 * makes the missions worth doing. Priced in the currency each offer really
 * takes, so a Green-priced reward cannot be bought with self-reported points.
 */

import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { isRankable, strings, type HostStanding, type Offer, type Quest, type QuestProgress } from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, currencyTone, gutter, layout, onFill, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { EmptyState, ErrorState, LoadingState } from '../components/States.tsx';
import { t } from '../i18n/locale.ts';

type Filter = 'today' | 'weekend' | 'all';

export function MissionsScreen({
  onOpen, onOpenMarket,
}: { onOpen: (id: string) => void; onOpenMarket: () => void }) {
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
        <Heading size={26} tracking={-0.52}>{t(strings.quests.title)}</Heading>

      </View>

      <SegmentedFilter value={filter} total={all.length} onChange={setFilter} />

      {data.loading ? <LoadingState /> : null}
      {data.error ? <ErrorState message={data.error} onRetry={data.reload} /> : null}

      {!data.loading && visible.length === 0 ? (
        <EmptyState en={t(strings.quests.empty)} th={strings.quests.empty.th} />
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
        <Body size={13} colour={color.neutral700}>{t(strings.quests.footer)}</Body>

      </View>

      <Standing />
      <PartnerRewards onOpenMarket={onOpenMarket} />
      <View style={{ height: 28 }} />
    </ScrollView>
  );
}

function SegmentedFilter({
  value, total, onChange,
}: { value: Filter; total: number; onChange: (f: Filter) => void }) {
  const options: [Filter, string][] = [
    ['today', t(strings.quests.filters.today)],
    ['weekend', t(strings.quests.filters.weekend)],
    ['all', `${t(strings.quests.filters.all)} ${total}`],
  ];
  return (
    <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: gutter, paddingBottom: 6 }}>
      {options.map(([key, label]) => {
        const active = key === value;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={{
              minHeight: 36,
              paddingVertical: 8,
              paddingHorizontal: 16,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.lg,
              // A filter is the app sorting its own list. Brand, not evidence.
              backgroundColor: active ? color.brand : color.surface,
              borderWidth: 1,
              borderColor: active ? color.brand : color.neutral300,
            }}
          >
            <Label size={11} tracking={0.06} colour={active ? onFill.brand : color.neutral700} style={{ textTransform: 'none' }}>{label}</Label>
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
        `${t(quest.name)}, ${quest.rewardPoints} `
        + `${quest.rewardCurrency === 'green' ? 'Green' : 'Trip'} Points, `
        + `at ${t(quest.where)}, by ${quest.host.name}`
      }
      style={[shadow.card, {
        flexDirection: 'row',
        gap: 14,
        padding: 14,
        marginHorizontal: gutter,
        marginTop: 10,
        backgroundColor: color.surface,
        borderRadius: radius.md,
      }]}
    >
      {/* The quest code in a 44x44 tile. This IS the system's icon - do not
          swap in an illustration. */}
      <View
        style={{
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: color.brandSoft,
          borderRadius: radius.sm,
        }}
      >
        <Heading size={11} colour={color.brand}>{quest.code}</Heading>
      </View>

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Heading size={16}>{t(quest.name)}</Heading>

          </View>
          {/*
            Coloured by CURRENCY, not by "this is a reward". A Trip Point
            reward in the verified green told the traveller a host had checked
            something before they had even left the list screen.
          */}
          <View style={{ backgroundColor: currencyTone(quest.rewardCurrency).fill, paddingVertical: 3, paddingHorizontal: 9, borderRadius: radius.lg }}>
            <Heading size={13} colour={currencyTone(quest.rewardCurrency).on}>
              {`+${quest.rewardPoints} ${quest.rewardCurrency === 'green' ? 'G' : 'T'}`}
            </Heading>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
          <Label size={11} tracking={0} style={{ textTransform: 'none' }}>{t(quest.where)}</Label>
          <Label size={11} tracking={0} style={{ textTransform: 'none' }}>{t(quest.duration)}</Label>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <Label size={10} tracking={0.1}>{t(strings.quests.by(quest.host.name))}</Label>
          {/* Progress is surfaced on the row so a half-finished quest is not
              lost behind a tap. The design has no such affordance. */}
          {progress && progress.stage !== 'complete' ? (
            <Label size={10} tracking={0.1} colour={color.accent700}>{`· ${t({ en: 'In progress', th: 'กำลังทำอยู่' })}`}</Label>
          ) : null}
          {progress?.stage === 'complete' ? (
            <Label size={10} tracking={0.1} colour={color.accent700}>{`· ${t({ en: 'Done', th: 'เสร็จแล้ว' })}`}</Label>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Who is doing the work
// ---------------------------------------------------------------------------

/**
 * The board.
 *
 * Hosts, ranked on submissions they approved. The basis is printed under the
 * table rather than assumed, because a leaderboard whose basis is unstated is
 * one the reader will read as "points" — the single reading this one most
 * needs to prevent.
 */
function Standing() {
  const standing = useAsync(() => api.standing(), []);
  const data = standing.data;

  return (
    <View style={{ paddingTop: 8 }}>
      <View style={{ paddingHorizontal: gutter, paddingBottom: 10 }}>
        <Label size={10} tracking={0.14}>{t({ en: 'Who is doing the work', th: 'ใครลงแรงบ้าง' })}</Label>

      </View>

      {standing.error ? (
        <ErrorState message={standing.error} onRetry={standing.reload} />
      ) : standing.loading || !data ? (
        <Body size={13} colour={color.neutral600} style={{ paddingHorizontal: gutter }}>
          {t(strings.common.loading)}
        </Body>
      ) : (
        <>
          {/*
            Your own record, and it is a RECORD rather than a rank: with one
            traveller on the island a position would be meaningless, and with
            a thousand it would still be the wrong thing to lead with here.
          */}
          {data.you ? (
            <View
              style={{
                marginHorizontal: gutter, marginBottom: 12, padding: 14,
                backgroundColor: color.brandSoft, borderRadius: radius.md,
              }}
            >
              <Label size={9} tracking={0.12} colour={color.brandDeep}>{t({ en: 'YOUR RECORD', th: 'ผลงานของคุณ' })}</Label>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
                <Heading size={26} colour={color.brandDeep}>{data.you.missionsVerified}</Heading>
                <Body size={13} colour={color.brandDeep}>
                  {t({
                    en: `mission${data.you.missionsVerified === 1 ? '' : 's'} verified · ${data.you.greenVerified.toLocaleString('en-US')} G earned`,
                    th: `ครั้งที่ผ่านการตรวจ · ได้ ${data.you.greenVerified.toLocaleString('en-US')} แต้มเขียว`,
                  })}
                </Body>
              </View>
            </View>
          ) : null}

          {/*
            Said plainly. Drawing a traveller ranking with one participant
            would be the app inventing a crowd, which is the same lie as
            inventing a number.
          */}
          {!isRankable(data.participants) ? (
            <View style={{ paddingHorizontal: gutter, paddingBottom: 12 }}>
              <Body size={13} colour={color.neutral700}>
                {t({
                  en: data.participants === 1
                    ? 'One traveller has verified points so far, so there is no traveller ranking yet. The hosts below are real.'
                    : 'Nobody has verified points yet, so there is no traveller ranking. The hosts below are real.',
                  th: 'ยังจัดอันดับนักเดินทางไม่ได้ เพราะยังมีคนน้อยเกินไป ผู้จัดภารกิจด้านล่างเป็นของจริง',
                })}
              </Body>
            </View>
          ) : null}

          {data.hosts.map((host, i) => (
            <HostRow key={host.hostId} host={host} place={i + 1} />
          ))}

          <View style={{ paddingHorizontal: gutter, paddingTop: 12 }}>
            <Label size={9} tracking={0.04} colour={color.neutral600} style={{ textTransform: 'none' }}>
              {t(data.rankedBy)}
            </Label>

          </View>
        </>
      )}
    </View>
  );
}

function HostRow({ host, place }: { host: HostStanding; place: number }) {
  const idle = host.verified === 0;
  return (
    <View
      accessibilityLabel={`${place}. ${host.name}. ${host.verified} verified, ${host.questsPosted} posted`}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: gutter, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: color.neutral300,
      }}
    >
      <Heading size={15} colour={idle ? color.neutral500 : color.text} style={{ width: 22 }}>
        {String(place).padStart(2, '0')}
      </Heading>

      <View style={{ flex: 1 }}>
        <Heading size={15}>{host.name}</Heading>
        <Label size={9} tracking={0.06} colour={color.neutral600} style={{ marginTop: 3, textTransform: 'none' }}>
          {/*
            A host with no approvals is shown as WAITING rather than losing.
            They have put a mission on the island and nobody has done it — the
            useful thing to say about them is that they need travellers sent
            to them, not that they came last.
          */}
          {idle
            ? t({
              en: `${host.questsPosted} posted · waiting for a first submission`,
              th: `ตั้งไว้ ${host.questsPosted} ภารกิจ · ยังไม่มีใครส่งหลักฐาน`,
            })
            : t({
              en: `${host.questsPosted} posted · ${host.pending} awaiting review`,
              th: `ตั้งไว้ ${host.questsPosted} ภารกิจ · รอตรวจ ${host.pending}`,
            })}
        </Label>
      </View>

      <View style={{ alignItems: 'flex-end' }}>
        <Heading size={17} colour={idle ? color.neutral500 : color.accent700}>{host.verified}</Heading>
        <Label size={9} tracking={0.08} colour={color.neutral600}>{t(strings.quest.verified)}</Label>
        {host.greenIssued > 0 ? (
          <Label size={9} tracking={0.06} colour={color.accent700} style={{ marginTop: 2 }}>
            {`${host.greenIssued.toLocaleString('en-US')} G`}
          </Label>
        ) : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// What the points buy
// ---------------------------------------------------------------------------

const REWARD_PREVIEW = 3;

/**
 * The other half of a mission.
 *
 * A points system with nothing to spend points on is a scoreboard, and the
 * partners here are local businesses whose participation is the actual point
 * of the currency. Each offer is priced in the currency it really takes, so a
 * Green-priced reward visibly cannot be bought with self-reported points.
 */
function PartnerRewards({ onOpenMarket }: { onOpenMarket: () => void }) {
  const offers = useAsync(() => api.offers(), []);
  const wallet = useAsync(() => api.wallet(), []);
  const balances = wallet.data?.balances ?? null;

  const list = (offers.data ?? []).filter((o) => o.available);
  const affordable = (o: Offer) => balances != null && balances[o.currency] >= o.costPoints;

  // Cheapest first, so the top of the list is what somebody can most nearly
  // afford rather than the most expensive thing we would like them to want.
  const shown = [...list].sort((a, b) => a.costPoints - b.costPoints).slice(0, REWARD_PREVIEW);

  return (
    <View style={{ paddingTop: 24 }}>
      <View style={{ paddingHorizontal: gutter, paddingBottom: 10 }}>
        <Label size={10} tracking={0.14}>{t({ en: 'What the points buy', th: 'แลกอะไรได้บ้าง' })}</Label>

      </View>

      {offers.error ? (
        <ErrorState message={offers.error} onRetry={offers.reload} />
      ) : offers.loading ? (
        <Body size={13} colour={color.neutral600} style={{ paddingHorizontal: gutter }}>{t(strings.common.loading)}</Body>
      ) : shown.length === 0 ? (
        <Body size={13} colour={color.neutral700} style={{ paddingHorizontal: gutter }}>
          {t({ en: 'No partner rewards are available right now.', th: 'ตอนนี้ยังไม่มีสิทธิพิเศษจากพาร์ตเนอร์' })}
        </Body>
      ) : (
        <>
          {shown.map((o) => {
            const tone = currencyTone(o.currency);
            const canBuy = affordable(o);
            return (
              <Pressable
                key={o.id}
                onPress={onOpenMarket}
                accessibilityRole="button"
                accessibilityLabel={`${o.name}, ${o.merchant}, ${o.costPoints} ${o.currency === 'green' ? 'Green' : 'Trip'} points. ${canBuy ? 'Affordable' : 'Not enough points'}`}
                style={{
                  marginHorizontal: gutter, marginBottom: 8, padding: 13,
                  backgroundColor: color.surface, borderRadius: radius.md,
                  borderWidth: 1, borderColor: color.neutral300,
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Heading size={15}>{o.name}</Heading>
                  <Label size={9} tracking={0.06} colour={color.neutral600} style={{ marginTop: 3, textTransform: 'none' }}>
                    {o.merchant}
                  </Label>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Heading size={14} colour={canBuy ? tone.text : color.neutral500}>
                    {`${o.costPoints.toLocaleString('en-US')} ${o.currency === 'green' ? 'G' : 'T'}`}
                  </Heading>
                  {/*
                    The gap, not a lock icon. "480 more" is a number somebody
                    can act on; a padlock only says no.
                  */}
                  {balances != null && !canBuy ? (
                    <Label size={9} tracking={0.06} colour={color.neutral600} style={{ marginTop: 2, textTransform: 'none' }}>
                      {`${(o.costPoints - balances[o.currency]).toLocaleString('en-US')} more`}
                    </Label>
                  ) : null}
                </View>
              </Pressable>
            );
          })}

          <Pressable
            onPress={onOpenMarket}
            accessibilityRole="button"
            accessibilityLabel={`See all ${list.length} partner rewards`}
            style={{
              marginHorizontal: gutter, minHeight: 44,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            }}
          >
            <Label size={10} tracking={0.12} colour={color.brand}>
              {`ALL ${list.length} REWARDS · ดูทั้งหมด`}
            </Label>
            <ChevronRight size={16} color={color.brand} strokeWidth={2} />
          </Pressable>
        </>
      )}
    </View>
  );
}
