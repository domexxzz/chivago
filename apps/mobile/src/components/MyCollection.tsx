import React from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { ChevronRight, Map as MapIcon, Sparkles, X } from 'lucide-react-native';
import {
  SPECIES,
  strings,
  type Companion,
  type LayerKey,
  type Species,
} from '@chivago/core';
import { gameShadow } from '@chivago/tokens';
import collectMedal from '../../assets/collect-medal-v1.png';
import collectPassport from '../../assets/collect-passport-v1.png';
import collectFriends from '../../assets/collect-travel-friends-v1.png';
import coralArt from '../../assets/mission-coral-v1.png';
import communityArt from '../../assets/mission-community-v1.png';
import beachArt from '../../assets/mission-beach-cleanup-v1.png';
import { Creature } from './Creature.tsx';
import { Heading, Label, Body } from './Type.tsx';
import { STAGE_LABEL } from '../screens/CompanionHome.tsx';
import { color, gutter } from '../theme/index.ts';
import { t } from '../i18n/locale.ts';

const HABITATS = Object.keys(SPECIES) as LayerKey[];

/**
 * The traveller's visual collection rail.
 *
 * It lives in My Backpack because the backpack is the single place where the
 * traveller reviews what they already own. The Collect screen keeps the next
 * thing to do; the backpack keeps the things already found.
 */
