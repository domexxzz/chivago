/**
 * When the outbox tries again: on mount, when the app comes to the front,
 * when the browser says it is online, and once a minute while anything is
 * waiting. Never in a tight loop - the flush itself stops at the first
 * network failure.
 */

import React from 'react';
import { AppState, Platform } from 'react-native';
import { api } from '../api/client.ts';
import { strings } from '@chivago/core';
import { t } from '../i18n/locale.ts';
import { flushOutbox, pendingCount, type FlushReport } from './outbox.ts';
import { deviceOutbox } from './outbox-device.ts';

const EVERY_MS = 60_000;

export function useOutboxFlush(enabled: boolean, onToast: (msg: string) => void, onSent: () => void): void {
  const busy = React.useRef(false);
  const flush = React.useCallback(async (): Promise<FlushReport | null> => {
    if (busy.current) return null;
    busy.current = true;
    try {
      const store = deviceOutbox();
      if ((await pendingCount(store)) === 0) return null;
      const report = await flushOutbox(store, async (questId, payload) => {
        const res = await api.submitProof(questId, payload);
        return res.ok ? { ok: true } : { ok: false, code: res.code, error: res.error };
      });
      if (report.sent.length > 0) { onToast(t(strings.quest.outboxSent)); onSent(); }
      if (report.dropped.length > 0) onToast(t(strings.quest.outboxDropped));
      return report;
    } finally {
      busy.current = false;
    }
  }, [onToast, onSent]);

  React.useEffect(() => {
    if (!enabled) return undefined;
    void flush();
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') void flush(); });
    const online = () => { void flush(); };
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.addEventListener('online', online);
    const every = setInterval(() => { void flush(); }, EVERY_MS);
    return () => {
      sub.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.removeEventListener('online', online);
      clearInterval(every);
    };
  }, [enabled, flush]);
}
