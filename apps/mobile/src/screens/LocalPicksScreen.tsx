/**
 * Local Picks is intentionally category-first.
 *
 * The first release is an empty structure: it establishes the four traveller
 * needs before any business is promoted inside them. Keeping this screen free
 * of the existing shop feed also prevents old directory data from looking
 * like an editorial recommendation.
 */
import React from 'react';
import { Image, Linking, Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { ArrowUpRight, BedDouble, Flag, LayoutGrid, List, Map, Search, ShoppingBag, Utensils, type LucideIcon } from 'lucide-react-native';
import { color, gutter, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { PushHeader, TravelHeroBackdrop } from '../components/Shell.tsx';
import { SolutionConnect } from '../components/SolutionConnect.tsx';
import type { NavDestination } from '../navigation/session.ts';
import { photoUri } from '../api/photos.ts';
import { t } from '../i18n/locale.ts';
import sinraniBadminton from '../../assets/sinrani-badminton-local-pick.png';

type LocalPickCategory = 'all' | 'food' | 'stay' | 'activity' | 'community';

const SINRANI_BOOKING_URL = 'https://badminton-booking-ihw1.onrender.com/';

/**
 * A stay on Koh Sichang, carried by its coordinate.
 *
 * WHAT IS KNOWN ABOUT IT, AND NOTHING ELSE. The owner gave a name and a
 * point, on 15 November. There is no photograph anybody has the right to
 * publish, no confirmed telephone number, no room list and no price - so the
 * card shows none of those rather than filling the shape of a listing with
 * guesses. `docs/61` is the rule it follows: a listing is the BUSINESS'S own
 * claim, and this app invents none on their behalf.
 *
 * It is also not in OpenStreetMap - checked through Overpass on the day, 250 m
 * around the point, which is why it is not a map place: `sichang.test.ts`
 * requires every island place to be a mapped feature with a team photograph,
 * and the test next to it refuses to put a named business on the map at all.
 *
 * So what the card offers is the one thing that is true and useful: where it
 * is. Tapping it opens the island's own navigator, the same one the map and
 * the shop screen use.
 */
const KONIIX = {
  id: 'koniix-garden-cottage',
  /*
    The same in all three, because it is a brand name and a brand name is not
    translated. The navigator takes a localised name like any destination, so
    it is written out rather than cast.
  */
  name: { en: 'Koniix Garden Cottage', th: 'Koniix Garden Cottage', zh: 'Koniix Garden Cottage' },
  // As given, rounded to six decimals - about 0.1 m, and the precision every
  // other coordinate in this repository carries.
  lat: 13.156753,
  lng: 100.808781,
  /* The same file the place page shows - see the note on the card. */
  photo: '/media/places/sc-koniix-garden-cottage.jpg',
} as const;

export function LocalPicksScreen({
  onBack,
  onNavigate,
  onOpenMap,
}: {
  onBack: () => void;
  /** Retained on the public screen props while Local Picks has no entries yet. */
  onOpenShop: (id: string) => void;
  /** The app's one navigator — in-app on Koh Sichang, Google elsewhere. */
  onNavigate?: (destination: NavDestination) => void;
  /** Opens the existing MapLibre surface; this screen never creates a second map. */
  onOpenMap?: () => void;
}) {
  const { width } = useWindowDimensions();
  const [category, setCategory] = React.useState<LocalPickCategory>('all');
  const [query, setQuery] = React.useState('');
  const compact = width < 700;

  const categories: Array<{
    key: LocalPickCategory;
    icon: LucideIcon;
    label: string;
    accent: string;
    pale: string;
  }> = [
    {
      key: 'all', icon: LayoutGrid,
      label: t({ en: 'All', th: 'ทั้งหมด', zh: '全部' }),
      accent: color.brand, pale: color.brandSoft,
    },
    {
      key: 'food', icon: Utensils,
      label: t({ en: 'Food', th: 'อาหาร', zh: '美食' }),
      accent: '#D9682A', pale: '#FFF0E6',
    },
    {
      key: 'stay', icon: BedDouble,
      label: t({ en: 'Accommodation', th: 'ที่พัก', zh: '住宿' }),
      accent: '#177DA5', pale: '#E5F6FC',
    },
    {
      key: 'activity', icon: Flag,
      label: t({ en: 'Activities', th: 'กิจกรรม', zh: '活动' }),
      accent: '#16796E', pale: '#E4F7F3',
    },
    {
      key: 'community', icon: ShoppingBag,
      label: t({ en: 'Community goods', th: 'สินค้าชุมชน', zh: '社区商品' }),
      accent: '#7755B7', pale: '#F0EAFB',
    },
  ];

  const selected = categories.find((item) => item.key === category) ?? categories[0];
  const SelectedIcon = selected.icon;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const sportsName = t({ en: 'Sinrani Badminton', th: 'สินธานี แบดมินตัน', zh: '辛拉尼羽毛球馆' });
  const stayName = t(KONIIX.name);
  const showSport = (category === 'all' || category === 'activity') && (!normalizedQuery || sportsName.toLocaleLowerCase().includes(normalizedQuery));
  const showStay = (category === 'all' || category === 'stay') && (!normalizedQuery || stayName.toLocaleLowerCase().includes(normalizedQuery));
  const hasResults = showSport || showStay;

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <PushHeader context={t({ en: 'KOH SICHANG / LOCAL PICKS', th: 'เกาะสีชัง / ร้านเด็ดในพื้นที่', zh: '锡昌岛 / 本地精选' })} onBack={onBack} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={{ width: '100%', maxWidth: 1220, alignSelf: 'center', paddingHorizontal: compact ? 14 : gutter, paddingTop: compact ? 14 : 20 }}>
          {compact ? (
            <View style={{ minHeight: 126, padding: 22, borderRadius: 24, overflow: 'hidden', justifyContent: 'flex-end' }}>
              <TravelHeroBackdrop focalPoint="right" />
              <Heading size={30} colour="#FFFFFF" tracking={-0.5}>{t({ en: 'Local Picks', th: 'ร้านเด็ดในพื้นที่', zh: '本地精选' })}</Heading>
              <Body size={14} colour="#E9FBFF">{t({ en: 'Find shops and experiences from the community', th: 'ค้นหาร้านและประสบการณ์จากชุมชน', zh: '寻找社区商店与体验' })}</Body>
            </View>
          ) : (
            <View>
              <Heading size={34} tracking={-0.7}>{t({ en: 'Local Picks', th: 'ร้านเด็ดในพื้นที่', zh: '本地精选' })}</Heading>
              <Body size={14} colour={color.neutral700} style={{ marginTop: 2 }}>{t({ en: 'Find shops, food and experiences from the community', th: 'ค้นหาร้าน อาหาร และประสบการณ์จากชุมชน', zh: '寻找社区商店、美食与体验' })}</Body>
            </View>
          )}

          <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={[shadow.card, { flex: 1, minHeight: 54, borderRadius: 27, borderWidth: 1, borderColor: '#BFDCE8', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10 }]}>
              <Search size={23} color="#71889B" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t({ en: 'Search shops or activities…', th: 'ค้นหาร้านหรือกิจกรรม…', zh: '搜索商店或活动…' })}
                placeholderTextColor="#71889B"
                accessibilityLabel={t({ en: 'Search local picks', th: 'ค้นหาร้านเด็ดในพื้นที่', zh: '搜索本地精选' })}
                style={{ flex: 1, minWidth: 0, color: color.text, fontSize: 16, paddingVertical: 0 }}
              />
            </View>
            {!compact ? (
              <View style={[shadow.card, { flexDirection: 'row', padding: 3, borderRadius: 27, backgroundColor: '#FFFFFF' }]}>
                <View style={{ minHeight: 46, paddingHorizontal: 20, borderRadius: 23, backgroundColor: color.brand, flexDirection: 'row', alignItems: 'center', gap: 8 }}><List size={20} color="#FFFFFF" /><Label size={11} colour="#FFFFFF">{t({ en: 'LIST', th: 'รายการ', zh: '列表' })}</Label></View>
                <Pressable onPress={onOpenMap} disabled={!onOpenMap} accessibilityRole="button" accessibilityLabel={t({ en: 'Map', th: 'แผนที่', zh: '地图' })} style={({ pressed }) => ({ minHeight: 46, paddingHorizontal: 20, borderRadius: 23, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.65 : 1 })}><Map size={20} color={color.text} /><Label size={11} colour={color.text}>{t({ en: 'MAP', th: 'แผนที่', zh: '地图' })}</Label></Pressable>
              </View>
            ) : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 14, gap: 10 }}>
            {categories.map((item) => {
              const Icon = item.icon;
              const active = item.key === category;
              return (
                <Pressable key={item.key} onPress={() => setCategory(item.key)} accessibilityRole="button" accessibilityLabel={t({ en: `Category: ${item.label}`, th: `หมวด: ${item.label}`, zh: `类别：${item.label}` })} accessibilityState={{ selected: active }} style={({ pressed }) => ({ minHeight: 46, paddingHorizontal: 20, borderRadius: 23, borderWidth: active ? 0 : 1, borderColor: '#D3E7EF', backgroundColor: active ? color.brand : '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.76 : 1, ...shadow.sm })}>
                  {item.key === 'all' ? null : <Icon size={20} color={active ? '#FFFFFF' : '#00A4B8'} strokeWidth={2} />}
                  <Heading size={14} colour={active ? '#FFFFFF' : color.text}>{item.label}</Heading>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Heading size={24}>{t({ en: 'Explore nearby', th: 'สำรวจในพื้นที่', zh: '探索附近' })}</Heading>
            {compact ? <Pressable onPress={onOpenMap} disabled={!onOpenMap} accessibilityRole="button" accessibilityLabel={t({ en: 'Map', th: 'แผนที่', zh: '地图' })} style={({ pressed }) => [shadow.card, { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.65 : 1 }]}><Map size={20} color="#00A4B8" /><Heading size={14}>{t({ en: 'Map', th: 'แผนที่', zh: '地图' })}</Heading></Pressable> : null}
          </View>

          {hasResults ? (
            <View style={{ marginTop: 14, flexDirection: compact ? 'column' : 'row', flexWrap: compact ? 'nowrap' : 'wrap', gap: 18 }}>
              {showSport ? <SportsPickCard compact={compact} /> : null}
              {showStay ? <StayPickCard compact={compact} onNavigate={onNavigate} /> : null}
            </View>
          ) : (
            <View style={[shadow.card, { marginTop: 14, minHeight: 180, padding: 24, borderRadius: radius.md, borderWidth: 1, borderColor: color.neutral300, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center' }]}>
              <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: selected.pale, alignItems: 'center', justifyContent: 'center' }}><SelectedIcon size={29} color={selected.accent} strokeWidth={1.9} /></View>
              <Heading size={18} style={{ marginTop: 12, textAlign: 'center' }}>{query.trim() ? t({ en: 'No matching local picks', th: 'ไม่พบร้านหรือกิจกรรมที่ค้นหา', zh: '没有匹配的本地精选' }) : selected.label}</Heading>
              <Body size={14} colour={color.neutral700} style={{ marginTop: 5, textAlign: 'center' }}>{t({ en: 'No verified recommendations are available here yet.', th: 'ยังไม่มีข้อมูลแนะนำที่ยืนยันแล้วในหมวดนี้', zh: '此类别暂无已验证推荐。' })}</Body>
            </View>
          )}

          <View style={{ marginTop: 28, flexDirection: 'row', alignItems: 'center', gap: 14 }}><Heading size={22}>{t({ en: 'Technology for the community', th: 'เทคโนโลยีเพื่อชุมชน', zh: '社区科技' })}</Heading><View style={{ flex: 1, height: 1, backgroundColor: '#BFDCE8' }} /></View>
          <View style={{ marginTop: 12 }}><SolutionConnect compact={compact} /></View>
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * The stay, with the one claim it can make: where it is.
 *
 * NO PHOTOGRAPH FRAME, deliberately. `SportsPickCard` leads with a picture
 * because there is a licensed picture to lead with. An empty 16:9 grey box
 * here would read as a photograph that failed to load - a broken listing
 * rather than a short one - so this card is built to the size of what is
 * known instead of to the shape of a card that knows more.
 */
function StayPickCard({
  compact,
  onNavigate,
}: {
  compact: boolean;
  onNavigate?: (destination: NavDestination) => void;
}) {
  const stay = categoriesAccent.stay;
  return (
    <Pressable
      onPress={() => onNavigate?.(KONIIX)}
      disabled={onNavigate === undefined}
      accessibilityRole="button"
      accessibilityLabel={t(KONIIX.name)}
      accessibilityHint={t({
        en: 'Open directions to this stay',
        th: 'เปิดเส้นทางไปที่พักนี้',
        zh: '打开前往该住宿的路线',
      })}
      style={({ pressed }) => [
        shadow.card,
        {
          width: compact ? '100%' : '48.5%',
          minWidth: compact ? 0 : 320,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: '#CFE6F0',
          backgroundColor: color.surface,
          overflow: 'hidden',
          opacity: pressed ? 0.88 : 1,
        },
      ]}
    >
      {/*
        THE SAME FILE THE PLACE PAGE SHOWS, by the same path - `photoUri`
        resolves it relative on the web and against the API host on a phone.
        Not a copy in `assets/`: one picture of one property, in one place,
        so a replacement reaches the card and the map pin together.

        The card led with an icon until the property sent this, and the
        reason was written here: an empty 16:9 frame reads as a photograph
        that failed to load. Now there is one, so it leads with it - the same
        shape as the badminton card above it.
      */}
      <View style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: stay.pale }}>
        <Image
          source={{ uri: photoUri(KONIIX.photo) }}
          resizeMode="cover"
          accessibilityLabel={t({
            en: 'The roof terrace at Koniix Garden Cottage, looking over the strait',
            th: 'ดาดฟ้าของ Koniix Garden Cottage มองออกไปเห็นทะเล',
            zh: 'Koniix Garden Cottage 的屋顶平台，可望见海峡',
          })}
          style={{ width: '100%', height: '100%' }}
        />
      </View>
      <View style={{
        minHeight: 88, paddingVertical: 12, paddingHorizontal: 16,
        flexDirection: 'row', alignItems: 'center', gap: 10,
      }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Heading size={19} colour={color.text}>{t(KONIIX.name)}</Heading>
        <View style={{ marginTop: 7, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <BedDouble size={20} color="#00A4B8" />
          <Body size={13} colour={color.neutral700}>{t({ en: 'Accommodation', th: 'ที่พัก', zh: '住宿' })}</Body>
        </View>
      </View>
      <View style={{
        minHeight: 42, paddingHorizontal: 16, borderRadius: 21, backgroundColor: '#05A7B4',
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}>
        <Heading size={13} colour="#FFFFFF">{t({ en: 'Details', th: 'ดูรายละเอียด', zh: '查看详情' })}</Heading>
        <ArrowUpRight size={16} color="#FFFFFF" strokeWidth={2.4} />
      </View>
      </View>
    </Pressable>
  );
}

/** The accent pair each category carries, so a card can match its own chip. */
const categoriesAccent = {
  stay: { accent: '#177DA5', pale: '#E5F6FC' },
} as const;

function SportsPickCard({ compact }: { compact: boolean }) {
  const name = t({ en: 'Sinrani Badminton', th: 'สินธานี แบดมินตัน', zh: '辛拉尼羽毛球馆' });
  return (
    <Pressable
      onPress={() => { void Linking.openURL(SINRANI_BOOKING_URL); }}
      accessibilityRole="link"
      accessibilityLabel={name}
      accessibilityHint={t({ en: 'Open court booking', th: 'เปิดระบบจองสนาม', zh: '打开球场预订' })}
      style={({ pressed }) => [
        shadow.card,
        {
          width: compact ? '100%' : '48.5%',
          minWidth: compact ? 0 : 320,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: '#D7E8EF',
          backgroundColor: '#FFFFFF',
          overflow: 'hidden',
          opacity: pressed ? 0.88 : 1,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
      ]}
    >
      <View style={{ width: '100%', aspectRatio: 16 / 9, overflow: 'hidden', backgroundColor: '#064E3B' }}>
        <Image
          source={sinraniBadminton}
          resizeMode="stretch"
          accessibilityLabel={t({ en: 'Sinrani Badminton indoor court', th: 'สนามแบดมินตันในร่ม สินธานี แบดมินตัน', zh: '辛拉尼室内羽毛球馆' })}
          style={{ position: 'absolute', width: '100%', height: '178%', top: '-66%', left: 0 }}
        />
      </View>
      <View
        style={{
          minHeight: 88, paddingVertical: 12, paddingHorizontal: 16,
          backgroundColor: '#FFFFFF',
          flexDirection: 'row', alignItems: 'center', gap: 10,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Heading size={19} colour={color.text}>{name}</Heading>
          <View style={{ marginTop: 7, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Flag size={20} color="#00A4B8" />
            <Body size={13} colour={color.neutral700}>{t({ en: 'Sports & activities', th: 'กีฬาและกิจกรรม', zh: '运动与活动' })}</Body>
          </View>
        </View>
        <View style={{ minHeight: 42, paddingHorizontal: 16, borderRadius: 21, backgroundColor: '#05A7B4', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Heading size={13} colour="#FFFFFF">{t({ en: 'Details', th: 'ดูรายละเอียด', zh: '查看详情' })}</Heading>
          <ArrowUpRight size={16} color="#FFFFFF" strokeWidth={2.5} />
        </View>
      </View>
    </Pressable>
  );
}
