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
import { ChevronRight, Compass, Images, Map as MapIcon, Mountain, Plus, Sparkles, X } from 'lucide-react-native';
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
import backpackWorld from '../../assets/backpack-tropical-world-v1.png';
import { Creature } from './Creature.tsx';
import { INV, SectionBanner } from './AdventureInventory.tsx';
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
  /*
    THE CARDS FILL THE SHELF when the shelf is wide enough to hold all seven.

    Sized from the case's MEASURED width, not the window's: the rail, the
    gutters and the frame all take a share of the window and a guess at them
    left a quarter of the plank empty on a desktop. Seven exhibits, each a
    card plus its 8px easel, with 14px between them and 16px at each end.
    On a phone they keep a readable floor and the rail scrolls instead.
  */
  const [shelf, setShelf] = React.useState(0);
  const fitted = shelf > 0 ? Math.floor((shelf - 32 - 6 * 14) / 7) - 8 : 0;
  const phoneWidth = Math.max(92, Math.min(124, (width - gutter * 2 - 58) / 3));
  const cardWidth = fitted > 0 ? Math.max(phoneWidth, Math.min(150, fitted)) : phoneWidth;
  const rail = React.useRef<ScrollView>(null);
  const [lockedSpecies, setLockedSpecies] = React.useState<Species | null>(null);

  return (
    <>
      {/*
        A DISPLAY SHELF, not a photo album over a beach.

        A navy case, a brass-rimmed back wall, and a wooden plank the cards
        stand on, each on its own small easel. The point of the furniture is
        what it says about the cards: each one is an OBJECT somebody put
        there, and the empty paper slots beside them are a fact about the
        collection rather than a gap in a layout.
      */}
      <View style={{
        marginHorizontal: gutter,
        marginTop: 38,
        borderRadius: 26,
        borderWidth: 4,
        borderColor: INV.navy,
        backgroundColor: INV.panel,
        paddingHorizontal: 14,
        // The section banner used to begin 18px outside this case and was
        // visibly clipped at the top of a scrolled viewport. Give its 34px
        // overlap real room so the gold rim and icon always remain whole.
        paddingTop: 34,
        paddingBottom: 14,
        shadowColor: '#061F33', shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.24, shadowRadius: 14, elevation: 7,
      }}>
        <View pointerEvents="none" style={{ position: 'absolute', inset: 0, borderRadius: 22, overflow: 'hidden' }}>
          <Image source={backpackWorld} resizeMode="cover" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.14 }} />
          <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(199,229,245,0.68)' }} />
        </View>
        <View pointerEvents="none" style={{ position: 'absolute', top: 6, left: 6, right: 6, bottom: 6, borderRadius: 20, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(22,77,115,0.28)' }} />
        <Text style={hiddenText}>{t({ en: 'HABITATS', th: 'ถิ่นที่อยู่', zh: '栖息地' })}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <SectionBanner icon={Images} title={t({ en: 'My collection', th: 'คอลเลกชันของฉัน', zh: '我的收藏' })} />
          <Pressable
            onPress={() => {
              if (onOpenCollect) onOpenCollect();
              else rail.current?.scrollToEnd({ animated: true });
            }}
            accessibilityRole="button"
            accessibilityLabel={t({ en: 'View all collections', th: 'ดูคอลเลกชันทั้งหมด', zh: '查看全部收藏' })}
            // 44 high, not 31. A thumb on a phone is the smallest thing this
            // control has to survive, and it is the only control on the rail.
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
              minHeight: 44, minWidth: 44, marginTop: -6,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 22,
              borderWidth: 2, borderColor: INV.navy,
              backgroundColor: pressed ? '#CFE7F4' : hovered ? '#F2FAFE' : INV.white,
              shadowColor: '#061F33', shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.18, shadowRadius: 4, elevation: 2,
            })}
          >
            <Text style={{ color: INV.navy, fontSize: 12, fontWeight: '800' }}>{t({ en: 'View all', th: 'ดูทั้งหมด', zh: '查看全部' })}</Text>
            <ChevronRight size={14} color={INV.ocean} strokeWidth={2.6} />
          </Pressable>
        </View>

        {/* The case: a brass rim around a blue back wall. */}
        <View
          onLayout={(e) => setShelf(Math.floor(e.nativeEvent.layout.width))}
          style={{
          marginTop: 4,
          borderRadius: 20,
          borderWidth: 3,
          borderColor: INV.antique,
          backgroundColor: '#8DB9D8',
          overflow: 'hidden',
          shadowColor: '#4D2A0E', shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.22, shadowRadius: 9, elevation: 4,
        }}>
          {/* Back-wall light: brighter at the top, falling into shadow behind the cards. */}
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '55%', backgroundColor: 'rgba(214,236,248,0.55)' }} />
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 10, backgroundColor: 'rgba(6,40,66,0.18)' }} />
          <ScrollView
            ref={rail}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 14, paddingHorizontal: 16, paddingTop: 18, alignItems: 'flex-end' }}
          >
            {HABITATS.map((layer) => {
              const found = byLayer.get(layer);
              return found
                ? <FoundTile key={layer} companion={found} onOpen={onOpenCompanion} width={cardWidth} />
                : <UnfoundTile key={layer} species={SPECIES[layer]} width={cardWidth} onPress={() => setLockedSpecies(SPECIES[layer])} />;
            })}
            <Exhibit width={cardWidth}>
              {(hovered) => (
                <Pressable
                  onPress={onOpenMascots}
                  accessibilityRole="button"
                  accessibilityLabel={t({ en: 'The seventy-seven province emblems', th: 'มาสคอตครบ 77 จังหวัด', zh: '七十七府吉祥物' })}
                  style={tileFrame(cardWidth, true, hovered)}
                >
                  <Image source={collectPassport} resizeMode="cover" style={tileImage} />
                  <View style={tileBadge}><MapIcon size={16} color="#087DA4" /></View>
                  <Text style={hiddenText}>{t({ en: 'The 77 Province emblems', th: 'ครบ 77 จังหวัด มาสคอตประจำจังหวัด', zh: '七十七府吉祥物' })}</Text>
                </Pressable>
              )}
            </Exhibit>
            <Exhibit width={cardWidth}>
              {(hovered) => (
                <Pressable
                  onPress={onOpenSummon}
                  accessibilityRole="button"
                  accessibilityLabel={t({ en: 'The Summoning: invented spirits, from charms you earned', th: 'การอัญเชิญ: ภูตที่แต่งขึ้น แลกด้วยเครื่องรางที่สะสมเอง', zh: '召唤：虚构的精灵，用你赚得的护符换取' })}
                  style={tileFrame(cardWidth, true, hovered)}
                >
                  <Image source={collectMedal} resizeMode="cover" style={tileImage} />
                  <View style={tileBadge}><Sparkles size={16} color="#C47B00" /></View>
                  <Text style={hiddenText}>{t({ en: 'The Summoning, invented spirits', th: 'การอัญเชิญ ภูตที่แต่งขึ้น', zh: '召唤虚构精灵' })}</Text>
                </Pressable>
              )}
            </Exhibit>
          </ScrollView>
          {/*
            The plank: a lit top face, a dark front edge, and the shadow it
            throws. Three bands, because one brown bar reads as a border and
            three read as a piece of wood with a thickness to it.
          */}
          <View style={{ height: 12, backgroundColor: '#C99256', borderTopWidth: 2, borderTopColor: '#F0CE8E' }} />
          <View style={{ height: 14, backgroundColor: '#8A5A2B', borderTopWidth: 1, borderTopColor: '#A9743E' }}>
            <View pointerEvents="none" style={{ position: 'absolute', top: 4, left: 18, right: 18, height: 1, backgroundColor: 'rgba(255,220,170,0.25)' }} />
          </View>
          <View style={{ height: 8, backgroundColor: 'rgba(40,20,5,0.28)' }} />
        </View>

        <Text style={{ marginTop: 10, textAlign: 'center', color: INV.ocean, fontSize: 12, fontStyle: 'italic', fontWeight: '700' }}>
          {'\u2726'} {t({ en: 'Collect more, explore more!', th: 'ยิ่งสะสม ยิ่งได้ออกไปค้นพบ!', zh: '收藏更多，探索更多！' })} {'\u2726'}
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
const tileBadge = { position: 'absolute' as const, right: 7, bottom: 7, width: 31, height: 31, borderRadius: 16, backgroundColor: 'rgba(255,255,255,.92)', alignItems: 'center' as const, justifyContent: 'center' as const };
const hiddenText = { position: 'absolute' as const, left: -9999, width: 1, height: 1, opacity: 0 };

