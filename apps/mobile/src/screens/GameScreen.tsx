/**
 * The game layer, one tap from anywhere.
 *
 * Before this screen existed, everything on it was buried. A companion was
 * three taps down behind the wallet; the seventy-seven and the medals hung off
 * the passport, which hung off Home. That is a strange place to keep the part
 * of a product people open it for, and it happened the way these things always
 * happen — each door was reasonable on the day it was added.
 *
 * So the game took the wallet's cell on the tab bar. The wallet already had a
 * door on Home showing both balances, so its tab was a second route to a
 * screen one tap away; the game layer had no door at all. `store.tsx` carries
 * the argument in full.
 *
 * THE LOOK is a game lobby: a level chip, a row of round doors, one large
 * card for what to do next, and a grid of bright tiles with the character
 * standing over the corner of each. That is the shape party-game apps open on,
 * and it is borrowed because it is legible before anybody reads a word.
 *
 * WHAT IS NOT BORROWED. Those lobbies put a coin balance with a "+" in the
 * corner, and the "+" is a shop. Neither balance is on this screen: Green and
 * Trip are the ledger, the ledger is evidence, and evidence does not wear the
 * game surface (`game-surface.test.ts`). The level is here because EXP is the
 * game layer's own number, earned by activity and never spent.
 *
 * WHAT THIS SCREEN REFUSES TO BECOME. A hub is a list of links, and a list of
 * links is what the wallet already was. So every habitat is a tile you can
 * see from here, found or not, and the creature is ON it — you arrive
 * somewhere rather than at a menu.
 *
 * Nothing here is a claim about the world. Every number on it is a count of
 * things this traveller collected, and the one figure that IS evidence — how
 * many a host verified — is printed as itself rather than folded into a score.
 */

import React from 'react';
import { Image, Modal, Pressable, ScrollView, Text, useWindowDimensions, View, type ImageSourcePropType } from 'react-native';
import { Backpack, ChevronRight, Map as MapIcon, PawPrint, Shirt, Sparkles, X, type LucideIcon } from 'lucide-react-native';
import collectMedal from '../../assets/collect-medal-v1.png';
import collectPassport from '../../assets/collect-passport-v1.png';
import collectFriends from '../../assets/collect-travel-friends-v1.png';
import collectBackdrop from '../../assets/chivago-travel-hero-v2.png';
import chivagoLogo from '../../assets/chivago-logo.png';
import coralArt from '../../assets/mission-coral-v1.png';
import communityArt from '../../assets/mission-community-v1.png';
import beachArt from '../../assets/mission-beach-cleanup-v1.png';
import {
  collectionSummary, SPECIES, strings,
  type Companion, type LayerKey, type Progression, type Species,
} from '@chivago/core';
import { gameRadius, gameShadow } from '@chivago/tokens';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { GameScene, Medal, Tray, TrayLine } from '../components/Game.tsx';
import { Creature } from '../components/Creature.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { STAGE_LABEL } from './CompanionHome.tsx';
import { t } from '../i18n/locale.ts';
import { ProfileButton } from '../components/ProfileButton.tsx';
import { TravelHeroBackdrop } from '../components/Shell.tsx';

/** The habitats in the order the grid draws them. */
const HABITATS = Object.keys(SPECIES) as LayerKey[];

/**
 * The companion to put on the big card: the one with a step left to take.
 *
 * A hatchling before an egg, because it is the nearer of the two to growing
 * and the step it names is the more satisfying one to take. Null when there is
 * nothing to point at — none found yet, or every one already grown.
 */
export function nextUp(companions: Companion[]): Companion | null {
  const waiting = companions.filter((c) => c.stage !== 'grown' && c.nextStep !== null);
  return waiting.find((c) => c.stage === 'hatchling') ?? waiting[0] ?? null;
}

