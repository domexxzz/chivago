/**
 * Home.
 *
 * Every travel app opens the same way: a hero photograph, a search bar, and a
 * grid of twelve icons. That Home is aspirational — it shows you a beach you
 * are not on and asks where you would like to go.
 *
 * This one opens with what is TRUE on the island right now, because measured
 * conditions are the only thing this product has that the others do not, and
 * burying them under a stock sunset would be throwing away the argument on the
 * first screen a judge sees.
 *
 * The order is the argument, the same way it is on the sponsor page:
 *
 *   1. What is true here now      measured, and labelled with its provenance
 *   2. What you can do today      real quests, yours first, honest when empty
 *   3. What you are carrying      the two purses, the passport, the companions
 *   4. Where else to go           four doors, not twelve
 *
 * INDEPENDENT FAILURE. Each block loads on its own `useAsync`, so a dead
 * /places does not blank the screen — the conditions block says it is down and
 * everything else still works. A Home that white-screens because one endpoint
 * failed is the worst screen in an app to lose, because it is the one someone
 * opens when they are lost.
 */

import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { ChevronRight, Compass, MessageCircle, Shield, Sparkles, Users } from 'lucide-react-native';
import {
  greetingFor, isHighScore, passportProgress, strings,
  type Quest, type QuestProgress, type ScoredPlace,
} from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, currencyTone, gutter, layout, radius } from '../theme/index.ts';
import { Body, Heading, Label, Thai } from '../components/Type.tsx';
import { Button } from '../components/Button.tsx';
import { ErrorState } from '../components/States.tsx';

const HOME_QUEST_LIMIT = 3;

/**
 * The island's condition, as one number.
 *
 * A mean of the measured Healthy Scores. It is a summary and says so — the
 * per-place numbers, which are the ones with a breakdown behind them, are one
 * tap away on the map. `null` when there is nothing to average, never 0: an
 * island with no data is not an island scoring zero.
 */
export function islandAverage(places: ScoredPlace[]): number | null {
  if (places.length === 0) return null;
  return Math.round(places.reduce((sum, p) => sum + p.healthyScore, 0) / places.length);
}

/**
 * The weakest provenance in the set, because a summary is only as fresh as its
 * stalest input. Reporting "Live" for an average that contains a stale reading
 * would be the average laundering the weakest number in it.
 */
export function weakestProvenance(places: ScoredPlace[]): 'live' | 'daily' | 'estimated' | 'stale' {
  const rank = { live: 0, daily: 1, estimated: 2, stale: 3 } as const;
  let worst: keyof typeof rank = 'live';
  for (const p of places) {
    for (const c of p.breakdown.components) {
      if (rank[c.provenance] > rank[worst]) worst = c.provenance;
    }
  }
  return worst;
}

/**
 * Yours first, then the rest in the server's order.
 *
 * This is NOT a recommendation and does not pretend to be one — it is the
 * traveller's own state, which is the only ranking this screen can justify
 * without a basis it does not have. Sorting by reward would be the app
 * recommending whatever it most wants done.
 */
export function questOrder(
  quests: Quest[], progress: Record<string, QuestProgress>,
): Quest[] {
  const started = (q: Quest) => {
    const p = progress[q.id];
    return p != null && p.stage !== 'complete';
  };
  return [...quests].sort((a, b) => Number(started(b)) - Number(started(a)));
}

export function HomeScreen({
  onOpenMap, onOpenQuests, onOpenQuest, onOpenWallet, onOpenPassport,
  onOpenImpact, onOpenConcierge, onOpenSafety, onOpenParty, now = new Date(),
}: {
  onOpenMap: () => void;
  onOpenQuests: () => void;
  onOpenQuest: (id: string) => void;
  onOpenWallet: () => void;
  onOpenPassport: () => void;
  onOpenImpact: () => void;
  onOpenConcierge: () => void;
  onOpenSafety: () => void;
  onOpenParty: () => void;
  /** Injected so the greeting is testable rather than whatever the clock says. */
  now?: Date;
}) {
  const places = useAsync(() => api.places(), []);
  const quests = useAsync(() => api.quests('today'), []);
  const wallet = useAsync(() => api.wallet(), []);
  const passport = useAsync(() => api.passport(), []);
  const companions = useAsync(() => api.companions(), []);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} showsVerticalScrollIndicator={false}>
      <Conditions now={now} places={places} onOpenMap={onOpenMap} />
      <Today quests={quests} onOpenQuest={onOpenQuest} onOpenQuests={onOpenQuests} />
      <Carrying
        wallet={wallet}
        passport={passport}
        companions={companions}
        onOpenWallet={onOpenWallet}
        onOpenPassport={onOpenPassport}
      />
      <Doors
        onOpenMap={onOpenMap}
        onOpenConcierge={onOpenConcierge}
        onOpenImpact={onOpenImpact}
        onOpenSafety={onOpenSafety}
        onOpenParty={onOpenParty}
      />
      <View style={{ height: 28 }} />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// 1. What is true here now
