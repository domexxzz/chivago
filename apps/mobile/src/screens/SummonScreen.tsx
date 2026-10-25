/**
 * The Summoning - the screen a charm is spent on.
 *
 * Everything this screen says about odds comes from the SERVER's `rules`
 * block, never from the client's own copy of `spirits.ts`. A phone that had
 * not been updated would otherwise print last month's rates beside this
 * month's roll, which is a false statement about a draw and the one thing
 * this mechanic cannot afford to make. See docs/68.
 *
 * Three things are on the screen before the button, in this order, because
 * the order is the argument:
 *
 *   WHERE THE CHARM CAME FROM - a verified quest, or a day you checked in.
 *   Not a price. A traveller should be able to read what they did to get here.
 *
 *   WHAT THIS IS NOT - the server's own notice, in the traveller's language:
 *   no money, no points, no vouchers, no prizes.
 *
 *   THE TABLE - the four rates, both floors, and how far each floor is away.
 *   Open by default rather than behind a tap: a rate a player has to go
 *   looking for is a rate they were not shown.
 */

import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { ChevronLeft, Sparkles } from 'lucide-react-native';
import {
  COURT_LABEL, RARITIES, RARITY_LABEL, strings, type SpiritRarity,
} from '@chivago/core';
import { api, type SpiritCard, type SummonResult, type SummonState } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, radius, shadow } from '../theme/index.ts';
import { gameRadius, gameShadow, gameTray } from '@chivago/tokens';
import { GameBar, Tray, TrayLine } from '../components/Game.tsx';
import { Body, Heading, Label } from '../components/Type.tsx';
import { Button, IconButton } from '../components/Button.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { OceanBackdrop } from '../components/Shell.tsx';
import { MascotMark } from '../components/MascotMark.tsx';
import { getLocale, t } from '../i18n/locale.ts';

/** The day a round opened, in the reader's own calendar conventions. */
const openedOn = (iso: string): string =>
  new Date(iso).toLocaleDateString(getLocale() === 'th' ? 'th-TH' : 'en-GB');

/**
 * A rarity's colour.
 *
 * None of them is the evidence green, for the same reason no spirit wears it
 * in its own palette: green in this product means a host verified something,
 * and a mythic is not evidence of anything.
 */
/*
  Dark enough to carry WHITE at 9px.

  The first version used light tints on a tinted fill, which read on the
  white card and vanished on the tray's ink ground - and the tray is where
  the odds table is, which is the one thing on this screen nobody may have
  trouble reading. A solid fill with white on it works on both grounds, so
  the pill looks the same wherever it is drawn.
*/
const RARITY_TINT: Record<SpiritRarity, string> = {
  common: '#5c6672',
  uncommon: '#2d6f9e',
  rare: '#6b3fb0',
  mythic: '#a06a08',
};

function RarityPill({ rarity }: { rarity: SpiritRarity }) {
  return (
    <View
      style={{
        paddingVertical: 2, paddingHorizontal: 7, borderRadius: radius.sm,
        backgroundColor: RARITY_TINT[rarity],
      }}
    >
      <Label size={9} tracking={0.1} colour="#FFFFFF">{t(RARITY_LABEL[rarity])}</Label>
    </View>
  );
}

/** One card in the guide. A spirit nobody has met has no name to print. */
export function SpiritCardView({ card, onOpen }: { card: SpiritCard; onOpen?: (key: string) => void }) {
  const met = card.held > 0;
  return (
    <Pressable
      onPress={met && onOpen ? () => onOpen(card.key) : undefined}
      accessibilityRole={met && onOpen ? 'button' : undefined}
      accessibilityLabel={met
        ? `${t(card.name!)}, ${t(card.creature!)}`
        : t({
          en: `Not yet met. ${t(RARITY_LABEL[card.rarity])}, ${t(COURT_LABEL[card.court])} court.`,
          th: `ยังไม่ได้พบ ${t(RARITY_LABEL[card.rarity])} สำนัก${t(COURT_LABEL[card.court])}`,
        })}
      style={[met ? gameShadow.lift : shadow.sm, {
        width: '31%', minWidth: 104, backgroundColor: color.surface, borderRadius: gameRadius.panel,
        borderWidth: met ? 2 : 1, borderColor: met ? RARITY_TINT[card.rarity] : color.neutral300,
        padding: 10, alignItems: 'center', gap: 4, opacity: met ? 1 : 0.72,
      }]}
    >
      {met && card.form
        ? <MascotMark mascot={card.form} size={56} />
        : <Unmet tint={RARITY_TINT[card.rarity]} />}
      <Heading size={13} style={{ textAlign: 'center' }}>{met ? t(card.name!) : '???'}</Heading>
      <Label size={9} tracking={0.08} colour={color.neutral700} style={{ textAlign: 'center', textTransform: 'none' }}>
        {met ? t(card.creature!) : t(COURT_LABEL[card.court])}
      </Label>
      <RarityPill rarity={card.rarity} />
      {card.held > 1 ? (
        <Label size={9} tracking={0.1} colour={color.neutral600}>{`×${card.held}`}</Label>
      ) : null}
    </Pressable>
  );
}

