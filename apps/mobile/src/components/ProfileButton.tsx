import React from 'react';
import { Image, Pressable } from 'react-native';
import { UserRound } from 'lucide-react-native';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { t } from '../i18n/locale.ts';

/** Shared account photo button for the app's screen headers. */
export function ProfileButton({ onPress }: { onPress?: () => void }) {
  const account = useAsync(() => api.account(), []);
  const photo = account.data?.profilePhotoUrl;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t({ en: 'Profile', th: 'โปรไฟล์', zh: '个人资料' })}
      style={{
        width: 44, height: 44, borderRadius: 22,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)',
        backgroundColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}
    >
      {photo
        ? <Image source={{ uri: photo }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
        : <UserRound size={23} color="#FFFFFF" strokeWidth={2} />}
    </Pressable>
  );
}
