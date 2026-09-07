/**
 * Medals, for going to places.
 *
 * Every medal there is, earned or not, each with its condition said plainly
 * and where the traveller stands on it - so nothing on this screen is a
 * locked slot with no explanation. The date on an earned medal is the
 * check-in that finished it; the basis of all of them is printed at the top.
 */

import React from 'react';
import { ScrollView, View } from 'react-native';
import { ledgerDate, strings, type MedalState } from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { bar, color, gutter, layout, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { MedalMark } from '../components/MedalMark.tsx';
import { PushHeader } from '../components/Shell.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { t } from '../i18n/locale.ts';

/** "2 / 3 places" or "1 / 2 areas" - the unit the rule counts in. */
export const progressLine = (m: MedalState): string =>
  m.progress.unit === 'areas'
    ? t(strings.medals.areas(m.progress.done, m.progress.total))
    : t(strings.medals.places(m.progress.done, m.progress.total));

export function MedalsScreen({ onBack, now = new Date() }: { onBack: () => void; now?: Date }) {
  const medals = useAsync(() => api.medals(), []);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} showsVerticalScrollIndicator={false}>
      <PushHeader context={t(strings.medals.context)} onBack={onBack} />
      {medals.error ? <ErrorState message={medals.error} onRetry={medals.reload} /> : null}
      {medals.loading && !medals.data ? <LoadingState /> : null}
      {medals.data ? (
        <>
          <View style={{ paddingHorizontal: gutter, paddingTop: 4 }}>
            <Heading size={26} tracking={-0.5}>{t(strings.medals.earnedOf(medals.data.earned, medals.data.total))}</Heading>
            <Body size={13} colour={color.neutral700} style={{ marginTop: 6 }}>{t(medals.data.basis)}</Body>
          </View>
          {medals.data.medals.map((m) => <MedalRow key={m.key} medal={m} now={now} />)}
          <View style={{ height: 28 }} />
        </>
      ) : null}
    </ScrollView>
  );
}

function MedalRow({ medal: m, now }: { medal: MedalState; now: Date }) {
  const pct = m.progress.total > 0 ? Math.round((m.progress.done / m.progress.total) * 100) : 0;
  const b = bar(pct, m.earned ? color.gold : color.neutral400, 6);
  const status = m.earned && m.earnedAt
    ? t(strings.medals.earnedOn(t(ledgerDate(m.earnedAt, now))))
    : progressLine(m);
  return (
    <View
      accessibilityLabel={`${t(m.name)}, ${m.earned ? t(strings.medals.earned) : progressLine(m)}`}
      style={[shadow.card, {
        marginHorizontal: gutter, marginTop: 12, padding: 14,
        backgroundColor: color.surface, borderRadius: radius.md,
        flexDirection: 'row', alignItems: 'center', gap: 14,
        borderWidth: m.earned ? layout.ruleStrong : 0, borderColor: color.gold,
      }]}
    >
      <MedalMark mark={m.mark} earned={m.earned} size={56} />
      <View style={{ flex: 1 }}>
        <Heading size={16}>{t(m.name)}</Heading>
        <Body size={13} colour={color.neutral700} style={{ marginTop: 2 }}>{t(m.how)}</Body>
        <View style={[b.track, { marginTop: 8 }]}><View style={b.fill} /></View>
        <Label size={9} tracking={0.06} colour={m.earned ? color.goldDeep : color.neutral600} style={{ marginTop: 4, textTransform: 'none' }}>
          {status}
        </Label>
      </View>
    </View>
  );
}
