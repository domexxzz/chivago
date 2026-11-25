/**
 * A faculty and a year, for somebody who wants to say.
 *
 * Nothing is chosen for them and nothing is asked twice. The agreement is a
 * separate act from the choice, and taking it back is on the same card.
 */

import React from 'react';
import { Pressable, View } from 'react-native';
import { Check } from 'lucide-react-native';
import {
  STUDENT_CONSENT, STUDENT_CONSENT_VERSION, STUDENT_YEARS, STUDENT_YEAR_LABEL, facultiesOf, facultyName,
  type AreaKey, type StudentYear,
} from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, onFill, radius } from '../theme/index.ts';
import { t } from '../i18n/locale.ts';
import { useRequireAccount } from './GuestActionGate.tsx';
import { Button } from './Button.tsx';
import { Body, Heading, Label } from './Type.tsx';

const Pill = ({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="radio"
    accessibilityLabel={label}
    accessibilityState={{ selected: on }}
    style={{
      minHeight: 44, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center',
      backgroundColor: on ? color.brand : color.surface, borderWidth: 1, borderColor: on ? color.brand : color.neutral300,
    }}
  >
    <Body size={14} colour={on ? onFill.brand : color.text}>{label}</Body>
  </Pressable>
);

export function StudentPanel({ areaKey, onToast }: { areaKey: AreaKey; onToast: (m: string) => void }) {
  const faculties = facultiesOf(areaKey);
  const saved = useAsync(() => api.student(), []);
  const requireAccount = useRequireAccount();
  const [editing, setEditing] = React.useState(false);
  const [faculty, setFaculty] = React.useState<string | null>(null);
  const [year, setYear] = React.useState<StudentYear | null>(null);
  const [agreed, setAgreed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  if (faculties.length === 0 || saved.loading || saved.error) return null;
  const mine = saved.data?.student?.university === areaKey ? saved.data.student : null;

  const save = async () => {
    if (!faculty || !year || !agreed) return;
    if (requireAccount({ en: 'Please sign in or create an account to save your faculty.', th: 'กรุณาเข้าสู่ระบบหรือสมัครสมาชิกเพื่อบันทึกคณะ', zh: '请登录或注册账号，以保存院系。' })) return;
    setBusy(true);
    const res = await api.saveStudent({ university: areaKey, faculty, year, consentVersion: STUDENT_CONSENT_VERSION });
    setBusy(false);
    if (!res.ok) { onToast(res.error); return; }
    setEditing(false);
    saved.reload();
  };
  const remove = async () => {
    setBusy(true);
    const res = await api.forgetStudent();
    setBusy(false);
    if (!res.ok) { onToast(res.error); return; }
    setFaculty(null); setYear(null); setAgreed(false);
    saved.reload();
  };
  const begin = () => {
    setFaculty(mine?.faculty ?? null); setYear(mine?.year ?? null); setAgreed(false); setEditing(true);
  };

  return (
    <View style={{ marginTop: 28, padding: 16, borderRadius: radius.lg, backgroundColor: color.surface, borderWidth: 1, borderColor: color.neutral300 }}>
      <Heading size={17}>{t({ en: 'Your faculty and year', th: 'คณะและชั้นปีของคุณ', zh: '您的院系与年级' })}</Heading>
      {!editing ? (
        <>
          <Body size={14} colour={color.neutral800} style={{ marginTop: 6 }}>
            {mine
              ? `${t(facultyName(areaKey, mine.faculty)!)} · ${t(STUDENT_YEAR_LABEL[mine.year])}`
              : t({
                en: 'Optional. It helps organisers see which faculties took part, never who.',
                th: 'ไม่บังคับ ช่วยให้ผู้จัดเห็นว่าคณะไหนมาร่วม โดยไม่เห็นว่าเป็นใคร',
                zh: '可选。帮助主办方了解哪些院系参与，而不会看到具体个人。',
              })}
          </Body>
          <View style={{ gap: 8, marginTop: 10 }}>
            <Button
              label={mine ? t({ en: 'Change', th: 'แก้ไข', zh: '修改' }) : t({ en: 'Add my faculty', th: 'ระบุคณะ', zh: '填写院系' })}
              onPress={begin}
              variant="secondary"
              icon={null}
              height={44}
            />
            {mine ? (
              <Button label={t({ en: 'Remove it', th: 'ลบข้อมูลนี้', zh: '删除' })} onPress={() => { void remove(); }} disabled={busy} variant="ghost" icon={null} height={44} />
            ) : null}
          </View>
        </>
      ) : (
        <>
          <Label size={10} tracking={0.1} style={{ marginTop: 12 }}>{t({ en: 'Faculty', th: 'คณะ', zh: '院系' })}</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {faculties.map((f) => <Pill key={f.key} label={t(f.name)} on={f.key === faculty} onPress={() => setFaculty(f.key)} />)}
          </View>
          <Label size={10} tracking={0.1} style={{ marginTop: 14 }}>{t({ en: 'Year', th: 'ชั้นปี', zh: '年级' })}</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {STUDENT_YEARS.map((y) => <Pill key={y} label={t(STUDENT_YEAR_LABEL[y])} on={y === year} onPress={() => setYear(y)} />)}
          </View>
          <Pressable
            onPress={() => setAgreed(!agreed)}
            accessibilityRole="checkbox"
            accessibilityLabel={t(STUDENT_CONSENT)}
            accessibilityState={{ checked: agreed }}
            style={{ flexDirection: 'row', gap: 12, marginTop: 16, alignItems: 'flex-start', minHeight: 44 }}
          >
            <View style={{
              width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
              borderWidth: 2, borderColor: color.brand, backgroundColor: agreed ? color.brand : color.surface,
            }}>
              {agreed ? <Check size={16} color={onFill.brand} strokeWidth={3} /> : null}
            </View>
            <Body size={13} colour={color.neutral800} style={{ flex: 1 }}>{t(STUDENT_CONSENT)}</Body>
          </Pressable>
          <View style={{ gap: 8, marginTop: 12 }}>
            <Button label={t({ en: 'Save', th: 'บันทึก', zh: '保存' })} onPress={() => { void save(); }} disabled={!faculty || !year || !agreed || busy} busy={busy} height={48} />
            <Button label={t({ en: 'Cancel', th: 'ยกเลิก', zh: '取消' })} onPress={() => setEditing(false)} variant="ghost" icon={null} height={44} />
          </View>
        </>
      )}
    </View>
  );
}