/** The silhouette. Deliberately one shape for all of them: it says nothing. */
function Unmet({ tint }: { tint: string }) {
  return (
    <View
      style={{
        width: 56, height: 56, borderRadius: 28, backgroundColor: `${tint}22`,
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Sparkles size={22} color={tint} strokeWidth={1.6} />
    </View>
  );
}

/**
 * The whole published table, printed.
 *
 * Exported for the same reason `SpiritCardView` is: what this panel says is
 * the product's promise about a draw, and a test holds it to the numbers the
 * server handed it rather than to a screenshot somebody took once.
 */
export function RulesPanel({ rules }: { rules: SummonState['rules'] }) {
  return (
    <Tray style={{ marginHorizontal: gutter, marginTop: 10, borderRadius: gameRadius.panel }}>
      <View style={{ gap: 10 }}>
        {/*
          "Floors included" is not decoration on this heading.

          The table under it prints the EFFECTIVE rate - the one a player
          actually meets once the pity floors are counted - not the per-roll
          band. The two differ (mythic reads 5.01%, the roll band 0.31%), so a
          heading that says only "Published odds" leaves the reader to assume
          the smaller number and the screen quietly overstates nothing while
          explaining nothing. The clause was lost in translation once already;
          summon.test.ts asserts it so it cannot be lost again.
        */}
        <TrayLine>
          {t({ en: 'Published odds — floors included', th: 'อัตราที่ประกาศไว้ — รวมเพดานรับประกันแล้ว' })}
        </TrayLine>
        {RARITIES.map((r) => (
          <View key={r} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 86 }}><RarityPill rarity={r} /></View>
            {/*
              A ROW, not a bare flex:1 box. `GameBar` is `{ flex: 1, height }`,
              and flex:1 inside a COLUMN parent grows the height from a basis
              of zero - so the bar laid out 178px wide and 0px tall, and the
              published odds had no bars at all. Found in the browser, not by
              a test: the tree was correct and the layout was not.
            */}
            <View style={{ flex: 1, flexDirection: 'row' }}><GameBar pct={rules.rates[r]} height={8} /></View>
            <Label size={10} tracking={0.06} colour={gameTray.text}>{`${rules.rates[r]}%`}</Label>
          </View>
        ))}
        <Body size={13} style={{ color: gameTray.muted }}>
          {t({
            en: `Guaranteed: a rare within ${rules.pity.rare} summons, a mythic within ${rules.pity.mythic}. `
              + 'There is no other weighting — these numbers are the whole of it.',
            th: `รับประกัน: ได้ระดับหายากภายใน ${rules.pity.rare} ครั้ง และระดับเทพภายใน ${rules.pity.mythic} ครั้ง `
              + 'ไม่มีการถ่วงน้ำหนักอื่นใด ตัวเลขเหล่านี้คือทั้งหมด',
          })}
        </Body>
        {/*
          THE TABLE ABOVE IS THE TABLE A PLAYER MEETS, floors and all. This
          line is the other half of the arithmetic, and it is here rather
          than hidden because the screen used to print the roll band under
          the word "odds" — which reads as a promise of 3% mythic against
          about 5% in play. Both numbers, or the published one is not the
          published one (docs/68).
        */}
        <Body size={13} style={{ color: gameTray.muted }}>
          {`One roll on its own: ${RARITIES.map((r) => `${t(RARITY_LABEL[r])} ${rules.rollBand[r]}%`).join(', ')}. `
            + 'The floors lift the rest, and the table above is what the two come to together.'}
        </Body>
        <Body size={13} style={{ color: gameTray.muted }}>
          {t({
            en: `A duplicate becomes stardust (${RARITIES.map((r) => `${t(RARITY_LABEL[r])} ${rules.dustFromDuplicate[r]}`).join(', ')}), `
              + `and stardust buys any spirit outright (${RARITIES.map((r) => `${t(RARITY_LABEL[r])} ${rules.dustToForge[r]}`).join(', ')}) — `
              + 'so nothing in the collection is behind luck alone.',
            th: `ตัวซ้ำจะกลายเป็นผงดาว (${RARITIES.map((r) => `${t(RARITY_LABEL[r])} ${rules.dustFromDuplicate[r]}`).join(', ')}) `
              + `และผงดาวใช้แลกภูตตัวใดก็ได้โดยตรง (${RARITIES.map((r) => `${t(RARITY_LABEL[r])} ${rules.dustToForge[r]}`).join(', ')}) — `
              + 'จึงไม่มีอะไรในคอลเลกชันที่ขึ้นกับโชคเพียงอย่างเดียว',
          })}
        </Body>
      </View>
    </Tray>
  );
}

