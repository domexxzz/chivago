/**
 * The wallet.
 *
 * Two balances, a level, a rank ladder and the ledger. Every ledger entry
 * names the host that verified it - that is what makes a point feel earned
 * rather than granted.
 *
 * The two balances are shown SIDE BY SIDE with what each one means, because a
 * traveller holding both will otherwise read them as one number split in two.
 * Green is what a host vouched for; Trip is what the phone saw. Only one of
 * those belongs in an impact report.
 *
 * Ranks render as NUMERALS. The prototype carries emoji; Modernist forbids
 * them and the design already renders the numeral instead. Handoff open
 * question 7, resolved: ship the numeral.
 */

import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import {
  formatAmount, formatLedgerDate, levelProgressPct, strings,
  type Wallet,
  type Companion,
} from '@chivago/core';
import { api, type InboxItem } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, layout, radius } from '../theme/index.ts';
import { AccentNumeral, Body, Heading, Label, Thai } from '../components/Type.tsx';
import { Button } from '../components/Button.tsx';
import { EmptyState, ErrorState, LoadingState } from '../components/States.tsx';

export function WalletScreen({
  onOpenMarket, refreshKey, notifications, unread, onMarkRead, onMarkAllRead, onOpenQuest,
}: {
  onOpenMarket: () => void;
  refreshKey: number;
  notifications: InboxItem[];
  unread: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onOpenQuest: (id: string) => void;
}) {
  const wallet = useAsync(() => api.wallet(), [refreshKey]);
  const companions = useAsync(() => api.companions(), [refreshKey]);

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {wallet.loading ? <LoadingState /> : null}
      {wallet.error ? <ErrorState message={wallet.error} onRetry={wallet.reload} /> : null}
      {wallet.data ? (
        <>
          <Balances wallet={wallet.data} />
          <Inbox
            items={notifications}
            unread={unread}
            onMarkRead={onMarkRead}
            onMarkAllRead={onMarkAllRead}
            onOpenQuest={onOpenQuest}
          />
          <LevelBlock wallet={wallet.data} />
          <RankLadder wallet={wallet.data} />
          <Companions data={companions.data} />
          <Ledger wallet={wallet.data} onOpenMarket={onOpenMarket} />
        </>
      ) : null}
    </ScrollView>
  );
}

/**
 * The two balances.
 *
 * Green leads: it is the harder currency to earn and the only one that means
 * anything outside the app. Each carries a one-line note saying where it comes
 * from, because two numbers with no explanation read as one number split in
 * two, and the difference between them is the whole design.
 */
export function Balances({ wallet }: { wallet: Wallet }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        paddingHorizontal: gutter,
        paddingTop: 18,
        paddingBottom: 14,
        gap: 20,
        borderBottomWidth: layout.ruleStrong,
        borderBottomColor: color.text,
      }}
    >
      <Purse
        figure={wallet.balances.green}
        label={strings.common.greenPoints.en}
        note={strings.common.greenPointsNote.en}
        accent
      />
      <Purse
        figure={wallet.balances.trip}
        label={strings.common.tripPoints.en}
        note={strings.common.tripPointsNote.en}
      />
    </View>
  );
}

export function Purse({
  figure, label, note, accent = false,
}: { figure: number; label: string; note: string; accent?: boolean }) {
  return (
    <View style={{ flex: 1 }} accessibilityLabel={`${figure} ${label}. ${note}`}>
      <Label size={10} tracking={0.16}>{label}</Label>
      {accent ? (
        <AccentNumeral size={40}>{figure.toLocaleString('en-US')}</AccentNumeral>
      ) : (
        <Heading size={40} tracking={-0.8}>{figure.toLocaleString('en-US')}</Heading>
      )}
      <Label size={9} tracking={0} colour={color.neutral600} style={{ textTransform: 'none' }}>
        {note}
      </Label>
    </View>
  );
}

/**
 * Level and EXP.
 *
 * Measures progress WITHIN the current level, against that level's own span.
 * The prototype uses `points / 2500`, which pins at 100% forever once a user
 * passes it - and worse, fell when they spent. EXP cannot fall, so this bar
 * only ever moves one way.
 */
