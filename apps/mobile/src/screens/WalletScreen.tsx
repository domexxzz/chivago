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
import { ChevronRight } from 'lucide-react-native';
import {
  ledgerDate,
  ledgerLine,
  formatAmount, levelProgressPct, strings,
  type Wallet,
  type Companion,
} from '@chivago/core';
import { api, type InboxItem } from '../api/client.ts';
import { STAGE_LABEL } from './CompanionHome.tsx';
import { useAsync } from '../state/store.tsx';
import { color, currencyTone, gutter, layout, onFill, radius, shadow } from '../theme/index.ts';
import { AccentNumeral, Body, Heading, Label } from '../components/Type.tsx';
import { Creature } from '../components/Creature.tsx';
import { Button } from '../components/Button.tsx';
import { EmptyState, ErrorState, LoadingState } from '../components/States.tsx';
import { t } from '../i18n/locale.ts';

export function WalletScreen({
  onOpenCompanion,
  onOpenMarket, onOpenAccount, refreshKey, notifications, unread, onMarkRead, onMarkAllRead,
  onOpenQuest,
}: {
  onOpenMarket: () => void;
  onOpenAccount: () => void;
  refreshKey: number;
  notifications: InboxItem[];
  unread: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onOpenQuest: (id: string) => void;
  onOpenCompanion: (c: Companion) => void;
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
          <Companions data={companions.data} onOpenCompanion={onOpenCompanion} />
          <Ledger wallet={wallet.data} onOpenMarket={onOpenMarket} />
          <AccountRow onOpenAccount={onOpenAccount} />
        </>
      ) : null}
    </ScrollView>
  );
}

/**
 * The way to a second phone.
 *
 * At the bottom of the wallet on purpose: everything above it is what the
 * traveller would lose if this phone were their only one, so the invitation to
 * add another reads as a consequence of the list rather than a settings item.
 */