/*
  Upright, and all the same height, in a frame thick enough to be a frame.

  The tiles used to be rotated a few degrees each, which is the snapshot-in-
  an-album look. On a shelf it reads as things that have fallen over.
*/
const tileFrame = (width: number, owned = false, hovered = false) => ({
  width,
  // Portrait, the way a card stands on an easel. Square read as a tile.
  height: Math.round(width * 1.26),
  borderRadius: 12,
  backgroundColor: owned ? '#FFF9DF' : INV.cream,
  overflow: 'hidden' as const,
  borderWidth: 4,
  borderColor: owned ? '#FFFFFF' : '#E7CFA2',
  transform: [{ scale: hovered ? 1.04 : 1 }],
  shadowColor: '#2A1806', shadowOffset: { width: 0, height: 5 },
  shadowOpacity: owned ? 0.32 : 0.18, shadowRadius: 7, elevation: owned ? 5 : 2,
});

/**
 * One card on its easel.
 *
 * The easel is a ledge and two angled legs in the plank's wood, drawn under
 * the card so the card sits ON it. Hover is read here, once, and handed to
 * the card, so the card lifts on a stand that stays planted.
 */
function Exhibit({ width, children }: { width: number; children: (hovered: boolean) => React.ReactNode }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <View
      // Web-only hover. On a phone there is no pointer and nothing changes.
      {...({ onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) } as object)}
      style={{ width: width + 8, alignItems: 'center' }}
    >
      {children(hovered)}
      <View pointerEvents="none" style={{ width: width + 8, height: 7, marginTop: -2, borderRadius: 3, backgroundColor: '#A9743E', borderTopWidth: 1, borderTopColor: '#D9A86A' }} />
      <View pointerEvents="none" style={{ width: width * 0.62, height: 14, flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={{ width: 6, height: 15, borderRadius: 2, backgroundColor: '#7A4A21', transform: [{ rotate: '14deg' }] }} />
        <View style={{ width: 6, height: 15, borderRadius: 2, backgroundColor: '#7A4A21', transform: [{ rotate: '-14deg' }] }} />
      </View>
    </View>
  );
}