// ---------------------------------------------------------------------------

type Async<T> = { data: T | null; loading: boolean; error: string | null; reload: () => void };

function Conditions({
  now, places, onOpenMap,
}: { now: Date; places: Async<ScoredPlace[]>; onOpenMap: () => void }) {
  const greeting = greetingFor(now);
  const list = places.data ?? [];
  const avg = islandAverage(list);
  const provenance = weakestProvenance(list);

  return (
    <View
      style={{
        margin: gutter,
        padding: 22,
        borderRadius: radius.md,
        backgroundColor: color.paper,
      }}
    >
      <Label size={10} tracking={0.16} colour={color.brandSoft}>
        {`${greeting.en} · Koh Samui`}
      </Label>
      <Thai size={11} colour={color.brandSoft} style={{ marginTop: 2 }}>
        {`${greeting.th} · เกาะสมุย`}
      </Thai>

      {places.error ? (
        // The block fails alone and says what is missing. It does not fall back
        // to a plausible number, which is the failure this whole app is about.
        <View style={{ marginTop: 14 }}>
          <Body size={13} colour={color.surface}>
            Conditions are unavailable right now.
          </Body>
          <Thai size={11} colour={color.brandSoft} style={{ marginTop: 3 }}>
            ยังดึงข้อมูลสภาพพื้นที่ไม่ได้
          </Thai>
          <Button
            label={strings.common.retry.en}
            onPress={places.reload}
            variant="secondary"
            height={40}
            style={{ marginTop: 10, borderColor: color.brandSoft }}
            inverted
          />
        </View>
      ) : avg === null ? (
        <Body size={13} colour={color.brandSoft} style={{ marginTop: 14 }}>
          {places.loading ? 'Reading the island…' : 'No measured places yet.'}
        </Body>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 14 }}>
            <Heading
              size={44}
              tracking={-1}
              colour={isHighScore(avg) ? color.accent300 : color.surface}
            >
              {avg}
            </Heading>
            <Label size={10} tracking={0.12} colour={color.brandSoft}>
              HEALTHY SCORE · AVERAGE
            </Label>
          </View>

          <Body size={13} colour={color.brandSoft} style={{ marginTop: 6 }}>
            {`Across ${list.length} measured place${list.length === 1 ? '' : 's'} · ${strings.place.provenance[provenance].en}`}
          </Body>
          <Thai size={11} colour={color.brandSoft} style={{ marginTop: 3 }}>
            {`จาก ${list.length} สถานที่ที่วัดจริง · ${strings.place.provenance[provenance].th}`}
          </Thai>

          {/*
            The average is a summary; the numbers with a breakdown behind them
            are the per-place ones. Saying so, and pointing at them, is cheaper
            than defending an aggregate nobody can interrogate.
          */}
          <Pressable
            onPress={onOpenMap}
            accessibilityRole="button"
            accessibilityLabel="See every place and how its score is calculated"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, minHeight: 44 }}
          >
            <Label size={10} tracking={0.1} colour={color.surface}>
              SEE EVERY PLACE
            </Label>
            <ChevronRight size={16} color={color.surface} strokeWidth={2} />
          </Pressable>
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// 2. What you can do today
// ---------------------------------------------------------------------------

