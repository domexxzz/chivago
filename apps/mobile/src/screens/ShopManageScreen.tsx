import React from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { AREAS, type AreaKey } from '@chivago/core';
import { ArrowLeft, Camera, MapPin, Plus, Store } from 'lucide-react-native';
import { api } from '../api/client.ts';
import { SHOP_CATEGORIES, shopImageUri, type Shop, type ShopInput } from '../api/shops.ts';
import { useAsync } from '../state/store.tsx';
import { useHere } from '../state/here.ts';

const blue = '#0077B6';
const blank = (areaKey: AreaKey = 'samui'): ShopInput => ({ name: '', category: '', areaKey, description: '', address: '', lat: Number.NaN,
  lng: Number.NaN, phone: '', email: '', openingHours: '', amenities: [], active: true });
const inputStyle = { borderWidth: 1, borderColor: '#CDE3EA', borderRadius: 12, backgroundColor: '#F7FBFC', padding: 11, fontSize: 15, color: '#123B64' } as const;
const button = { backgroundColor: blue, borderRadius: 16, paddingVertical: 13, alignItems: 'center' as const, marginTop: 12 };

export function ShopManageScreen({ initialShopId, onBack, onOpenShop }: { initialShopId?: string | null; onBack: () => void; onOpenShop: (id: string) => void }) {
  const mine = useAsync(() => api.shops({ owner: 'me' }), []);
  const [editing, setEditing] = React.useState<string | 'new' | null>(initialShopId ?? null);
  const [form, setForm] = React.useState<ShopInput>(blank());
  const [lat, setLat] = React.useState('');
  const [lng, setLng] = React.useState('');
  const [amenities, setAmenities] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  React.useEffect(() => setConfirmDelete(false), [editing]);
  const [message, setMessage] = React.useState<string | null>(null);
  const [images, setImages] = React.useState<{ id: string; kind: string; url: string }[]>([]);
  const here = useHere();
  React.useEffect(() => {
    if (!editing || editing === 'new') return;
    const shop = mine.data?.find((s) => s.id === editing);
    if (shop) { setForm(shop); setLat(String(shop.lat)); setLng(String(shop.lng)); setAmenities(shop.amenities.join(', ')); }
  }, [editing, mine.data]);
  const reloadImages = React.useCallback(async (id: string) => {
    const result = await api.shop(id);
    if (result.ok) setImages(result.data.images);
  }, []);
  React.useEffect(() => { if (editing && editing !== 'new') void reloadImages(editing); else setImages([]); }, [editing, reloadImages]);
  const update = (key: keyof ShopInput, value: unknown) => setForm((prev) => ({ ...prev, [key]: value }));
  const openNew = () => { const next = blank(); setForm(next); setLat(''); setLng(''); setAmenities(''); setMessage(null); setConfirmDelete(false); setEditing('new'); };
  const save = async () => {
    setBusy(true); setMessage(null);
    const data = { ...form, lat: lat.trim() ? Number(lat) : Number.NaN, lng: lng.trim() ? Number(lng) : Number.NaN, amenities: amenities.split(',').map((v) => v.trim()).filter(Boolean) };
    const result = editing === 'new' ? await api.createShop(data) : await api.updateShop(editing!, data);
    setBusy(false);
    if (!result.ok) { setMessage(result.error); return; }
    mine.reload(); setEditing(result.data.id); setMessage('บันทึกร้านค้าแล้ว');
    void reloadImages(result.data.id);
  };
  const uploadPhoto = async (kind: 'cover' | 'interior') => {
    if (!editing || editing === 'new') { setMessage('บันทึกร้านค้าก่อนเพิ่มรูป'); return; }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setMessage('กรุณาอนุญาตเข้าถึงรูปภาพ'); return; }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (picked.canceled || !picked.assets[0]) return;
    setBusy(true); setMessage(null);
    try {
      const result = await api.uploadShopImage(editing, kind, picked.assets[0].uri, picked.assets[0].mimeType ?? 'image/jpeg');
      setMessage(result.ok ? 'อัปโหลดรูปแล้ว' : result.error);
      if (result.ok) { mine.reload(); void reloadImages(editing); }
    } catch { setMessage('อัปโหลดรูปไม่สำเร็จ'); }
    setBusy(false);
  };
  const remove = async () => {
    if (!editing || editing === 'new') return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setBusy(true);
    const result = await api.deleteShop(editing);
    setBusy(false);
    if (!result.ok) { setMessage(result.error); return; }
    setEditing(null); setConfirmDelete(false); mine.reload();
  };
  const removeImage = async (imageId: string) => {
    if (!editing || editing === 'new') return;
    setBusy(true);
    const result = await api.deleteShopImage(editing, imageId);
    setBusy(false);
    if (result.ok) { mine.reload(); void reloadImages(editing); }
    else setMessage(result.error);
  };
  const selectArea = (areaKey: AreaKey) => { update('areaKey', areaKey); setLat(''); setLng(''); };
  const field = (label: string, key: keyof ShopInput, placeholder = '', multiline = false) => <View style={{ marginBottom: 12 }}><Text style={{ color: '#123B64', fontWeight: '700', marginBottom: 6 }}>{label}</Text><TextInput value={String(form[key] ?? '')} onChangeText={(v) => update(key, v)} placeholder={placeholder} multiline={multiline} style={[inputStyle, multiline && { minHeight: 85, textAlignVertical: 'top' }]} /></View>;

  return <ScrollView style={{ flex: 1, backgroundColor: '#EAF7FB' }} contentContainerStyle={{ paddingBottom: 80 }}>
    <View style={{ backgroundColor: '#007B9B', padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Pressable onPress={editing ? () => setEditing(null) : onBack} accessibilityLabel="กลับ"><ArrowLeft color="#fff" /></Pressable><Text style={{ color: '#fff', fontWeight: '700', fontSize: 19 }}>จัดการร้านค้าของฉัน</Text></View>
    <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center', padding: 16 }}>
      {!editing ? <>
        <Pressable onPress={openNew} style={[button, { flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 20 }]}><Plus color="#fff" size={18} /><Text style={{ color: '#fff', fontWeight: '700' }}>เพิ่มร้านค้า</Text></Pressable>
        {mine.loading && !mine.data ? <ActivityIndicator color={blue} /> : null}
        {mine.error ? <Pressable onPress={mine.reload}><Text style={{ color: '#B91C1C' }}>{mine.error} · ลองใหม่</Text></Pressable> : null}
        {!mine.loading && mine.data?.length === 0 ? <Text style={{ color: '#64748B' }}>ยังไม่มีร้านค้า เพิ่มร้านแรกของคุณได้เลย</Text> : null}
        {mine.data?.map((shop) => <View key={shop.id} style={{ backgroundColor: '#fff', borderRadius: 18, padding: 14, marginBottom: 12, flexDirection: 'row', gap: 12 }}>
          {shop.coverUrl ? <Image source={{ uri: shopImageUri(shop.coverUrl) }} style={{ width: 70, height: 70, borderRadius: 12 }} /> : <Store size={45} color={blue} />}
          <View style={{ flex: 1 }}><Text style={{ color: '#123B64', fontWeight: '700', fontSize: 16 }}>{shop.name}</Text><Text style={{ color: '#64748B' }}>{shop.category} · {shop.areaKey} · {shop.active ? 'แสดงบนแผนที่' : 'ซ่อนอยู่'}</Text><View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}><Pressable onPress={() => setEditing(shop.id)}><Text style={{ color: blue }}>แก้ไข</Text></Pressable><Pressable onPress={() => onOpenShop(shop.id)}><Text style={{ color: blue }}>ดูร้าน</Text></Pressable></View></View>
        </View>)}
      </> : editing !== 'new' && !mine.data?.some((shop) => shop.id === editing) ? <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18 }}><Text style={{ color: '#123B64' }}>{mine.loading ? 'กำลังโหลดร้านค้า...' : mine.error ?? 'ไม่พบร้านค้านี้ในบัญชีของคุณ'}</Text><Pressable onPress={mine.reload} style={{ paddingTop: 10 }}><Text style={{ color: blue }}>ลองใหม่</Text></Pressable></View> : <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: '#123B64', marginBottom: 16 }}>{editing === 'new' ? 'เพิ่มร้านค้า' : 'แก้ไขร้านค้า'}</Text>
        {field('ชื่อร้าน', 'name', 'ชื่อร้านค้าของคุณ')}
        <Text style={{ color: '#123B64', fontWeight: '700', marginBottom: 6 }}>ประเภทร้าน</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingBottom: 10 }}>
          {SHOP_CATEGORIES.map((category) => <Pressable key={category} onPress={() => update('category', category)} style={{ backgroundColor: form.category === category ? blue : '#E9F6FA', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 }}><Text style={{ color: form.category === category ? '#fff' : '#123B64' }}>{category}</Text></Pressable>)}
        </ScrollView>
        <Text style={{ color: '#123B64', fontWeight: '700' }}>พื้นที่</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingVertical: 10 }}>{AREAS.map((area) => <Pressable key={area.key} onPress={() => selectArea(area.key)} style={{ backgroundColor: form.areaKey === area.key ? blue : '#E9F6FA', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 }}><Text style={{ color: form.areaKey === area.key ? '#fff' : '#123B64' }}>{area.name.th}</Text></Pressable>)}</ScrollView>
        {field('รายละเอียดร้าน', 'description', 'อธิบายสินค้าและบริการ', true)}
        {field('ที่อยู่', 'address', 'บ้านเลขที่ ถนน ตำบล')}
        <Text style={{ color: '#123B64', fontWeight: '700', marginBottom: 6 }}>พิกัดร้านค้า</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}><TextInput value={lat} onChangeText={setLat} keyboardType="decimal-pad" placeholder="Latitude" style={[inputStyle, { flex: 1 }]} /><TextInput value={lng} onChangeText={setLng} keyboardType="decimal-pad" placeholder="Longitude" style={[inputStyle, { flex: 1 }]} /></View>
        <Pressable onPress={() => { if (here) { setLat(String(here.lat)); setLng(String(here.lng)); } else setMessage('ยังไม่ได้รับตำแหน่งจากอุปกรณ์'); }} style={{ flexDirection: 'row', gap: 5, paddingVertical: 12 }}><MapPin size={16} color={blue} /><Text style={{ color: blue }}>ใช้ตำแหน่งปัจจุบัน</Text></Pressable>
        {field('เบอร์ติดต่อ', 'phone')}{field('อีเมล', 'email')}{field('เวลาเปิด–ปิด', 'openingHours', '09:00-18:00')}
        <Text style={{ color: '#123B64', fontWeight: '700', marginBottom: 6 }}>สิ่งอำนวยความสะดวก (คั่นด้วยจุลภาค)</Text><TextInput value={amenities} onChangeText={setAmenities} style={inputStyle} placeholder="Wi-Fi, ที่จอดรถ" />
        <Pressable onPress={() => update('active', !form.active)} style={{ paddingVertical: 14 }}><Text style={{ color: blue }}>{form.active ? '☑ แสดงร้านบนแผนที่' : '□ ซ่อนร้านจากแผนที่'}</Text></Pressable>
        <Pressable onPress={() => void save()} disabled={busy} style={button}><Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? 'กำลังบันทึก...' : 'บันทึกร้านค้า'}</Text></Pressable>
        {editing !== 'new' ? <><View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}><Pressable onPress={() => void uploadPhoto('cover')} disabled={busy} style={{ flex: 1, padding: 12, backgroundColor: '#E9F6FA', borderRadius: 12, alignItems: 'center' }}><Camera size={18} color={blue} /><Text style={{ color: blue }}>รูปหน้าปก</Text></Pressable><Pressable onPress={() => void uploadPhoto('interior')} disabled={busy} style={{ flex: 1, padding: 12, backgroundColor: '#E9F6FA', borderRadius: 12, alignItems: 'center' }}><Camera size={18} color={blue} /><Text style={{ color: blue }}>รูปภายใน</Text></Pressable></View><ScrollView horizontal contentContainerStyle={{ gap: 8, marginTop: 10 }}>{images.map((img) => <View key={img.id}><Image source={{ uri: shopImageUri(img.url) }} style={{ width: 110, height: 88, borderRadius: 10 }} /><Pressable onPress={() => void removeImage(img.id)}><Text style={{ color: '#B91C1C', textAlign: 'center' }}>ลบ {img.kind === 'cover' ? 'หน้าปก' : 'รูป'}</Text></Pressable></View>)}</ScrollView><Pressable onPress={() => void remove()} disabled={busy} style={{ padding: 14 }}><Text style={{ color: '#B91C1C', textAlign: 'center' }}>{confirmDelete ? 'ยืนยันลบร้านค้าและรีวิวทั้งหมด' : 'ลบร้านค้านี้'}</Text></Pressable></> : null}
        {message ? <Text style={{ color: message.includes('แล้ว') ? '#15803D' : '#B91C1C', marginTop: 8 }}>{message}</Text> : null}
      </View>}
    </View>
  </ScrollView>;
}
