import React from 'react';
import { View } from 'react-native';

import { PushHeader } from '../components/Shell.tsx';
import { t } from '../i18n/locale.ts';
import { color } from '../theme/index.ts';

/**
 * Reserved surface for connecting ChivarGo to external applications.
 *
 * The integration flow is intentionally not invented here. Until its
 * providers, permissions, and revoke behaviour are specified, this route is
 * only a stable, navigable shell that future work can build on safely.
 */
export function ConnectAppScreen({ onBack }: { onBack: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <PushHeader
        context={t({ en: 'Connect App', th: 'เชื่อมต่อแอป', zh: '连接应用' })}
        onBack={onBack}
      />
      <View style={{ flex: 1 }} />
    </View>
  );
}
