/**
 * Medals, for going to places.
 *
 * Every medal there is, earned or not, each with its condition said plainly
 * and where the traveller stands on it - so nothing on this screen is a
 * locked slot with no explanation. The date on an earned medal is the
 * check-in that finished it; the basis of all of them is printed at the top.
 *
 * THE LOOK matches the Collect screen: a dark tray carries the count and a
 * bar, and the medals sit in a two-column grid of tiles. An earned tile is
 * gold, the game layer's colour; an unearned one is white and still says
 * exactly what it takes, so no tile is a padlock.
 */

import React from 'react';
import { ScrollView, View } from 'react-native';
import { ledgerDate, strings, type MedalState } from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { bar, color, gutter, layout, shadow } from '../theme/index.ts';
import { gameRadius } from '@chivago/tokens';
import { Body, Heading, Label } from '../components/Type.tsx';
import { MedalMark } from '../components/MedalMark.tsx';
import { GameBar, Medal, Tray, TrayLine } from '../components/Game.tsx';
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
  const data = medals.data;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} showsVerticalScrollIndicator={false}>
      <PushHeader context={t(strings.medals.context)} onBack={onBack} />
      {medals.error ? <ErrorState message={medals.error} onRetry={medals.reload} /> : null}
      {medals.loading && !data ? <LoadingState /> : null}
      {data ? (
        <>
          <Tray style={{ marginHorizontal: gutter, marginTop: 4, borderRadius: gameRadius.panel }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Medal value={data.earned} />
              <View style={{ flex: 1, gap: 8 }}>
                <TrayLine>{t(strings.medals.earnedOf(data.earned, data.total))}</TrayLine>
                <View style={{ flexDirection: 'row' }}>
                  <GameBar pct={data.total > 0 ? (data.earned / data.total) * 100 : 0} height={10} />
                </View>
              </View>
            </View>
          </Tray>
          <Body size={13} colour={color.neutral700} style={{ marginHorizontal: gutter, marginTop: 10 }}>
            {t(data.basis)}
          </Body>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: gutter, paddingTop: 12 }}>
            {data.medals.map((m) => <MedalTile key={m.key} medal={m} now={now} />)}
          </View>
          <View style={{ height: 28 }} />
        </>
      ) : null}
    </ScrollView>
  );
}

function MedalTile({ medal: m, now }: { medal: MedalState; now: Date }) {
  const pct = m.progress.total > 0 ? Math.round((m.progress.done / m.progress.total) * 100) : 0;
  const b = bar(pct, m.earned ? color.gold : color.neutral400, 6);
  const status = m.earned && m.earnedAt
    ? t(strings.medals.earnedOn(t(ledgerDate(m.earnedAt, now))))
    : progressLine(m);
  return (
    <View
      accessibilityLabel={`${t(m.name)}, ${m.earned ? t(strings.medals.earned) : progressLine(m)}`}
      style={[shadow.card, {
        width: '48%', flexGrow: 1, minHeight: 176, padding: 12, gap: 6,
        backgroundColor: m.earned ? color.goldSoft : color.surface, borderRadius: gameRadius.panel,
        borderWidth: m.earned ? layout.ruleStrong : 0, borderColor: color.gold,
      }]}
    >
      <MedalMark mark={m.mark} earned={m.earned} size={52} />
      <Heading size={15}>{t(m.name)}</Heading>
      <Body size={13} colour={color.neutral700}>{t(m.how)}</Body>
      <View style={{ flex: 1 }} />
      <View style={b.track}><View style={b.fill} /></View>
      <Label size={9} tracking={0.06} colour={m.earned ? color.goldDeep : color.neutral700} style={{ textTransform: 'none' }}>
        {status}
      </Label>
    </View>
  );
}