export function LevelBlock({ wallet }: { wallet: Wallet }) {
  const { progression: p } = wallet;
  const pct = levelProgressPct(p.exp);
  return (
    <View
      style={{
        paddingHorizontal: gutter,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: color.neutral300,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Heading size={14}>{strings.wallet.level(p.level).en}</Heading>
          <Label size={11} tracking={0.1}>{p.rank.label.en}</Label>
        </View>
        <Label size={11} tracking={0} style={{ textTransform: 'none' }}>
          {strings.wallet.levelBar(p.intoLevel, p.levelSpan).en}
        </Label>
      </View>
      <Thai size={11} style={{ marginTop: 2 }}>{p.rank.label.th}</Thai>
      <View style={{ height: 10, backgroundColor: color.neutral300, marginTop: 10 }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color.accent }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        <Label size={9} tracking={0.06} colour={color.neutral600}>
          {strings.wallet.expNote.en}
        </Label>
        <Label size={9} tracking={0.06} colour={color.neutral600}>
          {p.nextRank
            ? strings.wallet.toNextRank(p.nextRankAtLevel! - p.level, p.nextRank.label.en).en
            : strings.wallet.topRank.en}
        </Label>
      </View>
    </View>
  );
}

/** The five ranks. Earned squares fill; locked squares state the level needed. */
export function RankLadder({ wallet }: { wallet: Wallet }) {
  return (
    <View
      style={{
        paddingHorizontal: gutter,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: color.neutral300,
      }}
    >
      <Label size={10} tracking={0.14}>{strings.wallet.ranks.en}</Label>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
        {wallet.progression.ladder.map((rank) => (
          <View
            key={rank.key}
            accessibilityLabel={`${rank.label.en}, ${rank.earned ? 'reached' : `locked until level ${rank.fromLevel}`}`}
            style={{
              flex: 1,
              aspectRatio: 1,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              padding: 4,
              borderWidth: layout.ruleStrong,
              borderRadius: radius.sm,
              borderColor: rank.earned ? color.accent : color.neutral400,
              backgroundColor: rank.earned ? color.accent : 'transparent',
            }}
          >
            <Heading size={15} colour={rank.earned ? color.bg : color.neutral500}>
              {String(rank.index).padStart(2, '0')}
            </Heading>
            <Label
              size={9}
              tracking={0.06}
              colour={rank.earned ? color.bg : color.neutral500}
              style={{ textAlign: 'center', fontSize: 8 }}
            >
              {rank.label.en}
            </Label>
          </View>
        ))}
      </View>
    </View>
  );
}
export function Ledger({ wallet, onOpenMarket }: { wallet: Wallet; onOpenMarket: () => void }) {
  const now = React.useMemo(() => new Date(), []);
  return (
    <View style={{ paddingHorizontal: gutter, paddingVertical: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Label size={10} tracking={0.14}>{strings.wallet.ledger.en}</Label>
        <Button label={strings.wallet.spendPoints.en} onPress={onOpenMarket} variant="ghost" />
      </View>

      {wallet.ledger.length === 0 ? (
        <EmptyState en={strings.wallet.emptyLedger.en} th={strings.wallet.emptyLedger.th} />
      ) : null}

      {wallet.ledger.map((entry) => (
        <View
          key={entry.id}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 11,
            borderBottomWidth: 1,
            borderBottomColor: color.neutral300,
          }}
        >
          <View style={{ flex: 1 }}>
            <Heading size={14}>{entry.label}</Heading>
            <Label size={11} tracking={0} style={{ textTransform: 'none', marginTop: 2 }}>
              {`${formatLedgerDate(entry.occurredAt, now)} · ${entry.host}`}
            </Label>
          </View>
          {/*
            Credits carry their CURRENCY's colour, debits neutral-600 with
            U+2212, not a hyphen.

            Green earns the lime; Trip earns plain ink. The two purses are the
            centre of the design and the header already separates them this
            way - a ledger that painted both the same colour would undo the
            distinction one line below the place it was made.
          */}
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
            <Heading
              size={15}
              colour={
                entry.amount < 0
                  ? color.neutral600
                  : entry.currency === 'green' ? color.accent700 : color.text
              }
            >
              {formatAmount(entry.amount)}
            </Heading>
            <Label size={10} tracking={0.1} colour={color.neutral600}>
              {entry.currency === 'green' ? 'G' : 'T'}
            </Label>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * The in-app inbox.
 *
 * Lives on the wallet because that is where a volunteer goes to check whether
 * their points arrived - the exact question the notification answers.
 *
 * This is the SOURCE OF TRUTH, not the push. A push can be denied, expired, or
 * arrive while the phone is in a bag for a day; these rows are written when the
 * host decides and survive every delivery failure. Someone who declined
 * notifications still finds out here.
 */
function Inbox({
  items, unread, onMarkRead, onMarkAllRead, onOpenQuest,
}: {
  items: InboxItem[];
  unread: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onOpenQuest: (id: string) => void;
}) {
  if (items.length === 0) return null;
  const now = new Date();

  return (
    <View
      style={{
        paddingHorizontal: gutter,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: color.neutral300,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Label size={10} tracking={0.14}>{strings.notifications.title.en}</Label>
          {unread > 0 ? (
            <View style={{ backgroundColor: color.accent, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Heading size={11} colour={color.bg}>{unread}</Heading>
            </View>
          ) : null}
        </View>
        {unread > 0 ? (
          <Button label={strings.notifications.markAllRead.en} onPress={onMarkAllRead} variant="ghost" />
        ) : null}
      </View>

      {items.slice(0, 5).map((item) => {
        const questId = typeof item.data.questId === 'string' ? item.data.questId : null;
        const isUnread = item.readAt === null;
        return (
          <Pressable
            key={item.id}
            onPress={() => {
              if (isUnread) onMarkRead(item.id);
              if (questId && item.data.screen === 'quest') onOpenQuest(questId);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${item.title.en}. ${item.body.en}`}
            style={{
              flexDirection: 'row',
              gap: 12,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: color.neutral300,
            }}
          >
            {/* An unread marker, not a dot on a badge - Modernist has no radii. */}
            <View
              style={{
                width: 8,
                height: 8,
                marginTop: 6,
                backgroundColor: isUnread ? color.accent : 'transparent',
              }}
            />
            <View style={{ flex: 1 }}>
              <Heading size={14}>{item.title.en}</Heading>
              <Thai size={11} style={{ marginTop: 2 }}>{item.title.th}</Thai>
              <Body size={13} colour={color.neutral800} style={{ marginTop: 6 }}>{item.body.en}</Body>
              <Thai size={11} style={{ marginTop: 4 }}>{item.body.th}</Thai>
              <Label size={10} tracking={0.1} style={{ marginTop: 6 }}>
                {formatLedgerDate(item.createdAt, now)}
              </Label>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The companion collection - one creature per habitat.
 *
 * Deliberately NOT a shop and NOT a gacha. Each stage is a picture of the
 * evidence behind it: an egg means you were somewhere, a hatchling means you
 * covered the habitat, and a grown animal means a host verified work you did
 * there. Nothing here can be bought, rolled for, or granted by any route.
 *
 * The species are real Samui animals with their binomials and one true fact,
 * so the collection teaches something even to somebody who never checks in
 * again.
 */
function Companions({
  data,
}: {
  data: {
    companions: Companion[];
    summary: { found: number; total: number; grown: number };
    speciesAsOf: string;
  } | null;
}) {
  if (!data) return null;
  const { companions, summary } = data;

  return (
    <View style={{ borderTopWidth: layout.ruleStrong, borderTopColor: color.text, paddingTop: 18 }}>
      <View style={{
        flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'baseline', paddingHorizontal: gutter,
      }}>
        <Label size={10} tracking={0.16}>Companions · สัตว์ประจำถิ่น</Label>
        <Label size={10} tracking={0.12} colour={color.neutral600}>
          {`${summary.found}/${summary.total} · ${summary.grown} GROWN`}
        </Label>
      </View>

      {companions.length === 0 ? (
        // Not five locked slots. An empty collection with a lever you cannot
        // see is the shape of a slot machine.
        <View style={{ paddingHorizontal: gutter, paddingTop: 12 }}>
          <Body size={13} colour={color.neutral700}>
            Check in anywhere on the island to find your first egg.
          </Body>
          <Thai size={11} style={{ marginTop: 4 }}>เช็กอินที่ไหนก็ได้บนเกาะ เพื่อพบไข่ใบแรก</Thai>
        </View>
      ) : null}

      {companions.map((c) => (
        <View
          key={c.species.key}
          style={{
            marginTop: 12,
            marginHorizontal: gutter,
            padding: 14,
            borderWidth: c.stage === 'grown' ? layout.ruleStrong : 1,
            borderColor: c.stage === 'grown' ? color.accent : color.neutral400,
            borderRadius: radius.md,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Heading size={16} colour={c.stage === 'grown' ? color.accent : color.text}>
                {c.stage === 'egg' ? c.species.eggName.en : c.species.name.en}
              </Heading>
              <Thai size={11} style={{ marginTop: 2 }}>
                {c.stage === 'egg' ? c.species.eggName.th : c.species.name.th}
              </Thai>
            </View>
            <Label size={9} tracking={0.12} colour={color.neutral600}>
              {c.stage.toUpperCase()}
            </Label>
          </View>

          {/* An egg keeps the species hidden - that is the whole point of one. */}
          {c.stage !== 'egg' ? (
            <>
              <Label
                size={9}
                tracking={0.06}
                colour={color.neutral500}
                style={{ marginTop: 8, textTransform: 'none' }}
              >
                {`${c.species.scientific} · IUCN ${c.species.status}`}
              </Label>
              <Body size={13} colour={color.neutral600} style={{ marginTop: 6 }}>
                {c.species.fact.en}
              </Body>
              <Thai size={10} style={{ marginTop: 3 }}>{c.species.fact.th}</Thai>
            </>
          ) : null}

          {/* What would move it on. Never a locked slot with no explanation. */}
          {c.nextStep ? (
            <Body size={13} colour={color.accent700} style={{ marginTop: 10 }}>
              {c.nextStep.en}
            </Body>
          ) : null}
        </View>
      ))}

      <View style={{ paddingHorizontal: gutter, paddingTop: 12 }}>
        <Label size={9} tracking={0.06} colour={color.neutral500} style={{ textTransform: 'none' }}>
          {`Species and conservation status recorded ${data.speciesAsOf}.`}
        </Label>
      </View>
    </View>
  );
}