export function GameScreen({
  onOpenCompanion, onOpenMascots, onOpenSummon, onOpenMedals, onOpenPassport, onOpenParty,
  onOpenProfile, onOpenWallet, onOpenFashion,
}: {
  onOpenCompanion: (companion: Companion) => void;
  onOpenMascots: () => void;
  onOpenSummon: () => void;
  onOpenMedals: () => void;
  onOpenPassport: () => void;
  onOpenParty: () => void;
  onOpenProfile?: () => void;
  onOpenWallet: () => void;
  onOpenFashion: () => void;
}) {
  const held = useAsync(() => api.companions(), []);
  // Only the progression is read from the wallet. Its balances are the ledger
  // and stay on the wallet's own screen; a wallet that fails to load costs
  // this screen its level chip and nothing else.
  const wallet = useAsync(() => api.wallet(), []);
  const data = held.data;
  const companions = data?.companions ?? [];
  const summary = companions.length > 0 ? collectionSummary(companions) : null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} showsVerticalScrollIndicator={false}>
      <Header
        progression={wallet.data?.progression ?? null}
        onOpenProfile={onOpenProfile}
        onOpenWallet={onOpenWallet}
        onOpenMascots={onOpenMascots}
        onOpenFashion={onOpenFashion}
      />
      <Doors onOpenMedals={onOpenMedals} onOpenPassport={onOpenPassport} onOpenParty={onOpenParty} />

      {held.error ? <ErrorState message={held.error} onRetry={held.reload} /> : null}
      {held.loading && !data ? <LoadingState /> : null}

      {data ? (
        <>
          <Grid
            companions={companions}
            onOpen={onOpenCompanion}
            onOpenMascots={onOpenMascots}
            onOpenSummon={onOpenSummon}
          />
          <NextUp companion={nextUp(companions)} anyFound={companions.length > 0} onOpen={onOpenCompanion} />
          {summary ? <Counts found={summary.found} grown={summary.grown} total={summary.total} /> : null}
          <Footnote />
        </>
      ) : null}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

/** The screen's name and the level, which is the game layer's own number. */
function Header({
  progression, onOpenProfile, onOpenWallet, onOpenMascots, onOpenFashion,
}: {
  progression: Progression | null;
  onOpenProfile?: () => void;
  onOpenWallet: () => void;
  onOpenMascots: () => void;
  onOpenFashion: () => void;
}) {
  return (
    <View style={{
      paddingHorizontal: gutter,
      paddingTop: 20,
      paddingBottom: 20,
      backgroundColor: '#097097',
      borderBottomLeftRadius: 30,
      borderBottomRightRadius: 30,
      overflow: 'hidden',
      shadowColor: '#00263E',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.18,
      shadowRadius: 12,
      elevation: 4,
    }}>
      <TravelHeroBackdrop compact focalPoint="right" />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Label size={10} tracking={0.16} colour="#D5F6FF">
            {t({ en: 'COLLECT & DISCOVER', th: 'สะสมและออกเดินทาง', zh: '收藏与探索' })}
          </Label>
          <Heading size={27} colour="#FFFFFF" style={{ marginTop: 3, fontWeight: '800' }}>
            {t({ en: 'Collect & collections', th: 'สะสม & เก็บคอลเลกชัน', zh: '收集与收藏' })}
          </Heading>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Image source={chivagoLogo} resizeMode="contain" accessibilityLabel="ChivarGo" style={{ width: 62, height: 44 }} />
          <ProfileButton onPress={onOpenProfile} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 11 }}>
        {progression ? <View style={{ flexShrink: 0, paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.94)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)' }}><Label size={9} tracking={0.08} colour="#08748A">{t(strings.profile.levelChip(progression.level, progression.exp))}</Label></View> : null}
        <HeaderAction icon={Backpack} label="My Backpack" onPress={onOpenWallet} />
        <HeaderAction icon={PawPrint} label="Mascot" onPress={onOpenMascots} />
        <HeaderAction icon={Shirt} label="Fashion" onPress={onOpenFashion} />
      </View>
    </View>
  );
}