function Today({
  quests, onOpenQuest, onOpenQuests,
}: {
  quests: Async<{ quests: Quest[]; progress: Record<string, QuestProgress> }>;
  onOpenQuest: (id: string) => void;
  onOpenQuests: () => void;
}) {
  const all = quests.data?.quests ?? [];
  const progress = quests.data?.progress ?? {};
  /*
    Finished quests are not things you can do today, so they leave this list.
    The demo account has completed all four of today's, which rendered a
    "Today" block listing four missions the traveller had already done — an
    invitation to repeat work that cannot be repeated.
  */
  const open = all.filter((q) => progress[q.id]?.stage !== 'complete');
  const finished = all.length - open.length;
  const ordered = questOrder(open, progress).slice(0, HOME_QUEST_LIMIT);
  const rest = open.length - ordered.length;

  return (
    <View style={{ paddingTop: 6 }}>
      <SectionHead en="Today" th="วันนี้" />

      {quests.error ? (
        <ErrorState message={quests.error} onRetry={quests.reload} />
      ) : quests.loading ? (
        <Body size={13} colour={color.neutral600} style={{ paddingHorizontal: gutter }}>
          Loading today’s missions…
        </Body>
      ) : ordered.length === 0 ? (
        /*
          Said plainly, and not padded. The alternative — an "explore nearby!"
          card with nothing behind it — is how an app teaches people that its
          prompts do not mean anything.

          Two different empty states, because they are two different days.
          Having finished everything is an achievement and reads as one; there
          being nothing to do is not the traveller's doing and should not be
          dressed up as praise.
        */
        <View style={{ paddingHorizontal: gutter }}>
          {finished > 0 ? (
            <>
              <Body size={13} colour={color.accent700}>
                {`All ${finished} of today’s missions are done. Nothing left to verify until tomorrow.`}
              </Body>
              <Thai size={11} style={{ marginTop: 4 }}>
                {`ทำภารกิจวันนี้ครบทั้ง ${finished} รายการแล้ว`}
              </Thai>
            </>
          ) : (
            <>
              <Body size={13} colour={color.neutral700}>
                No missions running today. The map still works, and the weekend
                list usually has something.
              </Body>
              <Thai size={11} style={{ marginTop: 4 }}>วันนี้ยังไม่มีภารกิจ</Thai>
            </>
          )}
          <Button
            label="See all missions"
            thai="ดูภารกิจทั้งหมด"
            onPress={onOpenQuests}
            variant="secondary"
            height={44}
            style={{ marginTop: 12 }}
          />
        </View>
      ) : (
        <>
          {ordered.map((q) => (
            <QuestCard
              key={q.id}
              quest={q}
              progress={progress[q.id] ?? null}
              onPress={() => onOpenQuest(q.id)}
            />
          ))}
          {rest > 0 ? (
            <Pressable
              onPress={onOpenQuests}
              accessibilityRole="button"
              accessibilityLabel={`See all missions, ${rest} more`}
              style={{
                marginHorizontal: gutter, marginTop: 10, minHeight: 44,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <Label size={10} tracking={0.12} colour={color.brand}>
                {`${rest} MORE TODAY · อีก ${rest} ภารกิจ`}
              </Label>
              <ChevronRight size={16} color={color.brand} strokeWidth={2} />
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

function QuestCard({
  quest, progress, onPress,
}: { quest: Quest; progress: QuestProgress | null; onPress: () => void }) {
  const started = progress != null && progress.stage !== 'complete';
  const tone = currencyTone(quest.rewardCurrency);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${quest.name.en}. ${quest.name.th}. ${quest.where}. ${started ? 'In progress' : 'Not started'}`}
      style={{
        marginHorizontal: gutter,
        marginTop: 10,
        padding: 14,
        backgroundColor: color.surface,
        borderRadius: radius.md,
        borderWidth: started ? layout.ruleStrong : 1,
        // A quest already under way is the app reminding you of your own
        // commitment, so it is outlined in brand — not in green, which would
        // say a host had already approved something nobody has done yet.
        borderColor: started ? color.brand : color.neutral300,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1 }}>
          {started ? (
            <Label size={9} tracking={0.14} colour={color.brand} style={{ marginBottom: 4 }}>
              IN PROGRESS · กำลังทำอยู่
            </Label>
          ) : null}
          <Heading size={16}>{quest.name.en}</Heading>
          <Thai size={11} style={{ marginTop: 2 }}>{quest.name.th}</Thai>
          <Body size={13} colour={color.neutral600} style={{ marginTop: 6 }}>
            {`${quest.where} · ${quest.duration}`}
          </Body>
          {/*
            The host is named on the card, not only inside the quest. The
            person who will approve this is the reason the reward means
            anything, and an anonymous mission is just a task list.
          */}
          <Label size={9} tracking={0.06} colour={color.neutral600} style={{ marginTop: 4, textTransform: 'none' }}>
            {`Verified by ${quest.host.name}`}
          </Label>
        </View>

        <View
          style={{
            backgroundColor: tone.fill,
            paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.sm,
          }}
        >
          <Heading size={13} colour={tone.on}>
            {`+${quest.rewardPoints} ${quest.rewardCurrency === 'green' ? 'G' : 'T'}`}
          </Heading>
        </View>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// 3. What you are carrying
// ---------------------------------------------------------------------------

function Carrying({
  wallet, passport, companions, onOpenWallet, onOpenPassport,
}: {
  wallet: Async<{ balances: { green: number; trip: number } }>;
  passport: Async<{ visited: string[] }>;
  companions: Async<{ summary: { found: number; total: number; grown: number } }>;
  onOpenWallet: () => void;
  onOpenPassport: () => void;
}) {
  const green = wallet.data?.balances.green ?? null;
  const trip = wallet.data?.balances.trip ?? null;
  const stamps = passport.data ? passportProgress(passport.data.visited) : null;
  const found = companions.data?.summary ?? null;

  return (
    <View style={{ paddingTop: 22 }}>
      <SectionHead en="What you’re carrying" th="สิ่งที่คุณสะสมไว้" />

      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: gutter }}>
        {/*
          The two purses side by side and coloured apart, because this is the
          screen where somebody first learns there are two of them. Green is
          host-verified, gold is self-verified, and the labels say which.
        */}
        <Figure
          value={green === null ? '—' : green.toLocaleString('en-US')}
          unit="G"
          en="Green · verified"
          th="ตรวจแล้ว"
          tone={color.accent700}
          onPress={onOpenWallet}
        />
        <Figure
          value={trip === null ? '—' : trip.toLocaleString('en-US')}
          unit="T"
          en="Trip · self"
          th="บันทึกเอง"
          tone={color.goldDeep}
          onPress={onOpenWallet}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: gutter, marginTop: 10 }}>
        <Figure
          value={stamps === null ? '—' : String(stamps.visited)}
          unit={stamps === null ? '' : `/ ${stamps.total}`}
          en="Provinces"
          th="จังหวัด"
          tone={color.brand}
          onPress={onOpenPassport}
        />
        <Figure
          value={found === null ? '—' : String(found.found)}
          unit={found === null ? '' : `/ ${found.total}`}
          en="Companions"
          th="เพื่อนร่วมทาง"
          tone={color.brand}
          onPress={onOpenWallet}
        />
      </View>

      {wallet.error || passport.error || companions.error ? (
        <Label
          size={9}
          tracking={0.04}
          colour={color.neutral600}
          style={{ paddingHorizontal: gutter, marginTop: 8, textTransform: 'none' }}
        >
          Some figures could not be loaded and are shown as —, not as zero.
        </Label>
      ) : null}
    </View>
  );
}

/** One figure in a tappable card. `—` when unknown, which is not the same as 0. */
function Figure({
  value, unit, en, th, tone, onPress,
}: {
  value: string; unit: string; en: string; th: string; tone: string; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${en}, ${value} ${unit}`}
      style={{
        flex: 1, minHeight: 44, padding: 14,
        backgroundColor: color.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: color.neutral300,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Heading size={24} colour={tone}>{value}</Heading>
        {unit ? <Label size={10} tracking={0.08} colour={color.neutral600}>{unit}</Label> : null}
      </View>
      <Label size={9} tracking={0.08} colour={color.neutral700} style={{ marginTop: 4 }}>{en}</Label>
      <Thai size={10} style={{ marginTop: 1 }}>{th}</Thai>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// 4. Where else to go
// ---------------------------------------------------------------------------

function Doors({
  onOpenMap, onOpenConcierge, onOpenImpact, onOpenSafety, onOpenParty,
}: {
  onOpenMap: () => void; onOpenConcierge: () => void;
  onOpenImpact: () => void; onOpenSafety: () => void; onOpenParty: () => void;
}) {
  // Five, not twelve. A grid of twelve icons is what a Home screen becomes
  // when nobody decided what the traveller is most likely to want.
  // Untyped on purpose: annotating the icon narrower than LucideIcon fights
  // the library's own forwardRef signature for nothing.
  const doors = [
    { Icon: Compass, en: strings.tabs.map.en, th: strings.tabs.map.th, onPress: onOpenMap },
    { Icon: MessageCircle, en: 'Ask', th: 'ถาม', onPress: onOpenConcierge },
    { Icon: Sparkles, en: strings.tabs.impact.en, th: strings.tabs.impact.th, onPress: onOpenImpact },
    { Icon: Shield, en: strings.tabs.safety.en, th: strings.tabs.safety.th, onPress: onOpenSafety },
    { Icon: Users, en: 'Group', th: 'กลุ่ม', onPress: onOpenParty },
  ];

  return (
    <View style={{ paddingTop: 22 }}>
      <SectionHead en="Go" th="ไปต่อ" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: gutter }}>
        {doors.map(({ Icon, en, th, onPress }) => (
          <Pressable
            key={en}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={`${en}. ${th}`}
            style={{
              // Basis rather than flex:1 — five doors wrap to a second row,
              // and equal flex would stretch a lone survivor across the width.
              flexBasis: '30%', flexGrow: 1, minHeight: 76, paddingVertical: 12, gap: 6,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: color.brandSoft,
              borderRadius: radius.md,
            }}
          >
            <Icon size={20} color={color.brandDeep} strokeWidth={2} />
            <Label size={9} tracking={0.08} colour={color.brandDeep}>{en}</Label>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function SectionHead({ en, th }: { en: string; th: string }) {
  return (
    <View style={{ paddingHorizontal: gutter, paddingBottom: 10 }}>
      <Label size={10} tracking={0.14}>{en}</Label>
      <Thai size={11} style={{ marginTop: 1 }}>{th}</Thai>
    </View>
  );
}
