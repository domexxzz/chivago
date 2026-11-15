/**
 * Local Picks is intentionally category-first.
 *
 * The first release is an empty structure: it establishes the four traveller
 * needs before any business is promoted inside them. Keeping this screen free
 * of the existing shop feed also prevents old directory data from looking
 * like an editorial recommendation.
 */
import React from 'react';
import { Image, Linking, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { ArrowUpRight, BedDouble, BusFront, Check, ChevronDown, Dumbbell, LayoutGrid, Navigation, Utensils, type LucideIcon } from 'lucide-react-native';
import { color, gutter, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { PushHeader } from '../components/Shell.tsx';
import { SolutionConnect } from '../components/SolutionConnect.tsx';
import type { NavDestination } from '../navigation/session.ts';
import { t } from '../i18n/locale.ts';
import sinraniBadminton from '../../assets/sinrani-badminton-local-pick.png';

type LocalPickCategory = 'all' | 'food' | 'stay' | 'transport' | 'sport';

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
} as const;

export function LocalPicksScreen({
  onBack,
  onNavigate,
}: {
  onBack: () => void;
  /** Retained on the public screen props while Local Picks has no entries yet. */
  onOpenShop: (id: string) => void;
  /** The app's one navigator — in-app on Koh Sichang, Google elsewhere. */
  onNavigate?: (destination: NavDestination) => void;
}) {
  const { width } = useWindowDimensions();
  const [category, setCategory] = React.useState<LocalPickCategory>('all');
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const compact = width < 520;
  /*
    Beside the picker, or under the whole screen.

    The content column is 1040 wide and the category picker is capped at 520,
    so on a desktop browser the right half of this screen was empty - which is
    where Solution Connect goes. Below 900 there is no second column to fill,
    and the partner then goes AFTER the local picks rather than above them:
    the traveller opened this screen for the island's own businesses, and a
    paid placement ahead of them would be the layout making the same claim the
    copy is careful not to make.
  */
  const twoColumn = width >= 900;

  const categories: Array<{
    key: LocalPickCategory;
    icon: LucideIcon;
    label: string;
    description: string;
    accent: string;
    pale: string;
  }> = [
    {
      key: 'all', icon: LayoutGrid,
      label: t({ en: 'All', th: 'ทั้งหมด', zh: '全部' }),
      description: t({ en: 'Every local pick', th: 'ดูคำแนะนำทุกหมวด', zh: '查看全部本地精选' }),
      accent: color.brand, pale: color.brandSoft,
    },
    {
      key: 'food', icon: Utensils,
      label: t({ en: 'Food', th: 'อาหาร', zh: '美食' }),
      description: t({ en: 'Restaurants and local flavours', th: 'ร้านอาหารและรสชาติท้องถิ่น', zh: '餐厅与当地风味' }),
      accent: '#D9682A', pale: '#FFF0E6',
    },
    {
      key: 'stay', icon: BedDouble,
      label: t({ en: 'Accommodation', th: 'ที่พัก', zh: '住宿' }),
      description: t({ en: 'Hotels, resorts and homestays', th: 'โรงแรม รีสอร์ต และโฮมสเตย์', zh: '酒店、度假村与民宿' }),
      accent: '#177DA5', pale: '#E5F6FC',
    },
    {
      key: 'transport', icon: BusFront,
      label: t({ en: 'Transportation', th: 'การเดินทาง', zh: '交通出行' }),
      description: t({ en: 'Getting around the local area', th: 'บริการเดินทางภายในพื้นที่', zh: '当地出行服务' }),
      accent: '#16796E', pale: '#E4F7F3',
    },
    {
      key: 'sport', icon: Dumbbell,
      label: t({ en: 'Sports', th: 'กีฬา', zh: '运动' }),
      description: t({ en: 'Activities and active experiences', th: 'กิจกรรมกีฬาและประสบการณ์แอ็กทีฟ', zh: '运动与活力体验' }),
      accent: '#7755B7', pale: '#F0EAFB',
    },
  ];

  const selected = categories.find((item) => item.key === category) ?? categories[0];
  const SelectedIcon = selected.icon;

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <PushHeader context={t({ en: 'LOCAL PICKS', th: 'ร้านเด็ดในพื้นที่', zh: '本地精选' })} onBack={onBack} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={{ width: '100%', maxWidth: 1040, alignSelf: 'center', paddingHorizontal: gutter, paddingTop: 16 }}>
          <Heading size={24} tracking={-0.4}>
            {t({ en: 'Explore local picks', th: 'เลือกดูสิ่งน่าสนใจในพื้นที่', zh: '探索本地精选' })}
          </Heading>
          <Body size={13} colour={color.neutral700} style={{ marginTop: 6 }}>
            {t({
              en: 'Choose a category. Local recommendations will be added here soon.',
              th: 'เลือกหมวดที่สนใจ เร็ว ๆ นี้จะมีคำแนะนำจากคนในพื้นที่เพิ่มเข้ามา',
              zh: '选择感兴趣的类别，本地推荐即将上线。',
            })}
          </Body>

          <View style={{
            marginTop: 20, flexDirection: twoColumn ? 'row' : 'column',
            alignItems: 'flex-start', gap: twoColumn ? 28 : 0, zIndex: 5,
          }}>
            <View style={{ flex: 1, minWidth: 0, width: '100%', maxWidth: twoColumn ? 600 : 520, zIndex: 5 }}>
              <Label size={10} tracking={0.1} colour={color.neutral700} style={{ marginBottom: 7 }}>
                {t({ en: 'CATEGORY', th: 'เลือกหมวด', zh: '选择类别' })}
              </Label>
              <Pressable
                onPress={() => setDropdownOpen((open) => !open)}
                accessibilityRole="button"
                accessibilityLabel={t({ en: `Category: ${selected.label}`, th: `หมวด: ${selected.label}`, zh: `类别：${selected.label}` })}
                accessibilityState={{ expanded: dropdownOpen }}
                style={({ pressed }) => [shadow.card, {
                  minHeight: 64, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1.5,
                  borderColor: dropdownOpen ? selected.accent : '#BFD9E5', backgroundColor: color.surface,
                  flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.86 : 1,
                }]}
              >
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: selected.pale, alignItems: 'center', justifyContent: 'center' }}>
                  <SelectedIcon size={21} color={selected.accent} strokeWidth={2.1} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Heading size={16} colour={color.text}>{selected.label}</Heading>
                  <Body size={13} colour={color.neutral700} style={{ marginTop: 2 }}>{selected.description}</Body>
                </View>
                <ChevronDown size={21} color={color.neutral700} style={{ transform: [{ rotate: dropdownOpen ? '180deg' : '0deg' }] }} />
              </Pressable>

              {dropdownOpen ? (
                <View style={[shadow.card, {
                  marginTop: 8, padding: 7, borderRadius: 18, borderWidth: 1,
                  borderColor: '#C9DEE8', backgroundColor: color.surface, gap: 3,
                }]}>
                  {categories.map((item) => {
                    const Icon = item.icon;
                    const active = item.key === category;
                    return (
                      <Pressable
                        key={item.key}
                        onPress={() => { setCategory(item.key); setDropdownOpen(false); }}
                        accessibilityRole="menuitem"
                        accessibilityLabel={item.label}
                        accessibilityState={{ selected: active }}
                        style={({ pressed }) => ({
                          minHeight: 50, paddingHorizontal: 11, borderRadius: 13,
                          backgroundColor: active ? item.pale : pressed ? color.neutral100 : 'transparent',
                          flexDirection: 'row', alignItems: 'center', gap: 11,
                        })}
                      >
                        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: item.pale, alignItems: 'center', justifyContent: 'center' }}>
                          <Icon size={18} color={item.accent} strokeWidth={2} />
                        </View>
                        <Label size={11} colour={active ? item.accent : color.text} style={{ flex: 1 }}>{item.label}</Label>
                        {active ? <Check size={18} color={item.accent} strokeWidth={2.4} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {category === 'all' || category === 'sport' || category === 'stay' ? (
                <View style={{ marginTop: 20 }}>
                  <Label size={10} tracking={0.12} colour={selected.accent} style={{ marginBottom: 10 }}>
                    {category === 'all'
                      ? t({ en: 'ALL LOCAL PICKS', th: 'รายการทั้งหมด', zh: '全部本地精选' })
                      : category === 'stay'
                        ? t({ en: 'ACCOMMODATION', th: 'ที่พัก', zh: '住宿' })
                        : t({ en: 'SPORTS', th: 'กีฬา', zh: '运动' })}
                  </Label>
                  {category !== 'stay' ? <SportsPickCard compact={compact} /> : null}
                  {category !== 'sport' ? (
                    <View style={{ marginTop: category === 'all' ? 12 : 0 }}>
                      <StayPickCard compact={compact} onNavigate={onNavigate} />
                    </View>
                  ) : null}
                </View>
              ) : (
                <View style={[
                  shadow.card,
                  {
                    marginTop: 18, minHeight: 190, padding: 24, borderRadius: radius.md, borderWidth: 1,
                    borderColor: color.neutral300, backgroundColor: color.surface,
                    alignItems: 'center', justifyContent: 'center',
                  },
                ]}>
                  <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: selected.pale, alignItems: 'center', justifyContent: 'center' }}>
                    <SelectedIcon size={29} color={selected.accent} strokeWidth={1.9} />
                  </View>
                  <Heading size={18} style={{ marginTop: 14, textAlign: 'center' }}>{selected.label}</Heading>
                  <Body size={14} colour={color.neutral700} style={{ marginTop: 6, textAlign: 'center' }}>
                    {t({ en: 'No recommendations yet', th: 'ยังไม่มีข้อมูลแนะนำในหมวดนี้', zh: '此类别暂无推荐' })}
                  </Body>
                  <Label size={10} colour={color.neutral700} style={{ marginTop: 5, textAlign: 'center' }}>
                    {t({ en: 'COMING SOON', th: 'เร็ว ๆ นี้', zh: '即将上线' })}
                  </Label>
                </View>
              )}
            </View>

            {twoColumn ? (
              <View style={{ width: 380, flexShrink: 0 }}>
                <SolutionConnect />
              </View>
            ) : null}
          </View>


          {/* One screen, one Solution Connect: beside the picker when there is
              room, underneath the picks when there is not. */}
          {twoColumn ? null : (
            <View style={{ marginTop: 20 }}>
              <SolutionConnect compact={compact} />
            </View>
          )}
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
          width: compact ? '100%' : 300,
          minWidth: 220,
          maxWidth: 340,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: '#CFE6F0',
          backgroundColor: color.surface,
          padding: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          opacity: pressed ? 0.88 : 1,
        },
      ]}
    >
      <View style={{
        width: 46, height: 46, borderRadius: 14, backgroundColor: stay.pale,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <BedDouble size={22} color={stay.accent} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Heading size={16} colour={color.text}>{t(KONIIX.name)}</Heading>
        <Label size={9} tracking={0.08} colour={color.neutral600} style={{ marginTop: 5 }}>
          {t({ en: 'STAY · KOH SICHANG', th: 'ที่พัก · เกาะสีชัง', zh: '住宿 · 锡昌岛' })}
        </Label>
      </View>
      <View style={{
        width: 36, height: 36, borderRadius: 18, backgroundColor: stay.accent,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Navigation size={17} color="#FFFFFF" strokeWidth={2.4} />
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
          width: compact ? '72%' : 260,
          minWidth: 220,
          maxWidth: 280,
          borderRadius: 18,
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
          minHeight: 76, paddingVertical: 11, paddingHorizontal: 12,
          backgroundColor: '#FFFFFF',
          flexDirection: 'row', alignItems: 'center', gap: 10,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Heading size={16} colour={color.text}>{name}</Heading>
          <Label size={9} tracking={0.08} colour={color.neutral600} style={{ marginTop: 5 }}>
            {t({ en: 'BADMINTON COURT', th: 'สนามแบดมินตัน', zh: '羽毛球馆' })}
          </Label>
        </View>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F6C453', alignItems: 'center', justifyContent: 'center' }}>
          <ArrowUpRight size={18} color="#064E3B" strokeWidth={2.5} />
        </View>
      </View>
    </Pressable>
  );
}