function AccountRow({ onOpenAccount }: { onOpenAccount: () => void }) {
  return (
    <Pressable
      onPress={onOpenAccount}
      accessibilityRole="button"
      accessibilityLabel="Your account. Add another phone, or see which phones are signed in."
      style={{
        marginHorizontal: gutter, marginTop: 18, marginBottom: 28,
        padding: 14, minHeight: 44,
        flexDirection: 'row', alignItems: 'center', gap: 12,
        borderWidth: 1, borderColor: color.neutral300, borderRadius: radius.md,
        backgroundColor: color.surface,
      }}
    >
      <View style={{ flex: 1 }}>
        <Heading size={15}>{t({ en: 'Your account', th: 'บัญชีของคุณ' })}</Heading>
        <Label size={9} tracking={0.04} colour={color.neutral600} style={{ marginTop: 5, textTransform: 'none' }}>
          {t({
            en: 'Add another phone so none of this depends on keeping this one.',
            th: 'เพิ่มอีกเครื่อง เพื่อไม่ให้ทุกอย่างขึ้นกับเครื่องนี้เครื่องเดียว',
          })}
        </Label>
      </View>
      <ChevronRight size={18} color={color.brand} strokeWidth={2} />
    </Pressable>
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
      style={[shadow.card, {
        flexDirection: 'row',
        marginHorizontal: gutter,
        marginTop: 16,
        padding: 18,
        gap: 20,
        backgroundColor: color.surface,
        borderRadius: radius.md,
      }]}
    >
      <Purse
        figure={wallet.balances.green}
        label={t(strings.common.greenPoints)}
        note={t(strings.common.greenPointsNote)}
        accent
      />
      <Purse
        figure={wallet.balances.trip}
        label={t(strings.common.tripPoints)}
        note={t(strings.common.tripPointsNote)}
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
      style={[shadow.card, {
        marginHorizontal: gutter,
        marginTop: 12,
        padding: 16,
        backgroundColor: color.surface,
        borderRadius: radius.md,
      }]}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Heading size={14}>{t(strings.wallet.level(p.level))}</Heading>
          <Label size={11} tracking={0.1}>{t(p.rank.label)}</Label>
        </View>
        <Label size={11} tracking={0} style={{ textTransform: 'none' }}>
          {t(strings.wallet.levelBar(p.intoLevel, p.levelSpan))}
        </Label>
      </View>
      {/*
        Gold. A level is earned by activity, not granted by a host - it is the
        game layer, and painting it in the verified green made progression look
        like proof. The two things a judge must be able to tell apart at a
        glance are exactly these.
      */}
      <View style={{ height: 10, backgroundColor: color.neutral300, marginTop: 10 }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color.gold }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        <Label size={9} tracking={0.06} colour={color.neutral600}>
          {t(strings.wallet.expNote)}
        </Label>
        <Label size={9} tracking={0.06} colour={color.neutral600}>
          {p.nextRank
            ? t(strings.wallet.toNextRank(p.nextRankAtLevel! - p.level, t(p.nextRank.label)))
            : t(strings.wallet.topRank)}
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
      <Label size={10} tracking={0.14}>{t(strings.wallet.ranks)}</Label>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
        {wallet.progression.ladder.map((rank) => (
          <View
            key={rank.key}
            accessibilityLabel={`${t(rank.label)}, ${rank.earned ? 'reached' : `locked until level ${rank.fromLevel}`}`}
            style={{
              flex: 1,
              aspectRatio: 1,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              padding: 4,
              borderWidth: layout.ruleStrong,
              borderRadius: radius.sm,
              borderColor: rank.earned ? color.gold : color.neutral400,
              backgroundColor: rank.earned ? color.gold : 'transparent',
            }}
          >
            <Heading size={15} colour={rank.earned ? onFill.gold : color.neutral500}>
              {String(rank.index).padStart(2, '0')}
            </Heading>
            <Label
              size={9}
              tracking={0.06}
              colour={rank.earned ? onFill.gold : color.neutral500}
              style={{ textAlign: 'center', fontSize: 8 }}
            >
              {t(rank.label)}
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
        <Label size={10} tracking={0.14}>{t(strings.wallet.ledger)}</Label>
        <Button label={t(strings.wallet.spendPoints)} onPress={onOpenMarket} variant="ghost" />
      </View>

      {wallet.ledger.length === 0 ? (
        <EmptyState en={t(strings.wallet.emptyLedger)} th={strings.wallet.emptyLedger.th} />
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
            <Heading size={14}>{t(ledgerLine(entry))}</Heading>
            <Label size={11} tracking={0} style={{ textTransform: 'none', marginTop: 2 }}>
              {`${t(ledgerDate(entry.occurredAt, now))} · ${entry.host}`}
            </Label>
          </View>
          {/*
            Credits carry their CURRENCY's colour, debits neutral-600 with
            U+2212, not a hyphen.

            Green earns the green; Trip earns gold. The two purses are the
            centre of the design and the header already separates them this
            way - a ledger that painted both the same colour would undo the
            distinction one line below the place it was made.

            Trip used to be plain ink here, which was not wrong so much as
            silent: it read as "no colour" rather than as the other currency.
          */}
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
            <Heading
              size={15}
              colour={
                entry.amount < 0
                  ? color.neutral600
                  : currencyTone(entry.currency).text
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
          <Label size={10} tracking={0.14}>{t(strings.notifications.title)}</Label>
          {unread > 0 ? (
            <View style={{ backgroundColor: color.brand, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Heading size={11} colour={onFill.brand}>{unread}</Heading>
            </View>
          ) : null}
        </View>
        {unread > 0 ? (
          <Button label={t(strings.notifications.markAllRead)} onPress={onMarkAllRead} variant="ghost" />
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
            accessibilityLabel={`${t(item.title)}. ${t(item.body)}`}
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
                backgroundColor: isUnread ? color.brand : 'transparent',
              }}
            />
            <View style={{ flex: 1 }}>
              <Heading size={14}>{t(item.title)}</Heading>
              <Body size={13} colour={color.neutral800} style={{ marginTop: 6 }}>{t(item.body)}</Body>
              <Label size={10} tracking={0.1} style={{ marginTop: 6 }}>
                {t(ledgerDate(item.createdAt, now))}
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
  onOpenCompanion,
  data,
}: {
  data: {
    companions: Companion[];
    summary: { found: number; total: number; grown: number };
    speciesAsOf: string;
  } | null;
  onOpenCompanion: (c: Companion) => void;
}) {
  if (!data) return null;
  const { companions, summary } = data;

  return (
    <View style={{ borderTopWidth: layout.ruleStrong, borderTopColor: color.text, paddingTop: 18 }}>
      <View style={{
        flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'baseline', paddingHorizontal: gutter,
      }}>
        <Label size={10} tracking={0.16}>{t({ en: 'Companions', th: 'สัตว์ประจำถิ่น' })}</Label>
        <Label size={10} tracking={0.12} colour={color.neutral600}>
          {`${summary.found}/${summary.total} · ${summary.grown} ${t({ en: 'grown', th: 'โตเต็มวัย' })}`}
        </Label>
      </View>

      {companions.length === 0 ? (
        // Not five locked slots. An empty collection with a lever you cannot
        // see is the shape of a slot machine.
        <View style={{ paddingHorizontal: gutter, paddingTop: 12 }}>
          <Body size={13} colour={color.neutral700}>{t({ en: 'Check in anywhere on the island to find your first egg.', th: 'เช็กอินที่ไหนก็ได้บนเกาะ เพื่อพบไข่ใบแรก' })}</Body>
        </View>
      ) : null}

      {companions.map((c) => (
        <Pressable
          key={c.species.key}
          onPress={() => onOpenCompanion(c)}
          accessibilityRole="button"
          accessibilityLabel={`${t(c.species.name)}, ${c.stage}. Visit its home.`}
          style={{
            marginTop: 12,
            marginHorizontal: gutter,
            padding: 14,
            borderWidth: c.stage === 'grown' ? layout.ruleStrong : 1,
            borderColor: c.stage === 'grown' ? color.accent : color.neutral400,
            borderRadius: radius.md,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {/*
              The animal, before its name. A collection of five creatures that
              showed none of them was asking the reader to do the imagining on
              the one screen whose whole job is to be a reward.
            */}
            <Creature species={c.species.key} stage={c.stage} size={52} />
            <View style={{ flex: 1 }}>
              <Heading size={16} colour={c.stage === 'grown' ? color.accent : color.text}>
                {c.stage === 'egg' ? t(c.species.eggName) : t(c.species.name)}
              </Heading>
            </View>
            <Label size={9} tracking={0.12} colour={color.neutral600}>
              {t(STAGE_LABEL[c.stage])}
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
                {t(c.species.fact)}
              </Body>
            </>
          ) : null}

          {/* What would move it on. Never a locked slot with no explanation. */}
          {c.nextStep ? (
            <Body size={13} colour={color.accent700} style={{ marginTop: 10 }}>
              {t(c.nextStep)}
            </Body>
          ) : null}
        </Pressable>
      ))}

      <View style={{ paddingHorizontal: gutter, paddingTop: 12 }}>
        <Label size={9} tracking={0.06} colour={color.neutral500} style={{ textTransform: 'none' }}>
          {t({
            en: `Species and conservation status recorded ${data.speciesAsOf}.`,
            th: `ข้อมูลชนิดพันธุ์และสถานะการอนุรักษ์ บันทึกเมื่อ ${data.speciesAsOf}`,
          })}
        </Label>
      </View>
    </View>
  );
}
