/**
 * A mascot's room. The same room a Samui companion has - the animal alive in
 * three dimensions on the web, the drawn mark on a phone - for one of the
 * seventy-seven.
 *
 * The stage is the passport's: a province this traveller has a verified
 * check-in in shows its mascot grown; one they have not reached shows it
 * too, because the guide hides nothing, but says so beside it. Nothing here
 * hatches, feeds or wants; the facts under the room are the emblem's.
 */

import React from 'react';
import { ScrollView, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { BASIS_LABEL, findProvince, mascotFor, strings } from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync, useToast } from '../state/store.tsx';
import { color, gutter, radius } from '../theme/index.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { IconButton } from '../components/Button.tsx';
import { CreatureScene } from '../components/CreatureScene.tsx';
import { t } from '../i18n/locale.ts';

export function MascotRoomScreen({ code, onBack }: { code: string; onBack: () => void }) {
  const mascot = mascotFor(code);
  const province = findProvince(code);
  const passport = useAsync(() => api.passport(), []);
  const toast = useToast();
  if (!mascot || !province) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg, padding: gutter }}>
        <Body>{t({ en: 'No such province.', th: 'ไม่มีจังหวัดนี้' })}</Body>
      </View>
    );
  }
  const met = (passport.data?.visited ?? []).includes(code);
  const label = `${t(mascot.name)}, ${t(mascot.creature)}. ${t(strings.mascots.tapToGreet)}`;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: gutter, paddingTop: 16, paddingBottom: 8 }}>
        <IconButton onPress={onBack} accessibilityLabel="Back">
          <ChevronLeft size={20} color={color.text} strokeWidth={2} />
        </IconButton>
        <Label size={10} tracking={0.14}>{t(province.name)}</Label>
      </View>

      <View style={{ marginHorizontal: gutter, borderRadius: radius.md, overflow: 'hidden', backgroundColor: color.surface, borderWidth: 1, borderColor: met ? color.text : color.neutral300 }}>
        <CreatureScene
          species="mascot"
          mascot={mascot}
          stage="grown"
          grown={met}
          label={label}
          onTap={() => toast.show(t(mascot.name))}
        />
        <View style={{ alignItems: 'center', paddingBottom: 22, paddingHorizontal: gutter }}>
          <Heading size={24} tracking={-0.4}>{t(mascot.name)}</Heading>
          <Body size={14} colour={color.neutral700} style={{ marginTop: 4 }}>{t(mascot.creature)}</Body>
          <View style={{ marginTop: 10, paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.sm, backgroundColor: met ? color.text : color.neutral200 }}>
            <Label size={9} tracking={0.12} colour={met ? color.surface : color.neutral700}>
              {met ? t(strings.mascots.met) : t(strings.mascots.notMet)}
            </Label>
          </View>
        </View>
      </View>

      <View style={{ paddingHorizontal: gutter, paddingTop: 16, gap: 8 }}>
        <Body size={14}>{t(mascot.why)}</Body>
        <Label size={9} tracking={0.1} colour={color.neutral600} style={{ textTransform: 'none' }}>
          {`${t(strings.mascots.drawnFrom)}: ${t(BASIS_LABEL[mascot.basis])}`}
        </Label>
      </View>
      <View style={{ height: 36 }} />
    </ScrollView>
  );
}
