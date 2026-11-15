import { useDetailScroll, type DetailScrollState } from '../state/detail-scroll.ts';
import React from 'react';
import { ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { AlertTriangle, ArrowLeft, Camera, Clock, Flag, Mail, MapPin, MessageCircle, Navigation, Phone, Star, Store, Trash2, UserRound, X } from 'lucide-react-native';
import { mapsDirectionsUrl } from '@chivago/core';
import { api } from '../api/client.ts';
import { shopImageUri, shopOpenNow, type ShopReview } from '../api/shops.ts';
import { useAsync } from '../state/store.tsx';
import { cachedShop, shopWithFallback } from '../offline/public-cache.ts';
import { cachedImageUri } from '../offline/image-cache.ts';
import { Button as ChivaButton } from '../components/Button.tsx';
import { ratingMeaning } from '../components/review-copy.ts';
import { t } from '../i18n/locale.ts';
import { formatDate, formatDateTime } from '../i18n/format.ts';
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
const card = { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#DCECF2', boxShadow: '0 8px 24px rgba(18,59,100,0.08)' } as const;
const field = { borderWidth: 1, borderColor: '#C7DFE8', backgroundColor: '#F7FBFC', borderRadius: 14, padding: 13, color: '#123B64', fontSize: 15 } as const;
const button = { backgroundColor: blue, minHeight: 48, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 15, alignItems: 'center' as const, justifyContent: 'center' as const };

function ShopPhoto({ url, height, hero = false, guide = false }: { url: string | null; height: number; hero?: boolean; guide?: boolean }) {
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
    ? <Image source={{ uri: source ?? shopImageUri(url) }} onError={() => setFailed(true)} style={{ width: '100%', height, borderRadius: hero ? 0 : 16, marginBottom: hero ? 0 : 12 }} resizeMode="cover" />
    : <View style={{ width: '100%', height, backgroundColor: guide ? '#D8F1F4' : '#DDF4FA', borderRadius: hero ? 0 : 16, marginBottom: hero ? 0 : 12, alignItems: 'center', justifyContent: 'center' }}>{guide ? <UserRound size={64} color={blue} /> : <Store size={54} color={blue} />}</View>;
}

export function ShopProfileScreen({ shopId, guest = false, onSignIn, onBack, onEdit, onNavigate, scrollState }: {
  scrollState?: DetailScrollState; shopId: string; guest?: boolean; onSignIn?: () => void;
  onBack: () => void; onEdit: () => void;
  /**
   * Take the traveller to this business on the app's own map.
   *
   * Optional, and the button is complete without it: a build with no
   * navigator - or a shop screen rendered somewhere that cannot push a
   * route - still offers the Google Maps handoff it always did, which is
   * the line below the button rather than the button itself.
   */
  onNavigate?: (destination: { id: string; name: string; lat: number; lng: number }) => void;
}) {
  const [offlineStamp, setOfflineStamp] = React.useState<string | null>(null);
  const shop = useAsync(() => shopWithFallback(shopId, async () => {
    const result = await api.shop(shopId);
    setOfflineStamp(result.ok ? null : (await cachedShop(shopId))?.downloadedAt ?? null);
    return result;
  }), [shopId]);
  const scroll = useDetailScroll(scrollState, shop.data !== null);
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
  const actionLock = React.useRef(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [messageTone, setMessageTone] = React.useState<'success' | 'error' | 'warning'>('error');
  const { width } = useWindowDimensions();
  const canManage = !guest && shop.data?.owner === true;
  const loadReviews = React.useCallback(async (next?: string) => {
    setLoadingReviews(true); setReviewsError(null);
    try {
    const result = await api.shopReviews(shopId, next);
    if (result.ok) {
      setReviews((current) => next ? [...current, ...result.data.reviews] : result.data.reviews);
      setCursor(result.data.nextCursor);
    } else setReviewsError(result.error);
    } catch { setReviewsError(t({ en: 'Could not load reviews.', th: 'โหลดรีวิวไม่สำเร็จ', zh: '无法加载评价。' })); }
    finally { setLoadingReviews(false); }
  }, [shopId]);
  React.useEffect(() => { void loadReviews(); }, [loadReviews]);
  const mine = own.data?.review;
  React.useEffect(() => { if (mine) { setRating(mine.rating); setBody(mine.body); } }, [mine?.id, mine?.updatedAt]);

  const failureText = () => t({ en: 'Could not save. Your draft is kept; please try again.', th: 'บันทึกไม่สำเร็จ ข้อมูลที่กรอกยังอยู่ กรุณาลองใหม่', zh: '保存失败，草稿已保留，请重试。' });
  const saveReview = async () => {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setMessage(null); setMessageTone('error');
    let reviewSaved = false;
    try {
      const result = await api.saveShopReview(shopId, rating, body);
      if (!result.ok) { setMessageTone('error'); setMessage(result.error); return; }
      reviewSaved = true;
      if (photo) {
        const uploaded = await api.uploadShopImage(shopId, 'review', photo.uri, photo.mimeType ?? 'image/jpeg');
        if (!uploaded.ok) { setMessageTone('warning'); setMessage(t({ en: 'Review saved, but photo upload failed. Your photo is kept for retry.', th: 'บันทึกรีวิวแล้ว แต่อัปโหลดรูปไม่สำเร็จ รูปที่เลือกยังอยู่เพื่อให้ลองใหม่', zh: '评价已保存，但图片上传失败。图片已保留，可重试。' })); return; }
      }
      setPhoto(null); own.reload(); shop.reload(); await loadReviews();
      setMessageTone('success'); setMessage(t({ en: 'Review saved.', th: 'บันทึกรีวิวแล้ว', zh: '评价已保存。' }));
    } catch { setMessageTone(reviewSaved ? 'warning' : 'error'); setMessage(reviewSaved ? t({ en: 'Review saved, but photo upload failed. Your photo is kept for retry.', th: 'บันทึกรีวิวแล้ว แต่อัปโหลดรูปไม่สำเร็จ รูปที่เลือกยังอยู่เพื่อให้ลองใหม่', zh: '评价已保存，但图片上传失败。图片已保留，可重试。' }) : failureText()); }
    finally { actionLock.current = false; setBusy(false); }
  };
  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setMessageTone('warning'); setMessage(t({ en: 'Allow photo access to attach an image.', th: 'กรุณาอนุญาตเข้าถึงรูปภาพเพื่อแนบรูปรีวิว', zh: '请允许访问照片以添加图片。' })); return; }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!picked.canceled) setPhoto(picked.assets[0] ?? null);
  };
  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>, onSuccess?: () => void) => {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setMessage(null);
    try {
      const result = await fn();
      if (!result.ok) { setMessageTone('error'); setMessage(result.error ?? failureText()); return; }
      onSuccess?.(); own.reload(); shop.reload(); await loadReviews();
    } catch { setMessageTone('error'); setMessage(failureText()); }
    finally { actionLock.current = false; setBusy(false); }
  };
  const reviewLabel = shop.data?.serviceType === 'guide'
    ? t({ en: 'Review this guide', th: 'รีวิวไกด์คนนี้', zh: '评价此导游' })
    : t({ en: 'Review this service', th: 'รีวิวบริการนี้', zh: '评价此服务' });

  return <ScrollView {...scroll} style={{ flex: 1, backgroundColor: '#EAF7FB' }} contentContainerStyle={{ paddingBottom: 80 }}>
    {offlineStamp ? <Text style={{ padding: 12, backgroundColor: '#FFF3D6', color: '#684B12' }}>{t({ en: 'Offline snapshot · ratings and hours may have changed. Last updated: ', th: 'ข้อมูลออฟไลน์ · คะแนนและเวลาเปิดร้านอาจเปลี่ยนแล้ว อัปเดตล่าสุด: ', zh: '离线资料 · 评分和营业时间可能已变化。上次更新：' })}{formatDateTime(offlineStamp)}</Text> : null}
    {shop.loading && !shop.data ? <View><Pressable onPress={onBack} accessibilityLabel={t({ en: 'Back', th: 'กลับ', zh: '返回' })} style={{ margin: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}><ArrowLeft color="#004E64" /></Pressable><ActivityIndicator style={{ margin: 32 }} color={blue} /></View> : null}
    {shop.error && !shop.data ? <View style={{ padding: 16 }}><Pressable onPress={onBack} accessibilityLabel={t({ en: 'Back', th: 'กลับ', zh: '返回' })} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><ArrowLeft color="#004E64" /></Pressable><View style={card}><Text>{t({ en: 'Could not load this business.', th: 'โหลดข้อมูลร้านค้าไม่สำเร็จ', zh: '无法加载该店铺信息。' })}</Text><Pressable onPress={shop.reload}><Text style={{ color: blue }}>{t({ en: 'Try again', th: 'ลองใหม่', zh: '重试' })}</Text></Pressable></View></View> : null}
    {shop.data ? <View style={{ width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16 }}>
      <View style={[card, { padding: 0, overflow: 'hidden' }]}>
        <View style={{ position: 'relative' }}>
          <ShopPhoto
            url={shop.data.serviceType === 'guide' ? shop.data.coverUrl ?? shop.data.guideProfilePhotoUrl : shop.data.coverUrl}
            height={shop.data.serviceType === 'guide' ? 330 : 285}
            hero
            guide={shop.data.serviceType === 'guide'}
          />
          {shop.data.serviceType === 'guide' ? <View style={{ position: 'absolute', left: 18, right: 18, bottom: 18, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ backgroundColor: 'rgba(4,48,64,0.82)', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' }}>
              <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800', letterSpacing: 0.4 }}>{t({ en: 'Tour guide', th: 'ไกด์นำเที่ยว', zh: '导游' })}</Text>
            </View>
          </View> : null}
          <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={t({ en: 'Back', th: 'กลับ', zh: '返回' })} style={({ pressed }) => ({ position: 'absolute', top: 16, left: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.94)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}><ArrowLeft color="#004E64" size={23} strokeWidth={2.4} /></Pressable>
        </View>
        <View style={{ padding: 18 }}>
          <Text style={{ color: '#123B64', fontWeight: '800', fontSize: 25 }}>{shop.data.name}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
            <Text style={{ color: '#087B9E', backgroundColor: '#E1F7F4', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, fontWeight: '700', fontSize: 12 }}>{shopCategoryText(shop.data.category)}</Text>
            <Text style={{ color: '#52748A', backgroundColor: '#EFF7FA', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, fontWeight: '600', fontSize: 12 }}>{shop.data.areaKey}</Text>
          </View>
          {shop.data.serviceType === 'guide' && shop.data.guideStatus === 'approved' ? <Text style={{ alignSelf: 'flex-start', marginTop: 8, color: '#047857', backgroundColor: '#ECFDF5', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, fontWeight: '700' }}>✓ {t({ en: 'Verified Guide', th: 'ไกด์ผ่านการตรวจสอบ', zh: '已验证导游' })}</Text> : null}
          <Text style={{ color: '#D97706', fontWeight: '700', marginTop: 10 }}>★ {shop.data.rating === null ? t({ en: 'Not rated yet', th: 'ยังไม่มีคะแนน', zh: '暂无评分' }) : shop.data.rating.toFixed(1)} · {shop.data.reviewCount} {t({ en: 'reviews', th: 'รีวิว', zh: '条评价' })}</Text>

          {shop.data.serviceType !== 'guide' ? <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: '#E1ECF0' }}>
            <View style={{ minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#E1ECF0' }}><Clock size={19} color="#123B64" /><Text style={{ flex: 1, color: '#123B64', fontWeight: '700' }}>{t({ en: 'Open status', th: 'สถานะเปิดบริการ', zh: '营业状态' })}</Text><View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: !offlineStamp && shopOpenNow(shop.data.openingHours) ? '#16A34A' : '#94A3B8' }} /><Text style={{ color: !offlineStamp && shopOpenNow(shop.data.openingHours) ? '#15803D' : '#64748B', fontWeight: '700' }}>{offlineStamp ? t({ en: 'Unavailable offline', th: 'ไม่ทราบขณะออฟไลน์', zh: '离线不可用' }) : shopOpenNow(shop.data.openingHours) ? t({ en: 'Open now', th: 'เปิดอยู่', zh: '营业中' }) : t({ en: 'Closed / unknown', th: 'ปิดอยู่/ไม่ระบุ', zh: '已打烊/不确定' })}</Text></View>
            <View style={{ minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#E1ECF0' }}><Clock size={19} color="#123B64" /><Text style={{ flex: 1, color: '#123B64', fontWeight: '700' }}>{t({ en: 'Opening hours', th: 'เวลาให้บริการ', zh: '营业时间' })}</Text><Text style={{ color: '#52748A' }}>{shop.data.openingHours || t({ en: 'Not provided', th: 'ยังไม่ระบุ', zh: '未填写' })}</Text></View>
            {shop.data.phone ? <Pressable onPress={() => void Linking.openURL(`tel:${shop.data!.phone}`)} style={{ minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: shop.data.email ? 1 : 0, borderBottomColor: '#E1ECF0' }}><Phone size={19} color="#123B64" /><Text style={{ flex: 1, color: '#123B64', fontWeight: '700' }}>{t({ en: 'Call', th: 'โทรติดต่อ', zh: '电话联系' })}</Text><Text style={{ color: blue }}>{shop.data.phone}</Text></Pressable> : null}
            {shop.data.email ? <Pressable onPress={() => void Linking.openURL(`mailto:${shop.data!.email}`)} style={{ minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Mail size={19} color="#123B64" /><Text style={{ flex: 1, color: '#123B64', fontWeight: '700' }}>{t({ en: 'Email', th: 'อีเมล', zh: '邮箱' })}</Text><Text numberOfLines={1} style={{ maxWidth: '58%', color: blue }}>{shop.data.email}</Text></Pressable> : null}
          </View> : null}
          {canManage ? <Pressable onPress={() => { if (canManage) onEdit(); }} style={[button, { marginTop: 14 }]}><Text style={{ color: '#fff' }}>{t(shop.data.serviceType === 'guide' ? { en: 'Edit guide profile', th: 'แก้ไขโปรไฟล์ไกด์', zh: '编辑导游资料' } : { en: 'Edit business', th: 'แก้ไขร้านค้า', zh: '编辑店铺' })}</Text></Pressable> : null}
        </View>
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
          <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}><MapPin size={18} color={blue} /><Text style={{ flex: 1, color: '#344F61' }}>{shop.data.address || t({ en: 'Address not provided', th: 'ยังไม่มีที่อยู่', zh: '未填写地址' })}{shop.data.lat !== null && shop.data.lng !== null ? ` (${shop.data.lat.toFixed(5)}, ${shop.data.lng.toFixed(5)})` : ''}</Text></View>
        </>}
        {shop.data.serviceType === 'guide' && shop.data.phone ? <Text style={{ marginTop: 8 }}>{t({ en: 'Phone', th: 'โทร', zh: '电话' })}: {shop.data.phone}</Text> : null}
        {shop.data.serviceType === 'guide' && shop.data.guideLineId ? <Text style={{ marginTop: 8 }}>LINE ID: {shop.data.guideLineId}</Text> : null}
        {shop.data.serviceType === 'guide' && shop.data.email ? <Text style={{ marginTop: 8 }}>{t({ en: 'Email', th: 'อีเมล', zh: '邮箱' })}: {shop.data.email}</Text> : null}
        {shop.data.serviceType !== 'guide' && shop.data.amenities.length ? <Text style={{ marginTop: 8 }}>{t({ en: 'Amenities', th: 'สิ่งอำนวยความสะดวก', zh: '设施' })}: {shop.data.amenities.join(', ')}</Text> : null}
        {/*
          NAVIGATION GOES TO THE APP'S OWN MAP.

          This button used to leave for Google Maps, which meant the one
          moment a traveller most needs this app - standing outside, trying
          to find a shop that is three sois away - was the moment it handed
          them to somebody else's. It now opens ChivarGo's own turn-by-turn,
          on the island's own map, with the roads and the Healthy Score pins
          already on it.

          THE HANDOFF IS KEPT, as a quiet link underneath. The island's
          router is a free community server and is allowed to say nothing
          (see packages/core/src/routing.ts); somebody who needs the road
          NOW should not have to go back three screens to find the map that
          has it. And where no navigator was passed in, the handoff IS the
          button, exactly as it was before.
        */}
        {shop.data.lat !== null && shop.data.lng !== null ? <View style={{ marginTop: 14 }}>
          <Pressable
            onPress={() => {
              const place = shop.data!;
              if (onNavigate) { onNavigate({ id: place.id, name: place.name, lat: place.lat!, lng: place.lng! }); return; }
              void Linking.openURL(mapsDirectionsUrl({ lat: place.lat!, lng: place.lng! }));
            }}
            accessibilityRole="button"
            accessibilityLabel={t({ en: 'Get directions', th: 'นำทาง', zh: '导航' })}
            style={[button, { flexDirection: 'row', justifyContent: 'center', gap: 6 }]}
          ><Navigation size={16} color="#fff" /><Text style={{ color: '#fff' }}>{t({ en: 'Get directions', th: 'นำทาง', zh: '导航' })}</Text></Pressable>
          {onNavigate ? <Pressable
            onPress={() => { void Linking.openURL(mapsDirectionsUrl({ lat: shop.data!.lat!, lng: shop.data!.lng! })); }}
            accessibilityRole="link"
            accessibilityLabel={t({ en: 'Open in Google Maps', th: 'เปิดใน Google Maps', zh: '在 Google 地图中打开' })}
            style={{ minHeight: 40, alignItems: 'center', justifyContent: 'center', marginTop: 6 }}
          ><Text style={{ color: blue, fontWeight: '700', fontSize: 12 }}>{t({ en: 'Open in Google Maps', th: 'เปิดใน Google Maps', zh: '在 Google 地图中打开' })}</Text></Pressable> : null}
        </View> : null}
      </View>
      {shop.data.images.length > 0 ? <View style={{ marginBottom: 14 }}><Text style={{ color: '#123B64', fontWeight: '800', fontSize: 17, marginBottom: 10 }}>{t({ en: 'Photos from this service', th: 'รูปภาพจากสถานบริการ', zh: '服务照片' })}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {shop.data.images.map((img) => <Image key={img.id} source={{ uri: shopImageUri(img.url) }} style={{ width: Math.min(width * 0.5, 210), height: 138, borderRadius: 16 }} />)}
      </ScrollView></View> : null}
      {guest ? <View style={[card, { backgroundColor: '#F1FAFD', borderWidth: 1, borderColor: '#CDEAF2' }]}>
        <Text style={{ fontWeight: '700', color: '#123B64', fontSize: 17 }}>{t({ en: 'Sign in to ', th: 'เข้าสู่ระบบเพื่อเขียน', zh: '登录以' }) + reviewLabel}</Text>
        <Text style={{ color: '#52748A', marginTop: 6 }}>{t({ en: 'Create an account or sign in to review and report inappropriate content.', th: 'สมัครสมาชิกหรือเข้าสู่ระบบเพื่อรีวิวและรายงานเนื้อหาที่ไม่เหมาะสม', zh: '注册或登录后即可发表评价并举报不当内容。' })}</Text>
        <ChivaButton label={reviewLabel} onPress={() => onSignIn?.()} style={{ marginTop: 12 }} />
      </View> : null}
      {!guest && !shop.data.owner ? <View style={card}>
        <Text style={{ fontWeight: '700', color: '#123B64', fontSize: 17 }}>{mine ? t({ en: 'Edit your review', th: 'แก้ไขรีวิวของคุณ', zh: '编辑我的评价' }) : reviewLabel}</Text>
        <Text style={{ color: '#52748A', fontSize: 13, marginTop: 4 }}>{t({ en: 'Tap a star to rate your experience', th: 'แตะดาวเพื่อให้คะแนนประสบการณ์ของคุณ', zh: '点击星星为体验评分' })}</Text>
        <View style={{ flexDirection: 'row', marginTop: 12, gap: 4 }}>{[1, 2, 3, 4, 5].map((n) => <Pressable key={n} disabled={busy} onPress={() => setRating(n)} accessibilityLabel={t({ en: `${n} stars`, th: `${n} ดาว`, zh: `${n} 星` })} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: n <= rating ? '#FFF7E6' : 'transparent' }}><Star size={30} color="#F59E0B" fill={n <= rating ? '#F59E0B' : 'transparent'} /></Pressable>)}</View>
        <View style={{ alignSelf: 'flex-start', backgroundColor: '#FFF7E6', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5, marginBottom: 14 }}><Text style={{ color: '#9A5B00', fontSize: 12, fontWeight: '700' }}>{rating}/5 · {ratingMeaning(rating)}</Text></View>
        <TextInput accessibilityLabel={t({ en: 'Share your experience', th: 'เล่าประสบการณ์', zh: '分享体验' })} editable={!busy} multiline value={body} onChangeText={setBody} placeholder={t({ en: 'Share your experience', th: 'เล่าประสบการณ์ของคุณ...', zh: '分享您的体验…' })} placeholderTextColor="#78909C" style={[field, { minHeight: 108, textAlignVertical: 'top', lineHeight: 21 }]} />
        {photo ? <View style={{ marginTop: 12, position: 'relative' }}><Image source={{ uri: photo.uri }} style={{ width: '100%', height: 180, borderRadius: 16 }} resizeMode="cover" /><Pressable accessibilityLabel={t({ en: 'Remove selected photo', th: 'ลบรูปที่เลือก', zh: '移除所选照片' })} onPress={() => setPhoto(null)} style={{ position: 'absolute', top: 8, right: 8, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(15,35,50,0.78)', alignItems: 'center', justifyContent: 'center' }}><X size={19} color="#fff" /></Pressable></View> : null}
        <Pressable disabled={busy} onPress={() => void pickPhoto()} style={{ minHeight: 46, marginVertical: 10, paddingHorizontal: 12, borderRadius: 13, borderWidth: 1, borderStyle: 'dashed', borderColor: '#7BC7DB', backgroundColor: '#F1FAFC', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}><Camera size={18} color={blue} /><Text style={{ color: blue, fontWeight: '700' }}>{photo ? t({ en: 'Change photo', th: 'เปลี่ยนรูป', zh: '更换照片' }) : t({ en: 'Add a review photo', th: 'แนบรูปรีวิว', zh: '添加评价照片' })}</Text></Pressable>
        <Pressable disabled={busy} onPress={() => void saveReview()} style={[button, busy && { opacity: 0.65 }]}>{busy ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><ActivityIndicator size="small" color="#fff" /><Text style={{ color: '#fff', fontWeight: '700' }}>{t({ en: 'Saving…', th: 'กำลังบันทึก...', zh: '保存中…' })}</Text></View> : <Text style={{ color: '#fff', fontWeight: '700' }}>{mine ? t({ en: 'Save review changes', th: 'บันทึกการแก้ไขรีวิว', zh: '保存评价修改' }) : t({ en: 'Submit review', th: 'ส่งรีวิว', zh: '提交评价' })}</Text>}</Pressable>
        {mine ? <Pressable disabled={busy} onPress={() => setConfirmDelete(true)} style={{ minHeight: 44, paddingHorizontal: 12, marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}><Trash2 size={16} color="#B91C1C" /><Text style={{ color: '#B91C1C', fontWeight: '600' }}>{t({ en: 'Delete my review', th: 'ลบรีวิวของฉัน', zh: '删除我的评价' })}</Text></Pressable> : null}
      </View> : null}
      <View style={card}>
        <Text style={{ fontWeight: '700', fontSize: 17, color: '#123B64' }}>{t({ en: 'Reviews', th: 'รีวิว', zh: '评价' })} ({shop.data.reviewCount})</Text>
        {loadingReviews && !reviews.length ? <ActivityIndicator color={blue} style={{ margin: 16 }} /> : null}
        {reviewsError ? <Pressable onPress={() => void loadReviews()}><Text style={{ color: '#B91C1C' }}>{reviewsError} · {t({ en: 'Try again', th: 'ลองใหม่', zh: '重试' })}</Text></Pressable> : null}
        {!loadingReviews && !reviewsError && !reviews.length ? <Text style={{ color: '#64748B', marginTop: 12 }}>{t({ en: 'No reviews yet.', th: 'ยังไม่มีรีวิว', zh: '暂无评价。' })}</Text> : null}
        {reviews.map((r) => <View key={r.id} style={{ borderTopWidth: 1, borderColor: '#E1ECF0', paddingVertical: 16, marginTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#DDF4FA', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#087B9E', fontWeight: '800', fontSize: 16 }}>{r.author.trim().charAt(0).toUpperCase() || '?'}</Text></View><View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: '#123B64' }}>{r.author}</Text><View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}><Text style={{ color: '#F59E0B', letterSpacing: 1 }}>{'★'.repeat(r.rating)}<Text style={{ color: '#CBD5E1' }}>{'★'.repeat(5 - r.rating)}</Text></Text><Text style={{ fontSize: 12, color: '#7A8F9C', marginLeft: 8 }}>{formatDate(r.createdAt)}</Text></View></View></View>
          <Text style={{ marginTop: 7, color: '#334155' }}>{r.body}</Text>
          {r.photoUrl ? <Image source={{ uri: shopImageUri(r.photoUrl) }} style={{ width: '100%', height: 190, borderRadius: 14, marginTop: 10 }} resizeMode="cover" /> : null}
          {r.ownerReply ? <View style={{ backgroundColor: '#EDF8FC', padding: 12, borderRadius: 14, marginTop: 10, borderLeftWidth: 3, borderLeftColor: '#48CAE4' }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><MessageCircle size={15} color={blue} /><Text style={{ color: blue, fontWeight: '700', fontSize: 12 }}>{t({ en: 'Business reply', th: 'คำตอบจากผู้ประกอบการ', zh: '商家回复' })}</Text></View><Text style={{ color: '#344F61', marginTop: 5 }}>{r.ownerReply}</Text></View> : null}
          {canManage ? <View style={{ marginTop: 8 }}><TextInput value={reply[r.id] ?? ''} onChangeText={(v) => setReply((prev) => ({ ...prev, [r.id]: v }))} placeholder={t({ en: 'Reply to review', th: 'ตอบกลับรีวิว', zh: '回复评价' })} style={field} /><Pressable disabled={busy || !reply[r.id]?.trim()} onPress={() => { if (canManage) void act(() => api.replyShopReview(shopId, r.id, reply[r.id]!)); }} style={{ padding: 8 }}><Text style={{ color: blue }}>{t({ en: 'Send reply', th: 'ส่งคำตอบ', zh: '发送回复' })}</Text></Pressable></View> : null}
          {!guest && !r.mine ? reporting === r.id ? <View style={{ marginTop: 12, padding: 12, backgroundColor: '#FFF9ED', borderRadius: 14, borderWidth: 1, borderColor: '#F7D99A' }}><View style={{ flexDirection: 'row', gap: 7, alignItems: 'center', marginBottom: 8 }}><Flag size={16} color="#9A5B00" /><Text style={{ color: '#704100', fontWeight: '700' }}>{t({ en: 'Tell us what is inappropriate', th: 'แจ้งเหตุผลที่รีวิวนี้ไม่เหมาะสม', zh: '请说明不当原因' })}</Text></View><TextInput accessibilityLabel={t({ en: 'Reason for report', th: 'เหตุผลที่รายงาน', zh: '举报原因' })} editable={!busy} value={reportReason} onChangeText={setReportReason} placeholder={t({ en: 'Reason for report', th: 'ระบุเหตุผลที่รายงาน', zh: '举报原因' })} style={field} /><View style={{ flexDirection: 'row', gap: 10, paddingTop: 10 }}><Pressable disabled={busy || reportReason.trim().length < 3} onPress={() => { void act(() => api.reportShopReview(shopId, r.id, reportReason), () => { setReporting(null); setReportReason(''); setMessageTone('success'); setMessage(t({ en: 'Report received. Thank you.', th: 'ระบบได้รับรายงานแล้ว ขอบคุณสำหรับข้อมูล', zh: '举报已收到，谢谢。' })); }); }} style={[button, { flex: 1, minHeight: 42 }, (busy || reportReason.trim().length < 3) && { opacity: 0.5 }]}><Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? t({ en: 'Sending…', th: 'กำลังส่ง…', zh: '正在发送…' }) : t({ en: 'Submit report', th: 'ส่งรายงาน', zh: '提交举报' })}</Text></Pressable><Pressable disabled={busy} onPress={() => setReporting(null)} style={{ minHeight: 42, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#526A79', fontWeight: '600' }}>{t({ en: 'Cancel', th: 'ยกเลิก', zh: '取消' })}</Text></Pressable></View></View> : <Pressable disabled={busy} onPress={() => setReporting(r.id)} style={{ minHeight: 40, paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}><Flag size={13} color="#64748B" /><Text style={{ color: '#64748B', fontSize: 12 }}>{t({ en: 'Report inappropriate review', th: 'รายงานรีวิวไม่เหมาะสม', zh: '举报不当评价' })}</Text></Pressable> : null}
        </View>)}
        {cursor ? <Pressable disabled={loadingReviews} onPress={() => void loadReviews(cursor)} style={{ padding: 10 }}><Text style={{ color: blue, textAlign: 'center' }}>{t({ en: 'Load more reviews', th: 'โหลดรีวิวเพิ่มเติม', zh: '加载更多评价' })}</Text></Pressable> : null}
      </View>
      {message ? <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderRadius: 14, marginBottom: 15, backgroundColor: messageTone === 'success' ? '#ECFDF5' : messageTone === 'warning' ? '#FFF8E7' : '#FEF2F2', borderWidth: 1, borderColor: messageTone === 'success' ? '#A7E8CB' : messageTone === 'warning' ? '#F6D68B' : '#FECACA' }}>{messageTone !== 'success' ? <AlertTriangle size={17} color={messageTone === 'warning' ? '#9A5B00' : '#B91C1C'} /> : null}<Text style={{ flex: 1, color: messageTone === 'success' ? '#047857' : messageTone === 'warning' ? '#8A5600' : '#B91C1C', fontWeight: '600' }}>{message}</Text></View> : null}
    </View> : null}
    <Modal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => { if (!busy) setConfirmDelete(false); }}><View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(3,24,44,0.62)' }}><View style={[card, { width: '100%', maxWidth: 380, alignSelf: 'center', alignItems: 'center', padding: 24 }]}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={26} color="#B91C1C" /></View><Text style={{ fontSize: 20, fontWeight: '800', color: '#123B64', marginTop: 14 }}>{t({ en: 'Delete your review?', th: 'ยืนยันลบรีวิวของคุณ?', zh: '删除您的评价？' })}</Text><Text style={{ color: '#64748B', textAlign: 'center', marginTop: 7 }}>{t({ en: 'This action cannot be undone.', th: 'เมื่อลบแล้วจะไม่สามารถกู้คืนรีวิวได้', zh: '此操作无法撤销。' })}</Text>
      <Pressable disabled={busy} style={[button, { marginTop: 20, alignSelf: 'stretch', backgroundColor: '#B91C1C' }]} onPress={() => void act(() => api.deleteShopReview(shopId), () => { setConfirmDelete(false); setBody(''); setPhoto(null); })}><Text style={{ color: '#fff', fontWeight: '700' }}>{t({ en: busy ? 'Deleting…' : 'Confirm delete', th: busy ? 'กำลังลบ…' : 'ยืนยันลบ', zh: busy ? '正在删除…' : '确认删除' })}</Text></Pressable>
      <Pressable disabled={busy} onPress={() => setConfirmDelete(false)} style={{ minHeight: 46, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#526A79', fontWeight: '600' }}>{t({ en: 'Cancel', th: 'ยกเลิก', zh: '取消' })}</Text></Pressable>
    </View></View></Modal>
  </ScrollView>;
}
