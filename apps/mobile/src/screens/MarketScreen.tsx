/**
 * Points marketplace.
 *
 * Redemptions settle to local merchants - the loop that returns tourist spend
 * to the community, and the reason the eco layer is not just a scoreboard.
 *
 * The prototype stops at a toast. Handoff open question 4, resolved: a
 * redemption issues a real voucher with a code, an expiry and a merchant
 * settlement record, and the app shows it for the merchant to scan.
 */

import React from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { X } from 'lucide-react-native';
import {
  balanceOf, canAfford, emptyBalances, shortfall, strings,
  type Balances, type Offer, type Voucher,
} from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, layout, radius } from '../theme/index.ts';
import { Body, Heading, Label, Thai } from '../components/Type.tsx';
import { Button } from '../components/Button.tsx';
import { PushHeader } from '../components/Shell.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';

/** Currency as it reads mid-sentence, e.g. "180 more Trip Points". */
const currencyName = (c: Offer['currency']): string =>
  c === 'green' ? strings.common.greenPoints.en : strings.common.tripPoints.en;

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
      onToast(`${strings.market.notEnough.en} — ${need} more ${currencyName(offer.currency)}.`);
      return;
    }
    setBusy(true);
    const res = await api.redeem(offer.id);
    setBusy(false);
    if (res.ok) {
      setVoucher(res.data.voucher);
      wallet.reload();
      onPointsChanged();
      onToast(strings.market.voucherSent(offer.merchantShort).en);
    } else onToast(res.error);
  };

  return (
    <View style={{ flex: 1 }}>
      <PushHeader
        context={`${strings.market.context.en} · ${strings.market.context.th}`}
        onBack={onBack}
        right={<PurseChips balances={balances} />}
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: gutter, paddingBottom: 14 }}>
          <Body size={13} colour={color.neutral700}>{strings.market.intro.en}</Body>
          <Thai size={11} style={{ marginTop: 6 }}>{strings.market.intro.th}</Thai>
        </View>

        {offers.loading ? <LoadingState /> : null}
        {offers.error ? <ErrorState message={offers.error} onRetry={offers.reload} /> : null}

        {offers.data?.map((offer) => (
          <OfferRow
            key={offer.id}
            offer={offer}
            affordable={canAfford(balances, offer.currency, offer.costPoints)}
            onRedeem={() => redeem(offer)}
            busy={busy}
          />
        ))}
        <View style={{ height: 32 }} />
      </ScrollView>

      <VoucherSheet voucher={voucher} onClose={() => setVoucher(null)} />
    </View>
  );
}

export function OfferRow({
  offer, affordable, onRedeem, busy,
}: { offer: Offer; affordable: boolean; onRedeem: () => void; busy: boolean }) {
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
      <View style={{ width: 56, height: 56, backgroundColor: color.neutral300, borderRadius: radius.sm }} />

      <View style={{ flex: 1 }}>
        <Label size={10} tracking={0.12}>{offer.category}</Label>
        <Heading size={15} style={{ marginTop: 3 }}>{offer.name}</Heading>
        <Label size={11} tracking={0} style={{ textTransform: 'none', marginTop: 2 }}>{offer.merchant}</Label>
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
          borderColor: affordable ? color.accent : color.neutral400,
        }}
      >
        <Heading size={12} colour={affordable ? color.accent : color.neutral500}>
          {`${offer.costPoints.toLocaleString('en-US')} ${offer.currency === 'green' ? 'G' : 'T'}`}
        </Heading>
      </Pressable>
    </View>
  );
}

/**
 * The voucher.
 *
 * The code is shown as text as well as a machine-readable block, because a
 * merchant with a cracked camera or a flat battery still has to be able to
 * honour it. A QR that is the ONLY path to redemption is a single point of
 * failure in a beachfront cafe.
 */
function VoucherSheet({ voucher, onClose }: { voucher: Voucher | null; onClose: () => void }) {
  if (!voucher) return null;
  const expires = new Date(voucher.expiresAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(32,30,29,0.45)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: color.bg, padding: gutter, paddingBottom: 32 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Heading size={22}>{strings.market.voucherTitle.en}</Heading>
              <Thai size={11} style={{ marginTop: 3 }}>{strings.market.voucherTitle.th}</Thai>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}>
              <X size={20} color={color.text} strokeWidth={2} />
            </Pressable>
          </View>

          <View
            style={{
              borderWidth: layout.ruleStrong,
              borderColor: color.text,
              borderRadius: radius.md,
              padding: 20,
              marginTop: 18,
              alignItems: 'center',
            }}
          >
            <Label size={10} tracking={0.16}>{strings.market.voucherShow.en}</Label>
            <Heading size={30} tracking={1.2} style={{ marginTop: 12 }}>{voucher.code}</Heading>
            <Label size={11} tracking={0} style={{ textTransform: 'none', marginTop: 12 }}>
              {voucher.merchant}
            </Label>
            <Label size={10} tracking={0.12} style={{ marginTop: 6 }}>
              {strings.market.voucherExpires(expires).en}
            </Label>
          </View>

          <Body size={13} colour={color.neutral700} style={{ marginTop: 14 }}>
            {`${voucher.costPoints.toLocaleString('en-US')} points settled to the merchant.`}
          </Body>
        </View>
      </View>
    </Modal>
  );
}
