/**
 * "Delete account": the in-app half of the PDPA right to erasure.
 *
 * The server could always do it (DELETE /profile, account-deletion.ts) but
 * nothing in the app called it, so the privacy policy had to tell people to
 * send an email. This is the button that lets the policy point here instead.
 *
 * Quieter than "Log out" on purpose. It sits below it as a text action, not a
 * filled button, and nothing happens until the dialog's second, explicit
 * "Delete permanently". A failure keeps the dialog open and says so: an
 * account is never reported deleted unless the server said it was.
 */

import React from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { color, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from './Type.tsx';
import { t } from '../i18n/locale.ts';

const RED = '#DC2626';

export const DELETE_ACCOUNT_TEXT = {
  action: { en: 'Delete account', th: 'ลบบัญชี', zh: '删除账号' },
  title: { en: 'Delete your account?', th: 'ลบบัญชีของคุณ?', zh: '删除你的账号？' },
  body: {
    en: 'This permanently deletes your profile, points, reviews, posts, stories, party messages and activity photos. It cannot be undone. Signing in again later starts a new, empty account.',
    th: 'ระบบจะลบโปรไฟล์ แต้ม รีวิว โพสต์ สตอรี่ ข้อความในกลุ่มทริป และรูปหลักฐานกิจกรรมของคุณอย่างถาวร กู้คืนไม่ได้ ถ้าเข้าสู่ระบบอีกครั้งภายหลังจะได้บัญชีใหม่ที่ว่างเปล่า',
    zh: '这将永久删除你的个人资料、积分、评价、帖子、动态、旅行小组消息和活动照片，且无法恢复。之后再次登录将创建一个新的空账号。',
  },
  cancel: { en: 'Cancel', th: 'ยกเลิก', zh: '取消' },
  confirm: { en: 'Delete permanently', th: 'ลบถาวร', zh: '永久删除' },
  busy: { en: 'Deleting…', th: 'กำลังลบ…', zh: '正在删除…' },
  failed: {
    en: 'Could not delete the account just now. Nothing was removed. Please try again.',
    th: 'ลบบัญชีไม่สำเร็จในตอนนี้ ยังไม่มีข้อมูลใดถูกลบ โปรดลองอีกครั้ง',
    zh: '暂时无法删除账号，没有任何内容被删除。请重试。',
  },
} as const;

export function DeleteAccountAction({ onDelete }: { onDelete: () => Promise<void> }) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  // A ref, not the `busy` state: two taps in one frame both see busy === false.
  const inFlight = React.useRef(false);

  const close = () => { if (!busy) { setOpen(false); setFailed(false); } };
  const confirm = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await onDelete();
      setOpen(false);
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t(DELETE_ACCOUNT_TEXT.action)}
        style={({ pressed }) => [
          { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14, marginTop: 8, borderRadius: radius.md },
          pressed && { backgroundColor: '#FFF5F5' },
        ]}
      >
        <Trash2 size={14} color={RED} strokeWidth={2.2} />
        <Label size={10} tracking={0.06} colour={RED}>{t(DELETE_ACCOUNT_TEXT.action)}</Label>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={{ flex: 1, backgroundColor: 'rgba(2, 43, 66, 0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={[shadow.card, { width: '100%', maxWidth: 360, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }]}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Trash2 size={26} color={RED} strokeWidth={2.2} />
            </View>
            <Heading size={18} colour={color.neutral900} style={{ textAlign: 'center', marginBottom: 8 }}>
              {t(DELETE_ACCOUNT_TEXT.title)}
            </Heading>
            <Body size={13} colour={color.neutral600} style={{ textAlign: 'center', lineHeight: 20, marginBottom: failed ? 12 : 24 }}>
              {t(DELETE_ACCOUNT_TEXT.body)}
            </Body>
            {failed ? (
              <Body size={13} colour={RED} style={{ textAlign: 'center', lineHeight: 20, marginBottom: 16 }}>
                {t(DELETE_ACCOUNT_TEXT.failed)}
              </Body>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <Pressable
                onPress={close}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={t(DELETE_ACCOUNT_TEXT.cancel)}
                style={({ pressed }) => [
                  { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
                  pressed && { backgroundColor: '#E2E8F0' },
                ]}
              >
                <Label size={11} tracking={0.06} colour={color.neutral700}>{t(DELETE_ACCOUNT_TEXT.cancel)}</Label>
              </Pressable>
              <Pressable
                onPress={() => { void confirm(); }}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={t(DELETE_ACCOUNT_TEXT.confirm)}
                accessibilityState={{ busy, disabled: busy }}
                style={({ pressed }) => [
                  { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: busy ? '#F87171' : RED },
                  pressed && { backgroundColor: '#B91C1C' },
                ]}
              >
                <Label size={11} tracking={0.06} colour="#FFFFFF">
                  {t(busy ? DELETE_ACCOUNT_TEXT.busy : DELETE_ACCOUNT_TEXT.confirm)}
                </Label>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