function HeaderAction({
  icon: Icon, label, onPress,
}: { icon: LucideIcon; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 0,
        minHeight: 44,
        paddingHorizontal: 8,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.52)',
        backgroundColor: pressed ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.20)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      })}
    >
      <Icon size={17} color="#FFFFFF" strokeWidth={2.1} />
      <Text numberOfLines={2} style={{ flexShrink: 1, color: '#FFFFFF', fontSize: 11, lineHeight: 14, fontWeight: '700', textAlign: 'center' }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Round doors, the way a lobby opens: an icon you can find before you can read. */
function Doors({
  onOpenMedals, onOpenPassport, onOpenParty,
}: { onOpenMedals: () => void; onOpenPassport: () => void; onOpenParty: () => void }) {
  return (
    <View style={{ flexDirection: 'row', paddingHorizontal: gutter, paddingTop: 8, gap: 10 }}>
      <Door
        image={collectMedal}
        label={t({ en: 'Medals', th: 'เหรียญรางวัล', zh: '奖章' })}
        fill="#FFF3D5"
        onPress={onOpenMedals}
      />
      <Door
        image={collectPassport}
        label={t({ en: 'Digital passport', th: 'พาสปอร์ตดิจิทัล', zh: '数字护照' })}
        accessibilityLabel={t({ en: 'Passport', th: 'พาสปอร์ต', zh: '护照' })}
        fill="#DDF4FF"
        onPress={onOpenPassport}
      />
      <Door
        image={collectFriends}
        label={t({ en: 'Travelling with', th: 'เพื่อนร่วมทาง', zh: '同行的人' })}
        fill="#FFF0D7"
        onPress={onOpenParty}
      />
    </View>
  );
}

function Door({
  image, label, accessibilityLabel = label, fill, onPress,
}: { image: ImageSourcePropType; label: string; accessibilityLabel?: string; fill: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[shadow.card, { flex: 1, height: 142, borderRadius: 20, backgroundColor: fill, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(13,88,122,.08)' }]}
    >
      <Image source={image} resizeMode="cover" style={{ width: '100%', height: 94 }} />
      <View style={{ flex: 1, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' }}>
        <Text numberOfLines={2} style={{ color: '#082E53', fontSize: 12, lineHeight: 16, fontWeight: '800', textAlign: 'center' }}>{label}</Text>
      </View>
    </Pressable>
  );
}

/**
 * The big card: one thing to do next, in the companion's own words.
 *
 * The step is the one `nextStepFor` wrote in core, so the card can only ever
 * promise what the ledger would actually count.
 */
function NextUp({
  companion, anyFound, onOpen,
}: { companion: Companion | null; anyFound: boolean; onOpen: (c: Companion) => void }) {
  const frame = [
    { marginHorizontal: gutter, marginTop: 16, minHeight: 132, borderRadius: gameRadius.panel, overflow: 'hidden' as const },
    gameShadow.lift,
  ];

  if (!companion) {
    // Nobody found yet, or every one grown: a sentence, never a blank panel.
    const said = anyFound
      ? { en: 'Every companion you have found is grown.', th: 'เพื่อนร่วมทางที่คุณพบโตเต็มวัยครบทุกตัวแล้ว', zh: '你找到的伙伴都已长大。' }
      : {
        en: 'Nothing here yet. A companion arrives on your second day in a habitat.',
        th: 'ยังไม่มีอะไรที่นี่ เพื่อนร่วมทางจะมาถึงในวันที่สองที่คุณอยู่ในถิ่นนั้น',
        zh: '这里还空着。在一处栖息地待到第二天，就会有伙伴出现。',
      };
    return (
      <View style={frame}>
        <GameScene>
          <View style={{ flex: 1, justifyContent: 'center', padding: 18 }}>
            <Body size={14} colour={color.neutral800}>{t(said)}</Body>
          </View>
        </GameScene>
      </View>
    );
  }

  const name = t(companion.species.name);
  return (
    <Pressable
      onPress={() => onOpen(companion)}
      accessibilityRole="button"
      accessibilityLabel={`${t({ en: 'Next up', th: 'ก้าวต่อไป', zh: '下一步' })}: ${name}. ${t(companion.nextStep!)}`}
      style={frame}
    >
      <GameScene>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', padding: 16, gap: 10 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <View
              style={{
                alignSelf: 'flex-start', backgroundColor: color.ctaDeep,
                borderRadius: gameRadius.chip, paddingHorizontal: 8, paddingVertical: 2,
              }}
            >
              <Label size={9} tracking={0.1} colour={color.surface}>{t({ en: 'NEXT UP', th: 'ก้าวต่อไป', zh: '下一步' })}</Label>
            </View>
            <Heading size={19} tracking={-0.2}>{name}</Heading>
            <Body size={13} colour={color.neutral800}>{t(companion.nextStep!)}</Body>
          </View>
          <Creature species={companion.species.key} stage={companion.stage} size={88} />
        </View>
      </GameScene>
    </Pressable>
  );
}

/**
 * Every habitat as a tile, found or not, and the seventy-seven as a sixth.
 *
 * An unfound habitat shows its EGG name and the place it comes from, never
 * the animal: the egg is the one thing in this layer that is meant to keep a
 * secret, and a grid that named every species would give all five away.
 */
function Grid({
  companions, onOpen, onOpenMascots, onOpenSummon,
}: {
  companions: Companion[];
  onOpen: (c: Companion) => void;
  onOpenMascots: () => void;
  onOpenSummon: () => void;
}) {
  const byLayer = new Map(companions.map((c) => [c.species.layer, c]));
  const { width } = useWindowDimensions();
  const cardWidth = Math.max(92, Math.min(124, (width - gutter * 2 - 58) / 3));
  const rail = React.useRef<ScrollView>(null);
  const [lockedSpecies, setLockedSpecies] = React.useState<Species | null>(null);
  return (
    <>
    <View style={[gameShadow.lift, { marginHorizontal: gutter, marginTop: 20, height: 246, borderRadius: 28, overflow: 'hidden', backgroundColor: '#38A9CF' }]}> 
      <Text style={hiddenText}>{t({ en: 'HABITATS', th: 'ถิ่นที่อยู่', zh: '栖息地' })}</Text>
      <Image source={collectBackdrop} resizeMode="cover" style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0.78 }} />
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(10,137,184,.24)' }} />
      <View style={{ paddingHorizontal: 16, paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,.92)', alignItems: 'center', justifyContent: 'center' }}>
            <MapIcon size={18} color="#087DA4" strokeWidth={2.2} />
          </View>
          <Heading size={20} colour="#07335A">{t({ en: 'My collection', th: 'คอลเลกชันของฉัน', zh: '我的收藏' })}</Heading>
        </View>
        <Pressable
          onPress={() => rail.current?.scrollToEnd({ animated: true })}
          accessibilityRole="button"
          accessibilityLabel={t({ en: 'View all collections', th: 'ดูคอลเลกชันทั้งหมด', zh: '查看全部收藏' })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: 'rgba(255,255,255,.94)' }}
        >
          <Text style={{ color: '#07335A', fontSize: 11, fontWeight: '800' }}>{t({ en: 'View all', th: 'ดูทั้งหมด', zh: '查看全部' })}</Text>
          <ChevronRight size={14} color="#087DA4" strokeWidth={2.5} />
        </Pressable>
      </View>
      <ScrollView ref={rail} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 }}>
        {HABITATS.map((layer, index) => {
          const found = byLayer.get(layer);
          return found
            ? <FoundTile key={layer} companion={found} onOpen={onOpen} width={cardWidth} turn={cardTurn(index)} />
            : <UnfoundTile key={layer} species={SPECIES[layer]} width={cardWidth} turn={cardTurn(index)} onPress={() => setLockedSpecies(SPECIES[layer])} />;
        })}
        <Pressable
          onPress={onOpenMascots}
          accessibilityRole="button"
          accessibilityLabel={t({ en: 'The seventy-seven province emblems', th: 'มาสคอตครบ 77 จังหวัด', zh: '七十七府吉祥物' })}
          style={[tileFrame(cardWidth, cardTurn(5)), gameShadow.lift]}
        >
          <Image source={collectPassport} resizeMode="cover" style={tileImage} />
          <View style={tileBadge}><MapIcon size={16} color="#087DA4" /></View>
          <Text style={hiddenText}>{t({ en: 'The 77 Province emblems', th: 'ครบ 77 จังหวัด มาสคอตประจำจังหวัด', zh: '七十七府吉祥物' })}</Text>
        </Pressable>
        {/*
          The summoning (docs/68), next to the two collections it is not.

          The companions are real animals on an evidence ladder and the
          seventy-seven are province emblems; the spirits are invented and
          the tile says so in its own subtitle, because a traveller meeting
          all three in one grid has to be able to tell them apart.
        */}
        <Pressable
          onPress={onOpenSummon}
          accessibilityRole="button"
          accessibilityLabel={t({ en: 'The Summoning: invented spirits, from charms you earned', th: 'การอัญเชิญ: ภูตที่แต่งขึ้น แลกด้วยเครื่องรางที่สะสมเอง', zh: '召唤：虚构的精灵，用你赚得的护符换取' })}
          style={[tileFrame(cardWidth, cardTurn(6)), gameShadow.lift]}
        >
          <Image source={collectMedal} resizeMode="cover" style={tileImage} />
          <View style={tileBadge}><Sparkles size={16} color="#C47B00" /></View>
          <Text style={hiddenText}>{t({ en: 'The Summoning, invented spirits', th: 'การอัญเชิญ ภูตที่แต่งขึ้น', zh: '召唤虚构精灵' })}</Text>
        </Pressable>
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 42, backgroundColor: 'rgba(6,145,191,.72)', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#FFFFFF', fontSize: 12, fontStyle: 'italic', fontWeight: '700' }}>✦ {t({ en: 'Collect more, explore more!', th: 'ยิ่งสะสม ยิ่งได้ออกไปค้นพบ!', zh: '收藏更多，探索更多！' })} ✦</Text>
      </View>
    </View>
    <Modal visible={lockedSpecies !== null} transparent animationType="fade" onRequestClose={() => setLockedSpecies(null)}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(3,31,50,.58)' }}>
        <View style={[gameShadow.lift, { width: '100%', maxWidth: 380, alignSelf: 'center', borderRadius: 28, backgroundColor: '#FFFFFF', padding: 22 }]}> 
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Label size={9} tracking={0.14} colour="#0A8AA8">{t({ en: 'NOT FOUND YET', th: 'ยังไม่พบ', zh: '尚未发现' })}</Label>
              <Heading size={22} colour="#082E53" style={{ marginTop: 4 }}>{lockedSpecies ? t(lockedSpecies.eggName) : ''}</Heading>
            </View>
            <Pressable onPress={() => setLockedSpecies(null)} accessibilityRole="button" accessibilityLabel={t({ en: 'Close', th: 'ปิด', zh: '关闭' })} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#EAF7FB', alignItems: 'center', justifyContent: 'center' }}>
              <X size={20} color="#087DA4" />
            </Pressable>
          </View>
          {lockedSpecies ? <>
            <Body size={14} colour={color.neutral800} style={{ marginTop: 14 }}>{t(lockedSpecies.habitat)}</Body>
            <View style={{ marginTop: 16, padding: 14, borderRadius: 18, backgroundColor: '#EAF7FB', borderWidth: 1, borderColor: '#CFEAF2' }}>
              <Body size={13} colour="#31566C">{t({ en: 'A companion arrives on your second day in this habitat.', th: 'เพื่อนร่วมทางจะมาถึงในวันที่สองที่คุณอยู่ในถิ่นนี้', zh: '在这个栖息地停留到第二天，伙伴就会出现。' })}</Body>
            </View>
          </> : null}
        </View>
      </View>
    </Modal>
    </>
  );
}

const collectionArt: Record<LayerKey, ImageSourcePropType> = {
  Green: collectFriends,
  Wellness: communityArt,
  Food: beachArt,
  Safe: coralArt,
  Quest: collectPassport,
};

const cardTurn = (index: number) => `${[-4, 2.5, -2, 3, -3, 2, -2][index % 7]}deg`;
const tileImage = { position: 'absolute' as const, width: '100%' as const, height: '100%' as const };
const tileBadge = { position: 'absolute' as const, right: 7, bottom: 7, width: 31, height: 31, borderRadius: 16, backgroundColor: 'rgba(255,255,255,.9)', alignItems: 'center' as const, justifyContent: 'center' as const };
const hiddenText = { position: 'absolute' as const, left: -9999, width: 1, height: 1, opacity: 0 };

const tileFrame = (width: number, turn: string) => ({
  width, height: 116, borderRadius: 15,
  backgroundColor: '#FFFFFF', overflow: 'hidden' as const,
  borderWidth: 3, borderColor: '#FFFFFF', transform: [{ rotate: turn }],
});

function FoundTile({ companion, onOpen, width, turn }: { companion: Companion; onOpen: (c: Companion) => void; width: number; turn: string }) {
  const name = t(companion.species.name);
  const stage = t(STAGE_LABEL[companion.stage]);
  return (
    <Pressable
      onPress={() => onOpen(companion)}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${stage}. ${t(strings.place.visitItsHome)}`}
      style={[tileFrame(width, turn), gameShadow.lift]}
    >
      <Image source={collectionArt[companion.species.layer]} resizeMode="cover" style={tileImage} />
      <View style={{ position: 'absolute', right: 0, bottom: -3 }}><Creature species={companion.species.key} stage={companion.stage} size={66} /></View>
      <Text style={hiddenText}>{name} {stage}</Text>
    </Pressable>
  );
}

function UnfoundTile({ species, width, turn, onPress }: { species: Species; width: number; turn: string; onPress: () => void }) {
  const egg = t(species.eggName);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${egg}, ${t({ en: 'not found yet', th: 'ยังไม่พบ', zh: '尚未发现' })}. ${t(species.habitat)}`}
      style={({ pressed }) => [tileFrame(width, turn), pressed && { opacity: 0.86, transform: [{ rotate: turn }, { scale: 0.97 }] }]}
    >
      <Image source={collectionArt[species.layer]} resizeMode="cover" style={[tileImage, { opacity: 0.82 }]} />
      <View style={{ position: 'absolute', right: 0, bottom: -3, opacity: 0.9 }}><Creature species={species.key} stage="egg" size={66} /></View>
      <Text style={hiddenText}>{egg} {t({ en: 'Not found yet', th: 'ยังไม่พบ', zh: '尚未发现' })}</Text>
    </Pressable>
  );
}

