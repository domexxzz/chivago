/**
 * The owner's half of "redeem points at a shop": the rewards this shop offers
 * for Trip Points, and the counter where a traveller's code is checked and
 * marked used.
 *
 * Lives beside the profile form rather than inside it, because a reward is
 * saved on its own the moment it is added - it is not part of "Save profile",
 * and an owner who edits a price should not have to resubmit their address.
 *
 * The counter asks twice on purpose: CHECK shows what the code is for and
 * whether it is still good, and only then does HAND OVER mark it used. A
 * single button would mark a voucher used before anybody had read which
 * reward it was for.
 */

import React from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Gift, ScanLine } from 'lucide-react-native';
import { api, type CounterVoucher, type ShopReward } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { t } from '../i18n/locale.ts';

const blue = '#0077B6';
const ink = '#123B64';
const input = { borderWidth: 1, borderColor: '#CDE3EA', borderRadius: 12, backgroundColor: '#F7FBFC', padding: 11, fontSize: 15, color: ink } as const;

/** The published bounds, repeated here only as hints - the server refuses outside them. */
const MIN_POINTS = 50;
const MAX_POINTS = 5000;

type Draft = { id?: string; name: string; costPoints: string; valueTHB: string; available: boolean };
const emptyDraft = (): Draft => ({ name: '', costPoints: '', valueTHB: '', available: true });

const statusText = (v: CounterVoucher): { text: string; ok: boolean } => {
  if (v.status === 'active') return { ok: true, text: t({ en: 'Valid · not used yet', th: 'ใช้ได้ · ยังไม่ถูกใช้', zh: '有效 · 尚未使用' }) };
  if (v.status === 'redeemed') return { ok: false, text: t({ en: 'Already used', th: 'ใช้ไปแล้ว', zh: '已使用' }) };
  if (v.status === 'expired') return { ok: false, text: t({ en: 'Expired', th: 'หมดอายุแล้ว', zh: '已过期' }) };
  return { ok: false, text: t({ en: 'Cancelled', th: 'ถูกยกเลิก', zh: '已取消' }) };
};

