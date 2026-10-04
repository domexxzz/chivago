/**
 * Points marketplace.
 *
 * Redemptions settle to local merchants - the loop that returns tourist spend
 * to the community, and the reason the eco layer is not just a scoreboard.
 *
 * A redemption issues a real voucher with a code, an expiry and a merchant
 * settlement record, and the app shows it for the merchant to scan.
 * Users can browse deals by category/affordability and access their active
 * and redeemed vouchers anytime under "My Vouchers".
 */

import React from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import {
  BedDouble, Coffee, Compass, Copy, HeartPulse, Leaf, Salad, Ticket, Waves, X,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { tintFor } from '@chivago/tokens';
import {
  canAfford, emptyBalances, shortfall, strings,
  type Balances, type Offer, type Voucher,
} from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, currencyTone, font, gutter, layout, onFill, radius } from '../theme/index.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { Button } from '../components/Button.tsx';
import { PushHeader } from '../components/Shell.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { t } from '../i18n/locale.ts';

/** Currency as it reads mid-sentence, e.g. "180 more Trip Points". */
const currencyName = (c: Offer['currency']): string =>
  c === 'green' ? t(strings.common.greenPoints) : t(strings.common.tripPoints);


/**
 * Both balances in the header.
 *
 * The old header showed one figure. With two currencies a single number would
 * silently be the wrong one half the time - a traveller with 1,240 Green and
 * 40 Trip would read "1,240" and wonder why a 180-point coffee is refused.
 */
export function PurseChips({ balances }: { balances: Balances }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
      <Heading size={14} colour={color.accent700}>
        {`${balances.green.toLocaleString('en-US')} G`}
      </Heading>
      <Heading size={14} colour={color.neutral700}>
        {`${balances.trip.toLocaleString('en-US')} T`}
      </Heading>
    </View>
  );
}