/**
 * Three counts, in a tray.
 *
 * `grown` is the only one that is evidence — a companion grows when a host
 * verifies a quest — so it is named as such rather than left to look like the
 * same kind of number as the others.
 */
function Counts({ found, grown, total }: { found: number; grown: number; total: number }) {
  return (
    <Tray style={{ marginHorizontal: gutter, marginTop: 14, borderRadius: gameRadius.panel }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Medal value={found} />
        <View style={{ flex: 1 }}>
          <TrayLine>
            {t({
              en: `${found} of ${total} habitats, ${grown} grown by a verified quest`,
              th: `${found} จาก ${total} ถิ่น · โตแล้ว ${grown} ตัวจากภารกิจที่ผู้จัดตรวจ`,
              zh: `${total} 处栖息地中已发现 ${found} 处 · 其中 ${grown} 只因已验证的任务而长大`,
            })}
          </TrayLine>
        </View>
      </View>
    </Tray>
  );
}

function Footnote() {
  return (
    <View
      style={[
        shadow.card,
        {
          marginHorizontal: gutter, marginTop: 14, padding: 14, borderRadius: radius.md,
          backgroundColor: color.surface, borderWidth: 1, borderColor: '#DCEFF5',
        },
      ]}
    >
      <Body size={13} colour={color.neutral700}>
        {t({
          en: 'Nothing on this screen is a claim about the world. What a host verified is said as itself, on the pages that carry it.',
          th: 'ไม่มีอะไรในหน้านี้ที่เป็นการอ้างเรื่องจริงในโลก สิ่งที่ผู้จัดตรวจแล้วจะบอกตรง ๆ ในหน้าที่มันอยู่',
          zh: '本页上的任何内容都不是对现实世界的主张。主办方验证过的事，会在承载它的页面上如实说明。',
        })}
      </Body>
    </View>
  );
}
