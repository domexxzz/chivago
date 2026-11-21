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
import { flushActivityEvidenceOutbox, flushJournalOutbox, flushOutbox, pendingCount, type FlushReport } from './outbox.ts';
import { deviceOutbox } from './outbox-device.ts';
import { deletePersistedEvidencePhotos } from './outbox-photo.ts';

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
      const activities = await flushActivityEvidenceOutbox(store, async (item) => {
        const draft = await api.createAdventureEvidence(item.nodeId, item.clientRequestId, item.qrScanId);
        if (!draft.ok) return { ok: false, code: draft.code, error: draft.error };
        const submitted = await api.submitAdventureEvidence(draft.data.id, item.photos, item.position);
        return submitted.ok ? { ok: true } : { ok: false, code: submitted.code, error: submitted.error };
      });
      const journals = await flushJournalOutbox(store, async (item) => {
        const result = await api.updateTravelJournalEntry(item.entryId, { ...item.patch, expectedUpdatedAt: item.expectedUpdatedAt });
        return result.ok ? { ok: true } : { ok: false, code: result.code, error: result.error };
      });
      await Promise.all(
        [...activities.sent, ...activities.dropped.map(({ item }) => item)]
          .filter((item) => item.kind === 'adventureEvidence')
          .map((item) => deletePersistedEvidencePhotos(item.photos)),
      );
      if (report.sent.length > 0) { onToast(t(strings.quest.outboxSent)); onSent(); }
      if (report.dropped.length > 0) onToast(t(strings.quest.outboxDropped));
      if (activities.sent.length > 0) {
        onToast(t({ en: 'Saved Adventure evidence was uploaded.', th: 'อัปโหลดหลักฐาน Adventure ที่บันทึกไว้แล้ว', zh: '已上传保存的冒险证据。' }));
        onSent();
      }
      if (activities.dropped.length > 0) onToast(t({ en: 'Saved evidence was refused by the server.', th: 'เซิร์ฟเวอร์ปฏิเสธหลักฐานที่บันทึกไว้', zh: '服务器拒绝了保存的证据。' }));
      if (journals.sent.length > 0) { onToast(t({ en: 'Offline journal changes were synced.', th: 'ซิงก์บันทึกออฟไลน์แล้ว', zh: '离线手账更改已同步。' })); onSent(); }
      if (journals.dropped.length > 0) onToast(t({ en: 'A journal edit conflicted with a newer server copy. Open it again before saving.', th: 'บันทึกนี้ขัดแย้งกับข้อมูลใหม่บนเซิร์ฟเวอร์ กรุณาเปิดใหม่ก่อนบันทึก', zh: '手账编辑与服务器新版本冲突，请重新打开后保存。' }));
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
