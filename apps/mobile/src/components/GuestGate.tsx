/**
 * Guest mode, the two pieces of it a visitor sees.
 *
 * A guest chose "look around first" on the login screen (see
 * `state/auth.ts`). They get every public screen - the map, places, quests,
 * the game, safety - and two reminders that they have no account:
 *
 * - `GuestBand`, a slim band above the content on every screen, with a way to
 *   sign in. Like `UnfencedBand` it does not dismiss: the person holding the
 *   phone should always know which mode they are in.
 * - `GuestGate`, which stands IN PLACE of a screen that is about one person -
 *   the profile, the wallet, the account - because those would otherwise show
 *   an empty anonymous record as though it were theirs.
 */

import React from 'react';
import { Pressable, View } from 'react-native';
import { UserRound } from 'lucide-react-native';
import { Button } from './Button.tsx';
import { Body, Heading, Label } from './Type.tsx';
import { t } from '../i18n/locale.ts';

export function GuestBand({ onSignIn }: { onSignIn: () => void }) {
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, backgroundColor: '#E6F3FB', paddingVertical: 6, paddingHorizontal: 12,
      }}
    >
      <Label size={10} tracking={0.06} colour="#24547A" style={{ textTransform: 'none' }}>
        {t({ en: 'Browsing as a guest', th: 'กำลังเข้าชมแบบผู้เยี่ยมชม' })}
      </Label>
      <Pressable
        onPress={onSignIn}
        accessibilityRole="button"
        accessibilityLabel={t({ en: 'Sign in', th: 'เข้าสู่ระบบ' })}
        hitSlop={8}
      >
        <Label size={10} tracking={0.06} colour="#0072C6" style={{ textTransform: 'none', fontWeight: '700' }}>
          {t({ en: 'Sign in', th: 'เข้าสู่ระบบ' })}
        </Label>
      </Pressable>
    </View>
  );
}

export function GuestGate({
  onSignIn, onRegister, onBack,
}: { onSignIn: () => void; onRegister: () => void; onBack?: () => void }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 14 }}>
      <View
        style={{
          width: 64, height: 64, borderRadius: 32, alignSelf: 'center',
          backgroundColor: '#E6F3FB', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <UserRound size={30} color="#0072C6" strokeWidth={2} />
      </View>
      <Heading size={22} style={{ textAlign: 'center' }}>
        {t({ en: 'Sign in to see this', th: 'เข้าสู่ระบบเพื่อดูหน้านี้' })}
      </Heading>
      <Body style={{ textAlign: 'center' }}>
        {t({
          en: 'You are browsing as a guest. Your profile, wallet and points need an account so they stay yours.',
          th: 'คุณกำลังเข้าชมแบบผู้เยี่ยมชม โปรไฟล์ กระเป๋าเงิน และแต้มสะสมต้องมีบัญชีเพื่อเก็บไว้เป็นของคุณ',
        })}
      </Body>
      <Button label="Sign in" thai="เข้าสู่ระบบ" onPress={onSignIn} />
      <Button label="Create an account" thai="สมัครสมาชิก" variant="secondary" onPress={onRegister} />
      {onBack ? (
        <Button label="Keep browsing" thai="เข้าชมต่อ" variant="ghost" onPress={onBack} style={{ alignSelf: 'center' }} />
      ) : null}
    </View>
  );
}