export function SummonScreen({ onBack }: { onBack: () => void }) {
  const state = useAsync(() => api.summon(), []);
  const guide = useAsync(() => api.spirits(), []);
  const [pulling, setPulling] = React.useState(false);
  const [last, setLast] = React.useState<SummonResult | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);

  const pull = React.useCallback(async () => {
    setPulling(true);
    setToast(null);
    const res = await api.pull();
    setPulling(false);
    if (!res.ok) { setToast(res.error); return; }
    setLast(res.data);
    state.reload();
    guide.reload();
  }, [state, guide]);

  if (state.loading && !state.data) return <LoadingState label={t({ en: 'The summoning', th: 'การอัญเชิญ' })} />;
  if (state.error && !state.data) return <ErrorState message={state.error} onRetry={state.reload} />;
  const s = state.data!;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} showsVerticalScrollIndicator={false}>
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          paddingHorizontal: gutter, paddingTop: 14, paddingBottom: 14, marginBottom: 8,
          backgroundColor: '#1f2a5c',
          borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: 'hidden',
        }}
      >
        <OceanBackdrop compact />
        <IconButton inverted onPress={onBack} accessibilityLabel={t(strings.common.back)}>
          <ChevronLeft size={20} color="#FFFFFF" strokeWidth={2} />
        </IconButton>
        <View style={{ flex: 1 }}>
          <Heading size={20} tracking={-0.3} colour="#FFFFFF">{t({ en: 'The Summoning', th: 'การอัญเชิญ' })}</Heading>
        </View>
      </View>

      {/* Where the charms came from. Named, because a charm is earned. */}
      <Tray style={{ marginHorizontal: gutter, marginTop: 4, borderRadius: gameRadius.panel }}>
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Heading size={30} colour={color.gold}>{s.charms.available}</Heading>
            <View style={{ flex: 1 }}>
              <TrayLine>{t({ en: s.charms.available === 1 ? 'charm' : 'charms', th: 'เครื่องราง' })}</TrayLine>
              <Label size={10} tracking={0.06} colour={gameTray.muted}>
                {t({
                  en: `${s.charms.verifiedQuests} verified quest${s.charms.verifiedQuests === 1 ? '' : 's'}`
                    + ` · ${s.charms.checkinDays} day${s.charms.checkinDays === 1 ? '' : 's'} with a check-in`,
                  th: `ภารกิจที่ผ่านการตรวจ ${s.charms.verifiedQuests} รายการ`
                    + ` · เช็กอิน ${s.charms.checkinDays} วัน`,
                })}
              </Label>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Heading size={18} colour={gameTray.text}>{s.dust}</Heading>
              <Label size={9} tracking={0.1} colour={gameTray.muted}>{t({ en: 'stardust', th: 'ผงดาว' })}</Label>
            </View>
          </View>
          <Body size={13} style={{ color: gameTray.text }}>{t(s.rules.notice)}</Body>
        </View>
      </Tray>

      <View style={{ paddingHorizontal: gutter, paddingTop: 12 }}>
        <Button
          label={s.charms.available > 0 ? 'Summon a spirit' : 'No charms yet'}
          thai={s.charms.available > 0 ? 'อัญเชิญภูต' : 'ยังไม่มีเครื่องราง'}
          onPress={() => { void pull(); }}
          disabled={s.charms.available < 1}
          busy={pulling}
          busyLabel="Summoning…"
        />
        {toast ? (
          <Body size={13} style={{ color: color.neutral800, paddingTop: 8 }}>{toast}</Body>
        ) : null}
      </View>

      {last ? <Outcome result={last} /> : null}

      {/* How far each floor is. Printed because it is published. */}
      <Tray style={{ marginHorizontal: gutter, marginTop: 12, borderRadius: gameRadius.panel }}>
        <View style={{ gap: 8 }}>
          <TrayLine>{t({ en: `Collected ${s.collected} of ${s.total}`, th: `สะสมแล้ว ${s.collected} จาก ${s.total}` })}</TrayLine>
          <View style={{ flexDirection: 'row' }}>
            <GameBar pct={(s.collected / s.total) * 100} height={10} />
          </View>
          <Label size={10} tracking={0.06} colour={gameTray.muted}>
            {t({
              en: `A rare is guaranteed in ${Math.max(0, s.rules.pity.rare - s.pity.sinceRare)}`
                + ` · a mythic in ${Math.max(0, s.rules.pity.mythic - s.pity.sinceMythic)}`,
              th: `รับประกันระดับหายากในอีก ${Math.max(0, s.rules.pity.rare - s.pity.sinceRare)} ครั้ง`
                + ` · ระดับเทพในอีก ${Math.max(0, s.rules.pity.mythic - s.pity.sinceMythic)} ครั้ง`,
            })}
          </Label>
        </View>
      </Tray>

      <RulesPanel rules={s.rules} />

      {/* The commitment, in full. It is the whole claim this screen makes. */}
      <View style={{ paddingHorizontal: gutter, paddingTop: 12 }}>
        <Label size={9} tracking={0.1} colour={color.neutral600}>
          {t({
            en: `Seed commitment ${s.epoch.commitment.slice(0, 16)}… published ${openedOn(s.epoch.openedAt)}`,
            th: `ลายนิ้วมือเมล็ดสุ่ม ${s.epoch.commitment.slice(0, 16)}… ประกาศเมื่อ ${openedOn(s.epoch.openedAt)}`,
          })}
        </Label>
        {/*
          "Within N hours", not "when this round closes". The old wording was
          true of the code and useless to a reader, and for a while it was not
          even true of the running server: nothing closed a round, so the seed
          was never published and no receipt could be checked (docs/68).
        */}
        <Body size={13} style={{ color: color.neutral600, paddingTop: 4 }}>
          {t({
            en: 'Every roll is computed from a seed whose fingerprint was published before any of them '
              + 'were made. When this round closes the seed is published too, and any summon can be '
              + 'recomputed from its receipt.',
            th: 'ทุกการสุ่มคำนวณจากเมล็ดสุ่มที่ประกาศลายนิ้วมือไว้ก่อนการสุ่มทั้งหมด '
              + 'เมื่อรอบนี้ปิด เมล็ดสุ่มจะถูกประกาศด้วย และทุกการอัญเชิญสามารถคำนวณซ้ำได้จากใบรับ',
          })}
        </Body>
      </View>

      <View style={{ paddingHorizontal: gutter, paddingTop: 20, paddingBottom: 8 }}>
        <Heading size={16}>{t({ en: 'The guide', th: 'สมุดภูต' })}</Heading>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: gutter, paddingBottom: 32 }}>
        {(guide.data?.spirits ?? []).map((card) => <SpiritCardView key={card.key} card={card} />)}
      </View>
    </ScrollView>
  );
}

