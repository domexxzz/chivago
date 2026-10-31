import React from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Camera, MapPin, Navigation, Star, Store, UserRound } from 'lucide-react-native';
import { api } from '../api/client.ts';
import { shopImageUri, shopOpenNow, type ShopReview } from '../api/shops.ts';
import { useAsync } from '../state/store.tsx';
import { cachedShop, shopWithFallback } from '../offline/public-cache.ts';
import { cachedImageUri } from '../offline/image-cache.ts';
import { Button as ChivaButton } from '../components/Button.tsx';
import { t, getLocale } from '../i18n/locale.ts';
import { GuideLanguageFlag, guideLanguageLabel } from '../components/GuideLanguageFlag.tsx';

const shopCategoryText = (category: string) => {
  const values: Record<string, { en: string; th: string; zh: string }> = {
    'ที่พัก': { en: 'Accommodation', th: 'ที่พัก', zh: '住宿' }, 'ร้านอาหาร': { en: 'Restaurant', th: 'ร้านอาหาร', zh: '餐厅' },
    'ร้านขายของ': { en: 'Souvenirs & shopping', th: 'ของฝาก/ช้อปปิ้ง', zh: '伴手礼/购物' }, 'เช่ารถ': { en: 'Car rental', th: 'เช่ารถ', zh: '租车' },
    'เสริมสวย': { en: 'Beauty', th: 'เสริมสวย', zh: '美容' }, 'ตัดผม': { en: 'Haircut', th: 'ตัดผม', zh: '理发' }, 'อื่นๆ': { en: 'Other', th: 'อื่นๆ', zh: '其他' },
  };
  return t(values[category] ?? { en: category, th: category, zh: category });
};

const blue = '#0077B6';
const card = { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 14 } as const;
const field = { borderWidth: 1, borderColor: '#CDE3EA', backgroundColor: '#F5FAFC', borderRadius: 12, padding: 11, color: '#123B64', fontSize: 15 } as const;
const button = { backgroundColor: blue, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 16, alignItems: 'center' as const };

function ShopPhoto({ url, height }: { url: string | null; height: number }) {
  const [failed, setFailed] = React.useState(false);
  const [source, setSource] = React.useState<string | null>(null);
  React.useEffect(() => {
    setFailed(false);
    if (!url) { setSource(null); return; }
    let mounted = true;
    const remote = shopImageUri(url);
    setSource(remote);
    void cachedImageUri(remote).then((local) => {
      if (mounted) { setSource(local); if (local !== remote) setFailed(false); }
      else if (local.startsWith('blob:')) URL.revokeObjectURL(local);
    });
    return () => { mounted = false; };
  }, [url]);
  React.useEffect(() => () => { if (source?.startsWith('blob:')) URL.revokeObjectURL(source); }, [source]);
  return url && !failed
    ? <Image source={{ uri: source ?? shopImageUri(url) }} onError={() => setFailed(true)} style={{ height, borderRadius: 16, marginBottom: 12 }} resizeMode="cover" />
    : <View style={{ height, backgroundColor: '#DDF4FA', borderRadius: 16, marginBottom: 12, alignItems: 'center', justifyContent: 'center' }}><Store size={54} color={blue} /></View>;
}

