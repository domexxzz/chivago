/**
 * Where a debris case stands, as the person who reported it sees it.
 *
 * Four steps, and the one the case is on is said in words, not only marked.
 * "Waiting" is a step like any other: a reporter who sees their case waiting
 * comes back; one who sees nothing at all does not report again.
 */
import React from 'react';
import { View } from 'react-native';
import type { DebrisCaseStatus, DebrisReportView, Localised } from '@chivago/core';
import { color } from '../theme/index.ts';
import { Body } from './Type.tsx';
import { t } from '../i18n/locale.ts';

const WORDS: Record<DebrisCaseStatus, Localised> = {
  open: { en: 'Waiting for the municipality to open the case', th: 'รอเทศบาลเปิดเคส', zh: '等待市政立案' },
  assigned: { en: 'Team assigned', th: 'มอบหมายทีมแล้ว', zh: '已指派团队' },
  closed: { en: 'Collected', th: 'เก็บแล้ว', zh: '已清理' },
  dismissed: { en: 'Closed by an officer without collection', th: 'เจ้าหน้าที่ปิดเคสโดยไม่ได้เก็บ', zh: '工作人员未清理即结案' },
};

/** The short words for a case's status, for a list row. */
export const debrisStatusWords = (status: DebrisCaseStatus): Localised => WORDS[status];

type Collection = NonNullable<NonNullable<DebrisReportView['case']>['collection']>;

/**
 * What came off the beach, said to the person who reported it (board F6):
 * how much, and who closed it - the reason somebody reports a second time.
 * A part-collection names the case the rest went to, so it is not read as done.
 */
export const debrisCollectionWords = (k: Collection): Localised => (k.outcome === 'all'
  ? { en: `Collected · ${k.weightKg} kg · by ${k.by}`, th: `เก็บแล้ว · ${k.weightKg} กก. · โดย ${k.by}`, zh: `已清理 · ${k.weightKg} 公斤 · ${k.by}` }
  : {
      en: `Part collected · ${k.weightKg} kg · the rest is ${k.followUpNumber ?? 'a new case'}`,
      th: `เก็บบางส่วน · ${k.weightKg} กก. · ส่วนที่เหลือคือ ${k.followUpNumber ?? 'เคสใหม่'}`,
      zh: `部分清理 · ${k.weightKg} 公斤 · 剩余部分为 ${k.followUpNumber ?? '新案件'}`,
    });

/*
  No promise here that the code does not keep: no notification (there is none
  yet - the step shows on this screen), and no "within office hours", because
  nobody has agreed to a time.
*/
const STEPS: { key: string; words: Localised }[] = [
  { key: 'checked', words: { en: 'Checked: inside the island, kept', th: 'ระบบตรวจแล้ว: อยู่ในเขตเกาะ บันทึกแล้ว', zh: '已核对：在岛屿范围内，已保存' } },
  { key: 'open', words: WORDS.open },
  { key: 'assigned', words: WORDS.assigned },
  { key: 'closed', words: { en: 'Collected - shown here when it is', th: 'เก็บแล้ว จะขึ้นที่หน้านี้เมื่อเก็บ', zh: '已清理——清理后会在这里显示' } },
];

const STATE: Record<'done' | 'now' | 'later', Localised> = {
  done: { en: 'Done', th: 'เสร็จแล้ว', zh: '已完成' },
  now: { en: 'Now', th: 'ตอนนี้', zh: '当前' },
  later: { en: 'Not yet', th: 'ยังไม่ถึง', zh: '尚未' },
};

/** How far along each status is. A dismissed case stops after the queue and says why. */
const REACHED: Record<DebrisCaseStatus, number> = { open: 1, assigned: 2, closed: 3, dismissed: 1 };

export function DebrisCaseSteps({ status }: { status: DebrisCaseStatus }) {
  const reached = REACHED[status];
  return (
    <View style={{ gap: 8 }}>
      {STEPS.map((step, i) => {
        const done = i < reached || (status === 'closed' && i === reached);
        const current = i === reached && status !== 'closed';
        // The dot's colour is the only other sign of where the case is, so a
        // screen reader is told in words.
        const state = t(STATE[done ? 'done' : current ? 'now' : 'later']);
        return (
          <View
            key={step.key}
            accessible
            accessibilityLabel={`${state}: ${t(step.words)}`}
            style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}
          >
            <View style={{
              width: 14, height: 14, marginTop: 3, borderRadius: 7, borderWidth: 2,
              borderColor: done || current ? color.brand : color.neutral400,
              backgroundColor: done ? color.brand : color.surface,
            }} />
            <Body size={14} colour={done || current ? color.text : color.neutral600} style={{ flex: 1 }}>
              {t(step.words)}
            </Body>
          </View>
        );
      })}
      {status === 'dismissed' ? <Body size={13} colour={color.accent2}>{t(WORDS.dismissed)}</Body> : null}
    </View>
  );
}
