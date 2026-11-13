import React from 'react';
import { Modal, Pressable, View } from 'react-native';
import { LockKeyhole, X } from 'lucide-react-native';
import type { Bilingual } from '@chivago/core';
import { Button } from './Button.tsx';
import { Body, Heading } from './Type.tsx';
import { t } from '../i18n/locale.ts';

type GuestActionContextValue = { requireAccount: (reason?: Bilingual) => boolean };
const GuestActionContext = React.createContext<GuestActionContextValue>({ requireAccount: () => false });

export function useRequireAccount() {
  return React.useContext(GuestActionContext).requireAccount;
}

export function GuestActionProvider({
  guest, onSignIn, onRegister, children,
}: {
  guest: boolean;
  onSignIn: () => void;
  onRegister: () => void;
  children: React.ReactNode;
}) {
  const [reason, setReason] = React.useState<Bilingual | null>(null);
  const requireAccount = React.useCallback((message?: Bilingual) => {
    if (!guest) return false;
    // Guest mode is a presentation sandbox. The API interceptor handles the
    // action in memory and discards it on reload, so the screen should proceed
    // exactly as it would for a member instead of opening an account wall.
    void message;
    setReason(null);
    return false;
  }, [guest]);

  return (
    <GuestActionContext.Provider value={{ requireAccount }}>
      {children}
      <Modal visible={reason !== null} transparent animationType="fade" onRequestClose={() => setReason(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(5,32,54,0.48)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 24, padding: 22, gap: 14 }}>
            <Pressable onPress={() => setReason(null)} accessibilityRole="button" accessibilityLabel={t({ en: 'Close', th: 'ปิด', zh: '关闭' })} style={{ alignSelf: 'flex-end', padding: 4 }}>
              <X size={20} color="#557080" />
            </Pressable>
            <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: '#E5F5FA', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}>
              <LockKeyhole size={25} color="#0077B6" />
            </View>
            <Heading size={19} style={{ textAlign: 'center' }}>{t({ en: 'Account required', th: 'ต้องเข้าสู่ระบบก่อน', zh: '需要账号' })}</Heading>
            <Body style={{ textAlign: 'center' }}>{reason ? t(reason) : ''}</Body>
            <Button label="Sign in" thai="เข้าสู่ระบบ" chinese="登录" onPress={() => { setReason(null); onSignIn(); }} />
            <Button label="Create an account" thai="สมัครสมาชิก" chinese="注册账号" variant="secondary" onPress={() => { setReason(null); onRegister(); }} />
          </View>
        </View>
      </Modal>
    </GuestActionContext.Provider>
  );
}
