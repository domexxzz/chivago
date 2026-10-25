import React from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Camera, MapPin, Navigation, Star, Store } from 'lucide-react-native';
import { api } from '../api/client.ts';
import { shopImageUri, shopOpenNow, type ShopReview } from '../api/shops.ts';
import { useAsync } from '../state/store.tsx';

const blue = '#0077B6';
const card = { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 14 } as const;
const field = { borderWidth: 1, borderColor: '#CDE3EA', backgroundColor: '#F5FAFC', borderRadius: 12, padding: 11, color: '#123B64', fontSize: 15 } as const;
const button = { backgroundColor: blue, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 16, alignItems: 'center' as const };

export function ShopProfileScreen({ shopId, onBack, onEdit }: { shopId: string; onBack: () => void; onEdit: () => void }) {
  const shop = useAsync(() => api.shop(shopId), [shopId]);
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
      <Pressable onPress={onBack} accessibilityLabel="กลับ"><ArrowLeft color="#fff" /></Pressable>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 19 }}>โปรไฟล์ร้านค้า</Text>
    </View>
    {shop.loading && !shop.data ? <ActivityIndicator style={{ margin: 32 }} color={blue} /> : null}
    {shop.error && !shop.data ? <View style={card}><Text>{shop.error}</Text><Pressable onPress={shop.reload}><Text style={{ color: blue }}>ลองใหม่</Text></Pressable></View> : null}
    {shop.data ? <View style={{ width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16 }}>
      <View style={card}>
        {shop.data.coverUrl ? <Image source={{ uri: shopImageUri(shop.data.coverUrl) }} style={{ height: 210, borderRadius: 16, marginBottom: 12 }} resizeMode="cover" />
          : <View style={{ height: 150, backgroundColor: '#DDF4FA', borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}><Store size={54} color={blue} /></View>}
        <Text style={{ color: '#123B64', fontWeight: '800', fontSize: 24, marginTop: 10 }}>{shop.data.name}</Text>
        <Text style={{ color: '#52748A', marginTop: 2 }}>{shop.data.category} · {shop.data.areaKey}</Text>
        <Text style={{ color: '#D97706', fontWeight: '700', marginTop: 8 }}>★ {shop.data.rating === null ? 'ยังไม่มีคะแนน' : shop.data.rating.toFixed(1)} · {shop.data.reviewCount} รีวิว</Text>
        {shop.data.owner ? <Pressable onPress={onEdit} style={[button, { marginTop: 12 }]}><Text style={{ color: '#fff' }}>แก้ไขร้านค้า</Text></Pressable> : null}
      </View>
      <View style={card}>
        <Text style={{ color: '#123B64', fontWeight: '700', fontSize: 16 }}>ข้อมูลร้านค้า</Text>
        <Text style={{ marginTop: 10, color: '#344F61' }}>{shop.data.description || 'ยังไม่มีคำอธิบาย'}</Text>
        <Text style={{ marginTop: 10 }}>📍 {shop.data.address || 'ยังไม่มีที่อยู่'} ({shop.data.lat.toFixed(5)}, {shop.data.lng.toFixed(5)})</Text>
        <Text style={{ marginTop: 8 }}>🕒 {shop.data.openingHours || 'ยังไม่ระบุเวลา'} · {shopOpenNow(shop.data.openingHours) ? 'เปิดอยู่' : 'ปิดอยู่/ไม่ระบุ'}</Text>
        {shop.data.phone ? <Text style={{ marginTop: 8 }}>โทร: {shop.data.phone}</Text> : null}
        {shop.data.email ? <Text style={{ marginTop: 8 }}>อีเมล: {shop.data.email}</Text> : null}
        {shop.data.amenities.length ? <Text style={{ marginTop: 8 }}>สิ่งอำนวยความสะดวก: {shop.data.amenities.join(', ')}</Text> : null}
        <Pressable onPress={() => void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${shop.data!.lat},${shop.data!.lng}`)} style={[button, { marginTop: 14, flexDirection: 'row', justifyContent: 'center', gap: 6 }]}><Navigation size={16} color="#fff" /><Text style={{ color: '#fff' }}>นำทาง</Text></Pressable>
      </View>
      {shop.data.images.length > 0 ? <ScrollView horizontal style={{ marginBottom: 14 }} contentContainerStyle={{ gap: 8 }}>
        {shop.data.images.map((img) => <Image key={img.id} source={{ uri: shopImageUri(img.url) }} style={{ width: Math.min(width * 0.55, 220), height: 145, borderRadius: 14 }} />)}
      </ScrollView> : null}
      {!shop.data.owner ? <View style={card}>
        <Text style={{ fontWeight: '700', color: '#123B64', fontSize: 17 }}>{mine ? 'แก้ไขรีวิวของคุณ' : 'เขียนรีวิว'}</Text>
        <View style={{ flexDirection: 'row', marginVertical: 10 }}>{[1, 2, 3, 4, 5].map((n) => <Pressable key={n} onPress={() => setRating(n)} accessibilityLabel={`${n} ดาว`} style={{ paddingRight: 8 }}><Star size={30} color="#F59E0B" fill={n <= rating ? '#F59E0B' : 'transparent'} /></Pressable>)}</View>
        <TextInput multiline value={body} onChangeText={setBody} placeholder="เล่าประสบการณ์ที่ร้านนี้" style={[field, { minHeight: 85, textAlignVertical: 'top' }]} />
        <Pressable onPress={() => void pickPhoto()} style={{ paddingVertical: 10, flexDirection: 'row', gap: 6 }}><Camera size={17} color={blue} /><Text style={{ color: blue }}>{photo ? 'เลือกรูปแล้ว (แตะเพื่อเปลี่ยน)' : 'แนบรูปรีวิว'}</Text></Pressable>
        <Pressable disabled={busy} onPress={() => void saveReview()} style={button}><Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? 'กำลังบันทึก...' : mine ? 'บันทึกการแก้ไขรีวิว' : 'ส่งรีวิว'}</Text></Pressable>
        {mine ? <Pressable disabled={busy} onPress={() => void act(() => api.deleteShopReview(shopId))} style={{ padding: 10 }}><Text style={{ color: '#B91C1C', textAlign: 'center' }}>ลบรีวิวของฉัน</Text></Pressable> : null}
      </View> : null}
      <View style={card}>
        <Text style={{ fontWeight: '700', fontSize: 17, color: '#123B64' }}>รีวิว ({shop.data.reviewCount})</Text>
        {loadingReviews && !reviews.length ? <ActivityIndicator color={blue} style={{ margin: 16 }} /> : null}
        {reviewsError ? <Pressable onPress={() => void loadReviews()}><Text style={{ color: '#B91C1C' }}>{reviewsError} · ลองใหม่</Text></Pressable> : null}
        {!loadingReviews && !reviewsError && !reviews.length ? <Text style={{ color: '#64748B', marginTop: 12 }}>ยังไม่มีรีวิว</Text> : null}
        {reviews.map((r) => <View key={r.id} style={{ borderTopWidth: 1, borderColor: '#E1ECF0', paddingVertical: 12, marginTop: 8 }}>
          <Text style={{ fontWeight: '700', color: '#123B64' }}>{r.author} · {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</Text>
          <Text style={{ fontSize: 12, color: '#64748B' }}>{new Date(r.createdAt).toLocaleDateString('th-TH')}</Text>
          <Text style={{ marginTop: 7, color: '#334155' }}>{r.body}</Text>
          {r.photoUrl ? <Image source={{ uri: shopImageUri(r.photoUrl) }} style={{ width: 150, height: 120, borderRadius: 12, marginTop: 8 }} /> : null}
          {r.ownerReply ? <Text style={{ backgroundColor: '#EAF7FB', padding: 10, borderRadius: 10, marginTop: 8 }}>ร้านค้าตอบ: {r.ownerReply}</Text> : null}
          {shop.data?.owner ? <View style={{ marginTop: 8 }}><TextInput value={reply[r.id] ?? ''} onChangeText={(v) => setReply((prev) => ({ ...prev, [r.id]: v }))} placeholder="ตอบกลับรีวิว" style={field} /><Pressable disabled={busy || !reply[r.id]?.trim()} onPress={() => void act(() => api.replyShopReview(shopId, r.id, reply[r.id]!))} style={{ padding: 8 }}><Text style={{ color: blue }}>ส่งคำตอบ</Text></Pressable></View> : null}
          {!r.mine ? reporting === r.id ? <View style={{ marginTop: 10 }}><TextInput value={reportReason} onChangeText={setReportReason} placeholder="ระบุเหตุผลที่รายงาน" style={field} /><View style={{ flexDirection: 'row', gap: 16, paddingTop: 8 }}><Pressable disabled={busy || reportReason.trim().length < 3} onPress={() => { void act(() => api.reportShopReview(shopId, r.id, reportReason)); setReporting(null); setReportReason(''); }}><Text style={{ color: blue }}>ส่งรายงาน</Text></Pressable><Pressable onPress={() => setReporting(null)}><Text>ยกเลิก</Text></Pressable></View></View> : <Pressable disabled={busy} onPress={() => setReporting(r.id)} style={{ paddingTop: 10 }}><Text style={{ color: '#64748B', fontSize: 12 }}>รายงานรีวิวไม่เหมาะสม</Text></Pressable> : null}
        </View>)}
        {cursor ? <Pressable disabled={loadingReviews} onPress={() => void loadReviews(cursor)} style={{ padding: 10 }}><Text style={{ color: blue, textAlign: 'center' }}>โหลดรีวิวเพิ่มเติม</Text></Pressable> : null}
      </View>
      {message ? <Text style={{ color: '#B91C1C', marginBottom: 15 }}>{message}</Text> : null}
    </View> : null}
  </ScrollView>;
}