export function ShopProfileScreen({ shopId, guest = false, onSignIn, onBack, onEdit }: { shopId: string; guest?: boolean; onSignIn?: () => void; onBack: () => void; onEdit: () => void }) {
  const [offlineStamp, setOfflineStamp] = React.useState<string | null>(null);
  const shop = useAsync(() => shopWithFallback(shopId, async () => {
    const result = await api.shop(shopId);
    setOfflineStamp(result.ok ? null : (await cachedShop(shopId))?.downloadedAt ?? null);
    return result;
  }), [shopId]);
  const own = useAsync(() => api.myShopReview(shopId), [shopId]);
  const [reviews, setReviews] = React.useState<ShopReview[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loadingReviews, setLoadingReviews] = React.useState(false);
  const [reviewsError, setReviewsError] = React.useState<string | null>(null);
  const [rating, setRating] = React.useState(5);
  const [body, setBody] = React.useState('');
  const [photo, setPhoto] = React.useState<ImagePicker.ImagePickerAsset | null>(null);
  const [reply, setReply] = React.useState<Record<string, string>>({});
  const [reporting, setReporting] = React.useState<string | null>(null);
  const [reportReason, setReportReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const { width } = useWindowDimensions();
  const canManage = !guest && shop.data?.owner === true;
  const loadReviews = React.useCallback(async (next?: string) => {
    setLoadingReviews(true); setReviewsError(null);
    const result = await api.shopReviews(shopId, next);
    if (result.ok) {
      setReviews((current) => next ? [...current, ...result.data.reviews] : result.data.reviews);
      setCursor(result.data.nextCursor);
    } else setReviewsError(result.error);
    setLoadingReviews(false);
  }, [shopId]);
  React.useEffect(() => { void loadReviews(); }, [loadReviews]);
  const mine = own.data?.review;
  React.useEffect(() => { if (mine) { setRating(mine.rating); setBody(mine.body); } }, [mine?.id, mine?.updatedAt]);

  const saveReview = async () => {
    setBusy(true); setMessage(null);
    const result = await api.saveShopReview(shopId, rating, body);
    if (!result.ok) { setMessage(result.error); setBusy(false); return; }
    if (photo) {
      try {
        const uploaded = await api.uploadShopImage(shopId, 'review', photo.uri, photo.mimeType ?? 'image/jpeg');
        if (!uploaded.ok) setMessage(`บันทึกรีวิวแล้ว แต่รูปไม่สำเร็จ: ${uploaded.error}`);
      } catch { setMessage('บันทึกรีวิวแล้ว แต่รูปอัปโหลดไม่สำเร็จ'); }
    }
    setPhoto(null); await loadReviews(); own.reload(); shop.reload(); setBusy(false);
  };
  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setMessage('กรุณาอนุญาตเข้าถึงรูปภาพ'); return; }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!picked.canceled) setPhoto(picked.assets[0] ?? null);
  };
  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true); setMessage(null);
    const result = await fn();
    if (result.ok) { await loadReviews(); own.reload(); shop.reload(); }
    else setMessage(result.error ?? 'ทำรายการไม่สำเร็จ');
    setBusy(false);
  };

  return <ScrollView style={{ flex: 1, backgroundColor: '#EAF7FB' }} contentContainerStyle={{ paddingBottom: 80 }}>
    <View style={{ backgroundColor: '#007B9B', padding: 16, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      <Pressable onPress={onBack} accessibilityLabel={t({ en: 'Back', th: 'กลับ', zh: '返回' })}><ArrowLeft color="#fff" /></Pressable>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 19 }}>{t(shop.data?.serviceType === 'guide' ? { en: 'Guide profile', th: 'โปรไฟล์ไกด์', zh: '导游资料' } : { en: 'Business profile', th: 'โปรไฟล์ร้านค้า', zh: '店铺资料' })}</Text>
    </View>
    {offlineStamp ? <Text style={{ padding: 12, backgroundColor: '#FFF3D6', color: '#684B12' }}>{t({ en: 'Offline snapshot · ratings and hours may have changed. Last updated: ', th: 'ข้อมูลออฟไลน์ · คะแนนและเวลาเปิดร้านอาจเปลี่ยนแล้ว อัปเดตล่าสุด: ', zh: '离线资料 · 评分和营业时间可能已变化。上次更新：' })}{new Date(offlineStamp).toLocaleString()}</Text> : null}
    {shop.loading && !shop.data ? <ActivityIndicator style={{ margin: 32 }} color={blue} /> : null}
    {shop.error && !shop.data ? <View style={card}><Text>{t({ en: 'Could not load this business.', th: 'โหลดข้อมูลร้านค้าไม่สำเร็จ', zh: '无法加载该店铺信息。' })}</Text><Pressable onPress={shop.reload}><Text style={{ color: blue }}>{t({ en: 'Try again', th: 'ลองใหม่', zh: '重试' })}</Text></Pressable></View> : null}
    {shop.data ? <View style={{ width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16 }}>
      <View style={card}>
        <ShopPhoto url={shop.data.coverUrl} height={210} />
        {shop.data.serviceType === 'guide' ? <View style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: '#E9F6FA', borderWidth: 3, borderColor: '#48CAE4', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginTop: -52, marginLeft: 16 }}>
          {shop.data.guideProfilePhotoUrl ? <Image source={{ uri: shopImageUri(shop.data.guideProfilePhotoUrl) }} style={{ width: 98, height: 98, borderRadius: 49 }} /> : <UserRound size={48} color={blue} />}
        </View> : null}
        <Text style={{ color: '#123B64', fontWeight: '800', fontSize: 24, marginTop: 10 }}>{shop.data.name}</Text>
        <Text style={{ color: '#52748A', marginTop: 2 }}>{shopCategoryText(shop.data.category)} · {shop.data.areaKey}</Text>
        {shop.data.serviceType === 'guide' && shop.data.guideStatus === 'approved' ? <Text style={{ alignSelf: 'flex-start', marginTop: 8, color: '#047857', backgroundColor: '#ECFDF5', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, fontWeight: '700' }}>✓ {t({ en: 'Verified Guide', th: 'ไกด์ผ่านการตรวจสอบ', zh: '已验证导游' })}</Text> : null}
        <Text style={{ color: '#D97706', fontWeight: '700', marginTop: 8 }}>★ {shop.data.rating === null ? t({ en: 'Not rated yet', th: 'ยังไม่มีคะแนน', zh: '暂无评分' }) : shop.data.rating.toFixed(1)} · {shop.data.reviewCount} {t({ en: 'reviews', th: 'รีวิว', zh: '条评价' })}</Text>
        {canManage ? <Pressable onPress={() => { if (canManage) onEdit(); }} style={[button, { marginTop: 12 }]}><Text style={{ color: '#fff' }}>{t(shop.data.serviceType === 'guide' ? { en: 'Edit guide profile', th: 'แก้ไขโปรไฟล์ไกด์', zh: '编辑导游资料' } : { en: 'Edit business', th: 'แก้ไขร้านค้า', zh: '编辑店铺' })}</Text></Pressable> : null}
      </View>
      <View style={card}>
        <Text style={{ color: '#123B64', fontWeight: '700', fontSize: 16 }}>{t(shop.data.serviceType === 'guide' ? { en: 'Guide details', th: 'ข้อมูลไกด์', zh: '导游详情' } : { en: 'Business details', th: 'ข้อมูลร้านค้า', zh: '店铺详情' })}</Text>
        <Text style={{ marginTop: 10, color: '#344F61' }}>{shop.data.description || t({ en: 'No description yet.', th: 'ยังไม่มีคำอธิบาย', zh: '暂无简介。' })}</Text>
        {shop.data.serviceType === 'guide' ? <>
          <View style={{ marginTop: 10 }}>
            <Text style={{ color: '#123B64', fontWeight: '700' }}>🗣️ {t({ en: 'Languages', th: 'ภาษาที่สื่อสารได้', zh: '可用语言' })}</Text>
            {shop.data.guideLanguages.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 }}>
              {shop.data.guideLanguages.map((language) => <View key={language} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#EDF8FB', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: '#CDEAF0' }}>
                <GuideLanguageFlag language={language} size={20} /><Text style={{ color: '#17506D', fontSize: 12, fontWeight: '700' }}>{guideLanguageLabel(language)}</Text>
              </View>)}
            </View> : <Text style={{ marginTop: 5, color: '#667D8C' }}>{t({ en: 'Not specified', th: 'ไม่ได้ระบุ', zh: '未填写' })}</Text>}
          </View>
          {shop.data.guideTourStyles.length ? <Text style={{ marginTop: 8, color: '#344F61' }}>{t({ en: 'Tour style', th: 'สไตล์การนำเที่ยว', zh: '导览风格' })}: {shop.data.guideTourStyles.map((style) => t({ en: ({ 'ทัวร์ธรรมชาติ': 'Nature', 'ดำน้ำ': 'Snorkelling', 'เดินป่า': 'Hiking', 'วัฒนธรรม/วัด': 'Culture & temples', 'อาหารท้องถิ่น': 'Local food', 'เที่ยวเกาะ': 'Island hopping' } as Record<string, string>)[style] ?? style, th: style, zh: ({ 'ทัวร์ธรรมชาติ': '自然生态', 'ดำน้ำ': '浮潜', 'เดินป่า': '徒步', 'วัฒนธรรม/วัด': '文化与寺庙', 'อาหารท้องถิ่น': '当地美食', 'เที่ยวเกาะ': '跳岛游' } as Record<string, string>)[style] ?? style })).join(', ')}</Text> : null}
          {shop.data.guideSkills.length ? <View style={{ marginTop: 8 }}><Text style={{ color: '#123B64', fontWeight: '700' }}>{t({ en: 'Skills', th: 'ความสามารถ', zh: '技能' })}</Text>{shop.data.guideSkills.map((skill, index) => <Text key={`${skill}-${index}`} style={{ marginTop: 3, color: '#344F61' }}>• {skill}</Text>)}</View> : null}
        </> : <>
          <Text style={{ marginTop: 10 }}>📍 {shop.data.address || t({ en: 'Address not provided', th: 'ยังไม่มีที่อยู่', zh: '未填写地址' })}{shop.data.lat !== null && shop.data.lng !== null ? ` (${shop.data.lat.toFixed(5)}, ${shop.data.lng.toFixed(5)})` : ''}</Text>
          <Text style={{ marginTop: 8 }}>🕒 {shop.data.openingHours || t({ en: 'Hours not provided', th: 'ยังไม่ระบุเวลา', zh: '未填写营业时间' })} · {offlineStamp ? t({ en: 'Current status unavailable offline', th: 'ตรวจสอบสถานะปัจจุบันไม่ได้ขณะออฟไลน์', zh: '离线时无法确认当前状态' }) : shopOpenNow(shop.data.openingHours) ? t({ en: 'Open now', th: 'เปิดอยู่', zh: '营业中' }) : t({ en: 'Closed / unknown', th: 'ปิดอยู่/ไม่ระบุ', zh: '已打烊/不确定' })}</Text>
        </>}
        {shop.data.phone ? <Text style={{ marginTop: 8 }}>{t({ en: 'Phone', th: 'โทร', zh: '电话' })}: {shop.data.phone}</Text> : null}
        {shop.data.serviceType === 'guide' && shop.data.guideLineId ? <Text style={{ marginTop: 8 }}>LINE ID: {shop.data.guideLineId}</Text> : null}
        {shop.data.email ? <Text style={{ marginTop: 8 }}>{t({ en: 'Email', th: 'อีเมล', zh: '邮箱' })}: {shop.data.email}</Text> : null}
        {shop.data.serviceType !== 'guide' && shop.data.amenities.length ? <Text style={{ marginTop: 8 }}>{t({ en: 'Amenities', th: 'สิ่งอำนวยความสะดวก', zh: '设施' })}: {shop.data.amenities.join(', ')}</Text> : null}
        {shop.data.lat !== null && shop.data.lng !== null ? <Pressable onPress={() => void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${shop.data!.lat},${shop.data!.lng}`)} style={[button, { marginTop: 14, flexDirection: 'row', justifyContent: 'center', gap: 6 }]}><Navigation size={16} color="#fff" /><Text style={{ color: '#fff' }}>{t({ en: 'Get directions', th: 'นำทาง', zh: '导航' })}</Text></Pressable> : null}
      </View>
      {shop.data.images.length > 0 ? <ScrollView horizontal style={{ marginBottom: 14 }} contentContainerStyle={{ gap: 8 }}>
        {shop.data.images.map((img) => <Image key={img.id} source={{ uri: shopImageUri(img.url) }} style={{ width: Math.min(width * 0.55, 220), height: 145, borderRadius: 14 }} />)}
      </ScrollView> : null}
      {guest ? <View style={[card, { backgroundColor: '#F1FAFD', borderWidth: 1, borderColor: '#CDEAF2' }]}>
        <Text style={{ fontWeight: '700', color: '#123B64', fontSize: 17 }}>{t({ en: 'Sign in to review this business', th: 'เข้าสู่ระบบเพื่อเขียนรีวิวร้านนี้', zh: '登录后评价该店铺' })}</Text>
        <Text style={{ color: '#52748A', marginTop: 6 }}>{t({ en: 'Create an account or sign in to review and report inappropriate content.', th: 'สมัครสมาชิกหรือเข้าสู่ระบบเพื่อรีวิวและรายงานเนื้อหาที่ไม่เหมาะสม', zh: '注册或登录后即可发表评价并举报不当内容。' })}</Text>
        <ChivaButton label="Sign in to review" thai="เข้าสู่ระบบเพื่อเขียนรีวิว" onPress={() => onSignIn?.()} style={{ marginTop: 12 }} />
      </View> : null}
      {!guest && !shop.data.owner ? <View style={card}>
        <Text style={{ fontWeight: '700', color: '#123B64', fontSize: 17 }}>{mine ? t({ en: 'Edit your review', th: 'แก้ไขรีวิวของคุณ', zh: '编辑我的评价' }) : t({ en: 'Write a review', th: 'เขียนรีวิว', zh: '写评价' })}</Text>
        <View style={{ flexDirection: 'row', marginVertical: 10 }}>{[1, 2, 3, 4, 5].map((n) => <Pressable key={n} onPress={() => setRating(n)} accessibilityLabel={`${n} ดาว`} style={{ paddingRight: 8 }}><Star size={30} color="#F59E0B" fill={n <= rating ? '#F59E0B' : 'transparent'} /></Pressable>)}</View>
        <TextInput multiline value={body} onChangeText={setBody} placeholder={t({ en: 'Share your experience', th: 'เล่าประสบการณ์ที่ร้านนี้', zh: '分享您的体验' })} style={[field, { minHeight: 85, textAlignVertical: 'top' }]} />
        <Pressable onPress={() => void pickPhoto()} style={{ paddingVertical: 10, flexDirection: 'row', gap: 6 }}><Camera size={17} color={blue} /><Text style={{ color: blue }}>{photo ? t({ en: 'Photo selected (tap to change)', th: 'เลือกรูปแล้ว (แตะเพื่อเปลี่ยน)', zh: '已选择照片（点击可更换）' }) : t({ en: 'Add a review photo', th: 'แนบรูปรีวิว', zh: '添加评价照片' })}</Text></Pressable>
        <Pressable disabled={busy} onPress={() => void saveReview()} style={button}><Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? t({ en: 'Saving…', th: 'กำลังบันทึก...', zh: '保存中…' }) : mine ? t({ en: 'Save review changes', th: 'บันทึกการแก้ไขรีวิว', zh: '保存评价修改' }) : t({ en: 'Submit review', th: 'ส่งรีวิว', zh: '提交评价' })}</Text></Pressable>
        {mine ? <Pressable disabled={busy} onPress={() => void act(() => api.deleteShopReview(shopId))} style={{ padding: 10 }}><Text style={{ color: '#B91C1C', textAlign: 'center' }}>{t({ en: 'Delete my review', th: 'ลบรีวิวของฉัน', zh: '删除我的评价' })}</Text></Pressable> : null}
      </View> : null}
      <View style={card}>
        <Text style={{ fontWeight: '700', fontSize: 17, color: '#123B64' }}>{t({ en: 'Reviews', th: 'รีวิว', zh: '评价' })} ({shop.data.reviewCount})</Text>
        {loadingReviews && !reviews.length ? <ActivityIndicator color={blue} style={{ margin: 16 }} /> : null}
        {reviewsError ? <Pressable onPress={() => void loadReviews()}><Text style={{ color: '#B91C1C' }}>{reviewsError} · ลองใหม่</Text></Pressable> : null}
        {!loadingReviews && !reviewsError && !reviews.length ? <Text style={{ color: '#64748B', marginTop: 12 }}>{t({ en: 'No reviews yet.', th: 'ยังไม่มีรีวิว', zh: '暂无评价。' })}</Text> : null}
        {reviews.map((r) => <View key={r.id} style={{ borderTopWidth: 1, borderColor: '#E1ECF0', paddingVertical: 12, marginTop: 8 }}>
          <Text style={{ fontWeight: '700', color: '#123B64' }}>{r.author} · {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</Text>
          <Text style={{ fontSize: 12, color: '#64748B' }}>{new Date(r.createdAt).toLocaleDateString(getLocale() === 'th' ? 'th-TH' : 'en-US')}</Text>
          <Text style={{ marginTop: 7, color: '#334155' }}>{r.body}</Text>
          {r.photoUrl ? <Image source={{ uri: shopImageUri(r.photoUrl) }} style={{ width: 150, height: 120, borderRadius: 12, marginTop: 8 }} /> : null}
          {r.ownerReply ? <Text style={{ backgroundColor: '#EAF7FB', padding: 10, borderRadius: 10, marginTop: 8 }}>{t({ en: 'Business replied', th: 'ร้านค้าตอบ', zh: '商家回复' })}: {r.ownerReply}</Text> : null}
          {canManage ? <View style={{ marginTop: 8 }}><TextInput value={reply[r.id] ?? ''} onChangeText={(v) => setReply((prev) => ({ ...prev, [r.id]: v }))} placeholder={t({ en: 'Reply to review', th: 'ตอบกลับรีวิว', zh: '回复评价' })} style={field} /><Pressable disabled={busy || !reply[r.id]?.trim()} onPress={() => { if (canManage) void act(() => api.replyShopReview(shopId, r.id, reply[r.id]!)); }} style={{ padding: 8 }}><Text style={{ color: blue }}>{t({ en: 'Send reply', th: 'ส่งคำตอบ', zh: '发送回复' })}</Text></Pressable></View> : null}
          {!guest && !r.mine ? reporting === r.id ? <View style={{ marginTop: 10 }}><TextInput value={reportReason} onChangeText={setReportReason} placeholder={t({ en: 'Reason for report', th: 'ระบุเหตุผลที่รายงาน', zh: '举报原因' })} style={field} /><View style={{ flexDirection: 'row', gap: 16, paddingTop: 8 }}><Pressable disabled={busy || reportReason.trim().length < 3} onPress={() => { void act(() => api.reportShopReview(shopId, r.id, reportReason)); setReporting(null); setReportReason(''); }}><Text style={{ color: blue }}>{t({ en: 'Submit report', th: 'ส่งรายงาน', zh: '提交举报' })}</Text></Pressable><Pressable onPress={() => setReporting(null)}><Text>{t({ en: 'Cancel', th: 'ยกเลิก', zh: '取消' })}</Text></Pressable></View></View> : <Pressable disabled={busy} onPress={() => setReporting(r.id)} style={{ paddingTop: 10 }}><Text style={{ color: '#64748B', fontSize: 12 }}>{t({ en: 'Report inappropriate review', th: 'รายงานรีวิวไม่เหมาะสม', zh: '举报不当评价' })}</Text></Pressable> : null}
        </View>)}
        {cursor ? <Pressable disabled={loadingReviews} onPress={() => void loadReviews(cursor)} style={{ padding: 10 }}><Text style={{ color: blue, textAlign: 'center' }}>{t({ en: 'Load more reviews', th: 'โหลดรีวิวเพิ่มเติม', zh: '加载更多评价' })}</Text></Pressable> : null}
      </View>
      {message ? <Text style={{ color: '#B91C1C', marginBottom: 15 }}>{message}</Text> : null}
    </View> : null}
  </ScrollView>;
}