/** What just arrived. A duplicate says so, warmly, and says what it became. */
function Outcome({ result }: { result: SummonResult }) {
  return (
    <View
      style={[shadow.card, {
        marginHorizontal: gutter, marginTop: 12, padding: 14, borderRadius: gameRadius.panel,
        backgroundColor: color.surface, borderWidth: 2, borderColor: RARITY_TINT[result.rarity],
        flexDirection: 'row', alignItems: 'center', gap: 14,
      }]}
    >
      <MascotMark mascot={result.spirit.form} size={72} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Heading size={18}>{t(result.spirit.name)}</Heading>
          <RarityPill rarity={result.rarity} />
        </View>
        <Label size={10} tracking={0.06} colour={color.neutral700} style={{ textTransform: 'none' }}>
          {t(result.spirit.creature)}
        </Label>
        <Body size={13} style={{ color: color.neutral800 }}>{t(result.spirit.lore)}</Body>
        {result.byPity ? (
          <Label size={9} tracking={0.1} colour={color.neutral600}>
            {result.byPity === 'mythic'
              ? t({ en: 'The mythic floor', th: 'เพดานรับประกันระดับเทพ' })
              : t({ en: 'The rare floor', th: 'เพดานรับประกันระดับหายาก' })}
          </Label>
        ) : null}
        {result.duplicate ? (
          <Label size={10} tracking={0.06} colour={color.neutral700} style={{ textTransform: 'none' }}>
            {t({
              en: `Already yours — it became ${result.dustGained} stardust.`,
              th: `คุณมีอยู่แล้ว — แปลงเป็นผงดาว ${result.dustGained} หน่วย`,
            })}
          </Label>
        ) : null}
      </View>
    </View>
  );
}