export function MyCollection({
  companions,
  onOpenCompanion,
  onOpenMascots,
  onOpenSummon,
  onOpenCollect,
}: {
  companions: Companion[];
  onOpenCompanion: (companion: Companion) => void;
  onOpenMascots: () => void;
  onOpenSummon: () => void;
  /**
   * The Collect lobby — the rest of the collection, and on a wide screen the
   * only door to it, since the rail's fourth cell is the backpack now. Given,
   * "View all" opens it; omitted, "View all" keeps running the rail to its
   * end, which is all it could ever do on its own.
   */
  onOpenCollect?: () => void;
}) {
  const byLayer = new Map(companions.map((companion) => [companion.species.layer, companion]));
  const { width } = useWindowDimensions();
  const cardWidth = Math.max(92, Math.min(124, (width - gutter * 2 - 58) / 3));
  const rail = React.useRef<ScrollView>(null);
  const [lockedSpecies, setLockedSpecies] = React.useState<Species | null>(null);

  return (
    <>
      {/*
        A SHELF, not a photo album over a beach.

        The cards used to sit at angles on a postcard of a bay, which made
        the whole rail read as one picture and the tiles as decoration on it.
        A display shelf says the opposite in the same space: each card is an
        object, it is standing upright because somebody put it there, and the
        empty stretch of plank to its right is a fact about the collection
        rather than a gap in a layout.
      */}
      <View style={[gameShadow.lift, {
        marginHorizontal: gutter,
        marginTop: 32,
        borderRadius: 26,
        borderWidth: 3,
        borderColor: '#123E68',
        backgroundColor: '#D7ECF9',
        paddingHorizontal: 14,
        paddingTop: 14,
        paddingBottom: 14,
      }]}>
        <Text style={hiddenText}>{t({ en: 'HABITATS', th: 'ถิ่นที่อยู่', zh: '栖息地' })}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          {/* The panel's name on a navy capsule, over its top edge. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -29, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 19, borderWidth: 2, borderColor: '#E8B943', backgroundColor: '#0E3A63' }}>
            <MapIcon size={17} color="#F6CF61" strokeWidth={2.2} />
            <Heading size={17} colour="#FFFFFF">{t({ en: 'My collection', th: 'คอลเลกชันของฉัน', zh: '我的收藏' })}</Heading>
          </View>
          <Pressable
            onPress={() => {
              if (onOpenCollect) onOpenCollect();
              else rail.current?.scrollToEnd({ animated: true });
            }}
            accessibilityRole="button"
            accessibilityLabel={t({ en: 'View all collections', th: 'ดูคอลเลกชันทั้งหมด', zh: '查看全部收藏' })}
            // 44 high, not 31. A thumb on a phone is the smallest thing this
            // control has to survive, and it is the only control on the rail.
            style={({ pressed }) => ({ minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 22, borderWidth: 2, borderColor: '#0E3A63', backgroundColor: pressed ? '#CFE7F4' : '#FFFFFF' })}
          >
            <Text style={{ color: '#07335A', fontSize: 11, fontWeight: '800' }}>{t({ en: 'View all', th: 'ดูทั้งหมด', zh: '查看全部' })}</Text>
            <ChevronRight size={14} color="#087DA4" strokeWidth={2.5} />
          </Pressable>
        </View>

        <View style={{ marginTop: 10, borderRadius: 16, overflow: 'hidden', borderWidth: 2, borderColor: '#8A5A2B', backgroundColor: '#EBD9B4' }}>
          <ScrollView ref={rail} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, alignItems: 'flex-end' }}>
            {HABITATS.map((layer) => {
              const found = byLayer.get(layer);
              return found
                ? <FoundTile key={layer} companion={found} onOpen={onOpenCompanion} width={cardWidth} />
                : <UnfoundTile key={layer} species={SPECIES[layer]} width={cardWidth} onPress={() => setLockedSpecies(SPECIES[layer])} />;
            })}
            <Pressable
              onPress={onOpenMascots}
              accessibilityRole="button"
              accessibilityLabel={t({ en: 'The seventy-seven province emblems', th: 'มาสคอตครบ 77 จังหวัด', zh: '七十七府吉祥物' })}
              style={[tileFrame(cardWidth), gameShadow.lift]}
            >
              <Image source={collectPassport} resizeMode="cover" style={tileImage} />
              <View style={tileBadge}><MapIcon size={16} color="#087DA4" /></View>
              <Text style={hiddenText}>{t({ en: 'The 77 Province emblems', th: 'ครบ 77 จังหวัด มาสคอตประจำจังหวัด', zh: '七十七府吉祥物' })}</Text>
            </Pressable>
            <Pressable
              onPress={onOpenSummon}
              accessibilityRole="button"
              accessibilityLabel={t({ en: 'The Summoning: invented spirits, from charms you earned', th: 'การอัญเชิญ: ภูตที่แต่งขึ้น แลกด้วยเครื่องรางที่สะสมเอง', zh: '召唤：虚构的精灵，用你赚得的护符换取' })}
              style={[tileFrame(cardWidth), gameShadow.lift]}
            >
              <Image source={collectMedal} resizeMode="cover" style={tileImage} />
              <View style={tileBadge}><Sparkles size={16} color="#C47B00" /></View>
              <Text style={hiddenText}>{t({ en: 'The Summoning, invented spirits', th: 'การอัญเชิญ ภูตที่แต่งขึ้น', zh: '召唤虚构精灵' })}</Text>
            </Pressable>
          </ScrollView>
          {/* The plank the cards are standing on, and its front edge. */}
          <View style={{ height: 11, backgroundColor: '#C08A4A', borderTopWidth: 2, borderTopColor: '#E0B679' }} />
          <View style={{ height: 9, backgroundColor: '#8A5A2B' }} />
        </View>

        <Text style={{ marginTop: 9, textAlign: 'center', color: '#20587A', fontSize: 12, fontStyle: 'italic', fontWeight: '700' }}>
          ✦ {t({ en: 'Collect more, explore more!', th: 'ยิ่งสะสม ยิ่งได้ออกไปค้นพบ!', zh: '收藏更多，探索更多！' })} ✦
        </Text>
      </View>
      <Modal visible={lockedSpecies !== null} transparent animationType="fade" onRequestClose={() => setLockedSpecies(null)}>
        <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(3,31,50,.58)' }}>
          <View style={[gameShadow.lift, { width: '100%', maxWidth: 380, alignSelf: 'center', borderRadius: 28, backgroundColor: '#FFFFFF', padding: 22 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Label size={9} tracking={0.14} colour="#0A8AA8">{t({ en: 'NOT FOUND YET', th: 'ยังไม่พบ', zh: '尚未发现' })}</Label>
                <Heading size={22} colour="#082E53" style={{ marginTop: 4 }}>{lockedSpecies ? t(lockedSpecies.eggName) : ''}</Heading>
              </View>
              <Pressable onPress={() => setLockedSpecies(null)} accessibilityRole="button" accessibilityLabel={t({ en: 'Close', th: 'ปิด', zh: '关闭' })} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#EAF7FB', alignItems: 'center', justifyContent: 'center' }}>
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

const tileImage = { position: 'absolute' as const, width: '100%' as const, height: '100%' as const };
const tileBadge = { position: 'absolute' as const, right: 7, bottom: 7, width: 31, height: 31, borderRadius: 16, backgroundColor: 'rgba(255,255,255,.9)', alignItems: 'center' as const, justifyContent: 'center' as const };
const hiddenText = { position: 'absolute' as const, left: -9999, width: 1, height: 1, opacity: 0 };

/*
  Upright, and all the same height.

  The tiles used to be rotated a few degrees each, which is the snapshot-in-
  an-album look. On a shelf it reads as things that have fallen over.
*/
const tileFrame = (width: number) => ({
  width,
  height: 116,
  borderRadius: 13,
  backgroundColor: '#FFFFFF',
  overflow: 'hidden' as const,
  borderWidth: 3,
  borderColor: '#FFFFFF',
});

function FoundTile({ companion, onOpen, width }: { companion: Companion; onOpen: (companion: Companion) => void; width: number }) {
  const name = t(companion.stage === 'egg' ? companion.species.eggName : companion.species.name);
  const stage = t(STAGE_LABEL[companion.stage]);
  return (
    <Pressable
      onPress={() => onOpen(companion)}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${stage}. ${t(strings.place.visitItsHome)}`}
      style={[tileFrame(width), gameShadow.lift]}
    >
      <Image source={collectionArt[companion.species.layer]} resizeMode="cover" style={tileImage} />
      <View style={{ position: 'absolute', right: 0, bottom: -3 }}><Creature species={companion.species.key} stage={companion.stage} size={66} /></View>
      <Text style={hiddenText}>{name} {stage}</Text>
    </Pressable>
  );
}

function UnfoundTile({ species, width, onPress }: { species: Species; width: number; onPress: () => void }) {
  const egg = t(species.eggName);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${egg}, ${t({ en: 'not found yet', th: 'ยังไม่พบ', zh: '尚未发现' })}. ${t(species.habitat)}`}
      style={({ pressed }) => [tileFrame(width), pressed && { opacity: 0.86, transform: [{ scale: 0.97 }] }]}
    >
      <Image source={collectionArt[species.layer]} resizeMode="cover" style={[tileImage, { opacity: 0.82 }]} />
      <View style={{ position: 'absolute', right: 0, bottom: -3, opacity: 0.9 }}><Creature species={species.key} stage="egg" size={66} /></View>
      <Text style={hiddenText}>{egg} {t({ en: 'Not found yet', th: 'ยังไม่พบ', zh: '尚未发现' })}</Text>
    </Pressable>
  );
}
