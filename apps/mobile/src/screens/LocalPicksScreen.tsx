/**
 * Local Picks - the businesses in this area, by category.
 *
 * NOTHING HERE IS NEW EXCEPT THE SCREEN. `/shops` has taken a `category`
 * filter since the directory shipped, `SHOP_CATEGORIES` has listed all eight,
 * and Home has carried the same chips. They sit two taps down on Home, behind
 * a `Services` switch, in a row that scrolls sideways inside a screen
 * somebody is already scrolling - which is the shape of every feature this
 * app has had to re-find, and the reason docs/61 wrote down that a feature
 * nobody can find is a feature nobody has.
 *
 * ONE FETCH, FILTERED IN MEMORY. The server would filter by category, and on
 * a directory of thousands it should. With eight businesses on Ko Sichang a
 * round trip per chip tap is a spinner between a traveller and an answer they
 * already have on the device. Home filters the same way; when a directory
 * arrives that makes this wrong, both change together.
 *
 * AN EMPTY CATEGORY SAYS SO. This island has eight businesses and eight
 * categories, so most categories are empty and will stay empty for months. A
 * chip that leads to a blank screen cannot be told apart from a chip that is
 * broken, and a traveller who taps one learns the app is unreliable rather
 * than that the island is small. The empty line is the feature.
 *
 * A FAILED REQUEST IS NOT AN EMPTY ISLAND. The two are one word apart on
 * screen and nothing alike, so the error state never borrows the empty line.
 */
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ChevronRight, Star } from 'lucide-react-native';
import { api } from '../api/client.ts';
import { SHOP_CATEGORIES, type Shop } from '../api/shops.ts';
import { useArea } from '../state/area.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { PushHeader } from '../components/Shell.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { DEFAULT_APPEARANCE, serviceAppearance, shopCategoryLabel } from '../components/ShopCategory.tsx';
import { t } from '../i18n/locale.ts';

const ALL = '';

export function LocalPicksScreen({
  onBack, onOpenShop,
}: {
  onBack: () => void;
  /** A card opens the shop's own page, where its reviews and hours live. */
  onOpenShop: (id: string) => void;
}) {
  const area = useArea();
  const shops = useAsync(() => api.shops({ area: area.key }), [area.key]);
  const [category, setCategory] = React.useState<string>(ALL);

  const all = shops.data ?? [];
  const shown = category === ALL ? all : all.filter((shop) => shop.category === category);

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <PushHeader
        context={t({ en: 'LOCAL PICKS', th: 'ร้านเด็ดในพื้นที่', zh: '本地精选' })}
        onBack={onBack}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: gutter, paddingTop: 8 }}>
          <Heading size={20} tracking={-0.4}>
            {t({ en: 'Local Picks', th: 'ร้านเด็ดในพื้นที่', zh: '本地精选' })}
          </Heading>
          <Body size={13} colour={color.neutral700} style={{ marginTop: 4 }}>
            {t({
              en: 'Businesses listed in this area, by what they do. Hours and prices are the business’s own — check with them before you go.',
              th: 'ร้านและบริการที่ลงไว้ในพื้นที่นี้ แยกตามประเภท เวลาเปิดและราคาเป็นของร้าน ควรตรวจสอบกับร้านก่อนเดินทาง',
              zh: '这一带登记的商家，按类别排列。营业时间与价格由商家自定，出发前请先与商家确认。',
            })}
          </Body>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: gutter, gap: 8, paddingTop: 14, paddingBottom: 4 }}
        >
          <Chip
            label={t({ en: 'All', th: 'ทั้งหมด', zh: '全部' })}
            selected={category === ALL}
            onPress={() => setCategory(ALL)}
          />
          {SHOP_CATEGORIES.map((key) => (
            <Chip
              key={key}
              label={shopCategoryLabel(key)}
              selected={category === key}
              onPress={() => setCategory(key)}
            />
          ))}
        </ScrollView>

        {shops.loading ? <LoadingState /> : null}

        {shops.error ? (
          <ErrorState
            message={t({
              en: 'Could not load this area’s businesses.',
              th: 'โหลดร้านในพื้นที่นี้ไม่สำเร็จ',
              zh: '无法加载这一带的商家。',
            })}
            onRetry={shops.reload}
          />
        ) : null}

        {!shops.loading && !shops.error && shown.length === 0 ? (
          <View style={{ paddingHorizontal: gutter, paddingTop: 28 }}>
            <Body size={14} colour={color.neutral700}>
              {t({
                en: 'Nothing listed here yet.',
                th: 'ยังไม่มีร้านในหมวดนี้',
                zh: '这里还没有登记的商家。',
              })}
            </Body>
            <Body size={13} colour={color.neutral700} style={{ marginTop: 6 }}>
              {t({
                en: 'This area is small and most categories are still empty. It is not a fault.',
                th: 'พื้นที่นี้ยังเล็ก หลายหมวดจึงยังว่างอยู่ ไม่ใช่ความผิดพลาด',
                zh: '这一带还小，多数类别仍是空的，并非出错。',
              })}
            </Body>
          </View>
        ) : null}

        <View style={{ paddingHorizontal: gutter, paddingTop: 14, gap: 10 }}>
          {shown.map((shop) => (
            <ShopRow key={shop.id} shop={shop} onPress={() => onOpenShop(shop.id)} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 16,
        backgroundColor: selected ? color.brand : '#E1F2F7',
      }}
    >
      <Text style={{ color: selected ? '#FFFFFF' : '#123B64', fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

function ShopRow({ shop, onPress }: { shop: Shop; onPress: () => void }) {
  const look = serviceAppearance[shop.category] ?? DEFAULT_APPEARANCE;
  const Icon = look.icon;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={shop.name}
      style={[
        shadow.card,
        {
          backgroundColor: color.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: color.neutral300,
          padding: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        },
      ]}
    >
      <View
        style={{
          width: 44, height: 44, borderRadius: 22, backgroundColor: look.pale,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Icon size={20} color={look.accent} strokeWidth={1.9} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Body size={14} style={{ fontWeight: '700' }}>{shop.name}</Body>
        <Label size={11} colour={color.neutral700} style={{ marginTop: 2 }}>
          {shopCategoryLabel(shop.category)}
        </Label>
        {/*
          A rating only when somebody left one. `reviewCount` of 0 with a
          rating of null is the ordinary case on a new directory, and a row
          of empty stars reads as a bad business rather than a new one.
        */}
        {shop.rating !== null && shop.reviewCount > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <Star size={12} color={color.goldDeep} fill={color.goldDeep} strokeWidth={0} />
            <Label size={11} colour={color.neutral700}>
              {shop.rating.toFixed(1)} · {shop.reviewCount}
            </Label>
          </View>
        ) : null}
      </View>
      <ChevronRight size={18} color={color.neutral700} strokeWidth={2} />
    </Pressable>
  );
}