export function ShopRewardsPanel({ shopId }: { shopId: string }) {
  const rewards = useAsync(() => api.shopRewards(shopId), [shopId]);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<{ text: string; ok: boolean } | null>(null);

  const [code, setCode] = React.useState('');
  const [checked, setChecked] = React.useState<CounterVoucher | null>(null);

  const saveDraft = async (next: Draft) => {
    setBusy(true); setNote(null);
    const result = await api.saveShopReward(shopId, {
      name: next.name,
      costPoints: Number(next.costPoints),
      valueTHB: next.valueTHB.trim() ? Number(next.valueTHB) : null,
      available: next.available,
    }, next.id);
    setBusy(false);
    if (!result.ok) { setNote({ text: result.error, ok: false }); return; }
    setDraft(null);
    setNote({ text: t({ en: 'Reward saved.', th: 'บันทึกของรางวัลแล้ว', zh: '奖励已保存。' }), ok: true });
    rewards.reload();
  };

  const toggle = (r: ShopReward) => void saveDraft({
    id: r.id, name: r.name, costPoints: String(r.costPoints), valueTHB: r.valueTHB === null ? '' : String(r.valueTHB), available: !r.available,
  });

  const check = async () => {
    if (!code.trim()) return;
    setBusy(true); setNote(null); setChecked(null);
    const result = await api.shopVoucher(shopId, code);
    setBusy(false);
    if (!result.ok) { setNote({ text: result.error, ok: false }); return; }
    setChecked(result.data);
  };

  const handOver = async () => {
    if (!checked) return;
    setBusy(true); setNote(null);
    const result = await api.redeemShopVoucher(shopId, checked.code);
    setBusy(false);
    if (!result.ok) { setNote({ text: result.error, ok: false }); return; }
    setChecked(result.data);
    setNote(result.data.alreadyRedeemed
      ? { text: t({ en: 'This code was already used.', th: 'รหัสนี้ถูกใช้ไปแล้ว', zh: '此兑换码已被使用。' }), ok: false }
      : { text: t({ en: `Done. Hand over: ${result.data.rewardName}`, th: `เรียบร้อย ส่งมอบ: ${result.data.rewardName}`, zh: `完成，请交付：${result.data.rewardName}` }), ok: true });
    setCode('');
  };

  return (
    <View style={{ marginTop: 18, gap: 14 }}>
      {/* The counter first: on a busy day it is the half an owner opens this for. */}
      <View style={{ backgroundColor: '#F0F9FD', borderRadius: 16, padding: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ScanLine size={18} color={blue} />
          <Text style={{ color: blue, fontSize: 15, fontWeight: '800' }}>{t({ en: 'Accept a voucher', th: 'รับคูปองจากลูกค้า', zh: '核销兑换券' })}</Text>
        </View>
        <Text style={{ color: '#4B6478', fontSize: 13 }}>
          {t({
            en: 'Type the code under the traveller’s QR, or scan the QR with your camera app and paste what it reads.',
            th: 'กรอกรหัสใต้ QR ของลูกค้า หรือสแกน QR ด้วยแอปกล้องแล้ววางข้อความที่อ่านได้',
            zh: '输入旅客二维码下方的兑换码，或用相机扫描二维码后粘贴读取到的内容。',
          })}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={code}
            onChangeText={(v) => { setCode(v); setChecked(null); }}
            onSubmitEditing={() => void check()}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="CG-XXXXXXXX"
            accessibilityLabel={t({ en: 'Voucher code', th: 'รหัสคูปอง', zh: '兑换码' })}
            style={[input, { flex: 1, letterSpacing: 1 }]}
          />
          <Pressable onPress={() => void check()} disabled={busy || !code.trim()} accessibilityRole="button"
            style={{ backgroundColor: code.trim() ? blue : '#9CBAC7', borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{t({ en: 'Check', th: 'ตรวจสอบ', zh: '查验' })}</Text>
          </Pressable>
        </View>
        {checked ? (
          <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 12, gap: 4, borderWidth: 1, borderColor: statusText(checked).ok ? '#86EFAC' : '#FCA5A5' }}>
            <Text style={{ color: ink, fontWeight: '800', fontSize: 16 }}>{checked.rewardName}</Text>
            <Text style={{ color: '#4B6478' }}>
              {checked.code}{checked.valueTHB !== null ? ` · ${t({ en: `worth ฿${checked.valueTHB}`, th: `มูลค่า ${checked.valueTHB} บาท`, zh: `价值 ฿${checked.valueTHB}` })}` : ''}
            </Text>
            <Text style={{ color: statusText(checked).ok ? '#15803D' : '#B91C1C', fontWeight: '700' }}>{statusText(checked).text}</Text>
            {checked.status === 'active' ? (
              <Pressable onPress={() => void handOver()} disabled={busy} accessibilityRole="button"
                style={{ backgroundColor: '#15803D', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 6, opacity: busy ? 0.6 : 1 }}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>{t({ en: 'Hand over and mark used', th: 'ส่งมอบและยืนยันการใช้', zh: '交付并确认使用' })}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Gift size={18} color={blue} />
          <Text style={{ color: blue, fontSize: 15, fontWeight: '800', flex: 1 }}>{t({ en: 'Rewards for Trip Points', th: 'ของรางวัลแลกแต้มทริป', zh: '旅行积分兑换奖励' })}</Text>
          {!draft ? (
            <Pressable onPress={() => setDraft(emptyDraft())} accessibilityRole="button"><Text style={{ color: blue, fontWeight: '700' }}>+ {t({ en: 'Add', th: 'เพิ่ม', zh: '添加' })}</Text></Pressable>
          ) : null}
        </View>
        <Text style={{ color: '#4B6478', fontSize: 13 }}>
          {t({
            en: 'Travellers earn Trip Points by checking in, walking, reviewing and doing quests, and spend them here. Nobody can buy them, and there is no luck in it.',
            th: 'นักท่องเที่ยวได้แต้มทริปจากการเช็กอิน เดิน รีวิว และทำเควส แล้วนำมาแลกที่ร้านคุณ แต้มซื้อด้วยเงินไม่ได้ และไม่มีการสุ่ม',
            zh: '旅客通过签到、步行、评价和任务获得旅行积分，并在此兑换。积分不能购买，也没有抽奖成分。',
          })}
        </Text>
        {rewards.loading && !rewards.data ? <ActivityIndicator color={blue} /> : null}
        {rewards.error ? <Text style={{ color: '#B91C1C' }}>{rewards.error}</Text> : null}
        {rewards.data?.length === 0 && !draft ? (
          <Text style={{ color: '#64748B' }}>{t({ en: 'No rewards yet. Add a drink, a discount or a small gift.', th: 'ยังไม่มีของรางวัล ลองเพิ่มเครื่องดื่ม ส่วนลด หรือของที่ระลึกเล็กๆ', zh: '还没有奖励。可以添加饮品、折扣或小礼物。' })}</Text>
        ) : null}
        {rewards.data?.map((r) => (
          <View key={r.id} style={{ backgroundColor: r.available ? '#fff' : '#F1F5F9', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#D7EAF0', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: ink, fontWeight: '700' }}>{r.name}</Text>
              <Text style={{ color: '#4B6478', fontSize: 13 }}>
                {t({ en: `${r.costPoints} Trip Points`, th: `${r.costPoints} แต้มทริป`, zh: `${r.costPoints} 旅行积分` })}
                {r.valueTHB !== null ? ` · ฿${r.valueTHB}` : ''}
                {r.available ? '' : ` · ${t({ en: 'Hidden', th: 'ซ่อนอยู่', zh: '已隐藏' })}`}
              </Text>
            </View>
            <Pressable onPress={() => setDraft({ id: r.id, name: r.name, costPoints: String(r.costPoints), valueTHB: r.valueTHB === null ? '' : String(r.valueTHB), available: r.available })} accessibilityRole="button">
              <Text style={{ color: blue }}>{t({ en: 'Edit', th: 'แก้ไข', zh: '编辑' })}</Text>
            </Pressable>
            <Pressable onPress={() => toggle(r)} disabled={busy} accessibilityRole="switch" accessibilityState={{ checked: r.available }}>
              <Text style={{ color: r.available ? '#B45309' : '#15803D' }}>{r.available ? t({ en: 'Hide', th: 'ซ่อน', zh: '隐藏' }) : t({ en: 'Show', th: 'แสดง', zh: '显示' })}</Text>
            </Pressable>
          </View>
        ))}
        {draft ? (
          <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 12, gap: 8, borderWidth: 1, borderColor: '#9CD3E4' }}>
            <TextInput value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} placeholder={t({ en: 'Reward name, e.g. Iced coffee', th: 'ชื่อของรางวัล เช่น กาแฟเย็น 1 แก้ว', zh: '奖励名称，例如：冰咖啡一杯' })} style={input} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput value={draft.costPoints} onChangeText={(v) => setDraft({ ...draft, costPoints: v.replace(/[^0-9]/g, '') })} keyboardType="number-pad"
                placeholder={t({ en: `Trip Points (${MIN_POINTS}-${MAX_POINTS})`, th: `แต้มทริป (${MIN_POINTS}-${MAX_POINTS})`, zh: `旅行积分（${MIN_POINTS}-${MAX_POINTS}）` })} style={[input, { flex: 1 }]} />
              <TextInput value={draft.valueTHB} onChangeText={(v) => setDraft({ ...draft, valueTHB: v.replace(/[^0-9]/g, '') })} keyboardType="number-pad"
                placeholder={t({ en: 'Worth ฿ (optional)', th: 'มูลค่า บาท (ไม่บังคับ)', zh: '价值 ฿（选填）' })} style={[input, { flex: 1 }]} />
            </View>
            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
              <Pressable onPress={() => setDraft(null)} style={{ padding: 10 }}><Text style={{ color: '#64748B' }}>{t({ en: 'Cancel', th: 'ยกเลิก', zh: '取消' })}</Text></Pressable>
              <Pressable onPress={() => void saveDraft(draft)} disabled={busy} accessibilityRole="button" style={{ backgroundColor: blue, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10, opacity: busy ? 0.6 : 1 }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{t({ en: 'Save reward', th: 'บันทึกของรางวัล', zh: '保存奖励' })}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
      {note ? <Text style={{ color: note.ok ? '#15803D' : '#B91C1C' }}>{note.text}</Text> : null}
    </View>
  );
}

/**
 * The traveller's half: what this shop gives for Trip Points, and the code to
 * show at the counter once one is redeemed.
 *
 * Nothing renders for a shop with no rewards, so a profile does not grow an
 * empty box. A guest is shown nothing either - the list is behind a device
 * key like the market it comes from - and the profile already carries its own
 * sign-in prompt.
 */
export function ShopRewardsForTravellers({ shopId, guest }: { shopId: string; guest: boolean }) {
  const rewards = useAsync(
    () => guest ? Promise.resolve({ ok: true as const, data: [] as ShopReward[] }) : api.shopRewards(shopId),
    [shopId, guest],
  );
  const [busy, setBusy] = React.useState<string | null>(null);
  const [voucher, setVoucher] = React.useState<{ code: string; name: string; expiresAt: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  if (!rewards.data?.length) return null;

  const redeem = async (r: ShopReward) => {
    setBusy(r.id); setError(null);
    const result = await api.redeem(r.id);
    setBusy(null);
    if (!result.ok) { setError(result.error); return; }
    setVoucher({ code: result.data.voucher.code, name: r.name, expiresAt: result.data.voucher.expiresAt });
  };

  return (
    <View style={{ backgroundColor: '#FFFFFF', borderRadius: 22, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#DCECF2', gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Gift size={18} color={blue} />
        <Text style={{ color: ink, fontWeight: '800', fontSize: 16 }}>{t({ en: 'Redeem your Trip Points here', th: 'แลกแต้มทริปที่ร้านนี้', zh: '在本店兑换旅行积分' })}</Text>
      </View>
      {voucher ? (
        <View style={{ alignItems: 'center', gap: 8, backgroundColor: '#F0F9FD', borderRadius: 16, padding: 14 }}>
          <Text style={{ color: ink, fontWeight: '700' }}>{voucher.name}</Text>
          <View style={{ padding: 10, backgroundColor: '#fff', borderRadius: 12 }}><QRCode value={voucher.code} size={150} color={ink} /></View>
          <Text style={{ color: ink, fontSize: 22, fontWeight: '800', letterSpacing: 1.5 }}>{voucher.code}</Text>
          <Text style={{ color: '#4B6478', textAlign: 'center', fontSize: 13 }}>
            {t({
              en: 'Show this at the counter. The shop checks it and marks it used. It is also saved in your Backpack.',
              th: 'แสดงหน้านี้ที่เคาน์เตอร์ ร้านจะตรวจและยืนยันการใช้ คูปองนี้ถูกเก็บไว้ในกระเป๋าของคุณด้วย',
              zh: '请在柜台出示。店家查验后确认使用。此兑换券也已保存在背包中。',
            })}
          </Text>
          <Pressable onPress={() => setVoucher(null)} style={{ padding: 6 }}><Text style={{ color: blue }}>{t({ en: 'Done', th: 'เสร็จสิ้น', zh: '完成' })}</Text></Pressable>
        </View>
      ) : rewards.data.map((r) => (
        <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#E1ECF0', paddingTop: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: ink, fontWeight: '700' }}>{r.name}</Text>
            <Text style={{ color: '#4B6478', fontSize: 13 }}>
              {t({ en: `${r.costPoints} Trip Points`, th: `${r.costPoints} แต้มทริป`, zh: `${r.costPoints} 旅行积分` })}{r.valueTHB !== null ? ` · ฿${r.valueTHB}` : ''}
            </Text>
          </View>
          <Pressable onPress={() => void redeem(r)} disabled={busy !== null} accessibilityRole="button"
            accessibilityLabel={t({ en: `Redeem ${r.name} for ${r.costPoints} Trip Points`, th: `แลก ${r.name} ด้วย ${r.costPoints} แต้มทริป`, zh: `用 ${r.costPoints} 旅行积分兑换${r.name}` })}
            style={{ backgroundColor: blue, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, opacity: busy === r.id ? 0.6 : 1 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{busy === r.id ? '…' : t({ en: 'Redeem', th: 'แลก', zh: '兑换' })}</Text>
          </Pressable>
        </View>
      ))}
      {error ? <Text style={{ color: '#B91C1C' }}>{error}</Text> : null}
    </View>
  );
}