function FoundTile({ companion, onOpen, width }: { companion: Companion; onOpen: (companion: Companion) => void; width: number }) {
  const name = t(companion.stage === 'egg' ? companion.species.eggName : companion.species.name);
  const stage = t(STAGE_LABEL[companion.stage]);
  return (
    <Exhibit width={width}>
      {(hovered) => (
        <Pressable
          onPress={() => onOpen(companion)}
          accessibilityRole="button"
          accessibilityLabel={`${name}, ${stage}. ${t(strings.place.visitItsHome)}`}
          style={tileFrame(width, true, hovered)}
        >
          <Image source={collectionArt[companion.species.layer]} resizeMode="cover" style={tileImage} />
          <View style={{ position: 'absolute', right: 0, bottom: -3 }}><Creature species={companion.species.key} stage={companion.stage} size={66} /></View>
          <Text style={hiddenText}>{name} {stage}</Text>
        </Pressable>
      )}
    </Exhibit>
  );
}

/**
 * A habitat not found yet: a blank collector's card with a "+".
 *
 * Paper, not a dimmed photograph of the habitat with an egg over it. The
 * photograph showed the reader a place they had not been as though it were
 * part of their collection. A blank card is honest about the one thing it
 * knows - that something goes here - and names the egg in small type so a
 * sighted reader is not left guessing which one is missing.
 */
function UnfoundTile({ species, width, onPress }: { species: Species; width: number; onPress: () => void }) {
  const egg = t(species.eggName);
  return (
    <Exhibit width={width}>
      {(hovered) => (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${egg}, ${t({ en: 'not found yet', th: 'ยังไม่พบ', zh: '尚未发现' })}. ${t(species.habitat)}`}
          style={({ pressed }) => [
            tileFrame(width, false, hovered),
            { alignItems: 'center' as const, justifyContent: 'center' as const, borderStyle: 'dashed' as const },
            pressed ? { opacity: 0.86 } : null,
          ]}
        >
          {/* A ruled inner border, so the card reads as card stock, not a fill. */}
          <View pointerEvents="none" style={{ position: 'absolute', top: 8, left: 8, right: 8, bottom: 8, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(194,154,94,0.4)' }} />
          <Compass size={32} color="#C29A5E" strokeWidth={1.6} />
          <Mountain size={22} color="#C9A46A" strokeWidth={1.6} />
          <Text style={{ marginTop: 3, fontSize: 9, fontWeight: '700', color: '#8E6E3A', textAlign: 'center', paddingHorizontal: 8 }}>{egg}</Text>
          <View style={{ position: 'absolute', right: 6, bottom: 6, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: INV.antique, borderWidth: 2, borderColor: INV.cream }}>
            <Plus size={13} color="#FFFFFF" strokeWidth={3} />
          </View>
          <Text style={hiddenText}>{t({ en: 'Not found yet', th: 'ยังไม่พบ', zh: '尚未发现' })}</Text>
        </Pressable>
      )}
    </Exhibit>
  );
}