export function MarketScreen({
  onBack, onToast, onPointsChanged, refreshKey,
}: {
  onBack: () => void;
  onToast: (msg: string) => void;
  onPointsChanged: () => void;
  refreshKey: number;
}) {
  const [activeTab, setActiveTab] = React.useState<'offers' | 'vouchers'>('offers');
  const [selectedFilter, setSelectedFilter] = React.useState<string>('all');
  const [vouchersKey, setVouchersKey] = React.useState(0);

  const offers = useAsync(() => api.offers(), []);
  const wallet = useAsync(() => api.wallet(), [refreshKey]);
  const [voucher, setVoucher] = React.useState<Voucher | null>(null);
  const [busy, setBusy] = React.useState(false);

  const balances: Balances = wallet.data?.balances ?? emptyBalances();

  const redeem = async (offer: Offer) => {
    if (!canAfford(balances, offer.currency, offer.costPoints)) {
      // Kept tappable rather than disabled: a disabled control tells the user
      // nothing about how far off they are. With two currencies the toast must
      // also name WHICH one is short - the other may be full.
      const need = shortfall(balances, offer.currency, offer.costPoints);
      onToast(`${t(strings.market.notEnough)} — ${need} more ${currencyName(offer.currency)}.`);
      return;
    }
    setBusy(true);
    const res = await api.redeem(offer.id);
    setBusy(false);
    if (res.ok) {
      setVoucher(res.data.voucher);
      wallet.reload();
      setVouchersKey((k) => k + 1);
      onPointsChanged();
      onToast(t(strings.market.voucherSent(offer.merchantShort)));
    } else onToast(res.error);
  };

  const allOffers = offers.data ?? [];
  const categories = React.useMemo(() => {
    const set = new Set<string>();
    for (const o of allOffers) {
      if (o.category) set.add(o.category);
    }
    return Array.from(set);
  }, [allOffers]);

  const filteredOffers = React.useMemo(() => {
    if (selectedFilter === 'all') return allOffers;
    if (selectedFilter === 'affordable') {
      return allOffers.filter((o) => canAfford(balances, o.currency, o.costPoints));
    }
    if (selectedFilter === 'green') {
      return allOffers.filter((o) => o.currency === 'green');
    }
    if (selectedFilter === 'trip') {
      return allOffers.filter((o) => o.currency === 'trip');
    }
    return allOffers.filter((o) => o.category === selectedFilter);
  }, [allOffers, selectedFilter, balances]);

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <PushHeader
        context={`${t(strings.market.context)}`}
        onBack={onBack}
        right={<PurseChips balances={balances} />}
      />

      {/* Tabs: Offers vs My Vouchers */}
      <View
        style={{
          flexDirection: 'row',
          borderBottomWidth: 1,
          borderBottomColor: color.neutral300,
          backgroundColor: color.bg,
          paddingHorizontal: gutter,
        }}
      >
        <Pressable
          onPress={() => setActiveTab('offers')}
          accessibilityRole="tab"
          accessibilityLabel={t(strings.market.tabOffers)}
          accessibilityState={{ selected: activeTab === 'offers' }}
          style={{
            flex: 1,
            paddingVertical: 12,
            alignItems: 'center',
            borderBottomWidth: activeTab === 'offers' ? 2 : 0,
            borderBottomColor: color.brand,
          }}
        >
          <Heading
            size={13}
            colour={activeTab === 'offers' ? color.text : color.neutral500}
          >
            {t(strings.market.tabOffers)}
          </Heading>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab('vouchers')}
          accessibilityRole="tab"
          accessibilityLabel={t(strings.market.tabVouchers)}
          accessibilityState={{ selected: activeTab === 'vouchers' }}
          style={{
            flex: 1,
            paddingVertical: 12,
            alignItems: 'center',
            borderBottomWidth: activeTab === 'vouchers' ? 2 : 0,
            borderBottomColor: color.brand,
          }}
        >
          <Heading
            size={13}
            colour={activeTab === 'vouchers' ? color.text : color.neutral500}
          >
            {t(strings.market.tabVouchers)}
          </Heading>
        </Pressable>
      </View>

      {activeTab === 'offers' ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ paddingHorizontal: gutter, paddingTop: 12, paddingBottom: 8 }}>
            <Body size={13} colour={color.neutral700}>{t(strings.market.intro)}</Body>
          </View>

          {/* Filter Pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: gutter,
              paddingVertical: 6,
              gap: 8,
            }}
          >
            <FilterChip
              label={t(strings.market.filterAll)}
              selected={selectedFilter === 'all'}
              onPress={() => setSelectedFilter('all')}
            />
            <FilterChip
              label={`⚡ ${t(strings.market.filterAffordable)}`}
              selected={selectedFilter === 'affordable'}
              onPress={() => setSelectedFilter('affordable')}
            />
            <FilterChip
              label={`🌿 ${t(strings.market.filterGreen)}`}
              selected={selectedFilter === 'green'}
              onPress={() => setSelectedFilter('green')}
            />
            <FilterChip
              label={`✈️ ${t(strings.market.filterTrip)}`}
              selected={selectedFilter === 'trip'}
              onPress={() => setSelectedFilter('trip')}
            />
            {categories.map((cat) => (
              <FilterChip
                key={cat}
                label={cat}
                selected={selectedFilter === cat}
                onPress={() => setSelectedFilter(cat)}
              />
            ))}
          </ScrollView>

          {offers.loading ? <LoadingState /> : null}
          {offers.error ? <ErrorState message={offers.error} onRetry={offers.reload} /> : null}

          {filteredOffers.map((offer) => (
            <OfferRow
              key={offer.id}
              offer={offer}
              affordable={canAfford(balances, offer.currency, offer.costPoints)}
              onRedeem={() => redeem(offer)}
              busy={busy}
            />
          ))}

          {!offers.loading && filteredOffers.length === 0 ? (
            <View style={{ padding: gutter, paddingVertical: 36, alignItems: 'center' }}>
              <Body size={13} colour={color.neutral600}>{t(strings.market.noOffersMatch)}</Body>
            </View>
          ) : null}

          <View style={{ height: 32 }} />
        </ScrollView>
      ) : (
        <MyVouchersTab
          refreshKey={vouchersKey}
          onSelectVoucher={(v) => setVoucher(v)}
          onGoToOffers={() => setActiveTab('offers')}
        />
      )}

      <VoucherSheet voucher={voucher} onClose={() => setVoucher(null)} onToast={onToast} />
    </View>
  );
}

/**
 * The icon for an offer's category. An unknown category still gets a ticket,
 * so a new kind of merchant never shows up as an empty grey square.
 */
const CATEGORY_ICON: Record<string, LucideIcon> = {
  'Café': Coffee,
  'Healthy food': Salad,
  'Hotel': BedDouble,
  'Local experience': Compass,
  'Marine': Waves,
  'Wellness': HeartPulse,
  'Eco & Green': Leaf,
};

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Filter: ${label}`}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: selected ? color.brand : color.neutral300,
        backgroundColor: selected ? color.brand : color.surface,
      }}
    >
      <Label
        size={11}
        tracking={0.06}
        colour={selected ? onFill.brand : color.neutral800}
        style={{ textTransform: 'none' }}
      >
        {label}
      </Label>
    </Pressable>
  );
}

export function OfferRow({
  offer, affordable, onRedeem, busy,
}: { offer: Offer; affordable: boolean; onRedeem: () => void; busy: boolean }) {
  const isGreen = offer.currency === 'green';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 14,
        paddingHorizontal: gutter,
        borderBottomWidth: 1,
        borderBottomColor: color.neutral300,
      }}
    >
      {(() => {
        // The category, on its own flat tint: the same colour for every café.
        const tone = tintFor(offer.category);
        const Mark = CATEGORY_ICON[offer.category] ?? Ticket;
        return (
          <View
            style={{
              width: 56, height: 56, borderRadius: radius.sm, backgroundColor: tone.fill,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Mark size={26} color={tone.ink} strokeWidth={1.8} />
          </View>
        );
      })()}

      <View style={{ flex: 1 }}>
        <Label size={10} tracking={0.12}>{offer.category}</Label>
        <Heading size={15} style={{ marginTop: 3 }}>{offer.name}</Heading>
        <Label size={11} tracking={0} style={{ textTransform: 'none', marginTop: 2 }}>{offer.merchant}</Label>
        {/*
          A sample that names a real business which has not joined. Said
          directly under the name, in the coral the palette keeps for things a
          reader must not take at face value - the same as Ask's example mark.
        */}
        {offer.example ? (
          <Label size={10} tracking={0.12} colour={color.accent2} style={{ marginTop: 3 }}>
            {t(strings.market.example)}
          </Label>
        ) : null}
      </View>

      <Pressable
        onPress={onRedeem}
        disabled={busy || !offer.available}
        accessibilityRole="button"
        accessibilityLabel={`Redeem ${offer.name} for ${offer.costPoints} ${currencyName(offer.currency)}`}
        accessibilityState={{ disabled: !offer.available }}
        style={{
          paddingVertical: 8,
          paddingHorizontal: 10,
          borderWidth: layout.ruleStrong,
          borderRadius: radius.sm,
          // The price is in a currency, so it wears that currency's colour;
          // affordability only decides whether it is lit or greyed.
          borderColor: affordable ? currencyTone(offer.currency).text : color.neutral400,
          backgroundColor: affordable ? (isGreen ? 'rgba(31, 107, 74, 0.04)' : 'rgba(224, 155, 39, 0.05)') : 'transparent',
        }}
      >
        <Heading size={12} colour={affordable ? currencyTone(offer.currency).text : color.neutral500}>
          {`${offer.costPoints.toLocaleString('en-US')} ${offer.currency === 'green' ? 'G' : 'T'}`}
        </Heading>
      </Pressable>
    </View>
  );
}

/**
 * Tab showing active and history vouchers redeemed by the user.
 * Lazily fetched when the user views this tab.
 */
function MyVouchersTab({
  refreshKey,
  onSelectVoucher,
  onGoToOffers,
}: {
  refreshKey: number;
  onSelectVoucher: (v: Voucher) => void;
  onGoToOffers: () => void;
}) {
  const vouchers = useAsync(() => api.vouchers(), [refreshKey]);

  if (vouchers.loading) return <LoadingState />;
  if (vouchers.error) return <ErrorState message={vouchers.error} onRetry={vouchers.reload} />;

  const items = vouchers.data ?? [];
  if (items.length === 0) {
    return (
      <View style={{ paddingHorizontal: gutter, paddingVertical: 48, alignItems: 'center' }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: radius.lg,
            backgroundColor: color.neutral200,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}
        >
          <Ticket size={28} color={color.neutral600} strokeWidth={1.8} />
        </View>
        <Heading size={17} style={{ textAlign: 'center' }}>{t(strings.market.noVouchers)}</Heading>
        <Body size={13} colour={color.neutral600} style={{ textAlign: 'center', marginTop: 8, maxWidth: 280 }}>
          {t(strings.market.noVouchersBlurb)}
        </Body>
        <Button
          label={t(strings.market.tabOffers)}
          onPress={onGoToOffers}
          variant="secondary"
          height={40}
          style={{ marginTop: 24, paddingHorizontal: 20 }}
        />
      </View>
    );
  }

  const activeVouchers = items.filter((v) => v.status === 'active');
  const pastVouchers = items.filter((v) => v.status !== 'active');

  return (
    <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: gutter, paddingTop: 12, paddingBottom: 24 }}>
        {activeVouchers.length > 0 ? (
          <View style={{ marginBottom: 24 }}>
            <Label size={11} tracking={0.14} colour={color.accent700} style={{ marginBottom: 12 }}>
              {`${t(strings.market.activeBadge).toUpperCase()} · ${activeVouchers.length}`}
            </Label>
            {activeVouchers.map((v) => (
              <VoucherCard key={v.id} voucher={v} onSelect={() => onSelectVoucher(v)} />
            ))}
          </View>
        ) : null}

        {pastVouchers.length > 0 ? (
          <View>
            <Label size={11} tracking={0.14} colour={color.neutral600} style={{ marginBottom: 12 }}>
              {`${t({ en: 'HISTORY', th: 'ประวัติการใช้สิทธิ์' })} · ${pastVouchers.length}`}
            </Label>
            {pastVouchers.map((v) => (
              <VoucherCard key={v.id} voucher={v} onSelect={() => onSelectVoucher(v)} isPast />
            ))}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

function VoucherCard({
  voucher,
  onSelect,
  isPast = false,
}: {
  voucher: Voucher;
  onSelect: () => void;
  isPast?: boolean;
}) {
  const expires = new Date(voucher.expiresAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  const isActive = voucher.status === 'active';

  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityLabel={`Voucher for ${voucher.merchant}, code ${voucher.code}`}
      style={{
        backgroundColor: color.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: isActive ? color.accent : color.neutral300,
        padding: 16,
        marginBottom: 12,
        opacity: isPast ? 0.75 : 1,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Heading size={16}>{voucher.merchant}</Heading>
          <Label size={10} tracking={0.1} colour={color.neutral600} style={{ marginTop: 4 }}>
            {t(strings.market.voucherExpires(expires))}
          </Label>
        </View>

        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: radius.sm,
            backgroundColor: isActive ? 'rgba(31, 107, 74, 0.1)' : color.neutral200,
          }}
        >
          <Label
            size={10}
            tracking={0.08}
            colour={isActive ? color.accent700 : color.neutral700}
          >
            {isActive
              ? t(strings.market.activeBadge)
              : voucher.status === 'redeemed'
              ? t(strings.market.usedBadge)
              : t(strings.market.expiredBadge)}
          </Label>
        </View>
      </View>

      <View
        style={{
          marginTop: 12,
          paddingVertical: 10,
          paddingHorizontal: 12,
          backgroundColor: color.neutral100,
          borderRadius: radius.sm,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: color.neutral200,
        }}
      >
        <Heading size={16} tracking={1.5} style={{ fontFamily: font.mono }}>
          {voucher.code}
        </Heading>
        <Label size={11} tracking={0.06} colour={color.brand}>
          {t(strings.market.showVoucher)} →
        </Label>
      </View>
    </Pressable>
  );
}

/**
 * The voucher modal.
 *
 * The code is shown as text as well as a machine-readable block, because a
 * merchant with a cracked camera or a flat battery still has to be able to
 * honour it. A QR that is the ONLY path to redemption is a single point of
 * failure in a beachfront cafe.
 */
function VoucherSheet({
  voucher,
  onClose,
  onToast,
}: {
  voucher: Voucher | null;
  onClose: () => void;
  onToast?: (msg: string) => void;
}) {
  if (!voucher) return null;
  const expires = new Date(voucher.expiresAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  const copyCode = () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(voucher.code);
      }
    } catch {}
    onToast?.(t(strings.market.copied));
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(32,30,29,0.45)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: color.bg, padding: gutter, paddingBottom: 32 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Heading size={22}>{t(strings.market.voucherTitle)}</Heading>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t(strings.common.close)} hitSlop={12}>
              <X size={20} color={color.text} strokeWidth={2} />
            </Pressable>
          </View>

          <View
            style={{
              borderWidth: layout.ruleHair,
              borderColor: color.neutral300,
              borderRadius: radius.md,
              backgroundColor: color.surface,
              padding: 20,
              marginTop: 18,
              alignItems: 'center',
            }}
          >
            <Label size={10} tracking={0.16}>{t(strings.market.voucherShow)}</Label>
            <Heading size={30} tracking={1.2} style={{ marginTop: 12 }}>{voucher.code}</Heading>

            {/* Stylized Merchant Barcode / Pass visual */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                height: 36,
                marginVertical: 14,
                paddingHorizontal: 16,
              }}
            >
              {[3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 1, 2, 4, 1, 3, 2].map((w, i) => (
                <View
                  key={i}
                  style={{
                    width: w,
                    height: 32,
                    backgroundColor: color.neutral800,
                    borderRadius: 1,
                  }}
                />
              ))}
            </View>

            <Label size={11} tracking={0} style={{ textTransform: 'none', marginTop: 4 }}>
              {voucher.merchant}
            </Label>
            <Label size={10} tracking={0.12} style={{ marginTop: 6 }}>
              {t(strings.market.voucherExpires(expires))}
            </Label>

            {/* Copy button */}
            <Pressable
              onPress={copyCode}
              accessibilityRole="button"
              accessibilityLabel="Copy code"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                marginTop: 14,
                paddingVertical: 6,
                paddingHorizontal: 14,
                borderRadius: radius.lg,
                backgroundColor: color.neutral200,
              }}
            >
              <Copy size={13} color={color.text} strokeWidth={2} />
              <Label size={11} tracking={0.06} colour={color.text}>
                {t(strings.market.copyCode)}
              </Label>
            </Pressable>
          </View>

          <Body size={13} colour={color.neutral600} style={{ marginTop: 12, textAlign: 'center' }}>
            {t(strings.market.codeInstructions)}
          </Body>

          <Body size={13} colour={color.neutral700} style={{ marginTop: 8, textAlign: 'center' }}>
            {`${voucher.costPoints.toLocaleString('en-US')} points settled to the merchant.`}
          </Body>
        </View>
      </View>
    </Modal>
  );
}
